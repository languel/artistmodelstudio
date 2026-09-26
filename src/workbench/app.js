/**
 * Artist Model Studio workbench: an infinite canvas with an artboard, dockable panels,
 * and the process document at the center. Everything the user can do is also a
 * command (see mcp.js), so agents drive the same surface.
 */
import { openToolParams, openGridParams } from './toolParams.js';
import { boardDoc, boardById, boardsOf, MAIN, BLACKBOARD, boardForPoints, trainBoard } from '../process/boards.js';
import { sceneHtml, docFromPage } from '../process/page.js';
import { Scenes } from './scenes.js';
import { runScoreInto } from '../process/script.js';
import { SCULPTS, loadSculptLibrary } from '../process/sculpt.js';
import { ProcessStore, createDocument, normalizeDocument, DEFAULT_REALIZE, ROLES } from '../process/document.js';
import { toSVG, fromSVG, toExcalidraw, fromExcalidraw, toP5, p5IndexHtml, processSheet } from '../process/exports.js';
import { dslToProcess } from '../process/fromDsl.js';
import { canvasBlob } from './ui.js';
import { renderToCanvas } from '../process/render.js';
import { EXERCISES } from '../process/exercises.js';
import { runScript } from '../process/script.js';
import { createZip } from '../export/zip.js';
import { AssetStore } from '../assets/assetStore.js';
import { AssetPanel } from '../ui/AssetPanel.js';
import { bundledReferences } from '../ui/ReferencePanel.js';
import { DockManager } from './dock.js';
import { CanvasView, TOOL_KEYS } from './canvasView.js';
import { icon, brushIcon, sculptIcon } from './icons.js';
import { h, download, editInPlace } from './ui.js';
import { mountScenes } from './panels/scenes.js';
import { mountBoards } from './panels/boards.js';
import { mountStages } from './panels/stages.js';
import { mountProperties } from './panels/properties.js';
import { mountScript } from './panels/script.js';
import { mountProcess } from './panels/process.js';
import { mountLog } from './panels/log.js';
import { mountGenerate } from './panels/generate.js';
import { mountAssistant } from './panels/assistant.js';
import { mountDecide } from './panels/decide.js';
import { mountOutliner } from './panels/outliner.js';
import { mountSettings } from './panels/settings.js';
import { mountShortcuts } from './panels/shortcuts.js';
import { mountCode } from './panels/code.js';
import { mountTimeline } from './panels/timeline.js';
import { Recorder } from './recorder.js';
import { History } from './history.js';
import { mountHistory } from './panels/history.js';
import { TakePlayer } from './takePlayer.js';
import { loadLibrary } from '../process/brushes.js';
import { mountDocs, docsTopicList } from './panels/docs.js';
import { Walkthroughs } from './walkthroughs.js';
import { openPalette } from './palette.js';
import { showMenu } from './menu.js';
import { brushesForRole, KIT, BRUSHES } from '../process/brushes.js';
import { Shortcuts } from './shortcuts.js';
import { eyedropToTarget, openPicker, parseColor, formatColor } from './colorPicker.js';
import { ArtistRegistry } from '../artists/artistRegistry.js';
import { initWorkbenchMCP } from './mcp.js';
import { Guide } from './guide.js';

const DOC_KEY = 'ams_process_doc_v1';
const DEFAULTS_KEY = 'ams_tool_defaults_v1';
const TOOLS = [
  ['select', 'Select and move', 'V'], ['hand', 'Pan', 'H'], ['board', 'Board: drag out a new artboard (Shift keeps it square)', '⇧O'], null,
  ['point', 'Point: a mark at a place', 'O'], ['line', 'Line: a point that moved', 'P'], ['plane', 'Plane: an enclosed area', 'A'], null,
];
/** Construction: one button for gesture and guide (like the brush and sculpt stacks). */
const CONSTRUCTION = [['gesture', 'Gesture: the movement behind a form', 'E'], ['guide', 'Guide: construction (straight; Shift snaps)', 'G']];
const NOTE_TOOL = ['note', 'Note: a written annotation', 'T'];
const BRUSH_KEY = 'ams_brush_active';
const SCULPT_KEY = 'ams_sculpt_v1';

export class Workbench {
  constructor(root) {
    this.root = root;
    this.handlers = new Map();
    this.logLines = [];
    let saved = null;
    try { saved = JSON.parse(localStorage.getItem(DOC_KEY) || 'null'); } catch { /* ignore */ }
    if (!saved) {
      const first = runScript(EXERCISES[1].source, { seed: 1, by: { kind: 'example', name: 'exercise' } }).doc;
      if (first) first.title = EXERCISES[1].title;
      saved = first || createDocument();
    }
    this.store = new ProcessStore(saved);
    this.tool = 'select';
    this.view = { mode: 'process', upTo: Infinity };
    this.activeStageId = this.store.doc.stages[this.store.doc.stages.length - 1]?.id;
    try { this.toolDefaults = JSON.parse(localStorage.getItem(DEFAULTS_KEY) || '{}'); } catch { this.toolDefaults = {}; }
    // Lazy drawing: an editor setting (how the hand becomes points), not a property of marks.
    try { this.lazy = { radius: 0, smoothing: 0, ...JSON.parse(localStorage.getItem('ams_lazy') || '{}') }; } catch { this.lazy = { radius: 0, smoothing: 0 }; }
    // Sculpt: the current sculpt tool, brush radius (screen px), strength, and each tool's params.
    try { this.sculpt = { tool: 'push', radius: 40, strength: 0.5, params: {}, ...JSON.parse(localStorage.getItem(SCULPT_KEY) || '{}') }; } catch { this.sculpt = { tool: 'push', radius: 40, strength: 0.5, params: {} }; }
    loadSculptLibrary();
    // The active brush: the Brush tool draws with it; its params are kept per brush.
    try { this.brush = { id: 'ink', params: {}, ...JSON.parse(localStorage.getItem(BRUSH_KEY) || '{}') }; } catch { this.brush = { id: 'ink', params: {} }; }
    if (!SCULPTS[this.sculpt.tool]) this.sculpt.tool = 'push';
    // Density used to be a spacing (smaller = denser); now it is points per radius.
    if (this.sculpt.params.simplify?.density < 1) delete this.sculpt.params.simplify.density;
    // Global paint: stroke and fill for new marks (null: the brush's own ink / no fill).
    // Plain colors for now; like brushes, strokes and fills are meant to become processes (code) too.
    try { this.paint = { stroke: null, fill: null, ...JSON.parse(localStorage.getItem('ams_paint') || '{}') }; } catch { this.paint = { stroke: null, fill: null }; }
    this.reference = null; // { img, opacity, visible, title }
    this.assetStore = new AssetStore();
    this.artists = new ArtistRegistry();
    this.store.subscribe((doc, reason) => {
      clearTimeout(this.saveTimer);
      this.saveTimer = setTimeout(() => { try { localStorage.setItem(DOC_KEY, JSON.stringify(this.store.doc)); } catch { /* quota */ } }, 300);
      if (!this.store.doc.stages.some(s => s.id === this.activeStageId)) this.activeStageId = this.store.doc.stages[0]?.id;
      this.emit('document', reason);
      this.renderChrome();
    });
  }

  // ---- events ------------------------------------------------------------------
  on(name, fn) { (this.handlers.get(name) || this.handlers.set(name, new Set()).get(name)).add(fn); }
  emit(name, ...a) { for (const fn of this.handlers.get(name) || []) { try { fn(...a); } catch (err) { console.error(`${name} listener failed:`, err); } } }
  log(text, kind = 'info') { this.logLines.push({ t: Date.now(), text, kind }); if (this.logLines.length > 400) this.logLines.shift(); this.emit('log'); }

  // ---- state ---------------------------------------------------------------------
  get activeStage() { return this.store.doc.stages.find(s => s.id === this.activeStageId) || this.store.doc.stages[0]; }
  setActiveStage(id) { this.activeStageId = id; this.emit('stage'); this.renderChrome(); }
  setTool(t) {
    // Choosing a tool means drawing again: leave a take being reviewed.
    if (this.player?.take) this.player.close();
    if (t === 'gesture' || t === 'guide') this.constructTool = t;
    this.tool = t; this.canvas?.updateCursor(); this.emit('tool'); this.renderChrome();
  }
  setViewMode(m) { this.view.mode = m; this.canvas.invalidate(); this.emit('view'); this.renderChrome(); }
  setUpTo(i) { this.view.upTo = i; this.canvas.upTo = i; this.canvas.invalidate(); this.emit('view'); }
  selectedElements() { return this.store.doc.elements.filter(e => this.canvas?.selected.has(e.id)); }
  selectIds(ids) { this.canvas.select(ids); }
  groupSelection() { const ids = [...this.canvas.selected]; if (ids.length > 1) { this.store.group(ids); this.canvas.select(ids); } }
  ungroupSelection() { const ids = [...this.canvas.selected]; if (ids.length) this.store.ungroup(ids); }

