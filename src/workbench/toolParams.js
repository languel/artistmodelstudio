/**
 * Opt+right-click: the active tool's parameters as sliders, where the pointer is (the same
 * params the code declares). Sculpt: radius, strength and the tool's params. Select with a
 * selection: the selected marks' brush params. A drawing tool: its brush params for new marks.
 */
import { h } from './ui.js';
import { icon } from './icons.js';
import { rangeInput } from './codeParams.js';
import { SCULPTS, sculptParams } from '../process/sculpt.js';
import { BRUSHES, resolveParams, brushesForRole } from '../process/brushes.js';
import { BLENDS } from '../process/document.js';
import { brushIcon } from './icons.js';

let open = null;

function slider({ label, min, max, step, value, doc, onInput }) {
  const out = h('span', { class: 'wb-tp-value' });
  const d = (String(step).split('.')[1] || '').length;
  const show = v => { out.textContent = String(+Number(v).toFixed(Math.min(4, d))); };
  const input = rangeInput({ min, max, step, value, title: doc || label });
  input.addEventListener('input', () => { show(input.value); onInput(Number(input.value)); });
  show(value);
  return h('label', { class: 'wb-tp-row', title: doc || '' }, h('span', { class: 'wb-tp-label' }, label), input, out);
}

const stepOf = p => p.step || Math.abs(p.max - p.min) / 100 || 0.01;

