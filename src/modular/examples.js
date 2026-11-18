/**
 * Ready-made patches drawn on the canvas (pure): each adds its modules and cables to a draft document at a place, and
 * returns their ids. The modular toolbar's Examples menu, the lesson and the tests use them.
 */
import { moduleMark, plug } from './model.js';
import { normalizeElement } from '../process/document.js';

export const EXAMPLES = Object.freeze({
  euclid: { label: 'Euclidean drums', hint: 'Three rings (kick, snare, hats) into synthesized drums, a little room, the speakers' },
  grid: { label: 'Grid melody', hint: 'A matrix of pentatonic notes into a plucked string, with an echo' },
  drone: { label: 'Drone with an LFO', hint: 'Two oscillators a fifth apart through a filter an LFO sweeps' },
  band: { label: 'Small band', hint: 'Euclid drums, a Grid bass on a synth, a Steps lead, a Mixer' },
  arecibo: { label: 'Arecibo message', hint: 'The 1974 message read row by row as notes of a scale (a Bits sequencer)' }
});

/** Add an example at x, y (in place, on a draft document). bits: the Arecibo message's rows, for 'arecibo'. Returns the new ids. */
export function addExample(d, name, x, y, { stage, board, bits } = {}) {
  const ids = [];
  const add = (key, kind, dx, dy, settings = {}, label = '', size) => {
    const e = normalizeElement({ ...moduleMark(kind, x + dx, y + dy, settings, size ? { size } : {}), ...(label ? { label } : {}) }, stage || d.stages[0].id);
    if (board && board !== 'main') e.board = board;
    d.elements.push(e); ids.push(e.id);
    return e.id;
  };
  const wire = (a, b, slot = 'input', amount) => { const c = plug(d, a, b, slot); if (c) { if (amount !== undefined) c.play.cable.amount = amount; ids.push(c.id); } };
  if (name === 'euclid') {
    const seq = add('seq', 'Euclid', 0, 0, { rings: '16 4 0 36\n16 3 2 38\n16 7 0 42\n12 5 1 46' });
    const kit = add('kit', 'DrumSynth', 210, 40);
    const room = add('room', 'Reverb', 390, 40, { decay: 1.2, mix: 0.18 });
    const out = add('out', 'Output', 560, 40);
    wire(seq, kit, 'notes'); wire(kit, room); wire(room, out);
  } else if (name === 'grid') {
    const seq = add('seq', 'Grid', 0, 0, { root: 57, gate: 0.6 });
    const str = add('str', 'Karplus', 260, 20, { decay: 1.6, damping: 0.6, level: 0.5 });
    const echo = add('echo', 'Delay', 430, 20, { seconds: 0.45, feedback: 0.4, mix: 0.3 });
    const scope = add('scope', 'Scope', 590, 0);
    const out = add('out', 'Output', 800, 20);
    wire(seq, str, 'notes'); wire(str, echo); wire(echo, scope); wire(scope, out);
  } else if (name === 'drone') {
    const a = add('a', 'Osc', 0, 0, { wave: 'sawtooth', freq: 55, level: 0.25 });
    const b = add('b', 'Osc', 0, 110, { wave: 'sawtooth', freq: 82.5, detune: 7, level: 0.2 });
    const mix = add('mix', 'Mixer', 170, 20);
    const lfo = add('lfo', 'LFO', 170, 200, { rate: 0.12, depth: 0.8 });
    const f = add('f', 'Filter', 360, 50, { cutoff: 700, resonance: 6 });
    const scope = add('scope', 'Scope', 540, 30);
    const out = add('out', 'Output', 750, 50, { level: 0.5 });
    wire(a, mix, 'input_1'); wire(b, mix, 'input_2'); wire(mix, f); wire(lfo, f, 'mod:cutoff'); wire(f, scope); wire(scope, out);
  } else if (name === 'band') {
    const drums = add('drums', 'Euclid', 0, 0, { rings: '16 5 0 36\n16 2 4 38\n16 9 0 42' });
    const bassSeq = add('bassSeq', 'Grid', 0, 200, { cells: 'x.......x.......\n........x...x...\n....x.........x.\n..x.....x.......\nx...............', root: 33, scale: 'minor', gate: 0.7 });
    const leadSeq = add('leadSeq', 'Steps', 0, 380, { notes: 'A4 - C5 - E5 D5 - C5 A4 - - G4 A4 - - -', gate: 0.6 });
    const kit = add('kit', 'DrumSynth', 260, 30);
    const bass = add('bass', 'Synth', 260, 220, { voice: 'subtractive', wave: 'sawtooth', cutoff: 500, resonance: 4, filter_env: 0.6, release: 0.1, channel: 3 });
    const lead = add('lead', 'Synth', 260, 390, { voice: 'fm', fm_ratio: 3, fm_index: 1.2, release: 0.3, channel: 4, level: 0.25 });
    const echo = add('echo', 'Delay', 440, 395, { seconds: 0.375, feedback: 0.35, mix: 0.3 });
    const mix = add('mix', 'Mixer', 620, 150, { level_1: 1.2, level_2: 1.1, level_3: 0.9, master: 1 });
    const out = add('out', 'Output', 810, 180, { level: 0.9 });
    wire(drums, kit, 'notes'); wire(bassSeq, bass, 'notes'); wire(leadSeq, lead, 'notes');
    wire(kit, mix, 'input_1'); wire(bass, mix, 'input_2'); wire(lead, echo); wire(echo, mix, 'input_3'); wire(mix, out);
  } else if (name === 'arecibo') {
    const msg = add('msg', 'Bits', 0, 0, { bits: bits || '1010101\n0110011\n1111000', scale: 'pentatonic', root: 45, division: 4, gate: 0.8 }, 'Arecibo', [130, 330]);
    const str = add('str', 'Karplus', 230, 30, { channel: 2, decay: 2.2, damping: 0.7, level: 0.45 });
    const space = add('space', 'Reverb', 400, 30, { decay: 3.5, mix: 0.45 });
    const out = add('out', 'Output', 570, 30);
    wire(msg, str, 'notes'); wire(str, space); wire(space, out);
  }
  return ids;
}
