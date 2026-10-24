/**
 * An object field: a name (a label, or an id when the mark has none), an eyedropper that picks a mark
 * on the canvas, and a clear button. For links between marks: a traveler's path, a route's target.
 *
 *   objectField({ app, value, accept, onChange, placeholder, title })
 *
 * `accept(mark)` says which marks can be picked or suggested. The stored value is what was picked (the
 * mark's id, which survives a rename) or what was typed (a name, or an id); the field shows the mark's
 * name either way.
 */
import { h } from './ui.js';

export const nameOf = e => e.label || e.id;

const EYEDROPPER = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 5l5 5M4 20l1-4 9.5-9.5 3 3L8 19z"/><path d="M15 4a2.1 2.1 0 013 3l-1.5 1.5-3-3z"/></svg>';
let seq = 0;

/** The mark a stored value means: by id, else by label. */
export const resolveMark = (doc, value) => (value ? doc.elements.find(e => e.id === value) || doc.elements.find(e => e.label === value) || null : null);

export function objectField({ app, value = '', accept = () => true, onChange, placeholder = 'name or id', title = '' }) {
  const doc = () => app.store.doc;
  const shown = () => { const m = resolveMark(doc(), value); return m ? nameOf(m) : value || ''; };
  const listId = `wb-objs-${++seq}`;
  const input = h('input', { class: 'wb-select wb-obj-input', type: 'text', value: shown(), placeholder, title, list: listId, spellcheck: 'false' });
  const list = h('datalist', { id: listId });
  const refresh = () => { list.replaceChildren(...doc().elements.filter(accept).slice(0, 200).map(e => h('option', { value: nameOf(e) }))); };
  refresh();
  input.addEventListener('focus', refresh);
  input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); });
  input.addEventListener('change', () => {
    const text = input.value.trim();
    const m = resolveMark(doc(), text);
    onChange(m ? m.id : text);
  });
  const drop = h('button', { class: 'wb-icon-btn', type: 'button', title: 'Pick a mark on the canvas (Esc cancels)', html: EYEDROPPER });
  drop.addEventListener('click', () => {
    if (app.canvas.pick) { app.canvas.endPick(); return; }
    drop.classList.add('on');
    app.log?.('Click a mark to pick it (Esc cancels).');
    app.canvas.startPick({ accept, onPick: e => onChange(e.id), onEnd: () => drop.classList.remove('on') });
  });
  const clear = h('button', { class: 'wb-icon-btn', type: 'button', title: 'Clear', html: '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>' });
  clear.addEventListener('click', () => onChange(''));
  return h('span', { class: 'wb-row-inline wb-obj' }, input, list, drop, value ? clear : null);
}
