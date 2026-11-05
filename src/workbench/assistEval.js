/**
 * Assistant evals: what people say to the quick field, and a check on the drawing that results (not on the model's words).
 *
 * Each task: { id, say, setup?: tool calls that make the scene (and select), check(app) → true | 'why not' }.
 * `run(app, { mode })`:
 *   mode 'quick'  the whole path: instant phrase, command, then the model (what a person gets)
 *   mode 'model'  the model only, with the flow prompt (measures the model and its prompt, not the grammar)
 * Between tasks the page is cleared; the result is a table of passes, with the tool calls the model made, to compare with
 * what a capable agent does with the same tools (`reference` in a task: the calls that should work).
 * Run it from the page: `(await import('/src/workbench/assistEval.js')).run(app, { mode: 'model' })`.
 */
import { intentCommand } from './intents.js';

const box = e => { const xs = e.points.map(p => p[0]), ys = e.points.map(p => p[1]); return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys), cx: (Math.min(...xs) + Math.max(...xs)) / 2, cy: (Math.min(...ys) + Math.max(...ys)) / 2 }; };
const rgb = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); if (!m) return null; const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const isRed = h => { const c = rgb(h); return c && c[0] > 140 && c[0] > c[1] * 1.8 && c[0] > c[2] * 1.8; };
const isBlue = h => { const c = rgb(h); return c && c[2] > 100 && c[2] > c[0] * 1.5 && c[2] > c[1] * 1.2; };
const isGreen = h => { const c = rgb(h); return c && c[1] > 90 && c[1] > c[0] * 1.2 && c[1] > c[2] * 1.2; };
const paint = e => e.fill || e.color;
const els = app => app.store.doc.elements;
const only = (app, n = 1) => (els(app).length === n ? true : `${els(app).length} marks, wanted ${n}`);
const SQUARE = { tool: 'ams_add', args: { shape: 'rect', box: [400, 400, 600, 600], fill: '#2a4f9a' } };
const CIRCLE = { tool: 'ams_add', args: { shape: 'circle', box: [410, 410, 590, 590], fill: '#2a4f9a' } };