  /** Change the sculpt settings: { tool, radius, strength } or params for a tool ({ params: { amount } }). */
  setSculpt(patch) {
    const s = this.sculpt;
    if (patch.params) s.params = { ...s.params, [s.tool]: { ...(s.params[s.tool] || {}), ...patch.params } };
    for (const k of ['tool', 'radius', 'strength']) if (k in patch) s[k] = patch[k];
    s.radius = Math.max(4, Math.min(400, s.radius)); s.strength = Math.max(0.02, Math.min(1, s.strength));
    try { localStorage.setItem(SCULPT_KEY, JSON.stringify(s)); } catch { /* ignore */ }
    this.canvas?.invalidate();
    this.emit('sculpt');
    if ('tool' in patch) this.renderChrome();
  }

  sculptMenu(x, y) {
    const cur = this.sculpt.tool;
    showMenu([
      { label: 'Sculpt' },
      ...Object.entries(SCULPTS).map(([id, t]) => ({ icon: sculptIcon(id), active: id === cur, label: `${t.label}`, hint: t.doc, run: () => { this.setSculpt({ tool: id }); if (this.tool !== 'sculpt') this.setTool('sculpt'); } })),
      '-',
      { label: `Radius ${Math.round(this.sculpt.radius)} px`, keys: '[ ]', disabled: true },
      { label: `Strength ${Math.round(this.sculpt.strength * 100)}%`, keys: 'Shift+[ ]', disabled: true },
      '-',
      { label: 'Show code', hint: 'Sculpt tools are code: fork one or write your own', run: () => this.openCode?.('sculpt', cur) }
    ], x, y);
  }

  /** The warm accent (record, playhead, points); kept per browser. null: the theme's own. */
  setAccent(v) {
    try { if (v) localStorage.setItem('ams_accent', v); else localStorage.removeItem('ams_accent'); } catch { /* ignore */ }
    if (v) document.documentElement.style.setProperty('--wb-accent-2', v); else document.documentElement.style.removeProperty('--wb-accent-2');
    this.canvas?.invalidate();
  }

  setLazy(patch) {
    Object.assign(this.lazy, patch);
    this.lazy.radius = Math.max(0, Math.min(200, Number(this.lazy.radius) || 0));
    this.lazy.smoothing = Math.max(0, Math.min(0.95, Number(this.lazy.smoothing) || 0));
    try { localStorage.setItem('ams_lazy', JSON.stringify(this.lazy)); } catch { /* ignore */ }
    this.emit('lazy');
  }

  togglePoints() {
    this.canvas.showPoints = !this.canvas.showPoints;
    try { localStorage.setItem('ams_show_points', this.canvas.showPoints ? '1' : '0'); } catch { /* ignore */ }
    this.canvas.invalidate(); this.renderChrome();
  }

  /** Set the global stroke or fill; selected marks take it too. */
  setPaint(which, value) {
    this.paint[which] = value || null;
    try { localStorage.setItem('ams_paint', JSON.stringify(this.paint)); } catch { /* ignore */ }
    const ids = [...this.canvas.selected];
    if (ids.length) {
      const key = which === 'stroke' ? 'color' : 'fill';
      this.store.change(which, d => { for (const e of d.elements) if (ids.includes(e.id) && e.role !== 'note') { if (value) e[key] = value; else delete e[key]; if (key === 'color' && !value) e.color = null; } });
    }
    this.renderChrome();
  }

  paintSwatches() {
    const { stroke, fill } = this.paint;
    const sel = this.selectedElements?.() || [];
    const s = sel.length ? (sel[0].color ?? null) : stroke;
    const f = sel.length ? (sel[0].fill ?? null) : fill;
    const chip = (which, v, tip) => {
      const b = h('button', { class: `wb-paint-${which}${v && v !== 'none' ? '' : ' none'}${which === 'stroke' && !v ? ' ink' : ''}`, title: tip, type: 'button' }, h('span', { style: which === 'stroke' ? { boxShadow: `inset 0 0 0 5px ${v && v !== 'none' ? v : !v ? 'var(--wb-text)' : 'transparent'}` } : { background: v || 'transparent' } }));
      b.addEventListener('click', ev => { ev.stopPropagation(); openPicker(b, parseColor((v !== 'none' && v) || (which === 'fill' ? '#ffffff' : '#1d1b19')), (c, final) => { if (final) this.setPaint(which, c ? formatColor(c.hex, c.alpha) : (which === 'stroke' ? 'none' : null)); }, this, { allowNone: true }); });
      b.addEventListener('contextmenu', ev => { ev.preventDefault(); showMenu([{ label: which === 'fill' ? 'No fill' : 'No stroke', run: () => this.setPaint(which, which === 'stroke' ? 'none' : null) }, ...(which === 'stroke' ? [{ label: 'Brush ink (default)', run: () => this.setPaint('stroke', null) }] : []), { label: 'Swap stroke and fill', run: () => this.swapPaint() }], ev.clientX, ev.clientY); });
      return b;
    };
    return h('div', { class: 'wb-paint', 'data-guide': 'tool:paint' },
      chip('fill', f, 'Fill (right-click: none)'), chip('stroke', s, 'Stroke (right-click: brush ink)'),
      h('button', { class: 'wb-paint-swap', title: 'Swap stroke and fill', type: 'button', onclick: () => this.swapPaint() }, '⇄'));
  }

  swapPaint() {
    const { stroke, fill } = this.paint;
    this.setPaint('stroke', fill); this.setPaint('fill', stroke);
  }

  defaults(role) {
    if (role === 'brush') {
      const b = BRUSHES[this.brush.id] ? this.brush.id : 'ink';
      const roles = BRUSHES[b].roles || ['line'];
      const r = roles.includes('line') ? 'line' : roles.includes('plane') ? 'plane' : roles.includes('gesture') ? 'gesture' : 'line';
      return { ...this.defaults(r), role: r, realize: { brush: b, params: { ...(this.brush.params[b] || {}) } } };
    }
    const d = this.toolDefaults[role] || {};
    return { color: (role !== 'note' && this.paint?.stroke) || d.color || null, fill: role !== 'note' ? this.paint?.fill || null : null, why: d.why || '', realize: d.realize || structuredClone(DEFAULT_REALIZE[role] || DEFAULT_REALIZE.line), opacity: d.opacity ?? 1, blend: d.blend || 'normal', ...(role === 'note' ? { note: d.note || {} } : {}) };
  }

  // ---- boards ----------------------------------------------------------------------
  /** Go to a board: it becomes active and fills the view. */
  goToBoard(id, { fit = true, animate = this.presenting } = {}) {
    const b = boardById(this.store.doc, id);
    if (!b) return;
    this.activeBoard = b.id;
    if (!this.presenting) this.canvas.selectBoard(b.id);
    const pad = this.presenting ? 24 : 60;
    if (fit && animate) this.canvas.animateTo(this.canvas.camFor(b.id, pad)); else if (fit) this.canvas.fit(pad, b.id);
    // Recording: the camera goes into the take (the camera track), so a replay or video follows the boards.
    if (fit && this.recorder?.recording) {
      const ab = this.store.doc.artboard;
      const fitMain = Math.min(16 / ab.width, 9 / ab.height), fitB = Math.min(16 / b.width, 9 / b.height);
      this.recorder.push({ track: 'camera', start: this.recorder.now(), dur: animate ? 550 : 1, cx: (b.x + b.width / 2) / ab.width, cy: (b.y + b.height / 2) / ab.height, z: fitB / fitMain * 0.96, label: b.title });
    }
    if (this.presenting) this.presentHud();
    this.emit('board');
    this.renderChrome();
  }

  // ---- scenes ------------------------------------------------------------------------
  /** A new project: one empty scene. With keep, every scene goes to Assets first (a folder per project). */
  async newProject({ keep = true } = {}) {
    if (keep) {
      const folder = `Project ${new Date().toLocaleString()}`.replace(/[/:]/g, '-');
      const prev = this.assetPanel?.folder;
      if (this.assetPanel) this.assetPanel.folder = folder;
      for (const s of this.scenes.all) { const d = await this.scenes.docOf(s.id); if (d) await this.saveDocToAssets(structuredClone(d)); }
      if (this.assetPanel) this.assetPanel.folder = prev || '';
      this.log(`Kept ${this.scenes.all.length} scene${this.scenes.all.length === 1 ? '' : 's'} in Assets → ${folder}.`);
    }
    await this.scenes.resetProject();
  }

