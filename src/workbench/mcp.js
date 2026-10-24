/**
 * Workbench tools for agents: the same actions a user takes, as MCP tools.
 * Exposed on window.ams, navigator.modelContext (when present), and the dev relay
 * (/__ams/*) that src/mcp/mcpServer.js proxies for Claude Code and other clients.
 * Every mutating call is written to the Log in purple.
 */
import { runScript, runScoreInto, SCRIPT_REFERENCE } from '../process/script.js';
import { EXERCISES } from '../process/exercises.js';
import { ROLES, STAGE_KINDS, normalizeElement } from '../process/document.js';
import { BRUSHES } from '../process/brushes.js';
import { shapePoints } from './shapes.js';
import { FX } from '../process/fx.js';
import { toSVG, toExcalidraw, toP5, processSheet } from '../process/exports.js';
import { toP5Min } from '../process/p5min.js';
import { sceneHtml } from '../process/page.js';
import { boardsOf, boardById, findBoard, boardDoc, marksOf, trainBoard, MAIN, BLACKBOARD } from '../process/boards.js';
import { getSource } from '../process/streams.js';
import { matches } from '../assets/assetStore.js';
import { describeRegion } from '../perception/analyze.js';
import { download } from './ui.js';
import { BRUSHES as BR, brushSource, compileBrush, saveLibraryBrush, deleteLibraryBrush, isBuiltin, registerBrush } from '../process/brushes.js';
import { allPalettes, savePalette, deletePalette, paletteFromImage, toHex, nameOf } from './palettes.js';
import { SHOW, revealScore, SessionRecorder, summarize, READ_ONLY } from './showActions.js';

const S = (properties = {}, required = []) => ({ type: 'object', properties, required });
const str = d => ({ type: 'string', description: d });
const num = d => ({ type: 'number', description: d });
const PRINCIPLES = `You are drawing in Artist Model Studio. The picture is a process: name your stages (analysis → concept → construction → structure → value → marks → notes), record decisions with decide(), and give every mark a short reason (why). The harness does not paint for you: brushes only realize your paths. Keep construction (guides, gestures) separate from marks. Coordinates are artboard units (origin top-left).`;