export const TASKS = [
  { id: 'make-circle', alt: 'I need a round red shape', say: 'create a red circle', reference: [{ tool: 'ams_add', args: { shape: 'circle', box: [410, 410, 590, 590], fill: '#d03030' } }],
    check: app => { if (only(app) !== true) return only(app); const e = els(app)[0]; return e.points.length >= 8 && isRed(paint(e)) ? true : `${e.role}, ${e.points.length} points, ${paint(e)}`; } },
  { id: 'make-square', alt: 'put a blue box on the page', say: 'draw a blue square', reference: [{ tool: 'ams_add', args: { shape: 'rect', box: [400, 400, 600, 600], fill: '#2040c0' } }],
    check: app => { if (only(app) !== true) return only(app); const e = els(app)[0], b = box(e); return e.points.length === 4 && Math.abs(b.w - b.h) < 8 && isBlue(paint(e)) ? true : `${e.points.length} points ${Math.round(b.w)}×${Math.round(b.h)} ${paint(e)}`; } },
  { id: 'make-dot', alt: 'a small green point please', say: 'add a green dot', reference: [{ tool: 'ams_add', args: { role: 'point', points: [[500, 500]], color: '#20a040' } }],
    check: app => { const e = els(app)[0]; return els(app).length === 1 && e.role === 'point' && isGreen(paint(e)) ? true : `${els(app).length} marks, ${e?.role} ${e && paint(e)}`; } },
  { id: 'make-line', alt: 'a diagonal stroke across the page, upper left to lower right', say: 'draw a line from the top left to the bottom right', reference: [{ tool: 'ams_add', args: { role: 'line', points: [[100, 100], [900, 900]] } }],
    check: app => { const e = els(app)[0]; if (els(app).length !== 1 || e.role !== 'line' || e.points.length < 2) return `${els(app).length} marks, ${e?.role}`; const b = box(e); return b.w > 500 && b.h > 500 && e.points[0][0] < e.points.at(-1)[0] && e.points[0][1] < e.points.at(-1)[1] ? true : `box ${Math.round(b.w)}×${Math.round(b.h)}`; } },
  { id: 'three-circles', alt: 'three round shapes side by side', say: 'draw three circles in a row', reference: [0, 1, 2].map(i => ({ tool: 'ams_add', args: { shape: 'circle', box: [150 + i * 300, 410, 330 + i * 300, 590] } })),
    check: app => { const l = els(app); if (l.length !== 3) return `${l.length} marks`; const b = l.map(box).sort((a, c) => a.cx - c.cx); return b[2].cx - b[0].cx > 300 && Math.max(...b.map(x => x.cy)) - Math.min(...b.map(x => x.cy)) < 60 ? true : 'not in a row'; } },
  { id: 'recolor-fill', alt: 'paint it red', say: 'change the fill to red', setup: [SQUARE], select: true, reference: [{ tool: 'ams_update', args: { id: '$sel', patch: { fill: '#d03030' } } }], check: app => (isRed(els(app)[0].fill) ? true : `fill ${els(app)[0].fill}`) },
  { id: 'darker', alt: 'a darker shade please', say: 'make it darker', setup: [SQUARE], select: true, reference: [{ tool: 'ams_update', args: { id: '$sel', patch: { fill: '#1a3060' } } }], check: app => { const c = rgb(els(app)[0].fill); return c && c[0] + c[1] + c[2] < 0x2a + 0x4f + 0x9a ? true : `fill ${els(app)[0].fill}`; } },
  { id: 'see-through', alt: 'half transparent', say: 'make it see-through', setup: [SQUARE], select: true, reference: [{ tool: 'ams_update', args: { id: '$sel', patch: { opacity: 0.5 } } }], check: app => { const o = els(app)[0].opacity; return o != null && o < 0.95 && o > 0 ? true : `opacity ${o}`; } },
  { id: 'hatch', alt: 'give it a hatched fill', say: 'hatch it', setup: [SQUARE], select: true, reference: [{ tool: 'ams_update', args: { id: '$sel', patch: { realize: { brush: 'hatch', params: {} } } } }], check: app => (els(app)[0].realize?.brush === 'hatch' ? true : `brush ${els(app)[0].realize?.brush}`) },
  { id: 'bigger', alt: 'scale it up by half', say: 'make it bigger', setup: [CIRCLE], select: true, reference: [{ tool: 'ams_transform', args: { ids: ['$sel'], scale: 1.5 } }], check: app => (box(els(app)[0]).w > 200 ? true : `width ${Math.round(box(els(app)[0]).w)} (was 180)`) },
  { id: 'move-right', alt: 'shift it 200 to the right', say: 'move it to the right', setup: [CIRCLE], select: true, reference: [{ tool: 'ams_transform', args: { ids: ['$sel'], move: [200, 0] } }], check: app => (box(els(app)[0]).cx > 560 ? true : `centre x ${Math.round(box(els(app)[0]).cx)} (was 500)`) },
  { id: 'delete', alt: 'get rid of it', say: 'delete it', setup: [SQUARE], select: true, reference: [{ tool: 'ams_command', args: { id: 'edit.delete' } }], check: app => (els(app).length === 0 ? true : `${els(app).length} marks left`) },
  { id: 'duplicate', alt: 'make a copy', say: 'duplicate it', setup: [SQUARE], select: true, reference: [{ tool: 'ams_command', args: { id: 'edit.duplicate' } }], check: app => (els(app).length === 2 ? true : `${els(app).length} marks`) },
  { id: 'name-it', alt: 'label this horizon', say: 'call it horizon', setup: [SQUARE], select: true, reference: [{ tool: 'ams_update', args: { id: '$sel', patch: { label: 'horizon' } } }], check: app => (els(app)[0].label === 'horizon' ? true : `label ${els(app)[0].label}`) },
  { id: 'two-recolor', alt: 'the square should be red and the circle blue', say: 'make the circle blue and the square red', setup: [{ tool: 'ams_add', args: { shape: 'circle', box: [100, 400, 300, 600], fill: '#888888' } }, { tool: 'ams_add', args: { shape: 'rect', box: [600, 400, 800, 600], fill: '#888888' } }], reference: [{ tool: 'ams_update', args: { id: '$0', patch: { fill: '#2040c0' } } }, { tool: 'ams_update', args: { id: '$1', patch: { fill: '#d03030' } } }], check: app => { const l = els(app), c = l.find(e => e.points.length > 4), r = l.find(e => e.points.length === 4); return c && r && isBlue(c.fill) && isRed(r.fill) ? true : `circle ${c?.fill} square ${r?.fill}`; } },
  { id: 'house', alt: 'sketch a little house', say: 'draw a simple house', reference: [], check: app => { const l = els(app); return l.length >= 2 && l.every(e => e.points.length >= 3 || e.role === 'line') ? true : `${l.length} marks`; } }
];

