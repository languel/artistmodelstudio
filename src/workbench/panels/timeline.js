/**
 * Timeline (transport after underscores): record, review and edit takes. Clips are rectangles on
 * tracks: drag to move, drag the right edge to retime, double-click narration or titles to edit,
 * right-click for more. The selected clip's properties are in Properties.
 */
import { h } from '../ui.js';
import { icon } from '../icons.js';
import { duration, summarize, touch, clipId, TRACKS, readingTime } from '../../process/take.js';
import { showMenu } from '../menu.js';

const TRACK_LABEL = { title: 'Titles', say: 'Narration', draw: 'Drawing', action: 'Actions', camera: 'Camera', audio: 'Audio' };
const fmt = ms => { const s = Math.max(0, ms) / 1000, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };

export function mountTimeline(root, app) {
  const P = () => app.player, R = () => app.recorder;
  let pps = 60;             // pixels per second
  let selected = null;
  const bar = h('div', { class: 'wb-tl-bar' });
  const labels = h('div', { class: 'wb-tl-labels' });
  const lanes = h('div', { class: 'wb-tl-lanes', tabIndex: 0 });
  const body = h('div', { class: 'wb-tl-body' }, labels, lanes);
  root.append(h('div', { class: 'wb-tl' }, bar, body));

  const select = c => { selected = c; app.selectedClip = c; app.emit('clip-select', c); drawLanes(); };
  app.selectClip = select;
  const edited = () => { P().changed(); drawLanes(); app.emit('clip-select', selected); };

  // ---- the bar ------------------------------------------------------------------------------
  let takes = [];
  const loadTakes = async () => { takes = (await app.assetStore.all()).filter(a => a.kind === 'take').sort((a, b) => (b.created || 0) - (a.created || 0)); drawBar(); };
  const drawBar = () => {
    const p = P(), take = p?.take, rec = R()?.recording;
    const sel = h('select', { class: 'wb-select wb-tl-take', title: 'Takes (recordings in Assets)' },
      h('option', { value: '' }, take ? `${take.title}${take.assetId ? '' : ' (unsaved)'}` : 'Takes…'),
      ...takes.map(a => h('option', { value: a.id }, `${a.title} · ${fmt(a.meta?.duration || 0)}`)));
    sel.addEventListener('change', async () => { const a = takes.find(x => x.id === sel.value); if (a) openTake(a); sel.blur(); });
    const rate = h('select', { class: 'wb-select', title: 'Playback rate' }, ...[0.5, 1, 2, 4, 8].map(r => h('option', { value: r, selected: r === (p?.rate || 1) }, `${r}×`)));
    rate.addEventListener('change', () => { p.rate = Number(rate.value); rate.blur(); });
    bar.replaceChildren(
      h('button', { class: `wb-icon-btn wb-tl-rec${rec ? ' on' : ''}`, title: rec ? 'Stop recording (the take goes to Assets)' : 'Record: everything that happens becomes a take', html: rec ? '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>', onclick: () => (rec ? R().stop() : R().start()) }),
      h('button', { class: 'wb-icon-btn', title: 'Play / pause (Space in the timeline)', disabled: !take, html: p?.playing ? '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>' : icon('play'), onclick: () => p.toggle() }),
      h('span', { class: 'wb-tl-time' }, take ? `${fmt(p.t)} / ${fmt(p.duration)}` : rec ? 'recording…' : '0:00.0'),
      rate,
      h('button', { class: `wb-icon-btn${p?.loop ? ' on' : ''}`, title: 'Loop', disabled: !take, html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12a6 6 0 016-6h8l-3-3M20 12a6 6 0 01-6 6H6l3 3"/></svg>', onclick: () => { p.loop = !p.loop; drawBar(); } }),
      sel,
      h('button', { class: 'wb-btn', title: 'Add at the playhead', disabled: !take, onclick: e => showMenu(addItems(), e.clientX, e.clientY) }, '+ Add'),
      take?.original
        ? h('button', { class: 'wb-btn', title: 'Back to the take this summary was made from (the summary is discarded unless saved)', onclick: () => { const o = take.original; P().load(o); select(null); fitZoom(); drawBar(); drawLanes(); } }, 'Original')
        : h('button', { class: 'wb-btn', title: 'A short-form summary: narration kept, the drawing brisk, analysis and waiting sped through, a hold at the end', disabled: !take || Boolean(take.summaryOf) || /\(summary\)$/.test(take.title), onclick: makeSummary }, 'Summary'),
      h('button', { class: 'wb-btn', title: 'Make a live walkthrough from this take (steps from narration; the drawing replayed with the guide)', disabled: !take, onclick: () => app.walkthroughs.fromTake(p.take).then(w => app.log(`Walkthrough “${w.title}” is in Docs → Walkthroughs and the palette.`)) }, 'Walkthrough'),
      h('button', { class: 'wb-btn', title: 'Export', disabled: !take, onclick: e => showMenu(exportItems(), e.clientX, e.clientY) }, 'Export'),
      h('button', { class: 'wb-btn', title: 'Save the edited take to Assets', disabled: !take, onclick: saveTake }, 'Save'),
      take ? h('button', { class: 'wb-icon-btn', title: 'Close the take (back to your drawing)', html: icon('close'), onclick: () => { p.close(); select(null); drawBar(); drawLanes(); } }) : null);
  };

  const openTake = a => { const take = JSON.parse(JSON.stringify(a.program)); take.assetId = a.id; P().load(take); select(null); fitZoom(); drawBar(); drawLanes(); };
  app.openTake = async id => { const a = await app.assetStore.get(id); if (!a?.program) throw new Error('No such take'); app.docks.open('timeline'); openTake(a); return a; };

  const saveTake = async () => {
    const take = P().take;
    delete take.original;
    take.duration = duration(take);
    if (take.assetId) await app.assetStore.update(take.assetId, { program: JSON.parse(JSON.stringify(take)), title: take.title, meta: { clips: take.clips.length, duration: take.duration } });
    else await R().saveTake(take);
    app.log(`Saved the take “${take.title}”.`);
    loadTakes();
  };
  // A summary opens unsaved: Save keeps it, Close (or Original) goes back. Summaries are not summarized again.
  const makeSummary = async () => {
    const src = P().take;
    const s = summarize(touch(src));
    s.duration = duration(s);
    s.original = src;
    P().load(s); select(null); fitZoom(); drawBar(); drawLanes();
    app.log(`Summary: ${fmt(s.duration)} from ${fmt(duration(src))} (not saved yet).`);
  };

  const addItems = () => {
    const t = Math.round(P().t);
    const add = clip => { P().take.clips.push({ id: clipId(), fx: {}, ...clip }); edited(); select(P().take.clips[P().take.clips.length - 1]); };
    return [
      { label: 'Title card', run: () => add({ track: 'title', start: t, dur: 2500, text: 'Title', sub: '', fx: { fade: 400 } }) },
      { label: 'Narration', run: () => add({ track: 'say', start: t, dur: readingTime('A line of narration'), text: 'A line of narration' }) },
      { label: 'Camera keyframe (current view)', run: () => add({ track: 'camera', start: t, dur: 800, ...viewNow() }) },
      { label: 'Hold (2 s from here)', hint: 'Push everything after the playhead 2 s later', run: () => { for (const c of P().take.clips) if (c.start >= t) c.start += 2000; edited(); } },
      '-',
      { label: 'Audio file…', hint: 'A sound or voiceover (played in the standalone player)', run: pickAudio }
    ];
  };
  const viewNow = () => {
    const cv = app.canvas, ab = (cv.previewDoc || app.store.doc).artboard;
    const fit = Math.min(cv.w / ab.width, cv.h / ab.height);
    return { cx: (cv.w / 2 - cv.cam.x) / cv.cam.z / ab.width, cy: (cv.h / 2 - cv.cam.y) / cv.cam.z / ab.height, z: cv.cam.z / fit };
  };
  const pickAudio = () => {
    const input = h('input', { type: 'file', accept: 'audio/*' });
    input.addEventListener('change', async () => {
      const f = input.files[0]; if (!f) return;
      const src = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
      const au = new Audio(src); await new Promise(r => { au.onloadedmetadata = r; au.onerror = r; });
      P().take.clips.push({ id: clipId(), track: 'audio', start: Math.round(P().t), dur: Math.round((au.duration || 5) * 1000), src, label: f.name, fx: {} });
      edited();
    });
    input.click();
  };
  const exportItems = () => [
    { label: 'Playable HTML (one file)', hint: 'A standalone player: open it anywhere; window.amsPlayer.seek(ms) drives it frame by frame', run: () => import('../takeExport.js').then(m => m.downloadHTML(P().take)) },
    { label: 'Project (zip)', hint: 'index.html, player.js and take.json, to edit or render elsewhere', run: () => import('../takeExport.js').then(m => m.downloadProject(P().take)) },
    '-',
    { label: 'Video', hint: 'Records in real time at the chosen rate (MP4 where supported, else WebM)', items: [1, 2, 4].map(r => ({ label: `${r}× speed`, run: () => import('../takeExport.js').then(m => m.downloadVideo(P().take, { rate: r, app })) })) },
    '-',
    { label: 'Take (JSON)', run: () => import('../takeExport.js').then(m => m.downloadJSON(P().take)) }
  ];

  // ---- lanes ---------------------------------------------------------------------------------
  const fitZoom = () => { const d = P().duration; const w = lanes.clientWidth || 600; pps = Math.max(2, Math.min(400, (w - 40) / Math.max(1, d / 1000))); };
  const x = ms => (ms / 1000) * pps;
  const drawLanes = () => {
    const p = P(), take = p?.take;
    labels.replaceChildren(h('div', { class: 'wb-tl-rulerlabel' }), ...TRACKS.map(tr => h('div', { class: 'wb-tl-label' }, TRACK_LABEL[tr])));
    if (!take) { lanes.replaceChildren(h('div', { class: 'wb-tl-empty' }, R()?.recording ? 'Recording… stop to review.' : 'Record, or open a take.')); return; }
    const d = p.duration, W = Math.max(lanes.clientWidth, x(d) + 80);
    const ruler = h('div', { class: 'wb-tl-ruler', style: { width: `${W}px` } });
    const step = pps > 80 ? 1 : pps > 25 ? 5 : pps > 8 ? 10 : 30;
    for (let s = 0; s * 1000 <= d + step * 1000; s += step) ruler.append(h('span', { style: { left: `${x(s * 1000)}px` } }, fmt(s * 1000).replace(/\.0$/, '')));
    const rows = TRACKS.map(tr => {
      const row = h('div', { class: 'wb-tl-row', style: { width: `${W}px` } });
      for (const c of take.clips.filter(c => c.track === tr)) row.append(clipEl(c));
      return row;
    });
    const head = h('div', { class: 'wb-tl-playhead', style: { left: `${x(p.t)}px` } });
    lanes.replaceChildren(ruler, ...rows, head);
    // Scrub by clicking or dragging on the ruler or empty lanes.
    const scrub = ev => { const r = lanes.getBoundingClientRect(); p.seek(((ev.clientX - r.left + lanes.scrollLeft) / pps) * 1000); };
    for (const el of [ruler, ...rows]) el.addEventListener('pointerdown', ev => {
      if (ev.target.closest('.wb-tl-clip')) return;
      select(null); scrub(ev);
      const mv = e2 => scrub(e2), up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
  };

  const clipEl = c => {
    const w = Math.max(6, x(c.dur || 0));
    const text = c.track === 'say' || c.track === 'title' ? c.text : c.track === 'draw' ? drawLabel(c) : c.track === 'camera' ? `${Math.round((c.z || 1) * 100)}%` : c.label || c.name || '';
    const el = h('div', { class: `wb-tl-clip t-${c.track}${selected?.id === c.id ? ' sel' : ''}`, style: { left: `${x(c.start)}px`, width: `${w}px` }, title: `${TRACK_LABEL[c.track]} · ${fmt(c.start)} · ${(c.dur / 1000).toFixed(1)} s\n${text}` },
      h('span', { class: 'wb-tl-cliptext' }, text), h('span', { class: 'wb-tl-grip', title: 'Drag to retime' }));
    el.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      ev.stopPropagation(); select(c);
      const grip = ev.target.classList.contains('wb-tl-grip');
      const x0 = ev.clientX, s0 = c.start, d0 = c.dur;
      const mv = e2 => {
        let dt = ((e2.clientX - x0) / pps) * 1000;
        if (!e2.shiftKey) dt = Math.round(dt / 100) * 100;    // 0.1 s steps; Shift is free
        if (grip) c.dur = Math.max(100, Math.round(d0 + dt)); else c.start = Math.max(0, Math.round(s0 + dt));
        el.style.left = `${x(c.start)}px`; el.style.width = `${Math.max(6, x(c.dur))}px`;
      };
      const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); if (c.start !== s0 || c.dur !== d0) edited(); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    el.addEventListener('dblclick', () => { if (c.track === 'say' || c.track === 'title') { const v = prompt(c.track === 'say' ? 'Narration' : 'Title', c.text); if (v !== null) { c.text = v; edited(); } } else P().seek(c.start); });
    el.addEventListener('contextmenu', ev => { ev.preventDefault(); select(c); showMenu(clipMenu(c), ev.clientX, ev.clientY); });
    return el;
  };
  const drawLabel = c => { const d = c.diff || {}; const n = (d.add || []).length, u = (d.update || []).length, r = (d.remove || []).length; return `${c.label || 'change'}${n ? ` +${n}` : ''}${u ? ` ~${u}` : ''}${r ? ` −${r}` : ''}`; };
  const clipMenu = c => [
    { label: 'Go to start', run: () => P().seek(c.start) },
    { label: 'Show code', hint: 'This clip as clip({ … }): edit and apply', run: () => app.openCode?.('clip', c) },
    c.track === 'draw' ? { label: c.fx?.drawOn === false ? 'Reveal gradually' : 'Show at once', run: () => { c.fx = { ...(c.fx || {}), drawOn: c.fx?.drawOn === false }; edited(); } } : null,
    { label: 'Speed', items: [0.25, 0.5, 2, 4].map(k => ({ label: k < 1 ? `${1 / k}× slower` : `${k}× faster`, run: () => { c.dur = Math.max(100, Math.round(c.dur / k)); edited(); } })) },
    { label: 'Duplicate', run: () => { P().take.clips.push({ ...structuredClone(c), id: clipId(), start: c.start + c.dur }); edited(); } },
    '-',
    { label: 'Delete', run: () => deleteClip(c) }
  ];
  const deleteClip = c => { const t = P().take; t.clips = t.clips.filter(x2 => x2 !== c); if (selected === c) select(null); edited(); };
  app.timelineEdited = edited;

  lanes.addEventListener('wheel', ev => { if (!(ev.metaKey || ev.ctrlKey)) return; ev.preventDefault(); pps = Math.max(2, Math.min(600, pps * Math.exp(-ev.deltaY * 0.004))); drawLanes(); }, { passive: false });
  lanes.addEventListener('keydown', ev => {
    ev.stopPropagation();
    if (ev.key === ' ') { ev.preventDefault(); P().toggle(); }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && selected) { ev.preventDefault(); deleteClip(selected); }
  });

  // Keep the playhead and time in step while playing (cheap: move the line, rewrite the time).
  const sync = () => {
    const p = P(); if (!p?.take) return;
    const head = lanes.querySelector('.wb-tl-playhead'); if (head) head.style.left = `${x(p.t)}px`;
    const time = bar.querySelector('.wb-tl-time'); if (time) time.textContent = `${fmt(p.t)} / ${fmt(p.duration)}`;
    const btns = bar.querySelectorAll('.wb-icon-btn'); if (btns[1] && btns[1]._playing !== p.playing) { btns[1]._playing = p.playing; drawBar(); }
    if (p.playing) { const hx = x(p.t); if (hx > lanes.scrollLeft + lanes.clientWidth - 40) lanes.scrollLeft = hx - 60; }
  };
  const attach = () => { if (!P() || !R()) return setTimeout(attach, 30); P().on(sync); drawBar(); drawLanes(); loadTakes(); };
  app.on('recording', () => { drawBar(); drawLanes(); });
  // A finished recording goes to the list; it is reviewed only when opened (the canvas stays yours).
  app.on('take', () => { loadTakes(); drawBar(); drawLanes(); });
  attach();
}
