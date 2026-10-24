/**
 * Properties → Play: a mark's `play` as controls. Nothing here is its own state: every control reads the
 * mark's play (and its emit code) and writes it back, so what you see is the code (Code → Selection shows
 * the same `play: { … }`), and code edits show here. A sound preset is code too: its settings are in a
 * comment on the code's first line, and edit the code by hand and it reads "custom".
 */
import { h, row, numberField, selectField, section } from '../ui.js';
import { brushIcon, nodeIcon, nodeModeIcon } from '../icons.js';
import { objectField, nameOf, resolveMark } from '../objectPicker.js';
import { PRESETS, DEFAULTS, emitFor, readPreset } from '../../score/presets.js';
import { scaleNames } from '../../score/scale.js';
import { PARTS, MARKER, realizeAfter, newPart, canBePath } from '../../process/playparts.js';
import { parseTimeValue } from '../../time/timeValue.js';
import * as R from '../../score/relations.js';
const barAngle = R.barAngle;
import { timeContext, formatDuration, QUANT_CHOICES } from '../../time/sceneTransport.js';
import { pathTime } from '../../score/compile.js';
import { NODE_KINDS, NODE_INFO, MODES, MODE_INFO, GATE_TYPES, normalizeNode } from '../../score/nodes.js';
import { noteName } from '../../score/scale.js';

const TITLES = {
  path: 'A path: a line that can be travelled',
  travel: 'A traveler: a point that runs a path',
  trigger: 'An event: it sounds when something touches it',
  body: 'A body: a point that moves by itself, bounces and collides',
  node: 'A node (Midinous): a note, a controller, a logic gate, a counter… that a traveler reaches on a path, and that sends the signal on'
};
const LOOPS = [['once', '→', 'Once'], ['loop', '↻', 'Loop'], ['pingpong', '⇄', 'Back and forth']];
const SCALES = [['', 'No scale'], ...scaleNames().map(n => [n.toLowerCase().replace(/[^a-z]/g, ''), n])];

/** Change a mark's play in one undo step; its marker brush follows. */
export function editPlay(app, id, fn, label = 'play') {
  app.store.change(label, d => {
    const el = d.elements.find(x => x.id === id);
    if (!el) return;
    const play = structuredClone(el.play || {});
    fn(play, el, d);
    if (Object.keys(play).length) el.play = play; else delete el.play;
    const realize = realizeAfter(el, el.play);
    if (realize !== el.realize) el.realize = { ...realize };
  });
}

/** A time written as a time ('8 beats', '1 bar', '500ms', 2): checked as you leave the field. */
function timeField(app, value, onChange, { placeholder = '', allow = [] } = {}) {
  const input = h('input', { class: 'wb-select wb-time', type: 'text', value: value ?? '', placeholder, spellcheck: 'false', title: 'Seconds, or a time: 8 beats, 1 bar, 500ms, 4n' });
  input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); });
  input.addEventListener('change', () => {
    const v = input.value.trim();
    if (!v) { input.classList.remove('bad'); return onChange(undefined); }
    if (allow.includes(v)) return onChange(v);
    const ok = parseTimeValue(v, timeContext(app.player.settings)).ok;
    input.classList.toggle('bad', !ok);
    if (ok) onChange(/^\d+(\.\d+)?$/.test(v) ? Number(v) : v);
  });
  return input;
}

const textField = (value, onChange, { placeholder = '', title = '' } = {}) => {
  const input = h('input', { class: 'wb-select', type: 'text', value: value ?? '', placeholder, title, spellcheck: 'false' });
  input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') input.blur(); });
  input.addEventListener('change', () => onChange(input.value.trim()));
  return input;
};

/** The name of a mark: its label, or (shown as the hint) its id. */
export function nameRow(app, e) {
  return row('Name', textField(e.label || '', v => app.store.patchElements([e.id], { label: v || null }, 'rename'), { placeholder: e.id, title: 'What this mark is called (links and labels use it). Empty: its id' }));
}

export function playSection(app, e) {
  return section('Play', Boolean(e.play), ...playBody(app, e));
}