export function workbenchTools(app) {
  const doc = () => app.store.doc;
  /** Each drawing tool's path (smooth or straight): the state ` and ~ set. */
  const pathStates = () => Object.fromEntries(['line', 'plane', 'gesture', 'guide'].map(r => [r, app.defaults(r).path === 'straight' ? 'straight' : 'smooth']));
  const brushSchema = Object.fromEntries(Object.entries(BRUSHES).map(([id, b]) => [id, { roles: b.roles, doc: b.doc, params: b.params.map(p => ({ key: p.key, min: p.min, max: p.max, default: p.default, doc: p.doc })) }]));
  const png = c => c.toDataURL('image/png');
  return [
    { name: 'ams_wb_state', description: 'Workbench state: title, artboard, stages (with element counts), active stage, tool, view, selection, reference underlay, shape settings, each tool\'s path.', inputSchema: S(), run: () => ({
      title: doc().title, artboard: doc().artboard,
      boards: boardsOf(doc()).map((b, i) => ({ index: i, id: b.id, title: b.title, x: b.x, y: b.y, width: b.width, height: b.height, marks: marksOf(doc(), b.id).length, main: b.main })),
      blackboard: marksOf(doc(), BLACKBOARD).length, activeBoard: app.activeBoard || MAIN, trainBoard: trainBoard(doc()),
      stages: doc().stages.map((s, i) => ({ index: i, ...s, elements: doc().elements.filter(e => e.stage === s.id).length })),
      elements: doc().elements.length, decisions: doc().decisions.length,
      activeStage: app.activeStage?.id, tool: app.tool, view: app.view.mode === 'process' ? { ...app.view, upTo: Number.isFinite(app.view.upTo) ? app.view.upTo : null } : { ...app.view, upTo: null },
      selection: [...app.canvas.selected], reference: app.reference ? { title: app.reference.title, visible: app.reference.visible } : null,
      shapes: structuredClone(app.shapes), paths: pathStates()
    }) },
    { name: 'ams_vocabulary', description: 'How to write a score: principles, the point/line/plane vocabulary, brushes with parameter ranges, roles, stage kinds, and the exercises.', inputSchema: S(), run: () => ({
      principles: PRINCIPLES, vocabulary: SCRIPT_REFERENCE, roles: ROLES, stageKinds: STAGE_KINDS, brushes: brushSchema,
      effects: Object.fromEntries(Object.entries(FX).map(([id, d]) => [id, { label: d.label, doc: d.doc, kind: d.kind, params: d.params.map(p => ({ key: p.key, min: p.min, max: p.max, default: p.default, doc: p.doc })), ...(d.stops ? { stops: 'colors or [position, color]' } : {}) }])),
      exercises: EXERCISES.map(x => ({ id: x.id, title: x.title, brief: x.brief }))
    }) },
    { name: 'ams_exercise', description: 'Get an exercise brief and its example score; optionally load and run it.', inputSchema: S({ id: str('Exercise id'), load: { type: 'boolean', description: 'Also run it on the canvas' } }, ['id']), run: (a) => {
      const x = EXERCISES.find(e => e.id === a.id);
      if (!x) throw new Error('Unknown exercise');
      if (a.load) { app.scriptPanel?.setSource(x.source); loadScore(app, x.source, 1, { kind: 'example', name: 'exercise' }, x.title); }
      return x;
    } },
    { name: 'ams_run_score', description: 'Run a score (JS in the point/line/plane vocabulary) into the active board: it replaces that board\'s marks; other boards and the blackboard stay (board(title) in the score reaches others). Use by to credit yourself (e.g. {kind:"model", name:"claude-opus-5-5"}).', inputSchema: S({ source: str('Score source'), seed: num('Seed (default 1)'), title: str('Title'), by: { type: 'object', description: '{ kind, name }' } }, ['source']), run: (a) => {
      app.scriptPanel?.setSource(a.source);
      const res = loadScore(app, a.source, a.seed ?? 1, a.by || { kind: 'model', name: 'agent' }, a.title);
      return res.error ? { error: res.error, logs: res.logs } : { stages: res.doc.stages.map(s => s.name), elements: res.doc.elements.length, decisions: res.doc.decisions.length, logs: res.logs };
    } },
    { name: 'ams_get', description: 'The process document as JSON (the whole drawing, every board), or one board (main unless board is given) as SVG (with records), Excalidraw, a p5 sketch (p5: re-runs the score with the studio runtime; p5min: a short sketch of plain p5 calls for teaching; p5code: the board\'s own code as a p5 sketch, with the studio words it uses defined in p5 and sources loaded from files), or JSON of that board alone.', inputSchema: S({ format: { type: 'string', enum: ['json', 'svg', 'excalidraw', 'p5', 'p5min', 'p5code'] }, p5: str('p5.js version for p5min: 2 (default, from Settings) or 1'), board: str('Board id or title (for one board)') }), run: (a) => {
      const f = a.format || 'json';
      const one = a.board ? boardDoc(doc(), (findBoard(doc(), a.board) || {}).id || MAIN) : boardDoc(doc(), MAIN);
      if (f === 'p5code') return app.p5CodeFor(findBoard(doc(), a.board)?.id || MAIN).then(r => (r ? { sketch: r.code, files: r.files.map(x => x.name) } : { error: 'That board has no code of its own' }));
      if (f === 'p5min') return { sketch: toP5Min(one, { version: a.p5 || app.p5Version() }) };
      return f === 'svg' ? { svg: toSVG(one) } : f === 'excalidraw' ? toExcalidraw(one) : f === 'p5' ? { sketch: toP5(one) } : a.board ? one : doc();
    } },
    { name: 'ams_set', description: 'Replace the process document (JSON).', inputSchema: S({ doc: { type: 'object' } }, ['doc']), run: (a) => { app.loadDocument(a.doc, 'agent set'); return { ok: true }; } },
    { name: 'ams_add', description: 'Add one element: role (point|line|plane|guide|gesture|note), points [[x,y],...], stage id or name (default: active), brush, params, color, why, text (notes), path (smooth: a curve through the points; straight: segments). Or a shape instead of points: shape circle | rect with box [x0, y0, x1, y1] (a plane mark; a circle has sides points, 3–64, default 12, round when smooth and a polygon when path is straight; a rectangle has round 0–1, 1 a pill, and is always straight). With board (id or title), points are relative to that board\'s top-left and the mark joins it; without, points are world units and the mark joins the board it lands on (the blackboard outside boards).', inputSchema: S({ role: str('Role'), board: str('Board id or title'), points: { type: 'array' }, stage: str('Stage id or name'), brush: str('Brush id'), params: { type: 'object' }, color: str('Color'), why: str('Reason'), text: str('Note text'), path: str('smooth | straight'), shape: str('circle | rect'), box: { type: 'array' }, sides: num('Circle sides (default 12)'), round: num('Rectangle roundness 0–1 (default 0)'), by: { type: 'object' } }, ['role']), run: (a) => {
      const st = doc().stages.find(s => s.id === a.stage || s.name === a.stage) || app.activeStage;
      if (a.shape) {
        if (!['circle', 'rect'].includes(a.shape)) throw new Error('shape is circle or rect');
        if (!Array.isArray(a.box) || a.box.length !== 4 || a.box.some(v => !Number.isFinite(+v))) throw new Error('A shape needs box [x0, y0, x1, y1]');
        const [bx0, by0, bx1, by1] = a.box.map(Number);
        a.role = 'plane';
        a.points = shapePoints(a.shape, Math.min(bx0, bx1), Math.min(by0, by1), Math.max(bx0, bx1), Math.max(by0, by1), { sides: a.sides, round: a.round }).map(([x, y]) => [x, y]);
        if (a.shape === 'rect') a.path = 'straight';
      } else if (!Array.isArray(a.points)) throw new Error('ams_add needs points [[x, y], ...] (or a shape with a box)');
      a.points = normalizePoints(a.points);
      const bd = a.board ? findBoard(doc(), a.board) : null;
      if (a.board && !bd) throw new Error(`No board “${a.board}” (ams_board lists them)`);
      const ox = bd?.x || 0, oy = bd?.y || 0;
      const el = app.store.addElement({ role: a.role, stage: st.id, ...(bd ? { board: bd.main ? undefined : bd.id } : {}), points: a.points.map((p, i) => [p[0] + ox, p[1] + oy, p[2] ?? i * 16, p[3] ?? 0.5]), realize: a.brush ? { brush: a.brush, params: a.params || {} } : undefined, color: a.color, why: a.why, text: a.text, ...(a.path === 'straight' ? { path: 'straight' } : {}), by: a.by || { kind: 'model', name: 'agent' } }, { by: 'agent' });
      return { id: el.id, stage: st.name };
    } },
    { name: 'ams_update', description: 'Change an element: any of stage, role, color, why, text, path (straight, or null for smooth), realize {brush, params}, points.', inputSchema: S({ id: str('Element id'), patch: { type: 'object' } }, ['id', 'patch']), run: (a) => ({ ok: Boolean(app.store.updateElement(a.id, a.patch, 'agent edit', { by: 'agent' })) }) },
    { name: 'ams_delete', description: 'Delete elements.', inputSchema: S({ ids: { type: 'array', items: { type: 'string' } } }, ['ids']), run: (a) => { app.store.removeElements(a.ids, { by: 'agent' }); return { ok: true }; } },
    { name: 'ams_stage', description: 'Stages: add {name, kind}, update {id, patch}, move {id, delta}, delete {id}, activate {id}.', inputSchema: S({ action: { type: 'string', enum: ['add', 'update', 'move', 'delete', 'activate'] }, id: str('Stage id or name'), name: str(''), kind: str(STAGE_KINDS.join(' | ')), patch: { type: 'object' }, delta: num('±1') }, ['action']), run: (a) => {
      const st = doc().stages.find(s => s.id === a.id || s.name === a.id);
      if (a.action === 'add') { const s = app.store.addStage({ name: a.name || 'Stage', kind: a.kind || 'marks' }); app.setActiveStage(s.id); return s; }
      if (!st) throw new Error('Stage not found');
      if (a.action === 'update') app.store.updateStage(st.id, a.patch || {});
      if (a.action === 'move') app.store.moveStage(st.id, a.delta || 1);
      if (a.action === 'delete') app.store.removeStage(st.id);
      if (a.action === 'activate') app.setActiveStage(st.id);
      return { ok: true };
    } },
    { name: 'ams_decide', description: 'Record a decision: question, options, chosen, why (in the active stage unless stage is given).', inputSchema: S({ question: str(''), options: { type: 'array', items: { type: 'string' } }, chosen: str(''), why: str(''), stage: str('') }, ['question', 'chosen']), run: (a) => {
      const st = doc().stages.find(s => s.id === a.stage || s.name === a.stage) || app.activeStage;
      return app.store.addDecision({ question: a.question, options: a.options || [], chosen: a.chosen, why: a.why || '', stage: st.id, by: { kind: 'model', name: 'agent' } }, { by: 'agent' });
    } },
    { name: 'ams_view', description: 'View: mode picture|process, upTo stage index (null = all), fit, tool (select | direct | hand | laser | board | point | line | gesture | guide | plane | circle | rect | note | brush | sculpt), cycle (select | line | plane | brush | sculpt: step through that stack, like Shift+V, Shift+1, Shift+2, Shift+B, Shift+S), select ids.', inputSchema: S({ mode: str('picture | process'), upTo: { type: ['number', 'null'] }, fit: { type: 'boolean' }, tool: str(''), cycle: str('select | line | plane | brush | sculpt'), select: { type: 'array', items: { type: 'string' } } }), run: (a) => {
      if (a.mode) app.setViewMode(a.mode);
      if ('upTo' in a) app.setUpTo(a.upTo === null ? Infinity : a.upTo);
      if (a.fit) app.canvas.fit(60, app.activeBoard);
      if (a.tool) app.setTool(a.tool);
      if (a.cycle) { if (!['select', 'line', 'plane', 'brush', 'sculpt'].includes(a.cycle)) throw new Error('cycle is select, line, plane, brush or sculpt'); app.cycleStack(a.cycle); }
      if (a.select) app.selectIds(a.select);
      return { ok: true, tool: app.tool };
    } },
    { name: 'ams_snapshot', description: 'PNG of a board (the main one unless board is given), picture or process view, optionally up to a stage.', inputSchema: S({ mode: str('picture | process'), scale: num('Scale (default 0.6)'), upTo: num('Stage index'), board: str('Board id or title') }), run: (a) => {
      const prev = app.canvas.upTo;
      if (a.upTo !== undefined) app.canvas.upTo = a.upTo;
      const image = png(app.canvas.snapshot(a.mode || app.view.mode, a.scale || 0.6, (a.board && findBoard(doc(), a.board)?.id) || MAIN));
      app.canvas.upTo = prev;
      return { image };
    } },
    { name: 'ams_process_sheet', description: 'PNG process sheet of a board (main unless given): each stage built up, plus decisions.', inputSchema: S({ board: str('Board id or title') }), run: (a) => ({ image: png(processSheet(boardDoc(doc(), (a.board && findBoard(doc(), a.board)?.id) || MAIN))) }) },
    { name: 'ams_active_brush', description: 'The Brush tool\'s active brush (what B draws with), for drawing and performing alongside a person: get; set {id?, params?} (params are kept per brush); slot {n} picks brush slot n (1–9, also Alt+Shift+n); keep {n} keeps the active brush in slot n; tool {on} switches to the Brush tool.', inputSchema: S({ action: { type: 'string', enum: ['get', 'set', 'slot', 'keep', 'tool'] }, id: str('Brush id'), params: { type: 'object' }, n: num('Slot 1–9') }, ['action']), run: (a) => {
      if (a.action === 'set') { if (a.id) { if (!BRUSHES[a.id]) throw new Error(`Unknown brush “${a.id}”`); app.setBrush({ id: a.id }); } if (a.params) app.setBrush({ params: a.params }); }
      if (a.action === 'slot') app.useSlot(a.n);
      if (a.action === 'keep') app.keepSlot(a.n);
      if (a.action === 'tool') app.setTool('brush');
      return { active: app.brush.id, params: app.brush.params[app.brush.id] || {}, slots: app.slots, tool: app.tool };
    } },
    { name: 'ams_shape', description: 'Settings of the shape tools (Circle and Rectangle under Plane; right-click the tool): get; set {tool: circle | rect, sides (circle, 3–48), round (rect, 0 square to 1 a pill)}. They apply to the next shapes drawn by hand; ams_add shape takes its own.', inputSchema: S({ action: { type: 'string', enum: ['get', 'set'] }, tool: str('circle | rect'), sides: num('Circle sides'), round: num('Rectangle roundness 0–1') }, ['action']), run: (a) => {
      if (a.action === 'set') {
        if (!['circle', 'rect'].includes(a.tool)) throw new Error('tool is circle or rect');
        if (a.tool === 'circle' && a.sides !== undefined) app.setShape('circle', { sides: Math.max(3, Math.min(48, Math.round(a.sides))) });
        if (a.tool === 'rect' && a.round !== undefined) app.setShape('rect', { round: Math.max(0, Math.min(1, a.round)) });
      }
      return { shapes: structuredClone(app.shapes) };
    } },
    { name: 'ams_path', description: 'Smooth or straight, as the ` (straight) and ~ (smooth) keys do: with a drawing tool (line, plane, circle, gesture, guide, brush) it is the tool\'s state, kept for the next strokes (the stroke being drawn takes it too); with Select or Direct it changes the selected marks. get returns each tool\'s path.', inputSchema: S({ action: { type: 'string', enum: ['get', 'set'] }, to: str('smooth | straight') }, ['action']), run: (a) => {
      if (a.action === 'set') { if (!['smooth', 'straight'].includes(a.to)) throw new Error('to is smooth or straight'); app.setPathChoice(a.to); }
      return { tool: app.tool, paths: pathStates() };
    } },
    { name: 'ams_grid', description: 'The grid: read it (no arguments) or set show (off | paper | everywhere), style (lines | dots), spacing (artboard units, whole numbers), subdivisions, color (any color, transparent, or hex with opacity), snap (marks snap to it), snapMode (points | increments | objects). A person gets these with Ctrl+Shift+right-click, which also sets the paper and workspace colors (ams_board update ground, ams_ui background).', inputSchema: S({ show: str('off | paper | everywhere'), style: str('lines | dots'), spacing: { type: 'number' }, subdivisions: { type: 'number' }, color: str('Grid color'), snap: { type: 'boolean' }, snapMode: str('points | increments | objects') }), run: (a) => {
      const patch = {};
      if (a.show) patch.show = a.show;
      if (a.style) patch.style = a.style;
      if (a.spacing != null) patch.spacing = Math.max(5, Math.round(Number(a.spacing)) || 100);
      if (a.subdivisions != null) patch.subdivisions = Math.max(1, Math.round(Number(a.subdivisions)) || 1);
      if (a.color) patch.color = a.color;
      if (a.snap != null) patch.snap = Boolean(a.snap);
      if (a.snapMode) patch.snapMode = a.snapMode;
      if (Object.keys(patch).length) app.canvas.setGrid(patch);
      const g = app.canvas.grid;
      return { show: g.show, style: g.style, spacing: g.spacing, subdivisions: g.subdivisions, color: g.color, snap: g.snap, snapMode: g.snapMode };
    } },
    { name: 'ams_snap', description: 'Snap marks to the grid (one undo step). mode: points (every point to the nearest grid point), tidy (points, then repeated points merged and points on straight runs dropped), topleft or center (the whole mark moves so that corner or its center lands on the grid). step: grid multiples (1 = the finest grid lines; 2, 4… quantize coarser).', inputSchema: S({ ids: { type: 'array', items: { type: 'string' } }, mode: { type: 'string', enum: ['points', 'tidy', 'topleft', 'center'] }, step: num('Grid multiple (default 1)') }, ['ids', 'mode']), run: (a) => {
      const q = app.canvas.grid.spacing / Math.max(1, app.canvas.grid.subdivisions) * (a.step || 1);
      return { changed: app.store.snapMarks(a.ids, a.mode, q, { by: 'agent' }), step: q };
    } },
    { name: 'ams_ui', description: 'Show or hide parts of the interface, for a clean view of just the drawing: tools, view (the right island with the menu), zoom, panels, or all (zen mode, Alt+Z for a person: all false hides everything, leaving only the canvas); perf shows the performance readout. Omit everything to read the state (it includes the last canvas redraw in ms).', inputSchema: S({ background: str('Workspace background: a color, transparent, or default'), perf: { type: 'boolean' }, all: { type: 'boolean' }, tools: { type: 'boolean' }, view: { type: 'boolean' }, zoom: { type: 'boolean' }, panels: { type: 'boolean' } }), run: (a) => {
      const patch = Object.fromEntries(['all', 'tools', 'view', 'zoom', 'panels'].filter(k => k in a).map(k => [k, Boolean(a[k])]));
      if (Object.keys(patch).length) app.setUI(patch);
      if ('perf' in a) app.togglePerf(Boolean(a.perf));
      if (a.background) app.setBackground(a.background);
      return { ui: app.ui || { tools: true, view: true, zoom: true, panels: true }, perf: Boolean(app.perfOn), redrawMs: app.canvas.stats ? +app.canvas.stats.draw.toFixed(2) : null, marks: app.store.doc.elements.length };
    } },
    { name: 'ams_scene', description: 'Scenes: a project holds several drawings, each with its boards, undo, History and Timeline (assets and brushes are shared). list; new {title?, doc?} (an empty drawing, or a copy of a process document) and open it; open {id}; duplicate; delete {id} (not the last; its drawing is gone unless saved to Assets); move {id, delta}; get {id} (another scene\'s document without opening it).', inputSchema: S({ action: { type: 'string', enum: ['list', 'new', 'open', 'duplicate', 'delete', 'move', 'get'] }, id: str('Scene id or title'), title: str(''), doc: { type: 'object' }, delta: num('±1') }, ['action']), run: async (a) => {
      const Sc = app.scenes;
      const find = k => Sc.all.find(s => s.id === k || String(s.title).toLowerCase() === String(k || '').toLowerCase());
      const list = () => ({ scenes: Sc.all.map((s, i) => ({ index: i, id: s.id, title: s.title, open: s.id === Sc.list.active })) });
      if (a.action === 'list') return list();
      if (a.action === 'new') { await Sc.create({ doc: a.doc || null, title: a.title || null }); return list(); }
      if (a.action === 'duplicate') { await Sc.duplicate(); return list(); }
      const s = find(a.id);
      if (!s) throw new Error(`No scene “${a.id}”`);
      if (a.action === 'open') await Sc.switchTo(s.id);
      if (a.action === 'delete') await Sc.remove(s.id);
      if (a.action === 'move') Sc.move(s.id, a.delta || 1);
      if (a.action === 'get') return await Sc.docOf(s.id);
      return list();
    } },
    { name: 'ams_page', description: 'The drawing as a page (self-contained HTML): every board with marks or text as a section (title, picture, process view, replay, its text in Markdown), after an intro. Set a board\'s text with ams_board update {patch: {text}}; the intro with intro here (kept in the drawing). download: true also saves the file.', inputSchema: S({ intro: str('Markdown before the boards (kept)'), title: str('Page title (default: the drawing\'s)'), boards: { type: 'array', items: { type: 'string' }, description: 'Board ids or titles, in order (default: all with marks or text)' }, download: { type: 'boolean' } }), run: async (a) => {
      if (a.intro !== undefined) app.store.change('page intro', d => { d.meta = { ...(d.meta || {}), intro: a.intro }; }, { by: 'agent' });
      const ids = a.boards ? a.boards.map(k => findBoard(doc(), k)?.id).filter(Boolean) : null;
      const html = await app.pageHtml({ title: a.title || doc().title, boards: ids });
      if (a.download) download(html, `${String(a.title || doc().title || 'page').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.html`, 'text/html');
      return { html, bytes: html.length };
    } },
    { name: 'ams_board', description: 'Boards (artboards; the main one is the drawing\'s artboard at the origin). list; add {title, width, height, x?, y?, ground?} (placed right of the others unless x, y); update {id, patch: {title, width, height, x, y, ground (paper; any color, transparent, or 8-digit hex with opacity), hideLabel (no title above the board), hideBorder (no shadow or frame line: with both on the board is only structure and draws just its marks), locked, hidden, kind, code, mask (crop its marks to the board), maskWith {source | board, mode: luma | alpha, invert, feather, fx}, fx [post effects on its picture], sourceFx [on the source under it]}} (effects and masks are opt-in; ams_vocabulary lists the effects) (moving a board moves its marks; kind: drawing | markdown | html | p5, with code its source: Markdown with math, Mermaid, callouts and [[links]], an HTML page, or a p5 sketch with window.ams); move {id, delta} in the sequence; delete {id, deleteMarks?} (marks go to the blackboard unless deleteMarks); go {id} (make active and fit the view); train {id} (the board models learn from); assign {id, ids} (put marks on a board; id "_" is the blackboard); code {id, source} (the board\'s own score: runs with the board as its artboard, fractions of the board, and replaces the marks its last run made; kept on the board, shown on the page). Scores use board(title) to draw on a board.', inputSchema: S({ action: { type: 'string', enum: ['list', 'add', 'update', 'move', 'delete', 'go', 'train', 'assign', 'code'] }, id: str('Board id or title'), source: str('Code (action code)'), title: str(''), width: num(''), height: num(''), x: num(''), y: num(''), ground: str(''), patch: { type: 'object' }, delta: num('±1'), deleteMarks: { type: 'boolean' }, ids: { type: 'array', items: { type: 'string' } } }, ['action']), run: (a) => {
      const list = () => boardsOf(doc()).map((b, i) => ({ index: i, id: b.id, title: b.title, x: b.x, y: b.y, width: b.width, height: b.height, ground: b.ground, marks: marksOf(doc(), b.id).length, main: b.main, train: trainBoard(doc()) === b.id }));
      if (a.action === 'list') return { boards: list(), blackboard: marksOf(doc(), BLACKBOARD).length, active: app.activeBoard || MAIN };
      if (a.action === 'add') { const b = app.store.addBoard({ title: a.title, width: a.width, height: a.height, x: a.x, y: a.y, ground: a.ground }, { by: 'agent' }); return b; }
      if (a.action === 'assign' && a.id === BLACKBOARD) { app.store.assignBoard(a.ids || [], BLACKBOARD, { by: 'agent' }); return { ok: true }; }
      const b = findBoard(doc(), a.id);
      if (!b) throw new Error(`No board “${a.id}”`);
      if (a.action === 'update') app.store.updateBoard(b.id, a.patch || {}, { by: 'agent' });
      if (a.action === 'move') app.store.moveBoard(b.id, a.delta || 1, { by: 'agent' });
      if (a.action === 'delete') app.store.removeBoard(b.id, { deleteMarks: Boolean(a.deleteMarks) }, { by: 'agent' });
      if (a.action === 'go') app.goToBoard(b.id);
      if (a.action === 'train') app.store.setTrainBoard(b.id, { by: 'agent' });
      if (a.action === 'assign') app.store.assignBoard(a.ids || [], b.id, { by: 'agent' });
      if (a.action === 'code') { const r = app.store.runBoardCode(b.id, a.source || '', runScript, { by: 'agent' }); if (r.error) return { error: r.error, line: r.line }; return { ok: true, marks: r.marks, logs: r.logs }; }
      return { ok: true, boards: list() };
    } },
    { name: 'ams_source', description: 'Sources: the project\'s streams (camera, images and videos from Assets), read from code by name: source(\'cam\') gives a sampler (.color(x, y), .value(x, y), .pose, .hands, .mask(x, y), .frame; fractions of the board), fit(\'cam\', { shapes, live }) redraws it as plane marks. list; add {kind: camera | asset, assetId?, name?, sampling?, interval?}; remove {name}; update {name, sampling: continuous | interval | hold, interval (s), rename}; sample {name, points: [[x, y]…] (fractions), landmarks?: [pose, hands, mask]} (colors and values there, and landmarks when asked; they may take a moment the first time); frame {name} (PNG of the current frame); show {name, board?, opacity?} under a board (name "" hides it); follow {board, on} (the board\'s code re-runs on each new frame of the sources it reads).', inputSchema: S({ action: { type: 'string', enum: ['list', 'add', 'remove', 'update', 'sample', 'frame', 'show', 'follow'] }, name: str('Source name'), kind: str('camera | asset'), assetId: str('Asset id'), sampling: str('continuous | interval | hold'), interval: num('Seconds between samples (interval)'), rename: str('New name'), points: { type: 'array' }, landmarks: { type: 'array', items: { type: 'string' } }, board: str('Board id or title'), opacity: num('0..1'), on: { type: 'boolean' } }, ['action']), run: async (a) => {
      const S = app.sources;
      if (a.action === 'list') return { sources: S.list.map(d => ({ ...d, ready: Boolean(S.entries.get(d.name)?.data), frame: S.entries.get(d.name)?.version || 0 })) };
      if (a.action === 'add' && a.url) return { name: await app.addSourceUrl(a.url) };   // an address (a video or picture, or a Wikipedia / Commons File: page): streamed
      if (a.action === 'add') return { name: await S.add({ kind: a.kind || 'camera', assetId: a.assetId, name: a.name, sampling: a.sampling, interval: a.interval }) };
      const boardId = () => (a.board ? findBoard(doc(), a.board)?.id : null) || app.activeBoard || MAIN;
      if (a.action === 'follow') { app.setBoardFollow(boardId(), a.on !== false); return { ok: true }; }
      if (a.action === 'show') { app.setBoardSource(boardId(), a.name || null, a.opacity); return { ok: true }; }
      if (!S.def(a.name)) throw new Error(`No source “${a.name}” (have: ${S.list.map(d => d.name).join(', ') || 'none'})`);
      if (a.action === 'remove') { S.remove(a.name); return { ok: true }; }
      if (a.action === 'update') { if (a.sampling || a.interval) S.update(a.name, { ...(a.sampling ? { sampling: a.sampling } : {}), ...(a.interval ? { interval: a.interval } : {}) }); if (a.rename) S.rename(a.name, a.rename); return { ok: true }; }
      const b = boardById(doc(), boardId());
      const s = getSource(a.name, { x: b.x, y: b.y, width: b.width, height: b.height });
      if (a.action === 'sample') {
        const want = a.landmarks || [];
        if (want.length) { if (want.includes('pose')) s.pose; if (want.includes('hands')) s.hands; if (want.includes('mask')) s.mask(0.5, 0.5); for (let i = 0; i < 40 && want.some(k => !S.entries.get(a.name)?.landmarks[k]); i++) await new Promise(r => setTimeout(r, 250)); }
        const t = getSource(a.name, { x: b.x, y: b.y, width: b.width, height: b.height });
        return { frame: t.frame, width: t.width, height: t.height, samples: (a.points || [[0.5, 0.5]]).map(([x, y]) => ({ x, y, color: t.color(x, y), value: +t.value(x, y).toFixed(3), ...(want.includes('mask') ? { mask: +t.mask(x, y).toFixed(3) } : {}) })), ...(want.includes('pose') ? { pose: t.pose.map(p => p.map(q => [+q.x.toFixed(3), +q.y.toFixed(3), +(q.v ?? 1).toFixed(2)])) } : {}), ...(want.includes('hands') ? { hands: t.hands.map(p => p.map(q => [+q.x.toFixed(3), +q.y.toFixed(3)])) } : {}) };
      }
      if (a.action === 'frame') { const img = S.view(a.name); if (!img) throw new Error('No frame yet'); const c = document.createElement('canvas'); const k = Math.min(1, 640 / Math.max(img.width, img.height)); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return { image: png(c) }; }
      throw new Error(`Unknown action ${a.action}`);
    } },
    { name: 'ams_diagnostics', description: 'The flight recorder: one line per 2 s for the last minutes (visibility, frames the browser gave the page, canvas redraws, heap MB, source samples, detections, live runs, event-loop lag, long tasks) and page events (hidden, shown, frozen, resumed, errors). A page frozen while visible shows vis v with raf 0.', inputSchema: S({ minutes: num('How far back (default 30)') }), run: (a) => ({ log: app.diagnostics?.(a.minutes || 30) || '' }) },
    { name: 'ams_save', description: 'Save the drawing (image + process) to Assets.', inputSchema: S({ title: str('') }), run: async (a) => {
      if (a.title) app.store.change('title', d => { d.title = a.title; }, { by: 'agent' });
      const x = await app.saveToAssets();
      return { id: x.id, title: x.title };
    } },
    { name: 'ams_assets', description: 'List assets (query words, #tag), or open one by id (processes load; images become the reference underlay).', inputSchema: S({ query: str(''), open: str('Asset id to open') }), run: async (a) => {
      if (a.open) { const x = await app.assetStore.get(a.open); if (!x) throw new Error('Not found'); await app.openAsset(x); return { opened: x.title }; }
      return (await app.assetStore.all()).filter(x => matches(x, a.query || '')).map(x => ({ id: x.id, title: x.title, kind: x.kind, folder: x.folder, tags: x.tags, rating: x.rating }));
    } },
    { name: 'ams_panel', description: 'Open a panel (stages, assets, properties, script, process, log) or move it: left, right, bottom, floating.', inputSchema: S({ id: str(''), to: str('open | left | right | bottom | floating | close') }, ['id']), run: (a) => {
      if (!a.to || a.to === 'open') app.docks.open(a.id); else if (a.to === 'close') app.docks.close(a.id); else app.docks.move(a.id, a.to);
      return { ok: true };
    } },
    { name: 'ams_generate', description: 'Generate panel: ask an engine for scores (agent, openrouter, openai, ollama, webgpu). Returns immediately; candidates appear in the panel and the first opens on the canvas. With engine "agent", answer the waiting request with ams_pending / ams_answer.', inputSchema: S({ prompt: str(''), engine: str(''), model: str(''), count: num('1-8'), exercise: str('Exercise id or empty'), withReference: { type: 'boolean' }, temperature: num('') }, ['prompt']), run: (a) => {
      app.docks.open('generate');
      if (a.engine) app.setGenerateEngine(a.engine, a.model);
      app.genPrompt = a.prompt; app.genCount = a.count || 1; app.genExercise = a.exercise || ''; app.genWithRef = Boolean(a.withReference); if (a.temperature !== undefined) app.genTemp = a.temperature;
      app.emit('generate-refresh');
      setTimeout(() => app.startGenerate?.(), 0);
      return { started: true };
    } },
    { name: 'ams_pending', description: 'If a Generate request is waiting for the Agent engine: the exact system and user prompts a model would get, and the reference image if sent. Answer with ams_answer.', inputSchema: S(), run: () => {
      const a = app.artists.get('agent')?.asking;
      return a ? { system: a.system, user: a.user, image: a.image || null, waitingSeconds: Math.round((Date.now() - a.t) / 1000) } : null;
    } },
    { name: 'ams_answer', description: 'Answer the waiting Generate request with your reply (a score in a ```js block).', inputSchema: S({ text: str('Your reply') }, ['text']), run: (a) => ({ delivered: app.artists.get('agent')?.answer(a.text) || false }) },
    { name: 'ams_candidates', description: 'Generated candidates this session (newest first): prompt, engine, model, stages, elements, errors; open one by index.', inputSchema: S({ open: num('Index to open') }), run: (a) => {
      const list = app.candidates || [];
      if (a.open !== undefined && list[a.open]?.doc) app.putScoreDoc(structuredClone(list[a.open].doc), 'open candidate');
      return list.map((c, i) => ({ index: i, prompt: c.prompt, engine: c.engine, model: c.model, exercise: c.exercise, stages: c.doc?.stages.length, elements: c.doc?.elements.length, error: c.error || null, attempts: c.attempts, seconds: c.seconds }));
    } },
    { name: 'ams_analyze', description: 'Decide panel: analyze the reference image (value masses, regions with place/value/hue/edges/direction, optional MediaPipe pose and figure). Returns a compact description of the regions.', inputSchema: S({ mediapipe: { type: 'boolean' }, k: num('Value/color clusters (3-8, default 5)') }), run: async (a) => {
      const d = decide(app);
      const an = await d.analyze({ mediapipe: !!a.mediapipe, k: a.k || 5 });
      return { regions: an.regions.map(describeRegion), masses: an.masses, poses: an.poses?.length || 0 };
    } },
    { name: 'ams_decide_step', description: 'Decide panel: ask a policy (rules, lev, agent, you) for the next step (next, region, technique, value, direction, density) with probabilities. apply:true realizes it at once; otherwise the card waits and you may override with ams_decision_answer. With backend "agent" the questions wait for ams_decision_answer.', inputSchema: S({ backend: str('rules | lev | agent | you'), apply: { type: 'boolean' } }), run: async (a) => {
      const d = decide(app);
      if (a.backend) d.setBackend(a.backend);
      if (a.backend === 'agent') { d.propose().catch(e => app.log(e.message, 'error')); await new Promise(r => setTimeout(r, 50)); return pendingView(app); }
      const p = await d.propose();
      const view = { state: p.state, answers: Object.fromEntries(Object.entries(p.answers).map(([k, v]) => [k, v ? { value: v.value, confidence: v.confidence } : null])) };
      if (a.apply) return { ...view, applied: d.apply('policy') };
      return view;
    } },
    { name: 'ams_decision_pending', description: 'The state and typed questions currently waiting for an answer (backend "agent"), or null.', inputSchema: S({}), run: () => pendingView(app) },
    { name: 'ams_decision_answer', description: 'Answer the step questions: {next, region, technique, value (0 light-2 dark), direction, density (0-4)}. Answers a waiting agent request, or overrides the proposal on the card. apply:true realizes the step.', inputSchema: S({ answers: { type: 'object' }, apply: { type: 'boolean' } }, ['answers']), run: async (a) => {
      const d = decide(app);
      const eng = app.decider;
      if (eng.pending) { eng.answerPending(a.answers, 'agent'); await new Promise(r => setTimeout(r, 30)); }
      else if (d.proposal) d.setFinal(a.answers);
      else return { error: 'Nothing to answer: call ams_decide_step first' };
      return a.apply ? { applied: d.apply('agent') } : { ok: true };
    } },
    { name: 'ams_decision_labels', description: 'Decision labels recorded so far (lev training format); returns counts by source. export:true downloads them as JSONL; save:true writes them to training/decisions/labels/ (dev server).', inputSchema: S({ export: { type: 'boolean' }, save: { type: 'boolean' } }), run: async (a) => {
      decide(app);
      const labels = app.decider.labels;
      if (a.export) download(app.decider.exportJSONL(), 'ams-decisions.jsonl', 'application/jsonl');
      const saved = a.save ? await app.decider.saveToProject() : undefined;
      return { count: labels.length, saved, bySource: labels.reduce((m, l) => ((m[l.meta?.source] = (m[l.meta?.source] || 0) + 1), m), {}) };
    } },
    { name: 'ams_walkthrough', description: 'Walkthroughs (guided lessons and tours with the real controls): action "list", "start" {id}, or "stop".', inputSchema: S({ action: str('list | start | stop'), id: str('Walkthrough id') }), run: (a) => {
      if (a.action === 'start') { app.walkthroughs.start(a.id).catch(e => app.log(e.message, 'error')); return { started: a.id }; }
      if (a.action === 'stop') { app.walkthroughs.stop(); return { ok: true }; }
      return app.walkthroughs.list();
    } },
    { name: 'ams_brush', description: 'Brushes are code: brush({ id, label, roles, doc, params: { key: [min, max, default, doc] }, draw(ctx, e, p, k) { … } }). k is the brush kit: k.frames(e) → [{ x, y, nx, ny, speed, pressure }], k.smoothPath, k.spans(poly, y), k.rotatePts, k.segment(ctx, x1, y1, x2, y2), k.beginInk(ctx, e, { width, opacity }) … ctx.restore(), k.tracePath, k.draw(id, ctx, e, params), k.rng(), k.noise(x, y). action "list"; "get" {id} returns the source (built-ins too: read them to learn); "save" {source, to: library | drawing} (checked by compiling; built-in ids are refused — fork under a new id); "delete" {id}; "use" {id} on the selection or the current tool.', inputSchema: S({ action: str('list | get | save | delete | use'), id: str('Brush id'), source: str('Brush code'), to: str('library (default) or drawing') }, ['action']), run: (a) => {
      if (a.action === 'list') return Object.entries(BR).filter(([, b]) => !b.construction || b.custom).map(([id, b]) => ({ id, label: b.label, roles: b.roles, scope: isBuiltin(id) ? 'built-in' : b.scope || 'drawing', doc: b.doc, params: b.params.map(q => q.key) }));
      if (a.action === 'get') { const src = brushSource(a.id); if (!src) throw new Error(`No brush "${a.id}"`); return { id: a.id, source: src }; }
      if (a.action === 'save') {
        const def = compileBrush(a.source);
        if (a.to === 'drawing') { registerBrush(a.source, 'doc'); app.store.change(`brush ${def.id}`, d => { d.brushes = d.brushes || {}; d.brushes[def.id] = a.source; }, { by: 'agent' }); }
        else saveLibraryBrush(a.source);
        app.canvas.invalidate();
        app.brushesPanel?.open(def.id);
        return { saved: def.id, to: a.to === 'drawing' ? 'drawing' : 'library', params: def.params.map(q => q.key) };
      }
      if (a.action === 'delete') return { deleted: deleteLibraryBrush(a.id) };
      if (a.action === 'use') {
        if (!BR[a.id]) throw new Error(`No brush "${a.id}"`);
        const ids = [...app.canvas.selected];
        if (ids.length) app.store.change('brush', d => { for (const e of d.elements) if (ids.includes(e.id)) e.realize = { brush: a.id, params: {} }; }, { by: 'agent' });
        else app.setDefaults(app.tool, { realize: { brush: a.id } });
        return { brush: a.id, applied: ids.length || `defaults for ${app.tool}` };
      }
      throw new Error('Unknown action');
    } },
    { name: 'ams_palette', description: 'Palettes of named colors. action "list"; "get" {name}; "create" {name, colors: [{name, hex}] or ["burnt sienna", "#2e3a52", …]} — to make a palette that evokes something ("a winter storm over craggy shores"), choose the colors yourself and create it; "from_image" {asset (id) or the current reference, count, name} extracts one (k-means in Lab, named after pigments); "delete" {name}; "apply" {color (hex or name) or name+index} sets the selection\'s color. Names accept pigments (payne\'s gray, yellow ochre…) and CSS names.', inputSchema: S({ action: str('list | get | create | from_image | delete | apply'), name: str('Palette name'), colors: { type: 'array' }, asset: str('Asset id for from_image (default: the reference)'), count: num('Colors to extract (default 6)'), color: str('Color for apply: hex or a name'), index: num('Color index in the palette for apply') }, ['action']), run: async (a) => {
      const pals = allPalettes();
      if (a.action === 'list') return Object.entries(pals).map(([name, cols]) => ({ name, colors: cols.length }));
      if (a.action === 'get') { if (!pals[a.name]) throw new Error(`No palette "${a.name}"`); return { name: a.name, colors: pals[a.name] }; }
      if (a.action === 'create') return savePalette(a.name, a.colors || []);
      if (a.action === 'delete') return { deleted: deletePalette(a.name) };
      if (a.action === 'from_image') {
        let img = app.reference?.img, title = app.reference?.title;
        if (a.asset) {
          const asset = await app.assetStore.get(a.asset);
          if (!asset?.blob) throw new Error('Asset not found');
          img = new Image(); img.src = URL.createObjectURL(asset.blob); await img.decode(); title = asset.title;
        }
        if (!img) throw new Error('No reference: open an image (ams_assets {open}) or pass an asset id');
        const colors = paletteFromImage(img, Math.max(2, Math.min(16, a.count || 6)));
        return savePalette(a.name || `From ${title}`.slice(0, 48), colors);
      }
      if (a.action === 'apply') {
        const c = a.color ? toHex(a.color) : pals[a.name]?.[a.index ?? 0]?.hex;
        if (!c) throw new Error('Unknown color');
        const ids = [...app.canvas.selected];
        if (ids.length) app.store.patchElements(ids, { color: c }, 'color', { by: 'agent' }); else app.setDefaults(app.tool, { color: c });
        return { color: c, name: nameOf(c), applied: ids.length || `defaults for ${app.tool}` };
      }
      throw new Error('Unknown action');
    } },
    { name: 'ams_layout', description: 'Control the workbench layout so actions can be seen: open {panels: [...]} (expands their docks), close {panels}, expand / collapse {docks: [left, right, bottom]}, reference {visible, opacity}, view {mode: picture | process}, fit, find {query} in Assets (shows the matching cards), get (current layout).', inputSchema: S({ open: { type: 'array', items: { type: 'string' } }, close: { type: 'array', items: { type: 'string' } }, expand: { type: 'array', items: { type: 'string' } }, collapse: { type: 'array', items: { type: 'string' } }, reference: { type: 'object' }, view: str('picture | process'), fit: { type: 'boolean' }, find: str('Search Assets for this') }), run: (a) => app.setLayout(a) },
    { name: 'ams_record', description: 'Record what happens as a take (a timeline of drawing changes, narration and actions) to review later: action "start" {title}, "stop" (saves to Assets), "status". Agent activity is recorded automatically unless turned off (auto: false).', inputSchema: S({ action: str('start | stop | status'), title: str(''), auto: { type: 'boolean' } }, ['action']), run: async (a) => {
      const r = app.recorder;
      if (a.auto !== undefined) r.setSettings({ autoAgents: a.auto });
      if (a.action === 'start') { r.start({ title: a.title || undefined, source: 'agent' }); return { recording: true }; }
      if (a.action === 'stop') { const t = await r.stop(); return t ? { saved: t.title, clips: t.clips.length, seconds: Math.round(t.duration / 1000), asset: t.assetId } : { saved: null }; }
      return { recording: r.recording, clips: r.take?.clips.length || 0, auto: r.settings };
    } },
    { name: 'ams_score', description: 'Scores that play: marks with `play` (a line that can be travelled, a point that travels it, planes or points that sound when a traveler reaches them) run on the Timeline\'s transport. action "events" {seconds, board} renders the score ahead of time and returns what would happen (you cannot hear: this is how to check it); "import" {kind: iannix | nous, source, title} opens an IanniX score or a Midinous / midinojs project as a new board; "settings" {tempo, signature: "4/4", ruler: time | beats | frames, loop: [startSeconds, endSeconds] | null}; "sound" {gm: bool, midi: none | all | portId, program: [channel, 0..127]}; "export" {seconds} downloads the score as a MIDI file; "link" {from, to} points one mark at another (ids or names) and makes the relation their kinds mean: a point and a line, it travels; two triggers, one sends to the other; a trigger and a traveler, it starts it; "solo" {ids} sounds only those marks and what they need (no ids: all); "play" / "pause" / "seek" {ms} are ams_timeline\'s. A trigger\'s play.trigger.emit is code: note(ch, pitch, vel, dur) with ny, nx, x, y, speed, u in scope, snap(), lane(), beats().', inputSchema: S({ action: str('events | import | settings | sound | export | link | solo'), seconds: num('events: how many seconds to render (default 16)'), board: str('events: one board (a title or id); default all'), kind: str('import: iannix | nous'), source: str('import: the file text'), title: str('import: the board title'), tempo: num('beats a minute'), signature: str('e.g. 3/4'), ruler: str('time | beats | frames'), loop: { type: ['array', 'null'], items: { type: 'number' }, description: 'loop range in seconds, or null to clear' }, gm: { type: 'boolean' }, midi: str('none | all | a port id'), mixer: { type: 'object', description: 'sound: the channel mixer { channel: { "1": { program 0..127|null, out auto|gm|midi|both|off, vol 0..127, pan -1..1, mute, solo, transpose } }, scale: { name (a Midinous scale, or "" for none), root 0..11 }, transpose }' },
        program: { type: 'array', items: { type: 'number' }, description: '[channel 1..16, program 0..127]' }, from: str('link: the mark pointed from (id or name)'), to: str('link: the mark pointed at (id or name)'), ids: { type: 'array', items: { type: 'string' }, description: 'solo: the marks to sound' } }, ['action']), run: async (a) => {
      const sc = app.score, p = app.player;
      if (a.action === 'events') {
        const { renderScore } = await import('../score/runner.js');
        const doc = a.board ? boardOnly(app.store.doc, a.board) : app.store.doc;
        const out = renderScore(doc, p.settings, Math.min(600, Math.max(1, a.seconds || 16)));
        const NAMES = (n) => ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'][n % 12] + (Math.floor(n / 12) - 1);
        const notes = out.messages.filter(m => (m.bytes[0] & 0xf0) === 0x90 && m.bytes[2] > 0).map(m => `${m.t.toFixed(3)}s ch${(m.bytes[0] & 15) + 1} ${NAMES(m.bytes[1])} v${m.bytes[2]}`);
        const kinds = {};
        for (const e of out.events) kinds[e.type] = (kinds[e.type] || 0) + 1;
        return { seconds: a.seconds || 16, tempo: p.settings.tempo, events: kinds, notes: notes.length, firstNotes: notes.slice(0, 60), errors: out.errors };
      }
      if (a.action === 'import') {
        if (a.kind === 'iannix') { const b = await app.importIannix(String(a.source || ''), { confirmed: true, title: a.title }); return b ? { board: b.id, title: b.title } : { imported: false }; }
        if (a.kind === 'nous') { const b = await app.importNous(String(a.source || ''), { title: a.title }); return b ? { board: b.id, title: b.title, tempo: p.settings.tempo } : { imported: false }; }
        throw new Error('kind: iannix | nous');
      }
      if (a.action === 'link') {
        const find = ref => app.store.doc.elements.find(e => e.id === ref || e.label === ref);
        const from = find(a.from), to = find(a.to);
        if (!from || !to) throw new Error('link: from and to are marks (an id or a name)');
        const Rel = await import('../score/relations.js');
        const rel = Rel.infer(from, to);
        if (!rel) return { linked: false, why: 'Nothing to make between those two (a point and a line: it travels; two triggers: one sends to the other; a trigger and a traveler: it starts it)' };
        app.store.change('link', d => Rel.apply(d, rel), { by: 'agent' });
        return { linked: true, relation: rel.kind, from: rel.from, to: rel.to, label: rel.label };
      }
      if (a.action === 'solo') { sc.setSolo(a.ids?.length ? a.ids.map(r => (app.store.doc.elements.find(e => e.id === r || e.label === r) || {}).id).filter(Boolean) : null); return { solo: sc.solo ? [...sc.solo] : null }; }
      if (a.action === 'export') return app.exportMidi(a.seconds);
      if (a.action === 'settings') {
        const patch = {};
        if (a.tempo !== undefined) patch.tempo = a.tempo;
        if (a.signature) { const [numerator, denominator] = String(a.signature).split('/').map(Number); patch.signature = { numerator, denominator }; }
        if (a.ruler) patch.ruler = a.ruler;
        if (a.loop !== undefined) patch.loop = Array.isArray(a.loop) ? { start: a.loop[0], end: a.loop[1] } : { start: 0, end: 0 };
        if (Object.keys(patch).length) p.setSettings(patch);
        return p.settings;
      }
      if (a.action === 'sound') {
        const patch = {};
        for (const k of ['gm', 'midi', 'program']) if (a[k] !== undefined) patch[k] = a[k];
        sc.setSound(patch);
        if (a.mixer) sc.setMixer(a.mixer);   // { channel: { 1: { program, out, vol, pan, mute, solo, transpose } }, scale: { name, root }, transpose }
        return { ...sc.prefs, mixer: sc.mixer(), midi: sc.midi.selected, outputs: sc.outputs().map(o => o.id) };
      }
      throw new Error('Unknown action');
    } },
    { name: 'ams_timeline', description: 'Takes on the timeline: action "list" (takes in Assets), "open" {id}, "play", "pause", "seek" {ms}, "summary" (a short-form cut of the open take, saved), "walkthrough" (make a live walkthrough from it), "export" {format: html | project | video | json, rate}.', inputSchema: S({ action: str('list | open | play | pause | seek | summary | walkthrough | export'), id: str('Take asset id'), ms: num('Time in ms'), format: str('html | project | video | json'), rate: num('Video speed') }, ['action']), run: async (a) => {
      const p = app.player;
      if (a.action === 'list') return (await app.assetStore.all()).filter(x => x.kind === 'take').map(x => ({ id: x.id, title: x.title, seconds: Math.round((x.meta?.duration || 0) / 1000), clips: x.meta?.clips }));
      if (a.action === 'open') { await app.openTake(a.id); return { open: p.take.title, seconds: Math.round(p.duration / 1000) }; }
      // (the transport runs without a take: scores play on it)
      if (a.action === 'play') { p.play(); return { playing: true }; }
      if (a.action === 'pause') { p.pause(); return { t: Math.round(p.t) }; }
      if (a.action === 'seek') { p.seek(a.ms || 0); return { t: Math.round(p.t) }; }
      if (!p.take) throw new Error('No take open: ams_timeline {action: "open", id}');
      if (a.action === 'summary') { const { summarize, duration: dur } = await import('../process/take.js'); const s2 = summarize(p.take); s2.duration = dur(s2); await app.recorder.saveTake(s2, { title: s2.title }); p.load(s2); return { title: s2.title, seconds: Math.round(s2.duration / 1000) }; }
      if (a.action === 'walkthrough') { const w = await app.walkthroughs.fromTake(p.take); return { walkthrough: w.id, steps: w.steps.length }; }
      if (a.action === 'export') {
        const m = await import('./takeExport.js');
        if (a.format === 'video') { m.downloadVideo(p.take, { rate: a.rate || 1, app }); return { recording: true }; }
        ({ html: m.downloadHTML, project: m.downloadProject, json: m.downloadJSON }[a.format || 'html'] || m.downloadHTML)(p.take);
        return { exported: a.format || 'html' };
      }
      throw new Error('Unknown action');
    } },
    { name: 'ams_undo', description: 'Undo (or redo with redo:true).', inputSchema: S({ redo: { type: 'boolean' } }), run: (a) => ({ ok: a.redo ? app.store.redo() : app.store.undo() }) }
  ];
}

