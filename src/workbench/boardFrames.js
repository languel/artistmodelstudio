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
import { boardsOf, boardKind, boardById, findBoard, MAIN, opacityOf, blendOf, cssBlend } from '../process/boards.js';
import { renderMarkdown, esc } from '../process/markdown.js';
import { renderToCanvas } from '../process/render.js';
import { collectThree, threeLoader } from '../process/threeModules.js';
import { instrument, liveValues, rewriteControl, panelOf } from '../process/controls.js';
import { mountPanel, controlSpecs } from './controlsPanel.js';
import { createCodeEditor } from './codeEditor.js';
import { runScript } from '../process/script.js';
import { icon } from './icons.js';
import { rangeOf } from '../process/stopmotion.js';
// p5.js for sketches, bundled with the studio as plain text (no network needed; the package does not
// export the file by name), loaded when a sketch first runs.
const loadP5 = () => import('../../node_modules/p5/lib/p5.min.js?raw').then(m => m.default);
// three.js and the addons a sketch may import, bundled with the studio as text and read when a sketch first needs them.
const THREE_FILES = import.meta.glob([
  '../../node_modules/three/package.json',
  '../../node_modules/three/build/three.{module,core}.js',
  // every addon a demo is likely to import (a few MB of text, read only when a sketch imports one): controls, postprocessing, loaders and
  // exporters, helpers, renderers (CSS2D, CSS3D), environments (RoomEnvironment), webxr (VRButton), and libs (lil-gui, stats, fflate…)
  '../../node_modules/three/examples/jsm/{controls,postprocessing,shaders,math,geometries,lines,utils,curves,helpers,objects,lights,lighting,environments,renderers,interactive,misc,modifiers,effects,animation,csm,capabilities,textures,webxr,libs,exporters}/*.js',
  '../../node_modules/three/examples/jsm/loaders/**/*.js'
], { query: '?raw', import: 'default' });
// The versions of the libraries the studio runs (a page for another editor asks for the same ones).
const P5_PACKAGE = import.meta.glob('../../node_modules/p5/package.json', { query: '?raw', import: 'default' });
export const threeVersion = async () => JSON.parse(await THREE_FILES['../../node_modules/three/package.json']()).version;
export const p5Version = async () => JSON.parse(await Object.values(P5_PACKAGE)[0]()).version;
export const loadThreeFile = async id => {
  const f = THREE_FILES[`../../node_modules/three/${id}`];
  if (!f) throw new Error(`three.js file “${id}” is not bundled with the studio (import from 'three' or a common addon: controls, postprocessing, shaders, loaders…)`);
  return f();
};
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
export const filesOf = (code, kind = 'p5') => [...new Set([
  ...String(code || '').matchAll(new RegExp(`(?:${LOADERS.join('|')})\\(\\s*["'\`]([^"'\`]+)["'\`]`, 'g')),
  // three.js: loader.load('x.jpg') and loader.loadAsync('x.jpg') (TextureLoader, ImageLoader) read a picture by name too
  ...(kind === 'three' ? String(code || '').matchAll(/\.load(?:Async)?\(\s*["'`]([^"'`]+\.(?:jpe?g|png|gif|webp))["'`]/gi) : []),
  // three.js: a model file named in the code (a .glb or .gltf) is read as data too: window.__amsFiles['Fox.glb']
  ...(kind === 'three' ? String(code || '').matchAll(/["'`]([^"'`]+\.(?:glb|gltf))["'`]/gi) : [])
].map(m => m[1]))];
const fileLoader = files => `(() => {
  const F = ${JSON.stringify(files).replace(/</g, '\\u003c')};
  const at = p => (typeof p === 'string' && (F[p] || F[p.split('/').pop()])) || p;
  for (const k of ${JSON.stringify(LOADERS)}) { const f = p5.prototype[k]; if (typeof f === 'function') p5.prototype[k] = function (path, ...rest) { return f.call(this, at(path), ...rest); }; }
})();`;

/** The page a frame runs: the bridge, then (for p5) p5.js and its files, then the board's code. */
function frameDoc(kind, code, token, board, p5Source = '', files = {}, perf = false, threeMods = null, seed = null, ctl = {}, scale = 1) {
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
  let piping = false, pumping = false;
  // An output window runs a twin of this sketch. They match when they start together with the same random numbers,
  // are paused together, and get the same input (the studio's copy sends its pointer and keys over, see outputs.js).
  const seed = ${seed == null ? 'null' : Number(seed) >>> 0};
  if (seed !== null) { let s = seed; Math.random = () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  let held = null; const raf0 = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = cb => raf0(t => { if (held) held.push(cb); else cb(t); });
  // Controls the code declares (const n = 6 /* 1..40 */, // @param …): their values, live while the sketch runs.
  const ctlVals = ${JSON.stringify(ctl).replace(/</g, '\\u003c')}, ctlSet = {}, params = { ...ctlVals };
  window.__ctl = (k, f) => { ctlSet[k] = f; if (k in ctlVals) f(ctlVals[k]); };
  // p5.js code reads windowWidth and windowHeight; so may any sketch here (the board's size), to be copied as it is.
  ${kind === 'p5' ? '' : "Object.defineProperties(window, { windowWidth: { get: () => innerWidth, configurable: true }, windowHeight: { get: () => innerHeight, configurable: true } });"}
  // The studio's own keys keep working while a sketch has the focus: Esc, and chords with Ctrl or Cmd and Option (Perform, Present…).
  let holdKeys = false;   // (Perform asks for H and Shift+H too, for its controls)
  let present = false;    // (while the boards are presented, the arrow keys go to the studio: next and previous board)
  parent.postMessage({ amsFrame: token, type: 'present?' }, '*');
  addEventListener('keydown', e => {
    const bare = !e.altKey && !e.ctrlKey && !e.metaKey;
    // PageUp and PageDown (and Alt with the arrows) step through the boards from inside a sketch too; so do the arrows while presenting.
    const step = (bare && (e.key === 'PageUp' || e.key === 'PageDown' || (present && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')))) || (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight'));
    if (!((e.altKey && (e.ctrlKey || e.metaKey)) || e.key === 'Escape' || step || (holdKeys && (e.key === 'h' || e.key === 'H') && bare))) return;
    parent.postMessage({ amsFrame: token, type: 'hotkey', ev: { key: e.key, code: e.code, keyCode: e.keyCode, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey, shiftKey: e.shiftKey } }, '*');
  }, true);
  // How large the board is shown, as the pixel ratio: a canvas drawn at it stays sharp when the board is enlarged (Perform, zoom).
  let ratio = ${Math.max(1, Number(scale) || 1)};
  try { Object.defineProperty(window, 'devicePixelRatio', { get: () => ratio, configurable: true }); } catch { /* keep the browser's */ }
  let fwd = false;
  for (const t of ['pointermove', 'pointerdown', 'pointerup', 'mousemove', 'mousedown', 'mouseup', 'click', 'wheel', 'keydown', 'keyup']) {
    addEventListener(t, e => {
      if (!fwd) return;
      const k = t.startsWith('key');
      parent.postMessage({ amsFrame: token, type: 'input', ev: { t, x: k ? 0 : e.clientX / innerWidth, y: k ? 0 : e.clientY / innerHeight, button: e.button, buttons: e.buttons, dx: e.deltaX, dy: e.deltaY, key: e.key, code: e.code, keyCode: e.keyCode, shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey } }, '*');
    }, true);
  }
  const replay = v => {
    const target = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, v.x * innerWidth)), Math.min(innerHeight - 1, Math.max(0, v.y * innerHeight))) || document.querySelector('canvas') || document.body;
    const base = { bubbles: true, cancelable: true, view: window, shiftKey: v.shift, ctrlKey: v.ctrl, altKey: v.alt, metaKey: v.meta };
    let ev;
    if (v.t.startsWith('key')) ev = new KeyboardEvent(v.t, { ...base, key: v.key, code: v.code, keyCode: v.keyCode, which: v.keyCode });
    else if (v.t === 'wheel') ev = new WheelEvent('wheel', { ...base, clientX: v.x * innerWidth, clientY: v.y * innerHeight, deltaX: v.dx, deltaY: v.dy });
    else if (v.t.startsWith('pointer')) ev = new PointerEvent(v.t, { ...base, clientX: v.x * innerWidth, clientY: v.y * innerHeight, button: v.button, buttons: v.buttons, pointerId: 1, pointerType: 'mouse', isPrimary: true });
    else ev = new MouseEvent(v.t, { ...base, clientX: v.x * innerWidth, clientY: v.y * innerHeight, button: v.button, buttons: v.buttons });
    (v.t.startsWith('key') ? document : target).dispatchEvent(ev);
  };
  const pump = async () => {
    if (!piping) { pumping = false; return; }
    pumping = true;
    const c = document.querySelector('canvas');
    if (c && c.width > 0 && c.height > 0) { try { const bm = await createImageBitmap(c); parent.postMessage({ amsFrame: token, type: 'pipe', bitmap: bm }, '*', [bm]); } catch { /* not ready */ } }
    requestAnimationFrame(pump);
  };
  addEventListener('message', e => {
    const d = e.data; if (!d || d.amsFrame !== token) return;
    if (d.type === 'perf') perfOn = Boolean(d.on);
    if (d.type === 'fwd') fwd = Boolean(d.on);
    if (d.type === 'holdkeys') holdKeys = Boolean(d.on);
    if (d.type === 'present') present = Boolean(d.on);
    if (d.type === 'scale') { ratio = Math.max(1, Number(d.value) || 1); for (const r of window.__amsRenderers || []) { try { r.setPixelRatio(ratio); } catch { /* a renderer that is gone */ } } }
    if (d.type === 'ctl') { ctlVals[d.key] = params[d.key] = d.value; try { ctlSet[d.key]?.(d.value); } catch { /* the sketch's own error */ } }
    if (d.type === 'input' && d.ev) { try { replay(d.ev); } catch { /* an event the sketch cannot take */ } }
    if (d.type === 'run') { if (d.on && held) { const q = held; held = null; q.forEach(cb => raf0(cb)); } else if (!d.on && !held) held = []; }
    if (d.type === 'reply') { const p = pending.get(d.id); if (p) { pending.delete(d.id); d.error ? p.fail(new Error(d.error)) : p.ok(d.result); } }
    if (d.type === 'snapshot') { const c = document.querySelector('canvas'); parent.postMessage({ amsFrame: token, type: 'snapshot', url: c ? c.toDataURL('image/png') : null }, '*'); }
    // The board is sent to an output: a bitmap of its canvas goes to the studio each frame, for as long as it is asked.
    if (d.type === 'pipe') { piping = Boolean(d.on); if (piping && !pumping) pump(); }
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
    params,
    call: (tool, args = {}) => ask('call', { tool, args }),
    mark: (role, points, opts = {}) => ask('call', { tool: 'ams_add', args: { role, points, board: ${JSON.stringify(board.id)}, ...opts } }),
    frame: name => ask('frame', { name })
  });
})();`;
  const style = `html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}canvas{display:block;width:100%!important;height:100%!important;object-fit:contain}`;   // a canvas of another size than the board: fitted whole
  // A lesson written for a page expects its elements (#stage to draw in, #tabs #panel #tree for its controls, #hud, #inset):
  // a three.js board that asks for them by id gets them, the controls in a small floating column.
  const wanted = new Set([...(kind === 'three' ? code.matchAll(/getElementById\(\s*['"](stage|hud|inset|tabs|panel|tree)['"]\s*\)/g) : [])].map(m => m[1]));
  const scaffold = !wanted.size ? '' : `<style>#stage{position:fixed;inset:0}#hud{position:fixed;left:8px;bottom:6px;font:11px ui-monospace,monospace;color:rgba(255,255,255,.6);pointer-events:none;z-index:2}#inset{position:fixed;right:12px;top:12px;border:1px solid #f2b84b;pointer-events:none;z-index:2}#side{position:fixed;left:8px;top:8px;width:min(260px,45%);max-height:calc(100% - 40px);overflow:auto;z-index:2;background:rgba(20,20,24,.82);color:#ddd;font:12px system-ui,sans-serif;padding:6px 8px;border-radius:6px}#side .row{display:flex;gap:6px;align-items:center;margin:3px 0}#side .row label{flex:0 0 70px}#side pre{white-space:pre-wrap;font-size:11px}#side button,#side select{font:inherit}#tabs{display:flex;flex-wrap:wrap;gap:4px}</style><div id="stage"></div><div id="hud"></div><div id="inset"></div><div id="side"><div id="tabs"></div><section id="panel"></section><div id="tree"></div></div>`;
  const body = kind === 'three'
    ? `${scaffold}<script>${bridge}</script><script>window.__amsFiles = ${JSON.stringify(files).replace(/</g, '\\u003c')};</script><script type="application/json" id="three-modules">${JSON.stringify(threeMods?.modules || {}).replace(/</g, '\\u003c')}</script><script type="module">${threeLoader(token)}</script>`
    : kind === 'p5'
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
    this.seeds = new Map();       // board id → the random seed its sketch runs with (set when a window shows a twin of it)
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
      const md = (f.kind === 'markdown' && f.el.firstElementChild) || (f.kind === 'code' && f.editor?.view.scrollDOM);
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
      if (kind === 'drawing' || kind === 'frame' || b.hidden || !(this.canvas.boardOnScreen(b, 0.05) || this.app.outputs?.wants(b.id))) continue;   // (a board sent to an output runs off screen too)
      seen.add(b.id);
      let f = this.frames.get(b.id);
      if (f && f.kind !== kind) { f.el.remove(); f = null; }
      if (!f) { f = this.create(b, kind); this.frames.set(b.id, f); }
      this.refresh(f, b);
      // The board's zoom changed enough to matter: the sketch draws at the new pixel ratio.
      if (f.iframe && f.running) { const want = this.pixelRatioFor(), had = f.scaleSent || 1; if (Math.abs(want - had) / had > 0.15) { f.scaleSent = want; try { f.iframe.contentWindow?.postMessage({ amsFrame: f.token, type: 'scale', value: want }, '*'); } catch { /* gone */ } } }
      const [sx, sy] = this.canvas.toScreen(b.x, b.y);
      f.el.style.width = `${b.width}px`; f.el.style.height = `${b.height}px`;
      if (!this.canvas.boardOnScreen(b, 0.05)) {
        // Sent to an output but off screen: a browser stops painting a frame that is out of view, so it is kept in view
        // (tiny, in a corner, invisible and untouchable) and keeps running.
        f.el.style.transform = 'translate(0px, 0px) scale(0.02)'; f.el.style.opacity = '0.01'; f.el.style.pointerEvents = 'none';   // (not 0: a browser throttles a frame that is fully transparent to a couple of frames a second)
      } else {
        f.el.style.transform = `translate(${sx}px, ${sy}px) scale(${z})`; f.el.style.pointerEvents = '';
        f.el.style.opacity = String(opacityOf(b)); f.el.style.mixBlendMode = cssBlend(blendOf(b));   // (a board as a layer)
      }
    }
    // A board's media controls (board.controls): under it, as wide as it, following it. Not a board of their own.
    for (const b of boardsOf(doc)) {
      if (!b.controls || !b.source || b.hidden || !this.canvas.boardOnScreen(b, 0.05)) continue;
      const key = `${b.id}:controls`;
      seen.add(key);
      let f = this.frames.get(key);
      if (!f) { f = this.create({ id: key, ground: '#1c1c1c' }, 'player'); this.frames.set(key, f); }
      const pb = { id: key, source: b.source, ground: '#1c1c1c' };
      this.refresh(f, pb);
      const [sx, sy] = this.canvas.toScreen(b.x, b.y + b.height + 14);
      f.el.style.transform = `translate(${sx}px, ${sy}px) scale(${z})`;
      f.el.style.width = `${b.width}px`; f.el.style.height = '64px';
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

  /** The p5.js library as text (loaded once). */
  async p5Text() { return (this.p5Source ||= await (this.p5Loading ||= loadP5())); }
  /** Ask a board's frame to send its canvas as bitmaps (to an output); cb gets each one. */
  pipe(id, cb) { (this.pipes ||= new Map()).set(id, cb); const f = this.frames.get(id); if (f?.iframe) this.sendPipe(f); }
  unpipe(id) { const f = this.frames.get(id); this.pipes?.delete(id); if (f?.iframe) this.sendPipe(f); }
  /** Watch a running sketch's canvas: a bitmap each frame, handed to `cb` (valid only during the call). Returns a function that stops. */
  tap(id, cb) {
    const f = this.frames.get(id); if (!f?.iframe) return null;
    const set = ((this.taps ||= new Map()).get(id) || (this.taps.set(id, new Set()), this.taps.get(id)));
    set.add(cb); this.sendPipe(f);
    return () => { set.delete(cb); const g = this.frames.get(id); if (g?.iframe) this.sendPipe(g); };
  }
  /** Start a board's sketch again with a fresh seed, so a window's twin and this one begin together and stay alike. */
  reseed(id) {
    this.seeds.set(id, Math.floor(Math.random() * 2 ** 32));
    const f = this.frames.get(id), b = boardsOf(this.app.store.doc).find(x => x.id === id);
    if (f?.iframe && b) { f.code = null; this.refresh(f, b); } else this.canvas.invalidate();
  }
  /** The pixel ratio a board is shown at: its zoom times the screen's, between 1 and 4. */
  pixelRatioFor() { return Math.min(4, Math.max(1, this.canvas.cam.z * (window.devicePixelRatio || 1))); }
  /** Send a running sketch the values its controls now have in `code` (the ones that changed), and the same to its windows. */
  ctl(id, code) {
    const f = this.frames.get(id);
    if (!f?.iframe || !f.running) return;
    const vals = liveValues(code);
    for (const [key, value] of Object.entries(vals)) {
      if (f.vals && JSON.stringify(f.vals[key]) === JSON.stringify(value)) continue;
      (f.vals ||= {})[key] = value;
      try { f.iframe.contentWindow?.postMessage({ amsFrame: f.token, type: 'ctl', key, value }, '*'); } catch { /* gone */ }
      this.app.outputs?.ctl(id, key, value, f.token);
    }
  }
  /** Ask a board's sketch to pass H and Shift+H to the studio (Perform's controls), or not. */
  /** Tell every running sketch whether the boards are being presented (its arrow keys then step the presentation). */
  setPresenting(on) { for (const f of this.frames.values()) { try { f.iframe?.contentWindow?.postMessage({ amsFrame: f.token, type: 'present', on: Boolean(on) }, '*'); } catch { /* gone */ } } }

  holdKeys(id, on) { const f = this.frames.get(id); try { f?.iframe?.contentWindow?.postMessage({ amsFrame: f.token, type: 'holdkeys', on: Boolean(on) }, '*'); } catch { /* gone */ } }
  /** Tell a sketch whether to send its pointer and keys on (to the twin in an output window). */
  sendForward(f) { try { f.iframe?.contentWindow?.postMessage({ amsFrame: f.token, type: 'fwd', on: Boolean(this.app.outputs?.live(f.id)) }, '*'); } catch { /* gone */ } }
  sendPipe(f) { try { f.iframe.contentWindow?.postMessage({ amsFrame: f.token, type: 'pipe', on: Boolean(this.pipes?.has(f.id) || this.taps?.get(f.id)?.size) }, '*'); } catch { /* gone */ } }

  release(id, f) {
    this.frames.delete(id);
    clearTimeout(f.timer); clearInterval(f.liveTimer); f.smTap?.(); f.editor?.destroy(); f.panel?.destroy();
    if ((f.kind === 'p5' || f.kind === 'three') && f.running) { this.snap(f); setTimeout(() => f.el.remove(), 400); }   // its last picture first
    else f.el.remove();
  }

  refresh(f, b) {
    const dark = luminance(b.ground) < 0.45;
    f.el.classList.toggle('dark', dark);
    f.el.style.setProperty('--ground', b.ground || '#f3efe6');
    const raw = b.code || '';
    if (f.kind === 'p5' || f.kind === 'three') this.syncPanel(f, b, raw);
    // p5 and three: values of controls the code declares are changed in the running sketch, so only the rest of the code starts it again.
    const inst = f.kind === 'p5' || f.kind === 'three' ? instrument(raw) : { code: raw, sig: raw, values: {} };
    const code = inst.code;
    if (f.kind === 'player') { this.refreshPlayer(f, b); return; }
    if (f.kind === 'playlist') { this.refreshPlaylist(f, b); return; }
    if (f.kind === 'stopmotion') { this.refreshStopmotion(f, b); return; }
    if (f.kind === 'code') { this.refreshCode(f, b); return; }
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
      this.app.outputs?.run(b.id, false, f.token);
      if (f.running) { this.snap(f); const old = f.iframe; setTimeout(() => old?.remove(), 400); f.iframe = null; f.running = false; }
      if (!f.still) {
        f.still = document.createElement('div');
        f.still.className = 'wb-bframe-still';
        f.el.append(f.still);
      }
      const shot = this.snapshots.get(b.id);
      f.still.innerHTML = shot ? `<img src="${shot}" alt="">` : `<span>${f.kind === 'three' ? 'three.js' : 'p5'} · paused</span>`;
      return;
    }
    f.still?.remove(); f.still = null;
    this.app.outputs?.run(b.id, true, f.token);
    // p5.js goes into the frame itself: a sandboxed frame has no origin to fetch it from.
    if (f.kind === 'p5' && !this.p5Source) {
      if (!this.p5Loading) this.p5Loading = loadP5().then(t => { this.p5Source = t; this.canvas.invalidate(); return t; }).catch(err => this.app.log(`p5.js did not load: ${err.message}`, 'error'));
      return;
    }
    // three.js: find and read the modules the sketch imports (once for each version of the code).
    if (f.kind === 'three') {
      if (f.threeFor !== inst.sig) {
        const mine = f.threeFor = inst.sig; f.threeMods = null;
        collectThree(code, loadThreeFile).then(m => { if (f.threeFor === mine) { f.threeMods = m; this.canvas.invalidate(); } })
          .catch(err => { if (f.threeFor === inst.sig) { this.app.log(`Board “${b.title}”: ${err.message}`, 'error'); } });
      }
      if (!f.threeMods) return;
    }
    // The files it loads by name, from the sources (read once, kept as data URLs).
    const wanted = f.kind === 'p5' || f.kind === 'three' ? filesOf(code, f.kind) : [];
    this.loadFiles(wanted.filter(n => !(n in this.files)));
    if (wanted.some(n => this.files[n] === undefined)) return;   // still reading: the sketch starts when they are here
    const files = Object.fromEntries(wanted.filter(n => this.files[n]).map(n => [n, this.files[n]]));
    if (!f.running || f.code !== inst.sig || f.size !== `${b.width}x${b.height}`) {
      f.code = inst.sig; f.vals = { ...inst.values }; f.size = `${b.width}x${b.height}`; f.running = true; f.errors = [];
      f.iframe?.remove();
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.setAttribute('credentialless', '');
      iframe.title = b.title;
      f.perf = Boolean(this.app.perfWanted?.(b));
      iframe.srcdoc = frameDoc(f.kind, code, f.token, b, this.p5Source, files, f.perf, f.threeMods, this.seeds.get(b.id) ?? null, f.vals, f.scaleSent = this.pixelRatioFor());
      f.iframe = iframe;
      iframe.addEventListener('load', () => { this.sendPipe(f); this.sendForward(f); });   // (an output may be waiting for it)
      f.el.append(iframe);
      this.app.outputs?.reload(b.id, iframe.srcdoc);   // (a window showing it starts again with it)
    }
    else this.ctl(b.id, raw);   // the same sketch, other values
    // Its performance shown or not: the sketch times its draw() only while it is.
    const perf = Boolean(this.app.perfWanted?.(b));
    if (f.iframe && f.perf !== perf) { f.perf = perf; f.iframe.contentWindow?.postMessage({ amsFrame: f.token, type: 'perf', on: perf }, '*'); if (!perf) this.perf.delete(b.id); }
  }

  /**
   * The control panel of a sketch on its own board: for a sketch with `// @panel open` (the panel shows) or `// @panel hidden` (the gear
   * comes up when the pointer is near). What is changed in it is written into the board's code, like the code panel's sliders. Not while
   * performing: Perform has its own.
   */
  syncPanel(f, b, raw) {
    const mode = panelOf(raw);
    const specs = mode === 'open' || mode === 'hidden' ? controlSpecs(raw) : [];
    const want = specs.length > 0 && !this.app.performing;
    const sig = want ? `${mode}|${JSON.stringify(specs)}` : '';
    if (f.panelSig === sig) return;
    f.panelSig = sig;
    const wasOpen = f.panel?.isOpen?.();
    f.panel?.destroy(); f.panel = null;
    if (!want) return;
    f.panel = mountPanel(specs, raw, (name, value) => this.setControl(f, name, value), { id: `ams-ui-${b.id}`, container: f.el, code: false, keys: false, start: (wasOpen === undefined ? mode : wasOpen ? 'open' : 'hidden') === 'hidden' ? 'hidden' : undefined });
  }

  /** A control of a sketch's own panel changed: its code says so, and the sketch (and its window) follow at once. */
  setControl(f, name, value) {
    const cur = boardById(this.app.store.doc, f.id);
    if (!cur) return;
    const code = rewriteControl(cur.code || '', name, value);
    if (code === cur.code) return;
    this.app.store.updateBoard(f.id, { code });
    this.ctl(f.id, code);
    f.panelSig = `${panelOf(code)}|${JSON.stringify(controlSpecs(code))}`;   // (its own change: the panel stays as it is)
  }

  /**
   * A code board: an editor on the code of another board (`b.of`), for teaching: what is written here is that board's code (and a
   * sketch changes as you type), and what changes that board's code from elsewhere (a slider, the Code panel) shows here.
   */
  refreshCode(f, b) {
    const target = b.of ? boardById(this.app.store.doc, b.of) : null;
    const tk = target ? boardKind(target) : null;
    const lang = { three: 'three', p5: 'p5', html: 'html', markdown: 'markdown', drawing: 'ams' }[tk] || 'p5';
    f.of = b.of;
    f.el.classList.toggle('interactive', (this.app.activeBoard || MAIN) === b.id);
    const code = target?.code || '';
    if (!f.editor) {
      f.el.classList.add('wb-code-board');
      const head = document.createElement('div'); head.className = 'wb-cb-head';
      f.name = document.createElement('span'); f.name.className = 'wb-cb-name';
      const mk = (glyph, title, fn) => { const x = document.createElement('button'); x.className = 'wb-icon-btn'; x.title = title; x.innerHTML = icon(glyph); x.addEventListener('click', fn); return x; };
      head.append(f.name, document.createElement('span'), mk('format', 'Format the code (Alt+Shift+F)', () => f.editor.format()), mk('play', 'Run: start the sketch again (Cmd+Enter)', () => this.restart(f.of)));
      head.children[1].style.flex = '1';
      const host = document.createElement('div'); host.className = 'wb-cb-host';
      f.el.append(head, host);
      f.editor = createCodeEditor(host, {
        value: code, language: lang,
        onRun: () => this.restart(f.of), onNotice: note => this.app.log?.(note),
        onChange: () => {
          if (f.loading) return;
          f.dirty = true;
          if (['p5', 'three'].includes(f.tk)) this.ctl(f.of, f.editor.value);   // (a control moved: the sketch follows at once)
          clearTimeout(f.timer);
          f.timer = setTimeout(() => this.pushCode(f), 300);
        }
      });
      f.lang = lang; f.lastCode = code;
      // The code starts at its panel line (a sketch's controls are below its setup): what a lesson is about is the first thing seen.
      const at = /^[ \t]*\/\/[ \t]*@panel\b/m.exec(code);
      if (at) requestAnimationFrame(() => requestAnimationFrame(() => { try { f.editor?.scrollToLine(code.slice(0, at.index).split('\n').length); } catch { /* gone */ } }));
    }
    f.tk = tk;
    f.title = target ? `${target.title} · ${lang === 'ams' ? 'studio code' : lang === 'three' ? 'three.js' : lang === 'p5' ? 'p5.js' : lang}` : 'No board to show';
    if (f.name && !f.hasError) f.name.textContent = f.title;
    if (f.lang !== lang) { f.lang = lang; f.editor.setLanguage(lang); }
    // What the board's code is now, when it was changed somewhere else (not while this editor is being used).
    if (target && !f.dirty && f.editor.value !== code && !f.editor.view.hasFocus) { f.loading = true; f.editor.value = code; f.loading = false; f.lastCode = code; }
  }

  /** The code board's text goes to the board it is on. */
  pushCode(f) {
    const t = f.of ? boardById(this.app.store.doc, f.of) : null;
    f.dirty = false;
    if (!t || (t.code || '') === f.editor.value) {
      // Back to the code that is stored (a mistake was undone): it ran, so the message goes.
      if (f.hasError) { f.hasError = false; f.name?.classList.remove('error'); if (f.name) f.name.textContent = f.title; }
      return;
    }
    const code = f.editor.value;
    if (boardKind(t) === 'drawing') {
      // Studio code draws marks: run it (an error is said in the header until the code runs again).
      const res = this.app.store.runBoardCode(t.id, code, this.app.runScript || runScript);
      if (f.name) { f.hasError = Boolean(res?.error); f.name.classList.toggle('error', f.hasError); f.name.textContent = f.hasError ? (res.line ? `Line ${res.line}: ${res.error}` : res.error) : f.title; }
      return;
    }
    this.app.store.updateBoard(t.id, { code });
  }

  /** A playlist board: its list and controls; every edit writes the board's code. */
  refreshPlaylist(f, b) {
    const P = this.app.playlists, doc = this.app.store.doc, { pl, error } = P.spec(b), s = P.st(b.id);
    const targets = boardsOf(doc).filter(x => x.id !== b.id && x.kind !== 'playlist' && x.kind !== 'frame' && !x.main).map(x => x.title);
    const sig = JSON.stringify([b.code, s.index, s.playing, s.error || error, targets, [...P.titles.entries()]]);
    if (f.sig === sig) return;
    f.sig = sig;
    const g = d => `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">${d}</svg>`;
    const icons = { play: g('<path d="M8 5l11 7-11 7z"/>'), pause: g('<path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/>'), prev: g('<path d="M17 5v14l-9-7zM6 5h2v14H6z"/>'), next: g('<path d="M7 5v14l9-7zM16 5h2v14h-2z"/>'), loop: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3l3 3-3 3M4 11V9a3 3 0 013-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 01-3 3H4"/></svg>` };
    const kindMark = { stream: 'stream', asset: 'asset', url: 'url', source: 'source', board: 'board' };
    const range = it => (it.start != null || it.end != null ? `${it.start ?? 0}–${it.end ?? ''}s` : '') + (it.for != null ? ` ${it.for}s` : '');
    const rows = (pl?.items || []).map((it, i) => `<div class="pl-item${i === s.index ? ' on' : ''}" data-i="${i}">
      <button data-a="go" title="Play this one">${i === s.index && s.playing ? icons.pause : icons.play}</button>
      <span class="t" title="${esc(it.ref)}">${esc(P.titleOf(it))}</span><span class="k">${kindMark[it.kind]}</span><span class="r">${esc(range(it))}</span>
      <button data-a="up" title="Earlier">↑</button><button data-a="down" title="Later">↓</button><button data-a="rm" title="Remove">✕</button></div>`).join('');
    f.el.innerHTML = `<div class="wb-playlist">
      <div class="pl-bar">
        <button data-a="prev" title="Previous">${icons.prev}</button><button data-a="toggle" title="Play / pause">${s.playing ? icons.pause : icons.play}</button><button data-a="next" title="Next">${icons.next}</button>
        <button data-a="loop" class="${pl?.loop === false ? '' : 'on'}" title="Loop the list">${icons.loop}</button><button data-a="add" title="Add to the playlist: a board, a source, a stream, a clip, an address">${g('<path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" fill="none"/>')}</button>
        <span class="pl-out" title="Where it plays: the board that shows each item (read it from other boards by making it a source)">→</span>
        <select data-a="target" title="Target board">${['', ...targets].map(t => `<option value="${esc(t)}"${t === (pl?.target ?? '') ? ' selected' : ''}>${t ? esc(t) : '(a board)'}</option>`).join('')}</select>
      </div>
      <div class="pl-list">${rows || '<div class="pl-empty">—</div>'}</div>
      ${s.error || error ? `<div class="pl-err">${esc(s.error || error)}</div>` : ''}
    </div>`;
    if (f.wired) return;
    f.wired = true;
    f.el.addEventListener('click', e => {
      const btn = e.target.closest('button'); if (!btn) return;
      const a = btn.dataset.a, i = Number(btn.closest('.pl-item')?.dataset.i);
      if (a === 'go') P.play(b.id, i);
      else if (a === 'prev') P.next(b.id, -1);
      else if (a === 'next') P.next(b.id, 1);
      else if (a === 'toggle') P.toggle(b.id);
      else if (a === 'loop') P.edit(b.id, p => { p.loop = p.loop === false; });
      else if (a === 'add') { const r = btn.getBoundingClientRect(); this.app.playlistAddMenu(b.id, r.left, r.bottom); }
      else if (a === 'up') P.edit(b.id, p => { if (i > 0) [p.items[i - 1], p.items[i]] = [p.items[i], p.items[i - 1]]; });
      else if (a === 'down') P.edit(b.id, p => { if (i < p.items.length - 1) [p.items[i + 1], p.items[i]] = [p.items[i], p.items[i + 1]]; });
      else if (a === 'rm') P.edit(b.id, p => { p.items.splice(i, 1); });
    });
    f.el.addEventListener('change', e => { if (e.target.dataset.a === 'target') P.edit(b.id, p => { p.target = e.target.value; }); });
  }


  /** A stop-motion board: the live source with the last shot over it, a shutter, the frames; every control writes the board's code. */
  refreshStopmotion(f, b) {
    const SM = this.app.stopmotion, { sm, error } = SM.spec(b), s = SM.state(b.id);
    const doc = this.app.store.doc, src = sm && SM.sourceOf(sm);
    const g = d => `<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true">${d}</svg>`;
    if (!f.built) {
      f.built = true;
      const ic = { shoot: g('<circle cx="12" cy="12" r="6.5"/>'), first: g('<path d="M6 5h2v14H6zM18 5v14l-9-7z"/>'), prev: g('<path d="M17 5v14l-9-7z"/>'), next: g('<path d="M7 5v14l9-7z"/>'), live: g('<path d="M7 5v14l9-7zM17 5h2v14h-2z"/>'),
        play: g('<path d="M8 5l11 7-11 7z"/>'), stop: g('<path d="M7 6h10v12H7z"/>'), del: g('<path d="M6 7h12M9 7V5h6v2M8 7l1 12h6l1-12"/>').replace('fill="currentColor"', 'fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"'),
        onion: g('<circle cx="9.5" cy="12" r="5.5" fill-opacity=".9"/><circle cx="14.5" cy="12" r="5.5" fill-opacity=".45"/>'), loop: g('<path d="M17 3l3 3-3 3M4 11V9a3 3 0 013-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 01-3 3H4"/>').replace('fill="currentColor"', 'fill="none" stroke="currentColor" stroke-width="1.8"'),
        save: g('<path d="M5 4h11l3 3v13H5z"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>').replace('fill="currentColor"', 'fill="none" stroke="currentColor" stroke-width="1.8"'),
        srcplay: g('<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M10 8.5l6 3.5-6 3.5z"/>'),
        rec: g('<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="4.2"/>'), stopRec: g('<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M9 9h6v6H9z"/>'),
        mIn: g('<path d="M15 5H9v14h6M9 12h10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'), mOut: g('<path d="M9 5h6v14H9M15 12H5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>'),
        trim: g('<path d="M6 4v16M18 4v16M6 12h12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M9 9l-3 3 3 3M15 9l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>'), clear: g('<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>') };
      f.icons = ic;
      f.el.innerHTML = `<div class="wb-sm">
        <div class="sm-view"><canvas></canvas><span class="sm-badge"></span><span class="sm-err"></span></div>
        <div class="sm-bar">
          <button data-a="shoot" class="shoot" title="Take a frame (Alt+Enter, from any board it photographs)">${ic.shoot}</button>
          <button data-a="rec" class="rec" title="Record: arm it, then press play on the source; it starts when the source moves and stops when you press this again (Alt+R)">${ic.rec}</button>
          <select data-a="recmode" title="What recording keeps: a frame every 1/fps, or only the frames where the source changed (at most fps a second; it ends when nothing moves for two seconds)"><option value="rate">at fps</option><option value="change">on change</option></select>
          <label title="How much of the picture has to change (percent) for a recording to start, and for a frame to count as new in “on change”">Δ <input data-a="change" type="number" min="0.1" max="100" step="0.1"></label>
          <button data-a="first" title="First frame">${ic.first}</button><button data-a="prev" title="Back a frame (Alt+Shift+←)">${ic.prev}</button>
          <button data-a="next" title="Forward a frame (Alt+Shift+→)">${ic.next}</button><button data-a="live" title="Back to the live view">${ic.live}</button>
          <button data-a="play" title="Play the frames at the fps (and stop)">${ic.play}</button>
          <button data-a="del" title="Remove the frame shown (the last one when live: Alt+Backspace)">${ic.del}</button>
          <button data-a="onion" title="The last frame faintly over the live view (onion skin)">${ic.onion}</button>
          <button data-a="loop" title="Loop when playing">${ic.loop}</button>
          <label title="Frames a second, in playback and in the film">fps <input data-a="fps" type="number" min="1" max="60"></label>
          <label title="Exposures for each shot: 2 is on twos">hold <input data-a="hold" type="number" min="1" max="12"></label>
          <select data-a="source" title="The board it photographs"></select>
          <button data-a="srcplay" title="Play or pause the source board (a sketch keeps running while this board shows it, wherever it is on the canvas)">${ic.srcplay}</button>
          <button data-a="save" title="Keep the film: in Assets or as a file, as WebM, MP4 or GIF">${ic.save}</button>
        </div>
        <div class="sm-tl">
          <button data-a="in" title="Start the film here: the frame shown (Alt+I)">${ic.mIn}</button><button data-a="out" title="End the film here: the frame shown (Alt+O)">${ic.mOut}</button>
          <div class="sm-rail" title="Scrub the frames; drag the ends of the range to set where the film starts and ends"><div class="sm-span"></div><div class="sm-knob"></div><div class="sm-h sm-hin" data-h="in"></div><div class="sm-h sm-hout" data-h="out"></div></div>
          <button data-a="trim" title="Trim: keep only the frames in the range (the pictures stay in Assets; Cmd+Z brings the list back)">${ic.trim}</button><button data-a="range" title="Use all the frames again (clear the range)">${ic.clear}</button>
        </div>
        <div class="sm-strip"></div>
      </div>`;
      f.sm = { view: f.el.querySelector('canvas'), badge: f.el.querySelector('.sm-badge'), err: f.el.querySelector('.sm-err'), strip: f.el.querySelector('.sm-strip'), bar: f.el.querySelector('.sm-bar'), rail: f.el.querySelector('.sm-rail') };
      // the timeline: press on the rail to scrub; drag the end markers to set the range (pointer events on the window, so the drag follows the pointer out of the rail)
      f.sm.rail.addEventListener('pointerdown', e => {
        const cur = boardById(this.app.store.doc, b.id), spec = cur && SM.spec(cur).sm; if (!spec?.frames.length) return;
        e.preventDefault(); e.stopPropagation();
        const handle = e.target.closest?.('.sm-h')?.dataset.h || '', rail = f.sm.rail;
        const at = ev => { const r = rail.getBoundingClientRect(), n = spec.frames.length; return Math.max(0, Math.min(n - 1, Math.round(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)) * (n - 1)))); };
        const apply = ev => { if (handle) SM.mark(b.id, handle, at(ev)); else { SM.stop(b.id, false); SM.go(b.id, at(ev)); } };
        apply(e);
        const move = ev => apply(ev), up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
        addEventListener('pointermove', move); addEventListener('pointerup', up);
      });
      f.el.addEventListener('click', e => {
        const t = e.target.closest('button,.sm-th'); if (!t) return;
        const cur = boardById(this.app.store.doc, b.id), now = cur && SM.spec(cur).sm;
        if (t.classList.contains('sm-th')) { SM.stop(b.id, false); SM.go(b.id, Number(t.dataset.i)); return; }
        const a = t.dataset.a;
        if (a === 'shoot') SM.shoot(b.id);
        else if (a === 'first') { SM.stop(b.id, false); SM.go(b.id, 0); }
        else if (a === 'prev') { SM.stop(b.id, false); SM.step(b.id, -1); }
        else if (a === 'next') { SM.stop(b.id, false); SM.step(b.id, 1); }
        else if (a === 'live') { SM.stop(b.id, false); SM.go(b.id, null); }
        else if (a === 'play') SM.toggle(b.id);
        else if (a === 'del') SM.remove(b.id);
        else if (a === 'onion') SM.edit(b.id, m => { m.onion = m.onion > 0 ? 0 : 0.35; });
        else if (a === 'loop') SM.edit(b.id, m => { m.loop = !m.loop; });
        else if (a === 'save') { const r = t.getBoundingClientRect(); this.app.stopmotionSaveMenu(b.id, r.left, r.bottom); }
        else if (a === 'rec') SM.record(b.id);
        else if (a === 'srcplay') { const src = now && SM.sourceOf(now); if (src) this.app.toggleBoardRun(src.id); }
        else if (a === 'in' || a === 'out') SM.mark(b.id, a);
        else if (a === 'trim') SM.trim(b.id);
        else if (a === 'range') SM.clearRange(b.id);
        void now;
      });
      f.el.addEventListener('change', e => {
        const a = e.target.dataset.a;
        if (a === 'fps') SM.edit(b.id, m => { m.fps = Math.min(60, Math.max(1, Number(e.target.value) || 8)); });
        else if (a === 'hold') SM.edit(b.id, m => { m.hold = Math.min(12, Math.max(1, Math.round(Number(e.target.value)) || 1)); });
        else if (a === 'source') SM.edit(b.id, m => { m.source = e.target.value; });
        else if (a === 'recmode') SM.edit(b.id, m => { m.record = e.target.value === 'change' ? 'change' : 'rate'; });
        else if (a === 'change') SM.edit(b.id, m => { m.change = Math.min(100, Math.max(0.1, Number(e.target.value) || 1)); });
      });
      f.el.addEventListener('keydown', e => e.stopPropagation());   // typing in its fields is not a studio shortcut
      // the live view: the source's picture a few times a second while this board is shown and not playing
      f.liveTimer = setInterval(async () => {
        const st = SM.state(b.id);
        if (!f.el.isConnected || Number(f.el.style.opacity) < 0.05) return;
        const cur = boardById(this.app.store.doc, b.id), spec = cur && SM.spec(cur).sm, src = spec && SM.sourceOf(spec);
        const sketch = src && (src.kind === 'p5' || src.kind === 'three');
        // A sketch is watched where it runs, frame by frame, and kept running off screen while this board shows it (Outputs.wants).
        if (sketch) {
          st.watch = { src: src.id, at: performance.now() };
          if (f.smTapSrc !== src.id || !f.smTap || !this.frames.get(src.id)?.iframe) {
            f.smTap?.(); f.smTap = null; f.smTapSrc = src.id; st.tapView = false;
            if (!this.frames.get(src.id)?.iframe && this.app.isBoardLive(src.id)) this.canvas.invalidate();     // (it is mounted off screen once it is wanted)
            else f.smTap = this.tap(src.id, bmp => {
              const c = (st.tapCanvas ||= document.createElement('canvas'));
              if (c.width !== bmp.width || c.height !== bmp.height) { c.width = bmp.width; c.height = bmp.height; }
              c.getContext('2d').drawImage(bmp, 0, 0);
              st.live = c; st.tapView = true;
              if (st.at == null && !st.playing && !f.smDraw) f.smDraw = requestAnimationFrame(() => { f.smDraw = 0; this.drawStopmotion(f, b.id); });
            });
          }
          if (f.smTap) return;
        } else if (f.smTap) { f.smTap(); f.smTap = null; f.smTapSrc = null; st.tapView = false; st.watch = null; }
        if (st.playing || st.busy || st.rec || st.saving || st.at != null) return;
        await SM.look(b.id).catch(() => null);
        this.drawStopmotion(f, b.id);
      }, 300);
    }
    // the controls show the spec
    const bar = f.sm.bar, set = (a, v) => { const el = bar.querySelector(`[data-a="${a}"]`); if (el && document.activeElement !== el) el.value = v; };
    if (sm) { set('fps', sm.fps); set('hold', sm.hold); set('change', sm.change); set('recmode', sm.record); }
    const recBtn = bar.querySelector('[data-a="rec"]');
    if (recBtn) { recBtn.innerHTML = s.rec ? f.icons.stopRec : f.icons.rec; recBtn.classList.toggle('armed', s.rec?.phase === 'armed'); recBtn.classList.toggle('going', s.rec?.phase === 'recording'); }
    // the timeline: the range, the frame shown
    if (f.sm.rail) {
      const n = sm?.frames.length || 0, [lo, hi] = sm ? rangeOf(sm) : [0, -1], pos = i => (n > 1 ? (i / (n - 1)) * 100 : 0);
      const rail = f.sm.rail, q = c => rail.querySelector(c);
      rail.classList.toggle('empty', n < 1);
      q('.sm-span').style.left = `${pos(lo)}%`; q('.sm-span').style.width = `${Math.max(0, pos(hi) - pos(lo))}%`;
      q('.sm-hin').style.left = `${pos(lo)}%`; q('.sm-hout').style.left = `${pos(hi)}%`;
      const knob = q('.sm-knob'); knob.style.display = s.at == null || !n ? 'none' : ''; knob.style.left = `${pos(s.at ?? 0)}%`;
    }
    const sel = bar.querySelector('[data-a="source"]');
    const cands = boardsOf(doc).filter(x => x.id !== b.id && x.kind !== 'frame' && x.kind !== 'stopmotion' && x.kind !== 'playlist' && x.kind !== 'code');
    const sig = JSON.stringify([cands.map(x => [x.id, x.title]), src?.id]);
    if (sel && f.smSel !== sig) { f.smSel = sig; sel.innerHTML = [['', '(a board)'], ...cands.map(x => [x.id, x.title])].map(([v, n]) => `<option value="${esc(v)}"${v === (src?.id ?? '') ? ' selected' : ''}>${esc(n)}</option>`).join(''); }
    bar.querySelector('[data-a="onion"]')?.classList.toggle('on', Boolean(sm && sm.onion > 0));
    bar.querySelector('[data-a="loop"]')?.classList.toggle('on', Boolean(sm?.loop));
    const play = bar.querySelector('[data-a="play"]'); if (play) play.innerHTML = s.playing ? f.icons.stop : f.icons.play;
    f.sm.err.textContent = error || '';
    // the strip of frames (rebuilt when the list changes)
    const key = JSON.stringify(sm?.frames || []);   // (the strip is rebuilt only when the list changes; the range only dims the thumbnails)
    if (f.smFrames !== key) {
      f.smFrames = key;
      f.sm.strip.innerHTML = (sm?.frames || []).map((a, i) => `<img class="sm-th" data-i="${i}" alt="" draggable="false">`).join('');
      (sm?.frames || []).forEach((a, i) => SM.url(b.id, a).then(u => { const im = f.sm.strip.children[i]; if (im && u) im.src = u; }));
      if (sm?.frames.length) f.sm.strip.scrollLeft = f.sm.strip.scrollWidth;
    }
    const [rlo, rhi] = sm ? rangeOf(sm) : [0, -1];
    [...f.sm.strip.children].forEach((im, i) => { im.classList.toggle('on', i === (s.at ?? -1)); im.classList.toggle('cut', i < rlo || i > rhi); });
    this.drawStopmotion(f, b.id);
  }

  /** The stop-motion view: the frame shown, or the live source with the last frame over it. */
  async drawStopmotion(f, id) {
    const SM = this.app.stopmotion, b = boardById(this.app.store.doc, id); if (!b || !f.sm) return;
    const { sm } = SM.spec(b), s = SM.state(id);
    const c = f.sm.view, r = c.getBoundingClientRect(), W = Math.max(2, Math.round((c.clientWidth || r.width) * 2)), H = Math.max(2, Math.round((c.clientHeight || r.height) * 2));
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const g = c.getContext('2d');
    g.fillStyle = '#101010'; g.fillRect(0, 0, W, H);
    const fit = (img, alpha = 1) => {
      const w = img.width, h = img.height, k = Math.min(W / w, H / h);
      g.globalAlpha = alpha; g.drawImage(img, (W - w * k) / 2, (H - h * k) / 2, w * k, h * k); g.globalAlpha = 1;
    };
    const frames = sm?.frames || [];
    const [rlo, rhi] = sm ? rangeOf(sm) : [0, -1], inRange = Math.max(0, rhi - rlo + 1);
    let label = '';
    if (s.rec || s.saving) {
      if (s.live) fit(s.live);
      label = s.saving ? 'saving the recording…' : s.rec.phase === 'armed' ? '● armed · waiting for the source to move' : `● rec · ${s.rec.count} frame${s.rec.count === 1 ? '' : 's'}`;
    } else if (s.at != null && frames[s.at]) {
      const img = await SM.image(id, frames[s.at]); if (img) fit(img);
      label = `${s.at + 1} / ${frames.length}`;
    } else {
      if (s.live) fit(s.live);
      const last = frames[frames.length - 1];
      if (last && sm.onion > 0) { const img = await SM.image(id, last); if (img && s.live) fit(img, sm.onion); }
      label = `live · ${frames.length} frame${frames.length === 1 ? '' : 's'}`;
    }
    if (f.sm.badge) f.sm.badge.textContent = `${label} · ${(inRange / (sm?.fps || 8)).toFixed(1)} s${inRange < frames.length ? ` (of ${(frames.length / (sm?.fps || 8)).toFixed(1)})` : ''}`;
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

  /** What a running sketch shows now, as a data URL (null when it is not running or says nothing in a second). */
  snapshotNow(id) {
    const f = this.frames.get(id);
    if (!f?.iframe || !f.running) return Promise.resolve(null);
    return new Promise(ok => {
      const w = (this.shotWaiters ||= new Map()), list = w.get(id) || [];
      list.push(ok); w.set(id, list);
      this.snap(f);
      setTimeout(() => { const l = w.get(id); if (l?.includes(ok)) { l.splice(l.indexOf(ok), 1); ok(null); } }, 1000);
    });
  }

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
    if (d.type === 'input') { this.app.outputs?.forward(id, d.ev, d.amsFrame); return; }
    // A key the studio keeps for itself, pressed while the sketch had the focus: the studio gets it too.
    if (d.type === 'present?') { try { e.source?.postMessage({ amsFrame: d.amsFrame, type: 'present', on: Boolean(this.app.presenting) }, '*'); } catch { /* gone */ } return; }
    if (d.type === 'hotkey' && d.ev) { document.body.dispatchEvent(new KeyboardEvent('keydown', { ...d.ev, bubbles: true, cancelable: true })); return; }
    if (d.type === 'pipe') {
      const cb = this.pipes?.get(id), taps = this.taps?.get(id);
      if (taps?.size && d.bitmap) for (const t of taps) { try { t(d.bitmap); } catch { /* a tap's own error */ } }
      if (cb && d.bitmap) cb(d.bitmap); else d.bitmap?.close?.();
      return;
    }
    if (d.type === 'snapshot') { if (d.url) { this.snapshots.set(id, d.url); if (f?.still) f.still.innerHTML = `<img src="${d.url}" alt="">`; } for (const w of this.shotWaiters?.get(id) || []) w(d.url || null); this.shotWaiters?.delete(id); return; }
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
