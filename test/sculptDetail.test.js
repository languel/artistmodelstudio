import { describe, it, expect } from 'vitest';
import { sculptMark, SCULPTS, sculptParams } from '../src/process/sculpt.js';

// 20 points 15 units apart: sparse next to a brush of radius 60 (it adds points above radius / 6 = 10 units)
const sparse = Array.from({ length: 20 }, (_, i) => [i * 15, 20 * Math.sin(i / 3), i * 16, 0.5]);
const mark = () => ({ role: 'line', points: sparse.map(q => q.slice()), closed: false });
const stroke = (extra = {}) => ({ x: 140, y: 0, dx: 8, dy: 0, radius: 60, strength: 1, pressure: 1, invert: false, boost: false, first: true, start: [140, 0], board: null, ...extra });
const run = (id, values) => sculptMark(id, mark(), stroke(), values, () => 0.5, { orig: sparse.map(q => q.slice()), state: {} });

describe('the Detail setting of the tools that add points', () => {
  it('the four tools have it; Grab starts at 0 and the others at 1', () => {
    for (const id of ['push', 'grab', 'pinch', 'twist']) expect(SCULPTS[id].params.some(p => p.key === 'detail'), id).toBe(true);
    expect(sculptParams('grab').detail).toBe(0);
    for (const id of ['push', 'pinch', 'twist']) expect(sculptParams(id).detail, id).toBe(1);
  });

  it('Detail 0 adds no points: only the points that exist move', () => {
    for (const id of ['push', 'grab', 'pinch', 'twist']) {
      const out = run(id, { detail: 0 });
      expect(out.length, id).toBe(sparse.length);
    }
  });

  it('Detail 1 is the usual: the brush adds points where it stretches the line', () => {
    for (const id of ['push', 'pinch', 'twist']) expect(run(id, { detail: 1 }).length, id).toBeGreaterThan(sparse.length);
    expect(run('grab', { detail: 1 }).length).toBeGreaterThan(sparse.length);
  });

  it('more Detail, more points', () => {
    expect(run('push', { detail: 2 }).length).toBeGreaterThan(run('push', { detail: 1 }).length);
    expect(run('push', { detail: 1 }).length).toBeGreaterThan(run('push', { detail: 0.5 }).length);
  });

  it('with no Detail given, Push is as it was and Grab adds nothing', () => {
    expect(run('push', undefined).length).toBeGreaterThan(sparse.length);
    expect(run('grab', undefined).length).toBe(sparse.length);
  });

  it('with Detail 0 the points that exist still move (Push follows the cursor)', () => {
    const out = run('push', { detail: 0 });
    const moved = out.some((q, i) => Math.hypot(q[0] - sparse[i][0], q[1] - sparse[i][1]) > 1);
    expect(moved).toBe(true);
  });
});
