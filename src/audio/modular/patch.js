/**
 * A modular patch as data: the scene's synth (`doc.transport.patch`), after genereti's mod.* operators. Pure (no Web
 * Audio): what modules there are, their settings (only what differs from the default is stored), the cables between
 * them, and what the sequencers play. The engine (engine.js) plays it; the studio side is workbench/patchPlayer.js;
 * the node editor is workbench/panels/patch.js.
 *
 *   patch = { modules: [{ id, kind, x, y, name?, settings }], cables: [{ from, to, slot }] }
 *
 * Kinds come in three groups:
 *   instrument  makes sound when a note reaches it: Synth, Karplus, Granular, DrumKit, DrumSynth. A score's notes reach
 *               every instrument whose `channel` they are on (the mixer routes a channel to the patch with out: 'patch');
 *               a sequencer reaches the instruments it is cabled to (slot 'notes')
 *   effect      changes sound: Gain, Filter, Delay, Reverb, Distortion, Mixer, Merge; and Output, the speakers
 *   sequencer   plays notes on the Timeline's clock: Steps (a melody), Drums (a grid), Euclid (rings), Bits (a grid of
 *               0s and 1s read row by row, such as the Arecibo message)
 *
 * Audio cables go from a module's output to a slot of another (`input`, or `input_1`… on a Mixer or Merge); there are
 * no audio loops (feedback is the Delay's own). Notes cables go from a sequencer to an instrument (slot `notes`).
 */

const P = (def, min, max, step) => ({ def, min, max, ...(step ? { step } : {}) });
const O = (def, options) => ({ def, options });
const T = (def, rows = 4) => ({ def, text: true, rows });
const B = def => ({ def, bool: true });
const CHANNEL = def => P(def, 1, 16, 1);

const WAVES = ['auto', 'sine', 'triangle', 'sawtooth', 'square'];

