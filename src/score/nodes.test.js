import { describe, it, expect } from 'vitest';
import { normalizeDocument } from '../process/document.js';
import { normalizeTransport } from '../time/sceneTransport.js';
import { renderScore } from './runner.js';
import { evalGate, nodeNote, normalizeNode } from './nodes.js';

// 120 bpm, a beat is 25 units: a line 100 long takes 2 s.
const SETTINGS = normalizeTransport({ tempo: 120, beatUnits: 25 });
const line = (id, pts, extra = {}) => ({ id, role: 'line', points: pts, play: { path: true }, ...extra });
const node = (id, x, y, n) => ({ id, role: 'point', points: [[x, y]], realize: { brush: 'node', params: { size: 12 } }, play: { node: n } });
const traveler = (id, on, x, y, travel = {}) => ({ id, role: 'point', points: [[x, y]], play: { travel: { on, ...travel } } });
const run = (elements, seconds) => renderScore(normalizeDocument({ artboard: { width: 400, height: 400 }, elements }), SETTINGS, seconds);
const ons = out => out.messages.filter(m => (m.bytes[0] & 0xf0) === 0x90).map(m => [Math.round(m.t * 1000) / 1000, m.bytes[1]]);

describe('nodes along a path', () => {
  it('a chain: a start node sends a traveler down its line, which plays each node as it passes its centre', () => {
    const out = run([
      line('L', [[0, 0], [100, 0]]),
      node('a', 0, 0, { kind: 'note', note: 60, start: true }),
      node('b', 50, 0, { kind: 'note', note: 62 }),
      node('c', 100, 0, { kind: 'note', note: 64 })
    ], 3);
    expect(out.errors).toEqual([]);
    expect(ons(out)).toEqual([[0, 60], [1, 62], [2, 64]]);
  });

  it('relative notes step from the note the signal carries (in a scale)', () => {
    const out = run([
      line('L', [[0, 0], [100, 0]]),
      node('a', 0, 0, { kind: 'note', note: 60, start: true }),
      node('b', 50, 0, { kind: 'note', rel: 1, scale: 'Ionian', root: 60 }),
      node('c', 100, 0, { kind: 'note', rel: 2, scale: 'Ionian', root: 60 })
    ], 3);
    expect(ons(out).map(x => x[1])).toEqual([60, 62, 65]);
  });

  it('a muted note sounds nothing but still carries its note; chance 0 never sounds', () => {
    const out = run([
      line('L', [[0, 0], [100, 0]]),
      node('a', 0, 0, { kind: 'note', note: 60, start: true, mute: true }),
      node('b', 50, 0, { kind: 'note', rel: 2, chance: 0 }),
      node('c', 100, 0, { kind: 'note', rel: 0 })
    ], 3);
    expect(ons(out)).toEqual([[2, 62]]);
  });

  it('repeat plays the note again, a duration apart', () => {
    const out = run([line('L', [[0, 0], [100, 0]]), node('a', 0, 0, { kind: 'note', note: 60, start: true, dur: 0.5, repeat: 2 })], 3);
    expect(ons(out)).toEqual([[0, 60], [0.25, 60], [0.5, 60]]);
  });

  it('split sends the signal every way; robin one way, in turn', () => {
    const fork = mode => [
      line('E', [[0, 0], [100, 0]]), line('S', [[0, 0], [0, 100]]),
      node('a', 0, 0, { kind: 'anchor', start: true, mode }),
      node('e', 100, 0, { kind: 'note', note: 72 }), node('s', 0, 100, { kind: 'note', note: 48 })
    ];
    expect(ons(run(fork('split'), 3)).map(x => x[1]).sort()).toEqual([48, 72]);
    expect(ons(run(fork('robin'), 3))).toHaveLength(1);
    expect(ons(run(fork('portal'), 1)).sort((a, b) => a[1] - b[1])).toEqual([[0, 48], [0, 72]]);
  });

  it('a driver (a placed traveler that loops) passes nodes; a robin node sends signals out by turns', () => {
    const out = run([
      line('O', [[100, 100], [200, 100], [200, 200], [100, 200]], { closed: true, path: 'straight' }),
      traveler('d', 'O', 100, 100),
      line('B1', [[200, 100], [300, 100]]), line('B2', [[200, 100], [200, 0]]),
      node('x', 200, 100, { kind: 'anchor', mode: 'robin' }),
      node('b1', 300, 100, { kind: 'note', note: 70 }), node('b2', 200, 0, { kind: 'note', note: 50 })
    ], 13);
    // The loop is 400 long: 8 s a lap; the driver passes x at 2 s and 10 s; each branch takes 2 s.
    expect(ons(out)).toEqual([[4, 70], [12, 50]]);
  });

  it('a counter lets every n-th signal through; a switch every other; a gate reads its inputs', () => {
    const loop = extra => run([
      line('O', [[0, 0], [100, 0], [100, 100], [0, 100]], { closed: true, path: 'straight' }),
      traveler('d', 'O', 0, 0),
      line('B', [[100, 0], [200, 0]]), node('b', 200, 0, { kind: 'note', note: 70 }),
      ...extra
    ], 33);
    const counter = loop([node('x', 100, 0, { kind: 'counter', count: 2 })]);
    expect(ons(counter).map(x => x[0])).toEqual([12, 28]);
    const sw = loop([node('x', 100, 0, { kind: 'switch' })]);
    expect(ons(sw).map(x => x[0])).toEqual([4, 20]);
    // A switch (that blocks nothing) at the loop's first corner, read by a gate at the second.
    const gate = run([
      line('O', [[0, 0], [100, 0], [100, 100], [0, 100]], { closed: true, path: 'straight' }),
      traveler('d', 'O', 0, 0),
      node('s', 100, 0, { kind: 'switch', block: false }),
      node('g', 100, 100, { kind: 'gate', type: 'and', inputs: ['s'] }),
      line('B', [[100, 100], [200, 100]]), node('b', 200, 100, { kind: 'note', note: 70 })
    ], 33);
    expect(ons(gate).map(x => x[0])).toEqual([6, 22]);
  });

  it('a terminator stops even a traveler that loops (the absorber)', () => {
    const out = run([
      line('O', [[0, 0], [100, 0], [100, 100], [0, 100]], { closed: true, path: 'straight' }),
      traveler('d', 'O', 0, 0),
      node('n', 100, 0, { kind: 'note', note: 60 }),
      node('t', 100, 100, { kind: 'terminator' })
    ], 20);
    expect(ons(out)).toEqual([[2, 60]]);
  });

  it('a controller glides with slew', () => {
    const out = run([
      line('L', [[0, 0], [100, 0]]),
      node('a', 0, 0, { kind: 'cc', cc: 74, value: 0, start: true }),
      node('b', 100, 0, { kind: 'cc', cc: 74, value: 127, slew: 1 })
    ], 4);
    const ccs = out.messages.filter(m => (m.bytes[0] & 0xf0) === 0xb0).map(m => m.bytes[2]);
    expect(ccs[0]).toBe(0);
    expect(ccs.length).toBeGreaterThan(3);
    expect(ccs.at(-1)).toBe(127);
  });

  it('a node can send to another node by name, travelling the straight way there', () => {
    const out = run([
      node('a', 0, 0, { kind: 'note', note: 60, start: true, to: ['b'] }),
      node('b', 50, 0, { kind: 'note', note: 67 })
    ], 3);
    expect(ons(out)).toEqual([[0, 60], [1, 67]]);
  });
});

describe('node pieces', () => {
  it('gates', () => {
    expect(evalGate('and', [true, true])).toBe(true);
    expect(evalGate('and', [true, false])).toBe(false);
    expect(evalGate('or', [false, true])).toBe(true);
    expect(evalGate('xor', [true, true])).toBe(false);
    expect(evalGate('nand', [true, true])).toBe(false);
    expect(evalGate('nor', [false, false])).toBe(true);
  });
  it('relative notes with a range stay within it', () => {
    const n = normalizeNode({ kind: 'note', rel: 3, range: 'up', scale: 'Chromatic' });
    for (let i = 0; i < 20; i++) { const p = nodeNote(n, 60, Math.random); expect(p).toBeGreaterThanOrEqual(60); expect(p).toBeLessThanOrEqual(63); }
  });
});
