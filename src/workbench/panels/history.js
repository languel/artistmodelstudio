/**
 * History (after underscores' History panel): every change, newest last. Click to select
 * (Shift for a range, Cmd to toggle), click the eye to preview the drawing as it was, drag the
 * selection onto the Timeline to make clips, restore a state to continue from it.
 * Each change can be played (drawn on the canvas at its own pace) and muted (left out of
 * previews, playback, takes and clips), so a composition can be assembled from the steps.
 * Keys in the list: ↑ ↓ step (and preview), Space plays the selected changes, M mutes them.
 */
import { askConfirm, askText } from '../dialog.js';
import { icon } from '../icons.js';
import { h } from '../ui.js';
import { showMenu } from '../menu.js';
import { createTake, touch, applyDiff } from '../../process/take.js';

const FILTERS = [['all', 'All'], ['you', 'You'], ['agent', 'Agents'], ['draw', 'Marks']];
/** A clock time, always 24-hour hh:mm:ss (fixed width; a 12-hour locale's "PM" wrapped the column). The full date is in the row's title. */
const pad = n => String(n).padStart(2, '0');
const time = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };

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
  app.on('tool', () => { stopPlay(); if (previewing) preview(null); });

  // ---- playing: a change drawn on over its own time, from the drawing as it was before it ----
  let playing = null;   // { ids, i, raf }
  const stopPlay = () => { if (!playing) return; cancelAnimationFrame(playing.raf); playing = null; draw(); };
  /** Play changes in order (the muted ones are skipped): each from the state before it, as it was made. */
  const playSteps = ids => {
    stopPlay();
    const order = H().entries.filter(e => ids.includes(e.id) && !e.muted).map(e => e.id);
    if (!order.length) { app.log(ids.length ? 'Those changes are muted.' : 'Select changes to play.'); return; }
    if (app.player?.take) app.player.close();
    playing = { ids: order, i: 0, raf: 0 };
    const step = () => {
      if (!playing) return;
      const id = playing.ids[playing.i], k = H().indexOf(id), e = H().entries[k];
      if (!e) { stopPlay(); return; }
      const before = H().stateAfter(k - 1), dur = H().durationOf(e), t0 = performance.now();
      previewing = id; selected = new Set([id]); anchor = id; draw();
      const frame = () => {
        if (!playing) return;
        const f = Math.min(1, (performance.now() - t0) / dur);
        app.canvas.previewDoc = applyDiff(before, e.diff, { reveal: f });
        app.canvas.invalidate();
        if (f < 1) { playing.raf = requestAnimationFrame(frame); return; }
        // Next change after a breath, or stay on the last one (the preview stays until you go back).
        if (++playing.i < playing.ids.length) playing.raf = requestAnimationFrame(() => setTimeout(step, 180));
        else { playing = null; draw(); }
      };
      playing.raf = requestAnimationFrame(frame);
    };
    step();
  };
  const toggleMute = ids => {
    if (!ids.length) return;
    const muted = !H().entries.find(e => e.id === ids[0])?.muted;
    H().setMuted(ids, muted);
    if (previewing) { const k = H().indexOf(previewing); app.canvas.previewDoc = H().stateAfter(k); app.canvas.invalidate(); }
  };

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
      h('button', { class: 'wb-icon-btn', title: playing ? 'Stop' : 'Play the selected changes in order, each at its own pace (Space; muted ones are skipped)', disabled: !n && !playing, onclick: () => (playing ? stopPlay() : playSteps([...selected])), html: icon(playing ? 'stop' : 'play') }),
      h('span', { style: { flex: 1 } }),
      h('span', { class: 'wb-muted wb-small' }, n ? `${n} selected` : `${H().entries.length}`),
      h('button', { class: 'wb-btn', disabled: !n, title: 'A new take from the selected changes (or drag them onto the Timeline)', onclick: makeTake }, 'Make take'),
      h('button', { class: 'wb-icon-btn', title: 'Forget the history so far (the drawing is unchanged)', onclick: async () => { if (await askConfirm('Clear the history? The drawing stays as it is.')) { selected.clear(); H().clear(); } }, html: icon('trash') }));
  };

  const draw = () => {
    drawBar();
    const items = visible();
    if (!items.length) { list.replaceChildren(h('div', { class: 'wb-tl-empty' }, 'Changes appear here as you draw.')); return; }
    list.replaceChildren(...items.map(e => {
      const isPlaying = playing?.ids[playing.i] === e.id;
      const row = h('div', { class: `wb-hist-row${selected.has(e.id) ? ' sel' : ''}${previewing === e.id ? ' preview' : ''}${e.by === 'agent' ? ' agent' : ''}${e.muted ? ' muted' : ''}${isPlaying ? ' playing' : ''}`, draggable: 'true', 'data-id': e.id, title: 'Drag onto the Timeline: at the end (⌥⇧ at the playhead, Ctrl/⌘ where you drop it, on the grid)' },
        h('button', { class: 'wb-icon-btn wb-hist-play', title: isPlaying ? 'Stop' : 'Play this change: drawn on the canvas at its own pace, from the drawing as it was before it', onclick: ev => { ev.stopPropagation(); isPlaying ? stopPlay() : playSteps([e.id]); }, html: icon(isPlaying ? 'stop' : 'play') }),
        h('button', { class: `wb-icon-btn wb-hist-mute${e.muted ? ' on' : ''}`, title: e.muted ? 'Muted: left out of previews, playback, takes and the Timeline (click to bring it back)' : 'Mute: leave this change out of previews, playback, takes and the Timeline', onclick: ev => { ev.stopPropagation(); toggleMute(selected.has(e.id) ? [...selected] : [e.id]); }, html: icon(e.muted ? 'mute' : 'volume') }),
        h('span', { class: 'wb-hist-time', title: new Date(e.t).toLocaleString() }, time(e.t)),
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
          { label: 'Play', keys: 'Space', run: () => playSteps([...selected]) },
          { label: e.muted ? 'Unmute' : 'Mute', keys: 'M', run: () => toggleMute([...selected]) },
          { label: 'Restore to here', hint: 'The drawing becomes what it was after this change (Undo goes back)', run: () => restore(e.id) },
          { label: 'Make take from selection', run: makeTake },
          { label: 'Show code', hint: 'The change as a clip', run: () => { makeTake(); setTimeout(() => { const c = app.player.take?.clips[0]; if (c) app.openCode('clip', c); }, 50); } }
        ], ev.clientX, ev.clientY);
      });
      return row;
    }));
    // (new changes scroll into view; stepping and playing keep the place)
    if (items.length !== lastCount) { lastCount = items.length; list.scrollTop = list.scrollHeight; }
  };
  let lastCount = -1;
  // Stepping through at your own pace: ↑ ↓ move (and preview), Space plays, M mutes, Esc goes back to the drawing.
  list.addEventListener('keydown', ev => {
    ev.stopPropagation();
    const items = visible(), ids = items.map(x => x.id);
    if (ev.key === 'Escape') { stopPlay(); if (previewing) preview(null); return; }
    if (ev.key === ' ') { ev.preventDefault(); playing ? stopPlay() : playSteps([...selected]); return; }
    if (ev.key === 'm' || ev.key === 'M') { ev.preventDefault(); toggleMute([...selected]); return; }
    if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
      ev.preventDefault(); stopPlay();
      const cur = ids.indexOf(anchor ?? ids[ids.length - 1]);
      const next = ids[Math.max(0, Math.min(ids.length - 1, (cur < 0 ? ids.length : cur) + (ev.key === 'ArrowDown' ? 1 : -1)))];
      if (!next) return;
      selected = new Set([next]); anchor = next;
      previewing = null; preview(next);   // (preview toggles: from none to this one)
      list.querySelector(`[data-id="${CSS.escape(next)}"]`)?.scrollIntoView({ block: 'nearest' });
    }
  });

  const attach = () => { if (!H()) return setTimeout(attach, 30); H().on(draw); draw(); };
  attach();
}
