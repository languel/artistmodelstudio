/**
 * Artist Model Studio workbench: an infinite canvas with an artboard, dockable panels,
 * and the process document at the center. Everything the user can do is also a
 * command (see mcp.js), so agents drive the same surface.
 */
import { openToolParams, openGridParams, openToolDefaults, openBoardParams } from './toolParams.js';
import { openRadial } from './radial.js';
import { boardAt, boardDoc, boardById, boardsOf, boardKind, findBoard, isFrame, boardsInFrame, slidesOf, MAIN, BLACKBOARD, boardForPoints, trainBoard, rateOf, newBoardId, nextBoardPlace } from '../process/boards.js';
import { FX, normalizeFx } from '../process/fx.js';
import { linksOf } from '../process/markdown.js';
import { sceneHtml, docFromPage, pageBoards, sourcesOf } from '../process/page.js';
import { Scenes } from './scenes.js';
import { runScoreInto } from '../process/script.js';
import { toP5Min } from '../process/p5min.js';
import { SCULPTS, loadSculptLibrary } from '../process/sculpt.js';
import { ProcessStore, createDocument, normalizeDocument, normalizeElement, DEFAULT_REALIZE, ROLES } from '../process/document.js';
import { toSVG, fromSVG, toExcalidraw, fromExcalidraw, toP5, p5IndexHtml, processSheet } from '../process/exports.js';
import { dslToProcess } from '../process/fromDsl.js';
import { canvasBlob } from './ui.js';
import { renderToCanvas, renderDocument } from '../process/render.js';
import { EXERCISES } from '../process/exercises.js';
import { runScript } from '../process/script.js';
import { onFitReady, fitTimes } from '../process/fit.js';
import { createZip } from '../export/zip.js';
import { AssetStore } from '../assets/assetStore.js';
import { AssetPanel } from '../ui/AssetPanel.js';
import { DockManager } from './dock.js';
import { CanvasView, TOOL_KEYS } from './canvasView.js';
import { icon, brushIcon, sculptIcon, nodeIcon } from './icons.js';
import { NODE_KINDS, NODE_INFO, MODES } from '../score/nodes.js';
import { SCORE_LOOK } from './scoreOverlay.js';
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
import { mountMixer } from './panels/mixer.js';
import { Recorder } from './recorder.js';
import { History } from './history.js';
import { mountHistory } from './panels/history.js';
import { TakePlayer } from './takePlayer.js';
import { ScorePlayer } from './scorePlayer.js';
import { ScoreOverlay } from './scoreOverlay.js';
import { PlayTool, PLAY_KINDS } from './playTool.js';
import { openPlayPopover } from './playPopover.js';
import * as Rel from '../score/relations.js';
import { nearestPath } from '../score/geometry.js';
import { realizeAfter } from '../process/playparts.js';
import { PRESETS as SOUNDS, DEFAULTS as SOUND_DEFAULTS, emitFor as soundCode, readPreset as readSound } from '../score/presets.js';
import { loadLibrary } from '../process/brushes.js';
import { mountDocs, docsTopicList } from './panels/docs.js';
import { Walkthroughs } from './walkthroughs.js';
import { openPalette } from './palette.js';
import { showMenu } from './menu.js';
import { askText, askConfirm } from './dialog.js';
import { brushesForRole, KIT, BRUSHES } from '../process/brushes.js';
import { txStats } from '../process/texture.js';
import { Composer } from './masks.js';
import { Shortcuts } from './shortcuts.js';
import { eyedropToTarget, openPaintPicker } from './colorPicker.js';
import { ArtistRegistry } from '../artists/artistRegistry.js';
import { initWorkbenchMCP } from './mcp.js';
import { Sources } from './sources.js';
import { startDiagnostics } from './diagnostics.js';
import { BoardFrames } from './boardFrames.js';
import { boardPart, scenePart, selectionPart, importPart, isPart } from '../process/parts.js';
import { p5ToStudio, isStudioSketch, textKind, p5Size } from '../process/convert.js';
import { toP5Code, p5SketchHtml, usesMl5 } from '../process/p5code.js';
import { readRecently } from '../process/streams.js';
import { mountSources } from './panels/sources.js';
import { mountGestures } from './panels/gestures.js';
import { Gestures } from './gestures.js';
import { Playlists } from './playlists.js';
import { writePlaylist } from '../process/playlist.js';
import { SOURCE_DEMOS } from './sourceDemos.js';

import { Guide } from './guide.js';

const DOC_KEY = 'ams_process_doc_v1';
const DEFAULTS_KEY = 'ams_tool_defaults_v1';
const TOOLS = [
  ['select', 'Select and move', 'V'], ['hand', 'Pan', 'H'], ['laser', 'Laser pointer: a trail in the stroke color that fades out and leaves no mark', 'K'], ['board', 'Board: drag out a new artboard (Shift keeps it square)', ';'], null,
  ['point', 'Point: a mark at a place (dimension 0)', '0'], ['line', 'Line: a point that moved (dimension 1)', '1'], ['plane', 'Plane: an enclosed area (dimension 2)', '2'], null,
];
/** Select and direct selection (points) share a button. */
const SELECTS = [['select', 'Select and move', 'V'], ['direct', 'Direct: edit points (click a mark, drag its points; double-click a segment adds one; Ctrl snaps)', '⇧V']];
/**
 * Line, gesture and guide share a button (1; Shift+1 cycles). A gesture and a guide are construction: they show
 * in the process view, not in the picture.
 */
const LINES = [
  ['line', 'Line: a point that moved (dimension 1)', '1'],
  ['gesture', 'Gesture: the movement behind a form (construction: process view only)', '⇧1'],
  ['guide', 'Guide: construction, straight; Shift snaps the angle (process view only)', '⇧1']
];
/** Plane, circle and rectangle share a button (2; Shift+2 cycles). All three make plane marks. */
const PLANES = [
  ['plane', 'Plane: an enclosed area (dimension 2)', '2'],
  ['circle', 'Circle: drag a box, an ellipse in it (Shift: a circle, Alt: from the center). Smooth is round; straight is a polygon', '⇧2'],
  ['rect', 'Rectangle: drag a box (Shift: a square, Alt: from the center)', '⇧2']
];
/** The drawing tools whose path (smooth or straight) is the tool's state, and the defaults they keep it in. */
const PATH_TOOLS = { line: 'line', plane: 'plane', circle: 'plane', gesture: 'gesture', guide: 'guide', brush: 'brush' };
const NOTE_TOOL = ['note', 'Note: a written annotation', 'T'];
const BRUSH_KEY = 'ams_brush_active';
/** Settings of the shape tools (right-click the tool): a circle's sides, a rectangle's roundness (0 square, 1 a pill). */
const SHAPES_KEY = 'ams_shapes_v1';
const SHAPE_DEFAULTS = { circle: { sides: 12 }, rect: { round: 0 } };
const SCULPT_KEY = 'ams_sculpt_v1';

export class Workbench {
  /**
   * opts.embed: the editor as a component inside a host page (see src/embed/). { document, persist }: the host owns
   * the document; with persist off (the default) nothing is autosaved, no scenes store, no bundled samples.
   */
  constructor(root, opts = {}) {
    this.root = root;
    this.embed = opts.embed || null;
    this.persist = !this.embed || Boolean(this.embed.persist);
    this.handlers = new Map();
    this.logLines = [];
    let saved = null;
    if (this.persist) { try { saved = JSON.parse(localStorage.getItem(DOC_KEY) || 'null'); } catch { /* ignore */ } }
    if (!saved && this.embed) saved = this.embed.document ? normalizeDocument(this.embed.document) : createDocument();
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
    this.shapes = structuredClone(SHAPE_DEFAULTS);
    try { const s = JSON.parse(localStorage.getItem(SHAPES_KEY) || '{}'); for (const k of Object.keys(SHAPE_DEFAULTS)) Object.assign(this.shapes[k], s[k]); } catch { /* ignore */ }
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
    // Whatever is waiting to be saved is saved when the page goes away.
    window.addEventListener('pagehide', () => { if (this.saveTimer) { clearTimeout(this.saveTimer); this.saveTimer = 0; this.saveDoc(); } if (this.persistTimer) { clearTimeout(this.persistTimer); this.persistTimer = 0; this.scenes?.persist().catch(() => {}); } });
    this.sources = new Sources(this);
    this.composer = new Composer(this);
    this.gestures = new Gestures(this);
    this.playlists = new Playlists(this);
    this.artists = new ArtistRegistry();
    this.store.subscribe((doc, reason) => {
      // At most one save per interval (3 s while boards run live: a large scene is a large save), not a
      // debounce: a board following its sources changes the drawing many times a second, and a
      // debounce would never save while it runs.
      if (this.persist && !this.saveTimer) this.saveTimer = setTimeout(() => { this.saveTimer = 0; this.saveDoc(); }, reason === 'live board code' ? 3000 : 300);
      // The scene store (IndexedDB) keeps it too, less often: it has room for large drawings.
      if (this.persist && !this.persistTimer && this.scenes && reason !== 'scene') this.persistTimer = setTimeout(() => { this.persistTimer = 0; this.scenes.persist().catch(() => {}); }, reason === 'live board code' ? 5000 : 1500);
      if (reason === 'live board code') return;   // a live redraw: saved, drawn; the panels stay as they are
      this.perfTick?.();   // a board's performance switch (or a scene with some) starts or stops the count
      if (!this.store.doc.stages.some(s => s.id === this.activeStageId)) this.activeStageId = this.store.doc.stages[0]?.id;
      this.emit('document', reason);
      this.renderChrome();
    }, { live: true });
  }

  // ---- events ------------------------------------------------------------------
  on(name, fn) { (this.handlers.get(name) || this.handlers.set(name, new Set()).get(name)).add(fn); }
  emit(name, ...a) { for (const fn of this.handlers.get(name) || []) { try { fn(...a); } catch (err) { console.error(`${name} listener failed:`, err); } } }
  log(text, kind = 'info') { this.logLines.push({ t: Date.now(), text, kind }); if (this.logLines.length > 400) this.logLines.shift(); this.emit('log'); }

  // ---- state ---------------------------------------------------------------------
  get activeStage() { return this.store.doc.stages.find(s => s.id === this.activeStageId) || this.store.doc.stages[0]; }
  setActiveStage(id) { this.activeStageId = id; this.emit('stage'); this.renderChrome(); }
  /** The brushes the brush stack offers (the Brush button's list). */
  brushIds() { return Object.keys(BRUSHES).filter(id => !BRUSHES[id].construction && BRUSHES[id].roles?.some(r => ['line', 'plane', 'gesture'].includes(r))); }

  /** The defaults a tool draws with: circle and rectangle make planes, so they use the plane's. */
  toolRole(tool = this.tool) { return tool === 'circle' || tool === 'rect' ? 'plane' : tool; }

  /** The tools of the current toolset, for the radial menu: a stack's members, the brushes, the sculpt tools, or the top-level tools. */
  radialItems() {
    const t = this.tool;
    const tipLabel = tip => tip.split(':')[0];
    const stack = list => list.map(([id, tip]) => ({ id, label: tipLabel(tip), icon: this.pathIcon(id), active: id === t, run: () => this.setTool(id) }));
    if (SELECTS.some(c => c[0] === t)) return stack(SELECTS);
    if (LINES.some(c => c[0] === t)) return stack(LINES);
    if (PLANES.some(c => c[0] === t)) return stack(PLANES);
    if (t === 'brush') return this.brushIds().map(id => ({ id, label: BRUSHES[id].label, icon: brushIcon(id), active: id === this.brush.id, run: () => { this.pickBrush(id, { apply: false }); this.setTool('brush'); } }));
    if (t === 'sculpt') return Object.entries(SCULPTS).map(([id, st]) => ({ id, label: st.label, icon: sculptIcon(id), active: id === this.sculpt.tool, run: () => { this.setSculpt({ tool: id }); this.setTool('sculpt'); } }));
    // Play: its kinds (point at things, path, traveler, event, gate, body, node); with Node chosen, the kinds of node.
    if (t === 'play') {
      if (this.playKind === 'node') return NODE_KINDS.map(k => ({ id: k, label: NODE_INFO[k].label, icon: nodeIcon(k), active: k === this.playNodeKind, run: () => this.setPlayNodeKind(k) }));
      return PLAY_KINDS.map(([id, label]) => ({ id, label, icon: this.playKindIcon(id), active: id === this.playKind, run: () => (id === 'node' ? this.setPlayNodeKind(this.playNodeKind || 'note') : this.setPlayKind(id)) }));
    }
    // Pan, laser, board, point, note: the top-level tools.
    const top = [['select', 'Select'], ['hand', 'Pan'], ['laser', 'Laser'], ['board', 'Board'], ['point', 'Point'], ['line', 'Line'], ['plane', 'Plane'], ['brush', 'Brush'], ['sculpt', 'Sculpt'], ['play', 'Play'], ['note', 'Note']];
    return top.map(([id, label]) => ({ id, label, icon: this.pathIcon(id), active: id === t, run: () => this.setTool(id) }));
  }

  /** Shift+Space: the radial menu of the current tools at the pointer (hold, move toward one, release). */
  openRadial() {
    if (this.radial) return;
    const [x, y] = this.pointerAt || [window.innerWidth / 2, window.innerHeight / 2];
    this.radial = openRadial({ items: this.radialItems(), x, y, onClose: () => { this.radial = null; } });
  }

  // ---- the Play tool ---------------------------------------------------------------------------
  cyclePlayKind() {
    // Every kind, and every kind of node in turn (node:note, node:cc…).
    const ids = PLAY_KINDS.flatMap(k => (k[0] === 'node' ? NODE_KINDS.map(n => `node:${n}`) : [k[0]]));
    const cur = this.playKind === 'node' ? `node:${this.playNodeKind}` : this.playKind;
    const next = ids[((this.tool === 'play' ? ids.indexOf(cur) : -1) + 1) % ids.length];
    if (next.startsWith('node:')) this.setPlayNodeKind(next.slice(5)); else this.setPlayKind(next);
    this.toolLabel(this.playKind === 'node' ? NODE_INFO[this.playNodeKind].label : PLAY_KINDS.find(k => k[0] === this.playKind)[1], this.playKindIcon(this.playKind), 'tool:play');
  }

  /**
   * Say what a tool just became: a small label under its button; with the tools hidden (zen), its glyph at the pointer.
   * Replaced by the next one, gone after a moment.
   */
  toolLabel(text, glyphHtml, guide) {
    this._toolLabel?.remove();
    clearTimeout(this._toolLabelT);
    const btn = this.ui?.tools === false ? null : document.querySelector(`[data-guide="${guide}"]`);
    const r = btn?.getBoundingClientRect();
    const tip = h('div', { class: `wb-toollabel${r && r.width ? '' : ' glyph'}`, html: r && r.width ? '' : glyphHtml });
    if (r && r.width) { tip.textContent = text; Object.assign(tip.style, { left: `${r.left + r.width / 2}px`, top: `${r.bottom + 6}px` }); }
    else { const [px, py] = this.pointerAt || [innerWidth / 2, innerHeight / 2]; Object.assign(tip.style, { left: `${px + 18}px`, top: `${py + 18}px` }); tip.title = text; }
    document.body.append(tip);
    this._toolLabel = tip;
    this._toolLabelT = setTimeout(() => { tip.classList.add('out'); setTimeout(() => tip.remove(), 250); }, 1100);
  }
  /** The kind of node the Play tool places. */
  setPlayNodeKind(k) {
    this.playNodeKind = NODE_KINDS.includes(k) ? k : 'note';
    try { localStorage.setItem('ams_playnode', this.playNodeKind); } catch { /* ignore */ }
    this.setPlayKind('node');
  }
  setPlayKind(k) {
    this.playKind = k;
    try { localStorage.setItem('ams_playkind', k); } catch { /* ignore */ }
    this.canvas.endPick?.();
    if (this.tool !== 'play') this.setTool('play'); else this.renderChrome();
  }

  /** The Play tool's kinds, solo and the rest, as a menu (click its button again, or right-click it). */
  playMenu(x, y) {
    const solo = Boolean(this.score?.solo);
    showMenu([{ label: 'Play' },
      ...PLAY_KINDS.map(([id, label, hint]) => (id === 'node'
        ? { icon: this.playKindIcon(id), active: id === this.playKind, label: `Node: ${NODE_INFO[this.playNodeKind].label}`, hint, items: NODE_KINDS.map(k => ({ icon: nodeIcon(k), active: this.playKind === 'node' && k === this.playNodeKind, label: NODE_INFO[k].label, hint: NODE_INFO[k].hint, run: () => this.setPlayNodeKind(k) })) }
        : { icon: this.playKindIcon(id), active: id === this.playKind, label, hint, run: () => this.setPlayKind(id) })),
      '-',
      { label: solo ? 'Solo off (all marks sound)' : 'Solo the selection', hint: 'Only the selected marks sound, with what they need (their path, what they send to)', keys: this.shortcuts?.label('score.solo'), run: () => this.toggleSolo() },
      { label: this.scoreView.names ? 'Hide names' : 'Show names', hint: 'The names of marks that play (the id when a mark has none), and the links between them', run: () => this.setScoreView({ names: !this.scoreView.names }) },
      { label: 'Stop all sound', run: () => this.score?.panic() }], x, y);
  }

  playKindIcon(id) { return id === 'node' ? nodeIcon(this.playNodeKind || 'note') : ({ link: icon('score'), path: brushIcon('path'), traveler: brushIcon('traveler'), trigger: brushIcon('trigger'), gate: icon('gate'), body: brushIcon('body') })[id]; }

  /** Solo the selected marks that play (again: everything sounds). */
  toggleSolo() {
    if (this.score.solo) { this.score.setSolo(null); this.canvas.flash('All marks sound'); return; }
    const ids = this.selectedElements().filter(e => e.play).map(e => e.id);
    if (!ids.length) { this.canvas.flash('Select marks that play, then solo them'); return; }
    this.score.setSolo(ids);
    this.canvas.flash(`Solo: ${ids.length} mark${ids.length === 1 ? '' : 's'}`);
  }

