/**
 * Properties: the selected element(s), or the current tool's defaults when nothing is selected.
 * Every field is part of the record: role, stage, brush and its parameters, color,
 * the reason ("why"), and who made it.
 */
import { h, row, numberField, selectField, section, esc } from '../ui.js';
import { icon } from '../icons.js';
import { rangeInput, paintRange } from '../rangeInput.js';
import { colorField } from '../colorPicker.js';
import { BRUSHES, brushesForRole, resolveParams } from '../../process/brushes.js';
import { ROLES, BLENDS } from '../../process/document.js';
import { boardById, boardsOf, marksOf, trainBoard, rateOf } from '../../process/boards.js';
import { fxEditor } from './fxEditor.js';
import { SCULPTS, sculptParams } from '../../process/sculpt.js';
import { NOTE_STYLES, NOTE_FONTS, noteProps } from '../../process/notes.js';

export function mountProperties(el, app) {
  const render = () => {
    el.innerHTML = '';
    if (app.selectedClip && app.player?.take?.clips.includes(app.selectedClip)) return renderClip(app.selectedClip);
    const sel = app.selectedElements();
    if (!sel.length && app.selectedAsset) { renderAsset(app.selectedAsset); return; }
    if (!sel.length && app.canvas?.selectedBoard) return renderBoard(app.canvas.selectedBoard);
    if (!sel.length) return renderDefaults();
    const e = sel[0];
    const multi = sel.length > 1;
    const patchAll = (patch, label) => {
      const before = JSON.stringify(app.store.doc);
      for (const s of sel) {
        const target = app.store.doc.elements.find(x => x.id === s.id);
        if (!target) continue;
        if (patch.realize) target.realize = { ...target.realize, ...patch.realize, params: { ...target.realize.params, ...(patch.realize.params || {}) } };
        for (const [k, v] of Object.entries(patch)) if (k !== 'realize') target[k] = v;
      }
      app.store.commitFrom(before, label);
    };
    el.append(h('div', { class: 'wb-panel-title' }, multi ? `${sel.length} elements` : `${e.role}`, h('span', { class: 'wb-muted' }, multi ? '' : ` · ${e.points.length} pts${e.points.length > 1 ? ` · ${Math.round(e.points[e.points.length - 1][2])} ms` : ''}`)));

    el.append(section('Element', true,
      row('Role', selectField(Object.keys(ROLES).map(r => [r, r]), e.role, v => {
        const brush = BRUSHES[e.realize.brush]?.roles.includes(v) ? e.realize.brush : brushesForRole(v, app.store.doc)[0]?.id || 'ink';
        patchAll({ role: v, realize: { brush, params: {} }, closed: v === 'plane' ? true : e.closed }, 'role');
      }), ROLES[e.role]),
      row('Stage', selectField(app.store.doc.stages.map(s => [s.id, s.name]), e.stage, v => patchAll({ stage: v }, 'stage'))),
      row('Color', colorField(e.color, v => { patchAll({ color: v }, 'color'); if (e.role === 'note') app.setDefaults('note', { color: v }); }, { app })),
      e.role === 'note' ? row('Text', noteText(e, v => patchAll({ text: v }, 'note'))) : null
    ));
    if (e.role === 'note') el.append(noteSection(noteProps(e), patch => {
      const before = JSON.stringify(app.store.doc);
      for (const s of sel) { const t = app.store.doc.elements.find(x => x.id === s.id); if (t?.role === 'note') t.note = { ...(t.note || {}), ...patch }; }
      app.store.commitFrom(before, 'note style');
      // The next note starts from the last one you styled.
      const t = app.store.doc.elements.find(x => x.id === e.id);
      if (t) app.setDefaults('note', { note: { ...(t.note || {}) }, color: t.color });
    }, app));
    else el.append(brushSection(e.role, e.realize, realize => patchAll({ realize }, 'brush'), app.store.doc));
    el.append(lookSection(e, patch => patchAll(patch, 'look')));
    el.append(section('Reason', true,
      whyField(e.why, v => patchAll({ why: v }, 'why')),
      h('div', { class: 'wb-muted wb-small' }, multi ? '' : `By ${esc(e.by?.name || 'unknown')} (${esc(e.by?.kind || '')}) · seed ${e.seed}`)
    ));
  };

  /** The sculpt tool: which one, brush radius and strength, and the tool's own params. */
  const renderSculpt = () => {
    const s = app.sculpt, t = SCULPTS[s.tool];
    const vals = sculptParams(s.tool, s.params[s.tool]);
    el.append(h('div', { class: 'wb-panel-title' }, 'Sculpt', h('span', { class: 'wb-muted' }, ` · ${t.label}`)));
    el.append(section('Brush', true,
      row('Tool', selectField(Object.entries(SCULPTS).map(([id, x]) => [id, x.label]), s.tool, v => app.setSculpt({ tool: v })), t.doc),
      row('Radius', numberField({ value: Math.round(s.radius), min: 4, max: 400, step: 1, def: 40, title: 'Brush radius in screen pixels ([ and ])', onChange: v => app.setSculpt({ radius: v }) })),
      row('Strength', numberField({ value: s.strength, min: 0.02, max: 1, step: 0.01, def: 0.5, title: 'Shift+[ and Shift+]', onChange: v => app.setSculpt({ strength: v }) })),
      ...t.params.map(p => row(p.label, numberField({ value: vals[p.key], min: p.min, max: p.max, step: p.step, def: p.default, title: p.doc, onChange: v => app.setSculpt({ params: { [p.key]: v } }) }), p.doc)),
      h('div', { class: 'wb-row wb-row-actions' }, h('button', { class: 'wb-btn', title: 'Sculpt tools are code: fork one or write your own', onclick: () => app.openCode?.('sculpt', s.tool) }, 'Show code'))
    ));
  };

  /**
   * An asset (selected in Assets): its title, folder, tags and rating, and, for a stream or a clip, its
   * default state: what it starts with when dragged into a scene (the address, size and range of a stream;
   * speed, loop, volume and how it shows under its board). Kept in the asset, not in a source file.
   */
  let assetToken = 0;
  const renderAsset = async id => {
    const token = ++assetToken;
    const a = await app.assetStore.get(id);
    if (token !== assetToken || !a) return;
    if (el.dataset.asset !== id) el.innerHTML = '';
    el.dataset.asset = id;
    el.innerHTML = '';
    const save = patch => app.assetStore.update(id, patch);
    const setMeta = fn => { const meta = structuredClone(a.meta || {}); fn(meta); Object.assign(a, { meta }); return save({ meta }); };
    const text = (value, onChange, opts = {}) => {
      const i = h('input', { class: 'wb-inline', value: value ?? '', ...opts });
      i.addEventListener('change', () => onChange(i.value.trim()));
      i.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') i.blur(); });
      return i;
    };
    const stream = a.meta?.stream, defaults = a.meta?.defaults || {};
    el.append(h('div', { class: 'wb-panel-title' }, 'Asset', h('span', { class: 'wb-muted' }, ` · ${a.kind}`)));
    el.append(section('Asset', true,
      row('Title', text(a.title, v => v && save({ title: v }))),
      row('Folder', text(a.folder, v => save({ folder: v }), { title: 'Folders are paths: Streams/Faces' })),
      row('Tags', text((a.tags || []).join(', '), v => save({ tags: v.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean) }), { title: 'Comma-separated' })),
      row('Rating', numberField({ value: a.rating || 0, min: 0, max: 5, step: 1, def: 0, onChange: (v, { final }) => { if (final) save({ rating: Math.round(v) }); } }))));
    if (stream) {
      el.append(section('Stream', true,
        row('Address', text(stream.page, v => v && setMeta(m => { m.stream.page = v; }), { title: 'A video or picture URL, or a Wikipedia / Commons File: page' })),
        row('Size', selectField([['240', '240p'], ['480', '480p'], ['1080', '1080p'], ['original', 'original']], String(stream.quality || '480'), v => setMeta(m => { m.stream.quality = v; }), 'A wiki video: the version to stream (smaller is lighter and quicker to seek)')),
        row('In', numberField({ value: stream.start ?? 0, min: 0, max: 100000, step: 0.5, def: 0, title: 'Seconds: where playing starts', onChange: (v, { final }) => { if (final) setMeta(m => { if (v > 0) m.stream.start = v; else delete m.stream.start; }); } })),
        row('Out', numberField({ value: stream.end ?? 0, min: 0, max: 100000, step: 0.5, def: 0, title: 'Seconds: where playing ends (0: the end of the clip)', onChange: (v, { final }) => { if (final) setMeta(m => { if (v > 0) m.stream.end = v; else delete m.stream.end; }); } })),
        row('Note', text(stream.note || a.meta?.note, v => setMeta(m => { m.stream.note = v; m.note = v; }))),
        row('Licence', text(a.meta?.license, v => setMeta(m => { m.license = v; }))),
        row('Author', text(a.meta?.artist, v => setMeta(m => { m.artist = v; })))));
    }
    // What a clip starts with in a scene (a stream, a video or a GIF).
    if (stream || /^(video|image)\//.test(a.blob?.type || '')) {
      const d = k => (v, opts = {}) => setMeta(m => { m.defaults = m.defaults || {}; if (v === '' || v == null) delete m.defaults[k]; else m.defaults[k] = v; });
      el.append(section('Starts with', true,
        row('Speed', selectField([['', 'as is'], ['0', 'paused'], ['0.25', '¼×'], ['0.5', '½×'], ['1', '1×'], ['2', '2×'], ['4', '4×']], defaults.speed == null ? '' : String(defaults.speed), v => d('speed')(v === '' ? '' : Number(v)), 'A movie waits paused by default, a GIF plays')),
        row('Loop', selectField([['', 'as is'], ['1', 'loop'], ['0', 'stop at the end']], defaults.loop == null ? '' : defaults.loop ? '1' : '0', v => d('loop')(v === '' ? '' : v === '1'))),
        row('Volume', numberField({ value: defaults.volume ?? 0, min: 0, max: 1, step: 0.05, def: 0, title: 'Muted (0) unless raised', onChange: (v, { final }) => { if (final) d('volume')(v > 0 ? v : ''); } })),
        row('Opacity', numberField({ value: defaults.opacity ?? 1, min: 0, max: 1, step: 0.05, def: 1, title: 'How much of it shows under its board', onChange: (v, { final }) => { if (final) d('opacity')(v < 1 ? v : ''); } })),
        row('Blend', selectField(BLENDS.map(x => [x, x]), defaults.blend || 'normal', v => d('blend')(v === 'normal' ? '' : v), 'How it mixes with the paper')),
        row('Fit', selectField([['cover', 'Cover'], ['contain', 'Contain']], defaults.fit === 'contain' ? 'contain' : 'cover', v => d('fit')(v === 'cover' ? '' : v)))));
    }
  };
  app.on('asset', () => { if (app.selectedAsset) render(); });

  /** A board: title, size, paper; what it holds. */
  const renderBoard = id => {
    const b = boardById(app.store.doc, id);
    if (!b) return renderDefaults();
    const title = h('input', { class: 'wb-inline', value: b.title });
    title.addEventListener('change', () => { if (title.value.trim()) app.store.updateBoard(b.id, { title: title.value.trim() }); });
    title.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') title.blur(); });
    // Its switches, as glyphs: lock, visibility, title, performance.
    const flag = (key, on, glyphOn, glyphOff, tip) => h('button', { class: `wb-icon-btn${on ? ' on' : ''}`, title: tip, html: icon(on ? glyphOn : glyphOff), onclick: () => app.setBoardFlag(b.id, key, !b[key]) });
    // Play / pause first (as on the board's title: it shows what a click does), for boards that run.
    const runs = b.kind === 'p5' || (!b.kind && Boolean(b.follow || b.source || b.code));
    const live = app.isBoardLive(b.id);
    const play = runs ? h('button', { class: `wb-icon-btn${live ? ' on' : ''}`, title: live ? 'Running: click to pause (a paused board is baked into a picture)' : 'Paused: click to play', html: icon(live ? 'pause' : 'play'), onclick: () => app.toggleBoardRun(b.id) }) : null;
    // Media controls: the player board under a board that shows a clip or a GIF.
    const shown = app.playerShown(b);
    const controls = app.playableSource(b) ? h('button', { class: `wb-icon-btn${shown ? ' on' : ''}`, title: shown ? 'Media controls shown (click to hide them)' : 'Show media controls: play, step, scrub, speed', html: icon(shown ? 'controls' : 'controlsOff'), onclick: () => app.togglePlayer(b) }) : null;
    const flags = h('span', { class: 'wb-board-flags' },
      play,
      controls,
      flag('locked', b.locked, 'lock', 'unlock', b.locked ? 'Locked: its marks and the board stay as they are (click to unlock)' : 'Lock the board (its marks, its place and size)'),
      h('button', { class: `wb-icon-btn${b.hidden ? ' on' : ''}`, title: b.hidden ? 'Hidden: not drawn, not run (click to show)' : 'Hide the board (not drawn, not run)', html: icon(b.hidden ? 'eyeOff' : 'eye'), onclick: () => app.setBoardFlag(b.id, 'hidden', !b.hidden) }),
      h('button', { class: `wb-icon-btn${b.hideLabel ? ' on' : ''}`, title: b.hideLabel ? 'Title hidden (click to show it)' : 'Hide the title above it', html: icon(b.hideLabel ? 'labelOff' : 'label'), onclick: () => app.setBoardFlag(b.id, 'hideLabel', !b.hideLabel) }),
      h('button', { class: `wb-icon-btn${b.hideBorder ? ' on' : ''}`, title: b.hideBorder ? 'Border hidden (click to show it)' : 'Hide its border (the shadow and frame line: the board is only structure)', html: icon(b.hideBorder ? 'borderOff' : 'border'), onclick: () => app.setBoardFlag(b.id, 'hideBorder', !b.hideBorder) }),
      b.code || b.pseudo ? flag('codeMin', b.codeMin, 'codeMin', 'script', b.codeMin ? 'Its code is a bar of tabs on an exported page (click to open it there)' : 'Minimize its code on an exported page: a bar of tabs (Pseudocode, Studio, p5.js), opened by a click') : null,
      flag('mask', b.mask, 'mask', 'maskOff', b.mask ? 'Masked: its marks are cropped to the board (click to let them spill)' : 'Crop its marks to the board (a mask the size of the board)'),
      flag('perf', b.perf, 'gauge', 'gaugeOff', b.perf ? 'Performance shown under it (click to hide; hidden, it is not measured)' : 'Show its performance under it (runs, code time, source fps)'));
    el.append(h('div', { class: 'wb-panel-title' }, 'Board', h('span', { class: 'wb-muted' }, b.main ? ' · main' : ''), h('span', { style: { flex: 1 } }), flags));
    el.append(section('Board', true,
      row('Title', title),
      row('Width', numberField({ value: b.width, min: 40, max: 10000, step: 10, def: 1000, onChange: (v, { final }) => { if (final) app.store.updateBoard(b.id, { width: Math.round(v) }); } })),
      row('Height', numberField({ value: b.height, min: 40, max: 10000, step: 10, def: 1000, onChange: (v, { final }) => { if (final) app.store.updateBoard(b.id, { height: Math.round(v) }); } })),
      row('Redraw', numberField({ value: rateOf(b), min: 0, max: 60, step: 1, def: 0, title: 'Runs a second for a board that follows a source (each with fresh randomness); 0: once per new frame of the source', onChange: (v, { final }) => { if (final) app.store.updateBoard(b.id, { rate: Math.round(v) }); } })),
      row('Paper', colorField(b.ground, v => app.store.updateBoard(b.id, { ground: v }), { title: 'Paper', fallback: '#f3efe6', app })),
      h('div', { class: 'wb-muted wb-small' }, `${marksOf(app.store.doc, b.id).length} marks${!app.embed && trainBoard(app.store.doc) === b.id ? ' · models learn from this board' : ''}`)));
    // Media: the same controls as the player board (play / pause, frame steps, the timeline, speed),
    // for the source this board shows or plays. The values follow the source while this is showing.
    const mediaName = app.playableSource(b);
    media = null;
    // The source under a board (any): how it shows (opacity, blend, fit).
    const look = b.source && b.kind !== 'player' ? [
      row('Opacity', numberField({ value: b.sourceOpacity ?? 0.5, min: 0, max: 1, step: 0.05, def: 0.5, title: 'How much of the source shows under the board’s marks', onChange: v => app.setBoardSourceLook(b.id, { opacity: v }) })),
      row('Blend', selectField(BLENDS.map(x => [x, x]), b.sourceBlend || 'normal', v => app.setBoardSourceLook(b.id, { blend: v }), 'How the source mixes with the paper')),
      row('Fit', selectField([['cover', 'Cover'], ['contain', 'Contain']], b.sourceFit === 'contain' ? 'contain' : 'cover', v => app.setBoardSourceLook(b.id, { fit: v }), 'Cover fills the board (cropped); contain shows all of it'))
    ] : [];
    if (b.source && !mediaName && look.length) el.append(section(`Source · ${b.source}`, true, ...look));
    if (mediaName) {
      const btn = (act, tip, glyph, onclick) => h('button', { class: 'wb-icon-btn', 'data-act': act, title: tip, html: glyph, onclick });
      const step = d => '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="' + (d < 0 ? 'M17 5v14l-9-7zM6 5h2v14H6z' : 'M7 5v14l9-7zM16 5h2v14h-2z') + '"/></svg>';
      const play = btn('play', 'Play / pause', icon('pause'), () => app.mediaAct(mediaName, 'play'));
      const scrub = rangeInput({ min: 0, max: 1000, step: 1, value: 0, title: 'Timeline' });
      let scrubbing = false;
      scrub.addEventListener('pointerdown', () => { scrubbing = true; });
      for (const ev of ['pointerup', 'pointercancel', 'blur']) scrub.addEventListener(ev, () => { scrubbing = false; });
      scrub.addEventListener('input', () => app.mediaAct(mediaName, 'seek', Number(scrub.value) / 1000));
      const time = h('span', { class: 'wb-muted wb-small wb-media-time' });
      const loopBtn = h('button', { class: 'wb-icon-btn', onclick: () => app.mediaAct(mediaName, 'loop') });
      const inBtn = btn('in', 'Set the in point here (playing starts here)', '<b>[</b>', () => app.mediaAct(mediaName, 'in'));
      const outBtn = btn('out', 'Set the out point here (playing ends here)', '<b>]</b>', () => app.mediaAct(mediaName, 'out'));
      const clearBtn = btn('range', 'The whole clip again (clear in and out)', icon('close'), () => app.mediaAct(mediaName, 'range'));
      const rangeText = h('span', { class: 'wb-muted wb-small' });
      // Volume, for a clip that can have sound: muted until raised.
      const mute = h('button', { class: 'wb-icon-btn', title: 'Mute / unmute (muted by default)', html: icon('mute'), onclick: () => app.mediaAct(mediaName, 'mute') });
      const vol = rangeInput({ min: 0, max: 100, step: 1, value: 0, title: 'Volume' });
      vol.addEventListener('input', () => app.mediaAct(mediaName, 'volume', Number(vol.value) / 100));
      const volRow = h('div', { class: 'wb-row', hidden: true }, mute, vol);
      const speed = selectField([['0.25', '¼×'], ['0.5', '½×'], ['1', '1×'], ['2', '2×'], ['4', '4×']], String(app.mediaState(mediaName).speed || 1), v => app.mediaAct(mediaName, 'speed', v), 'Playback speed');
      const t = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;
      media = { name: mediaName, update() {
        const { pos, speed: sp, playing } = app.mediaState(mediaName);
        if (!scrubbing && pos) { scrub.value = String(Math.round(pos.fraction * 1000)); paintRange(scrub); }
        time.textContent = pos ? (pos.duration ? `${t(pos.time)} / ${t(pos.duration)} · ${pos.frame}/${pos.frames}` : `${pos.frame + 1}/${pos.frames}`) : '—';
        if (play.dataset.state !== (playing ? 'pause' : 'play')) { play.dataset.state = playing ? 'pause' : 'play'; play.innerHTML = icon(playing ? 'pause' : 'play'); play.title = playing ? 'Pause' : 'Play'; }
        if (playing && speed.value !== String(sp)) speed.value = String(sp);
        const st = app.mediaState(mediaName), has = app.sources.entries.get(mediaName)?.live?.kind === 'video' && st.sound !== false;
        loopBtn.innerHTML = icon(st.loop ? 'repeat' : 'repeatOff'); loopBtn.title = st.loop ? 'Looping: click to stop at the end' : 'Stops at the end: click to loop';
        loopBtn.classList.toggle('on', st.loop);
        const ranged = st.inP > 0 || st.outP < 1, dur = st.pos?.duration;
        rangeText.textContent = ranged ? (dur ? `${t(st.inP * dur)} – ${t(st.outP * dur)}` : `${Math.round(st.inP * 100)}–${Math.round(st.outP * 100)}%`) : '';
        clearBtn.style.visibility = ranged ? 'visible' : 'hidden';
        volRow.hidden = !has;
        if (has) {
          const muted = st.volume <= 0;
          if (mute.dataset.state !== (muted ? 'mute' : 'volume')) { mute.dataset.state = muted ? 'mute' : 'volume'; mute.innerHTML = icon(muted ? 'mute' : 'volume'); }
          if (document.activeElement !== vol) { vol.value = String(Math.round(st.volume * 100)); paintRange(vol); }
        }
      } };
      el.append(section(`Media · ${mediaName}`, true,
        h('div', { class: 'wb-row' }, play, btn('back', 'Back a frame', step(-1), () => app.mediaAct(mediaName, 'step', -1)), btn('fwd', 'Forward a frame', step(1), () => app.mediaAct(mediaName, 'step', 1)), h('span', { style: { flex: 1 } }), speed),
        h('div', { class: 'wb-row' }, scrub),
        time,
        h('div', { class: 'wb-row' }, loopBtn, inBtn, outBtn, clearBtn, rangeText),
        volRow, ...look));
      media.update();
    }
    el.append(...boardFxSections(app, b));
    const text = h('textarea', { class: 'wb-why', rows: 6, placeholder: 'What this board says (Markdown): on the exported page, under the picture' });
    text.value = b.text || '';
    text.addEventListener('keydown', e => e.stopPropagation());
    text.addEventListener('change', () => app.store.updateBoard(b.id, { text: text.value }));
    el.append(section('Text', true, text));
  };

  const renderDefaults = () => {
    const tool = app.toolRole();   // circle and rectangle make planes: the plane's defaults
    if (tool === 'sculpt') return renderSculpt();
    if (!ROLES[tool] && tool !== 'brush') {
      el.append(h('div', { class: 'wb-empty' }, 'Select something, or pick a drawing tool to set its defaults.'));
      return;
    }
    const d = app.defaults(tool);
    el.append(h('div', { class: 'wb-panel-title' }, tool === 'brush' ? 'Brush' : `New ${tool}`, h('span', { class: 'wb-muted' }, tool === 'brush' ? ' · active' : ' · defaults')));
    el.append(section('Element', true,
      row('Color', colorField(d.color, v => app.setDefaults(tool, { color: v }), { app }))
    ));
    if (tool === 'note') el.append(noteSection(noteProps({ note: d.note, color: d.color, points: [] }), patch => app.setDefaults(tool, { note: patch }), app));
    else el.append(brushSection(d.role || tool, d.realize, realize => app.setDefaults(tool, { realize }), app.store.doc));
    // (A tool's smooth path is stored as 'smooth', not as nothing: a guide's default, with nothing stored, is straight.)
    el.append(lookSection(d, patch => app.setDefaults(tool, 'path' in patch ? { ...patch, path: patch.path || 'smooth' } : patch)));
    el.append(section('Reason', true, whyField(d.why || '', v => app.setDefaults(tool, { why: v }), 'Why the next marks are made (kept on each one)')));
  };

  /** A timeline clip: when it plays, how long, and what it says or does. */
  const renderClip = c => {
    const edited = () => app.timelineEdited?.();
    const set = patch => { Object.assign(c, patch); edited(); };
    const fx = patch => { c.fx = { ...(c.fx || {}), ...patch }; edited(); };
    const d = c.diff || {};
    el.append(h('div', { class: 'wb-panel-title' }, `${c.track} clip`, h('span', { class: 'wb-muted' }, ` · ${(c.start / 1000).toFixed(1)} s`)));
    el.append(section('Timing', true,
      row('Start (s)', numberField({ value: +(c.start / 1000).toFixed(2), min: 0, max: 36000, step: 0.1, def: 0, onChange: v => set({ start: Math.round(v * 1000) }) })),
      row('Length (s)', numberField({ value: +(c.dur / 1000).toFixed(2), min: 0, max: 3600, step: 0.1, def: 1, onChange: v => set({ dur: Math.round(v * 1000) }) })),
      (c.track === 'say' || c.track === 'title') ? row('Fade (ms)', numberField({ value: c.fx?.fade ?? 250, min: 0, max: 3000, step: 50, def: 250, onChange: v => fx({ fade: v }) })) : null,
      c.track === 'draw' ? row('Reveal', selectField([['on', 'Stroke by stroke'], ['off', 'All at once']], c.fx?.drawOn === false ? 'off' : 'on', v => fx({ drawOn: v === 'on' }))) : null));
    if (c.track === 'say' || c.track === 'title') {
      const ta = h('textarea', { class: 'wb-why', rows: 3 }); ta.value = c.text || '';
      ta.addEventListener('change', () => set({ text: ta.value }));
      ta.addEventListener('keydown', e => e.stopPropagation());
      el.append(section(c.track === 'say' ? 'Narration' : 'Title', true, ta,
        c.track === 'title' ? row('Subtitle', (() => { const i = h('input', { class: 'wb-inline', value: c.sub || '' }); i.addEventListener('change', () => set({ sub: i.value })); i.addEventListener('keydown', e => e.stopPropagation()); return i; })()) : null));
    }
    if (c.track === 'draw') el.append(section('Change', true, h('div', { class: 'wb-small' }, `${c.label || 'change'} · by ${c.by || 'user'}`), h('div', { class: 'wb-muted wb-small' }, [d.add?.length && `${d.add.length} added`, d.update?.length && `${d.update.length} changed`, d.remove?.length && `${d.remove.length} removed`].filter(Boolean).join(' · ') || 'document settings')));
    if (c.track === 'camera') el.append(section('View', true,
      row('Zoom', numberField({ value: +(c.z || 1).toFixed(2), min: 0.2, max: 20, step: 0.05, def: 1, onChange: v => set({ z: v }) })),
      row('Center x', numberField({ value: +(c.cx ?? 0.5).toFixed(3), min: -1, max: 2, step: 0.01, def: 0.5, onChange: v => set({ cx: v }) })),
      row('Center y', numberField({ value: +(c.cy ?? 0.5).toFixed(3), min: -1, max: 2, step: 0.01, def: 0.5, onChange: v => set({ cy: v }) }))));
    if (c.track === 'action') el.append(section('Action', true, h('div', { class: 'wb-small' }, c.label || c.name), h('pre', { class: 'wb-ref' }, JSON.stringify(c.args || {}, null, 1).slice(0, 800))));
    if (c.track === 'audio') el.append(section('Audio', true, h('div', { class: 'wb-small' }, c.label || 'audio')));
  };

  // The media controls follow the source (a new frame, or a change of speed) while they show.
  let media = null;
  app.sources.on(name => { if (media && (!name || name === media.name)) media.update(); });
  app.store.subscribe(render);
  app.on('clip-select', render);
  app.on('selection', () => { if (app.canvas?.selected.size) app.selectedClip = null; render(); });
  app.on('tool', render);
  app.on('board', render);
  app.on('brush', () => { if (app.tool === 'brush' && !app.selectedElements().length) render(); });
  app.on('sculpt', () => { if (app.tool === 'sculpt' && !app.selectedElements().length) render(); });
  render();
}

