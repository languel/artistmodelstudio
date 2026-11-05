/**
 * Timeline (transport after underscores): record, review and edit takes. Clips are rectangles on
 * tracks: drag to move, drag the right edge to retime, double-click narration or titles to edit,
 * right-click for more. The selected clip's properties are in Properties.
 */
import { askConfirm, askText } from '../dialog.js';
import { editInPlace, editable, h } from '../ui.js';
import { icon } from '../icons.js';
import { duration, summarize, touch, clipId, TRACKS, TRACK_NAMES, readingTime, createTake, diffDocs, docAt, tracksOf, addTrack, laneOf, precompose, decompose, compLength } from '../../process/take.js';
import { showMenu } from '../menu.js';
import { TimelineUndo } from '../timelineUndo.js';
import { formatMusicalPosition, secondsToFrame } from '../../time/transport.js';
import { RULERS, FPS_CHOICES, QUANT_CHOICES, SNAP_CHOICES, snapStep, timeContext } from '../../time/sceneTransport.js';
import { waveFor, fromPeaks, drawWave } from '../waveform.js';
import { clampPps, zoomAt, fitRange, reveal, centerOn, visibleRange, rulerTicks, autoGrid, gridLayer, timeLabel, editPoints, nextEdit, MAX_CONTENT_PX } from '../../time/timelineView.js';

