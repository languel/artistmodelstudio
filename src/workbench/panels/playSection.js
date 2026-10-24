/**
 * Properties → Play: a mark's `play` as controls. Nothing here is its own state: every control reads the
 * mark's play (and its emit code) and writes it back, so what you see is the code (Code → Selection shows
 * the same `play: { … }`), and code edits show here. A sound preset is code too: its settings are in a
 * comment on the code's first line, and edit the code by hand and it reads "custom".
 */
import { h, row, numberField, selectField, section } from '../ui.js';
import { brushIcon } from '../icons.js';
import { objectField, nameOf, resolveMark } from '../objectPicker.js';
import { PRESETS, DEFAULTS, emitFor, readPreset } from '../../score/presets.js';
import { scaleNames } from '../../score/scale.js';
import { PARTS, MARKER, realizeAfter, newPart, canBePath } from '../../process/playparts.js';
import { parseTimeValue } from '../../time/timeValue.js';
import { timeContext } from '../../time/sceneTransport.js';

const TITLES = {
  path: 'A path: a line that can be travelled',
  travel: 'A traveler: a point that runs a path',
  trigger: 'A trigger: it sounds when something touches it',
  body: 'A body: a point that moves by itself, bounces and collides'
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

  // ---- a traveler ----
  if (play.travel) {
    const t = play.travel;
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
      row('Takes', timeField(app, t.dur ?? '', v => setT({ dur: v, speed: undefined }, 'traveler time'), { placeholder: '8 beats' })),
      row('Start', timeField(app, t.start ?? '', v => setT({ start: v }, 'traveler start'), { placeholder: '0' })),
      row('Loop', h('span', { class: 'wb-row-inline' }, ...LOOPS.map(([k, g, name]) => h('button', { class: `wb-icon-btn${(t.loop || 'once') === k ? ' on' : ''}`, type: 'button', title: name, onclick: () => setT({ loop: k }, 'traveler loop') }, g)),
        h('label', { class: 'wb-row-inline', title: 'Replay the line at the speed it was drawn' }, h('input', { type: 'checkbox', checked: t.as === 'drawn', onchange: ev => setT({ as: ev.target.checked ? 'drawn' : undefined }, 'traveler as drawn') }), 'as drawn'))),
      row('Width', numberField({ value: t.width || 0, min: 0, max: 2000, step: 1, def: 0, title: 'A bar across the path (like an IanniX cursor): it touches what its bar passes. 0: a point', onChange: (v, { final }) => { if (final) setT({ width: v || undefined }, 'traveler width'); } }))
    );
  }

  // ---- a trigger or a body: what it sounds ----
  const sounding = play.trigger ? ['trigger', 'Sound', PRESETS.filter(p => p.k !== 'collide')] : null;
  const bodied = play.body ? ['body', 'On collision', PRESETS.filter(p => p.k === 'collide')] : null;
  for (const [key, label, presets] of [sounding, bodied].filter(Boolean)) {
    const part = play[key];
    const setPart = (patch, lab) => edit(pl => { pl[key] = { ...pl[key], ...patch }; for (const k of Object.keys(pl[key])) if (pl[key][k] === undefined) delete pl[key][k]; }, lab || key);
    const code = part.emit || '';
    const s = readPreset(code);
    const current = !code ? 'none' : s ? s.k : 'custom';
    parts.push(row(label, selectField([['none', 'Silent'], ...presets.map(p => [p.k, p.label]), ...(current === 'custom' ? [['custom', 'Custom code']] : [])], current, v => {
      if (v === 'none') setPart({ emit: undefined }, 'sound');
      else if (v !== 'custom') setPart({ emit: emitFor({ ...DEFAULTS[v], ch: s?.ch ?? 1 }) }, 'sound');
    }, presets.find(p => p.k === current)?.hint || '')));
    if (s) {
      const set = (k, v) => setPart({ emit: emitFor({ ...s, [k]: v }) }, 'sound');
      const num = (k, lab, min, max, title) => row(lab, numberField({ value: s[k], min, max, step: 1, def: DEFAULTS[s.k][k], title, onChange: (v, { final }) => { if (final) set(k, v); } }));
      parts.push(num('ch', 'Channel', 1, 16, 'MIDI channel (10 is drums)'));
      if (s.k === 'note') parts.push(num('pitch', 'Note', 0, 127, 'MIDI note number (60 is middle C)'), num('vel', 'Velocity', 1, 127, ''));
      if (s.k === 'cc') parts.push(num('cc', 'Controller', 0, 127, 'Controller number (1 is the mod wheel)'));
      if (s.k === 'height' || s.k === 'along' || s.k === 'collide') {
        parts.push(num('lo', 'Lowest', 0, 127, 'The note at the bottom of the board (or the start of the path)'), num('hi', 'Highest', 0, 127, 'The note at the top (or the end)'),
          row('Scale', selectField(SCALES, s.scale, v => set('scale', v), 'Notes are moved to the nearest note of this scale')), num('root', 'Root', 0, 127, 'The scale\'s root note'));
        if (s.k !== 'collide') parts.push(num('vel', 'Velocity', 1, 127, ''));
      }
      if (s.k !== 'cc') parts.push(row('Length', timeField(app, s.dur, v => set('dur', v ?? 0.25), { allow: ['gate'], placeholder: 'gate or 0.25' })));
    }
    if (key === 'trigger') {
      parts.push(
        row('Policy', selectField([['latched', 'One voice (latched)'], ['pair', 'One per traveler'], ['every', 'Every touch']], part.policy || 'latched', v => setPart({ policy: v === 'latched' ? undefined : v }, 'trigger policy'), 'How many voices touching it makes')),
        row('Hold', timeField(app, part.gate ?? '', v => setPart({ gate: v }, 'trigger hold'), { placeholder: '0' })),
        row('Rest', timeField(app, part.lockout ?? '', v => setPart({ lockout: v }, 'trigger rest'), { placeholder: '0' })),
        row('Hears', textField(typeof part.filter === 'string' ? part.filter : '', v => setPart({ filter: v || undefined }, 'trigger filter'), { placeholder: 'any traveler', title: 'Only travelers with this tag' }))
      );
    }
    if (key === 'body') {
      const sp = Array.isArray(part.speed) ? part.speed : [part.speed ?? 100, part.speed ?? 100];
      parts.push(row('Speed', h('span', { class: 'wb-row-inline' },
        numberField({ value: sp[0], min: 0, max: 2000, step: 5, def: 60, title: 'Slowest (units a second)', onChange: (v, { final }) => { if (final) setPart({ speed: [v, Math.max(v, sp[1])] }, 'body speed'); } }),
        numberField({ value: sp[1], min: 0, max: 2000, step: 5, def: 200, title: 'Fastest', onChange: (v, { final }) => { if (final) setPart({ speed: [Math.min(v, sp[0]), v] }, 'body speed'); } }))));
    }
    // The code itself: what the controls write, and what you may write instead.
    const ta = h('textarea', { class: 'wb-why wb-play-code', rows: Math.min(8, Math.max(2, code.split('\n').length)), spellcheck: 'false', placeholder: 'emit code: note(1, 60, 100, 0.25)', title: 'What happens on each touch, as code: note(), cc(), snap(), lane(ny, n)… (see Docs → Scores that play)' });
    ta.value = code;
    ta.addEventListener('keydown', ev => ev.stopPropagation());
    ta.addEventListener('change', () => setPart({ emit: ta.value.trim() ? ta.value : undefined }, 'emit code'));
    parts.push(ta);
  }

  return section('Play', Boolean(e.play), ...parts);
}
