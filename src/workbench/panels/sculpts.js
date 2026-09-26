/**
 * Sculpt tools as code: pick one to read it, fork a built-in, or write your own. The preview runs
 * the tool along a sweep over a sample line (faint: before; dark: after) as you type.
 */
import { askConfirm } from '../dialog.js';
import { h, selectField } from '../ui.js';
import { SCULPTS, sculptSource, compileSculpt, saveSculpt, deleteSculpt, isBuiltinSculpt, sculptMark, sculptParams } from '../../process/sculpt.js';
import { mulberry32 } from '../../process/brushes.js';
import { createCodeEditor } from '../codeEditor.js';

const TEMPLATE = id => `sculpt({
  id: '${id}',
  label: '${id[0].toUpperCase()}${id.slice(1)}',
  doc: 'What this tool does to a line, in one sentence.',
  refine: true,
  params: {
    amount: [0, 1, 0.3, 'How strongly each pass acts']
  },
  // pts: the mark's points [x, y, t, pressure]; s: the stroke (cursor x, y, dx, dy, radius…);
  // k.w(pt): the brush weight at a point (0 outside the brush)
  step(pts, s, p, k) {
    return pts.map(q => {
      const w = k.w(q) * p.amount
      // comb: points drift across the direction you move
      return w ? [q[0] - s.dy * w, q[1] + s.dx * w, q[2], q[3]] : q
    })
  }
})
`;

function sampleLine(W, H) {
  const pts = [];
  for (let i = 0; i <= 60; i++) { const u = i / 60; pts.push([W * (0.06 + u * 0.88), H * (0.5 + 0.18 * Math.sin(u * Math.PI * 3)), i * 20, 0.5]); }
  return { role: 'line', points: pts, closed: false };
}

export function mountSculpts(root, app) {
  let current = app.sculpt?.tool || 'push';
  let def = null;
  const status = h('div', { class: 'wb-script-out' });
  const preview = h('canvas', { class: 'wb-brush-preview', width: 600, height: 200 });
  const host = h('div', { class: 'wb-code-host wb-brush-code' });
  const picker = h('div', { class: 'wb-row wb-row-actions' });
  const actions = h('div', { class: 'wb-row wb-row-actions' });
  root.append(picker, preview, host, status, actions);

  const draw = () => {
    const ctx = preview.getContext('2d'), W = preview.width, H = preview.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = app.store.doc.artboard.ground || '#f3efe6'; ctx.fillRect(0, 0, W, H);
    const line = sampleLine(W, H);
    const path = (pts, style, width) => { ctx.strokeStyle = style; ctx.lineWidth = width; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); };
    path(line.points, 'rgba(0,0,0,0.18)', 2);
    if (!def) return;
    // A sweep left to right across the middle, 30 passes, with the tool's default params.
    const was = SCULPTS.__preview; SCULPTS.__preview = def;
    const el = { ...line, points: line.points.map(q => q.slice()) };
    const mark = { orig: el.points.map(q => q.slice()), state: {} };
    const rng = mulberry32(7);
    let last = [W * 0.3, H * 0.55];
    for (let i = 0; i <= 30; i++) {
      const x = W * (0.3 + 0.4 * i / 30), y = H * (0.55 - 0.15 * Math.sin(i / 30 * Math.PI));
      const s = { x, y, dx: x - last[0], dy: y - last[1], radius: H * 0.3, strength: 0.6, pressure: 1, invert: false, first: i === 0, start: [W * 0.3, H * 0.55] };
      const out = sculptMark('__preview', el, s, sculptParams('__preview'), rng, mark);
      if (out) el.points = out;
      last = [x, y];
    }
    if (was) SCULPTS.__preview = was; else delete SCULPTS.__preview;
    path(el.points, '#1d1b19', 2);
    ctx.fillStyle = '#1d1b19'; for (const [x, y] of el.points) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(217,72,15,0.5)'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.arc(W * 0.7, H * 0.55, H * 0.3, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  };

  const compile = src => {
    try { def = compileSculpt(src); status.textContent = `${def.label}: ${def.doc}`; status.classList.remove('error'); editor.markError(null); }
    catch (err) { def = null; status.textContent = err.message; status.classList.add('error'); }
    draw();
  };
  const editor = createCodeEditor(host, { value: '', onRun: () => save(), onChange: v => compile(v) });

  const save = () => {
    try {
      const d = saveSculpt(editor.value);
      current = d.id;
      app.setSculpt({ tool: d.id });
      status.textContent = `Saved “${d.label}” to your sculpt tools.`; status.classList.remove('error');
      refresh();
    } catch (err) { status.textContent = err.message; status.classList.add('error'); }
  };

  const refresh = () => {
    const builtin = isBuiltinSculpt(current);
    picker.replaceChildren(
      selectField(Object.entries(SCULPTS).filter(([id]) => id !== '__preview').map(([id, t]) => [id, `${t.label}${isBuiltinSculpt(id) ? '' : ' · yours'}`]), current, v => open(v), 'Sculpt tool'),
      h('span', { class: 'wb-muted wb-small' }, builtin ? 'built-in (fork to change)' : 'your library'));
    actions.replaceChildren(...[
      h('button', { class: 'wb-btn primary', title: 'Save to your sculpt tools (Cmd+Enter)', onclick: save }, 'Save'),
      h('button', { class: 'wb-btn', title: 'A copy under a new id, to change', onclick: () => { const id = `${current}2`; editor.value = editor.value.replace(/id:\s*['"][\w-]+['"]/, `id: '${id}'`).replace(/label:\s*(['"])(.*?)\1/, (m, qq, l) => `label: ${qq}${l} (mine)${qq}`); compile(editor.value); } }, 'Fork'),
      h('button', { class: 'wb-btn', title: 'Start a new sculpt tool', onclick: () => { editor.value = TEMPLATE('comb'); compile(editor.value); } }, 'New'),
      !builtin ? h('button', { class: 'wb-btn', onclick: async () => { if (await askConfirm(`Delete the sculpt tool “${current}”?`, { ok: 'Delete', danger: true })) { deleteSculpt(current); open('push'); if (app.sculpt.tool === current) app.setSculpt({ tool: 'push' }); } } }, 'Delete') : null].filter(Boolean));
  };

  const open = id => {
    current = SCULPTS[id] ? id : 'push';
    editor.value = sculptSource(current);
    compile(editor.value);
    refresh();
  };

  app.sculptsPanel = { open };
  open(current);
}
