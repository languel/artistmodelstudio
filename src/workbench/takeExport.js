/**
 * Exporting takes: a standalone playable HTML file (the renderer inlined, no libraries), a project
 * zip, a video (MediaRecorder on an offscreen canvas), or the take as JSON.
 *
 * The player exposes window.amsPlayer = { duration, seek(ms), play(), pause(), frame(ms) } so a
 * frame-by-frame renderer (HyperFrames-style, headless capture) can drive it deterministically.
 */
import boardsSrc from '../process/boards.js?raw';
import documentSrc from '../process/document.js?raw';
import brushesSrc from '../process/brushes.js?raw';
import notesSrc from '../process/notes.js?raw';
import renderSrc from '../process/render.js?raw';
import takeSrc from '../process/take.js?raw';
import takeRenderSrc from '../process/takeRender.js?raw';
import { renderFrame } from '../process/takeRender.js';
import { duration, touch, on } from '../process/take.js';
import { download } from './ui.js';
import { createZip } from '../export/zip.js';

const strip = src => src
  .replace(/^import[^;]*;\s*$/gm, '')
  .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
  .replace(/^export\s+(default\s+)?/gm, '');

const slug = s => String(s || 'take').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'take';
const clean = take => { const t = JSON.parse(JSON.stringify(take)); delete t.assetId; t.duration = duration(take); return t; };

/** The renderer and player as one script (no imports). */
export function playerScript() {
  return [boardsSrc, documentSrc, brushesSrc, notesSrc, renderSrc, takeSrc, takeRenderSrc].map(strip).join('\n;\n') + '\n' + PLAYER_UI;
}

const PLAYER_UI = String.raw`
// ---- the player -------------------------------------------------------------------------------
(function () {
  const take = window.AMS_TAKE;
  touch(take);
  for (const c of take.clips) if (c.diff) installLines({ brushes: c.diff.brushes || {}, lines: c.diff.lines || {} });
  installLines(take.baseline);
  const cv = document.getElementById('stage'), ctx = cv.getContext('2d');
  const bar = document.getElementById('bar'), range = document.getElementById('scrub'), time = document.getElementById('time'), playBtn = document.getElementById('play');
  const D = duration(take);
  let t = 0, playing = false, rate = 1, mode = 'process', captions = true, last = 0;
  const audios = take.clips.filter(c => c.track === 'audio' && c.src && on(take, c)).map(c => ({ c, el: Object.assign(new Audio(c.src), { preload: 'auto' }) }));
  const fmt = ms => { const s = Math.max(0, ms) / 1000, m = Math.floor(s / 60); return m + ':' + (s - m * 60).toFixed(1).padStart(4, '0'); };
  function size() { const dpr = window.devicePixelRatio || 1; cv.width = Math.round(innerWidth * dpr); cv.height = Math.round((innerHeight - bar.offsetHeight) * dpr); cv.style.width = innerWidth + 'px'; cv.style.height = (innerHeight - bar.offsetHeight) + 'px'; draw(); }
  function draw() { renderFrame(ctx, take, t, { width: cv.width, height: cv.height, mode, captions }); range.value = D ? t / D * 1000 : 0; time.textContent = fmt(t) + ' / ' + fmt(D); }
  function syncAudio() { for (const a of audios) { const inside = t >= a.c.start && t < a.c.start + a.c.dur; if (playing && inside) { const want = (t - a.c.start) / 1000; if (a.el.paused) { a.el.currentTime = want; a.el.playbackRate = rate; a.el.play().catch(() => {}); } else if (Math.abs(a.el.currentTime - want) > 0.3) a.el.currentTime = want; } else if (!a.el.paused) a.el.pause(); } }
  function tick(now) { if (!playing) return; t += (now - last) * rate; last = now; if (t >= D) { t = D; playing = false; playBtn.textContent = '▶'; } syncAudio(); draw(); if (playing) requestAnimationFrame(tick); }
  const api = window.amsPlayer = {
    duration: D,
    seek(ms) { t = Math.max(0, Math.min(D, Number(ms) || 0)); syncAudio(); draw(); return t; },
    play() { if (playing) return; if (t >= D) t = 0; playing = true; last = performance.now(); playBtn.textContent = '❚❚'; requestAnimationFrame(tick); },
    pause() { playing = false; playBtn.textContent = '▶'; syncAudio(); },
    /** Render one frame at ms (for frame-by-frame capture); returns the canvas. */
    frame(ms) { api.seek(ms); return cv; },
    get time() { return t; }
  };
  playBtn.onclick = () => (playing ? api.pause() : api.play());
  range.oninput = () => api.seek(range.value / 1000 * D);
  document.getElementById('rate').onchange = e => { rate = Number(e.target.value); };
  document.getElementById('mode').onclick = e => { mode = mode === 'process' ? 'picture' : 'process'; e.target.textContent = mode === 'process' ? 'Process' : 'Picture'; draw(); };
  document.getElementById('cc').onclick = e => { captions = !captions; e.target.style.opacity = captions ? 1 : 0.45; draw(); };
  addEventListener('keydown', e => { if (e.key === ' ') { e.preventDefault(); playBtn.click(); } if (e.key === 'ArrowRight') api.seek(t + 2000); if (e.key === 'ArrowLeft') api.seek(t - 2000); });
  addEventListener('resize', size);
  KIT.onImageLoad = draw;
  document.fonts?.ready.then(draw);
  size();
  const q = new URLSearchParams(location.search);
  if (q.has('t')) api.seek(Number(q.get('t')));
  if (q.has('autoplay')) api.play();
})();
`;

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function pageHTML(take, { inline = true } = {}) {
  const data = JSON.stringify(clean(take)).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(take.title)}</title>
