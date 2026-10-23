import { describe, it, expect } from 'vitest';
import { SCALES, scaleNames, scaleNotes, snap, step, noteName, noteNumber, scaleName } from './scale.js';
import { musicHelpers, createVoiceTracker } from './music.js';
import { createGmOutput, createLogOutput, GM_PROGRAMS } from './outputs/gm.js';

describe('scales', () => {
  it('has the Midinous set', () => {
    expect(scaleNames()).toHaveLength(32);
    expect(scaleName('pentatonic minor')).toBe('Pentatonic Minor');
    expect(SCALES.Dorian).toEqual([2, 1, 2, 2, 2, 1, 2]);
  });
  it('lists, snaps and steps', () => {
    expect(scaleNotes('ionian', 60).filter(n => n >= 60 && n <= 72)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
    expect(snap(61, 'ionian', 60)).toBe(60);
    expect(snap(66, 'ionian', 60)).toBe(65);
    expect(snap(61, 'ionian', 62)).toBe(61);    // D major has C#
    expect(step(60, 2, 'ionian', 60)).toBe(64);
    expect(step(60, -1, 'ionian', 60)).toBe(59);
    expect(step(127, 5, 'ionian', 60)).toBe(scaleNotes('ionian', 60).at(-1));
    expect(snap(61, 'nonsense', 60)).toBe(61);   // an unknown name is Chromatic: every note is in it
  });
  it('names notes', () => {
    expect(noteName(60)).toBe('C4'); expect(noteNumber('C#4')).toBe(61); expect(noteNumber('Bb3')).toBe(58); expect(noteNumber('x')).toBe(60);
  });
});

const ctx = { tempo: 120, signature: { numerator: 4, denominator: 4 }, fps: 30 };
const helpersFor = (event, state = {}) => { const out = []; return { out, h: musicHelpers({ out: m => out.push(m), ctx, event, api: { state, rng: Math.random, launch() {}, kill() {} } }) }; };

describe('music helpers', () => {
  it('notes come as on and off messages, with durations as times', () => {
    const { out, h } = helpersFor({ t: 2, type: 'enter' });
    h.note(1, 'C4', 100, 0.5);
    h.note(2, 64, 127, '1 beat');
    expect(out).toEqual([
      { t: 2, bytes: [0x90, 60, 100] }, { t: 2.5, bytes: [0x80, 60, 0] },
      { t: 2, bytes: [0x91, 64, 127] }, { t: 2.5, bytes: [0x81, 64, 0] }
    ]);
  });
  it('a gated note ends when the trigger is left', () => {
    const state = {};
    const a = helpersFor({ t: 1, type: 'enter' }, state);
    a.h.note(1, 60, 90, 'gate');
    expect(a.out).toEqual([{ t: 1, bytes: [0x90, 60, 90] }]);
    const b = helpersFor({ t: 3.5, type: 'exit' }, state);
    b.h.release();
    expect(b.out).toEqual([{ t: 3.5, bytes: [0x80, 60, 0] }]);
    expect(state._held).toEqual([]);
  });
  it('clamps, converts and maps', () => {
    const { out, h } = helpersFor({ t: 0, type: 'enter' });
    h.notef(1, 0.5, 1); h.cc(1, 7, 300); h.ccf(1, 1, 0.5); h.bend(1, 1); h.program(3, 24);
    expect(out.map(m => m.bytes)).toEqual([[0x90, 63, 127], [0x80, 63, 0], [0xb0, 7, 127], [0xb0, 1, 64], [0xe0, 127, 127], [0xc2, 24]]);
    expect(h.map(5, [0, 10], [60, 72])).toBe(66);
    expect(h.lane(0.99, 4)).toBe(3); expect(h.lane(1, 4)).toBe(3); expect(h.quant(0.37, 4)).toBe(0.25);
  });
});

describe('voice tracker', () => {
  it('lets the last overlapping note-off through, not the first', () => {
    const v = createVoiceTracker();
    expect(v.pass([0x90, 60, 100])).toBe(true);
    expect(v.pass([0x90, 60, 100])).toBe(true);
    expect(v.pass([0x80, 60, 0])).toBe(false);
    expect(v.pass([0x80, 60, 0])).toBe(true);
    expect(v.pass([0x80, 60, 0])).toBe(true);        // a stray off is let through
    expect(v.pass([0xb0, 1, 5])).toBe(true);
    expect(v.pass([0x90, 61, 0])).toBe(true);        // note-on with velocity 0 is an off
  });
});

describe('gm output', () => {
  it('sends bytes to the backend once started, with delays as timers, and clears', async () => {
    const sent = [], timers = [];
    let t = 1000;
    const backend = async () => ({ send: d => sent.push(d), resume: async () => {}, state: () => 'running' });
    const gm = createGmOutput({ backend, now: () => t, setTimer: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimer: () => {}, programs: { 2: 40 } });
    gm.send([0x90, 60, 100], 1000);
    expect(sent).toEqual([]);                          // not started: silent
    expect(await gm.resume()).toBe('running');
    expect(sent).toEqual([[0xc1, 40]]);                // programs applied on start
    gm.send([0x90, 60, 100], 1000);
    gm.send([0x80, 60, 0], 1500);
    expect(sent.at(-1)).toEqual([0x90, 60, 100]);
    expect(timers).toHaveLength(1); expect(timers[0].ms).toBe(500);
    timers[0].fn();
    expect(sent.at(-1)).toEqual([0x80, 60, 0]);
    gm.clear();
    expect(sent.slice(-3)).toEqual([[0xbf, 64, 0], [0xbf, 120, 0], [0xbf, 123, 0]]);
    gm.setProgram(1, 5);
    expect(sent.at(-1)).toEqual([0xc0, 5]);
    expect(GM_PROGRAMS).toHaveLength(128);
  });
  it('the log output remembers', () => {
    const l = createLogOutput(); l.send([1, 2, 3], 5); l.clear();
    expect(l.sent).toEqual([{ bytes: [1, 2, 3], atMs: 5 }, { clear: true }]);
  });
});