  /** The Play submenu of the selection's right-click menu: make marks play, attach and link them. */
  playMenuItems(ids) {
    const doc = this.store.doc, els = doc.elements.filter(e => ids.includes(e.id));
    if (!els.length || els.every(e => e.role === 'note' || e.role === 'image')) return null;
    const one = els.length === 1 ? els[0] : null;
    const edit = (label, fn) => this.store.change(label, d => { for (const e of d.elements) if (ids.includes(e.id)) fn(d, e); });
    const paths = doc.elements.filter(e => e.points?.length >= 2 && ['line', 'gesture', 'guide'].includes(e.role));
    const link = () => {
      if (!one) return;
      this.canvas.startPick({ accept: x => x.id !== one.id, onPick: t => {
        const rel = Rel.infer(one, t);
        if (!rel) { this.canvas.flash('Nothing to make between those'); return; }
        this.store.change('link', d => Rel.apply(d, rel)); this.canvas.flash(rel.label);
      } });
      this.log('Click the mark to link to (Esc cancels).');
    };
    const attach = () => {
      const m = els.filter(e => e.id !== els[0].id)[0] || els[0];
      const near = nearestPath(paths.filter(p => !ids.includes(p.id)), ...Rel.centerPoint(m), Infinity);
      if (!near) { this.canvas.flash('There is no line to attach to'); return; }
      this.store.change('attach', d => { for (const e of els) { if (e.role === 'point' && !e.play?.trigger) Rel.travel(d, e.id, near.mark.id); else Rel.place(d, e.id, near.mark.id); } });
      this.canvas.flash(`On ${near.mark.label || near.mark.id}`);
    };
    const set = (part, init) => () => edit(`play ${part}`, (d, e) => { e.play = { ...(e.play || {}) }; if (e.play[part]) delete e.play[part]; else e.play[part] = init(e, d); const r = realizeAfter(e, e.play); if (r !== e.realize) e.realize = { ...r }; if (!Object.keys(e.play).length) delete e.play; });
    const items = [
      { label: els.every(e => e.play?.path) ? 'Not a path' : 'Make a path', run: set('path', () => true) },
      { label: els.every(e => e.play?.travel) ? 'Not a traveler' : 'Make a traveler', run: set('travel', () => ({ on: '' })) },
      { label: els.every(e => e.play?.trigger) ? 'Not an event' : 'Make an event', run: set('trigger', () => ({ emit: soundCode(SOUND_DEFAULTS.height) })) },
      { label: els.every(e => e.play?.body) ? 'Not a body' : 'Make a body', run: set('body', () => ({ speed: [60, 200] })) },
      { label: els.every(e => e.play?.node) ? 'Not a node' : 'Make a node', hint: 'A Midinous node: it plays, counts or decides when a traveler reaches it, and sends the signal on', run: set('node', () => ({ kind: this.playNodeKind || 'note' })) },
      '-',
      ...(els.every(e => e.play?.node) ? [
        { label: 'Node kind', items: NODE_KINDS.map(k => ({ icon: nodeIcon(k), label: NODE_INFO[k].label, hint: NODE_INFO[k].hint, active: one?.play.node.kind === k, run: () => edit('node kind', (d, e) => { e.play.node = { ...e.play.node, kind: k }; }) })) },
        { label: 'Sends', items: MODES.map(m => ({ label: m, active: (one?.play.node.mode || 'robin') === m, run: () => edit('node mode', (d, e) => { e.play.node = { ...e.play.node, mode: m }; if (m === 'robin') delete e.play.node.mode; }) })) },
        { label: one?.play.node.start ? 'Not a start' : 'A start', hint: 'It fires when play starts', run: () => edit('node start', (d, e) => { e.play.node = { ...e.play.node, start: !one?.play.node.start || undefined }; if (!e.play.node.start) delete e.play.node.start; }) },
        { label: one?.play.node.mute ? 'Unmute' : 'Mute', run: () => edit('node mute', (d, e) => { e.play.node = { ...e.play.node, mute: !one?.play.node.mute || undefined }; if (!e.play.node.mute) delete e.play.node.mute; }) },
        '-'] : []),
      { label: 'Attach to the nearest line', hint: 'A point travels it, from its start; anything else moves onto it', run: attach },
      one ? { label: 'Link to…', hint: 'Click another mark: what they are decides the relation (travels, sends to, starts)', run: link } : null,
      one?.play?.travel?.on ? { label: 'Detach from its path', run: () => edit('detach', (d, e) => { if (e.play?.travel) e.play.travel = { ...e.play.travel, on: '' }; }) } : null,
      one?.play?.trigger ? { label: one.play.trigger.start !== undefined && one.play.trigger.start !== false ? 'Does not start by itself' : 'Starts when play begins', hint: 'It fires when the transport starts, with no one touching it: what makes a score go', run: () => edit('trigger start', (d, e) => { const t = { ...e.play.trigger }; if (t.start !== undefined && t.start !== false) delete t.start; else t.start = 0; e.play = { ...e.play, trigger: t }; }) } : null,
      one?.play?.trigger ? { label: 'Sound', items: SOUNDS.filter(p => p.k !== 'collide').map(p => ({ label: p.label, hint: p.hint, active: readSound(one.play.trigger.emit)?.k === p.k, run: () => edit('sound', (d, e) => { e.play.trigger = { ...e.play.trigger, emit: soundCode({ ...SOUND_DEFAULTS[p.k], ch: readSound(e.play.trigger.emit)?.ch ?? 1 }) }; }) })) } : null,
      { label: this.score?.solo ? 'Solo off' : 'Solo', run: () => this.toggleSolo() },
      '-',
      { label: 'Remove play', disabled: !els.some(e => e.play), run: () => edit('remove play', (d, e) => { delete e.play; const r = realizeAfter(e, undefined); if (r !== e.realize) e.realize = { ...r }; }) }
    ].filter(Boolean);
    return { label: 'Play', items };
  }

  /** Shift+right-click: the current tool's settings at the pointer (the same popups as the toolbar's right-click). */
  openToolDetails(x, y) {
    const t = this.tool;
    if (t === 'sculpt' || t === 'brush') return openToolParams(this, x, y);
    if (['point', 'line', 'plane', 'gesture', 'guide', 'circle', 'rect'].includes(t)) return openToolDefaults(this, this.toolRole(t), x, y, t === 'circle' || t === 'rect' ? t : null);
    if (this.selectedElements().length) return openToolParams(this, x, y);   // Select and Direct: the selected marks' brush settings
  }

  /** The defaults a drawing tool keeps its path in (its state), or null (select, direct, pan, board, rect…). */
  pathTool() { return PATH_TOOLS[this.tool] || null; }

  /**
   * ` makes straight, ~ makes smooth. With a drawing tool the choice is the tool's state: the stroke being
   * drawn takes it now and the next strokes keep it (a mark selected earlier is not touched). With
   * Select or Direct it is the selected marks'.
   */
  setPathChoice(to) {
    if (this.tool === 'rect') return;   // a rectangle keeps its corners
    const tool = this.pathTool();
    if (!tool) { this.canvas.setPath(to); return; }
    this.setDefaults(tool, { path: to });
    if (!this.canvas.setPath(to, { marks: false })) this.canvas.flash(to === 'straight' ? 'Straight' : 'Smooth');
  }

  /** Double-tap CapsLock: the other path, as ` and ~ would set it. */
  flipPathChoice() {
    const tool = this.pathTool();
    const straight = tool && !this.canvas.draft ? this.defaults(tool).path === 'straight' : this.canvas.pathIsStraight();
    this.setPathChoice(straight ? 'smooth' : 'straight');
  }

  /**
   * Shift+key: step through a stack of tools. In the stack, the next one; outside it, the one its button
   * shows (so entering keeps the brush or sculpt tool already in use).
   */
  cycleStack(kind) {
    const stacks = {
      select: { ids: SELECTS.map(c => c[0]), inside: () => SELECTS.some(c => c[0] === this.tool), current: () => this.tool, shown: () => this.selectTool || 'select', go: id => this.setTool(id) },
      line: { ids: LINES.map(c => c[0]), inside: () => LINES.some(c => c[0] === this.tool), current: () => this.tool, shown: () => this.lineTool || 'line', go: id => this.setTool(id) },
      plane: { ids: PLANES.map(c => c[0]), inside: () => PLANES.some(c => c[0] === this.tool), current: () => this.tool, shown: () => this.planeTool || 'plane', go: id => this.setTool(id) },
      brush: { ids: this.brushIds(), inside: () => this.tool === 'brush', current: () => this.brush.id, shown: () => this.brush.id, go: id => { this.pickBrush(id, { apply: false }); this.setTool('brush'); } },
      sculpt: { ids: Object.keys(SCULPTS), inside: () => this.tool === 'sculpt', current: () => this.sculpt.tool, shown: () => this.sculpt.tool, go: id => { this.setSculpt({ tool: id }); this.setTool('sculpt'); } },
    }[kind];
    if (!stacks) return;
    if (!stacks.inside()) return stacks.go(stacks.shown());
    const i = stacks.ids.indexOf(stacks.current());
    stacks.go(stacks.ids[(i + 1) % stacks.ids.length]);
  }

  /**
   * One button for a stack of tools, showing the one in use (click again for the list; right-click for the looks of
   * its new marks). `remembered` is the stack's last tool, shown while none of them is in use.
   */
  stackToolButton(list, remembered, label, cycle) {
    const cur = list.find(c => c[0] === this.tool) || list.find(c => c[0] === remembered) || list[0];
    const inStack = () => list.some(c => c[0] === this.tool);
    const key = cur[2].replace('⇧', '');
    const menu = (x, y) => showMenu([{ label }, ...list.map(([id, tip, k]) => ({ icon: this.pathIcon(id), active: id === cur[0], label: tip.split(':')[0], hint: tip, keys: k, run: () => this.setTool(id) }))], x, y);
    const btn = h('button', { class: `wb-tool wb-tool-stack${inStack() ? ' on' : ''}`, 'data-guide': `tool:${cur[0]}`, title: `${cur[1]} (${key}; ${cycle}). Click again for the list · right-click: brush and look for new marks`, html: `${this.pathIcon(cur[0])}<kbd>${key}</kbd><span class="wb-tool-caret"></span>` });
    btn.addEventListener('click', () => { if (inStack()) { const r = btn.getBoundingClientRect(); menu(r.left, r.bottom + 4); } else this.setTool(cur[0]); });
    btn.addEventListener('contextmenu', ev => { ev.preventDefault(); const r = btn.getBoundingClientRect(); openToolDefaults(this, this.toolRole(cur[0]), r.left, r.bottom + 6, cur[0]); });
    return btn;
  }

  /** A tool's icon, drawn for its path: line, plane and circle look smooth or straight as the tool is set. */
  pathIcon(id) {
    const straight = this.defaults(this.toolRole(id)).path === 'straight';
    if (id === 'line') return icon(straight ? 'lineStraight' : 'line');
    if (id === 'plane') return icon(straight ? 'plane' : 'planeSmooth');   // (the plane icon is the polygon)
    if (id === 'circle') return icon(straight ? 'circleStraight' : 'circle');
    return icon(id);
  }

  planeStackButton() { return this.stackToolButton(PLANES, this.planeTool, 'Plane', 'Shift+2 cycles plane, circle and rectangle'); }
  lineStackButton() { return this.stackToolButton(LINES, this.lineTool, 'Line', 'Shift+1 cycles line, gesture and guide'); }

  setTool(t) {
    // Choosing a tool means drawing again: leave a take being reviewed.
    if (this.player?.take) this.player.close();
    if (LINES.some(c => c[0] === t)) this.lineTool = t;
    if (t === 'select' || t === 'direct') this.selectTool = t;
    if (PLANES.some(c => c[0] === t)) this.planeTool = t;
    if (t !== 'direct' && this.canvas) this.canvas.selPoints = [];
    this.canvas?.finishClickPath?.();
    this.tool = t; this.canvas?.updateCursor(); this.canvas?.paintAffected?.(); this.emit('tool'); this.renderChrome();
  }
  setViewMode(m) { this.view.mode = m; this.canvas.invalidate(); this.emit('view'); this.renderChrome(); }
  setUpTo(i) { this.view.upTo = i; this.canvas.upTo = i; this.canvas.invalidate(); this.emit('view'); }
  selectedElements() { return this.store.doc.elements.filter(e => this.canvas?.selected.has(e.id)); }
  selectIds(ids) { this.canvas.select(ids); }
  groupSelection() { const ids = [...this.canvas.selected]; if (ids.length > 1) { this.store.group(ids); this.canvas.select(ids); } }
  ungroupSelection() { const ids = [...this.canvas.selected]; if (ids.length) this.store.ungroup(ids); }