/** The Decide panel mounts lazily; tools open it first. */
function decide(app) {
  if (!app.decidePanel) app.docks.open('decide');
  return app.decidePanel;
}

function pendingView(app) {
  const p = app.decider?.pending;
  if (!p) return null;
  return { state: p.state, questions: Object.fromEntries(Object.entries(p.questions).map(([k, q]) => [k, { type: q.type, instructions: q.instructions, options: q.criteria }])) };
}

/** Accept [[x,y],...], a single [x,y], or a flat [x,y,x,y,...] list; reject anything else clearly. */
function normalizePoints(pts) {
  if (!Array.isArray(pts) || !pts.length) throw new Error('points must be a list like [[x, y], [x, y]]');
  if (pts.every(p => Array.isArray(p) && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))) return pts.map(p => p.map(Number));
  if (pts.every(v => Number.isFinite(Number(v))) && pts.length % 2 === 0) { const out = []; for (let i = 0; i < pts.length; i += 2) out.push([Number(pts[i]), Number(pts[i + 1])]); return out; }
  throw new Error('points must be a list like [[x, y], [x, y]] (numbers in artboard units)');
}

/** A document with only one board's marks (for rendering a board's score alone). */
function boardOnly(doc, key) {
  const b = findBoard(doc, key);
  if (!b) throw new Error(`No board “${key}”`);
  return { ...doc, elements: doc.elements.filter(e => (e.board || MAIN) === b.id) };
}

