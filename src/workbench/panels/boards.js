/**
 * Boards: the drawing's artboards in order, like a slide sorter. Click to go to one; double-click
 * to rename; the dot marks the board models learn from. The blackboard (outside the boards) is
 * listed last with its marks.
 */
import { h, editInPlace, editable } from '../ui.js';
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
      const title = editable(h('span', { 'data-board-title': b.id }, b.title), `board:${b.id}`, () => boardsOf(app.store.doc).find(x => x.id === b.id)?.title || '', v => app.store.updateBoard(b.id, { title: v }));
      const name = h('span', { class: 'wb-stage-name', title: 'Click to go · Shift+double-click to rename' }, `${i + 1}. `, title);
      name.addEventListener('dblclick', e => { if (!e.shiftKey) app.goToBoard(b.id); });
      const row = h('div', { class: `wb-stage${active ? ' active' : ''}`, 'data-guide': `board:${b.title}`, draggable: b.main ? 'false' : 'true', onclick: e => { if (e.target.closest('button')) return; app.goToBoard(b.id); }, oncontextmenu: e => { e.preventDefault(); app.boardMenu(b.id, e.clientX, e.clientY); } },
        h('button', { class: `wb-icon-btn wb-train${train === b.id ? ' on' : ''}`, title: train === b.id ? 'Models learn from this board' : 'Train on this board', html: '<svg viewBox="0 0 24 24" width="12" height="12"><circle cx="12" cy="12" r="5" fill="currentColor"/></svg>', onclick: () => app.store.setTrainBoard(b.id) }),
        name,
        h('button', { class: `wb-icon-btn${app.isBoardLive(b.id) ? ' on' : ' wb-dim'}`, title: app.isBoardLive(b.id) ? `Running${b.live && !active ? ' (even when you are elsewhere)' : ''}: click to pause (a paused board is baked into a picture)` : 'Paused: click to play', html: icon(app.isBoardLive(b.id) ? 'pause' : 'play'), onclick: () => app.toggleBoardRun(b.id) }),
        h('span', { class: 'wb-muted', title: `${b.width}×${b.height}` }, String(marksOf(doc, b.id).length)),
        b.main ? h('span', { class: 'wb-kind' }, 'main') : h('span', {}),
        !b.main ? h('button', { class: 'wb-icon-btn', title: 'Earlier', html: icon('up'), onclick: () => app.store.moveBoard(b.id, -1) }) : null,
        !b.main ? h('button', { class: 'wb-icon-btn', title: 'Later', html: icon('down'), onclick: () => app.store.moveBoard(b.id, 1) }) : null,
        h('button', { class: 'wb-icon-btn', title: 'More', html: icon('menu'), onclick: e => app.boardMenu(b.id, e.clientX, e.clientY) }));
      // Drag a board to reorder (the main board stays first); drop above or below a row.
      row.addEventListener('dragstart', e => { e.dataTransfer.setData('text/ams-board', b.id); e.dataTransfer.effectAllowed = 'move'; });
      row.addEventListener('dragover', e => {
        if (![...e.dataTransfer.types].includes('text/ams-board')) return;
        e.preventDefault();
        const r = row.getBoundingClientRect(), below = b.main || e.clientY > r.top + r.height / 2;
        row.classList.toggle('drop-above', !below); row.classList.toggle('drop-below', below);
      });
      row.addEventListener('dragleave', () => row.classList.remove('drop-above', 'drop-below'));
      row.addEventListener('drop', e => {
        const moving = e.dataTransfer.getData('text/ams-board');
        const below = row.classList.contains('drop-below');
        row.classList.remove('drop-above', 'drop-below');
        if (!moving || moving === b.id) return;
        e.preventDefault();
        const others = doc.boards.filter(x => x.id !== moving).map(x => x.id);
        const at = b.main ? 0 : others.indexOf(b.id) + (below ? 1 : 0);
        app.store.placeBoard(moving, at);
      });
      list.append(row);
    });
    const scratch = marksOf(doc, BLACKBOARD).length;
    list.append(h('div', { class: 'wb-stage wb-blackboard', title: 'Marks outside the boards: kept, but in no board’s picture' },
      h('span', { class: 'wb-icon-btn' }), h('span', { class: 'wb-stage-name wb-muted' }, 'Blackboard'), h('span', { class: 'wb-muted' }, String(scratch)), h('span', {})));
    // The page: an intro before the boards, and the export.
    const intro = h('textarea', { class: 'wb-why', rows: 3, placeholder: 'Page intro (Markdown), before the boards', title: 'Shown at the top of the exported page' });
    intro.value = doc.meta?.intro || '';
    intro.addEventListener('keydown', e => e.stopPropagation());
    intro.addEventListener('change', () => app.store.change('page intro', d => { d.meta = { ...(d.meta || {}), intro: intro.value }; if (!intro.value) delete d.meta.intro; }));
    el.append(list, h('div', { class: 'wb-row wb-row-actions' },
      h('button', { class: 'wb-btn', html: `${icon('plus')}<span>Board</span>`, title: 'A new board, right of the others (or drag one out with the Board tool, Shift+O)', onclick: () => { const b = app.store.addBoard({}); app.goToBoard(b.id); } }),
      h('button', { class: 'wb-icon-btn', title: 'Import a board (or a scene\'s boards, or marks) from a .ams.json file', html: icon('down'), onclick: () => app.importFile() }),
      h('span', { style: { flex: 1 } }),
      h('button', { class: 'wb-icon-btn', title: 'Export the page (HTML): every board with its picture, process, replay and text', html: icon('page'), onclick: () => app.exportAs('page') })),
      intro);
  };
  app.store.subscribe(render);
  app.on('board', render);
  render();
}