export function openToolParams(app, x, y) {
  open?.close();
  const pop = h('div', { class: 'wb-cp-pop wb-tp' });
  const rows = [];
  let title = '', code = null;
  const sel = app.selectedElements().filter(e => BRUSHES[e.realize?.brush]);

  if (app.tool === 'sculpt') {
    const s = app.sculpt, t = SCULPTS[s.tool];
    const vals = sculptParams(s.tool, s.params[s.tool]);
    title = `Sculpt · ${t.label}`;
    code = () => app.openCode?.('sculpt', s.tool);
    rows.push(
      slider({ label: 'Radius', min: 4, max: 400, step: 1, value: Math.round(s.radius), doc: 'Brush radius in screen pixels ([ and ])', onInput: v => app.setSculpt({ radius: v }) }),
      slider({ label: 'Strength', min: 0.02, max: 1, step: 0.01, value: s.strength, doc: 'Shift+[ and Shift+]', onInput: v => app.setSculpt({ strength: v }) }),
      ...t.params.map(p => slider({ label: p.label, min: p.min, max: p.max, step: stepOf(p), value: vals[p.key], doc: p.doc, onInput: v => app.setSculpt({ params: { [p.key]: v } }) })));
  } else if (sel.length) {
    const id = sel[0].realize.brush, b = BRUSHES[id];
    const ids = sel.filter(e => e.realize.brush === id).map(e => e.id);
    const vals = resolveParams(id, sel[0].realize.params);
    title = `${b.label} · ${ids.length} mark${ids.length === 1 ? '' : 's'}`;
    code = () => app.openCode?.('brush', id);
    let before = null, timer = 0;
    rows.push(...b.params.map(p => slider({ label: p.label, min: p.min, max: p.max, step: stepOf(p), value: vals[p.key], doc: p.doc, onInput: v => {
      before ??= JSON.stringify(app.store.doc);
      for (const e of app.store.doc.elements) if (ids.includes(e.id)) e.realize.params = { ...(e.realize.params || {}), [p.key]: v };
      app.canvas.invalidate();
      clearTimeout(timer);
      timer = setTimeout(() => { const bf = before; before = null; app.store.commitFrom(bf, 'brush param'); }, 350);
    } })));
  } else if (app.defaults && ['point', 'line', 'plane', 'gesture', 'guide', 'brush'].includes(app.tool)) {
    const d = app.defaults(app.tool), id = d.realize.brush, b = BRUSHES[id];
    const vals = resolveParams(id, d.realize.params);
    title = app.tool === 'brush' ? `Brush · ${b?.label || id}` : `New ${app.tool} · ${b?.label || id}`;
    code = () => app.openCode?.('brush', id);
    rows.push(...(b?.params || []).map(p => slider({ label: p.label, min: p.min, max: p.max, step: stepOf(p), value: vals[p.key], doc: p.doc, onInput: v => app.setDefaults(app.tool, { realize: { params: { [p.key]: v } } }) })));
  }
  // Drawing tools: the lazy pen (an editor setting; it changes how strokes are drawn, not the marks).
  if (['line', 'plane', 'gesture', 'brush'].includes(app.tool) && app.lazy) {
    rows.push(h('div', { class: 'wb-tp-sub' }, 'Drawing'),
      slider({ label: 'Lazy', min: 0, max: 120, step: 1, value: app.lazy.radius, doc: 'The pen trails the cursor on a string this long (screen px); 0 = off', onInput: v => app.setLazy({ radius: v }) }),
      slider({ label: 'Smoothing', min: 0, max: 0.95, step: 0.01, value: app.lazy.smoothing, doc: 'Eases the pen further (0 = off)', onInput: v => app.setLazy({ smoothing: v }) }),
      slider({ label: 'Simplify', min: 0, max: 40, step: 0.5, value: app.lazy.simplify || 0, doc: 'On release, points the line does not need are dropped: how far (screen px) the shape may move. 0 = off', onInput: v => app.setLazy({ simplify: v }) }));
  }
  if (!rows.length) rows.push(h('div', { class: 'wb-muted wb-small' }, 'No parameters for this tool: select marks, or pick a drawing or sculpt tool.'));

  pop.append(
    h('div', { class: 'wb-tp-head' }, h('span', {}, title || 'Parameters'), code ? h('button', { class: 'wb-icon-btn', title: 'The same params in code', html: icon('script'), onclick: () => { close(); code(); } }) : null),
    ...rows);
  document.body.append(pop);
  const r = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`;
  pop.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;

  const outside = e => { if (!pop.contains(e.target)) close(); };
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const close = () => { pop.remove(); window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', esc, true); open = null; };
  setTimeout(() => { window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', esc, true); });
  open = { close };
}

/** Right-click the grid button: the grid and the drawing settings, where you are. */
export function openGridParams(app, x, y) {
  open?.close();
  const pop = h('div', { class: 'wb-cp-pop wb-tp' });
  const g = app.canvas.grid;
  const seg = (options, value, onPick) => {
    const wrap = h('div', { class: 'wb-seg wb-tp-seg' });
    const draw = v => wrap.replaceChildren(...options.map(([id, label]) => h('button', { class: id === v ? 'on' : '', onclick: () => { onPick(id); draw(id); } }, label)));
    draw(value);
    return wrap;
  };
  const line = (label, control, doc) => h('label', { class: 'wb-tp-row wb-tp-row2', title: doc || '' }, h('span', { class: 'wb-tp-label' }, label), control);
  const snap = h('input', { type: 'checkbox', checked: Boolean(g.snap), onchange: e => app.canvas.setGrid({ snap: e.target.checked }) });
  pop.append(
    h('div', { class: 'wb-tp-head' }, h('span', {}, 'Grid')),
    line('Show', seg([['off', 'Off'], ['paper', 'Paper'], ['everywhere', 'All']], g.show || 'paper', v => app.canvas.setGrid({ show: v }))),
    line('Style', seg([['lines', 'Lines'], ['dots', 'Dots']], g.style || 'lines', v => app.canvas.setGrid({ style: v }))),
    slider({ label: 'Spacing', min: 5, max: 400, step: 5, value: g.spacing, doc: 'Distance between major lines, in artboard units', onInput: v => app.canvas.setGrid({ spacing: v }) }),
    slider({ label: 'Divisions', min: 1, max: 10, step: 1, value: g.subdivisions, doc: 'Minor lines between the major ones', onInput: v => app.canvas.setGrid({ subdivisions: v }) }),
    line('Snap', snap, 'Marks snap to the grid (Shift+Tab); Ctrl snaps while drawing, moving and scaling'),
    line('Snap to', seg([['points', 'Grid'], ['increments', 'Steps'], ['objects', 'Objects']], ['increments', 'objects'].includes(g.snapMode) ? g.snapMode : 'points', v => app.canvas.setGrid({ snapMode: v })), 'Grid: the grabbed point (or the dragged edge) lands on a grid point. Steps: moves in whole grid steps from where it started. Objects: the grabbed (or drawn) point lands on the nearest point of another mark'),
    h('div', { class: 'wb-tp-sub' }, 'Drawing'),
    slider({ label: 'Lazy', min: 0, max: 120, step: 1, value: app.lazy.radius, doc: 'The pen trails the cursor on a string this long (screen px). Small wobbles inside it never reach the line; corners get rounded. 0 = off', onInput: v => app.setLazy({ radius: v }) }),
    slider({ label: 'Smoothing', min: 0, max: 0.95, step: 0.01, value: app.lazy.smoothing, doc: 'Each step the pen covers only part of the way to where it is pulled (0.5 = half). Higher is smoother and lags more. 0 = off', onInput: v => app.setLazy({ smoothing: v }) }),
    slider({ label: 'Simplify', min: 0, max: 40, step: 0.5, value: app.lazy.simplify || 0, doc: 'On release, points the line does not need are dropped: how far (screen px) the shape may move. Higher = fewer points, looser shape. 0 = off', onInput: v => app.setLazy({ simplify: v }) }));
  document.body.append(pop);
  const r = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`;
  pop.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;
  const outside = e => { if (!pop.contains(e.target)) close(); };
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const close = () => { pop.remove(); window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', esc, true); open = null; };
  setTimeout(() => { window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', esc, true); });
  open = { close };
}

/**
 * Right-click a drawing tool's button: what its new marks will be (brush and its settings, opacity,
 * blend, path). The same defaults as Properties; they stay until changed.
 */
export function openToolDefaults(app, tool, x, y) {
  open?.close();
  const pop = h('div', { class: 'wb-cp-pop wb-tp' });
  const line = (label, control, doc) => h('label', { class: 'wb-tp-row wb-tp-row2', title: doc || '' }, h('span', { class: 'wb-tp-label' }, label), control);
  const seg = (options, value, onPick) => {
    const wrap = h('div', { class: 'wb-seg wb-tp-seg' });
    const draw = v => wrap.replaceChildren(...options.map(([id, label]) => h('button', { class: id === v ? 'on' : '', onclick: () => { onPick(id); draw(id); } }, label)));
    draw(value);
    return wrap;
  };
  const render = () => {
    const d = app.defaults(tool), id = d.realize.brush, b = BRUSHES[id];
    const vals = resolveParams(id, d.realize.params);
    const brushSel = h('select', { class: 'wb-select', title: 'Brush for new marks' }, ...brushesForRole(tool, app.store.doc).map(x => h('option', { value: x.id, selected: x.id === id }, x.label)));
    brushSel.addEventListener('change', () => { app.setDefaults(tool, { realize: { brush: brushSel.value } }); render(); });
    brushSel.addEventListener('keydown', e => e.stopPropagation());
    pop.replaceChildren(
      h('div', { class: 'wb-tp-head' }, h('span', { class: 'wb-tp-title' }, h('span', { html: brushIcon(id) }), `New ${tool}`), h('button', { class: 'wb-icon-btn', title: 'The brush in code', html: icon('script'), onclick: () => { close(); app.openCode?.('brush', id); } })),
      line('Brush', brushSel),
      ...(b?.params || []).map(p => slider({ label: p.label, min: p.min, max: p.max, step: stepOf(p), value: vals[p.key], doc: p.doc, onInput: v => app.setDefaults(tool, { realize: { params: { [p.key]: v } } }) })),
      h('div', { class: 'wb-tp-sub' }, 'Look'),
      slider({ label: 'Opacity', min: 0, max: 1, step: 0.01, value: d.opacity ?? 1, doc: 'The whole mark’s opacity (on top of the brush’s own)', onInput: v => app.setDefaults(tool, { opacity: v }) }),
      line('Blend', (() => { const s = h('select', { class: 'wb-select' }, ...BLENDS.map(x => h('option', { value: x, selected: x === (d.blend || 'normal') }, x))); s.addEventListener('change', () => app.setDefaults(tool, { blend: s.value })); s.addEventListener('keydown', e => e.stopPropagation()); return s; })(), 'How the mark mixes with what is under it'),
      tool === 'point' ? null : line('Path', seg([['smooth', 'Smooth'], ['straight', 'Straight']], d.path === 'straight' ? 'straight' : 'smooth', v => app.setDefaults(tool, { path: v === 'straight' ? 'straight' : undefined })), 'Smooth: a curve through the points. Straight: segments between them'));
  };
  render();
  document.body.append(pop);
  const r = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`;
  pop.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;
  const outside = e => { if (!pop.contains(e.target)) close(); };
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const close = () => { pop.remove(); window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', esc, true); open = null; };
  setTimeout(() => { window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', esc, true); });
  open = { close };
}
