/**
 * The host side of the embedded editor: the `ams-editor-v1` message protocol (docs/EMBEDDING.md).
 * Every message is { channel, type, id?, … }. Requests carry an id and get one `result` or `error` back; the editor
 * also sends `ready`, `change`, `selection` and `tool` on its own. Messages are accepted only from the parent window
 * and only from the host's origin (the `origin` URL parameter, else this page's own).
 */
import { fromExcalidraw, toExcalidraw, toSVG } from '../process/exports.js';
import { boardDoc, boardsOf, MAIN } from '../process/boards.js';
import { normalizeDocument } from '../process/document.js';

export const CHANNEL = 'ams-editor-v1';
export const PROTOCOL = 1;

export function startBridge(app, { origin = location.origin } = {}) {
  const post = (msg, transfer) => window.parent.postMessage({ channel: CHANNEL, ...msg }, origin === 'null' ? '*' : origin, transfer);
  const boardOf = ref => { const bs = boardsOf(app.store.doc); return bs.find(b => b.id === ref || b.title === ref) || bs.find(b => b.id === MAIN); };
  let rev = 0;
  const declared = new Map();   // the host's boards: they come back after every load, so a loaded drawing never loses them

  // The host's own declared boards (Genereti's Image and Mask, say): they exist, with their size and paper.
  const declare = list => {
    for (const d of list || []) declared.set(d.id, { ...declared.get(d.id), ...d });
    for (const d of declared.values()) {
      const have = boardsOf(app.store.doc).find(b => b.id === d.id);
      const patch = Object.fromEntries(['title', 'width', 'height', 'ground', 'hideLabel', 'hideBorder', 'locked'].filter(k => d[k] !== undefined).map(k => [k, d[k]]));
      if (have) app.store.updateBoard(d.id, patch);
      else app.store.addBoard({ id: d.id, ...patch, x: d.x, y: d.y, adopt: false });
    }
  };
  const theme = t => {
    const want = t === 'auto' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : t;
    if (want && document.documentElement.dataset.theme !== want) { document.documentElement.dataset.theme = want; app.canvas.invalidate(); app.renderChrome(); }
  };
  /**
   * Overlay: the editor as a transparent layer over the host's own canvas (a circuit, a diagram): no workspace
   * background, no grid, and boards that draw nothing, so only the marks show. The host keeps the two cameras
   * together with `camera` (and the `camera` event), which share one convention: screen = world × zoom + offset.
   */
  const overlay = on => {
    if (!on) return;
    app.setBackground('transparent');
    app.canvas.setGrid({ show: 'off' });
    app.setUI({ view: false, panels: false, zoom: false });
    for (const [id, d] of declared) declared.set(id, { ...d, ground: 'transparent', hideBorder: true, hideLabel: true });
    declare();
  };
  let applying = false;
  const setCamera = ({ x, y, z }) => {
    const c = app.canvas;
    if (![x, y, z].every(Number.isFinite)) return;
    applying = true;
    c.cam = { x, y, z };
    c.invalidate();
    applying = false;
  };
  const configure = cfg => {
    if (cfg.ui) app.setUI(cfg.ui);
    if (cfg.theme) theme(cfg.theme);
    if (cfg.background) app.setBackground(cfg.background);
    if (cfg.accent) app.setAccent?.(cfg.accent);
    if (cfg.document) app.loadDocument(cfg.document, 'host');
    declare(cfg.boards);
    overlay(cfg.overlay);
    if (cfg.camera) setCamera(cfg.camera);
    if (cfg.fit) requestAnimationFrame(() => app.canvas.fit(cfg.fitPadding ?? 40, boardOf(cfg.fit === true ? null : cfg.fit)?.id));
  };

  const toBlob = (canvas, type = 'image/png') => new Promise(r => canvas.toBlob(r, type));
  const exportBoard = async ({ board, format = 'png', scale = 1, transparent = false, mode = 'picture' }) => {
    const b = boardOf(board);
    if (format === 'png') {
      let out;
      if (transparent) {   // the marks alone, no paper
        const part = boardDoc(app.store.doc, b.id);
        part.artboard = { ...part.artboard, ground: 'transparent' };
        out = app.boardPicture(b, scale, mode, part);
      } else out = app.boardPicture(b, scale, mode);
      return { format, board: b.id, width: out.width, height: out.height, blob: await toBlob(out) };
    }
    const part = boardDoc(app.store.doc, b.id);
    if (format === 'svg') return { format, board: b.id, text: toSVG(part, { mode }) };
    if (format === 'json') return { format, board: b.id, document: structuredClone(part) };
    if (format === 'excalidraw') return { format, board: b.id, scene: toExcalidraw(part) };
    throw new Error(`Unknown export format ${format}`);
  };

  const handlers = {
    init: cfg => { configure(cfg || {}); return { protocol: PROTOCOL, boards: boardsOf(app.store.doc).map(b => ({ id: b.id, title: b.title, width: b.width, height: b.height })) }; },
    load: ({ document: doc, boards, fit }) => { app.loadDocument(normalizeDocument(doc), 'host'); declare(boards); if (fit) configure({ fit }); return { rev }; },
    loadExcalidraw: ({ scene }) => { app.loadDocument(fromExcalidraw(scene), 'host'); declare(); return { rev }; },
    'get-document': () => ({ rev, document: structuredClone(app.store.doc) }),
    export: exportBoard,
    call: ({ name, args }) => window.ams.callTool(name, args || {}),
    'list-tools': () => window.ams.listTools(),
    'set-ui': ui => { app.setUI(ui || {}); return {}; },
    theme: ({ theme: t }) => { theme(t); return {}; },
    tool: ({ tool }) => { app.setTool(tool); return {}; },
    camera: cam => { if (cam && 'z' in cam) setCamera(cam); const c = app.canvas; return { ...c.cam, w: c.w, h: c.h }; },
    focus: () => { app.canvas.canvas.focus?.(); window.focus(); return {}; },
    fit: ({ board, padding } = {}) => { app.canvas.fit(padding ?? 40, board ? boardOf(board).id : undefined); return {}; }
  };

  window.addEventListener('message', async e => {
    if (e.source !== window.parent || (origin !== 'null' && e.origin !== origin)) return;
    const m = e.data;
    if (!m || m.channel !== CHANNEL || typeof m.type !== 'string') return;
    const h = handlers[m.type];
    if (!h) { if (m.id != null) post({ type: 'error', id: m.id, message: `Unknown message ${m.type}` }); return; }
    try {
      const value = await h(m);
      if (m.id != null) post({ type: 'result', id: m.id, value });
    } catch (err) {
      if (m.id != null) post({ type: 'error', id: m.id, message: err?.message || String(err) });
    }
  });

  // Events, to the host. `change` carries no document: ask for it when it is wanted.
  let changeTimer = 0, lastReason = '';
  app.store.subscribe((_doc, reason) => {
    rev++; lastReason = reason;
    if (!changeTimer) changeTimer = setTimeout(() => { changeTimer = 0; post({ type: 'change', rev, reason: lastReason }); }, 120);
  }, { live: true });
  const onCamera = app.canvas.onCamera;
  let camFrame = 0;
  app.canvas.onCamera = () => {
    onCamera?.();
    if (applying || camFrame) return;
    camFrame = requestAnimationFrame(() => { camFrame = 0; post({ type: 'camera', ...app.canvas.cam }); });
  };
  app.on('selection', () => post({ type: 'selection', ids: [...app.canvas.selected] }));
  app.on('tool', () => post({ type: 'tool', id: app.tool }));
  // Keys the editor did not use go to the host, so the host's own shortcuts keep working.
  window.addEventListener('keydown', e => {
    if (e.defaultPrevented || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    post({ type: 'key', key: e.key, code: e.code, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey });
  });

  post({ type: 'ready', protocol: PROTOCOL, tools: window.ams.listTools().length });
}
