import { describe, it, expect } from 'vitest';
import { createRunner, scoreSignature, hasScore } from './runner.js';
import { createLogOutput } from './outputs/gm.js';
import { normalizeDocument } from '../process/document.js';

// A line across a 100 × 100 board, a traveler that crosses it in 10 s, a plane at x 40..60 that plays a gated note on entry.
const doc = (emit = "note(1, snap(60 + lane(ny, 8), 'ionian', 60), 100, 'gate')") => normalizeDocument({
  artboard: { width: 100, height: 100 },
  elements: [
    { id: 'p', role: 'line', points: [[0, 50], [100, 50]], path: 'straight', play: { path: true } },
    { id: 'dot', role: 'point', points: [[0, 50]], play: { travel: { on: 'p', dur: '20 beats' } } },
    { id: 'zone', role: 'plane', points: [[40, 40], [60, 40], [60, 60], [40, 60]], play: { trigger: { emit } } }
  ]
});

const make = (d = doc()) => {
  const log = createLogOutput();
  let clock = 0;
  const errors = [];
  const r = createRunner({ getDoc: () => d, getSettings: () => ({ tempo: 120, signature: { numerator: 4, denominator: 4 }, fps: 30 }), outputs: () => [log], now: () => clock, onError: m => errors.push(m) });
  let last = 0;
  // The wall clock moves with the playhead, except on a jump (a seek: the playhead moves, the clock hardly does).
  const tick = (t, { jump, ...o } = {}) => { clock += jump ? 25 : (t - last) * 1000; last = t; r.tick({ t, playing: true, rate: 1, ...o }); };
  return { r, log, tick, errors, bytes: () => log.sent.filter(s => s.bytes).map(s => s.bytes) };
};

describe('the runner', () => {
  it('sees which documents have a score', () => {
    expect(hasScore(doc())).toBe(true);
    expect(hasScore(normalizeDocument({ elements: [] }))).toBe(false);
    expect(scoreSignature(doc())).not.toBe(scoreSignature(doc("note(1, 61)")));
  });

  it('plays the note when the traveler enters, and ends it when it leaves, in time', () => {
    const { tick, log, bytes } = make();
    // 20 beats at 120 bpm: 10 s across 100 units; the plane is crossed from 4 s to 6 s.
    for (let t = 0; t <= 7; t += 0.025) tick(t);
    expect(bytes()).toEqual([[0x90, 64, 100], [0x80, 64, 0]]);   // ny 0.5 → lane 4 → 64, which is in C major
    const on = log.sent.find(s => s.bytes?.[0] === 0x90), off = log.sent.find(s => s.bytes?.[0] === 0x80);
    // messages are sent about a lookahead ahead of their time: atMs - now ≈ (due - t) in ms
    expect(on.atMs).toBeGreaterThanOrEqual(3900); expect(on.atMs).toBeLessThanOrEqual(4100);
    expect(off.atMs).toBeGreaterThanOrEqual(5900); expect(off.atMs).toBeLessThanOrEqual(6100);
  });

  it('a jump (seek) stops the sound and starts again from there, not replaying what was skipped', () => {
    const { tick, log, bytes } = make();
    for (let t = 0; t <= 4.5; t += 0.025) tick(t);       // inside the plane: note on
    expect(bytes()).toEqual([[0x90, 64, 100]]);
    tick(9, { jump: true });                             // a seek to after it
    expect(log.sent.some(s => s.clear)).toBe(true);
    for (let t = 9.025; t <= 12; t += 0.025) tick(t);
    expect(bytes()).toEqual([[0x90, 64, 100]]);          // nothing new: the plane is behind
    // seeking into the middle of the plane starts quietly (no entry happened), and nothing hangs
    tick(5, { jump: true });
    for (let t = 5.025; t <= 7; t += 0.025) tick(t);
    expect(bytes()).toEqual([[0x90, 64, 100]]);
  });

  it('pausing silences; changing the score rebuilds', () => {
    const { r, tick, log } = make();
    tick(1); tick(1.025);
    r.tick({ t: 1.05, playing: false });
    expect(log.sent.at(-1)).toEqual({ clear: true });
    tick(1.1, { key: 'a' }); tick(1.125, { key: 'b' });   // (a new key is a changed score)
    expect(log.sent.filter(s => s.clear).length).toBeGreaterThanOrEqual(3);
  });

  it('a loop end bounds how far ahead it plays', () => {
    const { tick, bytes } = make();
    for (let t = 3.8; t <= 3.95; t += 0.025) tick(t, { limit: 3.9 });
    expect(bytes()).toEqual([]);                         // the entry at 4 s is past the loop end
  });

  it('a score with an error says so and the others carry on', () => {
    const { tick, errors } = make(doc('this is not ( code'));
    tick(0); tick(0.025);
    expect(errors.length).toBeGreaterThan(0);
  });
});
