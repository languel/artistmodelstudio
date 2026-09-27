/**
 * Sources: the project's streams (a camera, an image or a video from Assets), by name. Code reads them
 * with source('name') and fit('name'); a board can show one underneath (a reference, not part of the
 * picture) and follow it (its code re-runs on each new frame).
 */
import { h, selectField, editable } from '../ui.js';
import { icon } from '../icons.js';
import { boardById, MAIN } from '../../process/boards.js';
import { runScript } from '../../process/script.js';

const SAMPLING = [['continuous', 'continuous'], ['interval', 'every…'], ['hold', 'hold']];

const redrawCode = name => `// Redraw “${name}” as shapes: each new frame replaces a few (live), while the board follows it.
fit(source('${name}'), { shapes: 120 /* 10..400 */, live: true })
`;

export function mountSources(el, app) {
  const S = app.sources;
  const thumbs = new Map();   // name → canvas
  const activeBoard = () => app.canvas.selectedBoard || app.activeBoard || MAIN;

  const render = async () => {
    const assets = (await app.assetStore.all().catch(() => [])).filter(a => /^(image|video)\//.test(a.blob?.type || '') && !a.program);
    const board = boardById(app.store.doc, activeBoard());
    el.replaceChildren();
    thumbs.clear();
    const list = h('div', { class: 'wb-list' });
    for (const d of S.list) {
      const thumb = h('canvas', { class: `wb-source-thumb${S.paused(d.name) ? ' paused' : ''}`, width: 88, height: 64, title: `${d.kind === 'camera' ? 'Camera' : 'From Assets'}: source('${d.name}')${S.paused(d.name) ? ' · paused: no live board on screen uses it' : ''}` });
      thumbs.set(d.name, thumb);
      const name = editable(h('span', { class: 'wb-source-name', title: `source('${d.name}') · Shift+double-click to rename` }, d.name), `source:${d.name}`, () => d.name, v => S.rename(d.name, v.trim().replace(/\s+/g, '-')));
      const shown = board?.source === d.name;
      const follows = board?.follow && board?.source === d.name;
      list.append(h('div', { class: 'wb-source' },
        thumb,
        h('div', { class: 'wb-source-main' },
          name,
          h('div', { class: 'wb-source-ctl' },
            selectField(SAMPLING, d.sampling, v => { S.update(d.name, { sampling: v }); render(); }, 'Sampling: every frame, every few seconds, or one frame held'),
            d.sampling === 'interval' ? h('input', { class: 'wb-num', type: 'number', min: 0.1, step: 0.5, value: d.interval, title: 'Seconds between samples', onchange: e => S.update(d.name, { interval: Math.max(0.1, Number(e.target.value) || 2) }) }) : '')),
        h('button', { class: `wb-icon-btn${shown ? ' on' : ''}`, title: shown ? `Hide under “${board.title}”` : `Show under “${board?.title}” (a reference, not part of the picture)`, html: icon('eye'), onclick: () => app.setBoardSource(board.id, shown ? null : d.name) }),
        h('button', { class: `wb-icon-btn${follows ? ' on' : ''}`, title: `Redraw “${board?.title}” from ${d.name}: its code becomes a live fit, following the source`, html: icon('redraw'), onclick: () => redraw(board, d.name) }),
        h('button', { class: 'wb-icon-btn', title: 'Remove the source (its asset stays)', html: icon('trash'), onclick: () => { S.remove(d.name); } })));
    }
    if (!S.list.length) list.append(h('div', { class: 'wb-muted wb-small', title: 'Sources are streams code reads by name: source(\'cam\'), fit(\'cam\')' }, '—'));
    const pick = h('select', { class: 'wb-select', title: 'Add an image or video from Assets', onchange: async e => { const id = e.target.value; e.target.value = ''; if (id) await add({ kind: 'asset', assetId: id }); } },
      h('option', { value: '' }, '+ asset…'), ...assets.map(a => h('option', { value: a.id }, a.title)));
    el.append(list, h('div', { class: 'wb-row wb-row-actions' },
      h('button', { class: 'wb-icon-btn', title: 'Add the camera', html: icon('camera'), onclick: () => add({ kind: 'camera' }) }),
      pick));
    paint();
  };

  const add = async spec => {
    try { const name = await S.add(spec); app.log(`Source “${name}”: source('${name}') in code.`); }
    catch (err) { app.log(`Source: ${err.message}`, 'error'); }
    render();
  };

  const redraw = (board, name) => {
    if (!board) return;
    const code = redrawCode(name);
    app.setBoardSource(board.id, name);
    app.store.runBoardCode(board.id, code, runScript);
    app.setBoardFollow(board.id, true);
    app.boardCode?.open(board.id);
  };

  // Previews at a few frames a second (sources sample faster; this is only a glance).
  const paint = () => {
    for (const [name, c] of thumbs) {
      const img = S.view(name);
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, c.width, c.height);
      if (!img?.width) continue;
      const k = Math.max(c.width / img.width, c.height / img.height);
      ctx.drawImage(img, (c.width - img.width * k) / 2, (c.height - img.height * k) / 2, img.width * k, img.height * k);
    }
  };
  const timer = setInterval(() => { if (el.isConnected) paint(); }, 250);
  S.on(name => { if (!name) render(); });
  app.on('board', render);
  app.on('document', reason => { if (/source|follow/.test(reason || '')) render(); });
  app.assetStore.onChange(() => render());
  render();
  return () => clearInterval(timer);
}
