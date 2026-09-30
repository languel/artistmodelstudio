/**
 * The editor of an effects stack (fx.js): a source's, a board's or a mask's. A row for each effect: its parameters,
 * switch off, move, remove; and one control to add another. Every change gives the whole new list to onChange(list, { final }):
 * while a number is being dragged final is false (a live preview), on release true (an undo step).
 */
import { h, row, numberField } from '../ui.js';
import { icon } from '../icons.js';
import { colorField } from '../colorPicker.js';
import { FX, normalizeFx, normalizeStops } from '../../process/fx.js';

export function fxEditor({ list, onChange, app = null }) {
  const fx = normalizeFx(list);   // (with parameters filled in)
  const box = h('div', { class: 'wb-fx' });
  const emit = (next, final = true) => onChange(next, { final });
  const set = (i, patch, final = true) => { const next = fx.map((e, j) => (j === i ? { ...e, ...patch } : e)); emit(next, final); };
  const btn = (tip, glyph, onclick, on = false) => h('button', { class: `wb-icon-btn${on ? ' on' : ''}`, title: tip, html: icon(glyph), onclick });
  fx.forEach((e, i) => {
    const def = FX[e.type];
    const head = h('div', { class: 'wb-row wb-fx-head' },
      h('span', { class: 'wb-fx-name', title: def.doc }, def.label),
      h('span', { style: { flex: 1 } }),
      btn(e.off ? 'Off: click to apply it' : 'On: click to switch it off', e.off ? 'eyeOff' : 'eye', () => set(i, { off: e.off ? undefined : true })),
      i > 0 ? btn('Earlier', 'up', () => { const n = fx.slice(); [n[i - 1], n[i]] = [n[i], n[i - 1]]; emit(n); }) : null,
      i < fx.length - 1 ? btn('Later', 'down', () => { const n = fx.slice(); [n[i + 1], n[i]] = [n[i], n[i + 1]]; emit(n); }) : null,
      btn('Remove', 'close', () => emit(fx.filter((_, j) => j !== i))));
    const rows = def.params.map(p => row(p.label, numberField({ value: e[p.key], min: p.min, max: p.max, step: p.step, def: p.default, title: p.doc, onChange: (v, { final }) => set(i, { [p.key]: v }, final) })));
    if (def.stops) {
      const stops = normalizeStops(e.stops);
      rows.push(h('div', { class: 'wb-row wb-fx-stops', title: 'Dark to light: the first color is what black becomes, the last what white becomes' },
        ...stops.map(([t, c], k) => colorField(c, v => set(i, { stops: stops.map((s, j) => (j === k ? [s[0], v] : s)) }), { title: `Color ${k + 1}`, fallback: '#808080', app })),
        stops.length < 6 ? btn('Add a color', 'plus', () => { const last = stops[stops.length - 1]; set(i, { stops: [...stops.map(([t, c], k) => [k / stops.length, c]), [1, last[1]]] }); }) : null,
        stops.length > 2 ? btn('Remove the last color', 'close', () => set(i, { stops: stops.slice(0, -1) })) : null));
    }
    box.append(h('div', { class: `wb-fx-item${e.off ? ' off' : ''}` }, head, ...(e.off ? [] : rows)));
  });
  // Adding: a menu of the effects (a glyph and a select, no words on the page).
  const add = h('select', { class: 'wb-select wb-fx-add', title: 'Add an effect' },
    h('option', { value: '' }, '+ effect'),
    ...Object.entries(FX).map(([type, d]) => h('option', { value: type, title: d.doc }, d.label)));
  add.addEventListener('change', () => { if (add.value) { const type = add.value; add.value = ''; emit([...fx, normalizeFx([type])[0]]); } });
  box.append(add);
  return box;
}
