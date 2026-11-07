/**
 * A choice shown as a glyph (and, where there is room, its name): the button opens a menu of the options, each with its glyph.
 * Compact (the small Properties at the pointer): the glyph alone, the name in the tooltip. An option with no glyph shows its name.
 */
import { h, decorated } from './ui.js';
import { showMenu } from './menu.js';

export function glyphSelect(options, value, onChange, { title = '', glyph = () => '', compact = false, address = null } = {}) {
  let cur = options.find(([v]) => v === value) || options[0] || [value, String(value)];
  const btn = h('button', { class: `wb-glyph-select${compact ? ' compact' : ''}`, type: 'button' });
  const draw = () => {
    const g = glyph(cur[0]);
    btn.title = title ? `${title}: ${cur[1]}` : cur[1];
    btn.replaceChildren(...[
      g ? h('span', { class: 'wb-glyph', html: g }) : null,
      !g || !compact ? h('span', { class: 'wb-glyph-name' }, cur[1]) : null,
      h('span', { class: 'wb-glyph-caret' }, '▾')].filter(Boolean));
  };
  draw();
  btn.addEventListener('click', ev => {
    ev.stopPropagation();
    const r = btn.getBoundingClientRect();
    showMenu(options.map(([v, label]) => ({ icon: glyph(v) || undefined, label, active: v === cur[0], run: () => onChange(v) })), r.left, r.bottom + 4);
  });
  btn._setValue = v => { const o = options.find(([x]) => x === v); if (o && o !== cur) { cur = o; draw(); } };
  return decorated(btn, address, { fallback: value, options: options.map(o => o[0]) });
}
