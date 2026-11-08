/**
 * Timeline (transport after underscores): record, review and edit takes. Clips are rectangles on
 * tracks: drag to move, drag the right edge to retime, double-click narration or titles to edit,
 * right-click for more. The selected clip's properties are in Properties.
 */
import { askConfirm, askText } from '../dialog.js';
import { editInPlace, editable, h } from '../ui.js';
import { icon } from '../icons.js';
import { clipWords } from '../../process/clipWords.js';
import { mediaClipFromAsset } from '../mediaClips.js';
import { camerasOf, onAirShot } from '../camera.js';
import { autoKey, setAutoKey, recording, setRecordAuto } from '../keyframeDot.js';
import { valueAt, EASE_NAMES } from '../../process/keyframes.js';
import { duration, summarize, touch, flatClips, clipId, TRACKS, TRACK_NAMES, readingTime, createTake, diffDocs, docAt, tracksOf, addTrack, laneOf, precompose, decompose, compLength } from '../../process/take.js';
import { showMenu } from '../menu.js';
import { TimelineUndo } from '../timelineUndo.js';
import { liveClock } from '../liveClock.js';
import { markLive } from '../liveTake.js';
import { rangeInput, paintRange } from '../rangeInput.js';
import { formatMusicalPosition, secondsToFrame } from '../../time/transport.js';
import { RULERS, FPS_CHOICES, QUANT_CHOICES, SNAP_CHOICES, snapStep, timeContext } from '../../time/sceneTransport.js';
import { waveFor, fromPeaks, drawWave } from '../waveform.js';
import { clampPps, zoomAt, fitRange, reveal, centerOn, visibleRange, rulerTicks, autoGrid, gridLayer, timeLabel, editPoints, nextEdit, MAX_CONTENT_PX } from '../../time/timelineView.js';

