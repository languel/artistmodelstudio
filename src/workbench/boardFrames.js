/**
 * Boards that hold documents and programs, drawn over the canvas: a DOM layer that follows the
 * camera and places each one at its board (after underscores' livecode nodes, with the board as
 * the frame).
 *
 *   markdown  rendered in the page (crisp at any zoom): math, Mermaid, callouts, [[links]] to
 *             boards and scenes, ![[embeds]] of boards and assets
 *   html      a page in a sandboxed frame
 *   p5        a sketch in a sandboxed frame, running while the board is live and on screen; paused,
 *             it shows its last picture
 *
 * Frames talk to the studio through a small bridge (window.ams inside them, postMessage outside):
 *   ams.board, ams.width, ams.height     the board
 *   await ams.call(tool, args)           any studio tool (ams_add, ams_board, …)
 *   await ams.mark(role, points, opts)   add a mark to this board (points in the frame's pixels)
 *   await ams.frame(name)                a source's current picture (an ImageBitmap)
 * Marks drawn on a document board stay visible over it (annotations).
 */
import { boardsOf, boardKind, findBoard, MAIN } from '../process/boards.js';
import { renderMarkdown, esc } from '../process/markdown.js';
import { renderToCanvas } from '../process/render.js';
// p5.js for sketches, bundled with the studio as plain text (no network needed; the package does not
// export the file by name), loaded when a sketch first runs.
const loadP5 = () => import('../../node_modules/p5/lib/p5.min.js?raw').then(m => m.default);
import 'katex/dist/katex.min.css';

const luminance = hex => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(String(hex || '')); if (!m) return 1;
  const [r, g, b] = m.slice(1).map(x => parseInt(x, 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

let mermaid = null;
async function renderMermaid(nodes, dark) {
  if (!nodes.length) return;
  if (!mermaid) { mermaid = (await import('mermaid')).default; }
  mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'neutral', securityLevel: 'strict', fontFamily: 'Inter, system-ui, sans-serif' });
  try { await mermaid.run({ nodes }); } catch (err) { console.warn('mermaid:', err.message); }
}

/**
 * Files a sketch loads by name (loadImage("seurat.jpg"), createVideo("birds.mp4")…) come from the
 * studio's sources: the name before the extension is the source. So the code a student copies
 * into the p5 editor (and uploads the picture beside) runs here unchanged.
 */
const LOADERS = ['loadImage', 'createVideo', 'createAudio', 'loadJSON', 'loadStrings', 'loadTable', 'loadBytes', 'loadFont', 'loadModel', 'loadXML'];
export const filesOf = code => [...new Set([...String(code || '').matchAll(new RegExp(`(?:${LOADERS.join('|')})\\(\\s*["'\`]([^"'\`]+)["'\`]`, 'g'))].map(m => m[1]))];
const fileLoader = files => `(() => {
  const F = ${JSON.stringify(files).replace(/</g, '\\u003c')};
  const at = p => (typeof p === 'string' && (F[p] || F[p.split('/').pop()])) || p;
  for (const k of ${JSON.stringify(LOADERS)}) { const f = p5.prototype[k]; if (typeof f === 'function') p5.prototype[k] = function (path, ...rest) { return f.call(this, at(path), ...rest); }; }
})();`;

