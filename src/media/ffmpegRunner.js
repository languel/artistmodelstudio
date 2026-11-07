/**
 * ffmpeg in the browser (ffmpeg.wasm, the single-thread core: no cross-origin isolation needed, so it works on the
 * Pages build, in embeds and in the dev server alike). Loaded on first use (the core is about 30 MB, kept by the
 * browser afterwards); nothing leaves the machine. One job at a time.
 *
 * cutMedia({ url | blob, start, end, format: 'mp4' | 'webm' | 'gif', … }) → { blob, name, type }
 * The cut is frame-accurate (it re-encodes), carries the title and credit as metadata, and reads a file of up to
 * MAX_BYTES (a long film must be streamed at 240p, or cut from a clip already made).
 */
export const MAX_BYTES = 250 * 1024 * 1024;
export const FORMATS = {
  mp4: { ext: 'mp4', type: 'video/mp4', label: 'MP4 (H.264)' },
  webm: { ext: 'webm', type: 'video/webm', label: 'WebM (VP8)' },
  gif: { ext: 'gif', type: 'image/gif', label: 'GIF (no sound)' }
};

let ff = null, loading = null, queue = Promise.resolve();
/** Drop the ffmpeg instance (after a crash in its wasm): the next job loads a fresh one. */
export function resetFfmpeg() { try { ff?.terminate?.(); } catch { /* already gone */ } ff = null; }
export const loadFfmpeg = load;   // (for tests and tools)

async function load(onStatus) {
  if (ff) return ff;
  if (loading) return loading;
  loading = (async () => {
    onStatus?.('Loading ffmpeg (first time only)…');
    const [{ FFmpeg }, core, wasm] = await Promise.all([
      import('@ffmpeg/ffmpeg'),
      import('../../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.js?url'),
      import('../../node_modules/@ffmpeg/core/dist/esm/ffmpeg-core.wasm?url')
    ]);
    const f = new FFmpeg();
    await f.load({ coreURL: core.default, wasmURL: wasm.default });
    ff = f;
    return f;
  })();
  try { return await loading; } finally { loading = null; }
}

/** Fetch the source (a URL, a blob: URL or a Blob) as bytes, refusing what is too large for memory. */
async function bytesOf({ url, blob }, onStatus) {
  if (blob) { if (blob.size > MAX_BYTES) throw new Error('That file is too large to cut in the browser'); return new Uint8Array(await blob.arrayBuffer()); }
  onStatus?.('Reading the source…');
  const r = await fetch(url);
  if (!r.ok) throw new Error(`The source answered ${r.status}`);
  const len = Number(r.headers.get('content-length')) || 0;
  if (len > MAX_BYTES) throw new Error(`The source is ${(len / 1048576).toFixed(0)} MB: too large to cut here. Stream it at 240p, or cut a shorter clip first`);
  const buf = new Uint8Array(await r.arrayBuffer());
  if (buf.length > MAX_BYTES) throw new Error('The source is too large to cut here');
  return buf;
}

const args = (format, { start, dur, title, comment, width }) => {
  const meta = [...(title ? ['-metadata', `title=${title}`] : []), ...(comment ? ['-metadata', `comment=${comment}`] : [])];
  const cut = ['-ss', String(Math.max(0, start)), '-i', 'in', '-t', String(dur)];
  const w = width ? `scale='min(${width},iw)':-2` : null;   // -2: keeps the height even
  if (format === 'gif') return [...cut, '-an', '-vf', `fps=15,${w || "scale='min(480,iw)':-1"}:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse`, '-loop', '0', ...meta, 'out.gif'];
  if (format === 'webm') return [...cut, ...(w ? ['-vf', w] : []), '-c:v', 'libvpx', '-b:v', '2M', '-crf', '10', '-deadline', 'realtime', '-cpu-used', '8', '-an', ...meta, 'out.webm'];
  return [...cut, '-vf', w ? `${w},format=yuv420p` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '23', '-c:a', 'aac', '-movflags', '+faststart', ...meta, 'out.mp4'];
};

