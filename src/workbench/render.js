/**
 * Render (docs/camera-plan.md §5): the playhead is the clock. For every frame of the film, set the time, apply the
 * keyframe lanes, put the videos on their exact frames, advance each sketch to that time, draw what the Program shows
 * (the cameras, the media, the captions) and keep the picture; then encode them with ffmpeg in the browser.
 * The same scene renders the same film: sketches run from a fixed seed on the render's clock, in steps of 1/60 s.
 *
 * Sound: the audio clips (sounds, narration) and media clips whose Volume is raised are mixed offline (renderAudio.js). Limits: a video playing under a board is held to the
 * render clock (looping over its in and out), a GIF or picture sequence is not stepped; time-driven marks follow the real
 * clock; a sketch's clock leads the render by its first few frames.
 */
import { boardsOf } from '../process/boards.js';
import { flatClips, duration } from '../process/take.js';
import { startEncoder } from '../media/ffmpegRunner.js';
import { mixTake, encodeWav } from './renderAudio.js';

const settle = (v, ms = 2500) => new Promise(ok => {
  if (!v || (!v.seeking && v.readyState >= 2)) return ok();
  const done = () => { v.removeEventListener('seeked', done); v.removeEventListener('loadeddata', done); clearTimeout(t); ok(); };
  const t = setTimeout(done, ms);
  v.addEventListener('seeked', done); v.addEventListener('loadeddata', done);
});

/** Hold every video source under a board to the render clock: its in point plus the time, looping over its range. */
async function seekSources(app, ms) {
  for (const e of app.sources.entries.values()) {
    const v = e.live?.video; if (!v || !v.duration || e.def?.kind === 'timeline') continue;
    v.pause?.();
    const a = (e.def?.in ?? 0) * v.duration, b = (e.def?.out ?? 1) * v.duration, span = Math.max(0.04, b - a);
    const want = a + ((ms / 1000) % span);
    if (Math.abs(v.currentTime - want) > 0.01) { v.currentTime = want; await settle(v); }
    const L = e.live; if (L.ctx && L.canvas && v.videoWidth) { try { L.ctx.drawImage(v, 0, 0, L.canvas.width, L.canvas.height); L.version++; } catch { /* not readable */ } }
  }
}

/**
 * Render the open take. opts: { range: [t0, t1] ms, fps, width, height, format: 'mp4' | 'webm', onProgress({ frame, frames, ms }), signal }.
 * Resolves { blob, type, name, frames }. Rejects with an AbortError if the signal fires (nothing is kept).
 */