const AUDIO_CLIP_H = 33;
const TRACK_LABEL = { comp: 'Composition', title: 'Titles', say: 'Narration', draw: 'Drawing', action: 'Actions', camera: 'Camera', audio: 'Audio' };
const fmt = ms => { const s = Math.max(0, ms) / 1000, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
const RULER_NAMES = { time: 'Minutes and seconds', beats: 'Bars, beats and sixteenths', frames: 'Frames' };
/** The clips' colours in the navigator (as the lanes have them). */
const NAV_COLORS = { comp: '#c4b5de', title: '#c9c1b4', say: '#e7d8a8', draw: '#b9c6b0', action: '#9b9a97', camera: '#b3bfd0', audio: '#d0b3c4' };
const ZOOM_IN = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5M10.5 8v5"/></svg>';
const ZOOM_OUT = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5 5M8 10.5h5"/></svg>';
const ZOOM_STEP = 1.5;
/** The ruler's height: a strip for the loop region along its top, the ticks under it. */
const RULER_H = 24;
/** New take: a strip of film with a plus. */
const NEW_TAKE_SVG = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="6" width="12" height="12" rx="1.5"/><path d="M3 9.5h12M3 14.5h12M19 9v6M16 12h6"/></svg>';
const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"${extra}>${d}</svg>`;
/** Insert at the playhead: the playhead, and a plus beside it. */
const INSERT = svg('<path d="M7 4v16"/><path d="M4.5 4h5L7 7z" fill="currentColor"/><path d="M16 8v8M12 12h8"/>');
/** A summary: the take squeezed toward the middle. */
const SUMMARY = svg('<path d="M2.5 12h5M5.5 9l2.5 3-2.5 3M21.5 12h-5M18.5 9L16 12l2.5 3M12 5v14"/>');
/** A walkthrough: a dotted route with a step at its end. */
const WALKTHROUGH = svg('<path d="M4 19c2-6 6-3 8-8s4-6 7-6" stroke-dasharray="1.6 2.6"/><circle cx="19" cy="5" r="2.2" fill="currentColor" stroke="none"/><circle cx="4" cy="19" r="1.6"/>');
/** A track: a lane with a plus. */
const ADD_TRACK = svg('<rect x="3" y="7" width="12" height="10" rx="2"/><path d="M19 9v6M16 12h6"/>');

export function mountTimeline(root, app) {
  const P = () => app.player, R = () => app.recorder;
  const S = () => P().settings;   // the scene's transport: tempo, signature, fps, ruler, loop range
  /** A time (ms) as the ruler reads it. */
  const stamp = ms => {
    const st = S();
    if (st.ruler === 'beats') return formatMusicalPosition(ms / 1000, st.tempo, st.signature);
    if (st.ruler === 'frames') return String(secondsToFrame(ms / 1000, st.fps));
    return fmt(ms);
  };
  const stampOf = (t, total) => (st => (st.ruler === 'time' ? `${fmt(t)} / ${fmt(total)}` : stamp(t)))(S());
  // The view: pps is the zoom (pixels a second); where it starts is the lanes' scrollLeft.
  let pps = 60;
  let pendingLeft = null;   // where the next drawLanes puts the view (after a zoom or a fit)
  let expectLeft = 0;       // the scroll set here last: any other is the user's, and holds back following
  let followHold = false;   // the user moved the view while playing: the playhead does not pull it back
  const views = [];         // earlier views, for X (back)
  let selected = null;
  const bar = h('div', { class: 'wb-tl-bar' });
  const labels = h('div', { class: 'wb-tl-labels' });
  const lanes = h('div', { class: 'wb-tl-lanes', tabIndex: 0 });
  const body = h('div', { class: 'wb-tl-body' }, labels, lanes);
  // The navigator: the whole timeline in a strip, with the view as a window on it.
  const navCanvas = h('canvas', { class: 'wb-tl-nav-c' });
  const navWin = h('div', { class: 'wb-tl-nav-win', title: 'The view: drag to pan, drag an edge to zoom' }, h('div', { class: 'wb-tl-nav-h in' }), h('div', { class: 'wb-tl-nav-h out' }));
  const navHead = h('div', { class: 'wb-tl-nav-head' });
  const nav = h('div', { class: 'wb-tl-nav', title: 'The whole timeline: drag the window to pan, its edges to zoom; press elsewhere to go there; double-click to fit all; the wheel zooms' }, navCanvas, navWin, navHead);
  const navInfo = h('span', { class: 'wb-tl-navinfo', title: 'What the view shows, of the whole timeline' });
  const zoomBtn = (title, html, run) => h('button', { class: 'wb-icon-btn', type: 'button', title, html, onclick: ev => run(ev) });
  const zoomBar = h('div', { class: 'wb-tl-zoom' },
    zoomBtn('Zoom out (− in the timeline; Ctrl/⌘ + wheel zooms at the pointer)', ZOOM_OUT, () => { zoomBy(1 / ZOOM_STEP); lanes.focus({ preventScroll: true }); }),
    zoomBtn('Zoom in (= in the timeline)', ZOOM_IN, () => { zoomBy(ZOOM_STEP); lanes.focus({ preventScroll: true }); }),
    zoomBtn('Fit: all, the loop range, the selected clip… (F frames the selection, \\ fits all)', icon('fit'), ev => showMenu(fitItems(), ev.clientX, ev.clientY)));
  // (the navigator under the tracks, as an editor's zoom bar: it stands in for the scrollbar)
  const tl = h('div', { class: 'wb-tl' }, bar, body, h('div', { class: 'wb-tl-navrow' }, zoomBar, nav, navInfo));
  root.append(tl);

  // Selecting only moves the highlight (rebuilding the lanes would replace a clip mid-drag).
  // Several clips can be picked (Ctrl/⌘-click); `selected` is the one Properties shows.
  let picked = new Set();
  const select = (c, { toggle = false } = {}) => {
    if (toggle && c) {
      if (picked.has(c.id)) picked.delete(c.id); else picked.add(c.id);
      selected = picked.has(c.id) ? c : (P().take?.clips.find(x => picked.has(x.id)) || null);
    } else { picked = new Set(c ? [c.id] : []); selected = c; }
    app.selectedClip = selected;
    for (const el of lanes.querySelectorAll('.wb-tl-clip')) el.classList.toggle('sel', picked.has(el.dataset.id));
    app.emit('clip-select', selected);
  };
  const pickedClips = () => (P().take?.clips || []).filter(c => picked.has(c.id));
  app.selectClip = select;
  const edited = () => { P().changed(); drawLanes(); app.emit('clip-select', selected); commit('edit'); };

  // ---- compositions: open one (its own timeline), and back out ----
  // Inside a composition the Timeline shows a take made of its clips and tracks (the same lists), from
  // the drawing as it is where the composition starts; leaving writes them back.
  let compStack = [];   // [{ holder, clip, t }]: the takes (or compositions) opened from, outermost first
  const writeBack = () => {
    let child = P().take;
    for (let i = compStack.length - 1; i >= 0; i--) {
      const L = compStack[i], c = L.clip, rate = c.rate > 0 ? c.rate : 1;
      c.comp.clips = child.clips; c.comp.tracks = child.tracks;
      const len = compLength(c.comp) / rate;
      if (len > c.dur) c.dur = Math.round(len);   // (it grows to show what was added at its end)
      touch(L.holder); child = L.holder;
    }
    return child;
  };
  /** The take itself (with what was edited inside compositions written back). */
  const rootTake = () => (compStack.length ? writeBack() : P().take);
  app.timelineRoot = rootTake;
  const enterComp = c => {
    const p = P(), holder = p.take;
    if (!holder || !c?.comp) return;
    if (holder.clips !== undefined && !holder.clips.includes(c)) return;
    compStack.push({ holder, clip: c, t: p.t });
    const view = { type: 'ams-take', version: 1, title: c.label || 'Composition', baseline: docAt(holder, c.start), clips: c.comp.clips, tracks: c.comp.tracks || [], inComp: true };
    const local = Math.max(0, (p.t - c.start) * (c.rate > 0 ? c.rate : 1));
    p.load(view); p.seek(local);
    select(null); fitZoom(); drawBar(); drawLanes();
  };
  const exitComp = (all = false) => {
    if (!compStack.length) return;
    writeBack();
    const p = P(), tIn = p.t;
    let L = compStack.pop();
    while (all && compStack.length) L = compStack.pop();
    p.load(L.holder);
    p.seek(all ? L.t : L.clip.start + tIn / (L.clip.rate > 0 ? L.clip.rate : 1));
    select(all ? null : L.clip); fitZoom(); drawBar(); drawLanes();
  };
  /** Out of any composition (before opening, closing or summarizing another take). */
  const leaveComps = () => { if (compStack.length) exitComp(true); };
  const group = () => {
    const holder = P().take, ids = [...picked].filter(id => holder?.clips.some(c => c.id === id));
    if (!ids.length) { app.log('Pick clips to group (Ctrl/⌘-click picks several), then ⌘G.'); return; }
    const n = holder.clips.filter(c => c.track === 'comp').length + 1;
    const comp = precompose(holder, ids, { title: `Comp ${n}` });
    picked = new Set([comp.id]); selected = comp;
    edited(); select(comp);
    app.log(`“${comp.label}”: ${ids.length} clip${ids.length === 1 ? '' : 's'} in a composition (double-click it to open; ⇧⌘G ungroups).`);
  };
  const ungroup = c => {
    if (c?.track !== 'comp') return;
    const out = decompose(P().take, c);
    edited();
    picked = new Set(out.map(x => x.id)); selected = out[0] || null; select(selected); for (const x of out) picked.add(x.id);
    for (const el of lanes.querySelectorAll('.wb-tl-clip')) el.classList.toggle('sel', picked.has(el.dataset.id));
  };
  /** A clip's length set to `ms`: a composition is stretched (its rate changes, so it shows the same), others retimed. */
  const setLength = (c, ms, start = c.start) => {
    ms = Math.max(50, Math.round(ms));
    if (c.track === 'comp') { const shown = c.dur * (c.rate > 0 ? c.rate : 1); c.rate = shown / ms; }
    c.start = Math.max(0, Math.round(start)); c.dur = ms;
  };
  const beatMs = () => { const st = S(); return (60 / st.tempo) * (4 / st.signature.denominator) * 1000; };
  const barMs = () => beatMs() * S().signature.numerator;

  // ---- undo: the take's clips and tracks, and In, Out and the loop region (⌘Z / ⇧⌘Z over the Timeline) ----
  const HEAVY = new Set(['diff', 'src', 'peaks', 'wave', 'baseline']);
  const undo = new TimelineUndo({ key: s => JSON.stringify([s.clips, s.tracks, s.range, s.loop], (k, v) => (HEAVY.has(k) ? undefined : v)) });
  // (a clip copied for undo: a composition's own clips and tracks copied too, at any depth)
  const copyClip = c => ({ ...c, fx: { ...(c.fx || {}) }, ...(c.comp ? { comp: { ...c.comp, tracks: (c.comp.tracks || []).map(x => ({ ...x })), clips: (c.comp.clips || []).map(copyClip) } } : {}) });
  let restoring = false;
  const snap = () => {
    const p = P(), t = p?.take; if (!t) return null;
    // (shallow: a clip's diff, sound and waveform are never edited in place, so they are shared)
    return { clips: t.clips.map(copyClip), tracks: (t.tracks || []).map(x => ({ ...x })), range: { ...p.settings.range }, loop: { ...p.settings.loop } };
  };
  const commit = kind => { if (!restoring) undo.push(snap(), kind); };
  const restoreState = st => {
    const p = P(), t = p.take; if (!t || !st) return;
    restoring = true;
    try {
      t.clips = st.clips.map(copyClip);
      t.tracks = st.tracks.map(x => ({ ...x }));
      const cur = p.settings;
      if (cur.range.start !== st.range.start || cur.range.end !== st.range.end || cur.loop.start !== st.loop.start || cur.loop.end !== st.loop.end) p.setSettings({ range: st.range, loop: st.loop });
      p.changed();
      select(selected && t.clips.find(c => c.id === selected.id) || null);
      drawBar(); drawLanes();
    } finally { restoring = false; }
  };
  const undoTimeline = redo => { const st = redo ? undo.redo() : undo.undo(); if (st) restoreState(st); else app.log(redo ? 'Nothing to redo on the Timeline.' : 'Nothing more to undo on the Timeline (⌘Z over the canvas undoes the drawing).'); };

  // ---- the bar ------------------------------------------------------------------------------
  let takes = [];
  const loadTakes = async () => { takes = (await app.assetStore.all()).filter(a => a.kind === 'take').sort((a, b) => (b.created || 0) - (a.created || 0)); drawBar(); };
  const drawBar = () => {
    const p = P(), take = p?.take, rec = R()?.recording, od = R()?.overdubbing;
    const sel = h('select', { class: 'wb-select wb-tl-take', title: 'Takes (recordings in Assets)' },
      h('option', { value: '' }, (t0 => (t0 ? `${t0.title}${t0.assetId ? '' : ' (unsaved)'}` : 'Takes…'))(compStack.length ? compStack[0].holder : take)),
      ...takes.map(a => h('option', { value: a.id }, `${a.title} · ${fmt(a.meta?.duration || 0)}`)));
    sel.addEventListener('change', async () => { const a = takes.find(x => x.id === sel.value); if (a) openTake(a); sel.blur(); });
    const st = S();
    const ruler = h('select', { class: 'wb-select wb-tl-ruler-mode', title: 'What the ruler shows' }, ...RULERS.map(r => h('option', { value: r, selected: r === st.ruler, title: RULER_NAMES[r] }, { time: 's', beats: '♩', frames: 'f' }[r])));
    ruler.addEventListener('change', () => { p.setSettings({ ruler: ruler.value }); ruler.blur(); });
    const tempo = h('input', { class: 'wb-select wb-tl-tempo', type: 'number', min: 20, max: 400, step: 1, value: st.tempo, title: 'Tempo (beats a minute)' });
    tempo.addEventListener('change', () => p.setSettings({ tempo: Number(tempo.value) }));
    tempo.addEventListener('keydown', ev => ev.stopPropagation());
    const sig = h('select', { class: 'wb-select', title: 'Meter' }, ...['2/4', '3/4', '4/4', '5/4', '6/8', '7/8', '9/8', '12/8'].map(m => h('option', { value: m, selected: m === `${st.signature.numerator}/${st.signature.denominator}` }, m)));
    sig.addEventListener('change', () => { const [numerator, denominator] = sig.value.split('/').map(Number); p.setSettings({ signature: { numerator, denominator } }); sig.blur(); });
    const units = h('input', { class: 'wb-select wb-tl-units', type: 'number', min: 0.01, step: 1, value: st.beatUnits, title: 'Artboard units in one beat: a path this long takes a beat (the default grid\'s minor cell is 25), so a line of four cells is a bar' });
    units.addEventListener('change', () => p.setSettings({ beatUnits: Number(units.value) }));
    units.addEventListener('keydown', ev => ev.stopPropagation());
    const snapSel = h('select', { class: 'wb-select', title: 'The Timeline grid: the playhead, the loop range and clips fall on it (Alt: any time). Auto follows the zoom' }, ...SNAP_CHOICES.map(([v, l]) => h('option', { value: v, selected: v === st.snap }, `⊞ ${l}`)));
    snapSel.addEventListener('change', () => { p.setSettings({ snap: snapSel.value }); snapSel.blur(); });
    const quant = h('select', { class: 'wb-select', title: 'Round how long each path takes to a division (a path can choose its own in Properties)' }, ...QUANT_CHOICES.map(([v, l]) => h('option', { value: v, selected: v === st.quant }, v ? l : 'Free')));
    quant.addEventListener('change', () => { p.setSettings({ quant: quant.value }); quant.blur(); });
    const cell = h('button', { class: 'wb-icon-btn', type: 'button', title: 'A beat is one minor cell of the canvas grid', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h16v16H4zM4 12h16M12 4v16"/></svg>', onclick: () => { const g = app.canvas.grid; p.setSettings({ beatUnits: Math.round((g.spacing / Math.max(1, g.subdivisions)) * 100) / 100 }); } });
    const fps = h('select', { class: 'wb-select', title: 'Frames a second' }, ...FPS_CHOICES.map(f => h('option', { value: f, selected: f === st.fps }, `${f} fps`)));
    fps.addEventListener('change', () => { p.setSettings({ fps: Number(fps.value) }); fps.blur(); });
    const rate = h('select', { class: 'wb-select', title: 'Playback rate' }, ...[0.5, 1, 2, 4, 8].map(r => h('option', { value: r, selected: r === (p?.rate || 1) }, `${r}×`)));
    rate.addEventListener('change', () => { p.rate = Number(rate.value); rate.blur(); });
    bar.replaceChildren(...[
      h('button', { class: `wb-icon-btn wb-tl-rec${rec || od ? ' on' : ''}`, title: rec ? 'Stop recording (the take goes to Assets)' : od ? 'Stop recording (Space too; the take is saved)' : `Record onto the Timeline: the transport plays (${p.loop ? 'round the loop: each pass adds to the last' : p.inOut ? 'from In to Out' : 'from the playhead'}) and each gesture you draw goes on the drawing track where the playhead is`, html: rec || od ? '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="5.5" fill="currentColor"/></svg>', onclick: () => (rec ? R().stop() : od ? R().stopOverdub() : R().startOverdub()), oncontextmenu: ev => { ev.preventDefault(); const poly = R().settings.overdubLanes !== 'tracks'; showMenu([{ label: 'Overlapping gestures' }, { label: 'On one track, as voices (polyphonic)', active: poly, run: () => R().setSettings({ overdubLanes: 'poly' }) }, { label: 'On a track of their own (a track per pass)', active: !poly, run: () => R().setSettings({ overdubLanes: 'tracks' }) }], ev.clientX, ev.clientY); } }),
      h('button', { class: 'wb-icon-btn', title: 'Play / pause (Space in the timeline)', html: p?.playing ? '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>' : icon('play'), onclick: () => p.toggle() }),
      h('span', { class: 'wb-tl-time' }, rec && !take ? `● ${fmt(R().now())}` : stampOf(p.t, p.duration)),
      ruler,
      st.ruler === 'frames' ? fps : tempo,
      st.ruler === 'frames' ? null : sig,
      units, cell, snapSel, quant,
      rate,
      h('button', { class: `wb-icon-btn${p?.loop ? ' on' : ''}`, title: `Loop: ${p.loopRange ? 'round the loop region' : p.inOut ? 'from In to Out (no loop region marked)' : 'the whole take'}. Shift-drag the ruler to mark a loop region; I and O mark In and Out`, html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12a6 6 0 016-6h8l-3-3M20 12a6 6 0 01-6 6H6l3 3"/></svg>', onclick: () => { p.loop = !p.loop; drawBar(); drawLanes(); } }),
      sel,
      compStack.length ? h('button', { class: 'wb-btn wb-tl-crumb', title: 'Inside a composition: back out one level (Esc over the Timeline)', onclick: () => exitComp() }, `‹ ${[compStack[0].holder.title, ...compStack.map(L => L.clip.label || 'Composition')].join(' › ')}`) : null,
      h('button', { class: 'wb-icon-btn', title: 'New take: an empty one, starting from the drawing as it is', disabled: Boolean(rec), onclick: newTake, html: NEW_TAKE_SVG }),
      h('button', { class: 'wb-icon-btn', title: 'Insert at the playhead: a title card, a line of narration, a camera keyframe, a hold, a sound (a take is started if there is none)', disabled: Boolean(rec), onclick: e => showMenu(addItems(), e.clientX, e.clientY), html: INSERT }),
      h('button', { class: 'wb-icon-btn', title: 'Add a track', disabled: Boolean(rec), onclick: e => showMenu(trackItems(), e.clientX, e.clientY), html: ADD_TRACK }),
      take?.original
        ? h('button', { class: 'wb-icon-btn', title: 'Back to the take this summary was made from (the summary is discarded unless saved)', onclick: () => { const o = take.original; P().load(o); select(null); fitZoom(); drawBar(); drawLanes(); }, html: icon('undo') })
        : h('button', { class: 'wb-icon-btn', title: 'Summary: a short cut of this take (narration kept, the drawing brisk, analysis and waiting sped through, a hold at the end)', disabled: !take || Boolean(take.summaryOf) || /\(summary\)$/.test(take.title), onclick: makeSummary, html: SUMMARY }),
      h('button', { class: 'wb-icon-btn', title: 'Walkthrough: a live walkthrough from this take (steps from narration; the drawing replayed with the guide)', disabled: !take, onclick: () => app.walkthroughs.fromTake(p.take).then(w => app.log(`Walkthrough “${w.title}” is in Docs → Walkthroughs and the palette.`)), html: WALKTHROUGH }),
      h('button', { class: 'wb-icon-btn', title: 'Export', disabled: !take, onclick: e => showMenu(exportItems(), e.clientX, e.clientY), html: icon('export') }),
      h('button', { class: 'wb-icon-btn', title: 'Save the edited take to Assets', disabled: !take, onclick: saveTake, html: icon('save') }),
      take ? h('button', { class: 'wb-icon-btn', title: 'Close the take (back to your drawing)', html: icon('close'), onclick: () => { leaveComps(); P().close(); select(null); drawBar(); drawLanes(); } }) : null].filter(Boolean));
  };

  const newTake = async () => {
    leaveComps();
    const p = P(), cur = p.take;
    if (cur && !cur.assetId && cur.clips.length && !(await askConfirm('Start a new take? This one is not saved (the save button keeps it).'))) return;
    p.load(createTake({ title: `Take ${takes.length + 1}`, baseline: JSON.parse(JSON.stringify(app.store.doc)) }));
    select(null); fitZoom(); drawBar(); drawLanes();
    app.log('A new, empty take: drag changes in from History, insert at the playhead, or record.');
  };
  const openTake = a => { leaveComps(); compStack = []; const take = JSON.parse(JSON.stringify(a.program)); take.assetId = a.id; P().load(take); select(null); fitZoom(); drawBar(); drawLanes(); };
  app.openTake = async id => { const a = await app.assetStore.get(id); if (!a?.program) throw new Error('No such take'); app.docks.open('timeline'); openTake(a); return a; };

  const saveTake = async () => {
    const take = rootTake();
    delete take.original;
    take.duration = duration(take);
    if (take.assetId) await app.assetStore.update(take.assetId, { program: JSON.parse(JSON.stringify(take)), title: take.title, meta: { clips: take.clips.length, duration: take.duration } });
    else await R().saveTake(take);
    app.log(`Saved the take “${take.title}”.`);
    loadTakes();
  };
  // A summary opens unsaved: Save keeps it, Close (or Original) goes back. Summaries are not summarized again.
  const makeSummary = async () => {
    leaveComps();
    const src = P().take;
    const s = summarize(touch(src));
    s.duration = duration(s);
    s.original = src;
    P().load(s); select(null); fitZoom(); drawBar(); drawLanes();
    app.log(`Summary: ${fmt(s.duration)} from ${fmt(duration(src))} (not saved yet).`);
  };

  /** The take being edited, started (empty, from the drawing as it is) if there is none. */
  const ensureTake = () => {
    if (!P().take) { P().load(createTake({ title: 'Untitled take', baseline: JSON.parse(JSON.stringify(app.store.doc)) })); fitZoom(); drawBar(); }
    return P().take;
  };
  /** Add a track of a kind (from the bar's button and the track names' menu). */
  const trackItems = () => [{ label: 'Add a track' }, ...TRACKS.map(k => ({ label: TRACK_NAMES[k], run: () => { addTrack(ensureTake(), k); drawLanes(); commit('track'); } }))];
  const addItems = () => {
    const t = Math.round(P().t);
    const add = clip => { const take = ensureTake(); take.clips.push({ id: clipId(), fx: {}, ...clip }); edited(); select(take.clips[take.clips.length - 1]); };
    return [
      { label: `Insert at the playhead (${stamp(t)})` },
      { label: 'Title card', run: () => add({ track: 'title', start: t, dur: 2500, text: 'Title', sub: '', fx: { fade: 400 } }) },
      { label: 'Narration', run: () => add({ track: 'say', start: t, dur: readingTime('A line of narration'), text: 'A line of narration' }) },
      { label: 'Camera keyframe (current view)', run: () => add({ track: 'camera', start: t, dur: 800, ...viewNow() }) },
      { label: 'Hold (2 s from here)', hint: 'Push everything after the playhead 2 s later', disabled: !P().take?.clips.length, run: () => { for (const c of P().take.clips) if (c.start >= t) c.start += 2000; edited(); } },
      '-',
      { label: 'Audio file…', hint: 'A sound or voiceover (played in the standalone player)', run: pickAudio },
      { label: 'Voice the narration', hint: 'Turns the Narration clips into sound on the Audio track, in the narrator voice (Palette: Narration engine)', run: voiceNarration }
    ];
  };
  const viewNow = () => {
    const cv = app.canvas, ab = (cv.previewDoc || app.store.doc).artboard;
    const fit = Math.min(cv.w / ab.width, cv.h / ab.height);
    return { cx: (cv.w / 2 - cv.cam.x) / cv.cam.z / ab.width, cy: (cv.h / 2 - cv.cam.y) / cv.cam.z / ab.height, z: cv.cam.z / fit };
  };
  /** Narration → sound: each Narration clip gets a voice, laid on the Audio track where it starts (again: only lines without one are made). */
  const voiceNarration = async () => {
    const take = ensureTake(), say = take.clips.filter(c => c.track === 'say' && (c.text || '').trim());
    if (!say.length) { app.log('There is no narration on this take to voice: add a Narration clip first.'); return; }
    const have = new Set(take.clips.filter(c => c.narrates).map(c => c.narrates));
    const todo = { ...take, clips: take.clips.filter(c => !have.has(c.id)) };
    try {
      const made = await app.narrator.audioForTake(todo, { onLine: (i, n, t) => app.log(`Voicing ${i + 1} of ${n}: ${t.slice(0, 50)}${t.length > 50 ? '…' : ''}`) });
      for (const m of made) { m.id = clipId(); m.wave = await waveFor(m.src); take.clips.push(m); }
      edited();
      app.log(made.length ? `Voiced ${made.length} line${made.length > 1 ? 's' : ''} (${app.narrator.engine === 'lfm3' ? 'LFM3-Omni' : 'Kokoro'}): they are on the Audio track, and in Assets (Narration).` : 'Every narration line already has its voice.');
    } catch (err) { app.log(`Narration: ${err.message}`, 'error'); }
  };
  app.voiceNarration = voiceNarration;
  const pickAudio = () => {
    const input = h('input', { type: 'file', accept: 'audio/*' });
    input.addEventListener('change', async () => {
      const f = input.files[0]; if (!f) return;
      const src = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(f); });
      const wave = await waveFor(src);
      const au = new Audio(src); await new Promise(r => { au.onloadedmetadata = r; au.onerror = r; });
      ensureTake().clips.push({ id: clipId(), track: 'audio', start: Math.round(P().t), dur: wave?.duration || Math.round((au.duration || 5) * 1000), src, label: f.name, wave, fx: {} });
      edited();
    });
    input.click();
  };
  const exportItems = () => [
    { label: 'Playable HTML (one file)', hint: 'A standalone player: open it anywhere; window.amsPlayer.seek(ms) drives it frame by frame', run: () => import('../takeExport.js').then(m => m.downloadHTML(rootTake())) },
    { label: 'Project (zip)', hint: 'index.html, player.js and take.json, to edit or render elsewhere', run: () => import('../takeExport.js').then(m => m.downloadProject(rootTake())) },
    '-',
    { label: 'Video', hint: 'Records in real time at the chosen rate (MP4 where supported, else WebM)', items: [1, 2, 4].map(r => ({ label: `${r}× speed`, run: () => import('../takeExport.js').then(m => m.downloadVideo(rootTake(), { rate: r, app })) })) },
    '-',
    { label: 'Take (JSON)', run: () => import('../takeExport.js').then(m => m.downloadJSON(rootTake())) }
  ];

  // ---- lanes ---------------------------------------------------------------------------------
  const x = ms => (ms / 1000) * pps;
  const live = () => (!P()?.take && R()?.recording ? R().take : null);
  // ---- the view: zoom, pan, fit ----
  const viewW = () => lanes.clientWidth || 600;
  const current = () => ({ pps, left: lanes.scrollLeft });
  /** The length fit-all shows: the take's (an empty one: half a minute to work in). */
  const span = () => Math.max(1000, P()?.duration || 30000);
  const scrollTo = left => { lanes.scrollLeft = Math.max(0, left); expectLeft = lanes.scrollLeft; };
  /** Keep the view to come back to (X). */
  const remember = () => {
    const v = current(), last = views[views.length - 1];
    if (!last || Math.abs(last.pps - v.pps) > 1e-9 || Math.abs(last.left - v.left) > 1) views.push(v);
    if (views.length > 40) views.shift();
  };
  /** Show a view ({ pps, left }); `keep` remembers the one before it. */
  const setView = (v, keep = false) => {
    if (keep) remember();
    pps = clampPps(v.pps, span()); pendingLeft = Math.max(0, v.left);
    drawLanes();
  };
  // (on opening a take: the next drawLanes shows all of it)
  const fitZoom = () => { const v = fitRange(0, span(), viewW(), { pad: 0.02, durMs: span() }); pps = v.pps; pendingLeft = v.left; };
  const fitAll = (keep = true) => setView(fitRange(0, span(), viewW(), { pad: 0.02, durMs: span() }), keep);
  const fitMs = (lo, hi, pad = 0.06) => setView(fitRange(lo, hi, viewW(), { pad, durMs: span() }), true);
  /** L: In to Out, else the loop region. */
  const fitLoop = () => { const r = P().inOut || P().loopRange; if (r) fitMs(r[0], r[1]); else app.log('Nothing marked: I and O mark In and Out; Shift-drag the ruler marks a loop region.'); };
  const fitLoopRegion = () => { const r = P().loopRange; if (r) fitMs(r[0], r[1]); };
  const fitClip = c => { if (c) fitMs(c.start, c.start + (c.dur || 0), 0.1); };
  /** F: the selected clip, else the loop range, else all of it. */
  const fitSelection = () => (selected ? fitClip(selected) : P().inOut || P().loopRange ? fitLoop() : fitAll());
  /** Show [lo, hi] exactly (the navigator's edges). */
  const showRange = (lo, hi) => { const w = viewW(), next = clampPps(w / Math.max(0.001, (hi - lo) / 1000), span()); setView({ pps: next, left: (lo / 1000) * next }); };
  /** Where zooming holds still: the playhead when it is in view, else the middle. */
  const headAnchor = () => { const hx = x(P().t) - lanes.scrollLeft; return hx >= 0 && hx <= viewW() ? hx : viewW() / 2; };
  const zoomBy = (f, anchorPx = headAnchor()) => setView(zoomAt(current(), f, anchorPx, span()));
  const back = () => { const v = views.pop(); if (v) setView(v); };
  const centreHead = () => { followHold = false; setView(centerOn(current(), P().t, viewW())); };
  /** Seek and keep the playhead in view (keys, edit points). */
  const seekShow = t => {
    const p = P(); p.seek(t); followHold = false;
    if (x(p.t) > laneWidth - 60) drawLanes();
    const v = reveal(current(), p.t, viewW());
    if (Math.abs(v.left - lanes.scrollLeft) > 0.5) scrollTo(v.left);
  };
  const fitItems = () => [
    { label: 'Fit all', keys: '\\', run: () => fitAll() },
    { label: 'Fit In to Out', keys: 'L', disabled: !P().inOut, run: fitLoop },
    { label: 'Fit the loop region', disabled: !P().loopRange, run: fitLoopRegion },
    { label: 'Fit the selected clip', keys: 'F', disabled: !selected, run: () => fitClip(selected) },
    { label: 'Centre on the playhead', keys: '.', run: centreHead },
    '-',
    { label: 'Zoom in', keys: '=', run: () => zoomBy(ZOOM_STEP) },
    { label: 'Zoom out', keys: '−', run: () => zoomBy(1 / ZOOM_STEP) },
    { label: 'Previous view', keys: 'X', disabled: !views.length, run: back },
    '-',
    { label: '← → a frame (beats: a beat), Shift: a second (a bar)' },
    { label: '↑ ↓ the previous and next clip edge' },
    { label: 'I O mark In and Out at the playhead' }
  ].map(it => (it.run ? { ...it, run: () => { it.run(); lanes.focus({ preventScroll: true }); } } : it));
  // The playhead is one element moved by a transform every frame; lanes are rebuilt only when clips change.
  const playhead = h('div', { class: 'wb-tl-playhead' });
  let laneWidth = 0;
  const setHead = ms => { playhead.style.transform = `translateX(${x(ms)}px)`; setNavHead(ms); };
  // Follow in pages: when the playhead nears the right edge, jump so it sits near the left. Not while
  // the user has moved the view away (until the playhead comes back into it, or play starts again).
  const follow = ms => {
    const hx = x(ms), left = lanes.scrollLeft, w = lanes.clientWidth;
    if (followHold) { if (hx >= left && hx <= left + w * 0.9) followHold = false; else return; }
    if (hx > left + w * 0.9 || hx < left) scrollTo(hx - w * 0.2);
  };
  // While a drag is near the left or right edge of the lanes, scroll that way (faster the further out).
  const edgeScroll = tick => {
    let ev = null, raf2 = 0;
    const step = () => {
      raf2 = 0; if (!ev) return;
      const r = lanes.getBoundingClientRect(), m = 28;
      const over = ev.clientX < r.left + m ? ev.clientX - (r.left + m) : ev.clientX > r.right - m ? ev.clientX - (r.right - m) : 0;
      if (!over) return;
      const before = lanes.scrollLeft;
      scrollTo(before + Math.sign(over) * Math.min(48, 3 + Math.abs(over) * 0.6));
      if (lanes.scrollLeft !== before) tick(ev);
      if (!raf2) raf2 = requestAnimationFrame(step);
    };
    return { move: e => { ev = e; if (!raf2) raf2 = requestAnimationFrame(step); }, stop: () => { ev = null; cancelAnimationFrame(raf2); raf2 = 0; } };
  };
  /** The grid's step (s): the bar's choice, or (Auto) a division of the ruler's ticks, so the lines fall on its marks. */
  const gridStep = (st, zoom) => (st.snap === 'auto' ? autoGrid(st, zoom) : snapStep(st, zoom));
  // ---- the ruler and the grid: drawn only near the view (a long film zoomed in is millions of pixels wide) ----
  let rulerEl = null, gridEl = null, rulerSpan = [0, -1];
  const drawRuler = (force = false) => {
    if (!rulerEl) return;
    const w = viewW(), left = lanes.scrollLeft;
    if (!force && left >= rulerSpan[0] && left + w <= rulerSpan[1]) return;
    const a = Math.max(0, left - w), b = Math.min(laneWidth, left + 2 * w);
    rulerSpan = [a, b];
    const st = S(), t0 = a / pps, t1 = b / pps;
    const { step, ticks } = rulerTicks(st, t0, t1, pps);
    const label = t => (st.ruler === 'beats' ? formatMusicalPosition(t, st.tempo, st.signature).replace(/(\.1)?\.1$/, '') : st.ruler === 'frames' ? String(secondsToFrame(t, st.fps)) : timeLabel(t, step));
    rulerEl.replaceChildren(...ticks.map(k => h('span', { class: k.major ? 'major' : 'minor', style: { left: `${k.time * pps}px` } }, k.major ? label(k.time) : '')));
    // The grid's lines over the lanes (each step, and the bars more strongly in the beats ruler).
    if (gridEl) {
      const q = gridStep(st, pps) * pps, barPx = (60 / st.tempo) * (4 / st.signature.denominator) * st.signature.numerator * pps;
      const layers = q >= 4 ? [st.ruler === 'beats' && barPx > q ? gridLayer(barPx, a, 'var(--wb-tl-grid-strong)') : null, gridLayer(q, a, 'var(--wb-tl-grid)')].filter(Boolean) : [];
      Object.assign(gridEl.style, { left: `${a}px`, width: `${b - a}px`, backgroundImage: layers.join(', ') || 'none' });
    }
  };
  // ---- the navigator ----
  let navFrozen = null, navDrawnTotal = 0;
  const navTotal = () => navFrozen ?? Math.max(span(), ((lanes.scrollLeft + viewW()) / pps) * 1000);
  const drawNav = () => {
    const p = P(); if (!p) return;
    const w = nav.clientWidth, hh = nav.clientHeight; if (!w || !hh) return;
    const dpr = window.devicePixelRatio || 1;
    if (navCanvas.width !== Math.round(w * dpr) || navCanvas.height !== Math.round(hh * dpr)) { navCanvas.width = Math.round(w * dpr); navCanvas.height = Math.round(hh * dpr); }
    const g = navCanvas.getContext?.('2d'); if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, hh);
    const total = navDrawnTotal = navTotal(), k = w / total;
    const lr = p.loopRange, io = p.inOut, css = getComputedStyle(nav);
    if (lr) { g.globalAlpha = p.loop ? 0.3 : 0.12; g.fillStyle = css.getPropertyValue('--wb-accent-2').trim() || '#c0563f'; g.fillRect(lr[0] * k, 0, Math.max(1, (lr[1] - lr[0]) * k), hh); g.globalAlpha = 1; }
    if (io) { g.globalAlpha = 0.18; g.fillStyle = css.getPropertyValue('--wb-text').trim() || '#000'; g.fillRect(0, 0, io[0] * k, hh); g.fillRect(io[1] * k, 0, w - io[1] * k, hh); g.globalAlpha = 1; }
    const take = p.take || live();
    if (take) {
      const tracks = tracksOf(take), row = new Map(tracks.map((tr, i) => [tr.id, i]));
      const rh = (hh - 2) / Math.max(1, tracks.length);
      for (const c of take.clips) {
        const i = row.get(laneOf(c)) ?? 0;
        g.fillStyle = NAV_COLORS[c.track] || '#999';
        g.fillRect(c.start * k, 1 + i * rh, Math.max(1, (c.dur || 0) * k), Math.max(1, rh > 3 ? rh - 1 : rh));
      }
    }
    drawNavWin();
    setNavHead(p.t);
  };
  const drawNavWin = () => {
    const w = nav.clientWidth; if (!w) return;
    if (navFrozen == null && Math.abs(navTotal() - navDrawnTotal) > 1) return drawNav();
    const total = navTotal(), k = w / total, [t0, t1] = visibleRange(current(), viewW());
    navWin.style.left = `${t0 * k}px`; navWin.style.width = `${Math.max(14, (t1 - t0) * k)}px`;
    // The view against the whole: where it is, and how much of it.
    const all = span(), shown = Math.min(t1, all) - Math.min(t0, all);
    navInfo.textContent = `${stamp(t0)}–${stamp(Math.min(t1, all))} · ${shown >= all - 1 ? 'all' : `${Math.max(0.1, (shown / all) * 100).toFixed(shown / all < 0.1 ? 1 : 0)}%`} of ${stamp(all)}`;
    navWin.classList.toggle('all', shown >= all - 1 && t0 <= 1);
  };
  const setNavHead = ms => { const w = nav.clientWidth; if (w) navHead.style.transform = `translateX(${(ms / navTotal()) * w}px)`; };
  nav.addEventListener('pointerdown', ev => {
    if (ev.button !== 0) return;
    ev.preventDefault();
    const r = nav.getBoundingClientRect(), total = navFrozen = navTotal(), k = r.width / total;
    const tAt = e => (e.clientX - r.left) / k;
    const [t0, t1] = visibleRange(current(), viewW());
    const edge = ev.target.closest('.wb-tl-nav-h');
    remember();
    let mv;
    if (edge) {
      // An edge: zoom, the other edge held still.
      const isIn = edge.classList.contains('in');
      mv = e => { const t = Math.max(0, Math.min(total, tAt(e))); if (isIn) showRange(Math.min(t, t1 - 50), t1); else showRange(t0, Math.max(t, t0 + 50)); };
    } else {
      // The window: pan, held where it was pressed; elsewhere: the view jumps there (centred), then pans.
      const inside = navWin.contains(ev.target), grab = inside ? tAt(ev) - t0 : (t1 - t0) / 2;
      mv = e => { followHold = true; scrollTo((Math.max(0, tAt(e) - grab) / 1000) * pps); drawRuler(); drawNavWin(); };
      if (!inside) mv(ev);
    }
    nav.classList.add('dragging');
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); nav.classList.remove('dragging'); navFrozen = null; drawNav(); lanes.focus({ preventScroll: true }); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  });
  nav.addEventListener('dblclick', () => fitAll());
  nav.addEventListener('wheel', ev => {
    ev.preventDefault();
    const d = (ev.deltaMode === 1 ? 16 : 1) * (Math.abs(ev.deltaY) >= Math.abs(ev.deltaX) ? ev.deltaY : ev.deltaX);
    if (ev.shiftKey) { followHold = true; scrollTo(lanes.scrollLeft + d); return; }
    zoomBy(Math.exp(-d * 0.003), viewW() / 2);
  }, { passive: false });
  const drawLanes = () => {
    const p = P(), rec = live(), take = p?.take || rec;
    // No tracks until there is something to put on one (a recording, a drop, an insert) or you add one.
    const tracks = take ? tracksOf(take) : [];
    const addRow = rec ? null : h('div', { class: 'wb-tl-addtrack' }, h('button', { type: 'button', title: 'Add a track', onclick: ev => showMenu(trackItems(), ev.clientX, ev.clientY) }, h('span', { html: ADD_TRACK }), 'Track'));
    labels.replaceChildren(h('div', { class: 'wb-tl-rulerlabel' }), ...tracks.map(tr => trackLabel(tr, take, Boolean(rec))), ...(addRow ? [addRow] : []));
    // (without a take the lanes are empty and the playhead still runs: scores play on it)
    const now = rec ? R().now() : p.t;
    const left0 = pendingLeft ?? lanes.scrollLeft;
    const d = rec ? now : Math.max(p.duration, p.t, p.take ? 30000 : 0), W = Math.round(Math.min(MAX_CONTENT_PX, Math.max(lanes.clientWidth + left0, x(d) + (rec ? lanes.clientWidth : 120))));
    laneWidth = W;
    const st = S();
    // (the ticks in a layer of their own: drawRuler redraws them as the view moves, the ranges' marks stay)
    rulerEl = h('div', { class: 'wb-tl-ticks' });
    const ruler = h('div', { class: 'wb-tl-ruler', style: { width: `${W}px` }, title: 'Press or drag to move the playhead; Shift-drag marks a loop region; I and O mark In and Out; double-click fits all; right-click for more' });
    ruler.append(rulerEl);
    ruler.addEventListener('dblclick', () => fitAll());
    const rows = tracks.map(tr => {
      const row = h('div', { class: `wb-tl-row${tr.muted ? ' muted' : ''}`, 'data-track': tr.id, 'data-kind': tr.kind, style: { width: `${W}px` } });
      // Clips that overlap on a track (gestures played at once) share it as voices, one above another.
      const on = (take?.clips || []).filter(c => laneOf(c) === tr.id).sort((a, b) => a.start - b.start), ends = [], voice = new Map();
      for (const c of on) { let v = ends.findIndex(e => e <= c.start); if (v < 0) { v = ends.length; ends.push(0); } ends[v] = c.start + Math.max(c.dur || 0, 1); voice.set(c, v); }
      const n = Math.max(1, ends.length);
      // (only clips that overlap another are split; the rest keep the full height)
      const overlaps = new Set();
      for (let i = 0, maxEnd = -Infinity; i < on.length; i++) {
        const c = on[i], end = c.start + Math.max(c.dur || 0, 1);
        if (maxEnd > c.start || (on[i + 1] && on[i + 1].start < end)) overlaps.add(c);
        maxEnd = Math.max(maxEnd, end);
      }
      for (const c of on) {
        const el = clipEl(c, Boolean(rec));
        if (n > 1 && overlaps.has(c)) { const hh = 18 / n; el.style.top = `${3 + voice.get(c) * hh}px`; el.style.height = `${Math.max(3, hh - 1)}px`; el.classList.add('voice'); if (hh < 12) el.classList.add('thin'); }
        row.append(el);
      }
      return row;
    });
    playhead.classList.toggle('live', Boolean(rec));
    // Two ranges, kept apart (as in an editor and a sequencer):
    //  - the loop region, a strip along the top of the ruler: coloured while Loop is on, an outline when off.
    //    Shift-drag the ruler for a new one; drag it to move it, an end to change it.
    //  - In and Out, brackets on the ruler with the time outside them dimmed: what plays (to Out), fits (L), and where Home goes.
    // While Loop is on, a band over the lanes shows what goes round (the loop region, else In to Out).
    const lr = p.loopRange, io = p.inOut, wrap = p.loop ? p.wrapRange() : null;
    const span2 = r => ({ left: `${x(r[0])}px`, width: `${Math.max(2, x(r[1] - r[0]))}px` });
    // Drag a range: an end ('in' / 'out') or all of it ('move'), on the grid (Alt: any time).
    const rangeDrag = (key, part) => ev => {
      if (ev.button !== 0 || ev.shiftKey || rec) return;
      ev.stopPropagation(); ev.preventDefault();
      const cur0 = key === 'loop' ? p.loopRange : p.inOut; if (!cur0) return;
      const a0 = snapped(ev);
      const set = e2 => {
        const t = snapped(e2); let [lo, hi] = cur0;
        if (part === 'in') lo = Math.min(t, hi - 20); else if (part === 'out') hi = Math.max(t, lo + 20); else { const dd = Math.max(-lo, t - a0); lo += dd; hi += dd; }
        p.setSettings({ [key]: { start: lo / 1000, end: hi / 1000 } });
      };
      const edge = edgeScroll(set), mv = e2 => { set(e2); edge.move(e2); };
      const up = () => { edge.stop(); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); drawBar(); drawLanes(); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    };
    const loopBar = h('div', { class: `wb-tl-loopbar${p.loop ? ' on' : ''}`, title: `The loop region${p.loop ? '' : ' (Loop is off)'}: drag to move, drag an end to change it (Alt: any time); right-click for more`, style: lr ? span2(lr) : { display: 'none' } },
      h('div', { class: 'wb-tl-loopbar-h in' }), h('div', { class: 'wb-tl-loopbar-h out' }));
    loopBar.addEventListener('pointerdown', ev => { const hd = ev.target.closest('.wb-tl-loopbar-h'); rangeDrag('loop', hd ? (hd.classList.contains('in') ? 'in' : 'out') : 'move')(ev); });
    const ioMarks = io ? ['in', 'out'].map(side => {
      const m = h('div', { class: `wb-tl-io ${side}`, title: side === 'in' ? 'In: drag to move it (Alt: any time); I sets it at the playhead' : 'Out: drag to move it (Alt: any time); O sets it at the playhead', style: { left: `${x(side === 'in' ? io[0] : io[1])}px` } });
      m.addEventListener('pointerdown', rangeDrag('range', side));
      return m;
    }) : [];
    ruler.append(loopBar, ...ioMarks);
    const shades = io ? [h('div', { class: 'wb-tl-ioshade', style: { left: '0px', width: `${x(io[0])}px` } }), h('div', { class: 'wb-tl-ioshade', style: { left: `${x(io[1])}px`, width: `${Math.max(0, W - x(io[1]))}px` } })] : [];
    const band = h('div', { class: 'wb-tl-loop on', style: wrap ? span2(wrap) : { display: 'none' } });
    // Under the tracks, the rest of the panel (beside the Track button): scrubbed like a lane, and where things are dropped.
    const H = RULER_H + rows.length * 24;
    const fill = h('div', { class: 'wb-tl-fill', style: { width: `${W}px`, height: `max(24px, calc(100% - ${H}px))` } });
    // (the band, the grid and the playhead as tall as the lanes, so they scroll with them)
    band.style.height = playhead.style.height = `max(100%, ${H + 24}px)`;
    for (const sh of shades) sh.style.height = band.style.height;
    gridEl = h('div', { class: 'wb-tl-grid', style: { top: `${RULER_H}px`, height: `max(calc(100% - ${RULER_H}px), ${H - RULER_H + 24}px)` } });
    lanes.replaceChildren(ruler, gridEl, ...rows, fill, ...shades, band, playhead);
    if (pendingLeft != null) { lanes.scrollLeft = pendingLeft; pendingLeft = null; }
    expectLeft = lanes.scrollLeft;
    drawRuler(true); drawNav();
    setHead(now);
    if (rec) return;   // read-only until the recording stops
    // Scrub by clicking or dragging on the ruler or empty lanes.
    const at = ev => { const r = lanes.getBoundingClientRect(); return ((ev.clientX - r.left + lanes.scrollLeft) / pps) * 1000; };
    // The grid (the bar's ⊞ select): the playhead, the loop range and clips fall on it; Alt for any time. With the grid off, Ctrl snaps to the ruler's divisions.
    const grid = ev => { const q = gridStep(st, pps) || (ev.ctrlKey ? autoGrid(st, pps) : 0); return ev.altKey ? 0 : q * 1000; };
    const snapMs = (ms, ev) => { const q = grid(ev); return q ? Math.max(0, Math.round(ms / q) * q) : Math.max(0, Math.round(ms)); };
    const scrub = ev => p.seek(snapMs(at(ev), ev));
    const snapped = ev => snapMs(at(ev), ev);
    ruler.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      const io2 = p.inOut, lr2 = p.loopRange;
      showMenu([
        { label: 'Fit all', keys: '\\', run: () => fitAll() },
        { label: 'Fit In to Out', keys: 'L', disabled: !io2, run: fitLoop },
        { label: 'Fit the loop region', disabled: !lr2, run: fitLoopRegion },
        { label: 'Previous view', keys: 'X', disabled: !views.length, run: back },
        '-',
        { label: 'In at the playhead', keys: 'I', run: markIn },
        { label: 'Out at the playhead', keys: 'O', run: markOut },
        { label: 'In and Out around the selected clip', disabled: !selected, run: () => { p.setSettings({ range: { start: selected.start / 1000, end: (selected.start + Math.max(20, selected.dur)) / 1000 } }); drawBar(); } },
        { label: 'Clear In and Out', disabled: !io2, run: () => { p.setSettings({ range: { start: 0, end: 0 } }); drawBar(); } },
        '-',
        { label: 'Loop In to Out', hint: 'The loop region becomes In to Out, and Loop turns on', disabled: !io2, run: () => { p.setSettings({ loop: { start: io2[0] / 1000, end: io2[1] / 1000 } }); p.loop = true; drawBar(); drawLanes(); } },
        { label: 'In and Out to the loop region', disabled: !lr2, run: () => { p.setSettings({ range: { start: lr2[0] / 1000, end: lr2[1] / 1000 } }); drawBar(); } },
        { label: 'Clear the loop region', disabled: !lr2, run: () => { p.setSettings({ loop: { start: 0, end: 0 } }); drawBar(); } }
      ], ev.clientX, ev.clientY);
    });
    // The tracks: drag a box to pick clips (Shift, Ctrl or ⌘: add to what is picked); a click on nothing picks nothing.
    for (const el of [...rows, fill]) el.addEventListener('pointerdown', ev => {
      if (ev.button !== 0 || ev.target.closest('.wb-tl-clip')) return;
      startBox(ev);
    });
    // The ruler: press or drag to move the playhead; Shift-drag marks a loop region.
    ruler.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      if (ev.shiftKey) {
        // Mark a loop region: drag from where you press.
        const a = snapped(ev);
        const show = e2 => { const b = snapped(e2); loopBar.style.display = ''; loopBar.classList.add('on'); loopBar.style.left = `${x(Math.min(a, b))}px`; loopBar.style.width = `${x(Math.abs(b - a))}px`; };
        const edge = edgeScroll(show), mv = e2 => { show(e2); edge.move(e2); };
        const up = e2 => {
          edge.stop(); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
          const b = snapped(e2), lo = Math.min(a, b), hi = Math.max(a, b);
          p.setSettings({ loop: hi - lo >= 20 ? { start: lo / 1000, end: hi / 1000 } : { start: 0, end: 0 } });
          if (hi - lo >= 20 && !p.loop) p.loop = true;
          drawBar(); drawLanes();
        };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
        return;
      }
      // Scrub; held near an edge, the view scrolls on and the playhead goes with it.
      followHold = false;
      scrub(ev);
      const edge = edgeScroll(scrub), mv = e2 => { scrub(e2); edge.move(e2); };
      const up = () => { edge.stop(); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
  };

  /** A box dragged over the tracks picks the clips it touches. */
  const startBox = ev => {
    const add = ev.shiftKey || ev.metaKey || ev.ctrlKey, base = add ? new Set(picked) : new Set();
    const pos = e2 => { const r = lanes.getBoundingClientRect(); return [e2.clientX - r.left + lanes.scrollLeft, e2.clientY - r.top + lanes.scrollTop]; };
    const [ax, ay] = pos(ev);
    const box = h('div', { class: 'wb-tl-marquee' });
    lanes.append(box);
    let moved = false;
    const update = e2 => {
      const [bx, by] = pos(e2);
      if (Math.abs(bx - ax) + Math.abs(by - ay) > 3) moved = true;
      const x0 = Math.min(ax, bx), x1 = Math.max(ax, bx), y0 = Math.min(ay, by), y1 = Math.max(ay, by);
      Object.assign(box.style, { left: `${x0}px`, top: `${y0}px`, width: `${x1 - x0}px`, height: `${y1 - y0}px`, display: moved ? '' : 'none' });
      if (!moved) return;
      const r = lanes.getBoundingClientRect(), now = new Set(base);
      for (const cel of lanes.querySelectorAll('.wb-tl-clip')) {
        const cr = cel.getBoundingClientRect(), cx = cr.left - r.left + lanes.scrollLeft, cy = cr.top - r.top + lanes.scrollTop;
        if (cx < x1 && cx + cr.width > x0 && cy < y1 && cy + cr.height > y0) now.add(cel.dataset.id);
      }
      picked = now;
      for (const cel of lanes.querySelectorAll('.wb-tl-clip')) cel.classList.toggle('sel', picked.has(cel.dataset.id));
    };
    update(ev);
    const edge = edgeScroll(update), mv = e2 => { update(e2); edge.move(e2); };
    const up = () => {
      edge.stop(); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); box.remove();
      if (!moved) { if (!add) select(null); return; }
      selected = (P().take?.clips || []).find(c => picked.has(c.id)) || null; app.selectedClip = selected; app.emit('clip-select', selected);
    };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  /** Copies of clips (new ids; a composition's contents copied too). */
  const cloneClip = c => ({ ...structuredClone(c), id: clipId() });
  /** Shift+D: the picked clips again, just after them. */
  const duplicatePicked = () => {
    const take = P().take, list = pickedClips().length ? pickedClips() : selected ? [selected] : [];
    if (!take || !list.length) return;
    const t0 = Math.min(...list.map(c => c.start)), t1 = Math.max(...list.map(c => c.start + (c.dur || 0)));
    const copies = list.map(c => ({ ...cloneClip(c), start: c.start + (t1 - t0) }));
    take.clips.push(...copies);
    edited();
    picked = new Set(copies.map(c => c.id)); selected = copies[0]; select(copies[0]); for (const c of copies) picked.add(c.id);
    for (const cel of lanes.querySelectorAll('.wb-tl-clip')) cel.classList.toggle('sel', picked.has(cel.dataset.id));
  };

  const trackLabel = (tr, take, readOnly) => {
    const el = h('div', { class: `wb-tl-label${tr.muted ? ' muted' : ''}`, 'data-track-label': tr.id, 'data-kind': tr.kind, title: `${TRACK_NAMES[tr.kind] || tr.kind} track · right-click for more` },
      editable(h('span', { class: 'wb-tl-labeltext' }, tr.name), `track:${tr.id}`, () => tr.name, v => { tr.name = v; drawLanes(); commit('track'); }),
      take && !readOnly ? h('button', { class: 'wb-tl-mute', title: tr.muted ? 'Unmute' : 'Mute (the track does not play)', onclick: ev => { ev.stopPropagation(); tr.muted = !tr.muted; edited(); } }, tr.muted ? '○' : '●') : null);
    if (take && !readOnly) {
      el.addEventListener('dblclick', () => editInPlace(el.querySelector('.wb-tl-labeltext'), v => { tr.name = v; drawLanes(); commit('track'); }));
      el.addEventListener('contextmenu', ev => { ev.preventDefault(); showMenu(trackMenu(tr, take), ev.clientX, ev.clientY); });
    }
    return el;
  };
  const trackMenu = (tr, take) => [
    { label: 'Rename', run: () => { const el = document.querySelector(`[data-track-label="${CSS.escape(tr.id)}"] .wb-tl-labeltext`); if (el) editInPlace(el, v => { tr.name = v; drawLanes(); commit('track'); }); } },
    { label: tr.muted ? 'Unmute' : 'Mute', run: () => { tr.muted = !tr.muted; edited(); } },
    { label: `Add a ${(TRACK_NAMES[tr.kind] || tr.kind).toLowerCase()} track`, run: () => { addTrack(take, tr.kind); drawLanes(); commit('track'); } },
    '-',
    { label: 'Delete track', hint: 'Its clips go too', disabled: tracksOf(take).filter(t => t.kind === tr.kind).length < 2 && take.clips.some(c => laneOf(c) === tr.id), run: () => { take.clips = take.clips.filter(c => laneOf(c) !== tr.id); take.tracks = take.tracks.filter(t => t !== tr); edited(); } }
  ];

  const clipEl = (c, readOnly = false) => {
    const w = Math.max(6, x(c.dur || 0));
    const rate = c.rate > 0 ? c.rate : 1;
    const text = c.track === 'say' || c.track === 'title' ? c.text : c.track === 'draw' ? drawLabel(c) : c.track === 'camera' ? `${Math.round((c.z || 1) * 100)}%` : c.track === 'comp' ? `${c.label || 'Composition'}${Math.abs(rate - 1) > 0.001 ? ` ×${+rate.toFixed(2)}` : ''}` : c.label || c.name || '';
    const el = h('div', { class: `wb-tl-clip t-${c.track}${picked.has(c.id) ? ' sel' : ''}`, 'data-id': c.id, style: { left: `${x(c.start)}px`, width: `${w}px` }, title: `${TRACK_LABEL[c.track]} · ${fmt(c.start)} · ${(c.dur / 1000).toFixed(1)} s\n${text}${c.track === 'comp' ? '\nDouble-click to open; drag the right edge to stretch it (Alt: trim)' : ''}` },
      h('span', { class: 'wb-tl-cliptext' }, text), h('span', { class: 'wb-tl-grip', title: c.track === 'comp' ? 'Drag to stretch (Alt: trim)' : 'Drag to retime' }));
    // A composition shows its clips small inside it, at its rate.
    if (c.track === 'comp' && c.comp?.clips?.length) {
      for (const k of c.comp.clips.slice(0, 300)) {
        if (k.start >= c.dur * rate) continue;
        el.append(h('span', { class: `wb-tl-compbit t-${k.track}`, style: { left: `${x(k.start / rate)}px`, width: `${Math.max(2, x((k.dur || 0) / rate))}px` } }));
      }
    }
    if (c.track === 'audio') {
      // The waveform: real min/max slices, drawn for the width the clip has now (a rough one from the old peaks shows until the sound is decoded).
      const cv = h('canvas', { class: 'wb-tl-wave' });
      el.prepend(cv);
      const paint = wave => { if (wave && cv.isConnected !== false) drawWave(cv, wave, { from: 0, to: (c.dur || wave.duration) / 1000, width: w - 2, height: AUDIO_CLIP_H - 2 }); };
      paint(c.wave || fromPeaks(c.peaks, c.dur));
      if (!c.wave && c.src) waveFor(c.src).then(wave => { if (wave) { c.wave = wave; paint(wave); } });
    }
    if (readOnly) return el;
    el.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      ev.stopPropagation();
      // Shift, Ctrl or ⌘-click picks several (no drag); a picked clip drags the others with it.
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey) { select(c, { toggle: true }); return; }
      if (!picked.has(c.id)) select(c); else { selected = c; app.selectedClip = c; app.emit('clip-select', c); }
      const grip = ev.target.classList.contains('wb-tl-grip');
      // Alt-drag: copies stay where the clips were, and the clips move (a click without a drag copies nothing).
      const dup = ev.altKey && !grip ? pickedClips().map(o => {
        const k = cloneClip(o), oel = lanes.querySelector(`.wb-tl-clip[data-id="${CSS.escape(o.id)}"]`);
        P().take.clips.push(k);
        if (oel) { const kel = clipEl(k); kel.classList.remove('sel'); kel.style.top = oel.style.top; kel.style.height = oel.style.height; oel.parentElement.insertBefore(kel, oel); }
        return k;
      }) : null;
      const x0 = ev.clientX, sl0 = lanes.scrollLeft, s0 = c.start, d0 = c.dur, r0 = c.rate > 0 ? c.rate : 1;
      const others = grip ? [] : pickedClips().filter(o => o !== c).map(o => ({ o, s: o.start, el: lanes.querySelector(`.wb-tl-clip[data-id="${CSS.escape(o.id)}"]`) }));
      const place = e2 => {
        const dt = ((e2.clientX - x0 + lanes.scrollLeft - sl0) / pps) * 1000;
        // On the grid (Alt or Shift: free; for a composition's edge only Shift, Alt trims): the start, or the end when the right edge is dragged.
        const comp = c.track === 'comp', free = e2.shiftKey || (!comp && !dup && e2.altKey), q = free ? 0 : gridStep(S(), pps) * 1000;
        const on = v => (q ? Math.round(v / q) * q : v);
        if (grip) {
          c.dur = Math.max(q || 100, Math.round(on(s0 + d0 + dt) - s0));
          if (comp && !e2.altKey) c.rate = (d0 * r0) / c.dur;   // stretched: it shows the same, faster or slower
          else if (comp) c.rate = r0;
        } else c.start = Math.max(0, Math.round(on(s0 + dt)));
        const moved = c.start - s0;
        for (const k of others) { k.o.start = Math.max(0, Math.round(k.s + moved)); if (k.el) k.el.style.left = `${x(k.o.start)}px`; }
        el.style.left = `${x(c.start)}px`; el.style.width = `${Math.max(6, x(c.dur))}px`;
      };
      const edge = edgeScroll(place), mv = e2 => { place(e2); edge.move(e2); };
      const lane0 = laneOf(c);
      let lane = lane0;
      const mvLane = e2 => {
        if (grip) return;
        const row = document.elementFromPoint(e2.clientX, e2.clientY)?.closest?.('.wb-tl-row');
        if (row && row.dataset.kind === c.track && row.dataset.track !== lane) { lane = row.dataset.track; row.append(el); }
      };
      window.addEventListener('pointermove', mvLane);
      const up = () => {
        edge.stop(); window.removeEventListener('pointermove', mv); window.removeEventListener('pointermove', mvLane); window.removeEventListener('pointerup', up);
        if (lane !== lane0) c.lane = lane;
        const changed = c.start !== s0 || c.dur !== d0 || lane !== lane0;
        if (dup && !changed) { const gone = new Set(dup); P().take.clips = P().take.clips.filter(k => !gone.has(k)); drawLanes(); return; }
        if (!changed && !grip && picked.size > 1) { select(c); return; }   // (a click on one of several picked: just that one)
        if (changed) { edited(); if (c.track === 'comp' && grip) drawLanes(); }
      };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    el.addEventListener('dblclick', async () => { if (c.track === 'comp') { enterComp(c); return; } if (c.track === 'say' || c.track === 'title') { const v = await askText(c.track === 'say' ? 'Narration' : 'Title', c.text); if (v !== null) { c.text = v; edited(); } } else P().seek(c.start); });
    el.addEventListener('contextmenu', ev => { ev.preventDefault(); if (!picked.has(c.id)) select(c); showMenu(clipMenu(c), ev.clientX, ev.clientY); });
    return el;
  };
  const drawLabel = c => { const d = c.diff || {}; const n = (d.add || []).length, u = (d.update || []).length, r = (d.remove || []).length; return `${c.label || 'change'}${n ? ` +${n}` : ''}${u ? ` ~${u}` : ''}${r ? ` −${r}` : ''}`; };
  const clipMenu = c => [
    c.track === 'comp' ? { label: 'Open the composition', hint: 'Its own timeline (double-click it too; Esc comes back)', run: () => enterComp(c) } : null,
    { label: picked.size > 1 ? `Group ${picked.size} clips into a composition` : 'Group into a composition', keys: '⌘G', run: group },
    c.track === 'comp' ? { label: 'Ungroup', hint: 'Its clips back on the tracks here, at its rate', keys: '⇧⌘G', run: () => ungroup(c) } : null,
    '-',
    { label: c.track === 'comp' ? 'Stretch' : 'Length', items: [
      { label: 'To In and Out', disabled: !P().inOut, run: () => { const io = P().inOut; setLength(c, io[1] - io[0], io[0]); edited(); } },
      { label: 'To the loop region', disabled: !P().loopRange, run: () => { const r = P().loopRange; setLength(c, r[1] - r[0], r[0]); edited(); } },
      '-',
      ...[0.5, 1, 2, 4, 8].map(n => ({ label: n === 0.5 ? 'Half a bar' : `${n} bar${n === 1 ? '' : 's'}`, run: () => { setLength(c, n * barMs()); edited(); } })),
      ...[1, 2].map(n => ({ label: `${n} beat${n === 1 ? '' : 's'}`, run: () => { setLength(c, n * beatMs()); edited(); } }))
    ] },
    '-',
    { label: 'Go to start', run: () => seekShow(c.start) },
    { label: 'Zoom to the clip', keys: 'F', run: () => fitClip(c) },
    { label: 'Show code', hint: 'This clip as clip({ … }): edit and apply', run: () => app.openCode?.('clip', c) },
    c.track === 'draw' ? { label: c.fx?.drawOn === false ? 'Reveal gradually' : 'Show at once', run: () => { c.fx = { ...(c.fx || {}), drawOn: c.fx?.drawOn === false }; edited(); } } : null,
    { label: 'Speed', items: [0.25, 0.5, 2, 4].map(k => ({ label: k < 1 ? `${1 / k}× slower` : `${k}× faster`, run: () => { setLength(c, c.dur / k); edited(); } })) },
    { label: picked.size > 1 ? `Duplicate ${picked.size} clips` : 'Duplicate', keys: '⇧D', hint: 'Just after; Alt-drag drags a copy', run: () => { if (!picked.has(c.id)) select(c); duplicatePicked(); } },
    '-',
    { label: picked.size > 1 ? `Delete ${picked.size} clips` : 'Delete', run: () => deleteClips(picked.size > 1 ? pickedClips() : [c]) }
  ].filter(Boolean);
  const deleteClips = list => { const t = P().take, gone = new Set(list); t.clips = t.clips.filter(x2 => !gone.has(x2)); select(null); edited(); };
  const deleteClip = c => deleteClips([c]);
  app.timelineEdited = edited;

  // Drop from Assets: sound → an audio clip, text → narration, a drawing → a drawing clip that reveals it.
  const blobURL = blob => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  // Where dropped History changes go: at the end of what is there (so a composition is assembled step
  // by step), at the playhead (⌥⇧), or where they are dropped, on the grid (Ctrl/⌘).
  const pointerMs = ev => { const r = lanes.getBoundingClientRect(); return Math.max(0, ((ev.clientX - r.left + lanes.scrollLeft) / pps) * 1000); };
  const historyDrop = ev => {
    const q = gridStep(S(), pps) * 1000;
    if (ev.altKey && ev.shiftKey) return { t: Math.round(P().t), how: 'at the playhead' };
    if (ev.ctrlKey || ev.metaKey) { const raw = pointerMs(ev); return { t: q ? Math.max(0, Math.round(raw / q) * q) : Math.round(raw), how: q ? 'here, on the grid' : 'here' }; }
    const clips = P().take?.clips || [], end = clips.length ? Math.max(...clips.map(c => c.start + (c.dur || 0))) : 0;
    return { t: q && end ? Math.ceil(end / q - 1e-6) * q : Math.round(end), how: clips.length ? 'at the end' : 'at the start' };
  };
  const dropMark = h('div', { class: 'wb-tl-dropmark' });
  const dropTip = h('div', { class: 'wb-tl-droptip' });
  const clearDrop = () => { lanes.classList.remove('drop'); dropMark.remove(); dropTip.remove(); };
  lanes.addEventListener('dragover', ev => {
    const types = [...ev.dataTransfer.types];
    if (!types.some(t => t === 'text/asset-id' || t === 'application/x-ams-history')) return;
    ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; lanes.classList.add('drop');
    if (!types.includes('application/x-ams-history')) return;
    // A line where they will go, and a note by the pointer saying where (and the other choices).
    const d = historyDrop(ev);
    dropMark.style.transform = `translateX(${x(d.t)}px)`;
    dropMark.style.height = playhead.style.height;
    const r = lanes.getBoundingClientRect();
    dropTip.textContent = `${d.how[0].toUpperCase()}${d.how.slice(1)} (${stamp(d.t)})  ·  ⌥⇧ playhead  ·  Ctrl/⌘ here`;
    dropTip.style.left = `${ev.clientX - r.left + lanes.scrollLeft + 12}px`;
    dropTip.style.top = `${Math.min(ev.clientY - r.top + 14, lanes.clientHeight - 24) + lanes.scrollTop}px`;
    if (!dropMark.isConnected) lanes.append(dropMark, dropTip);
  });
  lanes.addEventListener('dragleave', ev => { if (!lanes.contains(ev.relatedTarget)) clearDrop(); });
  window.addEventListener('dragend', clearDrop);
  lanes.addEventListener('drop', async ev => {
    const where = historyDrop(ev), dropMs = Math.round(pointerMs(ev));   // (read before a take is started: that changes the view)
    clearDrop();
    ev.preventDefault();
    if (R().recording) { app.log('Stop recording to add media.'); return; }
    // History entries → drawing clips, in order, from the drop point.
    const hist = ev.dataTransfer.getData('application/x-ams-history');
    if (hist) {
      const ids = JSON.parse(hist);
      const H = app.history;
      const row0 = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.wb-tl-row');
      const lane = row0?.dataset.kind === 'draw' ? { lane: row0.dataset.track } : {};
      if (!P().take) {
        const first = Math.min(...ids.map(i => H.indexOf(i)));
        P().load(createTake({ title: 'Untitled take', baseline: JSON.parse(JSON.stringify(H.stateAfter(first - 1))) }));
      }
      const t0 = where.t, added = H.clipsFrom(ids, t0);
      if (!added.length) { app.log('Those changes are muted in History.'); drawBar(); drawLanes(); return; }
      for (const c of added) P().take.clips.push({ id: clipId(), ...c, ...lane });
      edited(); drawBar();
      // (the view stays; it moves only to show where they went)
      const v = reveal(current(), t0, viewW(), 60);
      if (Math.abs(v.left - lanes.scrollLeft) > 0.5) scrollTo(v.left);
      const skipped = ids.length - added.length;
      app.log(`Added ${added.length} change${added.length === 1 ? '' : 's'} from History ${where.how} (${stamp(t0)})${skipped ? `; ${skipped} muted left out` : ''}.`);
      return;
    }
    const id = ev.dataTransfer.getData('text/asset-id');
    if (!id) return;
    const a = await app.assetStore.get(id);
    if (!a) return;
    if (!P().take) P().load(createTake({ title: 'Untitled take', baseline: JSON.parse(JSON.stringify(app.store.doc)) }));
    const t = dropMs;
    const take = P().take;
    const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.wb-tl-row');
    const onRow = kind => (row?.dataset.kind === kind ? { lane: row.dataset.track } : {});
    if (a.kind === 'audio') {
      const src = await blobURL(a.blob);
      let dur = a.meta?.duration;
      if (!dur) { const au = new Audio(src); await new Promise(res => { au.onloadedmetadata = res; au.onerror = res; }); dur = Math.round((au.duration || 5) * 1000); }
      take.clips.push({ id: clipId(), track: 'audio', ...onRow('audio'), start: t, dur, src, label: a.title, peaks: a.meta?.peaks || null, asset: a.id, fx: {} });
    } else if (a.kind === 'text') {
      const text = (await a.blob.text()).trim();
      take.clips.push({ id: clipId(), track: 'say', ...onRow('say'), start: t, dur: readingTime(text), text, fx: {} });
    } else if (a.program?.type === 'ams-process') {
      const diff = diffDocs(docAt(touch(take), t), a.program);
      if (diff) take.clips.push({ id: clipId(), track: 'draw', ...onRow('draw'), start: t, dur: Math.min(6000, Math.max(600, (diff.add?.length || 1) * 140)), diff, label: a.title, by: 'asset', fx: {} });
    } else { app.log('Drop sound, text or a saved drawing on the Timeline (pictures go on the canvas).'); return; }
    edited(); drawBar();
    app.log(`Added “${a.title}” at ${fmt(t)}.`);
  });

  // The wheel: Ctrl/⌘ (or a pinch) zooms at the pointer; Shift pans; with no tracks to scroll, the wheel pans.
  let lastWheel = 0;
  lanes.addEventListener('wheel', ev => {
    const u = ev.deltaMode === 1 ? 16 : ev.deltaMode === 2 ? viewW() : 1, dx = ev.deltaX * u, dy = ev.deltaY * u;
    if (ev.metaKey || ev.ctrlKey) {
      ev.preventDefault();
      if (performance.now() - lastWheel > 500) remember();   // (one gesture is one step back)
      lastWheel = performance.now();
      zoomBy(Math.exp(-dy * 0.004), ev.clientX - lanes.getBoundingClientRect().left);
      return;
    }
    // (the lanes have no scrollbar across, the navigator is theirs: sideways scrolling is done here)
    const noRows = lanes.scrollHeight <= lanes.clientHeight + 1;
    const across = ev.shiftKey ? dx || dy : Math.abs(dx) > Math.abs(dy) ? dx : noRows ? dy : 0;
    if (across) { ev.preventDefault(); followHold = true; lanes.scrollLeft += across; }
  }, { passive: false });
  // The middle button drags the view (anywhere on the lanes, clips too).
  lanes.addEventListener('mousedown', ev => { if (ev.button === 1) ev.preventDefault(); });
  lanes.addEventListener('pointerdown', ev => {
    if (ev.button !== 1) return;
    ev.preventDefault(); ev.stopPropagation();
    const x0 = ev.clientX, y0 = ev.clientY, l0 = lanes.scrollLeft, t0 = lanes.scrollTop;
    followHold = true; lanes.classList.add('panning');
    const mv = e2 => { lanes.scrollLeft = l0 - (e2.clientX - x0); lanes.scrollTop = t0 - (e2.clientY - y0); };
    const up = () => { lanes.classList.remove('panning'); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  }, true);
  // Scrolling: the track names follow up and down, the ruler and navigator follow across.
  let scrollRaf = 0;
  lanes.addEventListener('scroll', () => {
    labels.scrollTop = lanes.scrollTop;
    if (Math.abs(lanes.scrollLeft - expectLeft) > 2) { followHold = true; expectLeft = lanes.scrollLeft; }
    if (!scrollRaf) scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; drawRuler(); drawNavWin(); });
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { drawRuler(true); drawNav(); }).observe(lanes);

  // Stepping and marking from the keyboard.
  const nudge = (dir, big) => {
    const st = S(), beat = (60 / st.tempo) * (4 / st.signature.denominator), barS = beat * st.signature.numerator;
    const q = (st.ruler === 'beats' ? (big ? barS : beat) : big ? 1 : 1 / st.fps) * 1000, t = P().t;
    const n = dir > 0 ? Math.floor(t / q + 1e-6) + 1 : Math.ceil(t / q - 1e-6) - 1;
    seekShow(Math.max(0, n * q));
  };
  const jumpEdit = dir => {
    const p = P(), take = p.take || live();
    const t = nextEdit(editPoints(take?.clips, [p.loopRange, p.inOut].filter(Boolean), take ? p.duration : 0), p.t, dir);
    if (t != null) seekShow(t);
  };
  // I and O: In and Out at the playhead (the other end stays, or is the take's end / its start).
  const markIn = () => {
    const p = P(), t = Math.round(p.t), io = p.inOut;
    const hi = io && io[1] > t + 20 ? io[1] : p.take && p.duration > t + 20 ? p.duration : t + 4000;
    p.setSettings({ range: { start: t / 1000, end: hi / 1000 } }); drawBar();
  };
  const markOut = () => {
    const p = P(), t = Math.round(p.t), io = p.inOut;
    if (t < 20) return;
    const lo = io && io[0] < t - 20 ? io[0] : 0;
    p.setSettings({ range: { start: lo / 1000, end: t / 1000 } }); drawBar();
  };
  // Keys while the timeline has focus (they do not reach the canvas's shortcuts; Home and End, and anything with Alt, Ctrl or ⌘, do).
  const KEYS = {
    ArrowLeft: ev => nudge(-1, ev.shiftKey), ArrowRight: ev => nudge(1, ev.shiftKey),
    ArrowUp: () => jumpEdit(-1), ArrowDown: () => jumpEdit(1),
    '=': () => zoomBy(ZOOM_STEP), '+': () => zoomBy(ZOOM_STEP), '-': () => zoomBy(1 / ZOOM_STEP), _: () => zoomBy(1 / ZOOM_STEP),
    '\\': () => fitAll(), '|': () => fitAll(),
    f: fitSelection, F: () => fitAll(), z: fitSelection, l: fitLoop, L: fitLoop, x: back, X: back, '.': centreHead,
    i: markIn, I: markIn, o: markOut, O: markOut, D: duplicatePicked
  };
  const SEEKS = /^(Arrow\w+|[iIoO])$/;
  // What the Timeline's keys do, in words (for View → Show user actions).
  const KEY_LABELS = { ArrowLeft: 'Step back', ArrowRight: 'Step on', ArrowUp: 'To the previous clip edge', ArrowDown: 'To the next clip edge', '=': 'Zoom in', '+': 'Zoom in', '-': 'Zoom out', _: 'Zoom out', '\\': 'Fit all', '|': 'Fit all', f: 'Frame the selection', F: 'Fit all', z: 'Frame the selection', l: 'Fit In to Out', L: 'Fit In to Out', x: 'Previous view', X: 'Previous view', '.': 'Centre on the playhead', i: 'In at the playhead', I: 'In at the playhead', o: 'Out at the playhead', O: 'Out at the playhead', D: 'Duplicate the picked clips', ' ': 'Play / pause', Delete: 'Delete the picked clips', Backspace: 'Delete the picked clips', Escape: 'Out of the composition' };
  app.timelineKeyLabel = ev => {
    if ((ev.metaKey || ev.ctrlKey) && /^[zZyY]$/.test(ev.key)) return ev.shiftKey || /^[yY]$/.test(ev.key) ? 'Redo on the Timeline' : 'Undo on the Timeline';
    if ((ev.metaKey || ev.ctrlKey) && /^[gG]$/.test(ev.key)) return ev.shiftKey ? 'Ungroup the composition' : 'Group into a composition';
    return ev.metaKey || ev.ctrlKey || ev.altKey ? null : KEY_LABELS[ev.key] || null;
  };   // (not while recording: the recording keeps its own time)
  // The Timeline's keys work while the pointer is over it, or while something in it has focus (as in
  // an editor with panes): they are taken before the canvas's shortcuts see them. Typing in a field
  // is left alone; Home, End, and anything with Alt, Ctrl or ⌘ go on to the shortcuts.
  let hover = false;
  tl.addEventListener('pointerenter', () => { hover = true; });
  tl.addEventListener('pointerleave', () => { hover = false; });
  const typing = el => el?.closest?.('input, textarea, select, [contenteditable], .cm-editor');
  window.addEventListener('keydown', ev => {
    if (!tl.isConnected || !tl.offsetParent || ev.defaultPrevented) return;
    const ae = document.activeElement;
    if (typing(ev.target) || typing(ae)) return;
    if (!hover && !tl.contains(ae)) return;
    if (document.querySelector('.wb-menu, .wb-dialog')?.isConnected && !tl.contains(ev.target)) return;   // (a menu or dialog has the keys)
    const take = () => { ev.preventDefault(); ev.stopPropagation(); };
    if (ev.key === ' ' && !(ev.shiftKey || ev.altKey || ev.metaKey || ev.ctrlKey)) { take(); P().toggle(); return; }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && selected && !R()?.recording) { take(); deleteClips(pickedClips().length ? pickedClips() : [selected]); return; }
    if (ev.key === 'Escape' && compStack.length && !(ev.metaKey || ev.ctrlKey || ev.altKey)) { take(); exitComp(); return; }
    if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && /^[gG]$/.test(ev.key) && P().take && !R()?.recording) { take(); if (ev.shiftKey) ungroup(selected); else group(); return; }
    // ⌘Z / ⇧⌘Z (and Ctrl+Y) undo the Timeline while it has a take; without one they go on to the drawing's undo.
    if ((ev.metaKey || ev.ctrlKey) && !ev.altKey && /^[zZyY]$/.test(ev.key) && P().take && !R()?.recording) { take(); undoTimeline(ev.shiftKey || /^[yY]$/.test(ev.key)); return; }
    const run = !(ev.metaKey || ev.ctrlKey || ev.altKey) && KEYS[ev.key];
    if (run && !(R()?.recording && SEEKS.test(ev.key))) { take(); run(ev); }
  }, true);
  // For agents and tests: the view, and the same moves as the buttons and keys.
  app.timelineView = {
    get: () => { const [t0, t1] = visibleRange(current(), viewW()); return { pps, start: t0, end: t1 }; },
    fit: (what = 'all') => (what === 'loop' ? fitLoop() : what === 'clip' ? fitClip(selected) : what === 'selection' ? fitSelection() : fitAll()),
    show: (start, end) => showRange(start, end),
    zoom: f => zoomBy(f),
    back
  };

  let lastPlaying = false, lastTake = null;
  // One animation loop while playing or recording: move the playhead, rewrite the time, follow.
  let raf = 0, timeEl = null;
  const loop = () => {
    raf = 0;
    const p = P(), rec = live();
    if (!p) return;
    const t = rec ? R().now() : p.position();   // (between the transport's ticks, where it is now)
    setHead(t);
    timeEl ||= bar.querySelector('.wb-tl-time');
    if (timeEl?.isConnected) timeEl.textContent = rec ? `● ${fmt(t)}` : stampOf(t, p.duration); else timeEl = null;
    if ((rec || !p.take || R()?.overdubbing) && x(t) > laneWidth - 60) drawLanes();          // grow a screen at a time
    if (rec || p.playing) follow(t);
    if (rec || p.playing) raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!raf) raf = requestAnimationFrame(loop); };
  // The scene's transport changed (a setting, an undo, another scene): the bar and ruler follow.
  let settingsKey = '';
  const checkSettings = () => {
    const p = P(); if (!p) return;
    const key = JSON.stringify({ ...p.settings, mixer: 0 });
    if (key === settingsKey) return;
    settingsKey = key; drawBar(); timeEl = null; drawLanes();
    commit('transport');   // (In, Out and the loop region are part of the Timeline's undo; a drag is one step)
  };
  const sync = () => {
    const p = P(); if (!p) return;
    checkSettings();
    if (lastTake !== p.take) { lastTake = p.take; undo.reset(snap()); drawBar(); timeEl = null; drawLanes(); }   // (a take opened or closed from elsewhere: an agent, Assets)
    if (lastPlaying !== p.playing) { lastPlaying = p.playing; if (p.playing) followHold = false; drawBar(); timeEl = null; }   // redraw the bar only when play/pause flips
    if (p.playing) kick(); else { setHead(p.t); timeEl ||= bar.querySelector('.wb-tl-time'); if (timeEl) timeEl.textContent = stampOf(p.t, p.duration); }
  };
  const attach = () => { if (!P() || !R()) return setTimeout(attach, 30); P().on(sync); app.store.subscribe(checkSettings); settingsKey = JSON.stringify({ ...P().settings, mixer: 0 }); drawBar(); drawLanes(); loadTakes(); };
  // While recording, new clips redraw the lanes (at most every 250 ms); the loop moves the playhead.
  let liveQueued = false;
  const liveRedraw = () => { if (liveQueued) return; liveQueued = true; setTimeout(() => { liveQueued = false; if (live()) drawLanes(); }, 250); };
  app.on('recording-update', liveRedraw);
  app.on('recording', on => {
    if (on && !P().take) { pps = 40; followHold = false; }
    drawBar(); timeEl = null; drawLanes();
    if (on) kick();
  });
  // A finished recording goes to the list; it is reviewed only when opened (the canvas stays yours).
  app.on('take', () => { loadTakes(); drawBar(); drawLanes(); });
  attach();
}
