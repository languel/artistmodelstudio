import { describe, it, expect } from 'vitest';
import { straightEnd } from '../src/process/strokes.js';

const angle = ([x, y]) => Math.atan2(y, x) * 180 / Math.PI;

describe('straightEnd (Shift on a guide)', () => {
  it('snaps to the nearest 15 degrees and keeps the distance', () => {
    const [x, y] = straightEnd([0, 0], [10, 4]);   // 21.8 degrees: nearest is 15
    expect(angle([x, y])).toBeCloseTo(15, 6);
    expect(Math.hypot(x, y)).toBeCloseTo(Math.hypot(10, 4), 6);
  });

  it('a direction already on a step stays put', () => {
    const [x, y] = straightEnd([5, 5], [5 + 3, 5 + 3]);   // 45 degrees
    expect(angle([x - 5, y - 5])).toBeCloseTo(45, 6);
  });

  it('relative to the start, not the origin', () => {
    const [x, y] = straightEnd([100, 100], [100, 200]);   // straight down: 90 degrees
    expect(x).toBeCloseTo(100, 6);
    expect(y).toBeCloseTo(200, 6);
  });
});