export async function renderTake(app, { range = null, fps = 25, width = 1280, height = 720, format = 'mp4', sound = true, onProgress = null, onStatus = null, signal = null } = {}) {
  const player = app.player, take = player.take;
  if (!take) throw new Error('There is no take to render: put something on the Timeline first');
  const t0 = range?.[0] ?? 0, t1 = range?.[1] ?? duration(take);
  if (!(t1 > t0)) throw new Error('Nothing to render: the range is empty');
  const frames = Math.max(1, Math.round((t1 - t0) / 1000 * fps)), keepT = player.t, wasPlaying = player.playing;
  player.pause();
  const cv = document.createElement('canvas'); cv.width = Math.round(width); cv.height = Math.round(height);
  const ctx = cv.getContext('2d');
  const sketchIds = boardsOf(app.store.doc).filter(b => (b.kind === 'p5' || b.kind === 'three') && !b.hidden).map(b => b.id);
  // Videos under boards are held to the render clock; remember how they were to give them back.
  const heldSources = [...app.sources.entries.values()].filter(e => e.live?.video).map(e => ({ e, speed: e.def?.speed }));
  for (const h of heldSources) app.sources.update?.(h.e.def.name, { speed: 0 });
  let enc = null, ok = false;
  try {
    onStatus?.('Loading the stop-motion frames…');
    for (const b of boardsOf(app.store.doc)) {
      if (b.kind !== 'stopmotion' || !app.stopmotion) continue;
      const { sm } = app.stopmotion.spec(b);
      for (const fr of sm?.frames || []) await app.stopmotion.image(b.id, fr);
    }
    onStatus?.('Starting the sketches…');
    await app.frames.beginRender(sketchIds);
    onStatus?.('Loading the encoder…');
    enc = await startEncoder({ fps, format, onStatus });
    onStatus?.('Rendering…');
    const t0wall = performance.now();
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) throw new DOMException('Render cancelled', 'AbortError');
      const t = t0 + i * 1000 / fps, rel = i * 1000 / fps;
      player.t = t; player.applied = null; player.applyAutomation();
      await seekSources(app, rel);
      player.syncMedia(flatClips(take)); await Promise.all([...(player.videos?.values() || [])].map(v => settle(v)));
      await Promise.all(sketchIds.map(id => app.frames.advance(id, rel)));
      player.drawProgram(ctx, cv.width, cv.height);
      const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.92));
      await enc.add(new Uint8Array(await blob.arrayBuffer()));
      const done = i + 1, elapsed = performance.now() - t0wall;
      onProgress?.({ frame: done, frames, ms: elapsed, left: elapsed / done * (frames - done) });
    }
    if (sound) {
      onStatus?.('Mixing the sound…');
      try { const mix = await mixTake(app, take, [t0, t1], { onStatus }); if (mix) await enc.setAudio(encodeWav(mix.channels, mix.sampleRate)); }
      catch (err) { onStatus?.(`No sound: ${err.message}`); }
    }
    onStatus?.('Encoding…');
    const out = await enc.finish(p => onProgress?.({ frame: frames, frames, encode: p }));
    ok = true;
    return out;
  } finally {
    if (!ok) await enc?.cancel?.();
    app.frames.endRender();
    for (const h of heldSources) app.sources.update?.(h.e.def.name, { speed: h.speed ?? 1 });
    player.t = keepT; player.applied = null; player.render(); player.emit();
    if (wasPlaying) player.play();
  }
}