const AUDIO_CLIP_H = 33;
const TRACK_LABEL = { comp: 'Composition', title: 'Titles', say: 'Narration', draw: 'Drawing', action: 'Actions', camera: 'Camera', shot: 'Shot', cut: 'Cut', media: 'Media', audio: 'Audio', auto: 'Automation' };
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
  // A new take starts its live History and Interactions tracks from now; "Take from the recording" (right-click the interactions button) starts them from when recording began.
  const fresh = t => markLive(app, t);
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
  // Vertical zoom: how tall each track is (1 is the usual 24 px row); tall rows show whole clip labels, to study the events. Alt+wheel, or the ↕ button in the bar.
  let vz = 1;
  try { vz = Number(localStorage.getItem('ams_tl_vzoom')) || 1; } catch { /* ignore */ }
  const VZ = [1, 1.6, 2.4, 3.4];
  const setVZ = z => { vz = Math.max(1, Math.min(4, z)); try { localStorage.setItem('ams_tl_vzoom', String(vz)); } catch { /* ignore */ } paintVZ(); };
  let vzSlider = null;
  const paintVZ = () => { root.style.setProperty('--tl-vz', String(vz)); root.classList.toggle('vz-tall', vz >= 1.5); if (vzSlider && Number(vzSlider.value) !== vz) { vzSlider.value = String(vz); paintRange(vzSlider); } };
  const bar = h('div', { class: 'wb-tl-bar' });
  const labels = h('div', { class: 'wb-tl-labels' });
  const lanes = h('div', { class: 'wb-tl-lanes', tabIndex: 0 });
  const vzBar = h('div', { class: 'wb-tl-vzbar' });
  const body = h('div', { class: 'wb-tl-body' }, labels, lanes, vzBar);
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
  // Track height: a slider down the right side of the tracks (taller up)
  vzSlider = rangeInput({ min: 1, max: 4, step: 0.05, value: vz, title: 'Track height (Alt+wheel over the tracks too): taller tracks show whole clip labels' });
  vzSlider.classList.add('vert');
  // (the navigator under the tracks, as an editor's zoom bar: it stands in for the scrollbar)
  const tl = h('div', { class: 'wb-tl' }, bar, body, h('div', { class: 'wb-tl-navrow' }, zoomBar, nav, navInfo));
  root.append(tl);
  // Fit: the tracks' height so that all of them fill the view (never shorter than normal)
  const fitVZ = () => { const take = P()?.take || live(), n = Math.max(1, take ? tracksOf(take).length + 1 : 1); setVZ((lanes.clientHeight - 24) / (24 * n)); };
  vzBar.append(h('button', { class: 'wb-icon-btn wb-tl-vzfit', type: 'button', title: 'Fit the tracks to the view: as tall as will show them all', html: icon('fit'), onclick: fitVZ }), vzSlider);
  vzSlider.addEventListener('input', () => setVZ(Number(vzSlider.value)));
  paintVZ();

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
  const edited = () => { P().changed(); drawLanes(); app.emit('clip-select', selected); commit('edit'); app.timelineEdited2?.(); };

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
    // Shift+click the name: rename the take (Enter keeps it)
    sel.addEventListener('mousedown', ev => { if (!ev.shiftKey || !take) return; ev.preventDefault(); renameTake(); });
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
      h('button', { class: `wb-icon-btn wb-tl-rec${rec || od ? ' on' : ''}`, title: rec ? 'Stop recording (the take goes to Assets)' : od ? 'Stop recording (Space too; the take is saved)' : `Record onto the Timeline: the transport plays (${p.loop ? 'round the loop: each pass adds to the last' : p.inOut ? 'from In to Out' : 'from the playhead'}) and each gesture goes on the drawing track where the playhead is: draw, or grab, push and smooth the marks already there, and each pass lays its moves over the last. Right-click: step the playhead a frame on actions instead of the clock`, html: rec || od ? '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="9" fill="currentColor"/><circle cx="12" cy="12" r="4.2" fill="none" stroke="var(--wb-panel, #222)" stroke-width="1.8"/></svg>' : '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="12" cy="12" r="7.5" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>', onclick: () => (rec ? R().stop() : od ? R().stopOverdub() : R().startOverdub()), oncontextmenu: ev => { ev.preventDefault(); const poly = R().settings.overdubLanes !== 'tracks', adv = R().settings.advance || {}, setAdv = patch => { R().setSettings({ advance: { ...adv, ...patch } }); drawBar(); }; showMenu([{ label: 'The playhead' }, { label: 'Runs with the clock', active: !R().stepping(), run: () => setAdv({ start: false, end: false, board: false }) }, { label: 'Steps a frame at the end of an action', active: Boolean(adv.end), run: () => setAdv({ end: !adv.end }) }, { label: 'Steps a frame at the start of an action', active: Boolean(adv.start), run: () => setAdv({ start: !adv.start }) }, { label: 'Steps a frame when the board changes', active: Boolean(adv.board), run: () => setAdv({ board: !adv.board }) }, { label: 'Overlapping gestures' }, { label: 'On one track, as voices (polyphonic)', active: poly, run: () => R().setSettings({ overdubLanes: 'poly' }) }, { label: 'On a track of their own (a track per pass)', active: !poly, run: () => R().setSettings({ overdubLanes: 'tracks' }) }], ev.clientX, ev.clientY); } }),
      h('button', { class: `wb-icon-btn wb-tl-hist${app.history?.capturing ? ' on' : ''}`, title: app.history?.capturing ? 'Recording History: every change goes to the History panel and the History track (click to pause)' : 'History is paused: changes are not recorded (click to record)', html: icon('history'), onclick: () => { const H = app.history; if (!H) return; const on = !H.capturing; H.setCapturing(on); if (on && P()?.take) { P().take.noHistory = false; P().take._histKey = null; } drawBar(); drawLanes(); } }),
      h('button', { class: `wb-icon-btn wb-tl-recauto${recording.on ? ' on' : ''}`, title: recording.on ? 'Recording automation: what you move while the transport plays is written as keys. Click to stop (the keys are thinned)' : 'Record automation: press play, then move any parameter with a diamond beside it; it is written as keys', html: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3l9 9-9 9-9-9z" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="3.4" fill="currentColor"/></svg>', onclick: () => { setRecordAuto(!recording.on); drawBar(); } }),
      ...(P()?.take && camerasOf(P().take).length > 1 ? camerasOf(P().take).map(cam => h('button', { class: `wb-icon-btn wb-tl-cam${onAirShot(P().take, P().t)?.camera === cam.id ? ' on' : ''}`, style: { color: cam.color }, title: `Cut to ${cam.name} at the playhead: the Program shows it from here. While the transport plays this is a live switch, recorded as a cut`, onclick: () => { app.cutToCamera(cam.id); drawBar(); } }, cam.name.replace(/^Camera\s*/i, 'C'))) : []),
      h('button', { class: `wb-icon-btn wb-tl-onion${app.player.onion?.on ? ' on' : ''}`, title: app.player.onion?.on ? 'Onion skin is on: the frames just before (warm) and after (cool) the playhead show faintly through the camera while paused. Click to turn it off' : 'Onion skin: show the frames just before and after the playhead faintly through the camera while paused (never rendered)', html: '<svg viewBox="0 0 24 24" width="16" height="16"><circle cx="9.5" cy="12" r="5.5" fill="currentColor" fill-opacity=".9"/><circle cx="14.5" cy="12" r="5.5" fill="currentColor" fill-opacity=".45"/></svg>', onclick: () => { const o = app.player.onion; o.on = !o.on; app.player.render(); drawBar(); } }),
      h('button', { class: 'wb-icon-btn wb-tl-render', title: 'Render the take as a video: frame by frame (the cameras, keyframes, sketches and media), MP4 or WebM', html: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="3" y="5" width="14" height="14" rx="2"/><path d="M17 10l4-2.5v9L17 14"/></svg>', onclick: () => import('../render.js').then(m => m.openRenderDialog(app)) }),
      h('button', { class: `wb-icon-btn wb-tl-autokey${autoKey.on ? ' on' : ''}`, title: autoKey.on ? 'Auto-key is on: changing an animated parameter at the playhead keys it. Click to turn it off' : 'Auto-key: when on, changing an animated parameter at the playhead keys it (the diamond beside a field keys it by hand)', html: '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 3l9 9-9 9-9-9z" fill="currentColor"/><circle cx="12" cy="12" r="3" fill="var(--wb-panel, #222)"/></svg>', onclick: () => { setAutoKey(!autoKey.on); drawBar(); } }),
      h('button', { class: `wb-icon-btn wb-tl-ints${app.interactions?.capturing ? ' on' : ''}`, title: app.interactions?.capturing ? 'Recording interactions: the controls you click (not the drawing; History has that). Click to stop' : 'Record interactions: the controls you click, for walkthroughs. They appear as an Interactions track and the cursor travels to each one on playback. Right-click: make a take from what was recorded', html: icon('select'), oncontextmenu: ev => { ev.preventDefault(); showMenu([{ label: 'Take from the recording', hint: 'A take with what was recorded since recording was switched on (History and Interactions)', run: takeFromRecording }, { label: 'Clear what was recorded', hint: 'Forget the recorded interactions so far (History is cleared in its own panel)', run: () => { app.interactions?.clear(); drawBar(); } }], ev.clientX, ev.clientY); }, onclick: () => { const I = app.interactions; if (!I) return; I.setCapturing(!I.capturing); if (I.capturing && P()?.take) { P().take.noInteractions = false; P().take._intKey = null; } drawBar(); } }),
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
      h('button', { class: 'wb-icon-btn', title: 'New take: an empty one (Shift+click: starting from the drawing as it is)', disabled: Boolean(rec), onclick: newTake, html: NEW_TAKE_SVG }),
      h('button', { class: 'wb-icon-btn', title: 'Insert at the playhead: a title card, a line of narration, a camera keyframe, a hold, a sound (a take is started if there is none)', disabled: Boolean(rec), onclick: e => showMenu(addItems(), e.clientX, e.clientY), html: INSERT }),
      h('button', { class: 'wb-icon-btn', title: 'Add a track', disabled: Boolean(rec), onclick: e => showMenu(trackItems(), e.clientX, e.clientY), html: ADD_TRACK }),
      take?.original
        ? h('button', { class: 'wb-icon-btn', title: 'Back to the take this summary was made from (the summary is discarded unless saved)', onclick: () => { const o = take.original; P().load(o); select(null); fitZoom(); drawBar(); drawLanes(); }, html: icon('undo') })
        : h('button', { class: 'wb-icon-btn', title: 'Summary: a short cut of this take (narration kept, the drawing brisk, analysis and waiting sped through, a hold at the end)', disabled: !take || Boolean(take.summaryOf) || /\(summary\)$/.test(take.title), onclick: makeSummary, html: SUMMARY }),
      h('button', { class: 'wb-icon-btn', title: 'Walkthrough: a live walkthrough from this take (steps from narration; the drawing replayed with the guide)', disabled: !take, onclick: () => app.walkthroughs.fromTake(p.take).then(w => app.log(`Walkthrough “${w.title}” is in Docs → Walkthroughs and the palette.`)), html: WALKTHROUGH }),
      h('button', { class: 'wb-icon-btn', title: 'Export', disabled: !take, onclick: e => showMenu(exportItems(), e.clientX, e.clientY), html: icon('export') }),
      h('button', { class: 'wb-icon-btn', title: 'Save the edited take to Assets', disabled: !take, onclick: saveTake, html: icon('save') }),
      take ? h('button', { class: 'wb-icon-btn', title: take.assetId ? 'Delete this take from Assets (the drawing is not touched)' : 'Throw this take away (it is not saved)', html: icon('trash'), onclick: deleteTake }) : null,
      take ? h('button', { class: 'wb-icon-btn', title: 'Close the take (back to your drawing)', html: icon('close'), onclick: () => { leaveComps(); P().close(); select(null); drawBar(); drawLanes(); } }) : null].filter(Boolean));
  };

  const renameTake = async () => {
    const take = P()?.take; if (!take) return;
    const v = await askText('Name of the take', take.title || '');
    if (v == null || !v.trim()) return;
    take.title = v.trim();
    if (take.assetId) { try { await app.assetStore.update(take.assetId, { title: take.title }); } catch { /* the name stays on the open take */ } }
    loadTakes(); drawBar();
  };
  // Delete the open take: a saved one leaves Assets (its Recordings folder); an unsaved one is just dropped. The drawing is never touched.
  const deleteTake = async () => {
    const take = P()?.take; if (!take) return;
    const saved = Boolean(take.assetId);
    if (!(await askConfirm(saved ? `Delete the take “${take.title}” from Assets? The drawing is not touched.` : `Throw away the take “${take.title}”? It is not saved.`, { ok: saved ? 'Delete' : 'Throw away', danger: true }))) return;
    leaveComps();
    if (saved) { try { await app.assetStore.remove(take.assetId); } catch (err) { app.log(`Could not delete the take: ${err.message}`); } }
    P().close(); select(null); await loadTakes(); drawBar(); drawLanes();
    app.log(`${saved ? 'Deleted' : 'Threw away'} the take “${take.title}”.`);
  };
  const takeFromRecording = async () => {
    const I = app.interactions, from = I?.startedAt || 0;
    if (!from) { app.log('Switch recording on first (the pointer button), do the work, then make the take from it.'); return; }
    leaveComps();
    const p = P(), cur = p.take;
    if (cur && !cur.assetId && cur.clips.length && !(await askConfirm('Start a new take from the recording? This one is not saved (the save button keeps it).'))) return;
    p.load(markLive(app, createTake({ title: `Take ${takes.length + 1}`, baseline: JSON.parse(JSON.stringify(app.store.doc)) }), from));
    select(null); fitZoom(); drawBar(); drawLanes();
    app.log('A take from what was recorded since recording was switched on.');
  };
  const newTake = async ev => {
    leaveComps();
    const p = P(), cur = p.take;
    if (cur && !cur.assetId && cur.clips.length && !(await askConfirm('Start a new take? This one is not saved (the save button keeps it).'))) return;
    // A new take starts empty; Shift+click starts it from the drawing as it is (the end state of what you just recorded, say).
    const base = JSON.parse(JSON.stringify(app.store.doc)), fromDrawing = Boolean(ev?.shiftKey);
    if (!fromDrawing) { base.elements = []; base.decisions = []; }
    p.load(fresh(createTake({ title: `Take ${takes.length + 1}`, baseline: base })));
    select(null); fitZoom(); drawBar(); drawLanes();
    app.log(fromDrawing ? 'A new take, starting from the drawing as it is: drag changes in from History, insert at the playhead, or record.' : 'A new, empty take: drag changes in from History, insert at the playhead, or record. (Shift+click the button to start from the drawing as it is.)');
  };
  const openTake = a => { leaveComps(); compStack = []; const take = JSON.parse(JSON.stringify(a.program)); take.assetId = a.id; P().load(take); select(null); fitZoom(); drawBar(); drawLanes(); };
  app.openTake = async id => { const a = await app.assetStore.get(id); if (!a?.program) throw new Error('No such take'); app.docks.open('timeline'); openTake(a); return a; };

  const saveTake = async () => {
    const live = rootTake();
    // What is saved is a copy: the open take keeps its live tracks. History's and the interactions are kept as they are, as plain clips and tracks (they are the recording:
    // a saved demo plays its drawing from the History track, unmuted, and its cursor from the Interactions track).
    const take = JSON.parse(JSON.stringify(live));
    for (const c of take.clips) delete c.live;
    for (const t of take.tracks) delete t.live;
    delete take.original;
    take.duration = duration(take);
    if (live.assetId) await app.assetStore.update(live.assetId, { program: take, title: take.title, meta: { clips: take.clips.length, duration: take.duration } });
    else { await R().saveTake(take); live.assetId = take.assetId; }
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
    if (!P().take) { P().load(fresh(createTake({ title: 'Untitled take', baseline: JSON.parse(JSON.stringify(app.store.doc)) }))); fitZoom(); drawBar(); }
    return P().take;
  };
  /** Clips made elsewhere (a board's clip) come in at the playhead. */
  /** Keys were added or removed by a dot: redraw the lanes without re-evaluating every parameter (a value you changed on another one stays until you move the playhead). */
  app._tlKeysEdited = () => { if (!P().take) return; touch(P().take); drawLanes(); drawBar(); commit('keys'); P().emit(); };
  app._tlEnsureTake = ensureTake;
  app._tlFit = () => { fitZoom(); drawBar(); };
  app._tlAddClip = clip => {
    const take = ensureTake();
    if (clip.track === 'shot' && !clip.camera) clip.camera = camerasOf(take)[0].id;   // (the first camera unless one was chosen)
    let start = Math.round(P().t);
    // A clip added on top of another goes after it: clips put in one by one make a sequence.
    for (let again = true; again;) { again = false; for (const o of take.clips) if (o.track === clip.track && start < o.start + o.dur && start + clip.dur > o.start) { start = o.start + o.dur; again = true; } }
    take.clips.push({ ...clip, id: clip.id || clipId(), start }); edited(); select(take.clips[take.clips.length - 1]); drawBar();
    P().seek(start);
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
      ...app.shotMenuItems(),
      { label: 'Program board', hint: 'A board that shows the sequence (the monitor): pin it, open it in a window or full screen from its menu › Output', run: () => app.ensureProgramBoard({ go: true }) },
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
  // What the clips under the playhead say, beside it, as it passes (Settings › Timeline › Text at the playhead; off by default). Muted tracks too: that is the point.
  const now = h('div', { class: 'wb-tl-now', hidden: true });
  playhead.append(now);
  let nowKey = '';
  const paintNow = ms => {
    if (setting('ams_tl_head_text', '0') !== '1') { if (!now.hidden) { now.hidden = true; nowKey = ''; } return; }
    const take = P()?.take || live();
    const act = take ? flatClips(take).filter(c => c.track !== 'comp' && ms >= c.start && ms < c.start + Math.max(c.dur || 0, 1)).slice(-4) : [];
    const key = act.map(c => `${c.id}${c.muted ? 'm' : ''}`).join('|');
    if (key === nowKey && !now.hidden) return;
    nowKey = key;
    now.replaceChildren(...act.map(c => h('div', { class: `wb-tl-now-line t-${c.track}${c.muted ? ' muted' : ''}` }, c.track === 'action' ? `Action: ${clipWords(c)}` : clipWords(c))));
    now.hidden = !act.length;
  };
  app.timelineRedraw = () => { nowKey = ''; drawLanes(); paintNow(P()?.t || 0); };
  const setHead = ms => { playhead.style.transform = `translateX(${x(ms)}px)`; setNavHead(ms); paintNow(ms); };
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
  const openTranscript = trackId => app.openCode?.('take', trackId);   // (the take as text lives in the Code panel: Take)

  // ---- the History track ---------------------------------------------------------------------
  // Every take carries the drawing's History as a composition on a muted track of its own: one clip, "History", that holds the changes made so far, one
  // clip each, at the pace they were made. Unmute the track to replay it; open the composition (double-click) to inspect, move or delete steps.
  // It is kept in step with History (rebuilt when History changes) and never saved with the take (see saveTake). Only on the take itself.
  // (History and Interactions share one clock, built from both: a click, the stroke it drew and its History entry line up; idle gaps are shortened alike)
  const liveClockNow = () => {
    const H = app.history, I = app.interactions, from = P()?.take?._liveFrom || 0;
    const hs = H ? H.entries.filter(e => e.t >= from).slice(-200) : [], is = I ? I.entries.filter(e => e.t >= from) : [];
    const take = P()?.take;
    // A take made with the record button is on the transport's own time (no idle gap is shortened): what happened 12 s into the recording is at 12 s, where the drawing track's gestures are too.
    const clock = take?._liveRealtime ? { origin: from, at: t => t - from + (take._liveAt || 0) } : liveClock([...(H ? H.moments(hs) : []), ...is.flatMap(e => [e.since ?? e.t, e.t])]);
    return { clock, hs, is };
  };
  const liveKey = () => `${app.history?.seq}|${app.history?.entries.length}|${app.history?.entries.filter(e => e.muted).length}|${app.interactions?.seq}|${app.interactions?.entries.length}`;
  const syncHistory = () => {
    const take = P()?.take, H = app.history;
    if (!take || !H || compStack.length || take.noHistory || take.source === 'eval' || !take._liveFrom || take._liveDone) return;   // (noHistory: its History track was deleted; the record-history button brings it back)
    const key = liveKey();
    if (take._histKey === key) return;
    Object.defineProperty(take, '_histKey', { value: key, writable: true, configurable: true, enumerable: false });
    const { clock, hs, is } = liveClockNow();
    let tr = tracksOf(take).find(t => t.live === 'history');
    if (!hs.length) { if (tr) { take.tracks = take.tracks.filter(t => t !== tr); take.clips = take.clips.filter(c => c.live !== 'history'); touch(take); } return; }   // (nothing to show: no empty track)
    if (!tr) { tr = addTrack(take, 'comp', 'History'); tr.live = 'history'; tr.muted = true; }
    const from = Math.max(0, Math.min(...hs.map(e => clock.at(e.t - (H.durationOf(e) || 0))), Infinity));
    const inner = H.realClips(hs, clock, Number.isFinite(from) ? from : 0).map((c, i) => ({ ...c, id: `hist${H.seq}x${i}` }));
    // The History clip spans as long as the recording does (to the last interaction too), so the live tracks line up end to end; the strokes sit inside it where they happened.
    const start0 = Number.isFinite(from) ? Math.round(from) : 0;
    const end = Math.max(...inner.map(c => start0 + c.start + c.dur), ...is.map(e => clock.at(e.t)), start0 + 1);
    const dur = Math.max(1, Math.round(end - start0));
    const old = take.clips.find(c => c.live === 'history');
    const clip = { id: old?.id || clipId(), track: 'comp', lane: tr.id, live: 'history', start: Number.isFinite(from) ? Math.round(from) : 0, dur, rate: 1, label: `History (${H.entries.length})`, fx: {}, comp: { tracks: [{ id: 'draw', kind: 'draw', name: 'Drawing' }], clips: inner } };
    take.clips = [...take.clips.filter(c => c.live !== 'history'), ...(inner.length ? [clip] : [])];
    touch(take);
  };
  // The Interactions track: the controls clicked while "record interactions" was on, as Actions clips (the Guide's cursor travels to each control as the take plays; mute the track to silence it). Kept in step like History's; unlike it, saved with the take (a walkthrough is the point).
  const syncInteractions = () => {
    const take = P()?.take, I = app.interactions;
    if (!take || !I || compStack.length || take.noInteractions || take.source === 'eval' || !take._liveFrom || take._liveDone || !I.entries.length) return;
    const key = liveKey();
    if (take._intKey === key) return;
    Object.defineProperty(take, '_intKey', { value: key, writable: true, configurable: true, enumerable: false });
    const mine = I.entries.filter(e => e.t >= take._liveFrom);
    let tr = tracksOf(take).find(t => t.live === 'interactions');
    if (!mine.length) { if (tr) { take.tracks = take.tracks.filter(t => t !== tr); take.clips = take.clips.filter(c => c.live !== 'interactions'); touch(take); } return; }   // (nothing to show: no empty track)
    if (!tr) { tr = addTrack(take, 'action', 'Interactions'); tr.live = 'interactions'; }   // (not muted: you switched recording on to watch it back; History's track is muted, it replays the drawing itself)
    const { clock } = liveClockNow();
    take.clips = [...take.clips.filter(c => c.live !== 'interactions'), ...I.clips(clock, mine).map((c, i) => ({ ...c, id: `int${I.seq}x${i}`, lane: tr.id, live: 'interactions' }))];
    touch(take);
  };
  let histQueued = false;
  let intQueued = false;
  app.interactions?.on(() => { if (intQueued) return; intQueued = true; requestAnimationFrame(() => { intQueued = false; drawBar(); if (P()?.take) { syncInteractions(); drawLanes(); } }); });
  let histCap = app.history?.capturing;
  app.history?.on(() => { if (histQueued) return; histQueued = true; requestAnimationFrame(() => { histQueued = false; if (histCap !== app.history.capturing) { histCap = app.history.capturing; drawBar(); } if (P()?.take) { syncHistory(); drawLanes(); } }); });

  const drawLanes = () => {
    syncHistory(); syncInteractions();
    { const tk = P()?.take; if (tk?._liveFrom && !tk._liveRecording) tk._liveDone = true; }   // (a take that is not recording is built once and then left alone)
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
    { label: 'Show as text…', hint: 'This track as text (Markdown or JSON), in the Code panel', run: () => openTranscript(tr.id) },
    { label: 'Rename', run: () => { const el = document.querySelector(`[data-track-label="${CSS.escape(tr.id)}"] .wb-tl-labeltext`); if (el) editInPlace(el, v => { tr.name = v; drawLanes(); commit('track'); }); } },
    { label: tr.muted ? 'Unmute' : 'Mute', run: () => { tr.muted = !tr.muted; edited(); } },
    { label: `Add a ${(TRACK_NAMES[tr.kind] || tr.kind).toLowerCase()} track`, run: () => { addTrack(take, tr.kind); drawLanes(); commit('track'); } },
    '-',
    { label: 'Delete track', hint: 'Its clips go too', disabled: !tr.live && tracksOf(take).filter(t => t.kind === tr.kind).length < 2 && take.clips.some(c => laneOf(c) === tr.id), run: () => { if (tr.live === 'history') take.noHistory = true; if (tr.live === 'interactions') take.noInteractions = true; take.clips = take.clips.filter(c => laneOf(c) !== tr.id); take.tracks = take.tracks.filter(t => t !== tr); edited(); } }
  ];

  // What hovering a clip says (Settings › Timeline › Clip tips): brief is its kind, time and label; full is the clip in words, with who made it and what it changed.
  const setting = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
  const tipOf = (c, text) => {
    const head = `${TRACK_LABEL[c.track]} · ${fmt(c.start)}${setting('ams_tl_tip', 'brief') === 'full' ? `–${fmt(c.start + (c.dur || 0))}` : ''} · ${((c.dur || 0) / 1000).toFixed(1)} s`;
    if (setting('ams_tl_tip', 'brief') !== 'full') return `${head}\n${text}`;
    const more = [c.by && `by ${c.by}`, c.ui?.changes?.length && `made ${c.ui.changes.length} History entr${c.ui.changes.length === 1 ? 'y' : 'ies'}`, c.live && `live ${c.live} track`].filter(Boolean).join(' · ');
    return `${head}\n${clipWords(c)}${more ? `\n${more}` : ''}`;
  };
  /**
   * An automation lane drawn as a curve: the value over time (numbers), a gradient of the colours (colour lanes), and the keys
   * as diamonds you can drag (across: when; up and down: the value of a number). Right-click a key: its interpolation, delete.
   */
  const paintLane = (el, c) => {
    for (const n of [...el.querySelectorAll('.wb-tl-key, .wb-tl-curve')]) n.remove();
    const keys = c.keys || [], nums = keys.length > 0 && keys.every(k => typeof k.v === 'number'), dur = Math.max(1, c.dur || 1);
    let lo = 0, hi = 1;
    if (nums) {
      lo = Math.min(...keys.map(k => k.v)); hi = Math.max(...keys.map(k => k.v));
      if (hi - lo < 1e-9) { lo -= 0.5; hi += 0.5; }
      const pad = (hi - lo) * 0.14; lo -= pad; hi += pad;
    }
    const yOf = v => 100 * (1 - (v - lo) / (hi - lo));
    if (nums) {
      const N = 120, pts = [];
      for (let i = 0; i <= N; i++) { const t = dur * i / N; pts.push(`${(100 * i / N).toFixed(2)},${yOf(valueAt(keys, t, c.meta)).toFixed(2)}`); }
      el.append(h('span', { class: 'wb-tl-curve', html: `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${pts.join(' ')}" vector-effect="non-scaling-stroke"/></svg>` }));
    } else if (keys.length && keys.every(k => /^#[0-9a-f]{6}/i.test(k.v))) {
      el.style.background = `linear-gradient(90deg, ${keys.map(k => `${k.v} ${(100 * k.t / dur).toFixed(1)}%`).join(', ')})`;
    }
    for (const k of keys) {
      const key = h('span', { class: 'wb-tl-key', style: { left: `${x(k.t)}px`, top: `${nums ? yOf(k.v) : 50}%` }, title: `${fmt(c.start + k.t)} · ${typeof k.v === 'number' ? +k.v.toFixed(3) : JSON.stringify(k.v)} · ${k.ease || 'ease'}\nDrag to move it; right-click for more` });
      key.addEventListener('pointerdown', ev => {
        if (ev.button !== 0) return;
        ev.stopPropagation(); ev.preventDefault();
        const box = el.getBoundingClientRect(), x0 = ev.clientX, t0 = k.t;
        remember?.();
        const move = e2 => {
          k.t = Math.max(0, Math.round(t0 + ((e2.clientX - x0) / pps) * 1000));
          if (nums) k.v = lo + (1 - Math.max(0, Math.min(1, (e2.clientY - box.top) / box.height))) * (hi - lo);
          c.keys.sort((a, b) => a.t - b.t); c.dur = Math.max(1000, c.keys[c.keys.length - 1].t);
          el.style.width = `${Math.max(6, x(c.dur))}px`;
          paintLane(el, c);
        };
        const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); edited(); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
      });
      key.addEventListener('contextmenu', ev => {
        ev.preventDefault(); ev.stopPropagation();
        showMenu([
          { label: 'Key' },
          { label: 'Interpolation', items: EASE_NAMES.map(n => ({ label: n, active: (k.ease || 'ease') === n, run: () => { k.ease = n; edited(); } })) },
          { label: 'Delete key', run: () => { c.keys = c.keys.filter(z => z !== k); if (!c.keys.length) P().take.clips = P().take.clips.filter(z => z !== c); edited(); } }
        ], ev.clientX, ev.clientY);
      });
      el.append(key);
    }
  };
  const clipEl = (c, readOnly = false) => {
    const w = Math.max(6, x(c.dur || 0));
    const rate = c.rate > 0 ? c.rate : 1;
    const text = c.track === 'say' || c.track === 'title' ? c.text : c.track === 'draw' ? drawLabel(c) : c.track === 'camera' ? `${Math.round((c.z || 1) * 100)}%` : c.track === 'comp' ? `${c.label || 'Composition'}${Math.abs(rate - 1) > 0.001 ? ` ×${+rate.toFixed(2)}` : ''}` : c.label || c.name || '';
    const el = h('div', { class: `wb-tl-clip t-${c.track}${picked.has(c.id) ? ' sel' : ''}`, 'data-id': c.id, style: { left: `${x(c.start)}px`, width: `${w}px` }, title: `${tipOf(c, text)}${c.track === 'comp' ? '\nDouble-click to open; drag the right edge to stretch it (Alt: trim)' : ''}` },
      h('span', { class: 'wb-tl-cliptext' }, text), h('span', { class: 'wb-tl-grip', title: c.track === 'comp' ? 'Drag to stretch (Alt: trim)' : 'Drag to retime' }));
    // A composition shows its clips small inside it, at its rate.
    if (c.track === 'comp' && c.comp?.clips?.length) {
      for (const k of c.comp.clips.slice(0, 300)) {
        if (k.start >= c.dur * rate) continue;
        el.append(h('span', { class: `wb-tl-compbit t-${k.track}`, style: { left: `${x(k.start / rate)}px`, width: `${Math.max(2, x((k.dur || 0) / rate))}px` } }));
      }
    }
    if (c.track === 'auto') paintLane(el, c);
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
    { label: 'Split at the playhead', keys: 'X', run: splitAtPlayhead },
    { label: 'Ripple delete', hint: 'Delete it and close the gap on its track', keys: '⇧⌫', run: () => rippleDelete(pickedClips().length ? pickedClips() : [c]) },
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
  /** Delete and close the gap: later clips on the same tracks move earlier by the clip's length (an editor's ripple delete). */
  const rippleDelete = list => {
    const t = P().take; if (!t || !list.length) return;
    const gone = new Set(list);
    for (const c of [...list].sort((a, b) => b.start - a.start)) for (const o of t.clips) if (!gone.has(o) && laneOf(o) === laneOf(c) && o.start >= c.start + c.dur - 1) o.start = Math.max(0, o.start - c.dur);
    t.clips = t.clips.filter(x2 => !gone.has(x2)); select(null); edited();
  };
  /** Cut at the playhead (an editor's razor): the picked clips under it, else every clip under it. Media clips keep their moment of the source. */
  const splitAtPlayhead = () => {
    const take = P().take, t = Math.round(P().t); if (!take) return 0;
    const under = c => c.track !== 'comp' && t > c.start + 20 && t < c.start + c.dur - 20;
    const hit = pickedClips().filter(under), targets = hit.length ? hit : take.clips.filter(under);   // (the picked clips under the playhead, else every clip under it)
    for (const c of targets) {
      const first = t - c.start, k = { ...structuredClone(c), id: clipId(), start: t, dur: c.dur - first };
      if (c.track === 'media') { const cut = (c.in || 0) + first / 1000 * (c.speed > 0 ? c.speed : 1); k.in = cut; c.out = cut; }
      else if (c.track === 'audio') k.offset = (c.offset || 0) + first;
      c.dur = first;
      take.clips.push(k);
    }
    if (targets.length) { edited(); app.log(`Split ${targets.length} clip${targets.length === 1 ? '' : 's'} at ${fmt(t)}.`); }
    else app.log('Put the playhead over a clip to split it (X).');
    return targets.length;
  };
  app.timelineEdited = edited;
  app.splitAtPlayhead = splitAtPlayhead;

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
    if (id.startsWith('mediatheque:')) await (await import('../../ui/MediathequePanel.js')).MediathequePanel.pending;   // dragged from the archive: its reference is being made
    const a = await app.assetStore.get(id);
    if (!a) return;
    if (!P().take) P().load(fresh(createTake({ title: 'Untitled take', baseline: JSON.parse(JSON.stringify(app.store.doc)) })));
    const t = dropMs;
    const take = P().take;
    const row = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.wb-tl-row');
    const onRow = kind => (row?.dataset.kind === kind ? { lane: row.dataset.track } : {});
    if (a.kind === 'stream' || a.kind === 'video' || /^video\//.test(a.blob?.type || '')) {
      try { const clip = await mediaClipFromAsset(app, a, { start: t }); take.clips.push({ ...clip, ...onRow('media') }); }
      catch (err) { app.log(`Could not put “${a.title}” on the timeline: ${err.message}`, 'error'); return; }
    } else if (a.kind === 'audio') {
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
    if (ev.altKey) { ev.preventDefault(); setVZ(vz * Math.exp(-dy * 0.004)); return; }   // (Alt+wheel: taller or shorter tracks)
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
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && ev.shiftKey && selected && !R()?.recording) { take(); rippleDelete(pickedClips().length ? pickedClips() : [selected]); return; }
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
    { const tk = P()?.take; if (tk?._liveFrom !== undefined && !on && tk._liveRecording) { tk._liveRecording = false; tk._histKey = null; tk._intKey = null; } }   // (recording ended: one last build, then it is left alone)
    if (on && !P().take) { pps = 40; followHold = false; }
    drawBar(); timeEl = null; drawLanes();
    if (on) kick();
  });
  // A finished recording goes to the list; it is reviewed only when opened (the canvas stays yours).
  app.on('take', () => { loadTakes(); drawBar(); drawLanes(); });
  attach();
}
