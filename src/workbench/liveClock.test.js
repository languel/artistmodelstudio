import { describe, it, expect } from 'vitest';
import { liveClock } from './liveClock.js';

describe('liveClock', () => {
  it('keeps real spacing up to the gap and shortens longer gaps', () => {
    const c = liveClock([1000, 1500, 11500, 12000], 2000);
    expect(c.at(1000)).toBe(0);
    expect(c.at(1500)).toBe(500);
    expect(c.at(11500)).toBe(2500);      // 10 s of nothing becomes 2 s
    expect(c.at(12000)).toBe(3000);
  });
  it('squeezes the time inside a long gap in proportion, monotonic', () => {
    const c = liveClock([0, 10000], 2000);
    expect(c.at(5000)).toBe(1000);
    expect(c.at(2500)).toBeLessThan(c.at(5000));
  });
  it('two tracks sharing the clock stay aligned', () => {
    const c = liveClock([100, 5100, 5300], 1000);
    expect(c.at(5300) - c.at(5100)).toBe(200);   // a click and the stroke it made, 200 ms apart, are 200 ms apart on both
  });
  it('tolerates no anchors', () => { expect(liveClock([]).at(5)).toBe(0); });
});
