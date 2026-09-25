/**
 * Workbench tools for agents: the same actions a user takes, as MCP tools.
 * Exposed on window.ams, navigator.modelContext (when present), and the dev relay
 * (/__ams/*) that src/mcp/mcpServer.js proxies for Claude Code and other clients.
 * Every mutating call is written to the Log in purple.
 */
import { runScript, SCRIPT_REFERENCE } from '../process/script.js';
import { EXERCISES } from '../process/exercises.js';
import { ROLES, STAGE_KINDS, normalizeElement } from '../process/document.js';
import { BRUSHES } from '../process/brushes.js';
import { toSVG, toExcalidraw, toP5, processSheet } from '../process/exports.js';
import { matches } from '../assets/assetStore.js';

const S = (properties = {}, required = []) => ({ type: 'object', properties, required });
const str = d => ({ type: 'string', description: d });
const num = d => ({ type: 'number', description: d });
const PRINCIPLES = `You are drawing in Artist Model Studio. The picture is a process: name your stages (analysis → concept → construction → structure → value → marks → notes), record decisions with decide(), and give every mark a short reason (why). The harness does not paint for you: brushes only realise your paths. Keep construction (guides, gestures) separate from marks. Coordinates are artboard units (origin top-left).`;

export function workbenchTools(app) {
  const doc = () => app.store.doc;
  const brushSchema = Object.fromEntries(Object.entries(BRUSHES).map(([id, b]) => [id, { roles: b.roles, doc: b.doc, params: b.params.map(p => ({ key: p.key, min: p.min, max: p.max, default: p.default, doc: p.doc })) }]));
  const png = c => c.toDataURL('image/png');
  return [
    { name: 'ams_wb_state', description: 'Workbench state: title, artboard, stages (with element counts), active stage, tool, view, selection, reference underlay.', inputSchema: S(), run: () => ({
      title: doc().title, artboard: doc().artboard,
      stages: doc().stages.map((s, i) => ({ index: i, ...s, elements: doc().elements.filter(e => e.stage === s.id).length })),
      elements: doc().elements.length, decisions: doc().decisions.length,
      activeStage: app.activeStage?.id, tool: app.tool, view: app.view.mode === 'process' ? { ...app.view, upTo: Number.isFinite(app.view.upTo) ? app.view.upTo : null } : { ...app.view, upTo: null },
      selection: [...app.canvas.selected], reference: app.reference ? { title: app.reference.title, visible: app.reference.visible } : null
    }) },
    { name: 'ams_vocabulary', description: 'How to write a score: principles, the point/line/plane vocabulary, brushes with parameter ranges, roles, stage kinds, and the exercises.', inputSchema: S(), run: () => ({
      principles: PRINCIPLES, vocabulary: SCRIPT_REFERENCE, roles: ROLES, stageKinds: STAGE_KINDS, brushes: brushSchema,
      exercises: EXERCISES.map(x => ({ id: x.id, title: x.title, brief: x.brief }))
    }) },
    { name: 'ams_exercise', description: 'Get an exercise brief and its example score; optionally load and run it.', inputSchema: S({ id: str('Exercise id'), load: { type: 'boolean', description: 'Also run it on the canvas' } }, ['id']), run: (a) => {
      const x = EXERCISES.find(e => e.id === a.id);
      if (!x) throw new Error('Unknown exercise');
      if (a.load) { app.scriptPanel?.setSource(x.source); loadScore(app, x.source, 1, { kind: 'example', name: 'exercise' }, x.title); }
      return x;
    } },
    { name: 'ams_run_score', description: 'Run a score (JS in the point/line/plane vocabulary) and put the recorded process on the canvas. Use by to credit yourself (e.g. {kind:"model", name:"claude-opus-5-5"}).', inputSchema: S({ source: str('Score source'), seed: num('Seed (default 1)'), title: str('Title'), by: { type: 'object', description: '{ kind, name }' } }, ['source']), run: (a) => {
      app.scriptPanel?.setSource(a.source);
      const res = loadScore(app, a.source, a.seed ?? 1, a.by || { kind: 'model', name: 'agent' }, a.title);
      return res.error ? { error: res.error, logs: res.logs } : { stages: res.doc.stages.map(s => s.name), elements: res.doc.elements.length, decisions: res.doc.decisions.length, logs: res.logs };
    } },
    { name: 'ams_get', description: 'The process document as JSON, SVG (with records), Excalidraw, or a p5 sketch.', inputSchema: S({ format: { type: 'string', enum: ['json', 'svg', 'excalidraw', 'p5'] } }), run: (a) => {
      const f = a.format || 'json';
      return f === 'svg' ? { svg: toSVG(doc()) } : f === 'excalidraw' ? toExcalidraw(doc()) : f === 'p5' ? { sketch: toP5(doc()) } : doc();
    } },
    { name: 'ams_set', description: 'Replace the process document (JSON).', inputSchema: S({ doc: { type: 'object' } }, ['doc']), run: (a) => { app.loadDocument(a.doc, 'agent set'); return { ok: true }; } },
    { name: 'ams_add', description: 'Add one element: role (point|line|plane|guide|gesture|note), points [[x,y],...], stage id or name (default: active), brush, params, color, why, text (notes).', inputSchema: S({ role: str('Role'), points: { type: 'array' }, stage: str('Stage id or name'), brush: str('Brush id'), params: { type: 'object' }, color: str('Colour'), why: str('Reason'), text: str('Note text'), by: { type: 'object' } }, ['role', 'points']), run: (a) => {
      const st = doc().stages.find(s => s.id === a.stage || s.name === a.stage) || app.activeStage;
      const el = app.store.addElement({ role: a.role, stage: st.id, points: a.points.map((p, i) => [p[0], p[1], p[2] ?? i * 16, p[3] ?? 0.5]), realize: a.brush ? { brush: a.brush, params: a.params || {} } : undefined, color: a.color, why: a.why, text: a.text, by: a.by || { kind: 'model', name: 'agent' } }, { by: 'agent' });
      return { id: el.id, stage: st.name };
    } },
    { name: 'ams_update', description: 'Change an element: any of stage, role, color, why, text, realize {brush, params}, points.', inputSchema: S({ id: str('Element id'), patch: { type: 'object' } }, ['id', 'patch']), run: (a) => ({ ok: Boolean(app.store.updateElement(a.id, a.patch, 'agent edit', { by: 'agent' })) }) },
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
    { name: 'ams_view', description: 'View: mode picture|process, upTo stage index (null = all), fit, tool, select ids.', inputSchema: S({ mode: str('picture | process'), upTo: { type: ['number', 'null'] }, fit: { type: 'boolean' }, tool: str(''), select: { type: 'array', items: { type: 'string' } } }), run: (a) => {
      if (a.mode) app.setViewMode(a.mode);
      if ('upTo' in a) app.setUpTo(a.upTo === null ? Infinity : a.upTo);
      if (a.fit) app.canvas.fit();
      if (a.tool) app.setTool(a.tool);
      if (a.select) app.selectIds(a.select);
      return { ok: true };
    } },
    { name: 'ams_snapshot', description: 'PNG of the artboard (picture or process view), optionally up to a stage.', inputSchema: S({ mode: str('picture | process'), scale: num('Scale (default 0.6)'), upTo: num('Stage index') }), run: (a) => {
      const prev = app.canvas.upTo;
      if (a.upTo !== undefined) app.canvas.upTo = a.upTo;
      const image = png(app.canvas.snapshot(a.mode || app.view.mode, a.scale || 0.6));
      app.canvas.upTo = prev;
      return { image };
    } },
    { name: 'ams_process_sheet', description: 'PNG process sheet: each stage built up, plus decisions.', inputSchema: S(), run: () => ({ image: png(processSheet(doc())) }) },
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
    { name: 'ams_undo', description: 'Undo (or redo with redo:true).', inputSchema: S({ redo: { type: 'boolean' } }), run: (a) => ({ ok: a.redo ? app.store.redo() : app.store.undo() }) }
  ];
}

function loadScore(app, source, seed, by, title) {
  const res = runScript(source, { seed, by });
  if (res.doc) { res.doc.title = title || app.store.doc.title; app.loadDocument(res.doc, 'agent score'); }
  return res;
}

export function initWorkbenchMCP(app) {
  const tools = workbenchTools(app);
  const byName = Object.fromEntries(tools.map(t => [t.name, t]));
  const listTools = () => tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }));
  const QUIET = /^ams_(wb_state|vocabulary|get|snapshot|process_sheet|assets)$/;
  const callTool = async (name, args = {}) => {
    const t = byName[name];
    if (!t) throw new Error(`Unknown tool ${name}`);
    if (!QUIET.test(name) || args.open) {
      const brief = JSON.stringify(args, (k, v) => (typeof v === 'string' && v.length > 60 ? v.slice(0, 57) + '…' : Array.isArray(v) && v.length > 4 ? `[${v.length}]` : v));
      app.log(`Agent → ${name.replace(/^ams_/, '')} ${brief === '{}' ? '' : brief}`, 'agent');
    }
    try { return await t.run(args); } catch (err) { app.log(`Agent ${name} failed: ${err.message}`, 'error'); throw err; }
  };
  window.ams = { listTools, callTool, app };

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