/** The page a frame runs: the bridge, then (for p5) p5.js and its files, then the board's code. */
function frameDoc(kind, code, token, board, p5Source = '', files = {}, perf = false) {
  const bridge = `(() => {
  // A sandboxed frame has no storage: reading it throws. Libraries that touch it (ml5, tfjs) get a
  // stand-in that forgets on reload.
  for (const k of ['localStorage', 'sessionStorage']) {
    try { window[k].length; } catch {
      const m = new Map();
      try { Object.defineProperty(window, k, { configurable: true, value: { getItem: x => (m.has(x) ? m.get(x) : null), setItem: (x, v) => m.set(x, String(v)), removeItem: x => m.delete(x), clear: () => m.clear(), key: i => [...m.keys()][i] ?? null, get length() { return m.size; } } }); } catch { /* keep going */ }
    }
  }
  const token = ${JSON.stringify(token)}, pending = new Map(); let seq = 0;
  const ask = (type, data, transfer) => new Promise((ok, fail) => { const id = ++seq; pending.set(id, { ok, fail }); parent.postMessage({ amsFrame: token, type, id, ...data }, '*'); });
  let perfOn = ${perf ? 'true' : 'false'};   // timed only while the studio shows it
  addEventListener('message', e => {
    const d = e.data; if (!d || d.amsFrame !== token) return;
    if (d.type === 'perf') perfOn = Boolean(d.on);
    if (d.type === 'reply') { const p = pending.get(d.id); if (p) { pending.delete(d.id); d.error ? p.fail(new Error(d.error)) : p.ok(d.result); } }
    if (d.type === 'snapshot') { const c = document.querySelector('canvas'); parent.postMessage({ amsFrame: token, type: 'snapshot', url: c ? c.toDataURL('image/png') : null }, '*'); }
  });
  // The sketch's own pace (for the studio's performance readout): draw() calls a second and their time.
  addEventListener('load', () => {
    const draw = window.draw;
    if (typeof draw !== 'function') return;
    // Frames drawn: draw() calls that paint (call background(); a sketch following a GIF returns early
    // when the frame has not changed), and the time they took.
    let calls = 0, drawn = 0, ms = 0, painted = false;
    if (window.p5) { const bg = p5.prototype.background; p5.prototype.background = function (...a) { painted = true; return bg.apply(this, a); }; }
    window.draw = function (...a) {
      if (!perfOn) return draw.apply(this, a);
      const t0 = performance.now(); painted = false;
      try { return draw.apply(this, a); } finally { calls++; if (painted || !window.p5) { drawn++; ms += performance.now() - t0; } }
    };
    setInterval(() => { if (perfOn) parent.postMessage({ amsFrame: token, type: 'perf', fps: drawn, calls, ms: drawn ? ms / drawn : 0 }, '*'); calls = drawn = ms = 0; }, 1000);
  });
  addEventListener('error', e => parent.postMessage({ amsFrame: token, type: 'error', message: e.message, line: e.lineno }, '*'));
  addEventListener('unhandledrejection', e => parent.postMessage({ amsFrame: token, type: 'error', message: String(e.reason && e.reason.message || e.reason) }, '*'));
  window.ams = Object.freeze({
    board: ${JSON.stringify(board.title)}, width: ${board.width}, height: ${board.height},
    call: (tool, args = {}) => ask('call', { tool, args }),
    mark: (role, points, opts = {}) => ask('call', { tool: 'ams_add', args: { role, points, board: ${JSON.stringify(board.id)}, ...opts } }),
    frame: name => ask('frame', { name })
  });
})();`;
  const style = `html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}canvas{display:block;width:100%!important;height:100%!important;object-fit:contain}`;   // a canvas of another size than the board: fitted whole
  const body = kind === 'p5'
    ? `<script>${bridge}</script><script>${p5Source.replace(/<\/script/gi, '<\\/script')}</script><script>${fileLoader(files)}</script>${/\bml5\./.test(code) ? '<script crossorigin="anonymous" src="https://cdn.jsdelivr.net/npm/ml5@1/dist/ml5.min.js"></script>' : ''}<script>${code.replace(/<\/script/gi, '<\\/script')}</script>`
    : `<script>${bridge}</script>${code}`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>${style}</style></head><body>${body}</body></html>`;
}

export class BoardFrames {
  constructor(app) {
    this.app = app;
    this.canvas = app.canvas;
    this.layer = document.createElement('div');
    this.layer.className = 'wb-frames';
    this.canvas.host.append(this.layer);
    this.frames = new Map();   // board id → { kind, el, code, token, ... }
    this.snapshots = new Map();   // p5 board id → last picture (data URL)
    this.files = {};             // file name a sketch loads → data URL (from a source), or null
    this.perf = new Map();        // p5 board id → { fps, ms, at }: the sketch's own pace
    this.tokens = new Map();      // a frame's token → its board id (kept a moment after it goes, for its last picture)
    window.addEventListener('message', e => this.onMessage(e));
    // A document longer than its board scrolls: the wheel over it scrolls it (its code blocks sideways)
    // until it can go no further, then pans the canvas as usual. Ctrl/Cmd+wheel still zooms.
    this.canvas.host.addEventListener('wheel', e => this.scroll(e), { capture: true, passive: false });
    // With Cmd/Ctrl held a click is for the board's Properties, not for what is drawn in it.
    const mods = e => this.layer.classList.toggle('mod', e.metaKey || e.ctrlKey);
    addEventListener('keydown', mods); addEventListener('keyup', mods); addEventListener('blur', () => this.layer.classList.remove('mod'));
  }

  scroll(e) {
    if (e.ctrlKey || e.metaKey) return;
    const z = this.canvas.cam.z, inside = (el, r = el.getBoundingClientRect()) => e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
    for (const f of this.frames.values()) {
      const md = f.kind === 'markdown' && f.el.firstElementChild;
      if (!md || !inside(f.el)) continue;
      const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
      const box = sideways ? [...md.querySelectorAll('pre')].find(p => p.scrollWidth > p.clientWidth + 1 && inside(p)) : md;
      if (!box) return;
      const d = (sideways ? e.deltaX : e.deltaY) / z;
      const [pos, size, view] = sideways ? ['scrollLeft', box.scrollWidth, box.clientWidth] : ['scrollTop', box.scrollHeight, box.clientHeight];
      if (d > 0 ? box[pos] + view >= size - 1 : box[pos] <= 0) return;
      box[pos] += d;
      e.preventDefault(); e.stopPropagation();
      return;
    }
  }

  /** Called after each canvas redraw (the camera may have moved) and when the drawing changes. */
  update() {
    const doc = this.canvas.previewDoc || this.app.store.doc, z = this.canvas.cam.z, seen = new Set();
    // Titles changed (a board added, renamed, removed): links in documents mean something else now.
    const sig = boardsOf(doc).map(b => b.title).join('\u0001');
    if (sig !== this.titles) { this.titles = sig; this.relink(); }
    for (const b of boardsOf(doc)) {
      const kind = boardKind(b);
      if (kind === 'drawing' || kind === 'frame' || b.hidden || !this.canvas.boardOnScreen(b, 0.05)) continue;
      seen.add(b.id);
      let f = this.frames.get(b.id);
      if (f && f.kind !== kind) { f.el.remove(); f = null; }
      if (!f) { f = this.create(b, kind); this.frames.set(b.id, f); }
      this.refresh(f, b);
      const [sx, sy] = this.canvas.toScreen(b.x, b.y);
      f.el.style.transform = `translate(${sx}px, ${sy}px) scale(${z})`;
      f.el.style.width = `${b.width}px`; f.el.style.height = `${b.height}px`;
    }
    for (const [id, f] of this.frames) if (!seen.has(id)) { this.release(id, f); }
  }

  create(b, kind) {
    const el = document.createElement('div');
    el.className = `wb-bframe wb-bframe-${kind}`;
    this.layer.append(el);
    const token = `f${Math.random().toString(36).slice(2)}`;
    this.tokens.set(token, b.id);
    return { kind, el, id: b.id, code: null, token, running: false };
  }

  release(id, f) {
    this.frames.delete(id);
    if (f.kind === 'p5' && f.running) { this.snap(f); setTimeout(() => f.el.remove(), 400); }   // its last picture first
    else f.el.remove();
  }

  refresh(f, b) {
    const dark = luminance(b.ground) < 0.45;
    f.el.classList.toggle('dark', dark);
    f.el.style.setProperty('--ground', b.ground || '#f3efe6');
    const code = b.code || '';
    if (f.kind === 'player') { this.refreshPlayer(f, b); return; }
    if (f.kind === 'markdown') {
      if (f.code !== code || f.version !== this.linkVersion) {
        f.code = code; f.version = this.linkVersion;
        const doc = this.app.store.doc;
        f.el.innerHTML = `<div class="wb-md">${renderMarkdown(code, { resolve: t => this.resolve(t, doc) })}</div>`;
        this.wire(f.el, b, dark);
      }
      return;
    }
    // html and p5: a sandboxed frame. p5 runs while the board is live and on screen.
    const run = f.kind === 'html' || this.app.isBoardActive?.(b.id, b);
    const interactive = (this.app.activeBoard || MAIN) === b.id;
    f.el.classList.toggle('interactive', interactive);
    if (!run) {
      if (f.running) { this.snap(f); const old = f.iframe; setTimeout(() => old?.remove(), 400); f.iframe = null; f.running = false; }
      if (!f.still) {
        f.still = document.createElement('div');
        f.still.className = 'wb-bframe-still';
        f.el.append(f.still);
      }
      const shot = this.snapshots.get(b.id);
      f.still.innerHTML = shot ? `<img src="${shot}" alt="">` : `<span>p5 · paused</span>`;
      return;
    }
    f.still?.remove(); f.still = null;
    // p5.js goes into the frame itself: a sandboxed frame has no origin to fetch it from.
    if (f.kind === 'p5' && !this.p5Source) {
      if (!this.p5Loading) this.p5Loading = loadP5().then(t => { this.p5Source = t; this.canvas.invalidate(); return t; }).catch(err => this.app.log(`p5.js did not load: ${err.message}`, 'error'));
      return;
    }
    // The files it loads by name, from the sources (read once, kept as data URLs).
    const wanted = f.kind === 'p5' ? filesOf(code) : [];
    this.loadFiles(wanted.filter(n => !(n in this.files)));
    if (wanted.some(n => this.files[n] === undefined)) return;   // still reading: the sketch starts when they are here
    const files = Object.fromEntries(wanted.filter(n => this.files[n]).map(n => [n, this.files[n]]));
    if (!f.running || f.code !== code || f.size !== `${b.width}x${b.height}`) {
      f.code = code; f.size = `${b.width}x${b.height}`; f.running = true; f.errors = [];
      f.iframe?.remove();
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.setAttribute('credentialless', '');
      iframe.title = b.title;
      f.perf = Boolean(this.app.perfWanted?.(b));
      iframe.srcdoc = frameDoc(f.kind, code, f.token, b, this.p5Source, files, f.perf);
      f.iframe = iframe;
      f.el.append(iframe);
    }
    // Its performance shown or not: the sketch times its draw() only while it is.
    const perf = Boolean(this.app.perfWanted?.(b));
    if (f.iframe && f.perf !== perf) { f.perf = perf; f.iframe.contentWindow?.postMessage({ amsFrame: f.token, type: 'perf', on: perf }, '*'); if (!perf) this.perf.delete(b.id); }
  }

  /** A player's controls, built once and updated with each redraw (a new frame of its source redraws the canvas). */
  refreshPlayer(f, b) {
    const S = this.app.sources, name = b.source, def = S.def(name), live = S.entries.get(name)?.live;
    if (!f.built) {
      f.built = true;
      const btn = (act, tip, html) => `<button type="button" data-act="${act}" title="${tip}">${html}</button>`;
      const g = d => `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">${d}</svg>`;
      const rp = '<path d="M17 3l3 3-3 3M4 11V9a3 3 0 013-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 01-3 3H4"/>', sv = d => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
      f.icons = { repeat: sv(rp), repeatOff: sv(rp + '<path d="M3 3l18 18"/>'), play: g('<path d="M8 5l11 7-11 7z"/>'), pause: g('<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>'), volume: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="M15.5 9a4 4 0 010 6M18 6.5a8 8 0 010 11"/></svg>`, mute: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5"/></svg>` };
      f.el.innerHTML = `<div class="wb-player">
        ${btn('play', 'Play / pause', f.icons.pause)}
        ${btn('back', 'Back a frame', g('<path d="M17 5v14l-9-7zM6 5h2v14H6z"/>'))}
        ${btn('fwd', 'Forward a frame', g('<path d="M7 5v14l9-7zM16 5h2v14h-2z"/>'))}
        ${btn('loop', 'Loop (or stop at the end)', '')}
        ${btn('in', 'Set the in point here (playing starts here)', '<b>[</b>')}
        ${btn('out', 'Set the out point here (playing ends here; click again to clear both: Shift)', '<b>]</b>')}
        <input type="range" min="0" max="1000" value="0" class="scrub" title="Scrub">
        <span class="time"></span>
        <span class="vol" hidden>${btn('mute', 'Mute / unmute (muted by default)', '')}<input type="range" min="0" max="100" value="0" class="volume" title="Volume"></span>
        <select class="speed" title="Playback speed">${[['0.25', '¼×'], ['0.5', '½×'], ['1', '1×'], ['2', '2×'], ['4', '4×']].map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
      </div>`;
      const el = f.el, scrub = el.querySelector('.scrub'), app = this.app;
      el.addEventListener('click', e => {
        const a = e.target.closest('button')?.dataset.act;
        if (a === 'mute') app.mediaAct(b.source, 'mute');
        else if (a === 'loop' || a === 'in' || a === 'out') app.mediaAct(b.source, e.shiftKey && a !== 'loop' ? 'range' : a);
        else if (a) app.mediaAct(b.source, a === 'play' ? 'play' : 'step', a === 'back' ? -1 : 1);
      });
      scrub.addEventListener('input', () => app.mediaAct(b.source, 'seek', Number(scrub.value) / 1000));
      scrub.addEventListener('pointerdown', () => { f.scrubbing = true; });
      addEventListener('pointerup', () => { f.scrubbing = false; });
      el.querySelector('.speed').addEventListener('change', e => app.mediaAct(b.source, 'speed', e.target.value));
      el.querySelector('.volume').addEventListener('input', e => app.mediaAct(b.source, 'volume', Number(e.target.value) / 100));
    }
    const pos = live?.position?.(), spd = def?.speed ?? 1, el = f.el;
    const scrub = el.querySelector('.scrub'), sel = el.querySelector('.speed');
    if (!f.scrubbing && pos && document.activeElement !== scrub) scrub.value = String(Math.round(pos.fraction * 1000));
    const t = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
    el.querySelector('.time').textContent = pos ? (pos.duration ? `${t(pos.time)} / ${t(pos.duration)} · ${pos.frame}/${pos.frames}` : `${pos.frame + 1}/${pos.frames}`) : '—';
    const ms = this.app.mediaState(b.source), lb = el.querySelector('[data-act="loop"]');
    if (lb.dataset.state !== String(ms.loop)) { lb.dataset.state = String(ms.loop); lb.innerHTML = ms.loop ? f.icons.repeat : f.icons.repeatOff; lb.title = ms.loop ? 'Looping: click to stop at the end' : 'Stops at the end: click to loop'; }
    for (const k of ['in', 'out']) el.querySelector(`[data-act="${k}"]`).style.opacity = (k === 'in' ? ms.inP > 0 : ms.outP < 1) ? '1' : '0.45';
    const playBtn = el.querySelector('[data-act="play"]'), want = spd > 0 ? 'pause' : 'play';
    if (playBtn.dataset.state !== want) { playBtn.dataset.state = want; playBtn.innerHTML = f.icons[want]; playBtn.title = spd > 0 ? 'Pause' : 'Play'; }
    if (spd > 0 && sel.value !== String(spd)) sel.value = String(spd);
    // Volume, for a clip that can have sound (a GIF or a silent clip has none): muted until raised.
    const st = this.app.mediaState(b.source), vol = el.querySelector('.vol');
    vol.hidden = !(live?.kind === 'video' && st.sound !== false);
    if (!vol.hidden) {
      const mb = vol.querySelector('button'), muted = st.volume <= 0;
      if (mb.dataset.state !== (muted ? 'mute' : 'volume')) { mb.dataset.state = muted ? 'mute' : 'volume'; mb.innerHTML = f.icons[muted ? 'mute' : 'volume']; mb.title = muted ? 'Unmute' : 'Mute'; }
      const vi = vol.querySelector('.volume'); if (document.activeElement !== vi) vi.value = String(Math.round(st.volume * 100));
    }
  }

  /** Read files a sketch loads by name (seurat.jpg → the source “seurat”) as data URLs; null when none. */
  loadFiles(names) {
    for (const n of names) {
      if (n in this.files) continue;
      this.files[n] = undefined;
      this.fileFor(n).then(url => { this.files[n] = url; this.canvas.invalidate(); });
    }
  }

  async fileFor(name) {
    const base = name.split('/').pop().replace(/\.[^.]+$/, '');
    const d = this.app.sources.def(base) || this.app.sources.list.find(x => x.name.toLowerCase() === base.toLowerCase());
    let blob = null;
    if (d?.kind === 'asset') blob = (await this.app.assetStore.get(d.assetId))?.blob;
    if (!blob) { const a = (await this.app.assetStore.all()).find(x => x.blob && String(x.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') === base.toLowerCase()); blob = a?.blob; }
    if (!blob) { this.app.log(`p5: no source or asset for “${name}” (a source named “${base}”).`, 'error'); return null; }
    return new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(blob); });
  }

  /** p5.js as text (for frames and exported pages), loaded once. */
  async p5Text() {
    if (!this.p5Source) this.p5Source = await (this.p5Loading ||= loadP5());
    return this.p5Source;
  }

  /** Run a sketch again from the start (its code unchanged). */
  restart(id) { const f = this.frames.get(id); if (f) { f.running = false; this.canvas.invalidate(); } }

  /** Ask a running sketch for its picture (kept to show while it is paused). */
  snap(f) { try { f.iframe?.contentWindow?.postMessage({ amsFrame: f.token, type: 'snapshot' }, '*'); } catch { /* gone */ } }

  onMessage(e) {
    const d = e.data;
    if (!d || !d.amsFrame) return;
    const id = this.tokens.get(d.amsFrame);
    if (!id) return;
    const f = this.frames.get(id);
    const reply = (msg, transfer) => e.source?.postMessage({ amsFrame: d.amsFrame, type: 'reply', id: d.id, ...msg }, '*', transfer);
    if (d.type === 'perf') { this.perf.set(id, { fps: d.fps, calls: d.calls, ms: d.ms, at: performance.now() }); return; }
    if (d.type === 'snapshot') { if (d.url) { this.snapshots.set(id, d.url); if (f?.still) f.still.innerHTML = `<img src="${d.url}" alt="">`; } return; }
    if (d.type === 'error') { this.app.log(`Board “${boardsOf(this.app.store.doc).find(b => b.id === id)?.title || '?'}”: ${d.message}${d.line ? ` (line ${d.line})` : ''}`, 'error'); if (f) (f.errors ||= []).push(d); this.app.emit('frame-error', id, d); return; }
    if (d.type === 'call') {
      Promise.resolve(window.ams?.callTool?.(d.tool, d.args || {}))
        .then(result => reply({ result: JSON.parse(JSON.stringify(result ?? null)) }))
        .catch(err => reply({ error: err.message }));
      return;
    }
    if (d.type === 'frame') {
      const img = this.app.sources?.view(d.name);
      if (!img) { reply({ error: `No source “${d.name}”` }); return; }
      createImageBitmap(img).then(bitmap => reply({ result: bitmap }, [bitmap])).catch(err => reply({ error: err.message }));
    }
  }

  /** [[target]] → where it goes (a board, a scene, an asset), for links in documents. */
  resolve(target, doc = this.app.store.doc) {
    if (/^scene:/i.test(target)) { const s = this.app.scenes.all.find(x => x.title.toLowerCase() === target.slice(6).trim().toLowerCase()); return s ? { href: '#', title: `Scene: ${s.title}` } : { missing: true }; }
    if (/^asset:/i.test(target)) return { href: '#', title: `Asset: ${target.slice(6)}` };
    const b = findBoard(doc, target);
    return b ? { href: '#', title: `Board: ${b.title}` } : { missing: true, title: 'No such board (yet)' };
  }

  /** Links go to boards and scenes; embeds show boards and assets; Mermaid draws. */
  wire(root, board, dark) {
    for (const a of root.querySelectorAll('a.md-link')) {
      a.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); this.app.openLink(a.dataset.link, a.dataset.heading); });
    }
    for (const a of root.querySelectorAll('a[href]:not(.md-link)')) { a.target = '_blank'; a.rel = 'noopener'; }
    for (const span of root.querySelectorAll('.md-embed')) this.embed(span, board);
    renderMermaid([...root.querySelectorAll('pre.mermaid')], dark);
    // Opening a fold (a callout, a details) brings it into view inside the board: as much of it as fits.
    const md = root.querySelector('.wb-md');
    for (const d of root.querySelectorAll('details')) d.addEventListener('toggle', () => {
      if (!d.open || !md) return;
      const top = d.getBoundingClientRect().top - md.getBoundingClientRect().top, z = this.canvas.cam.z;
      const t = top / z + md.scrollTop, h = d.offsetHeight;
      if (t + h > md.scrollTop + md.clientHeight) md.scrollTo({ top: Math.min(t, t + h - md.clientHeight), behavior: 'smooth' });
    });
  }

  async embed(span, board) {
    const target = span.dataset.embed, size = Number(span.dataset.size) || null;
    const doc = this.app.store.doc;
    if (/^asset:/i.test(target)) {
      const title = target.slice(6).trim().toLowerCase();
      const a = (await this.app.assetStore.all()).find(x => String(x.title).toLowerCase() === title);
      span.innerHTML = a?.blob ? `<img src="${URL.createObjectURL(a.blob)}" alt="${esc(a.title)}"${size ? ` style="width:${size}px"` : ''}>` : `<span class="md-missing">${esc(target)}</span>`;
      return;
    }
    const b = findBoard(doc, target);
    if (!b || b.id === board.id) { span.innerHTML = `<span class="md-missing">${esc(target)}</span>`; return; }
    if (boardKind(b) === 'markdown') { span.innerHTML = `<div class="md-transclusion">${renderMarkdown(b.code || '')}</div>`; return; }
    const scale = Math.min(1, 900 / Math.max(b.width, b.height));
    const url = renderToCanvas(doc, { board: b.id, scale, mode: 'picture' }).toDataURL('image/jpeg', 0.85);
    span.innerHTML = `<a class="md-link md-embed-board" data-link="${esc(b.title)}" href="#"><img src="${url}" alt="${esc(b.title)}"${size ? ` style="width:${size}px"` : ''}></a>`;
    span.querySelector('a').addEventListener('click', e => { e.preventDefault(); this.app.openLink(b.title); });
  }

  /** Links changed meaning (boards renamed, added, removed): documents re-render. */
  relink() { this.linkVersion = (this.linkVersion || 0) + 1; }
}
