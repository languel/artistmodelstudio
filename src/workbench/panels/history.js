/**
 * History (after underscores' History panel): every change, newest last. Click to select
 * (Shift for a range, Cmd to toggle), click the eye to preview the drawing as it was, drag the
 * selection onto the Timeline to make clips, restore a state to continue from it.
 */
import { h } from '../ui.js';
import { showMenu } from '../menu.js';
import { createTake, touch } from '../../process/take.js';

const FILTERS = [['all', 'All'], ['you', 'You'], ['agent', 'Agents'], ['draw', 'Marks']];
const time = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function mountHistory(root, app) {
  const H = () => app.history;
  let selected = new Set(), anchor = null, filter = 'all', previewing = null;
  const bar = h('div', { class: 'wb-row wb-row-actions wb-hist-bar' });
  const list = h('div', { class: 'wb-hist-list', tabIndex: 0 });
  root.append(bar, list);

  const visible = () => H().entries.filter(e =>
    filter === 'all' ? true : filter === 'you' ? e.by !== 'agent' : filter === 'agent' ? e.by === 'agent' : Boolean(e.diff.add || e.diff.update || e.diff.remove));

  const preview = id => {
    if (previewing === id || id === null) { previewing = null; app.canvas.previewDoc = null; app.canvas.invalidate(); draw(); return; }
    if (app.player?.take) app.player.close();
    previewing = id;
    app.canvas.previewDoc = H().stateAfter(H().indexOf(id));
    app.canvas.invalidate();
    draw();
  };
  app.on('tool', () => { if (previewing) preview(null); });

  const restore = id => {
    const i = H().indexOf(id);
    const state = JSON.parse(JSON.stringify(H().stateAfter(i)));
    preview(null);
    app.store.change('restore from history', d => { for (const k of Object.keys(d)) delete d[k]; Object.assign(d, state); });
    app.log(`Restored the drawing as it was after “${H().entries[i]?.label}” (Undo goes back).`);
  };

  const makeTake = () => {
    const ids = [...selected];
    if (!ids.length) return;
    const first = Math.min(...ids.map(id => H().indexOf(id)));
    const baseline = JSON.parse(JSON.stringify(H().stateAfter(first - 1)));
    const take = createTake({ title: `From history ${new Date().toLocaleTimeString()}`, baseline, clips: H().clipsFrom(ids).map((c, i) => ({ id: `hc${Date.now().toString(36)}${i}`, ...c })) });
    app.docks.open('timeline');
    app.player.load(touch(take));
    app.log(`A take from ${ids.length} history entr${ids.length === 1 ? 'y' : 'ies'} (Save keeps it).`);
  };

  const drawBar = () => {
    const n = selected.size;
    const cap = H().capturing;
    bar.replaceChildren(
      h('button', { class: `wb-icon-btn wb-tl-rec${cap ? ' on' : ''}`, title: cap ? 'Capturing every change (click to pause)' : 'Paused: changes are not captured (click to capture)', html: cap ? '<svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/></svg>', onclick: () => H().setCapturing(!cap) }),
      h('div', { class: 'wb-seg' }, ...FILTERS.map(([id, label]) => h('button', { class: filter === id ? 'on' : '', onclick: () => { filter = id; draw(); } }, label))),
      h('span', { style: { flex: 1 } }),
      h('span', { class: 'wb-muted wb-small' }, n ? `${n} selected` : `${H().entries.length}`),
      h('button', { class: 'wb-btn', disabled: !n, title: 'A new take from the selected changes (or drag them onto the Timeline)', onclick: makeTake }, 'Make take'),
      h('button', { class: 'wb-btn', title: 'Forget the history so far (the drawing is unchanged)', onclick: () => { if (confirm('Clear the history? The drawing stays as it is.')) { selected.clear(); H().clear(); } } }, 'Clear'));
  };

  const draw = () => {
    drawBar();
    const items = visible();
    if (!items.length) { list.replaceChildren(h('div', { class: 'wb-tl-empty' }, 'Changes appear here as you draw.')); return; }
    list.replaceChildren(...items.map(e => {
      const row = h('div', { class: `wb-hist-row${selected.has(e.id) ? ' sel' : ''}${previewing === e.id ? ' preview' : ''}${e.by === 'agent' ? ' agent' : ''}`, draggable: 'true', 'data-id': e.id, title: 'Drag onto the Timeline to make clips' },
        h('span', { class: 'wb-hist-time' }, time(e.t)),
        h('span', { class: 'wb-hist-label' }, e.label),
        h('span', { class: 'wb-hist-sum wb-muted' }, e.summary),
        h('span', { class: 'wb-hist-by wb-muted' }, e.by === 'agent' ? 'agent' : ''),
        h('button', { class: 'wb-icon-btn wb-hist-eye', title: previewing === e.id ? 'Back to the drawing' : 'Preview the drawing as it was after this', onclick: ev => { ev.stopPropagation(); preview(e.id); } }, previewing === e.id ? '◉' : '○'));
      row.addEventListener('click', ev => {
        const ids = items.map(x => x.id);
        if (ev.shiftKey && anchor) { const a = ids.indexOf(anchor), b = ids.indexOf(e.id); for (const id of ids.slice(Math.min(a, b), Math.max(a, b) + 1)) selected.add(id); }
        else if (ev.metaKey || ev.ctrlKey) { selected.has(e.id) ? selected.delete(e.id) : selected.add(e.id); anchor = e.id; }
        else { selected = new Set([e.id]); anchor = e.id; }
        draw();
      });
      row.addEventListener('dragstart', ev => {
        if (!selected.has(e.id)) { selected = new Set([e.id]); anchor = e.id; }
        ev.dataTransfer.setData('application/x-ams-history', JSON.stringify([...selected]));
        ev.dataTransfer.effectAllowed = 'copy';
      });
      row.addEventListener('contextmenu', ev => {
        ev.preventDefault();
        if (!selected.has(e.id)) { selected = new Set([e.id]); anchor = e.id; draw(); }
        showMenu([
          { label: previewing === e.id ? 'Back to the drawing' : 'Preview', run: () => preview(e.id) },
          { label: 'Restore to here', hint: 'The drawing becomes what it was after this change (Undo goes back)', run: () => restore(e.id) },
          { label: 'Make take from selection', run: makeTake },
          { label: 'Show code', hint: 'The change as a clip', run: () => { makeTake(); setTimeout(() => { const c = app.player.take?.clips[0]; if (c) app.openCode('clip', c); }, 50); } }
        ], ev.clientX, ev.clientY);
      });
      return row;
    }));
    list.scrollTop = list.scrollHeight;
  };
  list.addEventListener('keydown', ev => { ev.stopPropagation(); if (ev.key === 'Escape' && previewing) preview(null); });

  const attach = () => { if (!H()) return setTimeout(attach, 30); H().on(draw); draw(); };
  attach();
}
