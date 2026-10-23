import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TakePlayer, DEFAULT_SPAN } from './takePlayer.js';
import { createDocument, normalizeDocument, ProcessStore } from '../process/document.js';
import { createTake } from '../process/take.js';

let frames, clock;
beforeEach(() => {
  frames = [];
  clock = 0;
  vi.stubGlobal('requestAnimationFrame', fn => frames.push(fn));
  vi.stubGlobal('cancelAnimationFrame', () => { frames.length = 0; });
  vi.stubGlobal('performance', { now: () => clock });
});
afterEach(() => vi.unstubAllGlobals());

const make = () => {
  const store = new ProcessStore(normalizeDocument(createDocument()));
  const app = { store, canvas: { invalidate() {}, w: 100, h: 100, cam: {} }, emit() {} };
  return new TakePlayer(app);
};
/** Run one animation frame at time ms. */
const frame = ms => { const f = frames.shift(); clock = ms; f?.(ms); };

describe('the transport without a take', () => {
  it('plays, moves the playhead by the wall clock, and has no end', () => {
    const p = make();
    expect(p.take).toBe(null);
    expect(p.duration).toBe(DEFAULT_SPAN);
    p.play();
    expect(p.playing).toBe(true);
    frame(500); frame(1500);
    expect(p.t).toBeCloseTo(1500, 0);
    p.rate = 2; frame(2500);
    expect(p.t).toBeCloseTo(3500, 0);
    p.seek(90000);
    expect(p.t).toBe(90000);
    expect(p.duration).toBeGreaterThan(90000);
    p.pause();
    expect(p.playing).toBe(false);
  });

  it('loops in the marked range, in ms, only while loop is on', () => {
    const p = make();
    p.setSettings({ loop: { start: 1, end: 3 } });
    expect(p.loopRange).toEqual([1000, 3000]);
    expect(p.wrapRange()).toBe(null);
    p.loop = true;
    expect(p.wrapRange()).toEqual([1000, 3000]);
    p.play();
    expect(p.t).toBe(1000);            // starts at the range
    frame(2500);
    expect(p.t).toBeCloseTo(3500 - 2000, 0);   // 1000 + 2500 wraps into [1000, 3000)
    p.pause();
  });

  it('keeps tempo and meter in the scene, normalized, as one undo step', () => {
    const p = make();
    p.setSettings({ tempo: 90, signature: { numerator: 3, denominator: 4 }, ruler: 'beats' });
    expect(p.app.store.doc.transport).toMatchObject({ tempo: 90, ruler: 'beats', signature: { numerator: 3, denominator: 4 } });
    p.setSettings({ tempo: 5000 });
    expect(p.settings.tempo).toBe(400);
    expect(p.settings.ruler).toBe('beats');
    p.app.store.undo();
    expect(p.settings.tempo).toBe(90);
  });
});

describe('a take on the same transport', () => {
  it('still stops at its end, and loops the whole take', () => {
    const p = make();
    const take = createTake({ baseline: p.app.store.doc, clips: [{ id: 'c', track: 'say', start: 0, dur: 2000, text: 'hi' }] });
    p.load(take);
    expect(p.duration).toBe(2000);
    p.seek(5000);
    expect(p.t).toBe(2000);            // clamped to the take
    p.seek(0); p.play(); frame(2500);
    expect(p.playing).toBe(false);
    expect(p.t).toBe(2000);
    p.loop = true; p.play();
    expect(p.t).toBe(0);               // started over
    clock = 0; frames.length = 0; p.pause();
  });
});
