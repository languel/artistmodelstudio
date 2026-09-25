/**
 * Artist Model Studio workbench: an infinite canvas with an artboard, dockable panels,
 * and the process document at the centre. Everything the user can do is also a
 * command (see mcp.js), so agents drive the same surface.
 */
import { ProcessStore, createDocument, normalizeDocument, DEFAULT_REALIZE, ROLES } from '../process/document.js';
import { toSVG, fromSVG, toExcalidraw, fromExcalidraw, toP5, p5IndexHtml, processSheet } from '../process/exports.js';
import { dslToProcess } from '../process/fromDsl.js';
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
import { mountDocs, docsTopicList } from './panels/docs.js';
import { Walkthroughs } from './walkthroughs.js';
import { openPalette } from './palette.js';
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

  defaults(role) {
    const d = this.toolDefaults[role] || {};
    return { color: d.color || null, why: d.why || '', realize: d.realize || structuredClone(DEFAULT_REALIZE[role] || DEFAULT_REALIZE.line) };
  }

  setDefaults(role, patch) {
    const d = this.defaults(role);
    if (patch.realize) d.realize = { brush: patch.realize.brush || d.realize.brush, params: patch.realize.brush && patch.realize.brush !== d.realize.brush ? {} : { ...d.realize.params, ...(patch.realize.params || {}) } };
    if ('color' in patch) d.color = patch.color;
    if ('why' in patch) d.why = patch.why;
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
      onTool: t => this.setTool(t),
      viewMode: () => this.view.mode
    });
    this.canvas.drawReference = ctx => this.drawReference(ctx);
    this.canvas.onCamera = () => { const z = this.zoomIsland?.querySelector('span'); if (z) z.textContent = `${Math.round(this.canvas.cam.z * 100)}%`; };
    this.topbar = h('div', { class: 'wb-topbar' });
    this.zoomIsland = h('div', { class: 'wb-island wb-zoom' });
    this.stageArea.append(this.topbar, this.zoomIsland);

    this.registerPanels();
    const hadCamera = Boolean(localStorage.getItem('ams_workbench_camera_v1'));
    this.docks.render();
    requestAnimationFrame(() => { this.canvas.resize(); if (!hadCamera) this.canvas.fit(); this.renderChrome(); });
    this.bindKeys();
    this.renderChrome();
    this.assetStore.seed(bundledReferences()).catch(() => {});
    this.guide = new Guide(this);
    this.walkthroughs = new Walkthroughs(this);
    this.toolList = TOOLS.filter(Boolean);
    this.docsTopics = () => docsTopicList(this);
    // The Docs panel mounts on first open and then replaces this with its own openDocs.
    const openDocsFirst = id => { this.docks.open('docs'); if (this.openDocs !== openDocsFirst) this.openDocs(id); };
    this.openDocs = openDocsFirst;
    initWorkbenchMCP(this);
    this.log('Workbench ready.');
  }

  registerPanels() {
    const reg = (id, title, iconName, natural, mount, extra = {}) => this.docks.register({ id, title, icon: iconName, natural, mount: el => mount(el, this), ...extra });
    reg('stages', 'Stages', 'stages', 'left', mountStages);
    reg('assets', 'Assets', 'assets', 'left', el => this.mountAssets(el));
    reg('properties', 'Properties', 'properties', 'right', mountProperties);
    reg('script', 'Score', 'script', 'right', mountScript);
    reg('process', 'Process', 'process', 'right', mountProcess);
    reg('generate', 'Generate', 'sparkles', 'right', mountGenerate);
    reg('assistant', 'Assistant', 'chat', 'right', mountAssistant);
    reg('decide', 'Decide', 'exercise', 'right', mountDecide);
    reg('docs', 'Docs', 'book', 'right', mountDocs);
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
    this.reference = { img, opacity: this.reference?.opacity ?? 0.35, visible: true, title };
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
      h('div', { class: 'wb-seg' },
        h('button', { class: this.view.mode === 'picture' ? 'on' : '', 'data-guide': 'view:picture', title: 'The finished picture (\\ toggles)', onclick: () => this.setViewMode('picture') }, 'Picture'),
        h('button', { class: this.view.mode === 'process' ? 'on' : '', 'data-guide': 'view:process', title: 'Picture with guides, gestures and notes (\\ toggles)', onclick: () => this.setViewMode('process') }, 'Process')),
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

  openMenu(anchor) {
    const r = anchor.getBoundingClientRect();
    const m = h('div', { class: 'wb-menu', style: { left: `${r.left}px`, top: `${r.bottom + 6}px` } });
    const item = (label, fn, key = '') => m.append(h('button', { onclick: () => { m.remove(); fn(); } }, h('span', {}, label), key ? h('kbd', {}, key) : ''));
    const label = t => m.append(h('div', { class: 'wb-menu-label' }, t));
    item('New drawing', () => { this.loadDocument(createDocument(), 'new'); this.canvas.fit(); });
    item('Open file… (JSON, SVG, Excalidraw)', () => this.openFile());
    item('Save to Assets', () => this.saveToAssets(), '⌘S');
    m.append(h('hr'));
    label('Export');
    item('Picture (PNG)', () => this.exportAs('png'));
    item('SVG with process record', () => this.exportAs('svg'));
    item('p5.js sketch (zip)', () => this.exportAs('p5'));
    item('Process sheet (PNG)', () => this.exportAs('sheet'));
    item('Process document (JSON)', () => this.exportAs('json'));
    item('Excalidraw', () => this.exportAs('excalidraw'));
    m.append(h('hr'));
    label('Panels');
    for (const p of this.docks.panels.values()) item(p.title, () => this.docks.open(p.id));
    item('Reset layout', () => this.docks.reset());
    m.append(h('hr'));
    item('Classic studio', () => { window.location.href = '/classic.html'; });
    document.body.append(m);
    const off = ev => { if (!m.contains(ev.target)) { m.remove(); window.removeEventListener('pointerdown', off, true); } };
    setTimeout(() => window.addEventListener('pointerdown', off, true));
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
    const blob = await new Promise(r => renderToCanvas(doc, { scale: Math.min(1, 1200 / Math.max(doc.artboard.width, doc.artboard.height)), mode: 'picture' }).toBlob(r, 'image/png'));
    const a = await this.assetStore.add(blob, {
      title: doc.title || 'Untitled', kind: 'process', folder: this.assetPanel?.folder || '',
      tags: [...new Set([...tags, ...doc.stages.map(s => s.kind)])], program: structuredClone(doc),
      meta: { stages: doc.stages.length, elements: doc.elements.length, decisions: doc.decisions.length }
    });
    this.log(`Saved “${a.title}” to Assets.`);
    return a;
  }

  // ---- keys ------------------------------------------------------------------------
  bindKeys() {
    window.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      const mod = e.metaKey || e.ctrlKey;
      if (mod && k === 'k') { e.preventDefault(); openPalette(this); return; }
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
      if (k === '?') { this.openDocs(); return; }
      if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) this.store.redo(); else this.store.undo(); return; }
      if (mod && k === 's') { e.preventDefault(); this.saveToAssets(); return; }
      if (mod && k === 'a') { e.preventDefault(); this.canvas.select(this.store.doc.elements.filter(el => this.canvas.editable(el)).map(el => el.id)); return; }
      if (mod) return;
      if (k === 'delete' || k === 'backspace') { const ids = [...this.canvas.selected]; if (ids.length) this.store.removeElements(ids); return; }
      if (k === 'escape') { this.canvas.select([]); this.setTool('select'); return; }
      if (k === 'f') { this.canvas.fit(); this.renderChrome(); return; }
      if (k === '\\') { this.setViewMode(this.view.mode === 'picture' ? 'process' : 'picture'); return; }
      if (k === 'r' && this.reference) { this.reference.visible = !this.reference.visible; this.canvas.invalidate(); this.renderChrome(); return; }
      if (TOOL_KEYS[k]) this.setTool(TOOL_KEYS[k]);
    });
  }
}

export { ROLES };
