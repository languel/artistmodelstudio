/**
 * Boards: the drawing's artboards in order, like a slide sorter. Click to go to one; double-click
 * to rename; the dot marks the board models learn from. The blackboard (outside the boards) is
 * listed last with its marks.
 */
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { boardsOf, marksOf, BLACKBOARD, MAIN } from '../../process/boards.js';

export function mountBoards(el, app) {
  const render = () => {
    const doc = app.store.doc;
    const boards = boardsOf(doc);
    const train = doc.train || MAIN;
    el.replaceChildren();
    const list = h('div', { class: 'wb-list' });
    boards.forEach((b, i) => {
      const active = app.activeBoard === b.id;
      const name = h('span', { class: 'wb-stage-name', title: 'Double-click to rename' }, `${i + 1}. ${b.title}`);
      name.addEventListener('dblclick', () => app.renameBoard(b.id));
      list.append(h('div', { class: `wb-stage${active ? ' active' : ''}`, 'data-guide': `board:${b.title}`, onclick: e => { if (e.target.closest('button')) return; app.goToBoard(b.id); }, oncontextmenu: e => { e.preventDefault(); app.boardMenu(b.id, e.clientX, e.clientY); } },
        h('button', { class: `wb-icon-btn wb-train${train === b.id ? ' on' : ''}`, title: train === b.id ? 'Models learn from this board' : 'Train on this board', html: '<svg viewBox="0 0 24 24" width="12" height="12"><circle cx="12" cy="12" r="5" fill="currentColor"/></svg>', onclick: () => app.store.setTrainBoard(b.id) }),
        name,
        h('span', { class: 'wb-muted', title: `${b.width}×${b.height}` }, String(marksOf(doc, b.id).length)),
        b.main ? h('span', { class: 'wb-kind' }, 'main') : h('span', {}),
        !b.main ? h('button', { class: 'wb-icon-btn', title: 'Earlier', html: icon('up'), onclick: () => app.store.moveBoard(b.id, -1) }) : null,
        !b.main ? h('button', { class: 'wb-icon-btn', title: 'Later', html: icon('down'), onclick: () => app.store.moveBoard(b.id, 1) }) : null,
        h('button', { class: 'wb-icon-btn', title: 'More', html: icon('menu'), onclick: e => app.boardMenu(b.id, e.clientX, e.clientY) })));
    });
    const scratch = marksOf(doc, BLACKBOARD).length;
    list.append(h('div', { class: 'wb-stage wb-blackboard', title: 'Marks outside the boards: kept, but in no board’s picture' },
      h('span', { class: 'wb-icon-btn' }), h('span', { class: 'wb-stage-name wb-muted' }, 'Blackboard'), h('span', { class: 'wb-muted' }, String(scratch)), h('span', {})));
    el.append(list, h('div', { class: 'wb-row wb-row-actions' },
      h('button', { class: 'wb-btn', html: `${icon('plus')}<span>Board</span>`, title: 'A new board, right of the others (or drag one out with the Board tool, Shift+O)', onclick: () => { const b = app.store.addBoard({}); app.goToBoard(b.id); } })));
  };
  app.store.subscribe(render);
  app.on('board', render);
  render();
}
