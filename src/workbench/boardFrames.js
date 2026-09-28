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
// p5.js for sketches, bundled with the studio (no network needed; the package does not export the file by name).
import p5Url from '../../node_modules/p5/lib/p5.min.js?url';
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

/** The page a frame runs: the bridge, then (for p5) p5.js, then the board's code. */
function frameDoc(kind, code, token, board, p5Source = '') {
  const bridge = `(() => {
  const token = ${JSON.stringify(token)}, pending = new Map(); let seq = 0;
  const ask = (type, data, transfer) => new Promise((ok, fail) => { const id = ++seq; pending.set(id, { ok, fail }); parent.postMessage({ amsFrame: token, type, id, ...data }, '*'); });
  addEventListener('message', e => {
    const d = e.data; if (!d || d.amsFrame !== token) return;
    if (d.type === 'reply') { const p = pending.get(d.id); if (p) { pending.delete(d.id); d.error ? p.fail(new Error(d.error)) : p.ok(d.result); } }
    if (d.type === 'snapshot') { const c = document.querySelector('canvas'); parent.postMessage({ amsFrame: token, type: 'snapshot', url: c ? c.toDataURL('image/png') : null }, '*'); }
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
  const style = `html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent}canvas{display:block}`;
  const body = kind === 'p5'
    ? `<script>${bridge}</script><script>${p5Source.replace(/<\/script/gi, '<\\/script')}</script><script>${code.replace(/<\/script/gi, '<\\/script')}</script>`
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
    this.tokens = new Map();      // a frame's token → its board id (kept a moment after it goes, for its last picture)
    window.addEventListener('message', e => this.onMessage(e));
  }

  /** Called after each canvas redraw (the camera may have moved) and when the drawing changes. */
  update() {
    const doc = this.canvas.previewDoc || this.app.store.doc, z = this.canvas.cam.z, seen = new Set();
    // Titles changed (a board added, renamed, removed): links in documents mean something else now.
    const sig = boardsOf(doc).map(b => b.title).join('\u0001');
    if (sig !== this.titles) { this.titles = sig; this.relink(); }
    for (const b of boardsOf(doc)) {
      const kind = boardKind(b);
      if (kind === 'drawing' || !this.canvas.boardOnScreen(b, 0.05)) continue;
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
      if (!this.p5Loading) this.p5Loading = fetch(p5Url).then(r => r.text()).then(t => { this.p5Source = t; this.canvas.invalidate(); }).catch(err => this.app.log(`p5.js did not load: ${err.message}`, 'error'));
      return;
    }
    if (!f.running || f.code !== code || f.size !== `${b.width}x${b.height}`) {
      f.code = code; f.size = `${b.width}x${b.height}`; f.running = true; f.errors = [];
      f.iframe?.remove();
      const iframe = document.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.setAttribute('credentialless', '');
      iframe.title = b.title;
      iframe.srcdoc = frameDoc(f.kind, code, f.token, b, this.p5Source);
      f.iframe = iframe;
      f.el.append(iframe);
    }
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
