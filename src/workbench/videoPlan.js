/**
 * What the renderer (scripts/render-video.mjs) needs to know to turn a captured page into a movie, kept apart from it so it can be tested:
 * the frames as a list ffmpeg reads, where each narration clip starts, and the subtitles. All times are on one clock: seconds since the
 * first captured frame (or, for the page's own clock, milliseconds since the epoch).
 */

/** ffconcat text: each captured frame is shown until the next one, and the last until `endT`. frames: [{ file, t }] in seconds. */
export function concatList(frames, endT) {
  if (!frames.length) throw new Error('No frames were captured.');
  const lines = ['ffconcat version 1.0'];
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : endT;
    lines.push(`file '${f.file}'`, `duration ${Math.max(0.001, next - f.t).toFixed(4)}`);
  });
  lines.push(`file '${frames[frames.length - 1].file}'`);   // (the demuxer drops the last duration unless the file comes once more)
  return `${lines.join('\n')}\n`;
}

/** The clips that have sound, and when each starts in the movie (ms). cues: the page's [{ start, audio }] (ms since the epoch); t0: epoch ms of the movie's start. */
export function audioPlan(cues, clips, t0) {
  const out = [];
  cues.forEach((c, i) => { if (c && c.audio && clips[i]) out.push({ i, delay: Math.max(0, Math.round(c.audio - t0)) }); });
  return out;
}

/** ffmpeg arguments that mix the clips (files[i] for plan item i) into one track `duration` seconds long. */
export function mixArgs(plan, files, duration, out) {
  if (!plan.length) return ['-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', String(duration), '-c:a', 'pcm_s16le', out];
  const inputs = plan.flatMap(p => ['-i', files[p.i]]);
  const delayed = plan.map((p, k) => `[${k}:a]adelay=${p.delay}|${p.delay},aresample=24000[a${k}]`).join(';');
  const mix = `${plan.map((_, k) => `[a${k}]`).join('')}amix=inputs=${plan.length}:normalize=0:duration=longest,apad,atrim=0:${duration}[m]`;
  return [...inputs, '-filter_complex', `${delayed};${mix}`, '-map', '[m]', '-c:a', 'pcm_s16le', out];
}

const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');
const stamp = sec => { const ms = Math.round(sec * 1000); return `${pad(ms / 3600000)}:${pad((ms % 3600000) / 60000)}:${pad((ms % 60000) / 1000)}.${pad(ms % 1000, 3)}`; };

/** WebVTT for the cues: each subtitle from its cue's start to the next one (the last to `endMs`). */
export function vttFor(cues, says, t0, endMs) {
  const rows = [];
  says.forEach((text, i) => {
    const c = cues[i]; if (!c || !text) return;
    const next = cues.slice(i + 1).find(Boolean);
    const start = (c.start - t0) / 1000, end = ((next ? next.start : endMs) - t0) / 1000;
    if (end > start) rows.push(`${rows.length + 1}\n${stamp(start)} --> ${stamp(end)}\n${text}\n`);
  });
  return `WEBVTT\n\n${rows.join('\n')}`;
}

/** A data: URI as bytes (the clips come out of the page as WAV). */
export function bytesOfDataUri(uri) {
  const m = /^data:[^;,]*;base64,(.*)$/s.exec(uri || '');
  return m ? Buffer.from(m[1], 'base64') : null;
}
