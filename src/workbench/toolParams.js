/**
 * Opt+right-click: the active tool's parameters as sliders, where the pointer is (the same
 * params the code declares). Sculpt: radius, strength and the tool's params. Select with a
 * selection: the selected marks' brush params. A drawing tool: its brush params for new marks.
 */
import { h } from './ui.js';
import { icon } from './icons.js';
import { rangeInput } from './codeParams.js';
import { SCULPTS, sculptParams } from '../process/sculpt.js';
import { BRUSHES, resolveParams } from '../process/brushes.js';

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
      slider({ label: 'Smoothing', min: 0, max: 0.95, step: 0.01, value: app.lazy.smoothing, doc: 'Eases the pen further (0 = off)', onInput: v => app.setLazy({ smoothing: v }) }));
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
