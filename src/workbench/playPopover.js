/**
 * Opt+right-click a mark that plays (or any mark, in the Play tool): its Play controls at the pointer, with
 * its name and links, so a score can be sketched without leaving the picture. The same controls as
 * Properties → Play; they follow the document, so an eyedropper pick shows at once.
 */
import { h } from './ui.js';
import { icon } from './icons.js';
import { playBody, nameRow } from './panels/playSection.js';

let open = null;

export function openPlayPopover(app, x, y, id) {
  open?.close();
  const pop = h('div', { class: 'wb-cp-pop wb-tp wb-play-pop' });
  const mark = () => app.store.doc.elements.find(m => m.id === id);
  const render = () => {
    const e = mark();
    if (!e) { close(); return; }
    const top = pop.scrollTop;
    pop.replaceChildren(
      h('div', { class: 'wb-tp-head' }, h('span', {}, e.label || e.id),
        h('button', { class: 'wb-icon-btn', title: 'Brush settings', html: icon('brush'), onclick: () => { close(); import('./toolParams.js').then(m => { app.canvas.select([id]); m.openToolParams(app, x, y); }); } }),
        h('button', { class: 'wb-icon-btn', title: 'The same as code', html: icon('script'), onclick: () => { close(); app.canvas.select([id]); app.openCode?.('selection'); } })),
      nameRow(app, e), ...playBody(app, e));
    pop.scrollTop = top;
  };
  document.body.append(pop);
  render();
  const r = pop.getBoundingClientRect();
  pop.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`;
  pop.style.top = `${Math.max(8, Math.min(y, window.innerHeight - Math.min(r.height, window.innerHeight - 16) - 8))}px`;
  pop.style.maxHeight = `${window.innerHeight - 16}px`; pop.style.overflow = 'auto';
  const unsub = app.store.subscribe(() => render());
  const outside = e => { if (!pop.contains(e.target) && !e.target.closest?.('.wb-cp-pop, datalist') && !app.canvas.pick) close(); };
  const esc = e => { if (e.key === 'Escape' && !app.canvas.pick) { e.stopPropagation(); close(); } };
  const close = () => { unsub(); pop.remove(); window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', esc, true); open = null; };
  setTimeout(() => { window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', esc, true); });
  open = { close };
}