  /** Let a toolbar island be dragged by a grip (its place is remembered; double-click the grip resets it). */
  makeMovable(island, key) {
    const grip = h('span', { class: 'wb-grip', title: 'Drag to move · double-click to put back' });
    island.prepend(grip);
    let places; try { places = JSON.parse(localStorage.getItem('ams_island_places') || '{}'); } catch { places = {}; }
    const apply = () => {
      const p = places[key];
      island.classList.toggle('wb-floating-island', Boolean(p));
      if (p) Object.assign(island.style, { left: `${p.x}px`, top: `${p.y}px` }); else Object.assign(island.style, { left: '', top: '' });
    };
    const save = () => { try { localStorage.setItem('ams_island_places', JSON.stringify(places)); } catch { /* ignore */ } };
    apply();
    grip.addEventListener('dblclick', () => { delete places[key]; save(); apply(); });
    grip.addEventListener('pointerdown', e => {
      e.preventDefault(); e.stopPropagation();
      const host = this.stageArea.getBoundingClientRect(), r = island.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      const mv = ev => {
        const x = Math.max(0, Math.min(host.width - r.width, ev.clientX - host.left - ox)), y = Math.max(0, Math.min(host.height - r.height, ev.clientY - host.top - oy));
        places[key] = { x: Math.round(x), y: Math.round(y) }; apply();
      };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); save(); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
  }

  /** Show or hide parts of the interface: tools, view (the right island), zoom, panels, or all of it. */
  setUI(patch) {
    this.ui = { tools: true, view: true, zoom: true, panels: true, ...(this.ui || {}), ...patch };
    if ('all' in patch) for (const k of ['tools', 'view', 'zoom', 'panels']) this.ui[k] = patch.all;
    delete this.ui.all;
    for (const k of ['tools', 'view', 'zoom', 'panels']) this.root.classList.toggle(`hide-${k}`, !this.ui[k]);
    try { localStorage.setItem('ams_ui', JSON.stringify(this.ui)); } catch { /* ignore */ }
    requestAnimationFrame(() => this.canvas?.resize());
    this.emit('ui', this.ui);
  }

  sceneMenu(x, y) {
    const S = this.scenes, cur = S.list.active;
    showMenu([
      { label: 'Scenes' },
      ...S.all.map((s, i) => ({ active: s.id === cur, label: `${i + 1}. ${s.title || 'Untitled'}`, run: () => S.switchTo(s.id) })),
      '-',
      { label: 'New scene', hint: 'An empty drawing; this one stays as it is', run: () => S.create() },
      { label: 'Duplicate this scene', run: () => S.duplicate() },
      { label: 'Move earlier', disabled: S.all[0]?.id === cur, run: () => S.move(cur, -1) },
      { label: 'Move later', disabled: S.all.at(-1)?.id === cur, run: () => S.move(cur, 1) },
      S.all.length > 1 ? '-' : null,
      S.all.length > 1 ? { label: 'Delete this scene…', items: [{ label: 'Save it to Assets first', run: async () => { await this.saveToAssets(); S.remove(cur); } }, { label: `Delete “${S.current?.title || 'Untitled'}”`, run: () => S.remove(cur) }, { label: 'Cancel', run: () => {} }] } : null
    ], x, y);
  }

  // ---- presenting ---------------------------------------------------------------------
  /**
   * Present: the boards full-window, in order, with eased moves between them. → / Space / PageDown
   * next, ← / PageUp back, 1–9 a board by number, Home / End, Esc leaves. Drawing still works.
   */
  present(on = !this.presenting) {
    this.presenting = on;
    this.canvas.presenting = on;
    this.root.classList.toggle('presenting', on);
    try { if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); else if (!on && document.fullscreenElement) document.exitFullscreen?.(); } catch { /* ignore */ }
    if (on) {
      this.presentKeys ||= e => {
        if (!this.presenting || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
        const bs = boardsOf(this.store.doc);
        const go = i => { e.preventDefault(); e.stopPropagation(); this.goToBoard(bs[Math.max(0, Math.min(bs.length - 1, i))].id); };
        const cur = Math.max(0, bs.findIndex(b => b.id === this.activeBoard));
        if (['ArrowRight', 'PageDown', ' '].includes(e.key) && !e.metaKey) go(cur + 1);
        else if (['ArrowLeft', 'PageUp'].includes(e.key) && !e.metaKey) go(cur - 1);
        else if (e.key === 'Home') go(0);
        else if (e.key === 'End') go(bs.length - 1);
        else if (/^[1-9]$/.test(e.key) && !e.metaKey && !e.altKey) go(Number(e.key) - 1);
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); this.present(false); }
      };
      window.addEventListener('keydown', this.presentKeys, true);
      this.canvas.selectBoard(null);
      requestAnimationFrame(() => this.goToBoard(this.activeBoard || MAIN));
    } else {
      window.removeEventListener('keydown', this.presentKeys, true);
      this.hud?.remove(); this.hud = null;
      requestAnimationFrame(() => this.canvas.fit(60, this.activeBoard || MAIN));
    }
    this.emit('present', on);
  }

  presentHud() {
    const bs = boardsOf(this.store.doc), i = bs.findIndex(b => b.id === this.activeBoard);
    if (!this.hud) { this.hud = h('div', { class: 'wb-present-hud' }); this.stageArea.append(this.hud); }
    this.hud.textContent = `${i + 1} / ${bs.length}  ·  ${bs[i]?.title || ''}`;
    this.hud.classList.remove('fade'); void this.hud.offsetWidth; this.hud.classList.add('fade');
  }

  stepBoard(delta) {
    const bs = boardsOf(this.store.doc);
    const i = Math.max(0, bs.findIndex(b => b.id === this.activeBoard));
    this.goToBoard(bs[(i + delta + bs.length) % bs.length].id);
  }

  /** Rename a board in place: on its title above the board, or in the Boards panel. */
  renameBoard(id) {
    const b = boardById(this.store.doc, id);
    if (!b) return;
    const commit = v => this.store.updateBoard(id, { title: v });
    const label = (this.canvas.boardLabels || []).find(l => l.id === id);
    if (label && label.y > 0 && label.x < this.canvas.w) {
      // A field over the canvas title, same place, same type.
      const r = this.canvas.canvas.getBoundingClientRect();
      const el = h('span', { class: 'wb-board-rename', style: { left: `${r.left + label.x}px`, top: `${r.top + label.y}px` } }, b.title);
      document.body.append(el);
      editInPlace(el, commit, b.title, () => el.remove());
      return;
    }
    const row = document.querySelector(`[data-board-title="${CSS.escape(id)}"]`);
    if (row) editInPlace(row, commit);
  }

  boardMenu(id, x, y) {
    const doc = this.store.doc, b = boardById(doc, id), n = boardsOf(doc).length;
    if (!b) return;
    const marks = doc.elements.filter(e => (e.board || MAIN) === id).length;
    showMenu([
      { label: `${b.title}` },
      { label: 'Go to', run: () => this.goToBoard(id) },
      { label: 'Rename…', run: () => this.renameBoard(id) },
      { label: 'Code', hint: 'The board’s own code: it redraws the board, live', run: () => this.openCode?.('board', id) },
      { label: 'Export', items: [['png', 'PNG'], ['svg', 'SVG'], ['sheet', 'Process sheet'], ['p5', 'p5.js sketch']].map(([k, l]) => ({ label: l, run: () => this.exportAs(k, id) })) },
      { active: (doc.train || MAIN) === id, label: (doc.train || MAIN) === id ? 'Models learn from this board' : 'Train on this board', run: () => this.store.setTrainBoard(id) },
      b.main ? null : { label: 'Earlier', run: () => this.store.moveBoard(id, -1) },
      b.main ? null : { label: 'Later', run: () => this.store.moveBoard(id, 1) },
      { label: 'Duplicate', run: () => this.duplicateBoard(id) },
      b.main || n < 2 ? null : '-',
      b.main ? null : { label: `Delete (its ${marks} marks go to the blackboard)`, run: () => { this.store.removeBoard(id); if (this.activeBoard === id) this.goToBoard(MAIN, { fit: false }); } },
      b.main || !marks ? null : { label: `Delete with its ${marks} marks`, items: [{ label: `Delete ${marks} marks`, run: () => { this.store.removeBoard(id, { deleteMarks: true }); if (this.activeBoard === id) this.goToBoard(MAIN, { fit: false }); } }, { label: 'Cancel', run: () => {} }] }
    ], x, y);
  }

  /** A copy of a board and its marks, placed after the others. */
  duplicateBoard(id) {
    const doc = this.store.doc, b = boardById(doc, id);
    const nb = this.store.addBoard({ title: `${b.title} copy`, width: b.width, height: b.height, ground: b.ground, adopt: false });
    const ids = doc.elements.filter(e => (e.board || MAIN) === id).map(e => e.id);
    const nbPlaced = boardById(this.store.doc, nb.id);
    const copies = this.store.duplicate(ids, nbPlaced.x - b.x, nbPlaced.y - b.y);
    this.store.assignBoard(copies, nb.id);
    this.goToBoard(nb.id);
  }

  /** The active brush: { id } to pick one, { params } to set the active brush's params. */
  setBrush(patch) {
    const b = this.brush;
    if (patch.id && BRUSHES[patch.id]) b.id = patch.id;
    if (patch.params) b.params = { ...b.params, [b.id]: { ...(b.params[b.id] || {}), ...patch.params } };
    try { localStorage.setItem(BRUSH_KEY, JSON.stringify(b)); } catch { /* ignore */ }
    this.emit('brush');
    if (patch.id) this.renderChrome();
  }

  /**
   * Pick the active brush. With marks selected (and apply), the ones it can draw take it, with the
   * brush's current settings; otherwise the Brush tool comes up to draw with it.
   */
  pickBrush(id, { apply = true } = {}) {
    this.setBrush({ id });
    const b = BRUSHES[id];
    const ids = apply ? this.selectedElements().filter(e => b.roles?.includes(e.role)).map(e => e.id) : [];
    if (ids.length) {
      const params = { ...(this.brush.params[id] || {}) };
      this.store.change('brush', d => { for (const e of d.elements) if (ids.includes(e.id)) e.realize = { brush: id, params: { ...params } }; });
      this.log(`Brush “${b.label}” on ${ids.length} mark${ids.length === 1 ? '' : 's'}.`);
    } else if (this.tool !== 'brush' && !this.canvas.selected.size) this.setTool('brush');
  }

  /** Brush slots: the active brush with its settings (and the stroke color), on Shift+1–9. */
  keepSlot(n) {
    this.slots[n] = { id: this.brush.id, params: { ...(this.brush.params[this.brush.id] || {}) }, stroke: this.paint?.stroke || null };
    try { localStorage.setItem('ams_brush_slots', JSON.stringify(this.slots)); } catch { /* ignore */ }
    this.log(`Slot ${n}: ${BRUSHES[this.brush.id]?.label || this.brush.id}.`);
  }

  useSlot(n) {
    const s = this.slots[n];
    if (!s || !BRUSHES[s.id]) { this.log(`Slot ${n} is empty (Ctrl+Shift+${n} keeps the active brush there).`); return; }
    this.setBrush({ id: s.id });
    this.setBrush({ params: s.params });
    if (s.stroke !== undefined) this.setPaint('stroke', s.stroke);
    if (this.tool !== 'brush') this.setTool('brush');
  }

  brushMenu(x, y) {
    const cur = this.brush.id;
    const ids = Object.keys(BRUSHES).filter(id => !BRUSHES[id].construction && BRUSHES[id].roles?.some(r => ['line', 'plane', 'gesture'].includes(r)));
    showMenu([
      { label: 'Brush' },
      ...ids.map(id => ({ icon: brushIcon(id), active: id === cur, label: `${BRUSHES[id].label}`, hint: `${BRUSHES[id].doc}${this.canvas.selected.size ? ' · applies to the selection (Cmd-click: only pick it)' : ''}`, run: ev => this.pickBrush(id, { apply: !(ev?.metaKey || ev?.ctrlKey) }) })),
      '-',
      { label: 'Settings…', hint: 'Opt+right-click on the canvas', run: () => { this.setTool('brush'); openToolParams(this, x, y); } },
      { label: 'Show code', run: () => this.openCode?.('brush', cur) },
      '-',
      { label: 'Slots', hint: 'Shift+1–9 picks a slot; Ctrl+Shift+1–9 keeps the active brush there', items: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ label: `${n}  ${this.slots[n] ? BRUSHES[this.slots[n].id]?.label || this.slots[n].id : '—'}`, keys: `⇧${n}`, run: () => this.useSlot(n) })).concat(['-', { label: 'Keep the active brush in…', items: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ label: `Slot ${n}`, keys: `⌃⇧${n}`, run: () => this.keepSlot(n) })) }]) }
    ], x, y);
  }

  setDefaults(role, patch) {
    if (role === 'brush') {
      // The active brush keeps its own brush and params; the rest (color, look, why) is the role's.
      const { realize, ...rest } = patch;
      if (realize?.brush) this.setBrush({ id: realize.brush });
      if (realize?.params) this.setBrush({ params: realize.params });
      if (Object.keys(rest).length) this.setDefaults(this.defaults('brush').role, rest);
      if (!realize) return;
      this.emit('tool');
      return;
    }
    const d = this.defaults(role);
    if (patch.realize) d.realize = { brush: patch.realize.brush || d.realize.brush, params: patch.realize.brush && patch.realize.brush !== d.realize.brush ? {} : { ...d.realize.params, ...(patch.realize.params || {}) } };
    if ('color' in patch) d.color = patch.color;
    if ('why' in patch) d.why = patch.why;
    for (const k of ['opacity', 'blend']) if (k in patch) d[k] = patch[k];
    if (patch.note) d.note = { ...(d.note || {}), ...patch.note };
    this.toolDefaults[role] = d;
    try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify(this.toolDefaults)); } catch { /* ignore */ }
    this.emit('tool');
  }

  /**
   * A drawing made by a score (a generated candidate, an exercise) onto the active board: its score
   * reruns there, replacing that board's marks; the other boards and the blackboard stay. Without
   * a score it opens as a new scene.
   */
  putScoreDoc(doc, reason = 'score') {
    const src = doc?.meta?.script;
    if (!src) return this.scenes.create({ doc });
    const res = runScoreInto(this.store.doc, src, { board: this.activeBoard || MAIN, seed: doc.meta.seed ?? 1, by: doc.meta.by });
    if (res.error || !res.doc) return this.scenes.create({ doc });
    res.doc.title = this.store.doc.title;
    this.loadDocument(res.doc, reason);
    return null;
  }

  loadDocument(doc, reason = 'load') {
    this.store.replace(normalizeDocument(doc), reason);
    this.canvas.select([]);
    this.setUpTo(Infinity);
    this.setActiveStage(this.store.doc.stages[this.store.doc.stages.length - 1]?.id);
  }

  // ---- layout --------------------------------------------------------------------
  mount() {
    this.root.innerHTML = '';
    const shell = h('div', { class: 'wb' },
      h('aside', { class: 'wb-dock', 'data-dock': 'left' }),
      this.stageArea = h('main', { class: 'wb-stage-area' }),
      h('aside', { class: 'wb-dock', 'data-dock': 'right' }),
      h('section', { class: 'wb-dock', 'data-dock': 'bottom' })
    );
    this.root.append(shell, h('div', { 'data-floating': '' }), h('div', { class: 'wb-dock-hint' }));
    this.docks = new DockManager(this.root, { onLayout: () => this.canvas?.resize() });
    // Score and Brushes are modes of one Code panel; old names open it in the right mode.
    this.docks.aliases = { brushes: ['script', 'brush'], code: ['script', null] };
    this.docks.onAlias = mode => { if (mode) this.codeMode?.(mode); };

    this.canvas = new CanvasView(this.stageArea, this.store, {
      getTool: () => this.tool,
      getStage: () => this.activeStage,
      getDefaults: r => this.defaults(r),
      getSculpt: () => this.sculpt,
      getLazy: () => this.lazy,
      onSelect: () => { this.emit('selection'); this.renderChrome(); },
      onNoteStyled: note => this.setDefaults('note', { note }),
      onTool: t => this.setTool(t),
      viewMode: () => this.view.mode
    });
    this.canvas.drawReference = ctx => this.drawReference(ctx);
    this.canvas.onGrid = () => this.renderChrome();
    // Opt+right-click: the active tool's parameters as sliders; right-click: the menu.
    try { const ac = localStorage.getItem('ams_accent'); if (ac) document.documentElement.style.setProperty('--wb-accent-2', ac); } catch { /* ignore */ }
    try { this.canvas.showPoints = localStorage.getItem('ams_show_points') === '1'; } catch { /* ignore */ }
    this.canvas.onContext = (e, hit, at) => (e.altKey ? openToolParams(this, e.clientX, e.clientY) : showMenu(this.contextItems(hit, at), e.clientX, e.clientY));
    this.activeBoard = MAIN;
    this.canvas.onBoardSelect = id => { this.activeBoard = id; this.emit('board'); };
    this.canvas.onBoardRename = id => this.renameBoard(id);
    this.canvas.onBoardContext = (id, e) => this.boardMenu(id, e.clientX, e.clientY);
    this.canvas.onDropAsset = (id, at) => this.placeAsset(id, at).catch(err => this.log(err.message, 'error'));
    this.canvas.onDropFiles = (files, at) => this.placeFiles(files, at).catch(err => this.log(err.message, 'error'));
    KIT.onImageLoad = () => this.canvas.invalidate();
    this.canvas.onCamera = () => { const z = this.zoomIsland?.querySelector('span'); if (z) z.textContent = `${Math.round(this.canvas.cam.z * 100)}%`; };
    this.topbar = h('div', { class: 'wb-topbar' });
    this.zoomIsland = h('div', { class: 'wb-island wb-zoom' });
    this.stageArea.append(this.topbar, this.zoomIsland);

    this.guide = new Guide(this);
    try { if (localStorage.getItem('ams_guide_enabled') === '0') this.guide.enabled = false; } catch { /* ignore */ }
    this.walkthroughs = new Walkthroughs(this);
    this.toolList = TOOLS.filter(Boolean);
    this.docsTopics = () => docsTopicList(this);
    // The Docs panel mounts on first open and then replaces this with its own openDocs.
    const openDocsFirst = id => { this.docks.open('docs'); if (this.openDocs !== openDocsFirst) this.openDocs(id); };
    this.openDocs ??= openDocsFirst;
    // Likewise the Timeline: opening a take mounts it first.
    const openTakeFirst = async id => { this.docks.open('timeline'); if (this.openTake !== openTakeFirst) return this.openTake(id); throw new Error('Timeline unavailable'); };
    this.openTake ??= openTakeFirst;
    // And the Code panel: Show code mounts it first.
    const openCodeFirst = (mode, arg) => { this.docks.open('script'); if (this.openCode !== openCodeFirst) return this.openCode(mode, arg); };
    this.openCode ??= openCodeFirst;
    loadLibrary();
    this.history = new History(this);
    this.scenes = new Scenes(this);
    this.scenes.on(() => this.renderChrome());
    try { const u = JSON.parse(localStorage.getItem('ams_ui') || 'null'); if (u) requestAnimationFrame(() => this.setUI(u)); } catch { /* ignore */ }
    // Performing: 1–9 go to a board; Shift+1–9 pick a brush slot; Ctrl+Shift+1–9 keep the active brush there.
    try { this.slots = JSON.parse(localStorage.getItem('ams_brush_slots') || '{}'); } catch { this.slots = {}; }
    window.addEventListener('keydown', e => {
      const m = /^Digit([1-9])$/.exec(e.code || '');
      if (!m || this.presenting || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable], .cm-editor')) return;
      const n = Number(m[1]);
      if (e.shiftKey && e.ctrlKey) { e.preventDefault(); this.keepSlot(n); }
      else if (e.shiftKey) { e.preventDefault(); this.useSlot(n); }
      else if (!e.ctrlKey) { const b = boardsOf(this.store.doc)[n - 1]; if (b) { e.preventDefault(); this.goToBoard(b.id, { animate: true }); } }
    }, true);
    this.recorder = new Recorder(this);
    this.player = new TakePlayer(this);
    this.shortcuts = new Shortcuts(this);
    this.registerPanels();
    const hadCamera = Boolean(localStorage.getItem('ams_workbench_camera_v1'));
    this.docks.render();
    requestAnimationFrame(() => { this.canvas.resize(); if (!hadCamera) this.canvas.fit(); this.renderChrome(); });
    this.bindKeys();
    this.renderChrome();
    this.assetStore.seed(bundledReferences()).catch(() => {});
    initWorkbenchMCP(this);
    this.log('Workbench ready.');
  }

  registerPanels() {
    const reg = (id, title, iconName, natural, mount, extra = {}) => this.docks.register({ id, title, icon: iconName, natural, mount: el => mount(el, this), ...extra });
    reg('stages', 'Stages', 'stages', 'left', mountStages);
    reg('scenes', 'Scenes', 'layers', 'left', mountScenes);
    reg('boards', 'Boards', 'board', 'left', mountBoards);
    reg('outliner', 'Outliner', 'layers', 'left', mountOutliner);
    reg('assets', 'Assets', 'assets', 'left', el => this.mountAssets(el));
    reg('properties', 'Properties', 'properties', 'right', mountProperties);
    reg('script', 'Code', 'script', 'right', mountCode);
    reg('process', 'Process', 'process', 'right', mountProcess);
    reg('generate', 'Generate', 'sparkles', 'right', mountGenerate);
    reg('assistant', 'Assistant', 'chat', 'right', mountAssistant);
    reg('decide', 'Decide', 'exercise', 'right', mountDecide);
    reg('docs', 'Docs', 'book', 'right', mountDocs);
    reg('settings', 'Settings', 'gear', 'right', mountSettings);
    reg('shortcuts', 'Shortcuts', 'keyboard', 'right', mountShortcuts);
    reg('timeline', 'Timeline', 'film', 'bottom', mountTimeline);
    reg('history', 'History', 'undo', 'bottom', mountHistory);
    reg('log', 'Log', 'log', 'bottom', mountLog, { allowBottom: true, openByDefault: false });
  }

  mountAssets(el) {
    this.assetPanel = new AssetPanel({
      store: this.assetStore,
      onOpen: a => this.openAsset(a),
      onPlace: a => { const c = this.canvas; this.placeAsset(a.id, c.toWorld(c.w / 2, c.h / 2)).catch(err => this.log(err.message, 'error')); },
      onUseAsReference: a => this.setReferenceFromBlob(a.blob, a.title),
      onExport: a => (a.kind === 'dataset' && a.program?.jsonl
        ? download(a.program.jsonl, `${a.title}.jsonl`, 'application/jsonl')
        : download(a.blob, `${a.title}.png`, a.blob.type))
    });
    this.assetPanel.render(el);
  }

  async openAsset(a) {
    if (a.kind === 'audio' || a.kind === 'text') { this.docks.open('timeline'); this.log(`Drag “${a.title}” onto the Timeline (or the canvas, for text).`); return; }
    if (a.kind === 'take' && a.program?.clips) { await this.openTake(a.id); return; }
    if (a.kind === 'walkthrough' && a.program?.steps) { await this.walkthroughs.loadUser(); this.walkthroughs.start(a.program.id); return; }
    if (a.kind === 'dataset' && a.program?.jsonl) {
      this.docks.open('decide');
      const added = this.decider.importJSONL(a.program.jsonl);
      this.log(`Dataset “${a.title}”: ${added} new decision labels added to Decide.`);
      return;
    }
    // A drawing opens as a new scene: the one you were working on stays as it was.
    if (a.program?.type === 'ams-process') { await this.scenes.create({ doc: a.program, title: a.title }); this.log(`Opened “${a.title}” as a new scene.`); return; }
    if (a.program?.actions) {
      const doc = dslToProcess(a.program, { title: a.title, width: a.width || 1000, height: a.height || 1000 });
      await this.scenes.create({ doc, title: a.title });
      this.log(`Opened “${a.title}” (converted from the first-phase drawing language).`);
      return;
    }
    await this.setReferenceFromBlob(a.blob, a.title);
  }

  async setReferenceFromBlob(blob, title = 'reference') {
    const img = new Image();
    img.src = URL.createObjectURL(blob);
    await img.decode();
    this.reference = { img, opacity: this.reference?.opacity ?? (Number(localStorage.getItem('ams_ref_opacity')) || 0.35), visible: true, title };
    this.log(`Reference: ${title} (under the artboard; not part of the picture).`);
    this.canvas.invalidate();
    this.renderChrome();
  }

  drawReference(ctx) {
    const r = this.reference;
    if (!r?.visible) return;
    const { width, height } = this.store.doc.artboard;
    const k = Math.max(width / r.img.naturalWidth, height / r.img.naturalHeight);
    const w = r.img.naturalWidth * k, hh = r.img.naturalHeight * k;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, width, height); ctx.clip();
    ctx.globalAlpha = r.opacity;
    ctx.drawImage(r.img, (width - w) / 2, (height - hh) / 2, w, hh);
    ctx.restore();
  }

  // ---- chrome ---------------------------------------------------------------------
  renderChrome() {
    if (!this.topbar) return;
    const doc = this.store.doc;
    // The chrome is minimal: tools in the middle, view controls and the menu on the right; scenes,
    // boards, stages live in panels (right-click and Opt+right-click for properties).
    const tools = h('div', { class: 'wb-island wb-tools-island' });
    for (const t of TOOLS) {
      if (!t) { tools.append(h('div', { class: 'wb-sep' })); continue; }
      const [id, tip, key] = t;
      tools.append(h('button', { class: `wb-tool${this.tool === id ? ' on' : ''}`, 'data-guide': `tool:${id}`, title: `${tip} (${key})`, html: `${icon(id)}<kbd>${key}</kbd>`, onclick: () => this.setTool(id) }));
    }
    // Construction: gesture and guide share a button showing the one in use (E, G still pick directly).
    const con = CONSTRUCTION.find(c => c[0] === this.tool) || CONSTRUCTION.find(c => c[0] === this.constructTool) || CONSTRUCTION[0];
    const conMenu = (x, y) => showMenu([{ label: 'Construction' }, ...CONSTRUCTION.map(([id, tip, key]) => ({ icon: icon(id), active: id === con[0], label: `${tip.split(':')[0]}`, hint: tip, keys: key, run: () => this.setTool(id) }))], x, y);
    const conBtn = h('button', { class: `wb-tool wb-tool-stack${CONSTRUCTION.some(c => c[0] === this.tool) ? ' on' : ''}`, 'data-guide': `tool:${con[0]}`, title: `${con[1]} (${con[2]}). Click again or right-click for gesture and guide`, html: `${icon(con[0])}<kbd>${con[2]}</kbd><span class="wb-tool-caret"></span>` });
    conBtn.addEventListener('click', () => { if (CONSTRUCTION.some(c => c[0] === this.tool)) { const r = conBtn.getBoundingClientRect(); conMenu(r.left, r.bottom + 4); } else this.setTool(con[0]); });
    conBtn.addEventListener('contextmenu', ev => { ev.preventDefault(); conMenu(ev.clientX, ev.clientY); });
    tools.append(conBtn);
    // Brush: the active brush (click again or right-click for the list).
    const bb = BRUSHES[this.brush.id] || BRUSHES.ink;
    const brushBtn = h('button', { class: `wb-tool wb-tool-stack${this.tool === 'brush' ? ' on' : ''}`, 'data-guide': 'tool:brush', title: `Brush: ${bb.label} (B). Click again or right-click for the brushes`, html: `${brushIcon(this.brush.id)}<kbd>B</kbd><span class="wb-tool-caret"></span>` });
    brushBtn.addEventListener('click', () => { if (this.tool === 'brush') { const r = brushBtn.getBoundingClientRect(); this.brushMenu(r.left, r.bottom + 4); } else this.setTool('brush'); });
    brushBtn.addEventListener('contextmenu', ev => { ev.preventDefault(); this.brushMenu(ev.clientX, ev.clientY); });
    // Sculpt: one button for the stack of sculpt tools (click again or right-click for the list).
    const st = SCULPTS[this.sculpt.tool];
    const sculptBtn = h('button', { class: `wb-tool wb-tool-stack${this.tool === 'sculpt' ? ' on' : ''}`, 'data-guide': 'tool:sculpt', title: `Sculpt: ${st?.label} (S; Shift+drag over a mark with other tools). Click again or right-click for the sculpt tools`, html: `${sculptIcon(this.sculpt.tool)}<kbd>S</kbd><span class="wb-tool-caret"></span>` });
    sculptBtn.addEventListener('click', ev => { if (this.tool === 'sculpt') { const r = sculptBtn.getBoundingClientRect(); this.sculptMenu(r.left, r.bottom + 4); } else this.setTool('sculpt'); });
    sculptBtn.addEventListener('contextmenu', ev => { ev.preventDefault(); this.sculptMenu(ev.clientX, ev.clientY); });
    tools.append(h('div', { class: 'wb-sep' }), brushBtn, sculptBtn);
    // Snap to grid: on shows the grid at full strength; off, fainter.
    const snapKey = this.shortcuts?.label('view.snap') || '';
    tools.append(h('div', { class: 'wb-sep' }), this.paintSwatches(), h('div', { class: 'wb-sep' }), h('button', { class: `wb-tool${this.canvas.grid.snap ? ' on' : ''}`, 'data-guide': 'tool:snap', title: `Snap to grid${snapKey ? ` (${snapKey})` : ''} · right-click: grid and drawing settings`, html: icon('snap'), onclick: () => this.canvas.setGrid({ snap: !this.canvas.grid.snap }), oncontextmenu: e => { e.preventDefault(); openGridParams(this, e.clientX, e.clientY + 8); } }));
    { const [id, tip, key] = NOTE_TOOL; tools.append(h('div', { class: 'wb-sep' }), h('button', { class: `wb-tool${this.tool === id ? ' on' : ''}`, 'data-guide': `tool:${id}`, title: `${tip} (${key})`, html: `${icon(id)}<kbd>${key}</kbd>`, onclick: () => this.setTool(id) })); }
    const right = h('div', { class: 'wb-island wb-view-island' },
      h('button', { class: 'wb-tool', 'data-guide': 'menu', title: 'Menu', html: icon('menu'), onclick: e => this.openMenu(e.currentTarget) }),
      h('div', { class: 'wb-sep' }),
      h('button', { class: 'wb-tool', 'data-guide': 'view', title: this.view.mode === 'process' ? 'Process: guides, gestures and notes shown (\\ for the picture)' : 'Picture: the finished picture (\\ for the process)', html: icon(this.view.mode === 'process' ? 'viewProcess' : 'viewPicture'), onclick: () => this.setViewMode(this.view.mode === 'picture' ? 'process' : 'picture') }),
      this.reference ? h('button', { class: `wb-tool${this.reference.visible ? ' on' : ''}`, title: `Reference underlay: ${this.reference.title} (R toggles)`, html: icon('picture'), onclick: () => { this.reference.visible = !this.reference.visible; this.canvas.invalidate(); this.renderChrome(); } }) : null,
      h('button', { class: `wb-tool${this.canvas.showPoints ? ' on' : ''}`, title: "Show marks' points (')", html: icon('points'), onclick: () => this.togglePoints() }),
      h('button', { class: 'wb-tool', 'data-guide': 'present', title: 'Present the boards (Opt+Cmd+P): ← → to move, Esc to leave', html: icon('play'), onclick: () => this.present(true) }),
      h('button', { class: 'wb-tool', title: 'Theme', html: icon(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun'), onclick: () => this.toggleTheme() })
    );
    // The menu island starts top-left, the tools top-centre; both can be dragged by their grip.
    this.topbar.replaceChildren(right, tools, h('div', { class: 'wb-topbar-spacer' }));
    this.makeMovable(right, 'view'); this.makeMovable(tools, 'tools');
    this.zoomIsland.replaceChildren(
      h('button', { class: 'wb-tool', title: 'Zoom out', html: icon('down'), onclick: () => this.canvas.zoomAt(this.canvas.w / 2, this.canvas.h / 2, 1 / 1.2) }),
      h('span', {}, `${Math.round((this.canvas?.cam.z || 1) * 100)}%`),
      h('button', { class: 'wb-tool', title: 'Zoom in', html: icon('up'), onclick: () => this.canvas.zoomAt(this.canvas.w / 2, this.canvas.h / 2, 1.2) }),
      h('button', { class: 'wb-tool', title: 'Fit the active board (F)', html: icon('fit'), onclick: () => { this.canvas.fit(60, this.activeBoard || MAIN); this.renderChrome(); } })
    );
    this.makeMovable(this.zoomIsland, 'zoom');
  }

  toggleTheme() {
    const t = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = t;
    try { localStorage.setItem('ams_theme', t); } catch { /* ignore */ }
    this.canvas.invalidate();
    this.renderChrome();
  }

  /** Layout control (ams_layout, walkthroughs): panels, docks, reference, view, fit, finding assets. */
  setLayout({ open = [], close = [], expand = [], collapse = [], reference, view, fit, find } = {}) {
    for (const id of open) if (this.docks.panels.has(id)) this.docks.open(id);
    for (const id of close) if (this.docks.panels.has(id)) this.docks.close(id);
    for (const d of expand) if (this.docks.state.collapsed[d]) this.docks.toggleDock(d);
    for (const d of collapse) if (!this.docks.state.collapsed[d]) this.docks.toggleDock(d);
    if (reference && this.reference) { if ('visible' in reference) this.reference.visible = Boolean(reference.visible); if ('opacity' in reference) this.reference.opacity = Number(reference.opacity); }
    if (view) this.setViewMode(view);
    if (fit) this.canvas.fit();
    if (find !== undefined && this.assetPanel) {
      this.docks.open('assets');
      const q = document.getElementById('assets-q');
      if (q) { q.value = find; q.dispatchEvent(new Event('input')); }
    }
    this.canvas.invalidate(); this.renderChrome();
    return { panels: Object.fromEntries(Object.entries(this.docks.state.active)), collapsed: { ...this.docks.state.collapsed }, reference: this.reference ? { title: this.reference.title, visible: this.reference.visible, opacity: this.reference.opacity } : null, view: this.view.mode };
  }

  /** The layout as it is, to restore later (walkthroughs put things back as they found them). */
  layoutSnapshot() { return { docks: structuredClone(this.docks.state), view: this.view.mode, reference: this.reference ? { visible: this.reference.visible, opacity: this.reference.opacity } : null, regions: this.showRegions }; }
  restoreLayout(snap) {
    if (!snap) return;
    this.docks.state = snap.docks; this.docks.save?.(); this.docks.render();
    this.setViewMode(snap.view);
    if (snap.reference && this.reference) Object.assign(this.reference, snap.reference);
    this.showRegions = snap.regions;
    this.canvas.resize(); this.canvas.invalidate(); this.renderChrome();
  }

  /** An image as a layer: downscaled into the drawing (so it travels with it), placed at a point. */
  async placeImage(blob, [wx, wy], { title = 'image', asset = null } = {}) {
    const url = URL.createObjectURL(blob);
    const img = new Image(); img.src = url; await img.decode();
    const max = 1600, k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const src = c.toDataURL(blob.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.88);
    const ab = this.store.doc.artboard;
    const w = ab.width * 0.4, h = w * (img.naturalHeight / img.naturalWidth);
    const x = wx - w / 2, y = wy - h / 2;
    const el = this.store.addElement({ role: 'image', stage: this.activeStage.id, src, asset, label: title, points: [[x, y, 0, 0.5], [x + w, y, 0, 0.5], [x + w, y + h, 0, 0.5], [x, y + h, 0, 0.5]], why: `placed: ${title}` });
    this.canvas.select([el.id]);
    this.log(`Placed “${title}” as an image layer.`);
    return el;
  }

  /** Drop from Assets: pictures become image layers; saved drawings come in as a group of their marks. */
  async placeAsset(id, at) {
    const a = await this.assetStore.get(id);
    if (!a) throw new Error('Asset not found');
    if (a.program?.type === 'ams-process') {
      const src = a.program, ab = this.store.doc.artboard;
      const k = (ab.width * 0.5) / (src.artboard?.width || ab.width);
      const ox = at[0] - (src.artboard.width * k) / 2, oy = at[1] - (src.artboard.height * k) / 2;
      const ids = this.store.change(`place ${a.title}`, d => {
        const gid = `group-${Math.random().toString(36).slice(2, 8)}`;
        d.groups = d.groups || {}; d.groups[gid] = { name: a.title };
        Object.assign(d.brushes = d.brushes || {}, src.brushes || {});
        Object.assign(d.lines = d.lines || {}, src.lines || {});
        const out = [];
        for (const e of src.elements || []) {
          if (e.role === 'note') continue;
          const c = structuredClone(e);
          c.id = `${e.role}-${Math.random().toString(36).slice(2, 9)}`;
          c.stage = this.activeStage.id; c.group = gid;
          c.points = c.points.map(([x, y, ...r]) => [ox + x * k, oy + y * k, ...r]);
          d.elements.push(c); out.push(c.id);
        }
        return out;
      });
      this.normalizeAfterPlace();
      this.canvas.select(ids);
      this.log(`Placed the drawing “${a.title}” as a group (${ids.length} marks).`);
      return;
    }
    if (a.kind === 'text') {
      const text = (await a.blob.text()).trim().slice(0, 4000);
      const el = this.store.addElement({ role: 'note', stage: this.activeStage.id, points: [[at[0], at[1], 0, 0.5]], text, note: structuredClone(this.defaults('note').note || {}), label: a.title, why: `from “${a.title}”` });
      this.canvas.select([el.id]);
      return;
    }
    if (a.kind === 'audio') { this.log('Sound goes on the Timeline: drag it there.'); this.docks.open('timeline'); return; }
    if (!a.blob) throw new Error('This asset has no picture');
    await this.placeImage(a.blob, at, { title: a.title, asset: a.id });
  }

  async placeFiles(files, at) {
    let [x, y] = at;
    for (const f of files.filter(f => f.type.startsWith('image/'))) { await this.placeImage(f, [x, y], { title: f.name.replace(/\.[^.]+$/, '') }); x += 30; y += 30; }
  }

  normalizeAfterPlace() { this.store.doc = normalizeDocument(this.store.doc); this.canvas.invalidate(); this.emit('document', 'place'); }

  /** Right-click: operations on the selection (or the canvas, when nothing is under the pointer). */
  contextItems(hit, [wx, wy] = [0, 0]) {
    const sc = id => this.shortcuts.label(id);
    const ids = [...this.canvas.selected];
    if (!hit || !ids.length) {
      return [
        { label: 'Select all', keys: sc('edit.selectAll'), run: () => this.canvas.select(this.store.doc.elements.filter(el => this.canvas.editable(el)).map(el => el.id)) },
        { label: 'Fit artboard', keys: sc('view.fit'), run: () => { this.canvas.fit(); this.renderChrome(); } },
        '-',
        { label: this.canvas.grid.show === 'off' ? 'Show grid' : 'Hide grid', run: () => this.canvas.setGrid({ show: this.canvas.grid.show === 'off' ? 'paper' : 'off' }) },
        { label: this.canvas.grid.snap ? 'Snap off' : 'Snap to grid', run: () => this.canvas.setGrid({ snap: !this.canvas.grid.snap }) },
        '-',
        { label: 'Note here', run: () => { this.setTool('note'); const [sx, sy] = this.canvas.toScreen(wx, wy); this.canvas.startNote(sx, sy, wx, wy); } }
      ];
    }
    const els = this.store.doc.elements.filter(el => ids.includes(el.id));
    const n = els.length, one = n === 1 ? els[0] : null;
    const grouped = els.some(el => el.group);
    const lineish = els.some(el => el.points.length > 3 && !['point', 'note', 'image'].includes(el.role));
    const brushes = one && !['note', 'image'].includes(one.role) ? brushesForRole(one.role, this.store.doc) : [];
    const z = this.canvas.cam.z;
    const simplify = tol => { const r = this.store.simplify(ids, tol / z); this.log(`Simplified: ${r.before} → ${r.after} points.`); };
    return [
      { label: one ? (one.label || one.role) : `${n} elements` },
      { label: 'Arrange', items: [
        { label: 'Bring to front', run: () => this.store.arrange(ids, 'front') },
        { label: 'Bring forward', run: () => this.store.arrange(ids, 'forward') },
        { label: 'Send backward', run: () => this.store.arrange(ids, 'backward') },
        { label: 'Send to back', run: () => this.store.arrange(ids, 'back') }
      ] },
      { label: 'Move to stage', items: this.store.doc.stages.map(st => ({ label: st.name, run: () => this.store.patchElements(ids, { stage: st.id }, 'stage') })) },
      brushes.length ? { label: 'Brush', items: brushes.map(b => ({ icon: brushIcon(b.id), label: b.label, run: () => this.store.change('brush', d => { for (const el of d.elements) if (ids.includes(el.id)) el.realize = { brush: b.id, params: {} }; }) })) } : null,
      lineish ? { label: 'Sculpt', hint: 'Brush the selected marks into shape (Shift+drag over a mark does it with any tool)', items: [
        ...Object.entries(SCULPTS).map(([id, t]) => ({ icon: sculptIcon(id), active: id === this.sculpt.tool, label: `${t.label}`, hint: t.doc, run: () => { this.setSculpt({ tool: id }); this.setTool('sculpt'); } })),
        '-',
        { label: 'Settings…', hint: 'Opt+right-click anywhere', run: () => { const [sx, sy] = this.canvas.toScreen(wx, wy); const r = this.canvas.canvas.getBoundingClientRect(); this.setTool('sculpt'); openToolParams(this, r.left + sx, r.top + sy); } },
        { label: 'Show code', run: () => this.openCode?.('sculpt', this.sculpt.tool) }
      ] } : null,
      lineish ? { label: 'Simplify', hint: 'Fewer points, same shape', items: [
        { label: 'Lightly', run: () => simplify(1.5) }, { label: 'Moderately', run: () => simplify(4) }, { label: 'Strongly', run: () => simplify(10) }
      ] } : null,
      '-',
      { label: 'Duplicate', run: () => { const out = this.store.duplicate(ids, 20 / z, 20 / z); this.canvas.select(out); } },
      n > 1 ? { label: 'Group', keys: sc('edit.group'), run: () => this.groupSelection() } : null,
      grouped ? { label: 'Ungroup', keys: sc('edit.ungroup'), run: () => this.ungroupSelection() } : null,
      { label: 'Lock', hint: 'Locked marks cannot be picked on the canvas (unlock in the Outliner)', run: () => { this.store.patchElements(ids, { locked: true }, 'lock'); this.canvas.select([]); } },
      { label: 'Hide', hint: 'Show again from the Outliner', run: () => { this.store.patchElements(ids, { hidden: true }, 'hide'); this.canvas.select([]); } },
      { label: 'Show code', hint: 'The selected marks as code: edit and apply', run: () => this.openCode?.('selection') },
      one && one.realize?.brush && !['none', 'image'].includes(one.realize.brush) ? { label: 'Brush code', hint: `The code of the “${one.realize.brush}” brush`, run: () => this.openCode?.('brush', one.realize.brush) } : null,
      { label: 'Show in Outliner', run: () => { this.docks.open('outliner'); this.emit('selection'); } },
      '-',
      { label: 'Delete', keys: sc('edit.delete'), run: () => this.store.removeElements(ids) }
    ];
  }

  openMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    showMenu([
      { label: 'New scene', keys: this.shortcuts.label('scene.new'), hint: 'An empty drawing in this project; the others stay', run: () => this.scenes.create() },
      { label: 'New project', hint: 'Start over with one empty scene', items: [
        { label: 'Keep this project in Assets, then start', run: () => this.newProject({ keep: true }) },
        { label: 'Start without keeping it', run: () => this.newProject({ keep: false }) },
        { label: 'Cancel', run: () => {} }
      ] },
      { label: 'Open file', hint: 'Process JSON, SVG with a process record, Excalidraw, or an image as reference', run: () => this.openFile() },
      { label: 'Save to Assets', keys: this.shortcuts.label('file.save'), run: () => this.saveToAssets() },
      { label: 'Export', items: [
        { label: 'PNG', hint: 'The picture (or the process view, if shown)', run: () => this.exportAs('png') },
        { label: 'SVG', hint: 'With the full process record inside; opens again as a process', run: () => this.exportAs('svg') },
        { label: 'p5.js sketch', hint: 'A zip whose sketch re-runs the score', run: () => this.exportAs('p5') },
        { label: 'Process sheet', hint: 'Stages, decisions and reasons on one page (PNG)', run: () => this.exportAs('sheet') },
        { label: 'Page (HTML)', hint: 'Every board as a section: picture, process, replay and its text. The drawing travels inside', run: () => this.exportAs('page') },
        { label: 'JSON', hint: 'The process document', run: () => this.exportAs('json') },
        { label: 'Excalidraw', run: () => this.exportAs('excalidraw') }
      ] },
      '-',
      { label: 'Settings', keys: this.shortcuts.label('app.settings'), run: () => this.docks.open('settings') },
      { label: 'Shortcuts', keys: this.shortcuts.label('app.shortcuts'), run: () => this.docks.open('shortcuts') },
      { label: 'Command palette', keys: this.shortcuts.label('app.palette'), run: () => openPalette(this) },
      { label: 'Docs', keys: this.shortcuts.label('app.docs'), run: () => this.openDocs() },
      '-',
      { label: 'Panels' },
      ...[...this.docks.panels.values()].filter(p => !['settings', 'shortcuts'].includes(p.id)).map(p => ({ label: p.title, run: () => this.docks.open(p.id) })),
      { label: 'Reset layout', run: () => this.docks.reset() },
      '-',
      { label: 'Classic studio', hint: 'The earlier studio (generation, mediums, training)', run: () => { window.location.href = '/classic.html'; } }
    ], r.left, r.bottom + 6);
  }


  slug() { return String(this.store.doc.title || 'drawing').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'drawing'; }

  /** Export a board (the main one unless given) as png, sheet, svg, json, excalidraw or p5. */
  async exportAs(kind, board = this.activeBoard || MAIN) {
    const b = boardById(this.store.doc, board) || boardById(this.store.doc, MAIN);
    // json keeps the whole drawing (every board); the rest is one board as a picture.
    const doc = kind === 'json' || kind === 'page' ? this.store.doc : boardDoc(this.store.doc, b.id);
    const s = b.main ? this.slug() : `${this.slug()}-${String(b.title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (kind === 'png') renderToCanvas(doc, { scale: 2, mode: this.view.mode }).toBlob(b => download(b, `${s}.png`, 'image/png'));
    else if (kind === 'sheet') processSheet(doc).toBlob(b => download(b, `${s}-process.png`, 'image/png'));
    else if (kind === 'svg') download(toSVG(doc, { mode: this.view.mode }), `${s}.svg`, 'image/svg+xml');
    else if (kind === 'json') download(JSON.stringify(doc, null, 2), `${s}.ams.json`, 'application/json');
    else if (kind === 'page') download(sceneHtml(this.store.doc), `${this.slug()}.html`, 'text/html');
    else if (kind === 'excalidraw') download(JSON.stringify(toExcalidraw(doc), null, 2), `${s}.excalidraw`, 'application/json');
    else if (kind === 'p5') {
      const zip = createZip([{ name: 'index.html', data: p5IndexHtml(doc.title) }, { name: 'sketch.js', data: toP5(doc) }]);
      download(new Blob([zip], { type: 'application/zip' }), `${s}-p5.zip`, 'application/zip');
    }
    this.log(`Exported ${kind}${b.main || kind === 'page' || kind === 'json' ? '' : ` (${b.title})`}.`);
  }

  openFile() {
    const input = h('input', { type: 'file', accept: '.json,.svg,.html,.excalidraw,application/json,image/svg+xml,text/html,image/*' });
    input.addEventListener('change', async () => {
      const f = input.files[0];
      if (!f) return;
      if (f.type.startsWith('image/') && !f.name.endsWith('.svg')) return this.setReferenceFromBlob(f, f.name);
      const text = await f.text();
      try {
        let doc;
        if (f.name.endsWith('.html') || /<html[\s>]/i.test(text.slice(0, 400))) { doc = docFromPage(text); if (!doc) throw new Error('no drawing inside this page'); }
        else if (f.name.endsWith('.svg') || text.trim().startsWith('<')) doc = fromSVG(text);
        else {
          const j = JSON.parse(text);
          doc = j.type === 'excalidraw' || Array.isArray(j.elements) && j.elements[0]?.type && !j.stages ? fromExcalidraw(j) : j.actions ? dslToProcess(j) : j;
        }
        doc.title ||= f.name.replace(/\.[^.]+$/, '');
        await this.scenes.create({ doc, title: doc.title });
        this.log(`Opened ${f.name}.`);
      } catch (err) { this.log(`Could not open ${f.name}: ${err.message}`, 'error'); }
    });
    input.click();
  }

  /** The reference underlay as a JPEG data URL (for models with image input). */
  referenceDataUrl(max = 768) {
    const img = this.reference?.img;
    if (!img) return null;
    const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.85);
  }

  async saveToAssets() { return this.saveDocToAssets(this.store.doc); }

  async saveDocToAssets(doc, { tags = [] } = {}) {
    const blob = canvasBlob(renderToCanvas(doc, { scale: Math.min(1, 1200 / Math.max(doc.artboard.width, doc.artboard.height)), mode: 'picture' }));
    const a = await this.assetStore.add(blob, {
      title: doc.title || 'Untitled', kind: 'process', folder: this.assetPanel?.folder || '',
      tags: [...new Set([...tags, ...doc.stages.map(s => s.kind)])], program: structuredClone(doc),
      meta: { stages: doc.stages.length, elements: doc.elements.length, decisions: doc.decisions.length }
    });
    this.log(`Saved “${a.title}” to Assets.`);
    return a;
  }

  // ---- keys ------------------------------------------------------------------------
  bindKeys() { /* keys live in this.shortcuts (see shortcuts.js) */ }

}

export { ROLES };
