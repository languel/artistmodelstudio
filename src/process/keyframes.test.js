import { describe, it, expect } from 'vitest';
import { valueAt, setKey, removeKey, laneFor, keyNear } from './keyframes.js';

const take = () => ({ type: 'ams-take', clips: [], tracks: [] });

describe('keyframes', () => {
  it('holds before the first and after the last key, eases between', () => {
    const k = [{ t: 1000, v: 0, ease: 'linear' }, { t: 3000, v: 10, ease: 'linear' }];
    expect(valueAt(k, 0)).toBe(0);
    expect(valueAt(k, 2000)).toBeCloseTo(5);
    expect(valueAt(k, 9000)).toBe(10);
    expect(valueAt([], 5)).toBe(null);
  });
  it('hold keeps the earlier value until the next key', () => {
    const k = [{ t: 0, v: 1, ease: 'hold' }, { t: 1000, v: 5, ease: 'linear' }];
    expect(valueAt(k, 999)).toBe(1);
    expect(valueAt(k, 1000)).toBe(5);
  });
  it('setKey makes a lane, changes a key near the time instead of adding one, and keeps keys sorted', () => {
    const t = take();
    setKey(t, 'board:b.opacity', 2000, 1);
    setKey(t, 'board:b.opacity', 500, 0);
    setKey(t, 'board:b.opacity', 2010, 0.5);   // near 2000: changed
    const lane = laneFor(t, 'board:b.opacity');
    expect(lane.keys.map(k => [k.t, k.v])).toEqual([[500, 0], [2010, 0.5]]);
    expect(lane.dur).toBe(2010);
    expect(keyNear(lane, 505).v).toBe(0);
  });
  it('removeKey removes a key and, the last one, the lane', () => {
    const t = take();
    setKey(t, 'a:x.y', 0, 1); setKey(t, 'a:x.y', 1000, 2);
    expect(removeKey(t, 'a:x.y', 1000)).toBe(true);
    expect(laneFor(t, 'a:x.y').keys.length).toBe(1);
    expect(removeKey(t, 'a:x.y', 0)).toBe(true);
    expect(laneFor(t, 'a:x.y')).toBe(null);
    expect(removeKey(t, 'a:x.y', 0)).toBe(false);
  });
});

describe('keyframes of other kinds', () => {
  it('blends colours and palettes, steps choices by their order and snaps toggles half-way', () => {
    const k = (a, b) => [{ t: 0, v: a, ease: 'linear' }, { t: 1000, v: b, ease: 'linear' }];
    expect(valueAt(k('#000000', '#ffffff'), 500)).toBe('#808080');
    expect(valueAt(k(['#000000', '#ff0000'], ['#ffffff', '#00ff00']), 500)).toEqual(['#808080', '#808000']);
    const meta = { options: ['a', 'b', 'c', 'd'] };
    expect(valueAt(k('a', 'd'), 0, meta)).toBe('a');
    expect(valueAt(k('a', 'd'), 400, meta)).toBe('b');
    expect(valueAt(k('a', 'd'), 700, meta)).toBe('c');
    expect(valueAt(k(false, true), 400)).toBe(false);
    expect(valueAt(k(false, true), 600)).toBe(true);
  });
});

import { thinKeys } from './keyframes.js';
describe('thinning a recording', () => {
  it('drops keys a straight line reproduces and keeps the corners', () => {
    const keys = [];
    for (let i = 0; i <= 20; i++) keys.push({ t: i * 100, v: i <= 10 ? i : 10 - (i - 10) * 2, ease: 'linear' });   // up then down faster
    const dropped = thinKeys(keys, 0.05);
    expect(dropped).toBeGreaterThan(15);
    expect(keys.map(k => k.t)).toEqual([0, 1000, 2000]);
    const wobble = [{ t: 0, v: 0 }, { t: 100, v: 5 }, { t: 200, v: 0 }];
    expect(thinKeys(wobble, 0.05)).toBe(0);
    expect(thinKeys([{ t: 0, v: 'a' }, { t: 1, v: 'b' }, { t: 2, v: 'c' }], 1)).toBe(0);
  });
});

import { setSignalProvider, followSound, followValue, laneValue as laneValueOf, isSoundSignal } from './keyframes.js';

describe('a parameter that follows the sound', () => {
  const fake = (name, t) => (name === 'level' ? Math.min(1, t / 1000) : name === 'onset' ? (t === 1000 ? 1 : 0) : 0);
  it('moves between lo and hi with the signal, and gives nothing without a provider', () => {
    setSignalProvider(null);
    expect(followValue({ signal: 'level', lo: 2, hi: 6 }, 500)).toBeNull();
    setSignalProvider(fake);
    expect(followValue({ signal: 'level', lo: 2, hi: 6 }, 500)).toBeCloseTo(4);
    expect(followValue({ signal: 'level', lo: 2, hi: 6 }, 5000)).toBeCloseTo(6);
    expect(followValue({ signal: 'bass', lo: 2, hi: 6 }, 500)).toBeCloseTo(2);
  });
  it('lets a peak fall away over the release time, and never looks before the start', () => {
    setSignalProvider(fake);
    const f = { signal: 'onset', lo: 0, hi: 1, release: 150 };
    expect(followValue(f, 1000)).toBeCloseTo(1);
    expect(followValue(f, 1100)).toBeGreaterThan(0.4); expect(followValue(f, 1100)).toBeLessThan(0.9);
    expect(followValue(f, 1400)).toBeLessThan(followValue(f, 1100));
    expect(followValue(f, 0)).toBe(0);
  });
  it('makes a lane with no keys, and a key turns it back into an ordinary lane', () => {
    setSignalProvider(fake);
    const tk = take();
    const lane = followSound(tk, 'ctl:b1.size', 'level', { lo: 1, hi: 3 }, 'Size');
    expect(lane.keys).toEqual([]); expect(lane.follow.signal).toBe('level'); expect(lane.label).toBe('Size ← level');
    expect(laneValueOf(lane, 500)).toBeCloseTo(2);
    expect(() => followSound(tk, 'ctl:b1.size', 'nope')).toThrow(/signal is one of/);
    setKey(tk, 'ctl:b1.size', 200, 5);
    expect(lane.follow).toBeUndefined(); expect(laneValueOf(lane, 200)).toBe(5);
  });
  it('knows the signal names', () => {
    expect(['level', 'pitch', 'clarity', 'fft0', 'fft63', 'band7'].every(isSoundSignal)).toBe(true);
    expect(['fft64', 'band8', 'volume', ''].some(isSoundSignal)).toBe(false);
  });
});