/** Every kind: its group, its settings ({ def, min, max, step } | { def, options } | { def, text } | { def, bool }), its audio inputs. */
export const KINDS = Object.freeze({
  Synth: { group: 'instrument', doc: 'A polyphonic voice: sine, subtractive, FM or reed; envelope, filter, glide, vibrato', params: {
    voice: O('subtractive', ['sine', 'subtractive', 'fm', 'reed']), wave: O('auto', WAVES), channel: CHANNEL(1), level: P(0.35, 0, 1),
    attack: P(0.02, 0.001, 5), decay: P(0.15, 0.001, 5), sustain: P(0.6, 0, 1), release: P(0.3, 0.005, 5),
    filter_mode: O('lowpass', ['lowpass', 'highpass', 'bandpass']), cutoff: P(2200, 20, 18000), resonance: P(0.7, 0.1, 12), filter_env: P(0, 0, 1),
    glide: P(0.015, 0, 1), vibrato: P(0, 0, 2), vibrato_rate: P(5, 0.1, 20), detune: P(0, -100, 100), fm_ratio: P(2, 0.1, 10), fm_index: P(0.7, 0, 10),
    polyphony: P(8, 1, 32, 1) } },
  Karplus: { group: 'instrument', doc: 'A plucked string (Karplus–Strong): a delay line fed back through a low-pass', params: {
    channel: CHANNEL(1), level: P(0.35, 0, 1), decay: P(1.2, 0.05, 5), damping: P(0.5, 0, 1), release: P(0.15, 0.01, 3), polyphony: P(8, 1, 32, 1) } },
  Granular: { group: 'instrument', doc: 'A pitched cloud of grains', params: {
    channel: CHANNEL(1), level: P(0.25, 0, 1), grain_size: P(0.08, 0.02, 0.3), density: P(16, 1, 40), spread: P(0.25, 0, 1), release: P(0.2, 0.01, 3), polyphony: P(8, 1, 32, 1) } },
  DrumKit: { group: 'instrument', doc: 'Kick, snare, hats, toms, clap, rim, ride, cowbell on the General MIDI drum notes', params: {
    channel: CHANNEL(10), level: P(0.4, 0, 1), decay: P(0.18, 0.03, 2), tone: P(1, 0.25, 2) } },
  DrumSynth: { group: 'instrument', doc: 'Eight synthesized drum voices (kick 36, snare 38, hat 42, open hat 46, toms 41 and 45, clap 39, bell 56)', params: {
    channel: CHANNEL(10), level: P(0.4, 0, 1), kit: T('', 2), polyphony: P(24, 1, 32, 1) } },
  Gain: { group: 'effect', doc: 'Level, pan, mute', inputs: ['input'], params: { level: P(0.8, 0, 2), pan: P(0, -1, 1), mute: B(false) } },
  Filter: { group: 'effect', doc: 'A biquad filter', inputs: ['input'], params: { mode: O('lowpass', ['lowpass', 'highpass', 'bandpass', 'notch']), cutoff: P(1800, 20, 18000), resonance: P(0.7, 0.1, 12) } },
  Delay: { group: 'effect', doc: 'An echo, fed back into itself', inputs: ['input'], params: { seconds: P(0.25, 0.01, 2), feedback: P(0.25, 0, 0.85), mix: P(0.25, 0, 1) } },
  Reverb: { group: 'effect', doc: 'A room made of noise (a convolution with a decaying burst)', inputs: ['input'], params: { decay: P(1.5, 0.1, 5), mix: P(0.3, 0, 1) } },
  Distortion: { group: 'effect', doc: 'Waveshaping drive', inputs: ['input'], params: { drive: P(2, 0, 20), mix: P(0.5, 0, 1) } },
  Mixer: { group: 'effect', doc: 'Up to eight buses with level, pan, mute and solo', inputs: [1, 2, 3, 4, 5, 6, 7, 8].map(i => `input_${i}`), params: {
    master: P(0.8, 0, 1), ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].flatMap(i => [[`level_${i}`, P(1, 0, 2)], [`pan_${i}`, P(0, -1, 1)], [`mute_${i}`, B(false)], [`solo_${i}`, B(false)]])) } },
  Merge: { group: 'effect', doc: 'Adds its inputs together', inputs: [1, 2, 3, 4].map(i => `in_${i}`), params: {} },
  Output: { group: 'effect', doc: 'The speakers (through a compressor)', inputs: ['input'], params: { level: P(0.65, 0, 1), mute: B(false) } },
  Steps: { group: 'sequencer', doc: 'A melody: notes (C3, Eb4, 60) and rests (- or .), one a step', params: {
    notes: T('C3 - Eb3 G3 - C4 G3 Eb3 C3 - Eb3 G3 Bb3 G3 Eb3 -', 2), division: P(4, 1, 8, 1), gate: P(0.5, 0.05, 1), velocity: P(0.8, 0, 1), transpose: P(0, -48, 48, 1) } },
  Drums: { group: 'sequencer', doc: 'A drum grid: a row a drum, "name note pattern" (x: hit, X: accent, .: rest)', params: {
    rows: T('kick 36 x...x...x...x...\nsnare 38 ....x.......x...\nhat 42 x.x.x.x.x.x.x.x.', 4), division: P(4, 1, 8, 1), velocity: P(0.9, 0, 1) } },
  Euclid: { group: 'sequencer', doc: 'Euclidean rings: a line a ring, "steps hits rotation note"', params: {
    rings: T('16 4 0 36\n16 3 2 38\n16 7 0 42', 4), division: P(4, 1, 8, 1), velocity: P(0.85, 0, 1) } },
  Bits: { group: 'sequencer', doc: 'A grid of bits read row by row, a 1 a note: its column is its place in the scale', params: {
    bits: T('1010101\n0110011\n1111000', 6), scale: O('pentatonic', ['pentatonic', 'major', 'minor', 'chromatic', 'whole tone']), root: P(48, 24, 84, 1), division: P(4, 1, 8, 1), gate: P(0.6, 0.05, 1), velocity: P(0.75, 0, 1) } }
});

export const GROUPS = Object.freeze(['sequencer', 'instrument', 'effect']);
export const isInstrument = kind => KINDS[kind]?.group === 'instrument';
export const isSequencer = kind => KINDS[kind]?.group === 'sequencer';
export const isAudio = kind => KINDS[kind] && KINDS[kind].group !== 'sequencer';
export const inputsOf = kind => KINDS[kind]?.inputs || [];
/** Can a cable start here (an audio output, or notes)? */
export const outputOf = kind => (isSequencer(kind) ? 'notes' : kind === 'Output' ? null : KINDS[kind] ? 'audio' : null);

export const EMPTY_PATCH = Object.freeze({ modules: Object.freeze([]), cables: Object.freeze([]) });

function cleanValue(spec, v) {
  if (spec.bool) return Boolean(v);
  if (spec.options) return spec.options.includes(v) ? v : spec.def;
  if (spec.text) return typeof v === 'string' ? v.slice(0, 20000) : spec.def;
  const n = Number(v);
  if (!Number.isFinite(n)) return spec.def;
  const c = Math.min(spec.max, Math.max(spec.min, n));
  return spec.step ? Math.round(c / spec.step) * spec.step : c;
}

