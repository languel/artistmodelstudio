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