/** Cut [start, end] seconds of a source into a file. `onStatus(text)` and `onProgress(0..1)` report; the job may be aborted by throwing from them. */
export function cutMedia({ url = null, blob = null, start = 0, end, format = 'mp4', title = '', credit = '', width = null, onStatus = null, onProgress = null }) {
  const spec = FORMATS[format];
  if (!spec) return Promise.reject(new Error(`Unknown format ${format}`));
  if (!(end > start)) return Promise.reject(new Error('The out point must come after the in point'));
  const run = async () => {
    const f = await load(onStatus);
    const input = await bytesOf({ url, blob }, onStatus);
    const ext = (blob?.type || url || '').split(/[?#]/)[0].split('.').pop().replace(/[^a-z0-9]/gi, '').slice(0, 5);
    const name = `in`;
    await f.writeFile(name, input);
    const onProg = ({ progress }) => onProgress?.(Math.max(0, Math.min(1, progress)));
    f.on('progress', onProg);
    onStatus?.('Cutting…');
    let log = '';
    const onLog = ({ message }) => { log = (log + '\n' + message).slice(-1500); };
    f.on('log', onLog);
    try {
      const code = await f.exec(args(format, { start, dur: end - start, title, comment: credit, width }));
      if (code !== 0) throw new Error(`ffmpeg could not cut this (${ext || 'unknown'} source): ${log.split('\n').filter(Boolean).slice(-2).join(' ')}`);
      const data = await f.readFile(`out.${spec.ext}`);
      return { blob: new Blob([data.buffer || data], { type: spec.type }), type: spec.type, name: `out.${spec.ext}` };
    } finally {
      f.off('progress', onProg); f.off('log', onLog);
      for (const n of [name, `out.${spec.ext}`]) { try { await f.deleteFile(n); } catch { /* not there */ } }
    }
  };
  const job = queue.then(run, run);
  queue = job.catch(() => {});
  return job;
}


/**
 * Encode rendered frames (JPEG bytes, in order) into a video: `const enc = await startEncoder({ fps, format })`,
 * `await enc.add(bytes)` for each frame, then `await enc.finish(onProgress)` → { blob, type, name }. `enc.cancel()` drops the frames.
 * Frames are kept in ffmpeg's memory until finish (a few hundred at 720p are fine).
 */
export async function startEncoder({ fps = 25, format = 'mp4', onStatus = null } = {}) {
  const spec = FORMATS[format];
  if (!spec || format === 'gif') throw new Error(`Cannot render to ${format}`);
  const f = await load(onStatus);
  let n = 0, audio = false;
  const name = i => `r${String(i).padStart(6, '0')}.jpg`;
  const clean = async () => { for (let i = 0; i < n; i++) { try { await f.deleteFile(name(i)); } catch { /* gone */ } } try { await f.deleteFile(`render.${spec.ext}`); } catch { /* not made */ } try { await f.deleteFile('audio.wav'); } catch { /* none */ } n = 0; audio = false; };
  return {
    async add(bytes) { await f.writeFile(name(n++), bytes); },
    /** The sound track (WAV bytes) to mux in. */
    async setAudio(bytes) { await f.writeFile('audio.wav', bytes); audio = true; },
    get count() { return n; },
    async cancel() { await clean(); },
    async finish(onProgress = null) {
      const frames = n; let noSound = false;
      const run = async () => {
        const onProg = ({ progress }) => onProgress?.(Math.max(0, Math.min(1, progress)));
        f.on('progress', onProg);
        let log = ''; const onLog = ({ message }) => { log = (log + '\n' + message).slice(-1500); }; f.on('log', onLog);
        try {
          const vf = 'scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p';
          const codec = format === 'webm' ? ['-c:v', 'libvpx', '-b:v', '4M', '-crf', '8', '-deadline', 'realtime', '-cpu-used', '8'] : ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '20', '-movflags', '+faststart'];
          const video = ['-framerate', String(fps), '-i', 'r%06d.jpg'];
          const sound = format === 'webm' ? ['-c:a', 'libvorbis', '-q:a', '4'] :   /* (libopus crashes this wasm build) */ ['-c:a', 'aac', '-b:a', '160k'];
          let code = await f.exec([...video, ...(audio ? ['-i', 'audio.wav'] : []), '-vf', vf, ...codec, ...(audio ? [...sound, '-shortest'] : []), `render.${spec.ext}`]);
          if (code !== 0 && audio) { log += '\n(the sound could not be encoded: the film has none)'; code = await f.exec([...video, '-vf', vf, ...codec, `render.${spec.ext}`]); noSound = true; }
          if (code !== 0) throw new Error(`ffmpeg could not encode the frames: ${log.split('\n').filter(Boolean).slice(-2).join(' ')}`);
          const data = await f.readFile(`render.${spec.ext}`);
          return { blob: new Blob([data.buffer || data], { type: spec.type }), type: spec.type, name: `render.${spec.ext}`, frames, sound: audio && !noSound };
        } catch (err) { if (/memory access|out of bounds|abort/i.test(String(err?.message || err))) { resetFfmpeg(); throw new Error('The encoder crashed; it will start again next time. Try again, or render without sound'); } throw err;
        } finally { try { f.off('progress', onProg); f.off('log', onLog); await clean(); } catch { /* the instance is gone */ } }
      };
      const job = queue.then(run, run); queue = job.catch(() => {}); return job;
    }
  };
}
