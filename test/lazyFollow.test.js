import { describe, it, expect } from 'vitest';
import { lazyFollow, lazyCatchUp } from '../src/process/strokes.js';

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('lazyFollow (the lazy pen, following a cursor that jumps)', () => {
  it('the string is taut after a big jump: the pen sits one radius from the cursor', () => {
    const pen = lazyFollow([0, 0], [0, 0], [300, 0], 40, 0, 2);
    expect(dist(pen, [300, 0])).toBeCloseTo(40, 6);
  });

  it('the same line sent as few big events or many small ones leaves the pen in the same place', () => {
    const radius = 40, a = [0, 0], b = [300, 120];
    const along = (k, n) => [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n];
    const run = n => { let pen = [0, 0]; for (let k = 1; k <= n; k++) pen = lazyFollow(pen, along(k - 1, n), along(k, n), radius, 0, 2); return pen; };
    const coarse = run(3), fine = run(300);
    expect(dist(coarse, fine)).toBeLessThan(2.5);
    expect(dist(fine, b)).toBeCloseTo(radius, 0);   // taut, one radius behind the cursor
  });

  it('a big jump never moves the pen more than the cursor did (no snap)', () => {
    const pen0 = [0, 0], cursor = [300, 0];
    const pen = lazyFollow(pen0, [0, 0], cursor, 40, 0, 2);
    expect(dist(pen0, pen)).toBeLessThanOrEqual(dist([0, 0], cursor) + 1e-6);
    expect(dist(pen, cursor)).toBeCloseTo(40, 6);
  });

  it('with no radius the pen is the cursor; smoothing eases it toward the cursor', () => {
    expect(lazyFollow([0, 0], [0, 0], [50, 10], 0, 0, 2)).toEqual([50, 10]);
    const eased = lazyFollow([0, 0], [0, 0], [100, 0], 0, 0.5, 2);
    expect(eased[0]).toBeCloseTo(50, 6);
  });

  it('a small move inside the string does not move the pen', () => {
    expect(lazyFollow([0, 0], [0, 0], [10, 10], 40, 0, 2)).toEqual([0, 0]);
  });

  it('a still pointer: the pen catches up (half the gap in tau ln 2 ms), and nothing moves in no time', () => {
    expect(lazyCatchUp([0, 0], [100, 0], 0, 120)).toEqual([0, 0]);
    const half = lazyCatchUp([0, 0], [100, 0], 120 * Math.LN2, 120);
    expect(half[0]).toBeCloseTo(50, 6);
    const long = lazyCatchUp([0, 0], [100, 0], 2000, 120);
    expect(dist(long, [100, 0])).toBeLessThan(0.01);
    expect(lazyCatchUp([7, 7], [7, 7], 500, 120)).toEqual([7, 7]);
  });
});