/** Opacity and blend mode: every element has them, on top of its brush. */
function lookSection(e, onChange) {
  return section('Look', true,
    row('Opacity', numberField({ value: e.opacity ?? 1, min: 0, max: 1, step: 0.05, def: 1, title: 'The whole element’s opacity (on top of the brush’s own)', onChange: v => onChange({ opacity: v }) })),
    row('Blend', selectField(BLENDS.map(b => [b, b]), e.blend || 'normal', v => onChange({ blend: v }), 'How the element mixes with what is under it')),
    row('Path', selectField([['smooth', 'Smooth'], ['straight', 'Straight']], e.path === 'straight' ? 'straight' : 'smooth', v => onChange({ path: v === 'straight' ? 'straight' : undefined }), 'Smooth: a curve through the points. Straight: straight segments between them')));
}

/** Notes: style, lettering, size, wrap width, background. The text color is the element's color. */
function noteSection(p, onChange, noteApp = null) {
  const bg = colorField(p.bg || '#fbe9a6', v => { bgValue = v; onChange({ bg: v }); }, { title: 'Paper', fallback: '#fbe9a6', app: noteApp });
  let bgValue = p.bg || '#fbe9a6';
  return section('Note', true,
    row('Style', selectField(Object.entries(NOTE_STYLES).map(([k, v]) => [k, v.split(':')[0]]), p.style, v => onChange({ style: v, bg: undefined, font: undefined, size: undefined }), 'Notebook writes on the page; sticky, card and plain are other looks')),
    row('Font', selectField(Object.entries(NOTE_FONTS).map(([k, [label]]) => [k, label]), p.font, v => onChange({ font: v }))),
    row('Size', numberField({ value: Math.round(p.size), min: 6, max: 200, step: 1, def: p.size, title: 'Letter size in artboard units', onChange: v => onChange({ size: v }) })),
    row('Width', numberField({ value: Math.round(p.width), min: 40, max: 2000, step: 5, def: 280, title: 'Wrap width; or drag a side of the note', onChange: v => onChange({ width: v }) })),
    row('Paper', h('div', { class: 'wb-row' }, bg,
      h('label', { class: 'wb-row', title: 'No background: writing straight on the page' }, h('input', { type: 'checkbox', checked: !p.bg, onchange: ev => onChange({ bg: ev.target.checked ? null : bgValue }) }), h('span', {}, 'none')))));
}

