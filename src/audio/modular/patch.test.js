import { describe, it, expect } from 'vitest';
import { KINDS, normalizePatch, settingsOf, toDefs, addModule, connect, disconnect, removeModule, setSettings, freeSlot, cableAllowed, instrumentsOn, targetsOf,
  parseNote, parseSteps, parseDrumRows, euclid, parseRings, parseBits, scaleNote, stepsBetween, lengthOf, examplePatch } from './patch.js';

describe('patch data', () => {
  it('keeps known kinds, fills defaults, stores only what differs', () => {
    const p = normalizePatch({ modules: [{ id: 'a', kind: 'Synth', settings: { cutoff: 99999, voice: 'nope', level: 0.35 } }, { id: 'b', kind: 'Nope' }, { id: 'a', kind: 'Gain' }] });
    expect(p.modules).toHaveLength(1);
    expect(p.modules[0].settings).toEqual({ cutoff: 18000 });
    expect(settingsOf(p.modules[0]).voice).toBe(KINDS.Synth.params.voice.def);
    expect(normalizePatch(null)).toEqual({ modules: [], cables: [] });
  });

  it('allows only cables that make sense, one into a slot, and no audio loops', () => {
    let p = normalizePatch({ modules: [{ id: 's', kind: 'Steps' }, { id: 'v', kind: 'Synth' }, { id: 'g', kind: 'Gain' }, { id: 'd', kind: 'Delay' }, { id: 'o', kind: 'Output' }] });
    p = connect(p, 's', 'v', 'notes');
    p = connect(p, 'v', 'g', 'input');
    p = connect(p, 'g', 'd', 'input');
    p = connect(p, 'd', 'o', 'input');
    expect(p.cables).toHaveLength(4);
    expect(connect(p, 'd', 'g', 'input').cables).toHaveLength(4);   // a loop: refused
    expect(connect(p, 'v', 'o', 'input').cables).toHaveLength(4);   // the slot is taken
    expect(cableAllowed(p.modules, p.cables, { from: 'v', to: 's', slot: 'notes' })).toBe(false);   // notes go from a sequencer to an instrument
    expect(cableAllowed(p.modules, p.cables, { from: 's', to: 'g', slot: 'input' })).toBe(false);   // a sequencer has no audio
    expect(freeSlot(p, 's', 'v')).toBe(null);   // (already cabled)
    expect(disconnect(p, { from: 'g', to: 'd', slot: 'input' }).cables).toHaveLength(3);
    expect(removeModule(p, 'g').cables).toHaveLength(2);
  });

  it('turns a patch into the engine’s description: audio modules, their inputs, the outputs', () => {
    const p = examplePatch('starter');
    const { defs, outputs } = toDefs(p);
    expect([...outputs]).toEqual(['out']);
    expect(defs.has('melody')).toBe(false);   // (sequencers are not audio)
    expect(defs.get('mix').inputs).toEqual({ input_1: 'echo', input_2: 'kit' });
    expect(defs.get('out').inputs).toEqual({ input: 'mix' });
    expect(targetsOf(p, 'melody')).toEqual(['lead']);
    expect(instrumentsOn(p, 10)).toEqual(['kit']);
    expect(instrumentsOn(p, 1)).toEqual(['lead']);
  });

  it('edits return new patches and keep ids unique', () => {
    let p = normalizePatch({});
    const a = addModule(p, 'Synth', 10, 20); p = a.patch;
    const b = addModule(p, 'Synth'); p = b.patch;
    expect(a.id).not.toBe(b.id);
    p = setSettings(p, a.id, { cutoff: 500 });
    expect(settingsOf(p.modules[0]).cutoff).toBe(500);
    expect(addModule(p, 'Nope').id).toBe(null);
  });
});

describe('sequencers', () => {
  it('reads notes', () => {
    expect(parseNote('C4')).toBe(60);
    expect(parseNote('Eb3')).toBe(51);
    expect(parseNote('F#2')).toBe(42);
    expect(parseNote('62')).toBe(62);
    expect(parseNote('-')).toBe(null);
    expect(parseSteps('C4 - E4')).toEqual([60, null, 64]);
  });

  it('reads drum rows and Euclidean rings', () => {
    expect(parseDrumRows('kick 36 x..X\nnonsense')).toEqual([{ name: 'kick', note: 36, steps: [1, 0, 0, 1.4] }]);
    expect(euclid(8, 3).map(Number)).toEqual([1, 0, 0, 1, 0, 0, 1, 0]);   // the tresillo
    expect(euclid(8, 3, 1).map(Number)).toEqual([0, 1, 0, 0, 1, 0, 0, 1]);
    expect(parseRings('16 4 0 36')[0].pattern.filter(Boolean)).toHaveLength(4);
  });

  it('plays the steps that start between two beats', () => {
    const m = { kind: 'Steps', settings: { notes: 'C4 - E4 G4', division: 4, gate: 0.5 } };
    const ev = stepsBetween(m, 0, 1);
    expect(ev.map(e => e.note)).toEqual([60, 64, 67]);
    expect(ev.map(e => e.beat)).toEqual([0, 0.5, 0.75]);
    expect(ev[0].beats).toBeCloseTo(0.125);
    expect(stepsBetween(m, 0.1, 0.5).map(e => e.note)).toEqual([]);   // (step 1 is a rest; step 2 starts at 0.5, not before)
    expect(stepsBetween(m, 1, 1.25).map(e => e.note)).toEqual([60]);   // it loops
    expect(lengthOf(m)).toBe(4);
  });

  it('reads a grid of bits row by row, a column a note of the scale', () => {
    expect(parseBits('10 2 1\n01')).toEqual([[1, 0, 1], [0, 1]]);
    expect(scaleNote(48, 'pentatonic', 0)).toBe(48);
    expect(scaleNote(48, 'pentatonic', 5)).toBe(60);
    const m = { kind: 'Bits', settings: { bits: '101\n010', root: 48, scale: 'pentatonic', division: 1 } };
    expect(stepsBetween(m, 0, 6).map(e => [e.step, e.note])).toEqual([[0, 48], [2, 52], [4, 50]]);
    expect(lengthOf(m)).toBe(6);
  });

  it('drums: every row on its step, accents louder', () => {
    const m = { kind: 'Drums', settings: { rows: 'kick 36 x.\nhat 42 xX', velocity: 0.5, division: 2 } };
    expect(stepsBetween(m, 0, 1).map(e => [e.note, e.velocity])).toEqual([[36, 0.5], [42, 0.5], [42, 0.7]]);
  });
});
