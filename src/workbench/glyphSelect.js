/**
 * A choice shown as a glyph (and, where there is room, its name): the button opens a menu of the options, each with its glyph.
 * Compact (the small Properties at the pointer): the glyph alone, the name in the tooltip. An option with no glyph shows its name.
 */
import { h } from './ui.js';
import { showMenu } from './menu.js';

export function glyphSelect(options, value, onChange, { title = '', glyph = () => '', compact = false } = {}) {
  const cur = options.find(([v]) => v === value) || options[0] || [value, String(value)];
  const g = glyph(cur[0]);
  const btn = h('button', { class: `wb-glyph-select${compact ? ' compact' : ''}`, type: 'button', title: title ? `${title}: ${cur[1]}` : cur[1] },
    g ? h('span', { class: 'wb-glyph', html: g }) : null,
    !g || !compact ? h('span', { class: 'wb-glyph-name' }, cur[1]) : null,
    h('span', { class: 'wb-glyph-caret' }, '▾'));
  btn.addEventListener('click', ev => {
    ev.stopPropagation();
    const r = btn.getBoundingClientRect();
    showMenu(options.map(([v, label]) => ({ icon: glyph(v) || undefined, label, active: v === cur[0], run: () => onChange(v) })), r.left, r.bottom + 4);
  });
  return btn;
}
