/**
 * The host side of the embedded editor: the `ams-editor-v1` message protocol (docs/EMBEDDING.md).
 * Every message is { channel, type, id?, … }. Requests carry an id and get one `result` or `error` back; the editor
 * also sends `ready`, `change`, `draft`, `selection` and `tool` on its own. Messages are accepted only from the parent window
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
  let passthrough = false;
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
    ui({ panels: false, zoom: false, view: false });   // (the presentation menu is the studio's, not a layer's)
    // The host's canvas owns the view: no zoom control, and no zoom, fit or frame commands to fight it (in memory only).
    app.overlay = true;
    for (const id of [...VIEW_COMMANDS, 'ui.all']) app.shortcuts.overrides[id] = [];   // (zen's key, Alt+Z, goes to the host as a `key` event)
    for (const [id, d] of declared) declared.set(id, { ...d, ground: 'transparent', hideBorder: true, hideLabel: true });
    declare();
  };
  const VIEW_COMMANDS = ['view.fit', 'view.frameBoard', 'view.frameSelection', 'view.zoomIn', 'view.zoomOut'];
  /** overlay: a layer over the host's canvas, the host owns the view and the interface. standalone: the editor on its own, with the studio's own interface (zen, zoom, panels, ams_ui). */
  const setMode = mode => {
    if (mode === 'standalone') {
      app.overlay = false;
      app.uiLocked = false;
      for (const id of [...VIEW_COMMANDS, 'ui.all']) delete app.shortcuts.overrides[id];
    } else {
      app.uiLocked = true;
      overlay(true);
    }
    app.renderChrome();   // (the toolbar differs: zoom controls only when the editor owns its view)
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
  const ui = patch => {
    // Only the keys that mean something (a message carries others), and the panels class the stylesheet keys on.
    const p = Object.fromEntries(['all', 'tools', 'view', 'zoom', 'panels'].filter(k => patch && k in patch).map(k => [k, Boolean(patch[k])]));
    if ('panels' in p || 'all' in p) document.documentElement.classList.toggle('ams-panels', Boolean('all' in p ? p.all : p.panels));
    app.hostSetUI(p);
  };
  const configure = cfg => {
    if (cfg.passthrough != null) passthrough = !!cfg.passthrough;
    if (cfg.actions) app.hostActions = cfg.actions.filter(a => a?.id && a?.label);
    if (cfg.dock) document.documentElement.classList.toggle('dock-left', cfg.dock === 'left');
    if (cfg.ui) ui(cfg.ui);
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
  /**
   * The stroke being drawn, as a mark of board `b` (board-relative points, on a `draft` stage), or null. It is only in the
   * canvas until the pointer is released, so a live host asks for it: `export` with `draft: true`, after a `draft` event.
   */
  const draftOn = b => {
    const c = app.canvas, d = c.draft && (c.draftShown || c.draft), p = d?.points?.[0];
    if (!p || p[0] < b.x || p[0] > b.x + b.width || p[1] < b.y || p[1] > b.y + b.height) return null;
    return { ...d, stage: 'draft', board: undefined, points: d.points.map(([x, y, t, pr]) => [x - b.x, y - b.y, t, pr]) };
  };
  const exportBoard = async ({ board, ids, format = 'png', scale = 1, transparent = false, mode = 'picture', draft = false }) => {
    if (ids?.length && (format === 'png' || format === 'svg')) {   // just those marks (a selection), on no paper
      const blob = await app.selectionBlob(format, ids);
      if (!blob) throw new Error('Nothing to export');
      return { format, ids, blob };
    }
    const b = boardOf(board);
    if (format === 'png' || format === 'bitmap') {   // 'bitmap' is the same picture as an ImageBitmap, with no encode (a live view)
      let out;
      const stroke = draft ? draftOn(b) : null;
      if (transparent || stroke) {   // the marks alone, no paper (transparent); and the stroke being drawn (draft)
        const part = boardDoc(app.store.doc, b.id);
        if (transparent) part.artboard = { ...part.artboard, ground: 'transparent' };
        if (stroke) { part.stages = [...(part.stages || []), { id: 'draft', visible: true }]; part.elements = [...part.elements, stroke]; }
        out = app.boardPicture(b, scale, mode, part);
      } else out = app.boardPicture(b, scale, mode);
      return { format, board: b.id, width: out.width, height: out.height, ...(format === 'bitmap' ? { bitmap: await createImageBitmap(out) } : { blob: await toBlob(out) }) };
    }
    const part = boardDoc(app.store.doc, b.id);
    if (format === 'svg') return { format, board: b.id, text: toSVG(part, { mode }) };
    if (format === 'json') return { format, board: b.id, document: structuredClone(part) };
    if (format === 'excalidraw') return { format, board: b.id, scene: toExcalidraw(part) };
    throw new Error(`Unknown export format ${format}`);
  };

  let hostKey = false;
  const scoreSubs = new Map();
  // __ in the embed (the iframe's own window: the host's window.__ is never touched): the score as signals, the same names as the messages.
  window.__ = { score: { read: name => app.score.bus.read(name, app.score.features()), subscribe: (opts) => app.score.bus.subscribe(opts), recent: (since, name) => app.score.bus.recent(since, name), features: t => app.score.features(t), setInput: (name, value) => app.score.setInput(name, value), exportScore: () => app.score.exportScore() } };
  const handlers = {
    /** Score signals: subscribe { names?, hz? } → frames and events to the host until unsubscribed. */
    'score-subscribe': m => {
      const id = m.subId || `s${Math.random().toString(36).slice(2, 8)}`;
      const unsub = app.score.bus.subscribe({
        names: m.names, hz: m.hz,
        onFrame: f => post({ type: 'score-frame', subId: id, ...f }),
        onEvent: ev => post({ type: 'score-event', subId: id, ...ev })
      });
      scoreSubs.set(id, unsub);
      return { subId: id, hz: m.hz || 25 };
    },
    /** Host clock: the host drives the playhead (position, playing, rate) and the score follows; drift is corrected, so small
     * differences do not restart anything. Off: the editor's own transport runs (the default). */
    'transport': m => {
      const p = app.player;
      if (!p.hostClock) return { ignored: true };
      if (Number.isFinite(m.rate) && m.rate > 0) p.rate = m.rate;
      const want = Number(m.time) * 1000;
      if (Number.isFinite(want) && Math.abs(p.position() - want) > 40) p.seek(Math.max(0, want));
      if (m.playing && !p.playing) p.play();
      if (m.playing === false && p.playing) p.pause();
      return { t: p.position() / 1000, playing: p.playing };
    },
    /** A designated input (play.in) set by the host. */
    'score-input': m => ({ accepted: app.score.setInput(String(m.name), m.value) }),
    /** The score as a standalone export: JSON that src/score/runtime.js plays anywhere. */
    'score-export': () => ({ score: app.score.exportScore() }),
    'score-unsubscribe': m => { scoreSubs.get(m.subId)?.(); scoreSubs.delete(m.subId); return { ok: true }; },
    /** The current value of signals (names are prefixes: 'lead' gives lead.x, lead.u…). */
    'score-read': m => { const f = app.score.features(); return { t: f.t, features: app.score.bus.read(m.name, f) }; },
    'score-recent': m => ({ events: app.score.bus.recent(m.since || 0, m.name || null) }),
    'host-key': m => {
      hostKey = true;
      const event=new KeyboardEvent(m.event==='keyup'?'keyup':'keydown',{
        key:m.key,code:m.code,repeat:!!m.repeat,altKey:!!m.altKey,ctrlKey:!!m.ctrlKey,
        metaKey:!!m.metaKey,shiftKey:!!m.shiftKey,bubbles:true,cancelable:true
      });
      try { app.canvas.canvas.dispatchEvent(event); }
      finally { hostKey = false; }
      return {handled:event.defaultPrevented};
    },
    init: cfg => { if (cfg?.clock === 'host') app.player.hostClock = true; configure(cfg || {}); return { protocol: PROTOCOL, boards: boardsOf(app.store.doc).map(b => ({ id: b.id, title: b.title, width: b.width, height: b.height })) }; },
    load: ({ document: doc, boards, fit }) => { app.loadDocument(normalizeDocument(doc), 'host'); declare(boards); if (fit) configure({ fit }); return { rev }; },
    loadExcalidraw: ({ scene }) => { app.loadDocument(fromExcalidraw(scene), 'host'); declare(); return { rev }; },
    'get-document': () => ({ rev, document: structuredClone(app.store.doc) }),
    'select-box': ({x,y,w,h,additive=false}) => {
      if (![x,y,w,h].every(Number.isFinite) || w<0 || h<0) throw new Error('Invalid selection box');
      const c=app.canvas;
      const ids=app.store.doc.elements.filter(el=>c.editable(el) && el.points?.length &&
        el.points.every(([px,py])=>px>=x && px<=x+w && py>=y && py<=y+h)).map(el=>el.id);
      const groups=new Set(app.store.doc.elements.filter(el=>ids.includes(el.id)&&el.group).map(el=>el.group));
      c.select([...ids,...app.store.doc.elements.filter(el=>groups.has(el.group)&&c.editable(el)).map(el=>el.id)],additive);
      c.invalidate();
      return {selected:[...c.selected]};
    },
    export: exportBoard,
    call: ({ name, args }) => window.ams.callTool(name, args || {}),
    'list-tools': () => window.ams.listTools(),
    'set-ui': m => { ui(m); return {}; },
    theme: ({ theme: t }) => { theme(t); return {}; },
    tool: ({ tool }) => { app.setTool(tool); return {}; },
    mode: ({ mode }) => { setMode(mode); return {}; },
    // A picture under the main board, to draw over: not part of any export. { url | blob, opacity, title } shows it; no url or blob (or visible: false) hides it.
    reference: async ({ url, blob, opacity, title, visible }) => {
      if (!url && !blob) { if (app.reference) { app.reference.visible = false; app.canvas.invalidate(); app.renderChrome(); } return { visible: false }; }
      const data = blob || await (await fetch(url)).blob();
      await app.setReferenceFromBlob(data, title || 'reference');
      if (opacity != null) app.reference.opacity = Number(opacity);
      if (visible === false) app.reference.visible = false;
      app.canvas.invalidate(); app.renderChrome();
      return { visible: app.reference.visible, opacity: app.reference.opacity };
    },
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

  // In an overlay, Select on empty space belongs to the host beneath the drawing.
  // Drawing tools keep empty space so a new stroke can still start anywhere.
  const canvas = app.canvas.canvas;
  let passing = false, lastPassed = false;
  const pointer = e => post({ type: 'pointer', event: e.type, x: e.clientX, y: e.clientY,
    pointerId: e.pointerId, pointerType: e.pointerType, button: e.button, buttons: e.buttons,
    pressure: e.pressure, altKey: e.altKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey });
  canvas.addEventListener('pointerdown', e => {
    lastPassed = false;
    if (!passthrough || !app.overlay || app.tool !== 'select' || app.canvas.space) return;
    const [x, y] = app.canvas.local(e), [wx, wy] = app.canvas.toWorld(x, y);
    if (app.canvas.hitTest(wx, wy) || app.canvas.handleAt(x, y) || app.canvas.boardHandleAt?.(x, y)) { lastPassed = false; return; }
    passing = lastPassed = true;
    e.preventDefault(); e.stopImmediatePropagation();
    canvas.setPointerCapture(e.pointerId);
    pointer(e);
  }, true);
  for (const type of ['pointermove', 'pointerup', 'pointercancel']) canvas.addEventListener(type, e => {
    if (!passing) return;
    e.preventDefault(); e.stopImmediatePropagation(); pointer(e);
    if (type !== 'pointermove') passing = false;
  }, true);
  for (const type of ['click', 'dblclick', 'contextmenu']) canvas.addEventListener(type, e => {
    if (!lastPassed || !passthrough || !app.overlay || app.tool !== 'select') return;
    e.preventDefault(); e.stopImmediatePropagation(); pointer(e);
  }, true);
  // Empty drawing selection leaves Delete and undo/redo to the circuit. Text fields
  // and selected drawing marks retain the editor's own editing/history shortcuts.
  window.addEventListener('keydown', e => {
    if (hostKey || !passthrough || !app.overlay || app.canvas.selected.size || app.canvas.selectedBoard ||
        e.target.closest?.('input,textarea,select,[contenteditable]')) return;
    const history = (e.metaKey || e.ctrlKey) && ['z','y'].includes(e.key.toLowerCase());
    const edit = ['Delete', 'Backspace'].includes(e.key) || (history && lastPassed);
    if (!edit) return;
    e.preventDefault(); e.stopImmediatePropagation();
    post({ type: 'key', key: e.key, code: e.code, repeat: e.repeat, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey });
  }, true);

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
  // `draft`: a stroke is being drawn, and it is not in the document until the pointer is released (`change` waits for that).
  // Sent at most once per frame while it grows, and once more when it ends (`active: false`); it carries nothing, so a live
  // host answers with `export { draft: true }`.
  const invalidate = app.canvas.invalidate;
  let draftFrame = 0, drafting = false;
  app.canvas.invalidate = function (...args) {
    const result = invalidate.apply(this, args);
    const on = Boolean(app.canvas.draft);
    if ((on || drafting) && !draftFrame) draftFrame = requestAnimationFrame(() => { draftFrame = 0; post({ type: 'draft', active: Boolean(app.canvas.draft) }); });
    drafting = on;
    return result;
  };
  // Right-click menu entries the host asked for (init `actions`): the choice goes to the host, with the selected ids.
  app.on('host-action', (id, ids) => post({ type: 'action', id, ids }));
  app.on('selection', () => post({ type: 'selection', ids: [...app.canvas.selected] }));
  app.on('tool', () => post({ type: 'tool', id: app.tool }));
  // Keys the editor did not use go to the host, so the host's own shortcuts keep working.
  window.addEventListener('keydown', e => {
    if (hostKey || e.defaultPrevented || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    post({ type: 'key', key: e.key, code: e.code, repeat: e.repeat, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey });
  });

  window.addEventListener('keyup', e => {
    if (hostKey || e.defaultPrevented || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
    post({ type: 'key', event: 'keyup', key: e.key, code: e.code, repeat: e.repeat, alt: e.altKey, ctrl: e.ctrlKey, meta: e.metaKey, shift: e.shiftKey });
  });

  post({ type: 'ready', protocol: PROTOCOL, tools: window.ams.listTools().length });
}
