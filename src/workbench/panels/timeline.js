/**
 * Timeline (transport after underscores): record, review and edit takes. Clips are rectangles on
 * tracks: drag to move, drag the right edge to retime, double-click narration or titles to edit,
 * right-click for more. The selected clip's properties are in Properties.
 */
import { askConfirm, askText } from '../dialog.js';
import { editInPlace, editable, h } from '../ui.js';
import { icon } from '../icons.js';
import { duration, summarize, touch, clipId, TRACKS, TRACK_NAMES, readingTime, createTake, diffDocs, docAt, tracksOf, addTrack, laneOf } from '../../process/take.js';
import { showMenu } from '../menu.js';
import { createTimelineTicks, formatTimecode, formatMusicalPosition, secondsToFrame } from '../../time/transport.js';
import { RULERS, FPS_CHOICES, QUANT_CHOICES, SNAP_CHOICES, snapStep, timeContext } from '../../time/sceneTransport.js';

const TRACK_LABEL = { title: 'Titles', say: 'Narration', draw: 'Drawing', action: 'Actions', camera: 'Camera', audio: 'Audio' };
const fmt = ms => { const s = Math.max(0, ms) / 1000, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
const RULER_NAMES = { time: 'Minutes and seconds', beats: 'Bars, beats and sixteenths', frames: 'Frames' };
const RULER_MODE = { time: 'timecode', beats: 'beats', frames: 'frame' };   // (the names src/time/transport.js uses)

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
  let pps = 60;             // pixels per second
  let selected = null;
  const bar = h('div', { class: 'wb-tl-bar' });
  const labels = h('div', { class: 'wb-tl-labels' });
  const lanes = h('div', { class: 'wb-tl-lanes', tabIndex: 0 });
  const body = h('div', { class: 'wb-tl-body' }, labels, lanes);
  root.append(h('div', { class: 'wb-tl' }, bar, body));

  // Selecting only moves the highlight (rebuilding the lanes would replace a clip mid-drag).
  const select = c => {
    selected = c; app.selectedClip = c;
    for (const el of lanes.querySelectorAll('.wb-tl-clip')) el.classList.toggle('sel', Boolean(c) && el.dataset.id === c.id);
    app.emit('clip-select', c);
  };
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
    const quant = h('select', { class: 'wb-select', title: 'Round how long each path takes to a division (a path can choose its own in Properties)' }, ...QUANT_CHOICES.map(([v, l]) => h('option', { value: v, selected: v === st.quant }, v ? `⌊${l}⌋` : 'Free')));
    quant.addEventListener('change', () => { p.setSettings({ quant: quant.value }); quant.blur(); });
    const cell = h('button', { class: 'wb-icon-btn', type: 'button', title: 'A beat is one minor cell of the canvas grid', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 4h16v16H4zM4 12h16M12 4v16"/></svg>', onclick: () => { const g = app.canvas.grid; p.setSettings({ beatUnits: Math.round((g.spacing / Math.max(1, g.subdivisions)) * 100) / 100 }); } });
    const fps = h('select', { class: 'wb-select', title: 'Frames a second' }, ...FPS_CHOICES.map(f => h('option', { value: f, selected: f === st.fps }, `${f} fps`)));
    fps.addEventListener('change', () => { p.setSettings({ fps: Number(fps.value) }); fps.blur(); });
    const rate = h('select', { class: 'wb-select', title: 'Playback rate' }, ...[0.5, 1, 2, 4, 8].map(r => h('option', { value: r, selected: r === (p?.rate || 1) }, `${r}×`)));
    rate.addEventListener('change', () => { p.rate = Number(rate.value); rate.blur(); });
    bar.replaceChildren(...[
      h('button', { class: `wb-icon-btn wb-tl-rec${rec ? ' on' : ''}`, title: rec ? 'Stop recording (the take goes to Assets)' : 'Record: everything that happens becomes a take', html: rec ? '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" width="14" height="14"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg>', onclick: () => (rec ? R().stop() : R().start()) }),
      h('button', { class: 'wb-icon-btn', title: 'Play / pause (Space in the timeline)', html: p?.playing ? '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="6" y="5" width="4" height="14" fill="currentColor"/><rect x="14" y="5" width="4" height="14" fill="currentColor"/></svg>' : icon('play'), onclick: () => p.toggle() }),
      h('span', { class: 'wb-tl-time' }, rec && !take ? `● ${fmt(R().now())}` : stampOf(p.t, p.duration)),
      ruler,
      st.ruler === 'frames' ? fps : tempo,
      st.ruler === 'frames' ? null : sig,
      units, cell, snapSel, quant,
      rate,
      h('button', { class: `wb-icon-btn${p?.loop ? ' on' : ''}`, title: p.loopRange ? 'Loop the marked range (Shift-drag the ruler to mark one; right-click it to clear)' : 'Loop (Shift-drag the ruler to mark a range)', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12a6 6 0 016-6h8l-3-3M20 12a6 6 0 01-6 6H6l3 3"/></svg>', onclick: () => { p.loop = !p.loop; drawBar(); drawLanes(); } }),
      sel,
      h('button', { class: 'wb-btn', title: 'Add at the playhead', disabled: !take, onclick: e => showMenu(addItems(), e.clientX, e.clientY) }, '+ Add'),
      take?.original
        ? h('button', { class: 'wb-btn', title: 'Back to the take this summary was made from (the summary is discarded unless saved)', onclick: () => { const o = take.original; P().load(o); select(null); fitZoom(); drawBar(); drawLanes(); } }, 'Original')
        : h('button', { class: 'wb-btn', title: 'A short-form summary: narration kept, the drawing brisk, analysis and waiting sped through, a hold at the end', disabled: !take || Boolean(take.summaryOf) || /\(summary\)$/.test(take.title), onclick: makeSummary }, 'Summary'),
      h('button', { class: 'wb-btn', title: 'Make a live walkthrough from this take (steps from narration; the drawing replayed with the guide)', disabled: !take, onclick: () => app.walkthroughs.fromTake(p.take).then(w => app.log(`Walkthrough “${w.title}” is in Docs → Walkthroughs and the palette.`)) }, 'Walkthrough'),
      h('button', { class: 'wb-btn', title: 'Export', disabled: !take, onclick: e => showMenu(exportItems(), e.clientX, e.clientY) }, 'Export'),
      h('button', { class: 'wb-btn', title: 'Save the edited take to Assets', disabled: !take, onclick: saveTake }, 'Save'),
      take ? h('button', { class: 'wb-icon-btn', title: 'Close the take (back to your drawing)', html: icon('close'), onclick: () => { p.close(); select(null); drawBar(); drawLanes(); } }) : null].filter(Boolean));
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
      { label: 'Track', items: TRACKS.map(k => ({ label: TRACK_NAMES[k], run: () => { addTrack(P().take, k); drawLanes(); } })) },
      '-',
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
  const live = () => (!P()?.take && R()?.recording ? R().take : null);
  // The playhead is one element moved by a transform every frame; lanes are rebuilt only when clips change.
  const playhead = h('div', { class: 'wb-tl-playhead' });
  let laneWidth = 0;
  const setHead = ms => { playhead.style.transform = `translateX(${x(ms)}px)`; };
  // Follow in pages: when the playhead nears the right edge, jump so it sits near the left.
  const follow = ms => {
    const hx = x(ms), left = lanes.scrollLeft, w = lanes.clientWidth;
    if (hx > left + w * 0.9 || hx < left) lanes.scrollLeft = Math.max(0, hx - w * 0.2);
  };
  const drawLanes = () => {
    const p = P(), rec = live(), take = p?.take || rec;
    const tracks = take ? tracksOf(take) : TRACKS.map(k => ({ id: k, kind: k, name: TRACK_NAMES[k] }));
    labels.replaceChildren(h('div', { class: 'wb-tl-rulerlabel' }), ...tracks.map(tr => trackLabel(tr, take, Boolean(rec))));
    // (without a take the lanes are empty and the playhead still runs: scores play on it)
    const now = rec ? R().now() : p.t;
    const d = rec ? now : p.duration, W = Math.max(lanes.clientWidth, x(d) + (rec ? lanes.clientWidth : 120));
    laneWidth = W;
    const st = S();
    const ruler = h('div', { class: 'wb-tl-ruler', style: { width: `${W}px` } });
    if (st.ruler === 'time') {
      const step = pps > 80 ? 1 : pps > 25 ? 5 : pps > 8 ? 10 : 30;
      for (let s = 0; s * 1000 <= d + step * 1000; s += step) ruler.append(h('span', { style: { left: `${x(s * 1000)}px` } }, fmt(s * 1000).replace(/\.0$/, '')));
    } else {
      // Bars and beats, or frames: the ticks and labels of the Underscores ruler.
      const secs = W / pps;
      for (const k of createTimelineTicks(secs, 12, { mode: RULER_MODE[st.ruler], rangeStart: 0, rangeEnd: secs, pixelWidth: W, fps: st.fps, tempo: st.tempo, signature: st.signature })) {
        const label = !k.showLabel ? '' : st.ruler === 'beats' ? formatMusicalPosition(k.time, st.tempo, st.signature).replace(/(\.1)?\.1$/, '') : String(secondsToFrame(k.time, st.fps));
        ruler.append(h('span', { class: k.major ? 'major' : 'minor', style: { left: `${x(k.time * 1000)}px` } }, label));
      }
    }
    // The grid's lines over the lanes (each step, and the bars more strongly in the beats ruler).
    const step = snapStep(st, pps) * pps, barPx = (60 / st.tempo) * (4 / st.signature.denominator) * st.signature.numerator * pps;
    const gridStyle = step >= 4 ? { backgroundImage: [st.ruler === 'beats' && barPx > step ? `repeating-linear-gradient(90deg, var(--wb-tl-grid-strong) 0 1px, transparent 1px ${barPx}px)` : null, `repeating-linear-gradient(90deg, var(--wb-tl-grid) 0 1px, transparent 1px ${step}px)`].filter(Boolean).join(', ') } : {};
    const rows = tracks.map(tr => {
      const row = h('div', { class: `wb-tl-row${tr.muted ? ' muted' : ''}`, 'data-track': tr.id, 'data-kind': tr.kind, style: { width: `${W}px`, ...gridStyle } });
      for (const c of (take?.clips || []).filter(c => laneOf(c) === tr.id)) row.append(clipEl(c, Boolean(rec)));
      return row;
    });
    playhead.classList.toggle('live', Boolean(rec));
    // The loop range: a band over the lanes (Shift-drag anywhere on the ruler or lanes to mark one; drag its edges to adjust the in and out).
    const lr = p.loopRange;
    const band = h('div', { class: `wb-tl-loop${p.loop ? ' on' : ''}`, style: lr ? { left: `${x(lr[0])}px`, width: `${x(lr[1] - lr[0])}px` } : { display: 'none' } });
    for (const side of ['in', 'out']) {
      const hd = h('div', { class: `wb-tl-loop-h ${side}`, title: side === 'in' ? 'Loop in: drag (Alt: any time)' : 'Loop out: drag (Alt: any time)' });
      hd.addEventListener('pointerdown', ev => {
        ev.stopPropagation(); ev.preventDefault();
        const mv = e2 => {
          const cur = p.loopRange; if (!cur) return;
          const t = snapped(e2);
          const [lo, hi] = side === 'in' ? [Math.min(t, cur[1] - 20), cur[1]] : [cur[0], Math.max(t, cur[0] + 20)];
          p.setSettings({ loop: { start: lo / 1000, end: hi / 1000 } });
        };
        const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); drawLanes(); };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
      });
      band.append(hd);
    }
    lanes.replaceChildren(ruler, ...rows, band, playhead);
    setHead(now);
    if (rec) return;   // read-only until the recording stops
    // Scrub by clicking or dragging on the ruler or empty lanes.
    const at = ev => { const r = lanes.getBoundingClientRect(); return ((ev.clientX - r.left + lanes.scrollLeft) / pps) * 1000; };
    // The grid (the bar's ⊞ select): the playhead, the loop range and clips fall on it; Alt for any time. With the grid off, Ctrl snaps to the ruler's divisions.
    const grid = ev => { const q = snapStep(st, pps) || (ev.ctrlKey ? snapStep({ ...st, snap: 'auto' }, pps) : 0); return ev.altKey ? 0 : q * 1000; };
    const snapMs = (ms, ev) => { const q = grid(ev); return q ? Math.max(0, Math.round(ms / q) * q) : Math.max(0, Math.round(ms)); };
    const scrub = ev => p.seek(snapMs(at(ev), ev));
    const snapped = ev => snapMs(at(ev), ev);
    ruler.addEventListener('contextmenu', ev => {
      ev.preventDefault();
      showMenu([{ label: 'Clear the loop range', disabled: !p.loopRange, run: () => p.setSettings({ loop: { start: 0, end: 0 } }) }], ev.clientX, ev.clientY);
    });
    for (const el of [ruler, ...rows]) el.addEventListener('pointerdown', ev => {
      if (ev.target.closest('.wb-tl-clip')) return;
      select(null);
      if (ev.shiftKey) {
        // Mark a loop range: drag from where you press.
        const a = snapped(ev);
        const mv = e2 => { const b = snapped(e2); band.style.display = ''; band.style.left = `${x(Math.min(a, b))}px`; band.style.width = `${x(Math.abs(b - a))}px`; };
        const up = e2 => {
          window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up);
          const b = snapped(e2), lo = Math.min(a, b), hi = Math.max(a, b);
          p.setSettings({ loop: hi - lo >= 20 ? { start: lo / 1000, end: hi / 1000 } : { start: 0, end: 0 } });
          if (hi - lo >= 20 && !p.loop) p.loop = true;
          drawBar(); drawLanes();
        };
        window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
        return;
      }
      scrub(ev);
      const mv = e2 => scrub(e2), up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
  };

  const trackLabel = (tr, take, readOnly) => {
    const el = h('div', { class: `wb-tl-label${tr.muted ? ' muted' : ''}`, 'data-track-label': tr.id, title: `${TRACK_NAMES[tr.kind] || tr.kind} track · right-click for more` },
      editable(h('span', { class: 'wb-tl-labeltext' }, tr.name), `track:${tr.id}`, () => tr.name, v => { tr.name = v; drawLanes(); }),
      take && !readOnly ? h('button', { class: 'wb-tl-mute', title: tr.muted ? 'Unmute' : 'Mute (the track does not play)', onclick: ev => { ev.stopPropagation(); tr.muted = !tr.muted; edited(); } }, tr.muted ? '○' : '●') : null);
    if (take && !readOnly) {
      el.addEventListener('dblclick', () => editInPlace(el.querySelector('.wb-tl-labeltext'), v => { tr.name = v; drawLanes(); }));
      el.addEventListener('contextmenu', ev => { ev.preventDefault(); showMenu(trackMenu(tr, take), ev.clientX, ev.clientY); });
    }
    return el;
  };
  const trackMenu = (tr, take) => [
    { label: 'Rename', run: () => { const el = document.querySelector(`[data-track-label="${CSS.escape(tr.id)}"] .wb-tl-labeltext`); if (el) editInPlace(el, v => { tr.name = v; drawLanes(); }); } },
    { label: tr.muted ? 'Unmute' : 'Mute', run: () => { tr.muted = !tr.muted; edited(); } },
    { label: `Add a ${(TRACK_NAMES[tr.kind] || tr.kind).toLowerCase()} track`, run: () => { addTrack(take, tr.kind); drawLanes(); } },
    '-',
    { label: 'Delete track', hint: 'Its clips go too', disabled: tracksOf(take).filter(t => t.kind === tr.kind).length < 2 && take.clips.some(c => laneOf(c) === tr.id), run: () => { take.clips = take.clips.filter(c => laneOf(c) !== tr.id); take.tracks = take.tracks.filter(t => t !== tr); edited(); } }
  ];

  const clipEl = (c, readOnly = false) => {
    const w = Math.max(6, x(c.dur || 0));
    const text = c.track === 'say' || c.track === 'title' ? c.text : c.track === 'draw' ? drawLabel(c) : c.track === 'camera' ? `${Math.round((c.z || 1) * 100)}%` : c.label || c.name || '';
    const el = h('div', { class: `wb-tl-clip t-${c.track}${selected?.id === c.id ? ' sel' : ''}`, 'data-id': c.id, style: { left: `${x(c.start)}px`, width: `${w}px` }, title: `${TRACK_LABEL[c.track]} · ${fmt(c.start)} · ${(c.dur / 1000).toFixed(1)} s\n${text}` },
      h('span', { class: 'wb-tl-cliptext' }, text), h('span', { class: 'wb-tl-grip', title: 'Drag to retime' }));
    if (c.track === 'audio' && c.peaks?.length) {
      const cv = h('canvas', { class: 'wb-tl-wave', width: Math.max(8, Math.round(w)), height: 15 });
      const g = cv.getContext('2d'); g.fillStyle = 'rgba(40,30,36,0.45)';
      const n = c.peaks.length;
      for (let i = 0; i < cv.width; i++) { const p = c.peaks[Math.floor((i / cv.width) * n)] || 0; const hh = Math.max(1, p * 14); g.fillRect(i, 7.5 - hh / 2, 1, hh); }
      el.prepend(cv);
    }
    if (readOnly) return el;
    el.addEventListener('pointerdown', ev => {
      if (ev.button !== 0) return;
      ev.stopPropagation(); select(c);
      const grip = ev.target.classList.contains('wb-tl-grip');
      const x0 = ev.clientX, s0 = c.start, d0 = c.dur;
      const mv = e2 => {
        const dt = ((e2.clientX - x0) / pps) * 1000;
        // On the grid (Alt or Shift: free): the start, or the end when the right edge is dragged.
        const free = e2.altKey || e2.shiftKey, q = free ? 0 : snapStep(S(), pps) * 1000;
        const on = v => (q ? Math.round(v / q) * q : v);
        if (grip) c.dur = Math.max(q || 100, Math.round(on(s0 + d0 + dt) - s0)); else c.start = Math.max(0, Math.round(on(s0 + dt)));
        el.style.left = `${x(c.start)}px`; el.style.width = `${Math.max(6, x(c.dur))}px`;
      };
      const lane0 = laneOf(c);
      let lane = lane0;
      const mvLane = e2 => {
        if (grip) return;
        const row = document.elementFromPoint(e2.clientX, e2.clientY)?.closest?.('.wb-tl-row');
        if (row && row.dataset.kind === c.track && row.dataset.track !== lane) { lane = row.dataset.track; row.append(el); }
      };
      window.addEventListener('pointermove', mvLane);
      const up = () => {
        window.removeEventListener('pointermove', mv); window.removeEventListener('pointermove', mvLane); window.removeEventListener('pointerup', up);
        if (lane !== lane0) c.lane = lane;
        if (c.start !== s0 || c.dur !== d0 || lane !== lane0) edited();
      };
      window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
    });
    el.addEventListener('dblclick', async () => { if (c.track === 'say' || c.track === 'title') { const v = await askText(c.track === 'say' ? 'Narration' : 'Title', c.text); if (v !== null) { c.text = v; edited(); } } else P().seek(c.start); });
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

  // Drop from Assets: sound → an audio clip, text → narration, a drawing → a drawing clip that reveals it.
  const blobURL = blob => new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.readAsDataURL(blob); });
  lanes.addEventListener('dragover', ev => { if ([...ev.dataTransfer.types].some(t => t === 'text/asset-id' || t === 'application/x-ams-history')) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'copy'; lanes.classList.add('drop'); } });
  lanes.addEventListener('dragleave', ev => { if (!lanes.contains(ev.relatedTarget)) lanes.classList.remove('drop'); });
  lanes.addEventListener('drop', async ev => {
    lanes.classList.remove('drop');
    ev.preventDefault();
    if (R().recording) { app.log('Stop recording to add media.'); return; }
    // History entries → drawing clips, in order, from the drop point.
    const hist = ev.dataTransfer.getData('application/x-ams-history');
    if (hist) {
      const ids = JSON.parse(hist);
      const H = app.history;
      if (!P().take) {
        const first = Math.min(...ids.map(i => H.indexOf(i)));
        P().load(createTake({ title: 'Untitled take', baseline: JSON.parse(JSON.stringify(H.stateAfter(first - 1))) })); fitZoom();
      }
      const r0 = lanes.getBoundingClientRect();
      const t0 = Math.max(0, Math.round(((ev.clientX - r0.left + lanes.scrollLeft) / pps) * 1000));
      const row0 = document.elementFromPoint(ev.clientX, ev.clientY)?.closest?.('.wb-tl-row');
      const lane = row0?.dataset.kind === 'draw' ? { lane: row0.dataset.track } : {};
      for (const c of H.clipsFrom(ids, t0)) P().take.clips.push({ id: clipId(), ...c, ...lane });
      edited(); drawBar(); fitZoom(); drawLanes();
      app.log(`Added ${ids.length} change${ids.length === 1 ? '' : 's'} from History at ${fmt(t0)}.`);
      return;
    }
    const id = ev.dataTransfer.getData('text/asset-id');
    if (!id) return;
    const a = await app.assetStore.get(id);
    if (!a) return;
    if (!P().take) { P().load(createTake({ title: 'Untitled take', baseline: JSON.parse(JSON.stringify(app.store.doc)) })); fitZoom(); }
    const r = lanes.getBoundingClientRect();
    const t = Math.max(0, Math.round(((ev.clientX - r.left + lanes.scrollLeft) / pps) * 1000));
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

  lanes.addEventListener('wheel', ev => { if (!(ev.metaKey || ev.ctrlKey)) return; ev.preventDefault(); pps = Math.max(2, Math.min(600, pps * Math.exp(-ev.deltaY * 0.004))); drawLanes(); }, { passive: false });
  lanes.addEventListener('keydown', ev => {
    if (ev.key === ' ' || ev.key === 'Delete' || ev.key === 'Backspace') ev.stopPropagation();   // (other keys, the transport's Home and End among them, reach the shortcuts)
    if (ev.key === ' ') { ev.preventDefault(); P().toggle(); }
    if ((ev.key === 'Delete' || ev.key === 'Backspace') && selected) { ev.preventDefault(); deleteClip(selected); }
  });

  let lastPlaying = false;
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
    if ((rec || !p.take) && x(t) > laneWidth - 60) drawLanes();          // grow a screen at a time
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
  };
  const sync = () => {
    const p = P(); if (!p) return;
    checkSettings();
    if (lastPlaying !== p.playing) { lastPlaying = p.playing; drawBar(); timeEl = null; }   // redraw the bar only when play/pause flips
    if (p.playing) kick(); else { setHead(p.t); timeEl ||= bar.querySelector('.wb-tl-time'); if (timeEl) timeEl.textContent = stampOf(p.t, p.duration); }
  };
  const attach = () => { if (!P() || !R()) return setTimeout(attach, 30); P().on(sync); app.store.subscribe(checkSettings); settingsKey = JSON.stringify({ ...P().settings, mixer: 0 }); drawBar(); drawLanes(); loadTakes(); };
  // While recording, new clips redraw the lanes (at most every 250 ms); the loop moves the playhead.
  let liveQueued = false;
  const liveRedraw = () => { if (liveQueued) return; liveQueued = true; setTimeout(() => { liveQueued = false; if (live()) drawLanes(); }, 250); };
  app.on('recording-update', liveRedraw);
  app.on('recording', on => {
    if (on && !P().take) pps = 40;
    drawBar(); timeEl = null; drawLanes();
    if (on) kick();
  });
  // A finished recording goes to the list; it is reviewed only when opened (the canvas stays yours).
  app.on('take', () => { loadTakes(); drawBar(); drawLanes(); });
  attach();
}
