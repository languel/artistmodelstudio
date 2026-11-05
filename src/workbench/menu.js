/**
 * Menus: the main menu and context menus share this. Items: { label, run, keys, hint, items (submenu),
 * disabled } | '-' (separator) | { label } (a heading). Submenus open on hover.
 */
import { h } from './ui.js';

export function showMenu(items, x, y, { up = false } = {}) {   // up: y is the bottom edge, the menu opens above it
  document.querySelectorAll('.wb-menu').forEach(m => m.remove());
  const menus = [];
  const build = (list, px, py, level = 0, parentRect = null) => {
    menus.slice(level).forEach(m => m.remove()); menus.length = level;
    const m = h('div', { class: 'wb-menu', style: { left: `${px}px`, top: `${py}px` } });
    menus.push(m);
    for (const it of list) {
      if (!it) continue;
      if (it === '-') { m.append(h('hr')); continue; }
      if (it.label && !it.run && !it.items) { m.append(h('div', { class: 'wb-menu-label' }, it.label)); continue; }
      const b = h('button', { title: it.hint || '', class: `${it.items ? 'wb-menu-sub' : ''}${it.active ? ' active' : ''}`, disabled: it.disabled || false },
        it.star ? (() => {   // a star at the left that toggles on its own: { on, title, run() → the new state }
          const st = h('span', { class: `wb-menu-icon wb-menu-star${it.star.on ? ' on' : ''}`, title: it.star.title, html: it.star.on ? '★' : '☆' });
          st.addEventListener('click', ev => { ev.stopPropagation(); const now = it.star.run(ev); it.star.on = now; st.classList.toggle('on', now); st.textContent = now ? '★' : '☆'; st.title = now ? 'Unfavorite' : 'Favorite'; });
          return st;
        })() : it.icon ? h('span', { class: 'wb-menu-icon', html: it.icon }) : null, h('span', { class: it.icon ? 'wb-menu-text' : '' }, it.label), it.keys ? h('kbd', {}, it.keys) : it.items ? h('span', { class: 'wb-menu-arrow' }, '›') : null);
      if (it.items) {
        const open = () => { const br = b.getBoundingClientRect(); build(it.items, br.right + 2, br.top - 4, level + 1, br); };
        b.addEventListener('pointerenter', open); b.addEventListener('click', open);
      } else {
        b.addEventListener('pointerenter', () => { menus.slice(level + 1).forEach(x2 => x2.remove()); menus.length = level + 1; });
        b.addEventListener('click', ev => { close(); it.run(ev); });
      }
      m.append(b);
    }
    document.body.append(m);
    let mr = m.getBoundingClientRect();
    if (up && level === 0) { m.style.top = `${Math.max(8, py - mr.height)}px`; mr = m.getBoundingClientRect(); }
    if (mr.bottom > window.innerHeight - 8) m.style.top = `${Math.max(8, window.innerHeight - 8 - mr.height)}px`;
    if (mr.right > window.innerWidth - 8) m.style.left = `${Math.max(8, (parentRect ? parentRect.left : px) - mr.width - 2)}px`;
  };
  const close = () => { menus.forEach(m => m.remove()); window.removeEventListener('pointerdown', off, true); window.removeEventListener('keydown', esc, true); };
  const off = ev => { if (!menus.some(m => m.contains(ev.target))) close(); };
  const esc = ev => { if (ev.key === 'Escape') { ev.stopPropagation(); close(); } };
  build(items, x, y);
  setTimeout(() => { window.addEventListener('pointerdown', off, true); window.addEventListener('keydown', esc, true); });
  return close;
}