function loadScore(app, source, seed, by, title) {
  // Into the active board: its marks are replaced, the other boards and the blackboard stay.
  const res = runScoreInto(app.store.doc, source, { board: app.activeBoard || 'main', seed, by });
  if (res.doc) { res.doc.title = title || app.store.doc.title; app.loadDocument(res.doc, 'agent score'); }
  return res;
}

export function initWorkbenchMCP(app) {
  const tools = workbenchTools(app);
  const byName = Object.fromEntries(tools.map(t => [t.name, t]));
  // Every tool also takes `narrate`: one sentence shown to the user while the action plays.
  const listTools = () => tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema: { ...inputSchema, properties: { ...(inputSchema.properties || {}), narrate: { type: 'string', description: 'Optional: one sentence shown to the user while this action plays' } } } }));
  app.sessions = app.sessions || new SessionRecorder(app);
  /** Run a tool the way a user would see it: guide cursor, narration, then the action. */
  const callTool = async (name, args = {}, { replay = false } = {}) => {
    const t = byName[name];
    if (!t) throw new Error(`Unknown tool ${name}`);
    const { narrate, ...rest } = args || {};
    const g = app.guide;
    app.emit('tool-call', name, rest, { replay, summary: summarize(name, rest) });
    const visible = !READ_ONLY.test(name) || rest.open;
    const tabsBefore = { ...app.docks.state.active };
    if (visible) {
      const brief = JSON.stringify(rest, (k, v) => (typeof v === 'string' && v.length > 60 ? v.slice(0, 57) + '…' : Array.isArray(v) && v.length > 4 ? `[${v.length}]` : v));
      app.log(`Agent → ${name.replace(/^ams_/, '')} ${brief === '{}' ? '' : brief}`, 'agent');
      if (!replay) app.sessions.record(name, args);
      app.sayAuto = !narrate;   // automatic lines label the action; only real narration becomes a caption
      g?.say(narrate || summarize(name, rest), replay ? 'Replay' : 'Agent');
      app.sayAuto = false;
      try { await SHOW[name]?.(g, rest, app); } catch { /* showing is best effort */ }
    }
    try {
      const out = await t.run(rest);
      if (visible && (name === 'ams_run_score' || (name === 'ams_exercise' && rest.load)) && !out?.error) await revealScore(g, app);
      return out;
    } catch (err) { app.log(`Agent ${name} failed: ${err.message}`, 'error'); throw err; }
    finally {
      // Showing an action may switch dock tabs; keep a conversation (Assistant) in view.
      for (const [dock, id] of Object.entries(tabsBefore)) if (id === 'assistant' && app.docks.state.active[dock] !== id) { app.docks.state.active[dock] = id; app.docks.render(); }
    }
  };
  tools.push(
    { name: 'ams_show', description: 'Show something without changing it: move the guide cursor to a target (tool:<id>, panel:<id>, button:<id>, view:picture|process, stage:<name>, title, menu) and narrate.', inputSchema: S({ target: str(''), text: str('') }), run: async (a) => { if (a.text) app.guide.say(a.text, 'Agent'); if (a.target) await app.guide.moveTo(a.target); return { ok: true }; } },
    { name: 'ams_sessions', description: 'Recorded agent sessions (each starts from a baseline). action "replay" shows how a result was made, step by step with the guide; pace 0 instant, 0.5 fast, 1 normal, 2 slow.', inputSchema: S({ action: str('list | replay'), id: str('Session id (default: latest)'), pace: num('') }), run: async (a) => {
      if (a.action === 'replay') { if (a.pace !== undefined) app.guide.pace = a.pace; return app.sessions.replay(a.id, callTool); }
      return app.sessions.list();
    } }
  );
  for (const t of tools.slice(-2)) byName[t.name] = t;
  window.ams = { listTools, callTool, app, diagnostics: minutes => console.log(app.diagnostics?.(minutes)) };

  try {
    navigator.modelContext?.provideContext?.({ tools: tools.map(t => ({ name: t.name, description: t.description, inputSchema: t.inputSchema, execute: async a => ({ content: [{ type: 'text', text: JSON.stringify(await callTool(t.name, a)) }] }) })) });
  } catch { /* WebMCP unavailable */ }

  if (!import.meta.env?.DEV) return;
  const tab = Math.random().toString(36).slice(2);
  const hello = () => fetch('/__ams/hello', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tab, title: document.title, url: location.href, tools: listTools() }) }).catch(() => {});
  const handle = async ({ id, name, args }) => {
    let body;
    try { const result = name === 'tools/list' ? listTools() : await callTool(name, args); body = { id, result: JSON.parse(JSON.stringify(result ?? null)) }; }
    catch (err) { body = { id, error: err?.message || String(err) }; }
    fetch('/__ams/result', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  };
  (async function poll() {
    await hello();
    for (;;) {
      try {
        const res = await fetch(`/__ams/poll?tab=${tab}`);
        if (res.status === 404) { await hello(); continue; }
        if (res.status === 200) handle(await res.json());
      } catch { await new Promise(r => setTimeout(r, 2000)); }
    }
  })();
}

export { normalizeElement };