  /** Change the sculpt settings: { tool, radius, strength } or params for a tool ({ params: { amount } }). */
  /** Settings of a shape tool (circle: sides; rect: round), kept in the browser. */
  setShape(tool, patch) {
    if (!SHAPE_DEFAULTS[tool]) return;
    Object.assign(this.shapes[tool], patch);
    try { localStorage.setItem(SHAPES_KEY, JSON.stringify(this.shapes)); } catch { /* ignore */ }
    this.emit('tool');
  }

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
    this.lazy.simplify = Math.max(0, Math.min(40, Number(this.lazy.simplify) || 0));
    try { localStorage.setItem('ams_lazy', JSON.stringify(this.lazy)); } catch { /* ignore */ }
    this.emit('lazy');
  }

  /**
   * Save the open drawing in localStorage (quick, but a few MB at most). When it does not fit, the
   * stale copy is removed, so a reload takes the scene store's copy instead of an older drawing.
   */
  saveDoc() {
    if (!this.persist) return;
    try { localStorage.setItem(DOC_KEY, JSON.stringify(this.store.doc)); localStorage.setItem(`${DOC_KEY}_saved`, String(Date.now())); }
    catch {
      try { localStorage.removeItem(DOC_KEY); localStorage.setItem(`${DOC_KEY}_saved`, '0'); } catch { /* ignore */ }
      if (!this.warnedQuota) { this.warnedQuota = true; this.log('This drawing is too large for quick saving; it is kept in the scene store instead.'); }
    }
  }

  /**
   * A performance line under each board that runs: for studio code, runs a second, the code's time,
   * the fit's time in the background, the source's frames a second and the marks; for p5 boards, the
   * sketch's frames a second and its draw() time.
   */
  toggleBoardPerf(on = !this.boardPerfOn) {
    this.boardPerfOn = on;
    try { localStorage.setItem('ams_board_perf', on ? '1' : '0'); } catch { /* ignore */ }
    this.perfTick();
    this.canvas.invalidate();
    this.renderChrome?.();
  }

  /** Whether a board's performance is shown (so measured): all boards (View), or its own switch. */
  perfWanted(b) { return Boolean(b) && (this.boardPerfOn || Boolean(b.perf)); }

  /** Once a second while any board's performance shows: count marks per board and redraw the lines. */
  perfTick() {
    const any = this.boardPerfOn || boardsOf(this.store.doc).some(b => b.perf);
    if (!any) { clearInterval(this.boardPerfTimer); this.boardPerfTimer = 0; this.perfMarks = null; return; }
    if (this.boardPerfTimer) return;
    const tick = () => {
      if (!(this.boardPerfOn || boardsOf(this.store.doc).some(b => b.perf))) { clearInterval(this.boardPerfTimer); this.boardPerfTimer = 0; return; }
      this.perfMarks = new Map();
      for (const e of this.store.doc.elements) this.perfMarks.set(e.board || MAIN, (this.perfMarks.get(e.board || MAIN) || 0) + 1);
      this.canvas.invalidate();
    };
    tick();
    this.boardPerfTimer = setInterval(tick, 1000);
  }

  /** Set one of a board's switches (locked, hidden, hideLabel, perf, mask, codeMin). */
  setBoardFlag(id, flag, on) {
    this.store.updateBoard(id, { [flag]: Boolean(on) });
    if (flag === 'perf') this.perfTick();
    if (flag === 'hidden' || flag === 'locked') this.canvas.select?.([]);
  }

  boardPerfText(b) {
    if (!this.perfWanted(b)) return null;
    const kind = boardKind(b), live = this.isBoardLive(b.id), now = performance.now();
    // Compact: FPS, ms, mk (marks), r/s (runs a second); no spaces around the dots.
    const n = v => (v >= 10 ? String(Math.round(v)) : v.toFixed(1).replace(/\.0$/, ''));
    if (kind === 'p5') {
      const p = this.frames?.perf.get(b.id);
      if (!live) return 'paused';
      return p && now - p.at < 3000 ? `p5·${p.fps}${p.calls > p.fps ? `/${p.calls}` : ''}FPS·${n(p.ms)}ms` : 'p5·…';
    }
    if (kind === 'three') return live ? 'three.js' : 'paused';
    if (kind !== 'drawing' || !b.code) return null;
    const s = this.runStats.get(b.id), recent = (s?.at || []).filter(t => now - t < 3000);
    const names = [...String(b.code).matchAll(/(?:source|fit)\(\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]);
    const src = [...new Set(names)].map(nm => `${nm}:${n(this.sources.fps(nm))}FPS`);
    const fit = /(?<![.\w$])fit\s*\(/.test(b.code) && fitTimes.has(b.id) ? `fit${Math.round(fitTimes.get(b.id))}ms` : null;
    // Also: how long the canvas takes to draw (d), and what the textured marks' layers take (MB; q: painted smaller to fit).
    const tx = txStats();
    return [
      live ? `${n(recent.length / 3)}r/s` : 'paused',
      s ? `${n(s.ms)}ms` : null,
      live && this.canvas.stats?.avg ? `d${n(this.canvas.stats.avg)}ms` : null,
      fit, ...src,
      `${this.perfMarks?.get(b.id) ?? '…'}mk`,
      live && tx.layers ? `${Math.round(tx.bytes / 1048576)}MB${tx.quality < 1 ? `·q${tx.quality}` : ''}` : null
    ].filter(Boolean).join('·');
  }

  /** A small performance readout beside the zoom control: the browser's fps, canvas redraws and their time, marks. */
  togglePerf(on = !this.perfOn) {
    this.perfOn = on;
    try { localStorage.setItem('ams_perf', on ? '1' : '0'); } catch { /* ignore */ }
    cancelAnimationFrame(this.perfRaf);
    this.renderChrome();
    if (!on) return;
    // Two rates: the browser's frames (is the app smooth?) and the canvas's redraws (is it busy?).
    // A still drawing redraws nothing, which is right: it shows as idle, not as 0 fps.
    let draws = this.canvas.stats?.frames || 0, frames = 0, t = performance.now();
    const tick = now => {
      frames++;
      if (now - t >= 500) {
        const d = this.canvas.stats?.frames || 0, secs = (now - t) / 1000;
        const fps = Math.round(frames / secs), rd = Math.round((d - draws) / secs);
        draws = d; frames = 0; t = now;
        const s = this.canvas.stats;
        if (this.perfEl) {
          this.perfEl.textContent = `${fps} fps · ${rd ? `${rd} redraws/s · ${s ? s.draw.toFixed(1) : '–'} ms` : 'idle'} · ${this.store.doc.elements.length} marks`;
          this.perfEl.title = 'fps: the browser\'s frame rate. Redraws: how often the canvas repaints (only when something changes), and the last repaint\'s time.';
        }
        this.perfEl?.classList.toggle('slow', fps < 30 || Boolean(rd && s && s.avg > 16));
      }
      this.perfRaf = requestAnimationFrame(tick);
    };
    this.perfRaf = requestAnimationFrame(tick);
  }

  /**
   * The workspace background (behind the boards): a CSS color, 'transparent' (the window shows what
   * is behind it, for a see-through browser used as an overlay), or 'default' (the theme's). Kept.
   */
  setBackground(v = 'default') {
    v = String(v || 'default').trim();
    if (/^(none|clear|see-?through)$/i.test(v)) v = 'transparent';
    if (/^#[0-9a-f]{6}00$/i.test(v)) v = 'transparent';   // fully clear in the color picker
    const root = document.documentElement;
    if (v === 'default' || v === 'reset') { root.style.removeProperty('--wb-canvas'); v = 'default'; }
    else root.style.setProperty('--wb-canvas', v);
    root.classList.toggle('wb-transparent', v === 'transparent');
    this.background = v;
    try { localStorage.setItem('ams_workspace_bg', v); } catch { /* ignore */ }
    this.canvas?.invalidate();
    this.emit('background', v);
    this.log(v === 'default' ? 'Workspace background: the theme’s.' : `Workspace background: ${v}.`);
  }

  /** The p5.js version exports target: '2' (the latest 2.x, default) or '1'. Settings → Export. */
  p5Version() { try { return localStorage.getItem('ams_p5_version') === '1' ? '1' : '2'; } catch { return '2'; } }

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

  /** The stroke and fill the swatches show: the selection's first mark, else the global paint. */
  paintValues() {
    const sel = this.selectedElements?.() || [];
    return { stroke: sel.length ? (sel[0].color ?? null) : this.paint.stroke, fill: sel.length ? (sel[0].fill ?? null) : this.paint.fill };
  }

  /** Stroke and fill at the pointer (Ctrl+right-click): pick both at once; Fields, Disc or Cube, as last used. */
  openPaintPicker(x = this.pointerAt?.[0] ?? 200, y = this.pointerAt?.[1] ?? 200, { active = null, anchor = null } = {}) {
    const { stroke, fill } = this.paintValues();
    return openPaintPicker(this, x, y, { stroke, fill, active, anchor, set: (which, c) => this.setPaint(which, c || (which === 'stroke' ? 'none' : null)) });
  }

  /** The grid settings at the pointer (Ctrl+Shift+right-click): grid, grid color, paper and workspace colors. */
  openGridMenu(x = this.pointerAt?.[0] ?? 200, y = this.pointerAt?.[1] ?? 200) { return openGridParams(this, x, y); }

  paintSwatches() {
    const { stroke: s, fill: f } = this.paintValues();
    const chip = (which, v, tip) => {
      const b = h('button', { class: `wb-paint-${which}${v && v !== 'none' ? '' : ' none'}${which === 'stroke' && !v ? ' ink' : ''}`, title: tip, type: 'button' }, h('span', { style: which === 'stroke' ? { boxShadow: `inset 0 0 0 5px ${v && v !== 'none' ? v : !v ? 'var(--wb-text)' : 'transparent'}` } : { background: v || 'transparent' } }));
      b.addEventListener('click', ev => { ev.stopPropagation(); this.openPaintPicker(0, 0, { active: which, anchor: b }); });   // the picker in its last mode, this side selected
      b.addEventListener('contextmenu', ev => { ev.preventDefault(); showMenu([{ label: which === 'fill' ? 'No fill' : 'No stroke', run: () => this.setPaint(which, which === 'stroke' ? 'none' : null) }, ...(which === 'stroke' ? [{ label: 'Brush ink (default)', run: () => this.setPaint('stroke', null) }] : []), { label: 'Swap stroke and fill', run: () => this.swapPaint() }, { label: 'Stroke and fill together…', run: () => this.openPaintPicker(ev.clientX, ev.clientY) }], ev.clientX, ev.clientY); });
      return b;
    };
    return h('div', { class: 'wb-paint', 'data-guide': 'tool:paint' },
      chip('fill', f, 'Fill (right-click: none) · C: stroke and fill picker'), chip('stroke', s, 'Stroke (right-click: brush ink) · C: stroke and fill picker'),
      h('button', { class: 'wb-paint-swap', title: 'Swap stroke and fill', type: 'button', onclick: () => this.swapPaint() }, '⇄'),
      h('kbd', { class: 'wb-paint-key' }, 'C'));
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
    return { color: (role !== 'note' && this.paint?.stroke) || d.color || null, fill: role !== 'note' ? this.paint?.fill || null : null, why: d.why || '', realize: d.realize || structuredClone(DEFAULT_REALIZE[role] || DEFAULT_REALIZE.line), opacity: d.opacity ?? 1, blend: d.blend || 'normal', ...((d.path ?? (role === 'guide' ? 'straight' : null)) === 'straight' ? { path: 'straight' } : {}), ...(role === 'note' ? { note: d.note || {} } : {}), ...(d.lazy ? { lazy: d.lazy } : {}) };
  }

  // ---- boards ----------------------------------------------------------------------
  /** Go to a board: it becomes active and fills the view. */
  goToBoard(id, { fit = true, animate = this.presenting } = {}) {
    const b = boardById(this.store.doc, id);
    if (!b) return;
    this.activeBoard = b.id;
    // A board whose title or border is switched off keeps it so: selecting it would show both (and the title is only
    // shown selected so a board can be moved), so going there (Alt+1–9) is just the camera move and clears the selection.
    if (!this.presenting) this.canvas.selectBoard(b.hideLabel || b.hideBorder ? null : b.id);
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
    if (!this.embed) { try { localStorage.setItem('ams_ui', JSON.stringify(this.ui)); } catch { /* ignore */ } }
    requestAnimationFrame(() => this.canvas?.resize());
    this.emit('ui', this.ui);
  }

  /** Zen mode: hide all of the interface, leaving only the drawing; again to bring it back. Everything stays reachable by shortcuts, the context menus, the radial menu (Shift+Space) and the command palette (Cmd+K). */
  toggleZen() {
    const u = this.ui || {}, shown = u.tools !== false || u.view !== false || u.zoom !== false || u.panels !== false;
    this.setUI({ all: !shown });
    this.log(shown ? 'Zen: Alt+Z brings the interface back. Cmd+K opens the command palette; Shift+Space the tools.' : 'Interface back.');
  }

  /** The board under a screen point (the topmost drawn there), or null. */
  boardAtClient(x, y) {
    const [wx, wy] = this.canvas.toWorld(...this.canvas.local({ clientX: x, clientY: y }));
    return [...boardsOf(this.store.doc)].reverse().find(b => !b.hidden && wx >= b.x && wx <= b.x + b.width && wy >= b.y && wy <= b.y + b.height) || null;
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
   * next, ← / PageUp back, Alt+1–9 a board by number, Home / End, Esc leaves. Drawing still works.
   */
  present(on = !this.presenting) {
    this.presenting = on;
    this.canvas.presenting = on;
    this.root.classList.toggle('presenting', on);
    try { if (on && !document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {}); else if (!on && document.fullscreenElement) document.exitFullscreen?.(); } catch { /* ignore */ }
    if (on) {
      this.presentKeys ||= e => {
        if (!this.presenting || e.target.closest?.('input, textarea, select, [contenteditable]')) return;
        const bs = slidesOf(this.store.doc);
        const go = i => { e.preventDefault(); e.stopPropagation(); this.goToBoard(bs[Math.max(0, Math.min(bs.length - 1, i))].id); };
        const cur = Math.max(0, bs.findIndex(b => b.id === this.activeBoard));
        if (['ArrowRight', 'PageDown', ' '].includes(e.key) && !e.metaKey) go(cur + 1);
        else if (['ArrowLeft', 'PageUp'].includes(e.key) && !e.metaKey) go(cur - 1);
        else if (e.key === 'Home') go(0);
        else if (e.key === 'End') go(bs.length - 1);
        else if (e.altKey && !e.metaKey && /^Digit[1-9]$/.test(e.code || '')) go(Number(e.code.slice(-1)) - 1);
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
    const bs = slidesOf(this.store.doc), i = bs.findIndex(b => b.id === this.activeBoard);
    if (!this.hud) { this.hud = h('div', { class: 'wb-present-hud' }); this.stageArea.append(this.hud); }
    this.hud.textContent = `${i + 1} / ${bs.length}  ·  ${bs[i]?.title || ''}`;
    this.hud.classList.remove('fade'); void this.hud.offsetWidth; this.hud.classList.add('fade');
  }

  stepBoard(delta) {
    const bs = slidesOf(this.store.doc);
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
      { label: 'Board', items: [
        { label: b.locked ? 'Unlock' : 'Lock', hint: 'Locked: its marks cannot be selected or changed, and it cannot be moved or resized', run: () => this.setBoardFlag(id, 'locked', !b.locked) },
        { label: b.hidden ? 'Show' : 'Hide', hint: 'Hidden: not drawn and not run (a dashed outline marks where it is)', run: () => this.setBoardFlag(id, 'hidden', !b.hidden) },
        { label: b.hideLabel ? 'Show title' : 'Hide title', run: () => this.setBoardFlag(id, 'hideLabel', !b.hideLabel) },
        { label: b.hideBorder ? 'Show border' : 'Hide border', hint: 'No shadow or frame line: a board with no title and no border is only structure (selected, it still shows its outline so it can be moved)', run: () => this.setBoardFlag(id, 'hideBorder', !b.hideBorder) },
        b.code || b.pseudo ? { label: b.codeMin ? 'Open its code on pages' : 'Minimize its code on pages', hint: 'On an exported page its code is a bar of tabs (Pseudocode, Studio, p5.js) and opens on a click', run: () => this.setBoardFlag(id, 'codeMin', !b.codeMin) } : null,
        { label: b.mask ? 'Unmask' : 'Mask to board', hint: 'Its marks are cropped to the board (a mask the size of the board); off, they may spill over its edge', run: () => this.setBoardFlag(id, 'mask', !b.mask) },
        { label: 'Add to playlist', hint: 'This board (or the selected boards): the media they show, or the boards themselves', run: () => { const ids = this.canvas.boardSet.has(id) && this.canvas.boardSet.size > 1 ? [...this.canvas.boardSet] : [id]; this.playlistMenu(ids.map(i => this.playlistItemForBoard(boardById(this.store.doc, i))), x, y, b); } },
        this.playableSource(b) ? { label: this.playerShown(b) ? 'Hide media controls' : 'Show media controls', hint: 'The player under the board: play, step, scrub, speed', run: () => this.togglePlayer(b) } : null,
        { label: this.captureOf(id) ? `Stop being a source (${this.captureOf(id).name})` : 'Use as a source', hint: 'Its picture (what is under it, then its marks), live, as a source other boards read by name', run: () => this.setBoardCapture(id) },
        { label: b.perf ? 'Hide performance' : 'Show performance', hint: 'A line under it: runs a second, code time, source fps (measured only while shown)', run: () => this.setBoardFlag(id, 'perf', !b.perf) }
      ] },
      { label: 'Code', hint: 'The board’s own code: it redraws the board, live', run: () => this.openCode?.('board', id) },
      this.sources.list.length ? { label: 'Source underneath', hint: 'A source shown under the board: a reference, not part of its picture', items: [{ label: 'None', active: !b.source, run: () => this.setBoardSource(id, null) }, ...this.sources.list.map(s => ({ label: s.name, active: b.source === s.name, run: () => this.setBoardSource(id, s.name, b.source ? b.sourceOpacity : 1) }))] } : null,
      boardKind(b) === 'drawing' ? { label: 'Mask', hint: 'Show the board through a source or another board (opt-in): the mask\'s light or alpha decides what shows', items: [
        { label: 'None', active: !b.maskWith, run: () => this.setBoardMask(id, null) },
        ...this.sources.list.map(s => ({ label: s.name, active: b.maskWith?.source === s.name, run: () => this.setBoardMask(id, { ...(b.maskWith || {}), source: s.name, board: undefined, mode: b.maskWith?.mode || 'luma' }) })),
        ...(boardsOf(this.store.doc).filter(x => x.id !== id && boardKind(x) === 'drawing').length ? ['-'] : []),
        ...boardsOf(this.store.doc).filter(x => x.id !== id && boardKind(x) === 'drawing').map(x => ({ label: `${x.title} · board`, active: b.maskWith?.board === x.id, run: () => this.setBoardMask(id, { ...(b.maskWith || {}), board: x.id, source: undefined, mode: b.maskWith?.mode || 'alpha' }) }))
      ] } : null,
      boardKind(b) === 'drawing' ? { label: 'Effects', hint: 'Post effects on the board\'s picture (opt-in): threshold, levels, gradient map…', items: [
        ...Object.entries(FX).map(([type, d]) => ({ label: d.label, hint: d.doc, run: () => this.setBoardFx(id, 'fx', [...(b.fx || []), normalizeFx([type])[0]]) })),
        ...(b.fx?.length ? ['-', { label: 'Remove effects', run: () => this.setBoardFx(id, 'fx', []) }] : [])
      ] } : null,
      this.sources.list.length && boardKind(b) === 'drawing' ? { label: 'Draw from a source', hint: 'A demo: code that reads a source, which the board follows. Its code is yours to change', items: SOURCE_DEMOS.map(d => {
        const names = this.sources.list.map(s => s.name), pick = b.source && names.includes(b.source) ? b.source : null;
        return names.length === 1 || pick ? { label: d.label, hint: d.hint, run: () => this.sourceDemo(id, d.id, pick || names[0]) } : { label: d.label, hint: d.hint, items: names.map(n => ({ label: n, run: () => this.sourceDemo(id, d.id, n) })) };
      }) } : null,
      { label: this.isBoardLive(id) ? 'Pause' : 'Play', hint: 'Live boards run (their code follows sources, their brushes read live frames); paused boards are baked into a picture and stay paused until played', run: () => this.toggleBoardRun(id) },
      { label: 'Export as JSON', hint: 'The marks as a file (.ams.json), to import again into any scene', run: () => { const d = selectionPart(this.selectionDoc(ids)); if (d) download(JSON.stringify(d, null, 2), `${this.slug()}-selection.ams.json`, 'application/json'); } },
      { label: 'Copy as', items: [
        { label: 'PNG', hint: 'The board as a picture, on the clipboard', run: () => this.copyBoard(id, 'png') },
        { label: 'SVG', hint: 'The board as SVG (with its process record), on the clipboard', run: () => this.copyBoard(id, 'svg') },
        { label: 'JSON', hint: 'The board as studio JSON: paste (Cmd+V) into any scene', run: () => this.copyBoard(id, 'json') },
        b.code ? { label: boardKind(b) === 'drawing' ? 'Studio code' : 'Its code', run: () => this.copyBoard(id, 'code') } : null,
        { label: 'p5.js code', hint: 'For the p5 editor: its code as a sketch (or the marks as plain p5 calls)', run: () => this.copyBoard(id, 'p5') }
      ].filter(Boolean) },
      boardKind(b) === 'drawing' && b.code ? { label: 'Convert to p5.js', hint: 'A new board running its code as the p5 sketch the export writes (it pastes into the p5 editor as it is)', run: () => this.convertBoard(id, 'p5') } : null,
      boardKind(b) === 'p5' && isStudioSketch(b.code) ? { label: 'Convert to studio code', hint: 'A new drawing board with the studio code inside this sketch', run: () => this.convertBoard(id, 'studio') } : null,
      { label: 'Bake', items: [
        { label: 'To a PNG image', hint: 'Its marks become one picture (undo brings them back)', run: () => this.bakeBoard(id, 'png') },
        { label: 'To an SVG image', hint: 'Its marks become one vector image, crisp at any zoom (undo brings them back)', run: () => this.bakeBoard(id, 'svg') }
      ] },
      { label: 'Export', items: [['png', 'PNG'], ['svg', 'SVG'], ['sheet', 'Process sheet'], ['json', 'JSON (to import again)'], ['p5', 'p5.js sketch'], ['p5min', 'p5 (minimal code)'], ...(b.code ? [['p5code', 'p5 (its code)']] : [])].map(([k, l]) => ({ label: l, run: () => this.exportAs(k, id) })) },
      this.embed ? null : { active: (doc.train || MAIN) === id, label: (doc.train || MAIN) === id ? 'Models learn from this board' : 'Train on this board', run: () => this.store.setTrainBoard(id) },
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

  /** Brush slots: the active brush with its settings (and the stroke color), on Alt+Shift+1–9. */
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
    const ids = this.brushIds();
    showMenu([
      { label: 'Brush' },
      ...ids.map(id => ({ icon: brushIcon(id), active: id === cur, label: `${BRUSHES[id].label}`, hint: `${BRUSHES[id].doc}${this.canvas.selected.size ? ' · applies to the selection (Cmd-click: only pick it)' : ''}`, run: ev => this.pickBrush(id, { apply: !(ev?.metaKey || ev?.ctrlKey) }) })),
      '-',
      { label: 'Settings…', hint: 'Opt+right-click on the canvas', run: () => { this.setTool('brush'); openToolParams(this, x, y); } },
      { label: 'Show code', run: () => this.openCode?.('brush', cur) },
      '-',
      { label: 'Slots', hint: 'Alt+Shift+1–9 picks a slot; Ctrl+Alt+Shift+1–9 keeps the active brush there', items: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ label: `${n}  ${this.slots[n] ? BRUSHES[this.slots[n].id]?.label || this.slots[n].id : '—'}`, keys: `⌥⇧${n}`, run: () => this.useSlot(n) })).concat(['-', { label: 'Keep the active brush in…', items: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => ({ label: `Slot ${n}`, keys: `⌃⌥⇧${n}`, run: () => this.keepSlot(n) })) }]) }
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
    for (const k of ['opacity', 'blend', 'path', 'lazy']) if (k in patch) d[k] = patch[k];
    if (patch.note) d.note = { ...(d.note || {}), ...patch.note };
    this.toolDefaults[role] = d;
    try { localStorage.setItem(DEFAULTS_KEY, JSON.stringify(this.toolDefaults)); } catch { /* ignore */ }
    this.emit('tool');
    if ('path' in patch) this.renderChrome();   // the line, plane and circle icons show the path
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

  /**
   * Open an IanniX score (.iannix: JavaScript that makes a score) as a new board whose code is the AMS
   * score it comes to: curves are lines, cursors travel them, events play. Plays on the transport.
   */
  async importIannix(file, { confirmed = false, title } = {}) {
    if (!file) {
      file = await new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.iannix,.js,.txt,text/plain';
        input.onchange = () => resolve(input.files[0] || null);
        input.click();
      });
      if (!file) return null;
    }
    const text = typeof file === 'string' ? file : await file.text();
    const name = title || (typeof file === 'string' ? 'IanniX score' : file.name.replace(/\.[^.]+$/, ''));
    if (!confirmed && !(await askConfirm('An IanniX score is a program, and it runs as one here. Open scores you trust only.', { ok: 'Run it' }))) return null;
    const { iannixToScore } = await import('../score/import/iannix.js');
    return this.scoreToBoard(iannixToScore(text, { title: name, inBoard: true }), 'IanniX', r => `${r.stats.curves} curves, ${r.stats.cursors} cursors, ${r.stats.triggers} events`);
  }

  /** How scores show in the picture: { names } (the names of marks that play, drawn beside them). */
  setScoreView(patch) {
    Object.assign(this.scoreView, patch);
    try { localStorage.setItem('ams_scoreview_v1', JSON.stringify(this.scoreView)); } catch { /* ignore */ }
    this.canvas.invalidate();
    this.store.emit('score view');   // (Properties shows the switch)
  }

  /** The score as a MIDI file, rendered ahead of time for `seconds` (the loop range, if one is set, else 60): downloaded. */
  async exportMidi(seconds) {
    const [{ renderScore }, { midiFile }, { download }] = await Promise.all([import('../score/runner.js'), import('../score/midifile.js'), import('./ui.js')]);
    const st = this.player.settings, range = this.player.loopRange;
    const len = Math.min(900, Math.max(1, Number(seconds) || (range ? range[1] / 1000 : 60)));
    const out = renderScore(this.store.doc, st, len);
    for (const e of out.errors) this.log(`Score: ${e}`, 'error');
    const notes = out.messages.filter(m => (m.bytes[0] & 0xf0) === 0x90 && m.bytes[2] > 0).length;
    if (!notes) { this.log('The score plays no notes to export.', 'error'); return null; }
    const bytes = midiFile(out.messages, { tempo: st.tempo, signature: st.signature, name: this.store.doc.title });
    download(bytes, `${(this.store.doc.title || 'score').replace(/[^\w.-]+/g, '_')}.mid`, 'audio/midi');
    this.log(`MIDI file: ${notes} notes, ${len} s at ${st.tempo} bpm.`);
    return { notes, seconds: len, bytes: bytes.length };
  }

  /** Open a Midinous (.nous) or midinojs project as a new board whose code is the score; the scene takes its tempo. */
  async importNous(file, { title } = {}) {
    if (!file) {
      file = await new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file'; input.accept = '.nous,.json,application/json';
        input.onchange = () => resolve(input.files[0] || null);
        input.click();
      });
      if (!file) return null;
    }
    const text = typeof file === 'string' ? file : await file.text();
    const name = title || (typeof file === 'string' ? 'Midinous project' : file.name.replace(/\.[^.]+$/, ''));
    const { nousToScore } = await import('../score/import/nous.js');
    const res = nousToScore(text, { title: name, inBoard: true });
    const board = this.scoreToBoard(res, 'Midinous', r => `${r.stats.nodes} nodes, ${r.stats.paths} paths`);
    if (board && res.settings?.tempo) this.player.setSettings({ tempo: res.settings.tempo, ...(res.settings.beatUnits ? { beatUnits: res.settings.beatUnits } : {}) });
    return board;
  }

  /** A converted score ({ code, title, size, warnings, stats }) as a new board that runs it. */
  scoreToBoard(res, what, describe) {
    for (const w of res.warnings) this.log(w.startsWith(what) ? w : `${what}: ${w}`, 'error');
    if (!res.code) { this.log(`${what}: nothing to import.`, 'error'); return null; }
    const board = this.store.addBoard({ title: res.title, ...res.size, ground: '#f6f3ea', adopt: false });
    this.store.updateBoard(board.id, { code: res.code });
    const run = this.store.runBoardCode(board.id, res.code, runScript);
    if (run?.error) { this.log(`${what}: ${run.error}`, 'error'); return null; }
    this.goToBoard(board.id, { animate: true });
    this.log(`${what} “${res.title}”: ${describe(res)} on a new board (its code is in Code → Board). Press play on the Timeline.`);
    return board;
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
      getShape: t => this.shapes[t],
      onSelect: ids => { if (ids?.length) this.selectedAsset = null; this.emit('selection'); this.renderChrome(); },
      onNoteStyled: note => this.setDefaults('note', { note }),
      onTool: t => this.setTool(t),
      viewMode: () => this.view.mode
    });
    this.canvas.drawReference = ctx => this.drawReference(ctx);
    this.canvas.onGrid = () => this.renderChrome();
    // Opt+right-click: the active tool's parameters as sliders; right-click: the menu.
    try { const ac = localStorage.getItem('ams_accent'); if (ac) document.documentElement.style.setProperty('--wb-accent-2', ac); } catch { /* ignore */ }
    try { this.canvas.showPoints = localStorage.getItem('ams_show_points') === '1'; } catch { /* ignore */ }
    try { if (localStorage.getItem('ams_perf') === '1') requestAnimationFrame(() => this.togglePerf(true)); } catch { /* ignore */ }
    try { const bg = localStorage.getItem('ams_workspace_bg'); if (bg && bg !== 'default') { const log = this.log; this.log = () => {}; this.setBackground(bg); this.log = log; } } catch { /* ignore */ }
    this.canvas.onContext = (e, hit, at) => {
      if (!e.altKey) return showMenu(this.contextItems(hit, at), e.clientX, e.clientY);
      if (hit && (hit.play || this.tool === 'play')) return openPlayPopover(this, e.clientX, e.clientY, hit.id);   // Opt+right-click a mark that plays: its Play controls
      // Opt+right-click: a mark's or tool's parameters; on bare paper, the board's.
      const b = !hit && !this.canvas.selected.size && this.boardAtClient(e.clientX, e.clientY);
      return b ? openBoardParams(this, b.id, e.clientX, e.clientY) : openToolParams(this, e.clientX, e.clientY);
    };
    this.activeBoard = MAIN;
    this.canvas.onBoardSelect = id => { this.activeBoard = id; this.selectedAsset = null; this.emit('board'); };
    if (this.embed) this.canvas.showTrain = false;   // (no model to train in an embedded editor: no "trains" on the board, in the panels or in the menu)
    this.canvas.onOpenProperties = () => this.docks.open('properties');
    this.canvas.onFlipPath = () => this.flipPathChoice();
    this.canvas.onPaintPicker = e => this.openPaintPicker(e.clientX, e.clientY);   // Ctrl+right-click
    this.canvas.onGridMenu = e => this.openGridMenu(e.clientX, e.clientY);   // Ctrl+Shift+right-click
    this.canvas.onToolDetails = e => this.openToolDetails(e.clientX, e.clientY);   // Shift+right-click
    window.addEventListener('pointermove', e => { this.pointerAt = [e.clientX, e.clientY]; }, { capture: true, passive: true });   // where the radial menu opens
    this.canvas.onBoardRename = id => this.renameBoard(id);
    this.canvas.onBoardContext = (id, e) => this.boardMenu(id, e.clientX, e.clientY);
    this.canvas.onBoardParams = (id, e) => openBoardParams(this, id, e.clientX, e.clientY);   // Opt+right-click on a board's title or corner
    this.canvas.onDropAsset = (id, at) => this.placeAsset(id, at).catch(err => this.log(err.message, 'error'));
    this.canvas.onDropSource = (name, at) => this.placeSource(name, at);
    this.canvas.onDropFiles = (files, at) => this.placeFiles(files, at).catch(err => this.log(err.message, 'error'));
    KIT.onImageLoad = () => { this.canvas.baked?.clear(); this.canvas.invalidate(); };
    this.canvas.composer = this.composer;
    this.canvas.isBoardLive = id => this.isBoardLive(id);
    this.canvas.boardPerf = b => this.boardPerfText(b);
    // Each board's code runs, timed (for the performance line under boards).
    this.runStats = new Map();
    const runBoardCode = this.store.runBoardCode.bind(this.store);
    this.store.runBoardCode = (id, ...rest) => {
      if (!this.perfWanted(boardById(this.store.doc, id))) return runBoardCode(id, ...rest);   // timed only when shown
      const t0 = performance.now(), res = runBoardCode(id, ...rest), ms = performance.now() - t0;
      const s = this.runStats.get(id) || { at: [], ms: 0 };
      s.at.push(t0); if (s.at.length > 200) s.at.shift();
      s.ms = s.ms ? s.ms * 0.7 + ms * 0.3 : ms;
      this.runStats.set(id, s);
      return res;
    };
    try { if (localStorage.getItem('ams_board_perf') === '1') this.toggleBoardPerf(true); else this.perfTick(); } catch { /* ignore */ }
    this.canvas.onToggleRun = (id, e) => (e?.altKey ? this.soloBoard(id) : this.toggleBoardRun(id));
    // Document and program boards (markdown, html, p5) over the canvas.
    this.frames = new BoardFrames(this);
    // The score runner, for code outside the app (lesson builders): the app's own, with its sources.
    this.runScript = runScript;
    this.canvas.onDrawn = () => this.frames.update();
    try { this.playKind = localStorage.getItem('ams_playkind') || 'link'; } catch { this.playKind = 'link'; }
    try { this.playNodeKind = localStorage.getItem('ams_playnode') || 'note'; } catch { this.playNodeKind = 'note'; }
    this.store.derive = d => { Rel.syncEdges(d); Rel.syncAttached(d); };   // edges follow their nodes; attached events follow their lines
    this.canvas.playTool = new PlayTool(this, this.canvas);
    this.canvas.onSpaceTap = () => this.player?.toggle();
    this.canvas.onPlayAfter = (el, after) => { if (after.travel) this.store.change('travel', d => Rel.travel(d, after.travel, el.id)); };
    this.canvas.onCamera = () => { const t = `${Math.round(this.canvas.cam.z * 100)}%`; const z = this.zoomIsland?.querySelector('span'); if (z) z.textContent = t; const b = this.topbar?.querySelector('.wb-zoom-pct'); if (b) b.textContent = t; };
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
    // The scene store may hold a newer (or larger) copy of the open scene than localStorage did.
    // (No time recorded yet, as before this was added: trust localStorage if it has a drawing.)
    if (this.persist) {
      let t = 0;
      try { const v = localStorage.getItem(`${DOC_KEY}_saved`); t = v != null ? Number(v) || 0 : localStorage.getItem(DOC_KEY) ? Infinity : 0; } catch { /* ignore */ }
      if (t !== Infinity) this.scenes.restoreNewer(t).catch(() => {});
    }
    this.scenes.on(() => this.renderChrome());
    if (!this.embed) { try { const u = JSON.parse(localStorage.getItem('ams_ui') || 'null'); if (u) requestAnimationFrame(() => this.setUI(u)); } catch { /* ignore */ } }   // (an embedded editor is told its interface by the host)
    // Performing: Alt+1–9 go to a board (0, 1, 2 are tool keys, Shift+2 cycles the plane stack); Alt+Shift+1–9 pick a brush slot; Ctrl+Alt+Shift+1–9 keep the active brush there.
    try { this.slots = JSON.parse(localStorage.getItem('ams_brush_slots') || '{}'); } catch { this.slots = {}; }
    window.addEventListener('keydown', e => {
      const m = /^Digit([1-9])$/.exec(e.code || '');
      if (!m || this.presenting || e.metaKey || e.target.closest?.('input, textarea, select, [contenteditable], .cm-editor')) return;
      const n = Number(m[1]);
      if (e.altKey && e.shiftKey && e.ctrlKey) { e.preventDefault(); this.keepSlot(n); }
      else if (e.altKey && e.shiftKey) { e.preventDefault(); this.useSlot(n); }
      else if (e.altKey && !e.ctrlKey && !e.shiftKey) { const b = boardsOf(this.store.doc)[n - 1]; if (b) { e.preventDefault(); this.goToBoard(b.id, { animate: true }); } }
    }, true);
    this.recorder = new Recorder(this);
    this.player = new TakePlayer(this);
    this.score = new ScorePlayer(this);   // plays marks with `play` on the transport
    try { this.scoreView = { ...SCORE_LOOK, names: false, ...JSON.parse(localStorage.getItem('ams_scoreview_v1') || '{}') }; } catch { this.scoreView = { ...SCORE_LOOK, names: false }; }
    this.scoreOverlay = new ScoreOverlay(this);   // and shows them: travelers, lit events
    this.shortcuts = new Shortcuts(this);
    this.registerPanels();
    const hadCamera = Boolean(localStorage.getItem('ams_workbench_camera_v1'));
    this.docks.render();
    requestAnimationFrame(() => { this.canvas.resize(); if (!hadCamera) this.canvas.fit(); this.renderChrome(); });
    this.bindKeys();
    this.renderChrome();
    if (!this.embed) import('./samples.js').then(m => m.seedSamples(this.assetStore)).catch(() => {});   // (the studio's samples: an embedded editor has none)
    this.followSources();
    this.sources.startAll();
    initWorkbenchMCP(this);
    this.diagnostics = startDiagnostics(this);
    // Copy: the selected marks as studio JSON (paste them into any scene, or another tab).
    document.addEventListener('copy', e => {
      if (e.target.closest?.('input, textarea, select, [contenteditable], .cm-editor') || !this.canvas.selected.size) return;
      const d = selectionPart(this.selectionDoc([...this.canvas.selected]));
      if (!d) return;
      e.preventDefault();
      e.clipboardData.setData('text/plain', JSON.stringify(d));
      this.log(`Copied ${this.canvas.selected.size} marks: paste them into any scene.`);
    });
    // Paste: whatever it is. Pictures become image marks; studio JSON comes in; SVG comes back as
    // marks (with a studio record) or as a vector image; p5 code becomes a p5 board, studio code a
    // drawing board; other text a note. All where you are looking.
    document.addEventListener('paste', e => {
      if (e.target.closest?.('input, textarea, select, [contenteditable], .cm-editor')) return;
      const files = [...(e.clipboardData?.files || [])];
      const text = e.clipboardData?.getData('text/plain') || '';
      if (!files.length && !text.trim()) return;
      e.preventDefault();
      this.pasteContent({ files, text }).catch(err => this.log(`Paste: ${err.message}`, 'error'));
    });
    this.log('Workbench ready.');
  }

  registerPanels() {
    // An embedded editor carries only the panels an editor needs (embed.panels); the rest are never registered.
    const only = this.embed?.panels;
    const reg = (id, title, iconName, natural, mount, extra = {}) => { if (!only || only.includes(id)) this.docks.register({ id, title, icon: iconName, natural, mount: el => mount(el, this), ...extra }); };
    reg('scenes', 'Scenes', 'scenes', 'left', mountScenes);
    reg('boards', 'Boards', 'board', 'left', mountBoards);
    reg('stages', 'Stages', 'stages', 'left', mountStages);
    reg('outliner', 'Outliner', 'layers', 'left', mountOutliner);
    if (this.embed) reg('properties', 'Properties', 'properties', 'left', mountProperties);   // the embedded editor has one sidebar: layers, then properties
    reg('assets', 'Assets', 'assets', 'left', el => this.mountAssets(el));
    reg('sources', 'Sources', 'source', 'left', mountSources);
    reg('gestures', 'Gestures', 'hand', 'left', mountGestures);
    if (!this.embed) reg('properties', 'Properties', 'properties', 'right', mountProperties);
    reg('script', 'Code', 'script', 'right', mountCode);
    reg('process', 'Process', 'process', 'right', mountProcess);
    reg('generate', 'Generate', 'sparkles', 'right', mountGenerate);
    reg('assistant', 'Assistant', 'chat', 'right', mountAssistant);
    reg('decide', 'Decide', 'exercise', 'right', mountDecide);
    reg('docs', 'Docs', 'book', 'right', mountDocs);
    reg('settings', 'Settings', 'gear', 'right', mountSettings);
    reg('shortcuts', 'Shortcuts', 'keyboard', 'right', mountShortcuts);
    reg('timeline', 'Timeline', 'film', 'bottom', mountTimeline);
    reg('mixer', 'Mixer', 'mixer', 'bottom', mountMixer);
    reg('history', 'History', 'history', 'bottom', mountHistory);
    reg('log', 'Log', 'log', 'bottom', mountLog, { allowBottom: true, openByDefault: false });
  }

  mountAssets(el) {
    this.assetPanel = new AssetPanel({
      store: this.assetStore,
      onOpen: a => this.openAsset(a),
      onPlaylist: (a, x, y) => this.playlistMenu([this.playlistItemForAsset(a)], x, y),
      onSelect: a => { this.selectedAsset = a?.id || null; if (a) { this.canvas.select([]); this.canvas.selectBoard(null); } this.emit('asset'); },
      onPlace: a => { const c = this.canvas; this.placeAsset(a.id, c.toWorld(c.w / 2, c.h / 2)).catch(err => this.log(err.message, 'error')); },
      onUseAsReference: a => this.setReferenceFromBlob(a.blob, a.title),
      onExport: a => (a.kind === 'dataset' && a.program?.jsonl
        ? download(a.program.jsonl, `${a.title}.jsonl`, 'application/jsonl')
        : download(a.blob, `${a.title}.png`, a.blob.type))
    });
    this.assetPanel.render(el);
  }

  async openAsset(a) {
    if (a.kind === 'stream' && a.meta?.stream) { await this.streamAsset(a); return; }
    // A picture, GIF or video opens as a source (code reads it by name) with a board previewing it:
    // the one you have for it already, or a new one at the middle of the view. (It is not put under
    // the main board: the asset card's reference button does that.)
    const isDrawing = a.program?.type === 'ams-process' || a.program?.actions;
    if (!isDrawing && (a.kind === 'video' || /^(video|image)\//.test(a.blob?.type || ''))) { await this.previewAsset(a); return; }
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

  /**
   * A source from an address (a video or picture URL, or a Wikipedia / Commons File: page): streamed,
   * not stored. A movie waits on its first frame; a board previews it, with a player.
   */
  /** A stream asset (a reference): its address, size and range, started as a source with a board at `at` (or the middle of the view). */
  async streamAsset(a, at = null) {
    const s = a.meta.stream;
    const have = this.sources.list.find(d => d.meta?.source === s.page && d.meta?.assetId === a.id);
    if (have) { const b = boardsOf(this.store.doc).find(x => x.source === have.name && !x.code); if (b) { this.goToBoard(b.id, { animate: true }); return b; } }
    const c = this.canvas, name = await this.addSourceUrl(s.page, { quality: s.quality || '480', start: s.start, end: s.end, title: s.note, lazy: true, asset: false, at: at || c.toWorld(c.w / 2, c.h / 2), assetId: a.id });
    const b = boardsOf(this.store.doc).find(x => x.source === name && !x.code);
    if (b) { this.store.updateBoard(b.id, { title: a.title }); this.applyAssetDefaults(name, b, a); }
    return b;
  }

  async addSourceUrl(text, { quality = '480', start = null, end = null, title = null, lazy = false, place = true, asset = true, at = null, assetId = null } = {}) {
    const { resolveMediaUrl } = await import('./mediaUrl.js');
    const m = await resolveMediaUrl(text, { quality });
    const name = await this.sources.add({ kind: 'url', url: m.url, mediaKind: m.kind, name: m.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'link', lazy, meta: { title: m.title, license: m.license, artist: m.artist, source: m.source, assetId, height: m.height, width: m.srcHeight ? Math.round(m.srcHeight * (m.width / m.srcHeight)) : null, srcWidth: m.width, srcHeight: m.srcHeight, note: title } });
    if (m.kind === 'video') this.sources.update(name, { speed: 0 });
    // A moment of a long film: the in and out points, from seconds (fractions of the clip once its length is known).
    const dur = this.sources.entries.get(name)?.live?.video?.duration || m.duration;
    if (dur && (start != null || end != null)) this.sources.update(name, { in: Math.max(0, (start ?? 0) / dur), out: Math.min(1, (end ?? dur) / dur) });
    if (!lazy && dur && start != null) this.sources.entries.get(name).live.video.currentTime = start;
    this.log(`Source “${name}”: streamed from ${new URL(m.url).host}${m.license ? ` (${m.license}${m.artist ? `, ${m.artist}` : ''})` : ''}.`);
    const c = this.canvas;
    if (place) await this.placeSource(name, at || c.toWorld(c.w / 2, c.h / 2));
    // An address you typed is kept as a stream asset too (a reference to drag into any scene).
    if (asset && !assetId) {
      const id = `stream:${m.source}${start != null ? `#${start}-${end}` : ''}`;
      if (!(await this.assetStore.get(id).catch(() => null))) await this.assetStore.addStream({ id, title: m.title, page: text, quality, start, end, note: '', license: m.license, artist: m.artist, folder: 'Streams' });
    }
    return name;
  }

  /**
   * A new scene with the stock samples (Assets › Samples), each a source on its own board with a player,
   * in a grid. GIFs play; movies wait on their first frame.
   */
  async buildSamplesScene() {
    const assets = (await this.assetStore.all()).filter(a => a.folder === 'Samples' && a.blob && /^(video|image)\//.test(a.blob.type)).sort((a, b) => String(a.title).localeCompare(b.title));
    if (!assets.length) throw new Error('No samples in Assets (Samples folder)');
    await this.scenes.create({ title: 'Samples' });
    const cols = 4, gx = 1000, gy = 1100;
    let i = 0;
    for (const a of assets) {
      let name = this.sources.list.find(d => d.kind === 'asset' && d.assetId === a.id)?.name;
      if (!name) { name = await this.sources.add({ kind: 'asset', assetId: a.id }); if (this.sources.entries.get(name)?.live?.kind === 'video') this.sources.update(name, { speed: 0 }); }
      const b = await this.placeSource(name, [(i % cols) * gx + 1300, Math.floor(i / cols) * gy + 100], { go: false });
      this.store.updateBoard(b.id, { title: a.title });
      i++;
    }
    // The clips to stream (public domain, from Wikipedia / Commons): each a lazy source, which starts when its board is on
    // screen and big enough: the overview reads nothing.
    const { STREAM_SAMPLES } = await import('./streamSamples.js');
    let streamed = 0;
    for (const s of STREAM_SAMPLES) {
      try {
        const name = await this.addSourceUrl(s.page, { quality: s.quality || '480', start: s.start, end: s.end, title: s.note, lazy: true, place: false, asset: false });
        const b = await this.placeSource(name, [(i % cols) * gx + 1300, Math.floor(i / cols) * gy + 100], { go: false });
        const m = this.sources.def(name)?.meta || {};
        this.store.updateBoard(b.id, { title: s.title, text: [s.note, m.license && `${m.license}${m.artist ? `, ${m.artist}` : ''}`, 'Streamed: nothing is downloaded.'].filter(Boolean).join('  \n') });
        i++; streamed++;
      } catch (err) { this.log(`Samples: ${s.title}: ${err.message}`, 'error'); }
      await new Promise(r => setTimeout(r, 900));   // the wiki's API asks for a gentle pace
    }
    this.fitAllBoards();
    return assets.length + streamed;
  }

  // ---- playlists -----------------------------------------------------------------------------

  /** The playlist item for a board: the media it shows, or the board itself. */
  playlistItemForBoard(b) {
    const d = b.source && this.sources.def(b.source);
    if (d) {
      if (d.meta?.assetId && d.kind === 'url') return { kind: 'stream', ref: d.meta.assetId };
      if (d.kind === 'asset') return { kind: 'asset', ref: d.assetId };
      if (d.kind === 'url') return { kind: 'url', ref: d.meta?.source || d.url };
      return { kind: 'source', ref: d.name };
    }
    return { kind: 'board', ref: b.title };
  }

  playlistItemForAsset(a) { return a.kind === 'stream' ? { kind: 'stream', ref: a.id } : { kind: 'asset', ref: a.id }; }

  /** The playlist's own + : anything in the scene or Assets to add (boards, sources, streams, assets, an address). */
  async playlistAddMenu(id, x, y) {
    const doc = this.store.doc, add = it => this.playlists.addItem(id, it);
    const boards = boardsOf(doc).filter(b => b.id !== id && b.kind !== 'playlist' && b.kind !== 'frame' && !b.main);
    const assets = await this.assetStore.all();
    const streams = assets.filter(a => a.kind === 'stream'), groups = [...new Set(streams.map(a => a.folder))].sort();
    const media = assets.filter(a => a.kind !== 'stream' && /^(video|image)\//.test(a.blob?.type || '') && !a.program);
    showMenu([
      { label: 'Add to the playlist' },
      boards.length ? { label: 'A board', hint: 'It runs alone and the view goes to it', items: boards.map(b => ({ label: b.title, run: () => add({ kind: 'board', ref: b.title }) })) } : null,
      this.sources.list.length ? { label: 'A source', items: this.sources.list.map(s => ({ label: s.name, run: () => add({ kind: 'source', ref: s.name }) })) } : null,
      groups.length ? { label: 'A stream', items: groups.map(g => ({ label: g.replace(/^Streams\/?/, '') || 'Streams', items: streams.filter(a => a.folder === g).map(a => ({ label: a.title, run: () => add({ kind: 'stream', ref: a.id }) })) })) } : null,
      media.length ? { label: 'A clip or picture', items: media.map(a => ({ label: a.title, run: () => add({ kind: 'asset', ref: a.id }) })) } : null,
      '-',
      { label: 'An address…', hint: 'A video or picture URL, or a Wikipedia / Commons File: page', run: async () => { const u = await askText('Address (https://…)', ''); if (u) add({ kind: 'url', ref: u.trim() }); } }
    ].filter(Boolean), x, y);
  }

  /** A playlist board (new, beside `near`) holding these items; its target is the board they came from when they show media. */
  newPlaylist(items, near = null, target = '') {
    const at = near || { x: 0, y: 0, width: 400, height: 300 };
    const b = this.store.addBoard({ title: 'Playlist', x: Math.round(at.x + at.width + 80), y: Math.round(at.y), width: 440, height: 360, ground: '#1c1c1c', adopt: false });
    this.store.updateBoard(b.id, { kind: 'playlist', code: writePlaylist({ target, loop: true, items }) });
    this.setBoardLive(b.id, true);
    return b;
  }

  /** Add items to a playlist (a menu of the scene's playlists, and a new one). */
  playlistMenu(items, x, y, near = null) {
    const lists = boardsOf(this.store.doc).filter(b => b.kind === 'playlist');
    const first = near && items[0]?.kind !== 'board' ? near.title : '';
    showMenu([
      { label: `Add ${items.length > 1 ? `${items.length} items` : 'it'} to a playlist` },
      ...lists.map(l => ({ label: l.title, run: () => { for (const it of items) this.playlists.addItem(l.id, it); } })),
      lists.length ? '-' : null,
      { label: 'New playlist', run: () => { const b = this.newPlaylist(items, near, first); this.canvas.selectBoard(b.id); } }
    ].filter(Boolean), x, y);
  }

  /** The source a board is captured as (its picture, live), or null. */
  captureOf(id) { return this.sources.list.find(d => d.kind === 'board' && d.boardId === id) || null; }

  /**
   * Use a board as a source: its picture (what is under it, then its marks) as a live stream that other
   * boards read by name: source('title'). Again to stop.
   */
  async setBoardCapture(id, on = !this.captureOf(id)) {
    const have = this.captureOf(id), b = boardById(this.store.doc, id);
    if (!b) return null;
    if (!on) { if (have) this.sources.remove(have.name); this.emit('document', 'capture'); return null; }
    if (have) return have.name;
    const name = await this.sources.add({ kind: 'board', boardId: id, name: String(b.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'board' });
    this.log(`Board “${b.title}” is a source: source('${name}') in code.`);
    this.emit('document', 'capture');
    return name;
  }

  /** The view fitted around every board. */
  fitAllBoards(margin = 60) {
    const bs = boardsOf(this.store.doc).filter(b => b.kind !== 'frame');
    if (!bs.length) return;
    const x0 = Math.min(...bs.map(b => b.x)), y0 = Math.min(...bs.map(b => b.y)), x1 = Math.max(...bs.map(b => b.x + b.width)), y1 = Math.max(...bs.map(b => b.y + b.height));
    const c = this.canvas, z = Math.min((c.w - 2 * margin) / (x1 - x0), (c.h - 2 * margin) / (y1 - y0), 2);
    c.cam = { z, x: c.w / 2 - ((x0 + x1) / 2) * z, y: c.h / 2 - ((y0 + y1) / 2) * z + 10 };
    c.saveCam?.(); c.invalidate();
  }

  /** A clip's default state (Properties of the asset) applied to its new source and board. */
  applyAssetDefaults(name, board, a) {
    const d = a?.meta?.defaults;
    if (!d) return;
    const patch = {};
    if (d.speed != null) patch.speed = d.speed;
    if (d.loop != null) patch.loop = d.loop;
    if (d.volume != null) patch.volume = d.volume;
    if (Object.keys(patch).length) this.sources.update(name, patch);
    if (board && (d.opacity != null || d.blend || d.fit)) this.setBoardSourceLook(board.id, { ...(d.opacity != null ? { opacity: d.opacity } : {}), ...(d.blend ? { blend: d.blend } : {}), ...(d.fit ? { fit: d.fit } : {}) });
  }

  /** An asset as a source, and a board previewing it (see placeSource). */
  async previewAsset(a, at = null) {
    let name = this.sources.list.find(d => d.kind === 'asset' && d.assetId === a.id)?.name;
    if (!name) {
      name = await this.sources.add({ kind: 'asset', assetId: a.id });
      // GIFs play as they arrive; a movie waits (on its first frame) for the player's play.
      if (this.sources.entries.get(name)?.live?.kind === 'video') this.sources.update(name, { speed: 0 });
      const dur = this.sources.entries.get(name)?.live?.video?.duration, d = a.meta?.defaults;
      if (dur && (d?.in != null || d?.out != null)) this.sources.update(name, { in: (d.in ?? 0) / dur, out: (d.out ?? dur) / dur });
    }
    const have = boardsOf(this.store.doc).find(b => b.source === name && b.title === name && !b.code);
    if (have) { this.addPlayer(name, have); this.goToBoard(have.id, { animate: true }); return have; }
    const c = this.canvas, b = await this.placeSource(name, at || c.toWorld(c.w / 2, c.h / 2));
    this.applyAssetDefaults(name, b, a);
    this.log(`Source “${name}”: source('${name}') in code; a board previews it.`);
    return b;
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

  /**
   * Boards that follow their sources: when a source a board's code reads (source('cam'), fit('cam'))
   * takes a new frame, the code runs again, as a live redraw (no undo step). Throttled by how long a
   * run takes. Boards showing a source underneath are redrawn too.
   */
  followSources() {
    const last = new Map(), pending = new Map();
    // A source samples only while something live needs it: a live board on screen that follows it or
    // shows it, or a live mark's brush that read it a moment ago. Paused, it keeps its last frame.
    // A lazy stream wakes when a board showing it is live, on screen and big (not in a zoomed-out overview).
    this.sources.lazyWanted = name => boardsOf(this.store.doc).some(b => (b.source === name || b.maskWith?.source === name) && this.isBoardActive(b.id, b) && b.width * this.canvas.cam.z >= 240);
    this.sources.wanted = name => readRecently(name, 1500) || boardsOf(this.store.doc).some(b => (b.source === name || b.maskWith?.source === name || (b.follow && reads(b.code, name))) && this.isBoardActive(b.id, b));
    const reads = (code, name) => new RegExp(`\\b(source|fit)\\(\\s*['"\`]${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]`).test(code || '');
    this.sources.on(name => {
      if (!name) { this.renderChrome(); return; }
      const doc = this.store.doc;
      if (boardsOf(doc).some(b => b.source === name || b.maskWith?.source === name) || readRecently(name)) this.canvas?.invalidate();
      for (const b of boardsOf(doc)) {
        if (!b.follow || rateOf(b) || !reads(b.code, name) || !this.isBoardActive(b.id, b)) continue;   // (a board with a redraw rate runs on its own clock)
        rerun(b);
      }
    });
    // A fit finished in the background (see process/fit.js): the board runs again to draw it.
    onFitReady(id => { const b = boardById(this.store.doc, id); if (b?.code && !rateOf(b) && this.isBoardActive(b.id, b)) rerun(b, true); });
    // The redraw clock: a board with a rate runs that many times a second (fewer when its runs are
    // slow), whatever the pace of its sources: a slow GIF, a still. Each run has fresh randomness, so
    // strokes and dots are drawn again; the source only changes what they see.
    let seedCount = 1;
    this.followClock = setInterval(() => {
      if (document.hidden) return;
      const now = performance.now();
      for (const b of boardsOf(this.store.doc)) {
        const rate = rateOf(b);
        if (!rate || !b.follow || !b.code || pending.has(b.id) || !this.isBoardActive(b.id, b)) continue;
        const l = last.get(b.id);
        if (l && now - l.at < Math.max(1000 / rate, 1.5 * l.took)) continue;
        run(b, { seed: ++seedCount, fresh: true });
      }
    }, 8);
    const rerun = (b, now = false) => {
        if (pending.has(b.id)) return;
        const since = performance.now() - (last.get(b.id)?.at || 0), wait = now ? 0 : Math.max(0, Math.max(30, 2 * (last.get(b.id)?.took || 0)) - since);   // up to ~30 runs a second, fewer when a run is slow
        pending.set(b.id, setTimeout(() => {
          pending.delete(b.id);
          const cur = boardById(this.store.doc, b.id);
          if (!cur?.code || (!cur.follow && !now)) return;   // a fit that finished redraws any board; frames only following ones
          run(cur);
        }, wait));
    };
    const run = (cur, extra = {}) => {
          const b = cur;
          const t0 = performance.now();
          const res = this.store.runBoardCode(b.id, cur.code, runScript, { by: 'code', transient: true, ...extra });
          last.set(b.id, { at: performance.now(), took: performance.now() - t0 });
          if (res.error && !last.get(`${b.id}:err`)) { last.set(`${b.id}:err`, true); this.log(`Board “${cur.title}” (following): ${res.error}`, 'error'); }
          if (!res.error) last.delete(`${b.id}:err`);
    };
  }

  /**
   * Live boards run: their code follows its sources, their brushes read live frames, and they are
   * drawn every frame. The board you are on is always live; others when switched on (board.live).
   * The rest are paused: baked into a picture (see canvasView.drawBaked) and left as they were.
   */
  /** The boards whose marks play (cached by the count of changes). */
  scoreBoards() {
    const doc = this.store.doc;
    if (!this._scoreBoards || this._scoreBoardsRev !== this.store.rev) {
      this._scoreBoardsRev = this.store.rev;
      this._scoreBoards = new Set(doc.elements.filter(e => e.play).map(e => e.board || MAIN));
    }
    return this._scoreBoards;
  }

  isBoardLive(id) {
    const doc = this.store.doc, b = boardById(doc, id);
    if (!b || b.paused || b.hidden) return false;   // paused by hand (or hidden): stays paused, even while you are on it
    if (this.scoreBoards().has(b.id)) return true;   // a board with a score runs (and sounds) unless paused: the play button is its mute, Opt+click its solo
    if (b.id === (this.activeBoard || MAIN) || b.live) return true;
    // On a frame (a slide): the boards it holds are live together.
    const active = boardById(doc, this.activeBoard || MAIN);
    return isFrame(active) && boardsInFrame(doc, active).some(x => x.id === b.id);
  }

  /**
   * Play or pause a board (its title's button, the Boards panel, its menu). Pausing holds even while
   * you are on the board; playing a board you are not on keeps it running (while on screen).
   */
  toggleBoardRun(id) {
    const live = this.isBoardLive(id);
    this.store.change(live ? 'board paused' : 'board live', d => {
      const t = !id || id === MAIN ? d.artboard : d.boards.find(x => x.id === id);
      if (!t) return;
      if (live) { t.paused = true; delete t.live; }
      else { delete t.paused; if ((id || MAIN) !== (this.activeBoard || MAIN)) t.live = true; }
    });
  }

  /**
   * Solo a board: it plays and every other board is paused (baked). Solo it again, when it already is
   * the only one running, and they all play again. One undo step.
   */
  /** Run only this board (the others pause), whatever the state was. */
  soloOnly(id) { if (!(this.isBoardLive(id) && boardsOf(this.store.doc).filter(b => b.kind !== 'frame' && b.id !== id).every(b => b.paused))) this.soloBoard(id); }

  soloBoard(id) {
    const boards = boardsOf(this.store.doc).filter(b => b.kind !== 'frame');
    const others = boards.filter(b => b.id !== id);
    const alone = this.isBoardLive(id) && others.every(b => b.paused);
    this.store.change(alone ? 'boards play' : 'solo board', d => {
      const all = [{ t: d.artboard, id: MAIN }, ...d.boards.map(t => ({ t, id: t.id }))];
      for (const { t, id: bid } of all) {
        if (t.kind === 'frame') continue;
        if (alone) { delete t.paused; continue; }
        if (bid === id) { delete t.paused; if (bid !== (this.activeBoard || MAIN)) t.live = true; }
        else { t.paused = true; delete t.live; }
      }
    });
    this.log(alone ? 'All boards play.' : `Solo: only “${boardById(this.store.doc, id)?.title}” runs.`);
  }

  /** A board around the selected marks (with a margin), which they move into. One undo step for the board, one for the move. */
  boardFromSelection(ids) {
    const b = this.canvas.selectionBounds();
    if (!b || !ids.length) return null;
    const pad = 40, x = Math.floor(b.x0 - pad), y = Math.floor(b.y0 - pad);
    const width = Math.max(40, Math.ceil(b.x1 + pad - x)), height = Math.max(40, Math.ceil(b.y1 + pad - y));
    const first = this.store.doc.elements.find(e => ids.includes(e.id)), from = boardById(this.store.doc, first?.board || MAIN);
    const board = this.store.addBoard({ title: `Board ${boardsOf(this.store.doc).length}`, x, y, width, height, ground: from?.ground, adopt: false });
    this.store.change('marks to board', d => { for (const e of d.elements) if (ids.includes(e.id)) e.board = board.id; });
    this.canvas.select([]);
    this.canvas.selectBoard(board.id);
    this.log(`Board “${board.title}” from ${ids.length} mark${ids.length === 1 ? '' : 's'}.`);
    return board;
  }

  /** Live and on screen: a board whose processes run now. */
  isBoardActive(id, b = boardById(this.store.doc, id)) { return Boolean(b) && this.isBoardLive(id) && this.canvas.boardOnScreen(b, 0); }

  setBoardLive(id, on) {
    this.store.change(on ? 'board live' : 'board paused', d => {
      const t = !id || id === MAIN ? d.artboard : d.boards.find(x => x.id === id);
      if (!t) return;
      if (on) { t.live = true; delete t.paused; } else delete t.live;
    });
  }

  /**
   * Bake marks into one image mark (after underscores' bake): they are drawn into a PNG, which replaces
   * them in place, with a record of what went in (e.bake). One undo step brings them back.
   * rect: the picture's bounds in world units (default: the marks' bounds, with room for their brushes).
   */
  bakeMarks(ids, { rect = null, title = 'baked', board = undefined, also = null, format = 'png' } = {}) {
    const doc = this.store.doc, set = new Set(ids);
    const marks = doc.elements.filter(e => set.has(e.id) && e.role !== 'note' && e.points?.length);
    if (!marks.length) return null;
    if (!rect) {
      const xs = marks.flatMap(e => e.points.map(p => p[0])), ys = marks.flatMap(e => e.points.map(p => p[1]));
      const x0 = Math.min(...xs), y0 = Math.min(...ys), x1 = Math.max(...xs), y1 = Math.max(...ys);
      const pad = 0.04 * Math.max(x1 - x0, y1 - y0) + 24;
      rect = { x: x0 - pad, y: y0 - pad, width: x1 - x0 + 2 * pad, height: y1 - y0 + 2 * pad };
    }
    let src;
    if (format === 'svg') {
      // Vector: the marks as SVG (their brushes' paths), crisp at any zoom.
      const part = { ...doc, boards: [], artboard: { width: Math.ceil(rect.width), height: Math.ceil(rect.height), ground: 'transparent' }, elements: marks.map(e => ({ ...e, board: undefined, points: e.points.map(([x, y, t, p]) => [x - rect.x, y - rect.y, t, p]) })) };
      src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(toSVG(part, { mode: 'picture' }))}`;
    } else {
      const s = Math.min(2, 4096 / Math.max(rect.width, rect.height));
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(rect.width * s)); c.height = Math.max(1, Math.round(rect.height * s));
      renderDocument(c.getContext('2d'), { ...doc, elements: marks }, { mode: 'picture', transform: { x: -rect.x * s, y: -rect.y * s, scale: s }, ground: false, frozen: true, now: Date.now() });
      src = c.toDataURL('image/png');
    }
    const gone = new Set(marks.map(e => e.id));
    const onBoard = board !== undefined ? board : marks[0].board;
    const el = this.store.change(`bake ${title}`, d => {
      d.elements = d.elements.filter(e => !gone.has(e.id));
      also?.(d);
      const { x, y, width: w, height: h } = rect;
      const e = normalizeElement({ role: 'image', src, label: `${title} (baked${format === 'svg' ? ', SVG' : ''})`, why: `baked from ${marks.length} marks`, bake: { count: marks.length, ids: [...gone].slice(0, 500), at: Date.now(), format },
        points: [[x, y, 0, 0.5], [x + w, y, 0, 0.5], [x + w, y + h, 0, 0.5], [x, y + h, 0, 0.5]], ...(onBoard && onBoard !== MAIN ? { board: onBoard } : {}) }, marks[0].stage || this.activeStage.id);
      d.elements.push(e);
      return e;
    });
    this.log(`Baked ${marks.length} marks into one ${format === 'svg' ? 'SVG' : 'PNG'} image (undo brings them back).`);
    return el;
  }

  /** Bake a whole board: its marks become one image the size of the board; it stops following its sources. */
  bakeBoard(id, format = 'png') {
    const b = boardById(this.store.doc, id);
    if (!b) return null;
    const ids = this.store.doc.elements.filter(e => (e.board || MAIN) === b.id).map(e => e.id);
    if (!ids.length) { this.log(`“${b.title}” has no marks to bake.`); return null; }
    return this.bakeMarks(ids, { format, rect: { x: b.x, y: b.y, width: b.width, height: b.height }, title: b.title, board: b.id, also: d => { delete (b.main ? d.artboard : d.boards.find(x => x.id === b.id)).follow; } });
  }

  /**
   * Convert a board between the studio's code and p5.js, as a new board beside the others (the
   * original stays): a drawing's code becomes the p5 sketch the export writes (it runs here, and
   * pastes into the p5 editor as it is); a sketch the studio wrote becomes studio code again.
   */
  async convertBoard(id, to) {
    const b = boardById(this.store.doc, id);
    if (!b) return null;
    let kind, code, size = { width: b.width, height: b.height }, ground = b.ground;
    if (to === 'p5') {
      if (boardKind(b) !== 'drawing' || !b.code) { this.log(`“${b.title}” has no studio code to convert.`, 'error'); return null; }
      kind = 'p5'; code = (await this.p5CodeFor(b.id)).code;
    } else {
      const r = boardKind(b) === 'p5' && p5ToStudio(b.code);
      if (!r) { this.log(`“${b.title}” is not a sketch the studio wrote: only those convert back (bake it to an image instead).`, 'error'); return null; }
      kind = 'drawing'; code = r.code; size = { width: r.width || b.width, height: r.height || b.height }; ground = r.ground || b.ground;
    }
    const title = `${b.title.replace(/ · (p5|studio)$/, '')} · ${to}`;
    const nb = this.store.addBoard({ title, ...size, ground });
    this.store.updateBoard(nb.id, { kind, code });
    if (kind === 'drawing') this.store.runBoardCode(nb.id, code, runScript);
    if (b.follow || b.live) this.setBoardLive(nb.id, true);
    this.goToBoard(nb.id, { animate: true });
    this.log(`“${title}”: ${to === 'p5' ? 'the board as a p5.js sketch (the same code runs in the p5 editor, with its pictures uploaded)' : 'the sketch as studio code'}.`);
    return nb;
  }

  /** Copy a board: as a picture (PNG), SVG, JSON (to paste into any scene) or code (studio or p5). */
  async copyBoard(id, kind) {
    const b = boardById(this.store.doc, id);
    if (!b) return;
    try {
      if (kind === 'png') { const blob = await canvasBlob(this.boardPicture(b, 2, 'picture')); await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); }
      else {
        const text = kind === 'svg' ? toSVG(boardDoc(this.store.doc, b.id), { mode: 'picture' })
          : kind === 'json' ? JSON.stringify(boardPart(this.store.doc, b.id))
          : kind === 'p5' ? (boardKind(b) === 'p5' ? b.code : (await this.p5CodeFor(b.id))?.code || toP5Min(boardDoc(this.store.doc, b.id), { version: this.p5Version() }))
          : b.code || '';
        await navigator.clipboard.writeText(text);
      }
      this.log(`Copied “${b.title}” as ${kind === 'code' ? 'its code' : kind.toUpperCase()}.`);
    } catch (err) { this.log(`Copy: ${err.message}`, 'error'); }
  }


  /**
   * Follow a link from a document: [[Board]] (go to it), [[scene:Title]] (open that scene),
   * [[asset:Title]] (open the asset).
   */
  async openLink(target, heading = '') {
    const t = String(target || '').trim();
    if (/^scene:/i.test(t)) { const s = this.scenes.all.find(x => x.title.toLowerCase() === t.slice(6).trim().toLowerCase()); if (s) await this.scenes.switchTo(s.id); else this.log(`No scene “${t.slice(6)}”.`, 'error'); return; }
    if (/^asset:/i.test(t)) { const a = (await this.assetStore.all()).find(x => String(x.title).toLowerCase() === t.slice(6).trim().toLowerCase()); if (a) this.openAsset(a); else this.log(`No asset “${t.slice(6)}”.`, 'error'); return; }
    const b = findBoard(this.store.doc, t);
    if (!b) { this.log(`No board “${t}” in this scene.`, 'error'); return; }
    this.goToBoard(b.id, { animate: true });
  }

  /** A board follows its sources (its code re-runs on each new frame) or not. */
  setBoardFollow(id, on) {
    this.store.change(on ? 'follow sources' : 'stop following', d => {
      const t = !id || id === MAIN ? d.artboard : d.boards.find(x => x.id === id);
      if (!t) return;
      if (on) { t.follow = true; delete t.paused; } else delete t.follow;
    });
  }

  /**
   * A board previewing a source: the source's shape, the source underneath it (live, whole), and no
   * code yet. Add code (or a demo: the board's menu) to draw from it.
   */
  async placeSource(name, at, { go = true } = {}) {
    // Its shape comes from its picture: a video's once it has one (its canvas starts as a placeholder).
    await this.sources.whenReady([name], 5000);
    const video = this.sources.entries.get(name)?.live?.video;
    for (let i = 0; video && !video.videoWidth && i < 50; i++) await new Promise(r => setTimeout(r, 100));
    const view = this.sources.view(name), long = 800;
    const dm = this.sources.def(name)?.meta || {};
    const w = video?.videoWidth || view?.width || dm.srcWidth || 4, hgt = video?.videoHeight || view?.height || dm.srcHeight || 3, k = long / Math.max(w, hgt);
    const width = Math.round(w * k), height = Math.round(hgt * k);
    const b = this.store.addBoard({ title: name, width, height, x: Math.round(at[0] - width / 2), y: Math.round(at[1] - height / 2), adopt: false });
    this.setBoardSource(b.id, name, 1);
    this.setBoardLive(b.id, true);
    this.addPlayer(name, b);
    if (go) this.goToBoard(b.id, { animate: true });
    return b;
  }

  /** The source a board shows or plays, when that source has a timeline (a clip or a GIF); else null. */
  playableSource(b) {
    const name = b?.source;
    const d = name && this.sources.def(name);
    return name && (this.sources.entries.get(name)?.live?.position?.() || (d?.lazy && d.mediaKind === 'video')) ? name : null;   // (a lazy stream is a clip before it starts)
  }

  /** A source's playback, for the controls (the player board and Properties): { pos, speed, playing }. */
  mediaState(name) {
    const pos = this.sources.entries.get(name)?.live?.position?.() || null, speed = this.sources.def(name)?.speed ?? 1;
    const live = this.sources.entries.get(name)?.live;
    const def = this.sources.def(name);
    return { pos, speed, playing: speed > 0, loop: def?.loop !== false, inP: def?.in ?? 0, outP: def?.out ?? 1, volume: this.sources.def(name)?.volume ?? 0, sound: live?.hasAudio?.() ?? null };   // null: not known yet (the controls show)
  }

  /** One control on a source: 'play' (toggle), 'step' (±1 frame), 'seek' (0..1), 'speed'. Playing is never touched by anything else. */
  mediaAct(name, act, value) {
    const S = this.sources, live = S.entries.get(name)?.live, speed = S.def(name)?.speed ?? 1;
    if (!live) return;
    this.mediaLast ||= new Map();
    const pause = () => { if (speed > 0) { this.mediaLast.set(name, speed); S.update(name, { speed: 0 }); } };
    if (act === 'play') { if (speed > 0) pause(); else { if (live.atEnd?.()) live.seek(S.def(name)?.in ?? 0); S.update(name, { speed: this.mediaLast.get(name) || 1 }); } }
    else if (act === 'loop') S.update(name, { loop: !(S.def(name)?.loop !== false) });
    else if (act === 'in' || act === 'out') { const f = live.position?.()?.fraction ?? 0, d = S.def(name) || {}; S.update(name, act === 'in' ? { in: Math.min(f, d.out ?? 1) } : { out: Math.max(f, d.in ?? 0) }); }
    else if (act === 'range') S.update(name, { in: 0, out: 1 });
    else if (act === 'step') { pause(); live.step(value); }
    else if (act === 'seek') live.seek(value);
    else if (act === 'speed') S.update(name, { speed: Number(value) });
    else if (act === 'volume') S.update(name, { volume: Math.max(0, Math.min(1, Number(value))) });
    else if (act === 'mute') { const v = S.def(name)?.volume ?? 0; if (v > 0) { this.mediaLast.set(`${name}:vol`, v); S.update(name, { volume: 0 }); } else S.update(name, { volume: this.mediaLast.get(`${name}:vol`) || 0.7 }); }
    this.canvas.invalidate();
  }

  /** Whether a board's media controls (its source's player) are shown. */
  playerShown(b) {
    if (b?.kind === 'player') return !b.hidden;   // a player board from before
    return Boolean(b?.controls && this.playableSource(b));
  }

  /** Show or hide the media controls of a board's source (its player board; made when there is none). */
  togglePlayer(b) {
    const name = this.playableSource(b);
    if (!name) return;
    if (b.kind === 'player') { this.setBoardFlag(b.id, 'hidden', !b.hidden); return; }   // a player board from before
    this.store.updateBoard(b.id, { controls: !b.controls });
    this.canvas.invalidate();
  }

  /**
   * A player board under a preview board: play / pause, step, a scrubber and speed for the source
   * (a clip or a GIF; a picture or a camera has nothing to play, so none is made).
   */
  addPlayer(name, under) {
    const live = this.sources.entries.get(name)?.live, d = this.sources.def(name);
    if ((!live?.position?.() && !(d?.lazy && d.mediaKind === 'video')) || under.kind === 'player') return null;
    const have = boardsOf(this.store.doc).find(b => b.kind === 'player' && b.source === name);
    if (have) return have;   // (a player board from before: a board of its own)
    this.store.updateBoard(under.id, { controls: true });
    return under;
  }

  /** A demo's code on a board, reading a source, followed (re-run on its frames). */
  sourceDemo(id, demoId, name) {
    const demo = SOURCE_DEMOS.find(d => d.id === demoId);
    if (!demo) return;
    // The drawing is on its own paper: a preview board's source underneath goes (it changes with each
    // frame of the clip, and the paper should not), and the board's redraw rate is the demo's.
    const b = boardById(this.store.doc, id);
    if (b?.source) this.setBoardSource(id, null);
    this.store.updateBoard(id, { rate: demo.rate || 0 });
    this.store.runBoardCode(id, demo.code(name), this.runScript || runScript);
    this.setBoardFollow(id, true);
    this.openCode?.('board', id);
  }

  /** A board's mask ({ source | board, mode, invert, feather, fit, fx } or null) and its effects (key: 'fx' on its picture, 'sourceFx' on its source). Opt-in: a board without either is drawn as before. */
  setBoardMask(id, spec, opts) {
    const clean = spec && { ...spec }; if (clean) for (const k of Object.keys(clean)) if (clean[k] === undefined) delete clean[k];
    this.store.updateBoard(id, { maskWith: clean }, opts); this.canvas.invalidate(); this.renderChrome?.();
  }
  setBoardFx(id, key, list, opts) { this.store.updateBoard(id, { [key]: list }, opts); this.canvas.invalidate(); this.renderChrome?.(); }

  /**
   * The selected marks become the mask of the board they are on: they move to a new board of the same size (a mask board,
   * placed after the others, its marks at the same places), and the board is masked by it (alpha: where the marks are). One undo step.
   */
  makeMask(ids) {
    const doc = this.store.doc, sel = doc.elements.filter(e => ids.includes(e.id));
    if (!sel.length) return null;
    const targetId = sel[0].board && sel[0].board !== BLACKBOARD ? sel[0].board : MAIN, target = boardById(doc, targetId);
    if (!target) return null;
    let made = null;
    this.store.change('make mask', d => {
      const id = newBoardId(d), place = nextBoardPlace(d, target.width, target.height);
      const board = { id, title: `${target.title} · mask`, ...place, ground: target.ground };
      d.boards.push(board);
      const dx = board.x - target.x, dy = board.y - target.y;
      for (const e of d.elements) if (ids.includes(e.id)) { e.board = id; e.points = e.points.map(([x, y, t, p]) => [x + dx, y + dy, t, p]); }
      const t = targetId === MAIN ? d.artboard : d.boards.find(x => x.id === targetId);
      t.maskWith = { board: id, mode: 'alpha' };
      made = board;
    });
    this.canvas.select([]);
    this.log(`“${target.title}” is masked by ${sel.length} mark${sel.length === 1 ? '' : 's'}, now on the board “${made.title}”.`);
    return made;
  }

  /** A board's source underneath: its opacity, blend and fit (the source itself: setBoardSource). */
  setBoardSourceLook(id, patch) {
    this.store.change('board source look', d => {
      const t = !id || id === MAIN ? d.artboard : d.boards.find(x => x.id === id);
      if (!t?.source) return;
      if ('opacity' in patch) t.sourceOpacity = Math.max(0, Math.min(1, Number(patch.opacity)));
      if ('blend' in patch) { if (patch.blend && patch.blend !== 'normal') t.sourceBlend = patch.blend; else delete t.sourceBlend; }
      if ('fit' in patch) { if (patch.fit === 'contain') t.sourceFit = 'contain'; else delete t.sourceFit; }
    });
  }

  /** Show a source under a board (a reference: not part of the picture), or none. */
  setBoardSource(id, name, opacity, fit = 'cover') {
    this.store.change(name ? 'board source' : 'no board source', d => {
      const t = !id || id === MAIN ? d.artboard : d.boards.find(x => x.id === id);
      if (!t) return;
      if (!name) delete t.sourceBlend;
      if (name) { t.source = name; t.sourceOpacity = opacity ?? t.sourceOpacity ?? 0.5; if (fit === 'contain') t.sourceFit = 'contain'; else delete t.sourceFit; } else { delete t.source; delete t.sourceOpacity; delete t.sourceFit; }
    });
  }

  drawReference(ctx) {
    for (const b of boardsOf(this.store.doc)) {
      if (this.canvas.composedIds?.has(b.id)) continue;   // composed apart (masks.js)
      const img = b.source && (b.sourceOpacity ?? 0.5) > 0 && (this.composer.underlay(b));
      if (!img?.width) continue;
      const k = (b.sourceFit === 'contain' ? Math.min : Math.max)(b.width / img.width, b.height / img.height), w = img.width * k, hh = img.height * k;
      ctx.save();
      ctx.beginPath(); ctx.rect(b.x, b.y, b.width, b.height); ctx.clip();
      ctx.globalAlpha = b.sourceOpacity ?? 0.5;
      if (b.sourceBlend && b.sourceBlend !== 'normal') ctx.globalCompositeOperation = b.sourceBlend;   // over the paper
      ctx.drawImage(img, b.x + (b.width - w) / 2, b.y + (b.height - hh) / 2, w, hh);
      ctx.restore();
    }
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
    // Select / direct: one slot showing the one in use (V, Shift+V pick directly; click again for both).
    const selT = SELECTS.find(c => c[0] === this.tool) || SELECTS.find(c => c[0] === this.selectTool) || SELECTS[0];
    const selMenu = (x, y) => showMenu([{ label: 'Select' }, ...SELECTS.map(([id, tip, key]) => ({ icon: icon(id), active: id === selT[0], label: tip.split(':')[0], hint: tip, keys: key, run: () => this.setTool(id) }))], x, y);
    const selBtn = h('button', { class: `wb-tool wb-tool-stack${SELECTS.some(c => c[0] === this.tool) ? ' on' : ''}`, 'data-guide': `tool:${selT[0]}`, title: `${selT[1]} (${selT[2]}). Click again or right-click for select and direct`, html: `${icon(selT[0])}<kbd>${selT[2].replace('⇧', '')}</kbd><span class="wb-tool-caret"></span>` });
    selBtn.addEventListener('click', () => { if (SELECTS.some(c => c[0] === this.tool)) { const r = selBtn.getBoundingClientRect(); selMenu(r.left, r.bottom + 4); } else this.setTool(selT[0]); });
    selBtn.addEventListener('contextmenu', ev => { ev.preventDefault(); selMenu(ev.clientX, ev.clientY); });
    tools.append(selBtn);
    for (const t of TOOLS) {
      if (!t) { tools.append(h('div', { class: 'wb-sep' })); continue; }
      const [id, tip, key] = t;
      if (id === 'select') continue;
      if (id === 'plane') { tools.append(this.planeStackButton()); continue; }
      if (id === 'line') { tools.append(this.lineStackButton()); continue; }
      const drawing = ['point', 'line', 'plane'].includes(id);
      tools.append(h('button', { class: `wb-tool${this.tool === id ? ' on' : ''}`, 'data-guide': `tool:${id}`, title: `${tip} (${key})${drawing ? ' · right-click: brush and look for new marks' : ''}`, html: `${icon(id)}<kbd>${key}</kbd>`, onclick: () => this.setTool(id), oncontextmenu: drawing ? e => { e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); openToolDefaults(this, id, r.left, r.bottom + 6); } : null }));
    }
    // Brush: the active brush (click again or right-click for the list).
    const bb = BRUSHES[this.brush.id] || BRUSHES.ink;
    const brushBtn = h('button', { class: `wb-tool wb-tool-stack${this.tool === 'brush' ? ' on' : ''}`, 'data-guide': 'tool:brush', title: `Brush: ${bb.label} (B). Click again or right-click for the brushes`, html: `${brushIcon(this.brush.id)}<kbd>B</kbd><span class="wb-tool-caret"></span>` });
    brushBtn.addEventListener('click', () => { if (this.tool === 'brush') { const r = brushBtn.getBoundingClientRect(); this.brushMenu(r.left, r.bottom + 4); } else this.setTool('brush'); });
    brushBtn.addEventListener('contextmenu', ev => { ev.preventDefault(); this.brushMenu(ev.clientX, ev.clientY); });
    // Sculpt: one button for the stack of sculpt tools (click again or right-click for the list).
    const st = SCULPTS[this.sculpt.tool];
    const sculptBtn = h('button', { class: `wb-tool wb-tool-stack${this.tool === 'sculpt' ? ' on' : ''}`, 'data-guide': 'tool:sculpt', title: `Sculpt: ${st?.label} (S; Shift+drag over a mark with other tools). Click again for the sculpt tools · right-click: this brush's settings (Option+right-click: the list)`, html: `${sculptIcon(this.sculpt.tool)}<kbd>S</kbd><span class="wb-tool-caret"></span>` });
    sculptBtn.addEventListener('click', ev => { if (this.tool === 'sculpt') { const r = sculptBtn.getBoundingClientRect(); this.sculptMenu(r.left, r.bottom + 4); } else this.setTool('sculpt'); });
    // Right-click (Ctrl-click on a Mac): this brush's settings, like Line's. Option+right-click: the list of sculpt tools.
    sculptBtn.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      if (ev.altKey) { this.sculptMenu(ev.clientX, ev.clientY); return; }
      const r = sculptBtn.getBoundingClientRect();   // (before the tool change redraws the toolbar)
      if (this.tool !== 'sculpt') this.setTool('sculpt');
      openToolParams(this, r.left, r.bottom + 6);
    });
    // Play: author a score by pointing (click again, or right-click, for what it makes and for solo).
    const kind = PLAY_KINDS.find(k => k[0] === this.playKind) || PLAY_KINDS[0];
    const playBtn = h('button', { class: `wb-tool wb-tool-stack${this.tool === 'play' ? ' on' : ''}`, 'data-guide': 'tool:play', title: `Play: ${kind[1]} (Y). ${kind[2]} Click again or right-click for the kinds`, html: `${this.playKindIcon(kind[0])}<kbd>Y</kbd><span class="wb-tool-caret"></span>` });
    playBtn.addEventListener('click', () => { if (this.tool === 'play') { const r = playBtn.getBoundingClientRect(); this.playMenu(r.left, r.bottom + 4); } else this.setTool('play'); });
    playBtn.addEventListener('contextmenu', ev => { ev.preventDefault(); this.playMenu(ev.clientX, ev.clientY); });
    tools.append(h('div', { class: 'wb-sep' }), brushBtn, sculptBtn, playBtn);
    // Snap to grid: on shows the grid at full strength; off, fainter.
    const snapKey = this.shortcuts?.label('view.snap') || '';
    tools.append(h('div', { class: 'wb-sep' }), this.paintSwatches(), h('div', { class: 'wb-sep' }), h('button', { class: `wb-tool${this.canvas.grid.snap ? ' on' : ''}`, 'data-guide': 'tool:snap', title: `Snap to grid${snapKey ? ` (${snapKey})` : ''} · right-click or G: canvas settings (grid, names, drawing)`, html: `${icon('snap')}<kbd>G</kbd>`, onclick: () => this.canvas.setGrid({ snap: !this.canvas.grid.snap }), oncontextmenu: e => { e.preventDefault(); openGridParams(this, e.clientX, e.clientY + 8); } }));
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
    if (this.embed) {
      // The embedded editor has one toolbar: the menu (the view island's items live in it) comes first, the zoom (optional) last.
      if (this.zoomBarOn() && !this.overlay) {
        const z = h('span', { class: 'wb-zoom-pct', title: 'Zoom: click for 100%', onclick: () => this.canvas.zoomAt(this.canvas.w / 2, this.canvas.h / 2, 1 / this.canvas.cam.z) }, `${Math.round((this.canvas?.cam.z || 1) * 100)}%`);
        tools.append(h('div', { class: 'wb-sep wb-zoom-bar' }),
          h('button', { class: 'wb-tool wb-zoom-bar', title: 'Zoom out', html: icon('down'), onclick: () => this.canvas.zoomAt(this.canvas.w / 2, this.canvas.h / 2, 1 / 1.2) }),
          Object.assign(z, { className: 'wb-zoom-pct wb-zoom-bar' }),
          h('button', { class: 'wb-tool wb-zoom-bar', title: 'Zoom in', html: icon('up'), onclick: () => this.canvas.zoomAt(this.canvas.w / 2, this.canvas.h / 2, 1.2) }),
          h('button', { class: 'wb-tool wb-zoom-bar', title: 'Fit the active board (F)', html: icon('fit'), onclick: () => { this.canvas.fit(60, this.activeBoard || MAIN); this.renderChrome(); } }));
      }
      tools.prepend(h('button', { class: 'wb-tool wb-menu-btn', 'data-guide': 'menu', title: 'Menu', html: icon('menu'), onclick: e => this.openMenu(e.currentTarget) }), h('div', { class: 'wb-sep wb-menu-sep' }));
      this.topbar.replaceChildren(tools, h('div', { class: 'wb-topbar-spacer' }));
      this.makeMovable(tools, 'tools');
    } else {
      this.topbar.replaceChildren(right, tools, h('div', { class: 'wb-topbar-spacer' }));
      this.makeMovable(right, 'view'); this.makeMovable(tools, 'tools');
    }
    this.zoomIsland.replaceChildren(
      h('button', { class: 'wb-tool', title: 'Zoom out', html: icon('down'), onclick: () => this.canvas.zoomAt(this.canvas.w / 2, this.canvas.h / 2, 1 / 1.2) }),
      h('span', {}, `${Math.round((this.canvas?.cam.z || 1) * 100)}%`),
      h('button', { class: 'wb-tool', title: 'Zoom in', html: icon('up'), onclick: () => this.canvas.zoomAt(this.canvas.w / 2, this.canvas.h / 2, 1.2) }),
      h('button', { class: 'wb-tool', title: 'Fit the active board (F)', html: icon('fit'), onclick: () => { this.canvas.fit(60, this.activeBoard || MAIN); this.renderChrome(); } })
    );
    if (this.perfOn) this.zoomIsland.append(this.perfEl ||= h('span', { class: 'wb-perf', title: 'Frames per second while the canvas redraws · the last redraw · marks. Click: performance under each board', style: { cursor: 'pointer' }, onclick: () => this.toggleBoardPerf() }));
    this.zoomIsland.oncontextmenu = e => { e.preventDefault(); this.togglePerf(); };
    this.makeMovable(this.zoomIsland, 'zoom');
  }

  /** The zoom controls in the toolbar (the embedded editor; the menu toggles them): on unless switched off. */
  zoomBarOn() { try { return localStorage.getItem('ams_zoom_bar') !== '0'; } catch { return true; } }
  setZoomBar(on) { try { localStorage.setItem('ams_zoom_bar', on ? '1' : '0'); } catch { /* ignore */ } this.renderChrome(); }

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
    // Dropped on a playlist board: into the list (not a new board).
    const under = boardAt(this.store.doc, at[0], at[1]);
    if (under?.kind === 'playlist') { this.playlists.addItem(under.id, this.playlistItemForAsset(a)); this.log(`Added “${a.title}” to “${under.title}”.`); return; }
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
    if (a.kind === 'stream' && a.meta?.stream) { await this.streamAsset(a, at); return; }
    // A clip or an animated GIF: a source, a board showing it and its controls.
    if (a.kind === 'video' || /^video\//.test(a.blob?.type || '') || a.blob?.type === 'image/gif') { await this.previewAsset(a, at); return; }
    if (!a.blob) throw new Error('This asset has no picture');
    await this.placeImage(a.blob, at, { title: a.title, asset: a.id });
  }

  async placeFiles(files, at) {
    // Studio JSON (a selection, a board, a scene) comes into this scene; pictures become image layers.
    const json = f => /\.json$/i.test(f.name) || f.type === 'application/json';
    for (const f of files.filter(json)) await this.importText(await f.text(), at, f.name);
    files = files.filter(f => !json(f));
    let [x, y] = at;
    for (const f of files.filter(f => f.type.startsWith('image/'))) { await this.placeImage(f, [x, y], { title: f.name.replace(/\.[^.]+$/, '') }); x += 30; y += 30; }
  }

  normalizeAfterPlace() { this.store.doc = normalizeDocument(this.store.doc); this.canvas.invalidate(); this.emit('document', 'place'); }

  /** Right-click: operations on the selection (or the canvas, when nothing is under the pointer). */
  /** The right-click menu, plus the host's own actions when the editor is embedded (init `actions`). */
  contextItems(hit, at) {
    const items = this.contextItemsBase(hit, at).filter(i => !(this.overlay && i?.label === 'Fit artboard'));
    if (!this.hostActions?.length) return items;
    const ids = [...this.canvas.selected];
    return [...items.filter(Boolean), '-', ...this.hostActions.map(a => ({ label: a.label, hint: a.hint, run: () => this.emit('host-action', a.id, hit ? ids : []) }))];
  }

  contextItemsBase(hit, [wx, wy] = [0, 0]) {
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
        { label: 'Note here', run: () => { this.setTool('note'); const [sx, sy] = this.canvas.toScreen(wx, wy); this.canvas.startNote(sx, sy, wx, wy); } },
        { label: 'Import here…', hint: 'A selection, a board or a scene (.ams.json): marks land here, boards come in as new boards', run: () => this.importFile([wx, wy]) }
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
      this.playMenuItems(ids) && { label: 'Convert to', hint: 'Make this a path, a traveler, an event, a body or a node (again: undo it)', items: this.playMenuItems(ids).items.slice(0, 5) },
      this.playMenuItems(ids),
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
      { label: 'Create board from selection', hint: 'A board around the selected marks, which move into it', run: () => this.boardFromSelection(ids) },
      { label: 'Make mask', hint: 'The selected marks become the mask of the board they are on: they move to a board of their own (a mask board), and the board shows only where they are', run: () => this.makeMask(ids) },
      { label: 'Snap', hint: 'To the grid (its finest lines); one undo step', items: (() => {
        const q = this.canvas.gridSteps().snap;
        const snap = (mode, k = 1) => { const n = this.store.snapMarks(ids, mode, q * k); this.log(`Snapped ${n} mark${n === 1 ? '' : 's'} (${mode}${k > 1 ? `, ${k}× grid` : ''}).`); };
        return [
          { label: 'Points to grid', hint: 'Every point to the nearest grid point', run: () => snap('points') },
          { label: 'Points to grid, tidy', hint: 'Then repeated points merged and points on straight runs dropped', run: () => snap('tidy') },
          { label: 'Position: top-left', hint: 'The whole mark moves; its top-left corner lands on the grid', run: () => snap('topleft') },
          { label: 'Position: center', hint: 'The whole mark moves; its center lands on the grid', run: () => snap('center') },
          '-',
          { label: 'Quantize 2× grid', hint: 'Points to a grid twice as coarse, tidied', run: () => snap('tidy', 2) },
          { label: 'Quantize 4× grid', hint: 'Points to a grid four times as coarse, tidied', run: () => snap('tidy', 4) }
        ];
      })() },
      { label: 'Copy as', items: [
        { label: 'SVG', hint: 'The selection as SVG (with its process record), on the clipboard', run: () => this.copySelection('svg', ids) },
        { label: 'PNG', hint: 'The selection as a picture (transparent), on the clipboard', run: () => this.copySelection('png', ids) },
        { label: 'p5 code', hint: 'The selection as a minimal p5 sketch (plain calls), on the clipboard', run: () => this.copySelection('p5', ids) },
        { label: 'JSON', hint: 'The marks as studio JSON, on the clipboard: paste (Cmd+V) into any scene', run: () => this.copySelection('json', ids) }
      ] },
      { label: 'Bake', items: ['png', 'svg'].map(format => ({ label: format === 'png' ? 'To a PNG image' : 'To an SVG image', hint: format === 'png' ? 'The selected marks become one picture (undo brings them back)' : 'The selected marks become one vector image, crisp at any zoom (undo brings them back)', run: () => { const el = this.bakeMarks(ids, { format, title: ids.length === 1 ? (this.store.doc.elements.find(e => e.id === ids[0])?.label || 'mark') : `${ids.length} marks` }); if (el) this.canvas.select([el.id]); } })) },
      { label: 'Add to Assets', items: [
        { label: 'As PNG', hint: 'A picture of the selection; opens again as a drawing', run: () => this.selectionToAssets('png', ids) },
        { label: 'As SVG', hint: 'The selection as an SVG file (with its process record)', run: () => this.selectionToAssets('svg', ids) }
      ] },
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
    const sc = id => this.shortcuts.label(id);
    // What the view island held (picture or process, reference, points, present, theme), for the single toolbar.
    const viewItems = this.embed ? [
      { label: this.view.mode === 'process' ? 'Show the picture' : 'Show the process', keys: sc('view.toggle'), hint: 'The finished picture, or the process: guides, gestures and notes', run: () => this.setViewMode(this.view.mode === 'process' ? 'picture' : 'process') },
      this.reference ? { label: this.reference.visible ? 'Hide the reference' : 'Show the reference', keys: sc('view.reference'), run: () => { this.reference.visible = !this.reference.visible; this.canvas.invalidate(); this.renderChrome(); } } : null,
      { label: this.canvas.showPoints ? 'Hide points' : 'Show points', keys: sc('view.points'), hint: "The marks' points", run: () => this.togglePoints() },
      { label: 'Present', keys: sc('view.present'), hint: 'The boards one by one: ← → to move, Esc to leave', run: () => this.present(true) },
      this.overlay ? null : { label: this.zoomBarOn() ? 'Hide the zoom controls' : 'Show the zoom controls', hint: 'Zoom out, in and fit, at the end of the toolbar', run: () => this.setZoomBar(!this.zoomBarOn()) },
      { label: document.documentElement.dataset.theme === 'light' ? 'Dark theme' : 'Light theme', run: () => this.toggleTheme() },
      '-'
    ].filter(Boolean) : [];
    const items = [...viewItems,
      { label: 'New scene', keys: this.shortcuts.label('scene.new'), hint: 'An empty drawing in this project; the others stay', run: () => this.scenes.create() },
      { label: 'New project', hint: 'Start over with one empty scene', items: [
        { label: 'Keep this project in Assets, then start', run: () => this.newProject({ keep: true }) },
        { label: 'Start without keeping it', run: () => this.newProject({ keep: false }) },
        { label: 'Cancel', run: () => {} }
      ] },
      { label: 'Open file', hint: 'Process JSON, SVG with a process record, Excalidraw, or an image as reference (opens as a new scene)', run: () => this.openFile() },
      { label: 'Import into this scene…', hint: 'A board, a selection or a scene (.ams.json) comes into this scene: boards as new boards, a selection where you are looking', run: () => this.importFile() },
      { label: 'Save to Assets', keys: this.shortcuts.label('file.save'), run: () => this.saveToAssets() },
      { label: 'Export', items: [
        { label: 'PNG', hint: 'The picture (or the process view, if shown)', run: () => this.exportAs('png') },
        { label: 'SVG', hint: 'With the full process record inside; opens again as a process', run: () => this.exportAs('svg') },
        { label: 'p5.js sketch', hint: 'A zip whose sketch re-runs the score', run: () => this.exportAs('p5') },
        { label: 'Process sheet', hint: 'Stages, decisions and reasons on one page (PNG)', run: () => this.exportAs('sheet') },
        { label: 'p5 (minimal code)', hint: 'The active board as a short sketch.js of plain p5 calls, for teaching (brush textures left out)', run: () => this.exportAs('p5min') },
        { label: 'Page (HTML)', hint: 'Every board as a section: picture, process, replay and its text. The drawing travels inside', run: () => this.exportAs('page') },
        { label: 'Scene (JSON)', hint: 'The whole scene, every board, as a file to open or import again (a board or a selection: their own menus)', run: () => this.exportAs('scene-json') },
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
    ];
    showMenu(this.embed && !this.embed.full ? this.leanMenu(items) : items, r.left, r.bottom + 6);
  }

  /** The menu of the lean embedded editor: no scenes, assets, docs, settings or presentation; the exports it has. */
  leanMenu(items) {
    const drop = /^(New scene|New project|Open file|Save to Assets|Settings|Shortcuts|Docs|Classic studio|Present)$/;
    const keepExport = /^(PNG|SVG|Scene \(JSON\)|Excalidraw)$/;
    const out = [];
    for (const i of items) {
      if (i !== '-' && drop.test(i.label)) continue;
      const it = i !== '-' && i.label === 'Export' ? { ...i, items: i.items.filter(x => keepExport.test(x.label)) } : i;
      if (it === '-' && (!out.length || out.at(-1) === '-')) continue;
      out.push(it);
    }
    while (out.at(-1) === '-') out.pop();
    return out;
  }


  slug() { return String(this.store.doc.title || 'drawing').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'drawing'; }

  /**
   * The selected marks as a drawing of their own: cropped to their bounds (with a margin), on a
   * transparent ground, marks moved to the origin. For copying and adding to Assets.
   */
  selectionDoc(ids = [...this.canvas.selected], pad = 12) {
    const doc = this.store.doc, els = doc.elements.filter(e => ids.includes(e.id));
    if (!els.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of els) for (const [x, y] of e.points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    // Room for stroke widths.
    const reach = Math.max(pad, ...els.map(e => Number(e.realize?.params?.width ?? e.realize?.params?.size ?? 4) * 2));
    x0 -= reach; y0 -= reach; x1 += reach; y1 += reach;
    const moved = els.map(e => { const c = structuredClone(e); delete c.board; c.points = c.points.map(([x, y, t, p]) => [x - x0, y - y0, t, p]); return c; });
    const { boards, train, ...rest } = doc;
    return { ...structuredClone(rest), title: `${doc.title || 'Untitled'} · selection`, artboard: { width: Math.ceil(x1 - x0), height: Math.ceil(y1 - y0), ground: 'transparent' }, elements: moved };
  }

  async selectionBlob(kind, ids) {
    const d = this.selectionDoc(ids);
    if (!d) return null;
    if (kind === 'svg') return new Blob([toSVG(d, { mode: this.view.mode })], { type: 'image/svg+xml' });
    if (kind === 'p5') return new Blob([toP5Min({ ...d, artboard: { ...d.artboard, ground: '#ffffff' } }, { title: d.title, version: this.p5Version() })], { type: 'text/javascript' });
    const scale = Math.min(4, 2000 / Math.max(d.artboard.width, d.artboard.height));
    return canvasBlob(renderToCanvas(d, { scale, mode: this.view.mode }));
  }

  async copySelection(kind, ids) {
    try {
      if (kind === 'json') { const d = selectionPart(this.selectionDoc(ids)); if (!d) return; await navigator.clipboard.writeText(JSON.stringify(d)); this.log('Copied the selection as JSON: paste it (Cmd+V) into any scene.'); return; }
      const blob = await this.selectionBlob(kind, ids);
      if (!blob) return;
      if (kind === 'svg' || kind === 'p5') await navigator.clipboard.writeText(await blob.text());
      else await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      this.log(`Copied the selection as ${kind.toUpperCase()}.`);
    } catch (err) { this.log(`Could not copy: ${err.message}`, 'error'); }
  }

  async selectionToAssets(kind, ids) {
    const d = this.selectionDoc(ids);
    if (!d) return;
    const blob = await this.selectionBlob(kind, ids);
    const folder = this.assetPanel?.folder || '';
    const a = kind === 'png'
      ? await this.assetStore.add(blob, { title: d.title, kind: 'process', folder, tags: ['selection'], program: d, meta: { elements: d.elements.length } })
      : await this.assetStore.add(blob, { title: d.title, kind: 'import', folder, tags: ['selection', 'svg'], meta: { file: 'selection.svg', type: 'image/svg+xml' } });
    this.log(`Added “${a.title}” to Assets (${kind.toUpperCase()}).`);
  }

  /** A board's picture as a canvas (scale: pixels per unit): with its mask and effects when it has them (they are opt-in), else its marks alone. */
  boardPicture(b, scale, mode, doc = null) {
    if (this.composer.needs(b)) {
      const now = Date.now();
      this.composer.begin(this.store.doc, now);
      const src = this.composer.compose(b, { doc: this.store.doc, scale, now, mode, chain: [] });
      const c = document.createElement('canvas'); c.width = src.width; c.height = src.height; c.getContext('2d').drawImage(src, 0, 0);   // (a copy: the composed one is kept and reused)
      return c;
    }
    return renderToCanvas(doc || this.store.doc, doc ? { scale, mode } : { board: b.id, scale, mode });
  }

  /** Export a board (the main one unless given) as png, sheet, svg, json, excalidraw or p5. */
  /**
   * A board's own code as a p5 sketch, with the media of the sources it reads:
   * { code, files: [{ name, data (Blob) }] }.
   */
  async p5CodeFor(id) {
    const b = boardById(this.store.doc, id);
    if (!b?.code) return null;
    const sources = {}, files = [];
    for (const d of this.sources.list) {
      if (!new RegExp(`(source|fit)\\(\\s*['"\`]${d.name}['"\`]`).test(b.code)) continue;
      if (d.kind === 'camera') { sources[d.name] = { kind: 'camera' }; continue; }
      const a = await this.assetStore.get(d.assetId);
      if (!a?.blob) continue;
      const t = a.blob.type, ext = t === 'image/gif' ? 'gif' : t.startsWith('video/') ? (t.split('/')[1] || 'mp4') : t === 'image/png' ? 'png' : 'jpg';
      const file = `${d.name}.${ext}`;
      sources[d.name] = { file, kind: t.startsWith('video/') ? 'video' : ext === 'gif' ? 'animated' : 'image' };
      files.push({ name: file, data: a.blob });
    }
    return { code: toP5Code(b.code, { board: b, sources, loop: Boolean(b.follow), rate: b.follow ? rateOf(b) : 0, version: this.p5Version() }), files };
  }

  /**
   * The drawing as a page, with what it needs to run on its own: the pictures of the sources its
   * boards read, pictures of boards that documents embed, and p5.js when it has p5 boards.
   */
  async pageHtml(opts = {}) {
    const doc = this.store.doc;
    const list = opts.boards ? opts.boards.map(id => boardById(doc, id)).filter(Boolean) : pageBoards(doc);
    const media = {};
    for (const name of new Set(list.flatMap(sourcesOf))) {
      const d = this.sources.def(name);
      if (!d || d.kind !== 'asset') continue;
      const a = await this.assetStore.get(d.assetId);
      if (!a?.blob) continue;
      const t = a.blob.type;
      media[name] = { url: await new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(a.blob); }), type: t.startsWith('video/') ? 'video' : t === 'image/gif' ? 'animated' : 'image' };
    }
    const pictures = {};
    for (const b of list.filter(x => boardKind(x) === 'markdown')) {
      for (const { target, embed } of linksOf(b.code || '')) {
        const t = embed && findBoard(doc, target);
        if (t && !pictures[t.id] && boardKind(t) === 'drawing') pictures[t.id] = renderToCanvas(doc, { board: t.id, scale: Math.min(1, 900 / Math.max(t.width, t.height)), mode: 'picture' }).toDataURL('image/jpeg', 0.85);
      }
    }
    const p5Source = boardsOf(doc).some(b => boardKind(b) === 'p5') ? await this.frames.p5Text() : '';
    // Each board's code in the three ways the lesson reads it: pseudocode, the studio's, p5.js.
    const codes = {};
    for (const b of boardsOf(doc)) {
      const kind = boardKind(b);
      if (!b.code || (kind !== 'drawing' && kind !== 'p5')) continue;
      const studio = kind === 'drawing' ? b.code : isStudioSketch(b.code) ? p5ToStudio(b.code)?.code : null;
      const p5 = kind === 'p5' ? b.code : (await this.p5CodeFor(b.id))?.code;
      codes[b.id] = { pseudo: b.pseudo || '', studio: studio || '', p5: p5 || '' };
    }
    return sceneHtml(doc, { ...opts, media, pictures, p5Source, codes });
  }

  async exportAs(kind, board = this.activeBoard || MAIN) {
    const b = boardById(this.store.doc, board) || boardById(this.store.doc, MAIN);
    // json keeps the whole drawing (every board); the rest is one board as a picture.
    let doc = kind === 'scene-json' || kind === 'page' ? this.store.doc : boardDoc(this.store.doc, b.id);
    // A board's sketch carries the board's own score (its code), or, for the main board, the drawing's.
    if (kind === 'p5') doc = { ...doc, meta: { ...(doc.meta || {}), script: b.code || (b.main ? doc.meta?.script : undefined) || undefined } };
    const s = b.main ? this.slug() : `${this.slug()}-${String(b.title).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
    if (kind === 'png') this.boardPicture(b, 2, this.view.mode, doc).toBlob(blob => download(blob, `${s}.png`, 'image/png'));
    else if (kind === 'sheet') processSheet(doc).toBlob(b => download(b, `${s}-process.png`, 'image/png'));
    else if (kind === 'svg') download(toSVG(doc, { mode: this.view.mode }), `${s}.svg`, 'image/svg+xml');
    else if (kind === 'json') download(JSON.stringify(boardPart(this.store.doc, b.id), null, 2), `${s}.ams.json`, 'application/json');
    else if (kind === 'scene-json') download(JSON.stringify(scenePart(this.store.doc), null, 2), `${this.slug()}.ams.json`, 'application/json');
    else if (kind === 'page') download(await this.pageHtml(), `${this.slug()}.html`, 'text/html');
    else if (kind === 'p5min') download(toP5Min(doc, { version: this.p5Version() }), `${s}-sketch.js`, 'text/javascript');
    else if (kind === 'excalidraw') download(JSON.stringify(toExcalidraw(doc), null, 2), `${s}.excalidraw`, 'application/json');
    else if (kind === 'p5code') {
      const r = await this.p5CodeFor(b.id);
      if (!r) { this.log(`“${b.title}” has no code of its own to export (Code → Board).`); return; }
      const files = [{ name: 'index.html', data: p5SketchHtml(b.title, this.p5Version(), { ml5: usesMl5(r.code) }) }, { name: 'sketch.js', data: r.code }];
      for (const f of r.files) files.push({ name: f.name, data: new Uint8Array(await f.data.arrayBuffer()) });
      const zip = createZip(files);
      download(new Blob([zip], { type: 'application/zip' }), `${s}-p5-code.zip`, 'application/zip');
    }
    else if (kind === 'p5') {
      const zip = createZip([{ name: 'index.html', data: p5IndexHtml(doc.title, this.p5Version()) }, { name: 'sketch.js', data: toP5(doc) }]);
      download(new Blob([zip], { type: 'application/zip' }), `${s}-p5.zip`, 'application/zip');
    }
    this.log(`Exported ${kind === 'scene-json' ? 'the scene as JSON' : kind}${kind === 'page' || kind === 'scene-json' ? '' : ` (${b.title})`}.`);
  }

  /** Bring a part (a selection, a board, a scene) into this scene. One undo step. */
  importPartHere(part, at = null, name = 'import') {
    const r = this.store.change(`import ${name}`, d => importPart(d, part, { at }));
    if (r.kind === 'selection') { this.canvas.select(r.elements); this.log(`Imported ${r.elements.length} marks.`); }
    else { this.goToBoard(r.boards[0], { animate: true }); this.log(`Imported ${r.boards.length === 1 ? 'a board' : `${r.boards.length} boards`} (${r.elements.length} marks).`); }
    return r;
  }

  /** Studio JSON text → into this scene (at: where a selection lands; else where you are looking). */
  async importText(text, at = null, name = 'import') {
    let j;
    try { j = JSON.parse(text); } catch { this.log(`${name}: not JSON.`, 'error'); return null; }
    if (!isPart(j)) { this.log(`${name}: not a studio drawing (open other files with Open file).`, 'error'); return null; }
    if (!at && j.meta?.part === 'selection') at = this.canvas.toWorld(this.canvas.w / 2 - (j.artboard?.width || 0) * this.canvas.cam.z / 2, this.canvas.h / 2 - (j.artboard?.height || 0) * this.canvas.cam.z / 2);
    return this.importPartHere(j, at, name);
  }

  /** Where you are looking (the middle of the view), in world units. */
  viewCenter() { return this.canvas.toWorld(this.canvas.w / 2, this.canvas.h / 2); }

  /** Paste files and/or text into the scene (see the paste listener). */
  async pasteContent({ files = [], text = '' }) {
    const at = this.viewCenter();
    const pics = files.filter(f => f.type.startsWith('image/'));
    for (const f of pics) {
      if (f.type === 'image/svg+xml') await this.placeSvg(await f.text(), at);
      else await this.placeImage(f, at, { title: f.name?.replace(/\.[^.]+$/, '') || 'pasted' });
    }
    if (pics.length) return;
    const t = text.trim();
    const kind = textKind(t);
    if (kind === 'json') return this.importText(t, null, 'pasted');
    if (kind === 'svg') {
      // With the studio's record inside: the marks themselves. Otherwise a vector image.
      if (/data-ams/.test(t)) { try { const d = fromSVG(t); return this.importPartHere({ ...d, meta: { ...(d.meta || {}), part: 'selection' } }, [at[0] - d.artboard.width / 2, at[1] - d.artboard.height / 2], 'pasted SVG'); } catch { /* as an image */ } }
      return this.placeSvg(t, at);
    }
    if (kind === 'p5' || kind === 'studio') {
      const size = (kind === 'p5' && p5Size(t)) || { width: 800, height: 600 };
      const b = this.store.addBoard({ title: kind === 'p5' ? 'Pasted sketch' : 'Pasted code', ...size, ground: kind === 'p5' ? '#141414' : undefined });
      this.store.updateBoard(b.id, { kind: kind === 'p5' ? 'p5' : 'drawing', code: t });
      if (kind === 'studio') { const r = this.store.runBoardCode(b.id, t, runScript); if (r.error) this.log(`Pasted code: ${r.error}`, 'error'); }
      this.goToBoard(b.id, { animate: true });
      this.log(kind === 'p5' ? 'Pasted a p5.js sketch as a p5 board (files it loads come from the sources by name).' : 'Pasted studio code as a board of its own.');
      return;
    }
    // Plain text: a note.
    const el = this.store.addElement({ role: 'note', stage: this.activeStage.id, points: [[at[0], at[1], 0, 0.5]], text: t.slice(0, 4000), note: structuredClone(this.defaults('note').note || {}), why: 'pasted' });
    this.canvas.select([el.id]);
  }

  /** An SVG as a vector image mark (sized from its width/height or viewBox), centred at `at`. */
  async placeSvg(svg, [wx, wy]) {
    const vb = /viewBox\s*=\s*["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/.exec(svg);
    const wm = /<svg[^>]*\swidth\s*=\s*["']([\d.]+)/.exec(svg), hm = /<svg[^>]*\sheight\s*=\s*["']([\d.]+)/.exec(svg);
    let w = Number(wm?.[1] || vb?.[1] || 400), h = Number(hm?.[1] || vb?.[2] || 300);
    const k = Math.min(1, 800 / Math.max(w, h)); w *= k; h *= k;
    const x = wx - w / 2, y = wy - h / 2;
    const el = this.store.addElement({ role: 'image', stage: this.activeStage.id, src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, label: 'pasted SVG', points: [[x, y, 0, 0.5], [x + w, y, 0, 0.5], [x + w, y + h, 0, 0.5], [x, y + h, 0, 0.5]], why: 'pasted' });
    this.canvas.select([el.id]);
    return el;
  }

  /** Choose a .ams.json file and bring it into this scene. */
  importFile(at = null) {
    const input = h('input', { type: 'file', accept: '.json,application/json' });
    input.addEventListener('change', async () => { const f = input.files[0]; if (f) await this.importText(await f.text(), at, f.name); });
    input.click();
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