<meta name="generator" content="Artist Model Studio" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;600&family=Patrick+Hand&family=Newsreader:ital,opsz,wght@0,6..72,400;1,6..72,400&family=Inter:wght@400;600&display=swap" rel="stylesheet" />
<style>
  html, body { margin: 0; height: 100%; background: #1b1b1b; color: #dadada; font: 13px Inter, system-ui, sans-serif; overflow: hidden; }
  canvas { display: block; }
  #bar { display: flex; align-items: center; gap: 10px; padding: 8px 12px; background: #222; border-top: 1px solid #353535; }
  #bar button, #bar select { background: #2a2a2a; color: #dadada; border: 1px solid #353535; border-radius: 6px; padding: 3px 9px; font: inherit; cursor: pointer; }
  #scrub { flex: 1; accent-color: #c9c7c2; }
  #time { font: 12px ui-monospace, Menlo, monospace; color: #8c8c8c; min-width: 110px; text-align: right; }
  #title { color: #8c8c8c; max-width: 30vw; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
</head>
<body>
<canvas id="stage"></canvas>
<div id="bar">
  <button id="play" title="Play / pause (Space)">▶</button>
  <input id="scrub" type="range" min="0" max="1000" value="0" title="Scrub (← → jump 2 s)" />
  <span id="time">0:00.0</span>
  <select id="rate" title="Rate"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select>
  <button id="mode" title="Process (construction and notes shown) or the finished picture">Process</button>
  <button id="cc" title="Captions">CC</button>
  <span id="title">${esc(take.title)}</span>
</div>
<script>window.AMS_TAKE = ${data};</script>
${inline ? `<script>\n${playerScript()}\n</script>` : '<script src="player.js"></script>'}
</body>
</html>
`;
}

export function takeToHTML(take) { return pageHTML(take, { inline: true }); }

export function downloadHTML(take) { download(takeToHTML(take), `${slug(take.title)}.html`, 'text/html'); }
export function downloadJSON(take) { download(JSON.stringify(clean(take), null, 1), `${slug(take.title)}.take.json`, 'application/json'); }
export function downloadProject(take) {
  const html = pageHTML(take, { inline: false }).replace(/<script>window\.AMS_TAKE = [\s\S]*?<\/script>/, '<script>fetch("take.json").then(r => r.json()).then(t => { window.AMS_TAKE = t; const s = document.createElement("script"); s.src = "player.js"; document.body.append(s); });</script>').replace('<script src="player.js"></script>', '');
  const zip = createZip([
    { name: 'index.html', data: html },
    { name: 'player.js', data: playerScript() },
    { name: 'take.json', data: JSON.stringify(clean(take), null, 1) },
    { name: 'README.txt', data: `${take.title}\n\nOpen index.html through a local server (e.g. npx serve), or open the single-file HTML export directly.\nwindow.amsPlayer.seek(ms) renders any moment; frame(ms) returns the canvas for frame-by-frame capture.\n` }
  ]);
  download(new Blob([zip], { type: 'application/zip' }), `${slug(take.title)}-project.zip`, 'application/zip');
}

/** Record the take to video and download it. */
export async function downloadVideo(take, opts = {}) {
  const { blob, ext } = await videoBlob(take, opts);
  download(blob, `${slug(take.title)}${(opts.rate || 1) !== 1 ? `-${opts.rate}x` : ''}.${ext}`, blob.type);
  opts.app?.log(`Video saved (${ext}).`);
}

/** Record the take to video in real time (divided by rate): { blob, ext }. Keep the tab visible while it runs. */
export async function videoBlob(take, { rate = 1, width = 1280, fps = 30, mode = 'process', app = null } = {}) {
  touch(take);
  const ab = take.baseline.artboard;
  const W = width, H = Math.round((width * ab.height) / ab.width / 2) * 2;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  // Sound clips (unmuted tracks) are mixed in: scheduled on an audio graph recorded with the frames.
  const sounds = take.clips.filter(cl => cl.track === 'audio' && cl.src && on(take, cl));
  const types = sounds.length
    ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
    : ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  const mimeType = types.find(t => window.MediaRecorder?.isTypeSupported?.(t));
  if (!mimeType) throw new Error('This browser cannot record video');
  const stream = c.captureStream(fps);
  let ac = null;
  if (sounds.length) {
    ac = new AudioContext();
    const dest = ac.createMediaStreamDestination();
    const at0 = ac.currentTime + 0.25;
    for (const cl of sounds) {
      try {
        const buf = await ac.decodeAudioData(await (await fetch(cl.src)).arrayBuffer());
        const src = ac.createBufferSource();
        src.buffer = buf; src.playbackRate.value = rate; src.connect(dest);
        src.start(at0 + cl.start / 1000 / rate, (cl.offset || 0) / 1000, cl.dur / 1000);
      } catch (err) { console.warn('audio clip skipped:', err.message); }
    }
    for (const tr of dest.stream.getAudioTracks()) stream.addTrack(tr);
    await new Promise(r => setTimeout(r, 250));
  }
  const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 6_000_000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise(r => { rec.onstop = r; });
  const D = duration(take);
  app?.log(`Recording video: ${(D / rate / 1000).toFixed(1)} s…`);
  rec.start(500);
  const t0 = performance.now();
  // A timer, not animation frames: keeps going when the tab is in the background.
  await new Promise(resolve => {
    const step = () => {
      const t = Math.min(D, (performance.now() - t0) * rate);
      renderFrame(ctx, take, t, { width: W, height: H, mode });
      if (t >= D) return setTimeout(resolve, 300);
      setTimeout(step, 1000 / fps);
    };
    step();
  });
  rec.stop();
  await done;
  ac?.close();
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
  return { blob: new Blob(chunks, { type: mimeType.split(';')[0] }), ext };
}