function brushSection(role, realize, onChange, doc) {
  const brushes = brushesForRole(role, doc);
  const brushId = realize?.brush || brushes[0]?.id;
  const b = BRUSHES[brushId];
  const params = resolveParams(brushId, realize?.params);
  const box = section('Brush', true,
    row('Brush', selectField(brushes.map(x => [x.id, x.label]), brushId, v => onChange({ brush: v, params: {} })), b?.doc)
  );
  for (const s of b?.params || []) {
    box.append(row(s.label, numberField({
      value: params[s.key], min: s.min, max: s.max, step: s.step, def: s.default, title: s.doc,
      onChange: (v, { final }) => { if (final) onChange({ brush: brushId, params: { [s.key]: v } }); }
    }), s.doc));
  }
  return box;
}

function whyField(value, onChange, placeholder = 'Why is this here?') {
  const ta = h('textarea', { class: 'wb-why', rows: 3, placeholder });
  ta.value = value || '';
  ta.addEventListener('change', () => onChange(ta.value.trim()));
  ta.addEventListener('keydown', e => e.stopPropagation());
  return ta;
}

function noteText(e, onChange) {
  const ta = h('textarea', { class: 'wb-why', rows: 3 });
  ta.value = e.text || '';
  ta.addEventListener('change', () => onChange(ta.value));
  ta.addEventListener('keydown', ev => ev.stopPropagation());
  return ta;
}