/** The render dialog: range, size, frame rate, format; progress and cancel. Saves the film in Assets (Renders) and downloads it. */
export function openRenderDialog(app) {
  const take = app.player.take;
  if (!take) { app.log('Nothing to render: put something on the Timeline first.', 'error'); return; }
  const settings = app.player.settings, io = app.player.inOut, lp = app.player.loopRange;
  const el = (tag, attrs = {}, ...kids) => { const n = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else n.setAttribute(k, v); } n.append(...kids.filter(Boolean)); return n; };
  const sel = (opts, value) => { const s = el('select', { class: 'wb-select' }); for (const [v, l] of opts) { const o = el('option', { value: v, text: l }); if (v === value) o.selected = true; s.append(o); } return s; };
  const total = duration(take);
  const rangeSel = sel([['all', `The whole take (${(total / 1000).toFixed(1)} s)`], ...(io ? [['io', `In to Out (${((io[1] - io[0]) / 1000).toFixed(1)} s)`]] : []), ...(lp ? [['loop', `The loop region (${((lp[1] - lp[0]) / 1000).toFixed(1)} s)`]] : [])], 'all');
  const sizeSel = sel([['1280x720', '1280 × 720'], ['1920x1080', '1920 × 1080'], ['960x540', '960 × 540'], ['640x360', '640 × 360 (a quick look)']], '1280x720');
  const fpsIn = el('input', { type: 'number', class: 'wb-num', min: 1, max: 60, value: String(settings?.fps || 25) });
  const fmtSel = sel([['mp4', 'MP4 (H.264)'], ['webm', 'WebM (VP8)']], 'mp4');
  const soundChk = el('input', { type: 'checkbox' }); soundChk.checked = true;
  const status = el('div', { class: 'wb-muted wb-small', text: 'Sound: audio clips, narration and media clips with their Volume raised.' });
  const bar = el('div', { style: 'height:6px;background:var(--wb-panel-2,#2a2a2a);border-radius:3px;overflow:hidden;margin-top:6px;display:none' }, el('div', { style: 'height:100%;width:0;background:var(--wb-accent-2,#c8664f)' }));
  const go = el('button', { class: 'wb-btn', text: 'Render' }), cancel = el('button', { class: 'wb-btn', text: 'Close' });
  const row = (label, input) => el('div', { class: 'wb-row', style: 'display:flex;gap:10px;align-items:center;margin:6px 0' }, el('span', { style: 'width:70px;color:var(--wb-muted)', text: label }), input);
  const box = el('div', { style: 'position:fixed;left:50%;top:18%;transform:translateX(-50%);z-index:9999;min-width:340px;background:var(--wb-panel,#222);color:var(--wb-text,#ddd);border:1px solid var(--wb-line,#444);border-radius:8px;padding:14px 16px;box-shadow:0 12px 40px rgba(0,0,0,.5)' },
    el('div', { style: 'font-weight:600;margin-bottom:6px', text: 'Render the take as a video' }),
    row('Range', rangeSel), row('Size', sizeSel), row('Frame rate', fpsIn), row('Format', fmtSel), row('Sound', soundChk), status, bar,
    el('div', { style: 'display:flex;gap:8px;justify-content:flex-end;margin-top:10px' }, cancel, go));
  document.body.append(box);
  let ctl = null;
  const close = () => { ctl?.abort(); box.remove(); };
  cancel.addEventListener('click', close);
  go.addEventListener('click', async () => {
    if (ctl) { ctl.abort(); return; }
    ctl = new AbortController();
    const [w, h] = sizeSel.value.split('x').map(Number), r = rangeSel.value;
    const range = r === 'io' ? io : r === 'loop' ? lp : [0, total];
    go.textContent = 'Stop'; bar.style.display = 'block'; for (const c of [rangeSel, sizeSel, fpsIn, fmtSel]) c.disabled = true;
    const fill = bar.firstChild;
    try {
      const out = await renderTake(app, {
        range, fps: Math.max(1, Math.min(60, Number(fpsIn.value) || 25)), width: w, height: h, format: fmtSel.value, sound: soundChk.checked, signal: ctl.signal,
        onStatus: t => { status.textContent = t; },
        onProgress: p => { if (p.encode != null) { status.textContent = `Encoding… ${Math.round(p.encode * 100)}%`; fill.style.width = `${50 + p.encode * 50}%`; } else { fill.style.width = `${(p.frame / p.frames) * 50}%`; status.textContent = `Frame ${p.frame} of ${p.frames} · about ${Math.ceil(p.left / 1000)} s left`; } }
      });
      const name = `${String(take.title || 'Render').replace(/[\\/:*?"<>|]+/g, '-').slice(0, 60) || 'Render'}.${out.name.split('.').pop()}`;
      const { download } = await import('./ui.js');
      download(out.blob, name, out.type);
      try { await app.assetStore.add(out.blob, { title: `${take.title || 'Render'} (render)`, kind: 'video', folder: 'Renders', tags: ['render'], meta: { file: name, type: out.type, frames: out.frames } }); } catch { /* the file was still saved */ }
      status.textContent = `Done: ${name} (${(out.blob.size / 1048576).toFixed(1)} MB, ${out.frames} frames${out.sound ? ', with sound' : ''}). Also in Assets › Renders.`;
      fill.style.width = '100%';
    } catch (err) {
      status.textContent = err.name === 'AbortError' ? 'Stopped. Nothing was kept.' : `Render failed: ${err.message}`;
      app.log(`Render: ${err.message}`, err.name === 'AbortError' ? undefined : 'error');
    } finally {
      ctl = null; go.textContent = 'Render'; for (const c of [rangeSel, sizeSel, fpsIn, fmtSel]) c.disabled = false;
    }
  });
}