/** The controls of Play, as a list of nodes (a section in Properties, a popover at the pointer). */
export function playBody(app, e) {
  const doc = app.store.doc;
  const play = e.play || {};
  const edit = (fn, label) => editPlay(app, e.id, fn, label);
  const view = app.scoreView || {};

  // ---- what it is ----
  const chips = h('div', { class: 'wb-play-chips' }, ...PARTS.map(k => {
    const on = Boolean(play[k]);
    return h('button', {
      class: `wb-icon-btn wb-play-chip${on ? ' on' : ''}`, type: 'button', title: TITLES[k], html: brushIcon(MARKER[k]),
      onclick: () => edit(pl => {
        if (pl[k]) delete pl[k];
        else {
          const path = k === 'travel' ? doc.elements.find(x => x.id !== e.id && x.play?.path && canBePath(x)) : null;
          pl[k] = newPart(k, { path: path ? path.id : '' });
          // A mark moves along a path or by itself, not both.
          if (k === 'travel') delete pl.body; else if (k === 'body') delete pl.travel;
        }
      }, `play ${k}`)
    });
  }),
  h('span', { class: 'wb-play-tools' },
    h('button', { class: `wb-icon-btn${view.names ? ' on' : ''}`, type: 'button', title: 'Show the names of marks that play (a mark with no name shows its id)', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M3 12l7-7h9a2 2 0 012 2v10a2 2 0 01-2 2h-9z"/><circle cx="15.5" cy="9.5" r="1.2" fill="currentColor" stroke="none"/></svg>', onclick: () => app.setScoreView({ names: !view.names }) }),
    h('button', { class: 'wb-icon-btn', type: 'button', title: 'The same as code (Code → Selection)', html: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5M14 5l-4 14"/></svg>', onclick: () => app.openCode?.('selection') })));

  const parts = [chips];

  // ---- a path: how long it takes ----
  if (play.path) {
    const settings = app.player.settings;
    const spec = typeof play.path === 'object' ? play.path : {};
    const mode = spec.len == null || spec.len === 'grid' ? 'grid' : ['speed', 'drawn'].includes(spec.len) ? spec.len : 'time';
    const setPath = (patch, lab) => edit(pl => {
      const cur = typeof pl.path === 'object' ? { ...pl.path } : typeof pl.path === 'string' ? { name: pl.path } : {};
      const next = { ...cur, ...patch };
      for (const k of Object.keys(next)) if (next[k] === undefined || next[k] === '') delete next[k];
      if (next.len === 'grid') delete next.len;
      if (next.metric === 'arc') delete next.metric;
      const keys = Object.keys(next);
      pl.path = !keys.length ? true : keys.length === 1 && keys[0] === 'name' ? next.name : next;
    }, lab || 'path length');
    const time = pathTime(e, { ctx: timeContext(settings), beatUnits: settings.beatUnits, quant: settings.quant });
    parts.push(
      row('Length', selectField([['grid', 'By the grid'], ['time', 'A time'], ['speed', 'A speed'], ['drawn', 'As drawn']], mode, v => setPath({ len: v === 'grid' ? undefined : v === 'time' ? (typeof spec.len === 'number' || (typeof spec.len === 'string' && !['grid', 'speed', 'drawn'].includes(spec.len)) ? spec.len : '1 bar') : v, speed: v === 'speed' ? spec.speed || 50 : undefined }), 'How the length of the line becomes time. By the grid: one beat for each beat-length of it (Timeline)')),
      mode === 'grid' ? row('Measured', selectField([['arc', 'Along it'], ['x', 'Across'], ['y', 'Up and down'], ['manhattan', 'Right angles']], spec.metric || 'arc', v => setPath({ metric: v }), 'How its length is measured')) : null,
      mode === 'time' ? row('Takes', timeField(app, spec.len ?? '', v => setPath({ len: v ?? undefined }), { placeholder: '1 bar' })) : null,
      mode === 'speed' ? row('Speed', numberField({ value: spec.speed || 50, min: 1, max: 5000, step: 5, def: 50, title: 'Artboard units a second', onChange: (v, { final }) => { if (final) setPath({ speed: v }); } })) : null,
      mode === 'time' ? null : row('Round to', selectField([['', `Scene (${QUANT_CHOICES.find(c => c[0] === settings.quant)?.[1] || 'free'})`], ['off', 'Free'], ...QUANT_CHOICES.filter(c => c[0])], spec.quant == null ? '' : String(spec.quant), v => setPath({ quant: v === '' ? undefined : v }), 'Round how long it takes to a division: a beat, a bar, a second… (a time written out is exact)')),
      row('Loops', h('input', { type: 'checkbox', checked: spec.loop !== undefined ? Boolean(spec.loop) : Boolean(e.closed), title: 'Travelers on it go round again (default: when the line is closed). Others can still choose their own', onchange: ev => setPath({ loop: ev.target.checked === Boolean(e.closed) ? undefined : ev.target.checked }, 'path loops') })),
      row('Is', h('span', { class: 'wb-muted', title: 'How long a traveler on it takes by default (in the Timeline\'s units)' }, formatDuration(time.seconds, settings)))
    );
  }

  // ---- a traveler ----
  if (play.travel) {
    const t = play.travel;
    const onLine = app.store.doc.elements.find(x => x.id === t.on || (x.label && x.label === t.on));
    const travelLoops = onLine ? (typeof onLine.play?.path === 'object' && onLine.play.path.loop !== undefined ? Boolean(onLine.play.path.loop) : Boolean(onLine.closed)) : false;
    const setT = (patch, label) => edit(pl => { pl.travel = { ...pl.travel, ...patch }; for (const k of Object.keys(pl.travel)) if (pl.travel[k] === undefined || pl.travel[k] === '' ) delete pl.travel[k]; pl.travel.on = pl.travel.on ?? ''; }, label || 'traveler');
    parts.push(
      row('Path', objectField({
        app, value: t.on, accept: x => x.id !== e.id && canBePath(x), title: 'The line this point runs: its name or id; the eyedropper picks one on the canvas',
        onChange: v => {
          const target = resolveMark(app.store.doc, v);
          edit((pl, el, d) => {
            pl.travel = { ...pl.travel, on: v };
            const line = target && d.elements.find(x => x.id === target.id);
            // The traveler starts where its path does: its marker goes there.
            if (line && el.role === 'point' && line.points.length) el.points = [[line.points[0][0], line.points[0][1], el.points[0]?.[2] ?? 0, el.points[0]?.[3] ?? 0.5]];
            if (line && !line.play?.path) { line.play = { ...(line.play || {}), path: true }; const r = realizeAfter(line, line.play); if (r !== line.realize) line.realize = { ...r }; }
          }, 'traveler path');
        }
      })),
      row('Takes', timeField(app, t.dur ?? '', v => setT({ dur: v, speed: undefined }, 'traveler time'), { placeholder: (() => { const line = resolveMark(app.store.doc, t.on); if (!line) return 'its path\'s time'; const pt = pathTime(line, { ctx: timeContext(app.player.settings), beatUnits: app.player.settings.beatUnits }); const span = Array.isArray(t.range) ? Math.abs(t.range[1] - t.range[0]) : 1; return formatDuration(pt.seconds * span * (t.ratio > 0 ? t.ratio : 1), app.player.settings); })() })),
      row('Part', h('span', { class: 'wb-row-inline' },
        numberField({ value: (t.range || [0, 1])[0], min: 0, max: 1, step: 0.01, def: 0, title: 'Where on its path it starts (0 to 1 of its length)', onChange: (v, { final }) => { if (final) { const r = [v, (t.range || [0, 1])[1]]; setT({ range: r[0] === 0 && r[1] === 1 ? undefined : r }, 'traveler range'); } } }),
        numberField({ value: (t.range || [0, 1])[1], min: 0, max: 1, step: 0.01, def: 1, title: 'Where it stops (smaller than the start: it runs backwards)', onChange: (v, { final }) => { if (final) { const r = [(t.range || [0, 1])[0], v]; setT({ range: r[0] === 0 && r[1] === 1 ? undefined : r }, 'traveler range'); } } }))),
      row('Ratio', numberField({ value: t.ratio || 1, min: 0.1, max: 16, step: 0.05, def: 1, title: 'How much longer than its path\'s time it takes: 2 is half as fast', onChange: (v, { final }) => { if (final) setT({ ratio: v === 1 ? undefined : v }, 'traveler ratio'); } })),
      row('Start', timeField(app, t.start ?? '', v => setT({ start: v }, 'traveler start'), { placeholder: '0' })),
      row('Loop', h('span', { class: 'wb-row-inline' }, ...LOOPS.map(([k, g, name]) => h('button', { class: `wb-icon-btn${(t.loop ?? (travelLoops ? 'loop' : 'once')) === k ? ' on' : ''}`, type: 'button', title: name, onclick: () => setT({ loop: k }, 'traveler loop') }, g)),
        h('label', { class: 'wb-row-inline', title: 'Replay the line at the speed it was drawn' }, h('input', { type: 'checkbox', checked: t.as === 'drawn', onchange: ev => setT({ as: ev.target.checked ? 'drawn' : undefined }, 'traveler as drawn') }), 'as drawn'))),
      row('Glow', h('span', { class: 'wb-row-inline' },
        numberField({ value: t.glow ?? app.scoreView.glow, min: 0, max: 1, step: 0.05, def: app.scoreView.glow, title: 'Strength of its halo while it plays (0: none). Empty: the Canvas menu\'s', onChange: (v, { final }) => { if (final) setT({ glow: v }, 'traveler glow'); } }),
        numberField({ value: t.glowSize ?? app.scoreView.glowSize, min: 1, max: 8, step: 0.1, def: app.scoreView.glowSize, title: 'How far the halo reaches (in dots)', onChange: (v, { final }) => { if (final) setT({ glowSize: v }, 'traveler glow size'); } }))),
      row('Tail', numberField({ value: t.trail ?? app.scoreView.trail, min: 0, max: 3, step: 0.05, def: app.scoreView.trail, title: 'Seconds of tail behind it (0: none)', onChange: (v, { final }) => { if (final) setT({ trail: v }, 'traveler tail'); } })),
      row('Width', numberField({ value: t.width || 0, min: 0, max: 2000, step: 1, def: 0, title: 'A bar across the path (like an IanniX cursor): it touches what its bar passes. 0: a point', onChange: (v, { final }) => {
        if (!final) return;
        const line = resolveMark(app.store.doc, t.on);
        setT({ width: v || undefined, angle: v && line ? barAngle(line, t.at || 0) : undefined }, 'traveler width');
      } })),
      row('Offset', numberField({ value: t.at || 0, min: 0, max: 1, step: 0.01, def: 0, title: 'How far along its path it begins (0 to 1). Drag the marker along the path with the Play tool to set it', onChange: (v, { final }) => { if (final) app.store.change('traveler offset', d => R.offset(d, e.id, v)); } })),
      row('Starts on', objectField({ app, value: t.cue || '', accept: x => x.id !== e.id && x.play?.trigger, placeholder: 'when play starts', title: 'An event that starts it: it waits until that event sounds. Empty: it runs from the start', onChange: v => setT({ cue: v || undefined }, 'traveler cue') }))
    );
  }

  // ---- a node (nodes.js): its kind, how it sends on, and its kind's settings ----
  if (play.node) {
    const n = normalizeNode(play.node), raw = play.node;
    const setN = (patch, lab) => edit(pl => { pl.node = { ...pl.node, ...patch }; for (const k of Object.keys(pl.node)) if (pl.node[k] === undefined) delete pl.node[k]; }, lab || 'node');
    const num = (k, lab, min, max, stepv, def, title) => row(lab, numberField({ value: raw[k] ?? n[k], min, max, step: stepv, def, title, onChange: (v, { final }) => { if (final) setN({ [k]: v === def ? undefined : v }, `node ${k}`); } }));
    const check = (k, lab, title, def = false) => row(lab, h('input', { type: 'checkbox', checked: Boolean(raw[k] ?? def), title, onchange: ev => setN({ [k]: ev.target.checked === def ? undefined : ev.target.checked }, `node ${k}`) }));
    const refs = (k, lab, accept, title) => {
      const list = [].concat(raw[k] || []);
      const out = list.map((r, i) => row(i ? '' : lab, h('span', { class: 'wb-row-inline wb-obj' },
        objectField({ app, value: r, accept, title, onChange: v => setN({ [k]: (v ? list.map((q, j) => (j === i ? v : q)) : list.filter((_, j) => j !== i)) }, `node ${k}`) }),
        h('button', { class: 'wb-icon-btn', type: 'button', title: 'Remove', onclick: () => { const next = list.filter((_, j) => j !== i); setN({ [k]: next.length ? next : undefined }, `node ${k}`); } }, '×'))));
      out.push(row(list.length ? '' : lab, objectField({ app, value: '', accept, placeholder: 'add: a name, or pick', title, onChange: v => { if (v) setN({ [k]: [...list, v] }, `node ${k}`); } })));
      return out;
    };
    parts.push(
      row('Node', h('span', { class: 'wb-row-inline wb-node-kinds' }, ...NODE_KINDS.map(k => h('button', { class: `wb-icon-btn${n.kind === k ? ' on' : ''}`, type: 'button', title: `${NODE_INFO[k].label}: ${NODE_INFO[k].hint}`, html: nodeIcon(k), onclick: () => setN({ kind: k }, 'node kind') })))),
      n.kind === 'terminator' ? null : row('Sends', h('span', { class: 'wb-row-inline' }, ...MODES.map(m => h('button', { class: `wb-icon-btn${n.mode === m ? ' on' : ''}`, type: 'button', title: `${m}: ${MODE_INFO[m]}`, html: nodeModeIcon(m), onclick: () => setN({ mode: m === 'robin' ? undefined : m }, 'node mode') })))),
      row('Starts', timeField(app, raw.start === true ? 0 : raw.start ?? '', v => setN({ start: v === 0 ? true : v }, 'node start'), { placeholder: 'when reached' }))
    );
    if (n.kind === 'note') {
      const relative = n.rel != null;
      parts.push(
        row('Note', h('span', { class: 'wb-row-inline' },
          h('label', { class: 'wb-row-inline', title: 'A step from the note the signal carries (the note of the node it came from), instead of a note of its own' }, h('input', { type: 'checkbox', checked: relative, onchange: ev => setN({ rel: ev.target.checked ? 1 : undefined }, 'node relative') }), 'step'),
          relative
            ? numberField({ value: n.rel, min: -48, max: 48, step: 1, def: 1, title: 'Scale steps from the incoming note (0: the same note)', onChange: (v, { final }) => { if (final) setN({ rel: v }, 'node step'); } })
            : numberField({ value: n.note, min: 0, max: 127, step: 1, def: 60, title: `MIDI note (${noteName(n.note)})`, onChange: (v, { final }) => { if (final) setN({ note: v }, 'node note'); } }),
          relative ? null : h('span', { class: 'wb-muted' }, noteName(n.note)))),
        relative ? row('Range', selectField([['', 'Exactly'], ['up', 'Up to it'], ['down', 'Down to it'], ['both', 'Up or down']], n.range || '', v => setN({ range: v || undefined }, 'node range'), 'A random step, up to the number of steps')) : null,
        row('Scale', h('span', { class: 'wb-row-inline' },
          selectField([['', 'The scene\'s'], ...SCALES.slice(1)], (n.scale || '').toLowerCase().replace(/[^a-z]/g, ''), v => setN({ scale: v || undefined }, 'node scale'), 'The scale steps are counted in (and notes snap to)'),
          numberField({ value: n.root ?? 60, min: 0, max: 127, step: 1, def: 60, title: 'Root note of the scale', onChange: (v, { final }) => { if (final) setN({ root: v === 60 ? undefined : v }, 'node root'); } }))),
        check('force', 'Snap', 'Move the note to the nearest note of the scale', relative),
        num('vel', 'Velocity', 1, 127, 1, 100, ''), num('ch', 'Channel', 1, 16, 1, 1, 'MIDI channel (10 is drums)'),
        num('dur', 'Length', 0.0625, 64, 0.25, 1, 'In beats'), num('repeat', 'Repeat', 0, 64, 1, 0, 'How many more times it plays, a length apart'),
        num('chance', 'Chance', 0, 100, 5, 100, 'Percent: how likely it sounds'),
        check('mute', 'Mute', 'It sounds nothing, but still carries its note on'), check('pass', 'Pass', 'It leaves the signal as it came: no sound and no note of its own')
      );
    } else if (n.kind === 'cc') {
      parts.push(num('cc', 'Controller', 0, 127, 1, 1, 'Controller number (1 is the mod wheel)'), num('value', 'Value', 0, 127, 1, 127, ''), num('ch', 'Channel', 1, 16, 1, 1, ''),
        num('slew', 'Slew', 0, 64, 0.25, 0, 'Beats to glide from the last value of this controller'), check('mute', 'Mute', 'It sends nothing'));
    } else if (n.kind === 'led') {
      parts.push(row('Light', selectField([['pulse', 'For a while'], ['toggle', 'On and off in turn']], n.hold, v => setN({ hold: v === 'pulse' ? undefined : v }, 'led'))), n.hold === 'pulse' ? num('dur', 'Length', 0.0625, 64, 0.25, 1, 'Beats it stays lit') : null);
    } else if (n.kind === 'counter') {
      parts.push(num('count', 'Every', 1, 256, 1, 4, 'Lets every n-th signal through'));
    } else if (n.kind === 'switch') {
      parts.push(check('on', 'On at first', 'Whether it starts on (it turns at every signal)'), check('block', 'Blocks', 'While off, a signal stops here (else it only turns)', true));
    } else if (n.kind === 'gate') {
      parts.push(row('Logic', selectField(GATE_TYPES.map(g => [g, g.toUpperCase()]), n.type, v => setN({ type: v === 'and' ? undefined : v }, 'gate type'), 'How the inputs decide')),
        ...refs('inputs', 'Inputs', x => x.id !== e.id && x.play?.node, 'Nodes this gate reads: lit (a note sounding, an LED lit, a switch on…) or not'));
    } else if (n.kind === 'terminator') {
      parts.push(num('limit', 'Stops', 0, 999, 1, 0, 'How many it stops (0: all)'), check('stop', 'Stop all', 'Stop every signal at once, not only this one'), check('bypass', 'Bypass', 'Let everything through'));
    }
    if (n.kind !== 'terminator') parts.push(...refs('to', 'Sends to', x => x.id !== e.id && (x.play?.node || x.play?.trigger || x.play?.path), 'More ways out: a path (it runs from here), or a node (straight there)'));
    parts.push(num('weight', 'Weight', 0, 1000, 5, 100, 'How likely a random node sends here'),
      row('Edges', selectField([['line', 'Straight'], ['horz', 'Across, then up or down'], ['vert', 'Up or down, then across']], n.shape, v => setN({ shape: v === 'line' ? undefined : v }, 'node edges'), 'How a path drawn from this node to another is made (the Play tool)')));
  }

  // ---- an event or a body: what it sounds ----
  const sounding = play.trigger ? ['trigger', 'Sound', PRESETS.filter(p => p.k !== 'collide')] : null;
  const bodied = play.body ? ['body', 'On collision', PRESETS.filter(p => p.k === 'collide')] : null;

  /** A sound as controls: a preset menu, its settings, and the code (field: 'emit', or 'emitExit' for leaving). */
  const soundBlock = (key, field, label, presets, { code: showCode = true } = {}) => {
    const part = play[key];
    const setPart = (patch, lab) => edit(pl => { pl[key] = { ...pl[key], ...patch }; for (const k of Object.keys(pl[key])) if (pl[key][k] === undefined) delete pl[key][k]; }, lab || key);
    const code = part[field] || '';
    const s = readPreset(code);
    const current = !code ? 'none' : s ? s.k : 'custom';
    const out = [row(label, selectField([['none', field === 'emitExit' ? 'Nothing more' : 'Silent'], ...presets.map(p => [p.k, p.label]), ...(current === 'custom' ? [['custom', 'Custom code']] : [])], current, v => {
      if (v === 'none') setPart({ [field]: undefined }, 'sound');
      else if (v !== 'custom') setPart({ [field]: emitFor({ ...DEFAULTS[v], ch: s?.ch ?? 1 }) }, 'sound');
    }, presets.find(p => p.k === current)?.hint || ''))];
    if (s) {
      const set = (k, v) => setPart({ [field]: emitFor({ ...s, [k]: v }) }, 'sound');
      const num = (k, lab, min, max, title) => row(lab, numberField({ value: s[k], min, max, step: 1, def: DEFAULTS[s.k][k], title, onChange: (v, { final }) => { if (final) set(k, v); } }));
      out.push(num('ch', 'Channel', 1, 16, 'MIDI channel (10 is drums)'));
      if (s.k === 'note') out.push(num('pitch', 'Note', 0, 127, 'MIDI note number (60 is middle C)'), num('vel', 'Velocity', 1, 127, ''));
      if (s.k === 'cc') out.push(num('cc', 'Controller', 0, 127, 'Controller number (1 is the mod wheel)'));
      if (s.k === 'height' || s.k === 'along' || s.k === 'offset' || s.k === 'collide') {
        out.push(num('lo', 'Lowest', 0, 127, 'The lowest note: the bottom of the board, the start of the path, or the far left of a bar'), num('hi', 'Highest', 0, 127, 'The highest note'),
          row('Scale', selectField(SCALES, s.scale, v => set('scale', v), 'Notes are moved to the nearest note of this scale')), num('root', 'Root', 0, 127, 'The scale\'s root note'));
        if (s.k !== 'collide') out.push(num('vel', 'Velocity', 1, 127, ''));
      }
      if (s.k !== 'cc') out.push(row('Length', timeField(app, s.dur, v => set('dur', v ?? 0.25), { allow: ['gate'], placeholder: 'gate or 0.25' })));
    }
    if (showCode) {
      const ta = h('textarea', { class: 'wb-why wb-play-code', rows: Math.min(8, Math.max(2, code.split('\n').length)), spellcheck: 'false', placeholder: `${field === 'emitExit' ? 'on leaving' : 'emit'} code: note(1, 60, 100, 0.25)`, title: 'What happens, as code: note(), cc(), snap(), lane(ny, n)… (see Docs → Scores that play)' });
      ta.value = code;
      ta.addEventListener('keydown', ev => ev.stopPropagation());
      ta.addEventListener('change', () => setPart({ [field]: ta.value.trim() ? ta.value : undefined }, 'emit code'));
      out.push(ta);
    }
    return out;
  };

  if (sounding) {
    const part = play.trigger;
    const setPart = (patch, lab) => edit(pl => { pl.trigger = { ...pl.trigger, ...patch }; for (const k of Object.keys(pl.trigger)) if (pl.trigger[k] === undefined) delete pl.trigger[k]; }, lab || 'trigger');
    const isLine = e.role === 'line';
    const on = part.on || (isLine ? ['cross'] : ['enter', 'exit']);
    const toggle = ev => { const next = on.includes(ev) ? on.filter(x => x !== ev) : [...on, ev]; setPart({ on: next.length === (isLine ? 1 : 2) && next.every(x => (isLine ? ['cross'] : ['enter', 'exit']).includes(x)) ? undefined : next }, 'event kinds'); };
    parts.push(
      row('When', isLine
        ? h('span', { class: 'wb-row-inline' },
          ...[[undefined, '↔', 'Crossed either way'], [-1, '→', 'Crossed from its left to its right (looking along it from its start)'], [1, '←', 'Crossed from its right to its left']].map(([dv, g, tip]) => h('button', { class: `wb-icon-btn${part.dir === dv ? ' on' : ''}`, type: 'button', title: tip, onclick: () => setPart({ dir: dv }, 'trigger direction') }, g)))
        : h('span', { class: 'wb-row-inline' },
          h('button', { class: `wb-icon-btn${on.includes('enter') ? ' on' : ''}`, type: 'button', title: 'When something enters it', onclick: () => toggle('enter') }, '⇥'),
          h('button', { class: `wb-icon-btn${on.includes('exit') ? ' on' : ''}`, type: 'button', title: 'When something leaves it', onclick: () => toggle('exit') }, '⇤'))),
      ...soundBlock('trigger', 'emit', 'Sound', sounding[2])
    );
    if (!isLine) parts.push(...soundBlock('trigger', 'emitExit', 'On leaving', sounding[2].filter(p => ['note', 'cc'].includes(p.k)), { code: Boolean(part.emitExit) }));
    // What it sends on: a traveler goes to each of these and sounds them there.
    const to = [].concat(part.to || []).map(r => (typeof r === 'string' ? { to: r } : r));
    const setTo = (list, lab) => setPart({ to: list.length ? list : undefined }, lab);
    to.forEach((r, i) => parts.push(row(i ? '' : 'Sends to', h('span', { class: 'wb-row-inline wb-obj' },
      objectField({ app, value: r.to, accept: x => x.id !== e.id && (x.play?.trigger || x.role === 'point' || x.role === 'plane'), title: 'An event this one sends a traveler to', onChange: v => { if (v) setTo(to.map((q, k) => (k === i ? { ...q, to: v } : q)), 'route'); else setTo(to.filter((_, k) => k !== i), 'route'); } }),
      timeField(app, r.dur ?? '', v => setTo(to.map((q, k) => (k === i ? { ...q, dur: v } : q)), 'route time'), { placeholder: '1 beat' })))));
    parts.push(row(to.length ? '' : 'Sends to', objectField({ app, value: '', accept: x => x.id !== e.id && (x.play?.trigger || x.role === 'point' || x.role === 'plane'), placeholder: 'add: a name, or pick', title: 'Add an event to send a traveler to', onChange: v => { if (v) { const m = resolveMark(app.store.doc, v); app.store.change('route', d => R.send(d, e.id, m ? m.id : v)); } } })));
    parts.push(
      row('On path', h('span', { class: 'wb-row-inline wb-obj' },
        objectField({ app, value: part.path || '', accept: x => x.id !== e.id && canBePath(x), placeholder: 'free (Cmd-drag over a path)', title: 'The line it sits on and follows. Drag it along the line to move it; Cmd-drag takes it off, and attaches it to another line where you let go there', onChange: v => app.store.change('attach', d => { if (v) { const t = resolveMark(d, v); if (t) R.attachEvent(d, e.id, t.id, R.nearestU(d, e.id, t.id)); } else R.detach(d, e.id); }) }),
        part.path ? h('input', { class: 'wb-num', type: 'number', min: 0, max: 1, step: 0.01, value: part.at ?? 0, title: 'Where along the line (0 to 1)', onchange: ev => app.store.change('event place', d => R.attachEvent(d, e.id, resolveMark(d, part.path)?.id || part.path, Number(ev.target.value))) }) : null)),
      row('Starts', timeField(app, part.start === true ? 0 : part.start ?? '', v => setPart({ start: v }, 'event start'), { placeholder: 'when touched' })),
      row('Policy', selectField([['latched', 'One voice (latched)'], ['pair', 'One per traveler'], ['every', 'Every touch']], part.policy || 'latched', v => setPart({ policy: v === 'latched' ? undefined : v }, 'trigger policy'), 'How many voices touching it makes')),
      row('Hold', timeField(app, part.gate ?? '', v => setPart({ gate: v }, 'event hold'), { placeholder: '0' })),
      row('Rest', timeField(app, part.lockout ?? '', v => setPart({ lockout: v }, 'event rest'), { placeholder: '0' })),
      row('Hears', textField(typeof part.filter === 'string' ? part.filter : '', v => setPart({ filter: v || undefined }, 'event filter'), { placeholder: 'any traveler', title: 'Only travelers with this tag' }))
    );
  }
  if (bodied) {
    const part = play.body;
    const setPart = (patch, lab) => edit(pl => { pl.body = { ...pl.body, ...patch }; for (const k of Object.keys(pl.body)) if (pl.body[k] === undefined) delete pl.body[k]; }, lab || 'body');
    parts.push(...soundBlock('body', 'emit', 'On collision', bodied[2]));
    const sp = Array.isArray(part.speed) ? part.speed : [part.speed ?? 100, part.speed ?? 100];
    parts.push(row('Speed', h('span', { class: 'wb-row-inline' },
      numberField({ value: sp[0], min: 0, max: 2000, step: 5, def: 60, title: 'Slowest (units a second)', onChange: (v, { final }) => { if (final) setPart({ speed: [v, Math.max(v, sp[1])], v: undefined }, 'body speed'); } }),
      numberField({ value: sp[1], min: 0, max: 2000, step: 5, def: 200, title: 'Fastest', onChange: (v, { final }) => { if (final) setPart({ speed: [Math.min(v, sp[0]), v], v: undefined }, 'body speed'); } }))));
  }

  return parts;
}