/** A board's mask and effects (opt-in): what shows through what, and the effects stacks (its picture's, its mask's, its source's). */
function boardFxSections(app, b) {
  if (b.kind && b.kind !== 'drawing') return [];   // (documents, sketches and players are not composed: see masks.js)
  const doc = app.store.doc, m = b.maskWith;
  const from = h('select', { class: 'wb-select', title: 'What the board shows through: a source (a camera, a picture or clip, a board seen as a stream), or a board of marks' },
    h('option', { value: '' }, '— none —'),
    ...app.sources.list.map(s => h('option', { value: `source:${s.name}`, selected: m?.source === s.name }, s.name)),
    ...boardsOf(doc).filter(x => x.id !== b.id && (!x.kind || x.kind === 'drawing')).map(x => h('option', { value: `board:${x.id}`, selected: m?.board === x.id }, `${x.title} · board`)));
  from.addEventListener('change', () => {
    const v = from.value; from.blur();
    if (!v) return app.setBoardMask(b.id, null);
    const [kind, ref] = [v.slice(0, v.indexOf(':')), v.slice(v.indexOf(':') + 1)];
    app.setBoardMask(b.id, { ...(m || {}), source: kind === 'source' ? ref : undefined, board: kind === 'board' ? ref : undefined, mode: m?.mode || (kind === 'board' ? 'alpha' : 'luma') });
  });
  const patch = (p, opts) => app.setBoardMask(b.id, { ...m, ...p }, opts);
  const maskRows = m ? [
    row('Mode', selectField([['luma', 'Light'], ['alpha', 'Alpha']], m.mode === 'alpha' ? 'alpha' : 'luma', v => patch({ mode: v }), 'Light: where the mask is light, the board shows. Alpha: where the mask is opaque.')),
    row('Invert', h('button', { class: `wb-icon-btn${m.invert ? ' on' : ''}`, title: m.invert ? 'Inverted: click to show where it hid' : 'Show where the mask hides', html: icon('mask'), onclick: () => patch({ invert: !m.invert }) })),
    row('Feather', numberField({ value: m.feather || 0, min: 0, max: 80, step: 1, def: 0, title: 'Soften the mask\'s edge (pixels of the mask)', onChange: (v, { final }) => patch({ feather: v || undefined }, final ? undefined : { transient: true }) })),
    m.source ? row('Fit', selectField([['cover', 'Cover'], ['contain', 'Contain']], m.fit === 'contain' ? 'contain' : 'cover', v => patch({ fit: v === 'contain' ? 'contain' : undefined }), 'How the mask\'s picture fits the board')) : null,
    h('div', { class: 'wb-muted wb-small' }, 'Mask effects'),
    fxEditor({ list: m.fx, app, onChange: (list, { final }) => patch({ fx: list.length ? list : undefined }, final ? undefined : { transient: true }) })
  ] : [];
  return [
    section('Mask', Boolean(m), row('From', from), ...maskRows),
    section('Effects', Boolean(b.fx?.length), fxEditor({ list: b.fx, app, onChange: (list, { final }) => app.setBoardFx(b.id, 'fx', list, final ? undefined : { transient: true }) })),
    b.source ? section('Source effects', Boolean(b.sourceFx?.length), fxEditor({ list: b.sourceFx, app, onChange: (list, { final }) => app.setBoardFx(b.id, 'sourceFx', list, final ? undefined : { transient: true }) })) : null
  ].filter(Boolean);
}