/** A module's settings with every default filled in. */
export function settingsOf(m) {
  const spec = KINDS[m?.kind]?.params || {};
  return Object.fromEntries(Object.entries(spec).map(([k, s]) => [k, m?.settings && k in m.settings ? cleanValue(s, m.settings[k]) : s.def]));
}

/** Only what differs from the default (what is stored). */
function storedSettings(kind, settings) {
  const spec = KINDS[kind].params, out = {};
  for (const [k, v] of Object.entries(settings || {})) if (spec[k]) { const c = cleanValue(spec[k], v); if (c !== spec[k].def) out[k] = c; }
  return out;
}

/** Would an audio cable from `from` to `to` close a loop? */
function loops(cables, from, to) {
  const next = new Map();
  for (const c of cables) if (c.slot !== 'notes') next.set(c.from, [...(next.get(c.from) || []), c.to]);
  const seen = new Set(), stack = [to];
  while (stack.length) { const id = stack.pop(); if (id === from) return true; if (seen.has(id)) continue; seen.add(id); stack.push(...(next.get(id) || [])); }
  return false;
}

/** A cable that may exist: right kinds at both ends, a free slot, no loop. */
export function cableAllowed(modules, cables, { from, to, slot }) {
  const a = modules.find(m => m.id === from), b = modules.find(m => m.id === to);
  if (!a || !b || a.id === b.id) return false;
  if (slot === 'notes') return isSequencer(a.kind) && isInstrument(b.kind) && !cables.some(c => c.from === from && c.to === to && c.slot === 'notes');
  if (outputOf(a.kind) !== 'audio' || !inputsOf(b.kind).includes(slot)) return false;
  if (cables.some(c => c.to === to && c.slot === slot)) return false;   // (one cable into a slot)
  return !loops(cables, from, to);
}

/** The patch as it may be stored: known kinds, clean settings, unique ids, only cables that may exist. */
export function normalizePatch(p) {
  const src = p && typeof p === 'object' ? p : {};
  const ids = new Set();
  const modules = (Array.isArray(src.modules) ? src.modules : []).filter(m => m && KINDS[m.kind] && typeof m.id === 'string' && m.id && !ids.has(m.id) && ids.add(m.id)).map(m => ({
    id: m.id, kind: m.kind, x: Number.isFinite(Number(m.x)) ? Math.round(Number(m.x)) : 0, y: Number.isFinite(Number(m.y)) ? Math.round(Number(m.y)) : 0,
    ...(typeof m.name === 'string' && m.name.trim() ? { name: m.name.trim().slice(0, 60) } : {}),
    settings: storedSettings(m.kind, m.settings)
  }));
  const cables = [];
  for (const c of Array.isArray(src.cables) ? src.cables : []) {
    const cable = { from: String(c?.from), to: String(c?.to), slot: String(c?.slot || 'input') };
    if (cableAllowed(modules, cables, cable)) cables.push(cable);
  }
  return { modules, cables };
}

/** For the engine: { defs: Map(id → { kind, settings, inputs: { slot: fromId } }), outputs: Set(ids of Output modules) }. */
export function toDefs(patch) {
  const defs = new Map(), outputs = new Set();
  for (const m of patch.modules) if (isAudio(m.kind)) {
    defs.set(m.id, { kind: m.kind, settings: settingsOf(m), inputs: {} });
    if (m.kind === 'Output' && !settingsOf(m).mute) outputs.add(m.id);
  }
  for (const c of patch.cables) if (c.slot !== 'notes' && defs.has(c.to) && defs.has(c.from)) defs.get(c.to).inputs[c.slot] = c.from;
  return { defs, outputs };
}

/** The instruments a score's channel plays. */
export const instrumentsOn = (patch, channel) => patch.modules.filter(m => isInstrument(m.kind) && settingsOf(m).channel === Number(channel)).map(m => m.id);
/** The instruments a sequencer is cabled to. */
export const targetsOf = (patch, id) => patch.cables.filter(c => c.from === id && c.slot === 'notes').map(c => c.to);

// ---- editing (each returns a new, normalized patch) -----------------------------------------------------------------

let counter = 0;
const newId = (patch, kind) => { let id; do id = `${kind.toLowerCase()}${++counter}`; while (patch.modules.some(m => m.id === id)); return id; };

