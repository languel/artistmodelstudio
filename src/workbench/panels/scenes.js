/**
 * Scenes: the project's drawings, in order. Click to open one; drag to reorder; Shift+double-click
 * to rename; right-click for more. Each keeps its boards, undo, History and Timeline.
 */
import { h, editable } from '../ui.js';
import { icon } from '../icons.js';
import { showMenu } from '../menu.js';

export function mountScenes(el, app) {
  const S = app.scenes;
  const menu = (s, x, y) => showMenu([
    { label: s.title || 'Untitled' },
    { label: 'Open', run: () => S.switchTo(s.id) },
    { label: 'Duplicate', run: async () => { await S.switchTo(s.id); await S.duplicate(); } },
    S.all.length > 1 ? '-' : null,
    S.all.length > 1 ? { label: 'Delete…', items: [
      { label: 'Save it to Assets first', run: async () => { await S.switchTo(s.id); await app.saveToAssets(); await S.remove(s.id); } },
      { label: `Delete “${s.title || 'Untitled'}”`, run: () => S.remove(s.id) },
      { label: 'Cancel', run: () => {} }
    ] } : null
  ], x, y);

  const render = () => {
    el.replaceChildren();
    const list = h('div', { class: 'wb-list' });
    S.all.forEach((s, i) => {
      const active = s.id === S.list.active;
      const title = editable(h('span', {}, s.title || 'Untitled'), `scene:${s.id}`, () => S.all.find(x => x.id === s.id)?.title || '', v => S.rename(s.id, v));
      const row = h('div', { class: `wb-stage${active ? ' active' : ''}`, draggable: 'true', 'data-guide': `scene:${s.title}`, onclick: e => { if (e.target.closest('button') || e.shiftKey) return; S.switchTo(s.id); }, oncontextmenu: e => { e.preventDefault(); menu(s, e.clientX, e.clientY); } },
        h('span', { class: 'wb-stage-name', title: 'Click to open · Shift+double-click to rename' }, `${i + 1}. `, title),
        h('span', {}),
        h('button', { class: 'wb-icon-btn', title: 'More', html: icon('menu'), onclick: e => menu(s, e.clientX, e.clientY) }));
      row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/ams-scene', s.id); e.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragover', e => {
        if (![...e.dataTransfer.types].includes('text/ams-scene')) return;
        e.preventDefault();
        const r = row.getBoundingClientRect(), below = e.clientY > r.top + r.height / 2;
        row.classList.toggle('drop-above', !below); row.classList.toggle('drop-below', below);
      });
      row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below'));
      row.addEventListener('drop', e => {
        const moving = e.dataTransfer.getData('text/ams-scene'), below = row.classList.contains('drop-below');
        row.classList.remove('drop-above', 'drop-below');
        if (!moving || moving === s.id) return;
        e.preventDefault();
        const others = S.all.filter(x => x.id !== moving).map(x => x.id);
        S.place(moving, others.indexOf(s.id) + (below ? 1 : 0));
      });
      list.append(row);
    });
    el.append(list, h('div', { class: 'wb-row wb-row-actions' },
      h('button', { class: 'wb-btn', html: `${icon('plus')}<span>Scene</span>`, title: 'A new, empty scene (Opt+Cmd+N)', onclick: () => S.create() })));
  };
  S.on(render);
  app.on('scene', render);
  render();
}