const wait = ms => new Promise(r => setTimeout(r, ms));

/** The Assistant builds itself the first time it is shown: build it without showing it. */
export function ensureAssistant(app) {
  if (!app.assistantAsk) { const p = app.docks.panels.get('assistant'); if (p) app.docks.mountBody(p); }
  if (!app.assistantAsk) throw new Error('The Assistant panel is not available');
}

export async function reset(app) {
  app.store.change('eval reset', d => { d.elements.length = 0; });
  app.canvas.select([]);
}

async function prepare(app, task) {
  await reset(app);
  const ids = [];
  for (const c of task.setup || []) ids.push((await window.ams.callTool(c.tool, c.args, { quiet: true })).id);
  if (task.select) app.canvas.select(ids);
  return ids;
}

/** Run one task. mode 'reference': the task's own calls (the tools alone); 'quick'; 'model'. */
export async function runTask(app, task, { mode = 'model', timeout = 60000, use = 'say' } = {}) {
  const said = task[use] || task.say;
  const ids = await prepare(app, task);
  const t0 = performance.now();
  let calls = [], error = null, layer = mode;
  app.requests?.clear?.();
  try {
    if (mode === 'reference') {
      for (const c of task.reference || []) {
        const args = JSON.parse(JSON.stringify(c.args).replace(/"\$sel"/g, JSON.stringify(ids[0])).replace(/"\$0"/g, JSON.stringify(ids[0])).replace(/"\$1"/g, JSON.stringify(ids[1])));
        await window.ams.callTool(c.tool, args, { quiet: true }); calls.push({ tool: c.tool, args });
      }
    } else {
      const hit = intentCommand(app, said);
      if (mode === 'quick' && hit) { layer = 'phrase'; await hit.run(); calls.push({ tool: `phrase:${hit.name}` }); }
      else {
        const ctx = ids.length ? `[Context: selected: mark (ids ${ids.join(', ')}); board main]\n` : '';
        layer = 'model';
        const r = await Promise.race([app.assistantAsk(ctx + said, { flow: true }), wait(timeout).then(() => ({ error: 'timeout' }))]);
        if (r?.error) error = r.error;
        calls = (app.requests?.list.at(-1)?.calls) || [];
      }
    }
  } catch (err) { error = err.message; }
  let verdict; try { verdict = task.check(app); } catch (err) { verdict = `checker: ${err.message}`; }
  return { id: task.id, say: said, mode, layer, pass: verdict === true, why: verdict === true ? '' : verdict, error, ms: Math.round(performance.now() - t0), calls: calls.map(c => `${c.tool} ${c.args ? JSON.stringify(c.args).slice(0, 160) : ''}${c.error ? ` ✗ ${c.error}` : ''}`) };
}

export async function run(app, { mode = 'model', only: ids = null, use = 'say' } = {}) {
  ensureAssistant(app);
  const out = [];
  for (const t of TASKS) { if (ids && !ids.includes(t.id)) continue; out.push(await runTask(app, t, { mode, use })); }
  await reset(app);
  return { mode, passed: out.filter(r => r.pass).length, of: out.length, results: out };
}
