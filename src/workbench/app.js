/**
 * Artist Model Studio workbench: an infinite canvas with an artboard, dockable panels,
 * and the process document at the center. Everything the user can do is also a
 * command (see mcp.js), so agents drive the same surface.
 */
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
import { icon } from './icons.js';
import { h, download } from './ui.js';
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
import { mountBrushes } from './panels/brushes.js';
import { mountTimeline } from './panels/timeline.js';
import { Recorder } from './recorder.js';
import { TakePlayer } from './takePlayer.js';
import { loadLibrary } from '../process/brushes.js';
import { mountDocs, docsTopicList } from './panels/docs.js';
import { Walkthroughs } from './walkthroughs.js';
import { openPalette } from './palette.js';
import { showMenu } from './menu.js';
import { brushesForRole, KIT } from '../process/brushes.js';
import { Shortcuts } from './shortcuts.js';
import { eyedropToTarget } from './colorPicker.js';
import { ArtistRegistry } from '../artists/artistRegistry.js';
import { initWorkbenchMCP } from './mcp.js';
import { Guide } from './guide.js';

const DOC_KEY = 'ams_process_doc_v1';
const DEFAULTS_KEY = 'ams_tool_defaults_v1';
const TOOLS = [
  ['select', 'Select and move', 'V'], ['hand', 'Pan', 'H'], null,
  ['point', 'Point: a mark at a place', 'O'], ['line', 'Line: a point that moved', 'P'], ['plane', 'Plane: an enclosed area', 'A'], null,
  ['gesture', 'Gesture: the movement behind a form', 'E'], ['guide', 'Guide: construction (straight; Shift snaps)', 'G'], ['note', 'Note: a written annotation', 'T']
];

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
  emit(name, ...a) { for (const fn of this.handlers.get(name) || []) fn(...a); }
  log(text, kind = 'info') { this.logLines.push({ t: Date.now(), text, kind }); if (this.logLines.length > 400) this.logLines.shift(); this.emit('log'); }

  // ---- state ---------------------------------------------------------------------
  get activeStage() { return this.store.doc.stages.find(s => s.id === this.activeStageId) || this.store.doc.stages[0]; }
  setActiveStage(id) { this.activeStageId = id; this.emit('stage'); this.renderChrome(); }
  setTool(t) { this.tool = t; this.canvas?.updateCursor(); this.emit('tool'); this.renderChrome(); }
  setViewMode(m) { this.view.mode = m; this.canvas.invalidate(); this.emit('view'); this.renderChrome(); }
  setUpTo(i) { this.view.upTo = i; this.canvas.upTo = i; this.canvas.invalidate(); this.emit('view'); }
  selectedElements() { return this.store.doc.elements.filter(e => this.canvas?.selected.has(e.id)); }
  selectIds(ids) { this.canvas.select(ids); }
  groupSelection() { const ids = [...this.canvas.selected]; if (ids.length > 1) { this.store.group(ids); this.canvas.select(ids); } }
  ungroupSelection() { const ids = [...this.canvas.selected]; if (ids.length) this.store.ungroup(ids); }

  defaults(role) {
    const d = this.toolDefaults[role] || {};
    return { color: d.color || null, why: d.why || '', realize: d.realize || structuredClone(DEFAULT_REALIZE[role] || DEFAULT_REALIZE.line), opacity: d.opacity ?? 1, blend: d.blend || 'normal', ...(role === 'note' ? { note: d.note || {} } : {}) };
  }

  setDefaults(role, patch) {
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

    this.canvas = new CanvasView(this.stageArea, this.store, {
      getTool: () => this.tool,
      getStage: () => this.activeStage,
      getDefaults: r => this.defaults(r),
      onSelect: () => this.emit('selection'),
      onNoteStyled: note => this.setDefaults('note', { note }),
      onTool: t => this.setTool(t),
      viewMode: () => this.view.mode
    });
    this.canvas.drawReference = ctx => this.drawReference(ctx);
    this.canvas.onContext = (e, hit, at) => showMenu(this.contextItems(hit, at), e.clientX, e.clientY);
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
    loadLibrary();
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
    reg('outliner', 'Outliner', 'layers', 'left', mountOutliner);
    reg('assets', 'Assets', 'assets', 'left', el => this.mountAssets(el));
    reg('properties', 'Properties', 'properties', 'right', mountProperties);
    reg('script', 'Score', 'script', 'right', mountScript);
    reg('process', 'Process', 'process', 'right', mountProcess);
    reg('generate', 'Generate', 'sparkles', 'right', mountGenerate);
    reg('assistant', 'Assistant', 'chat', 'right', mountAssistant);
    reg('decide', 'Decide', 'exercise', 'right', mountDecide);
    reg('docs', 'Docs', 'book', 'right', mountDocs);
    reg('settings', 'Settings', 'gear', 'right', mountSettings);
    reg('shortcuts', 'Shortcuts', 'keyboard', 'right', mountShortcuts);
    reg('brushes', 'Brushes', 'brush', 'right', mountBrushes);
    reg('timeline', 'Timeline', 'film', 'bottom', mountTimeline);
    reg('log', 'Log', 'log', 'bottom', mountLog, { allowBottom: true, openByDefault: false });
  }

  mountAssets(el) {
    this.assetPanel = new AssetPanel({
      store: this.assetStore,
      onOpen: a => this.openAsset(a),
      onUseAsReference: a => this.setReferenceFromBlob(a.blob, a.title),
      onExport: a => (a.kind === 'dataset' && a.program?.jsonl
        ? download(a.program.jsonl, `${a.title}.jsonl`, 'application/jsonl')
        : download(a.blob, `${a.title}.png`, a.blob.type))
    });
    this.assetPanel.render(el);
  }

  async openAsset(a) {
    if (a.kind === 'take' && a.program?.clips) { await this.openTake(a.id); return; }
    if (a.kind === 'walkthrough' && a.program?.steps) { await this.walkthroughs.loadUser(); this.walkthroughs.start(a.program.id); return; }
    if (a.kind === 'dataset' && a.program?.jsonl) {
      this.docks.open('decide');
      const added = this.decider.importJSONL(a.program.jsonl);
      this.log(`Dataset “${a.title}”: ${added} new decision labels added to Decide.`);
      return;
    }
    if (a.program?.type === 'ams-process') { this.loadDocument(a.program, 'open asset'); this.log(`Opened “${a.title}”.`); return; }
    if (a.program?.actions) {
      const doc = dslToProcess(a.program, { title: a.title, width: a.width || 1000, height: a.height || 1000 });
      this.loadDocument(doc, 'open converted asset');
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
    const title = h('input', { class: 'wb-title', 'data-guide': 'title', value: doc.title || 'Untitled', title: 'Title', onchange: e => this.store.change('title', d => { d.title = e.target.value.trim() || 'Untitled'; }) });
    title.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); });
    const stage = this.activeStage;
    const left = h('div', { class: 'wb-island' },
      h('button', { class: 'wb-tool', 'data-guide': 'menu', title: 'Menu', html: icon('menu'), onclick: e => this.openMenu(e.currentTarget) }),
      title,
      h('button', { class: 'wb-tool', title: 'Undo (Cmd+Z)', html: icon('undo'), onclick: () => this.store.undo() }),
      h('button', { class: 'wb-tool', title: 'Redo (Shift+Cmd+Z)', html: icon('redo'), onclick: () => this.store.redo() }),
      h('div', { class: 'wb-sep' }),
      h('span', { class: 'wb-stagebadge', title: 'New marks go into this stage (Stages panel)', onclick: () => this.docks.open('stages') }, 'Stage', h('b', {}, stage ? stage.name : '—'))
    );
    const tools = h('div', { class: 'wb-island' });
    for (const t of TOOLS) {
      if (!t) { tools.append(h('div', { class: 'wb-sep' })); continue; }
      const [id, tip, key] = t;
      tools.append(h('button', { class: `wb-tool${this.tool === id ? ' on' : ''}`, 'data-guide': `tool:${id}`, title: `${tip} (${key})`, html: `${icon(id)}<kbd>${key}</kbd>`, onclick: () => this.setTool(id) }));
    }
    const right = h('div', { class: 'wb-island' },
      h('button', { class: 'wb-tool', 'data-guide': 'view', title: this.view.mode === 'process' ? 'Process: guides, gestures and notes shown (\\ for the picture)' : 'Picture: the finished picture (\\ for the process)', html: icon(this.view.mode === 'process' ? 'viewProcess' : 'viewPicture'), onclick: () => this.setViewMode(this.view.mode === 'picture' ? 'process' : 'picture') }),
      this.reference ? h('button', { class: `wb-tool${this.reference.visible ? ' on' : ''}`, title: `Reference underlay: ${this.reference.title} (R toggles)`, html: icon('picture'), onclick: () => { this.reference.visible = !this.reference.visible; this.canvas.invalidate(); this.renderChrome(); } }) : null,
      h('button', { class: 'wb-tool', title: 'Theme', html: icon(document.documentElement.dataset.theme === 'light' ? 'moon' : 'sun'), onclick: () => this.toggleTheme() })
    );
    this.topbar.replaceChildren(left, tools, right);
    this.zoomIsland.replaceChildren(
      h('button', { class: 'wb-tool', title: 'Zoom out', html: icon('down'), onclick: () => this.canvas.zoomAt(this.canvas.w / 2, this.canvas.h / 2, 1 / 1.2) }),
      h('span', {}, `${Math.round((this.canvas?.cam.z || 1) * 100)}%`),
      h('button', { class: 'wb-tool', title: 'Zoom in', html: icon('up'), onclick: () => this.canvas.zoomAt(this.canvas.w / 2, this.canvas.h / 2, 1.2) }),
      h('button', { class: 'wb-tool', title: 'Fit the artboard (F)', html: icon('fit'), onclick: () => { this.canvas.fit(); this.renderChrome(); } })
    );
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
      brushes.length ? { label: 'Brush', items: brushes.map(b => ({ label: b.label, run: () => this.store.change('brush', d => { for (const el of d.elements) if (ids.includes(el.id)) el.realize = { brush: b.id, params: {} }; }) })) } : null,
      lineish ? { label: 'Simplify', hint: 'Fewer points, same shape', items: [
        { label: 'Lightly', run: () => simplify(1.5) }, { label: 'Moderately', run: () => simplify(4) }, { label: 'Strongly', run: () => simplify(10) }
      ] } : null,
      '-',
      { label: 'Duplicate', run: () => { const out = this.store.duplicate(ids, 20 / z, 20 / z); this.canvas.select(out); } },
      n > 1 ? { label: 'Group', keys: sc('edit.group'), run: () => this.groupSelection() } : null,
      grouped ? { label: 'Ungroup', keys: sc('edit.ungroup'), run: () => this.ungroupSelection() } : null,
      { label: 'Lock', hint: 'Locked marks cannot be picked on the canvas (unlock in the Outliner)', run: () => { this.store.patchElements(ids, { locked: true }, 'lock'); this.canvas.select([]); } },
      { label: 'Hide', hint: 'Show again from the Outliner', run: () => { this.store.patchElements(ids, { hidden: true }, 'hide'); this.canvas.select([]); } },
      { label: 'Show in Outliner', run: () => { this.docks.open('outliner'); this.emit('selection'); } },
      '-',
      { label: 'Delete', keys: sc('edit.delete'), run: () => this.store.removeElements(ids) }
    ];
  }

  openMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    showMenu([
      { label: 'New drawing', run: () => { this.loadDocument(createDocument(), 'new'); this.canvas.fit(); } },
      { label: 'Open file', hint: 'Process JSON, SVG with a process record, Excalidraw, or an image as reference', run: () => this.openFile() },
      { label: 'Save to Assets', keys: this.shortcuts.label('file.save'), run: () => this.saveToAssets() },
      { label: 'Export', items: [
        { label: 'PNG', hint: 'The picture (or the process view, if shown)', run: () => this.exportAs('png') },
        { label: 'SVG', hint: 'With the full process record inside; opens again as a process', run: () => this.exportAs('svg') },
        { label: 'p5.js sketch', hint: 'A zip whose sketch re-runs the score', run: () => this.exportAs('p5') },
        { label: 'Process sheet', hint: 'Stages, decisions and reasons on one page (PNG)', run: () => this.exportAs('sheet') },
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

  async exportAs(kind) {
    const doc = this.store.doc, s = this.slug();
    if (kind === 'png') renderToCanvas(doc, { scale: 2, mode: this.view.mode }).toBlob(b => download(b, `${s}.png`, 'image/png'));
    else if (kind === 'sheet') processSheet(doc).toBlob(b => download(b, `${s}-process.png`, 'image/png'));
    else if (kind === 'svg') download(toSVG(doc, { mode: this.view.mode }), `${s}.svg`, 'image/svg+xml');
    else if (kind === 'json') download(JSON.stringify(doc, null, 2), `${s}.ams.json`, 'application/json');
    else if (kind === 'excalidraw') download(JSON.stringify(toExcalidraw(doc), null, 2), `${s}.excalidraw`, 'application/json');
    else if (kind === 'p5') {
      const zip = createZip([{ name: 'index.html', data: p5IndexHtml(doc.title) }, { name: 'sketch.js', data: toP5(doc) }]);
      download(new Blob([zip], { type: 'application/zip' }), `${s}-p5.zip`, 'application/zip');
    }
    this.log(`Exported ${kind}.`);
  }

  openFile() {
    const input = h('input', { type: 'file', accept: '.json,.svg,.excalidraw,application/json,image/svg+xml,image/*' });
    input.addEventListener('change', async () => {
      const f = input.files[0];
      if (!f) return;
      if (f.type.startsWith('image/') && !f.name.endsWith('.svg')) return this.setReferenceFromBlob(f, f.name);
      const text = await f.text();
      try {
        let doc;
        if (f.name.endsWith('.svg') || text.trim().startsWith('<')) doc = fromSVG(text);
        else {
          const j = JSON.parse(text);
          doc = j.type === 'excalidraw' || Array.isArray(j.elements) && j.elements[0]?.type && !j.stages ? fromExcalidraw(j) : j.actions ? dslToProcess(j) : j;
        }
        doc.title ||= f.name.replace(/\.[^.]+$/, '');
        this.loadDocument(doc, 'open file');
        this.canvas.fit();
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
