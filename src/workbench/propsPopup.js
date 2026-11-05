/**
 * Properties at the pointer: the whole Properties panel, compact, in a small window where you are working
 * (Opt+right-click anywhere on the canvas, and the settings of the brush and sculpt tools). It shows what the panel
 * shows: the selected marks, else the board, else the tool's defaults; so the canvas can be worked with no side panel.
 */
import { h } from './ui.js';
import { mountProperties } from './panels/properties.js';

let current = null;

export function openPropertiesPopup(app, x, y) {
  current?.close();
  const body = h('div', { class: 'wb-props-body' });
  const pop = h('div', { class: 'wb-cp-pop wb-props-pop' }, body);
  document.body.append(pop);
  const dispose = mountProperties(body, app, { compact: true });
  const place = () => {
    const r = pop.getBoundingClientRect();
    pop.style.left = `${Math.max(8, Math.min(x, window.innerWidth - r.width - 8))}px`;
    pop.style.top = `${Math.max(8, Math.min(y, window.innerHeight - r.height - 8))}px`;
  };
  place();
  // It follows what is selected and grows or shrinks with it: keep it on the screen.
  const watch = new ResizeObserver(place);
  watch.observe(pop);
  const outside = e => { if (!pop.contains(e.target) && !e.target.closest?.('.wb-cp-pop, .wb-menu')) close(); };
  const esc = e => { if (e.key === 'Escape' && !document.querySelector('.wb-menu, .wb-cp-pop:not(.wb-props-pop)')) { e.stopPropagation(); close(); } };
  const close = () => { watch.disconnect(); dispose?.(); pop.remove(); window.removeEventListener('pointerdown', outside, true); window.removeEventListener('keydown', esc, true); if (current?.pop === pop) current = null; };
  setTimeout(() => { window.addEventListener('pointerdown', outside, true); window.addEventListener('keydown', esc, true); });
  current = { close, pop };
  return current;
}