export function addModule(patch, kind, x = 0, y = 0, settings = {}) {
  if (!KINDS[kind]) return { patch, id: null };
  const id = newId(patch, kind);
  return { patch: normalizePatch({ ...patch, modules: [...patch.modules, { id, kind, x, y, settings }] }), id };
}
export const removeModule = (patch, id) => normalizePatch({ modules: patch.modules.filter(m => m.id !== id), cables: patch.cables.filter(c => c.from !== id && c.to !== id) });
export const moveModule = (patch, id, x, y) => normalizePatch({ ...patch, modules: patch.modules.map(m => (m.id === id ? { ...m, x, y } : m)) });
export const renameModule = (patch, id, name) => normalizePatch({ ...patch, modules: patch.modules.map(m => (m.id === id ? { ...m, name } : m)) });
export const setSettings = (patch, id, values) => normalizePatch({ ...patch, modules: patch.modules.map(m => (m.id === id ? { ...m, settings: { ...settingsOf(m), ...values } } : m)) });
export function connect(patch, from, to, slot) {
  const cable = { from, to, slot };
  if (!cableAllowed(patch.modules, patch.cables, cable)) return patch;
  return normalizePatch({ ...patch, cables: [...patch.cables, cable] });
}
export const disconnect = (patch, cable) => normalizePatch({ ...patch, cables: patch.cables.filter(c => !(c.from === cable.from && c.to === cable.to && c.slot === cable.slot)) });
/** The first free slot of `to` an audio cable from `from` may take (or 'notes'), or null. */
export function freeSlot(patch, from, to) {
  const a = patch.modules.find(m => m.id === from), b = patch.modules.find(m => m.id === to);
  if (!a || !b) return null;
  if (isSequencer(a.kind)) return isInstrument(b.kind) && cableAllowed(patch.modules, patch.cables, { from, to, slot: 'notes' }) ? 'notes' : null;
  return inputsOf(b.kind).find(slot => cableAllowed(patch.modules, patch.cables, { from, to, slot })) || null;
}

// ---- sequencers: what they play between two beats (pure) ------------------------------------------------------------

const NOTE_RE = /^([A-Ga-g])([#♯b♭]?)(-?\d)$/;
const SEMIS = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
/** 'C4' → 60, 'Eb3' → 51, '62' → 62, '-' or '.' → null (a rest). */
export function parseNote(t) {
  const s = String(t).trim();
  if (!s || s === '-' || s === '.' || s === '_') return null;
  if (/^\d{1,3}$/.test(s)) return Math.min(127, Number(s));
  const m = NOTE_RE.exec(s);
  if (!m) return null;
  const acc = m[2] === '#' || m[2] === '♯' ? 1 : m[2] === 'b' || m[2] === '♭' ? -1 : 0;
  return Math.max(0, Math.min(127, 12 * (Number(m[3]) + 1) + SEMIS[m[1].toLowerCase()] + acc));
}
export const parseSteps = text => String(text || '').trim().split(/\s+/).filter(Boolean).map(parseNote);

/** Drum rows: "kick 36 x...x..." → [{ name, note, steps: [0 | 1 | 1.4] }] (X is an accent). */
export function parseDrumRows(text) {
  return String(text || '').split('\n').map(l => l.trim().split(/\s+/)).filter(p => p.length >= 3 && /^\d+$/.test(p[1])).map(([name, note, ...rest]) => ({
    name, note: Math.min(127, Number(note)), steps: [...rest.join('')].map(ch => (ch === 'X' ? 1.4 : ch === 'x' || ch === '1' ? 1 : 0))
  })).filter(r => r.steps.length);
}

/** Euclidean rings: "steps hits rotation note" → [{ steps, hits, rotation, note, pattern: [bool] }]. */
export function euclid(steps, hits, rotation = 0) {
  const n = Math.max(1, Math.min(64, Math.round(steps))), k = Math.max(0, Math.min(n, Math.round(hits))), r = ((Math.round(rotation) % n) + n) % n;
  return Array.from({ length: n }, (_, i) => { const j = (i - r + n) % n; return k > 0 && (j * k) % n < k; });
}
export function parseRings(text) {
  return String(text || '').split('\n').map(l => l.trim().split(/\s+/).map(Number)).filter(p => p.length >= 4 && p.every(Number.isFinite)).map(([steps, hits, rotation, note]) => ({ steps, hits, rotation, note, pattern: euclid(steps, hits, rotation) }));
}

export const SCALES = Object.freeze({ pentatonic: [0, 2, 4, 7, 9], major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'whole tone': [0, 2, 4, 6, 8, 10] });
/** A grid of bits: rows of 0 and 1 (anything else is skipped). */
export const parseBits = text => String(text || '').split('\n').map(l => l.replace(/[^01]/g, '')).filter(Boolean).map(l => [...l].map(Number));
/** Column c of a scale, from the root: up the scale, octave after octave. */
export const scaleNote = (root, scale, c) => { const s = SCALES[scale] || SCALES.pentatonic; return root + 12 * Math.floor(c / s.length) + s[c % s.length]; };

/** How many steps a sequencer's pattern has before it repeats (for drawing its playhead). */
export function lengthOf(m) {
  const s = settingsOf(m);
  if (m.kind === 'Steps') return Math.max(1, parseSteps(s.notes).length);
  if (m.kind === 'Drums') return Math.max(1, ...parseDrumRows(s.rows).map(r => r.steps.length));
  if (m.kind === 'Euclid') return Math.max(1, ...parseRings(s.rings).map(r => r.pattern.length));
  if (m.kind === 'Bits') { const g = parseBits(s.bits); return Math.max(1, g.length * (g[0]?.length || 1)); }
  return 1;
}

/**
 * What a sequencer plays on steps that start in [fromBeat, toBeat): [{ step, beat, note, velocity, beats }] (beats: how
 * long the note is held). A step is 1/division of a beat. Bits: the grid is read row by row, left to right; a 1 at
 * column c plays the c-th note of the scale.
 */
export function stepsBetween(m, fromBeat, toBeat) {
  const s = settingsOf(m), div = s.division, out = [];
  const first = Math.ceil(fromBeat * div - 1e-9), last = Math.ceil(toBeat * div - 1e-9);
  if (last <= first) return out;
  const stepLen = 1 / div;
  const steps = m.kind === 'Steps' ? parseSteps(s.notes) : null, rows = m.kind === 'Drums' ? parseDrumRows(s.rows) : null;
  const rings = m.kind === 'Euclid' ? parseRings(s.rings) : null, grid = m.kind === 'Bits' ? parseBits(s.bits) : null;
  for (let i = Math.max(0, first); i < last; i++) {
    const beat = i / div;
    if (steps?.length) { const n = steps[i % steps.length]; if (n !== null) out.push({ step: i, beat, note: Math.max(0, Math.min(127, n + s.transpose)), velocity: s.velocity, beats: stepLen * s.gate }); }
    if (rows) for (const r of rows) { const v = r.steps[i % r.steps.length]; if (v) out.push({ step: i, beat, note: r.note, velocity: Math.min(1, s.velocity * v), beats: stepLen }); }
    if (rings) for (const r of rings) if (r.pattern[i % r.pattern.length]) out.push({ step: i, beat, note: r.note, velocity: s.velocity, beats: stepLen });
    if (grid?.length) {
      const w = grid[0].length, k = i % (grid.length * w), row = grid[Math.floor(k / w)], c = k % w;
      if (row?.[c]) out.push({ step: i, beat, note: Math.min(127, scaleNote(s.root, s.scale, c)), velocity: s.velocity, beats: stepLen * s.gate });
    }
  }
  return out;
}

// ---- starting points ------------------------------------------------------------------------------------------------

/** Ready-made patches (a name → a patch). */
export function examplePatch(name = 'starter', bits) {
  const mods = [], cables = [];
  const add = (id, kind, x, y, settings = {}) => { mods.push({ id, kind, x, y, settings }); return id; };
  const wire = (from, to, slot = 'input') => cables.push({ from, to, slot });
  if (name === 'arecibo') {
    add('message', 'Bits', 20, 30, { bits: bits || KINDS.Bits.params.bits.def, scale: 'pentatonic', root: 45, division: 4, gate: 0.8 });
    add('strings', 'Karplus', 260, 30, { channel: 2, decay: 2.2, damping: 0.7, level: 0.4 });
    add('space', 'Reverb', 480, 30, { decay: 3.5, mix: 0.45 });
    add('out', 'Output', 700, 30);
    wire('message', 'strings', 'notes'); wire('strings', 'space'); wire('space', 'out');
  } else {
    add('melody', 'Steps', 20, 30);
    add('lead', 'Synth', 260, 30, { voice: 'subtractive', filter_env: 0.5, cutoff: 900, resonance: 3, release: 0.15 });
    add('echo', 'Delay', 480, 30, { seconds: 0.375, feedback: 0.35, mix: 0.3 });
    add('beat', 'Drums', 20, 230);
    add('kit', 'DrumSynth', 260, 230);
    add('mix', 'Mixer', 480, 230, { level_2: 0.9 });
    add('out', 'Output', 700, 130);
    wire('melody', 'lead', 'notes'); wire('beat', 'kit', 'notes');
    wire('lead', 'echo'); wire('echo', 'mix', 'input_1'); wire('kit', 'mix', 'input_2'); wire('mix', 'out');
  }
  return normalizePatch({ modules: mods, cables });
}
