import { describe, it, expect } from 'vitest';
import { SCULPTS, SCULPT_OPPOSITE, effectiveSculpt, sculptMark } from '../src/process/sculpt.js';

const stroke = (x, y, extra = {}) => ({ x, y, dx: 0, dy: 0, radius: 60, strength: 1, pressure: 1, invert: false, boost: false, first: true, start: [x, y], board: null, ...extra });
const line = Array.from({ length: 40 }, (_, i) => [i * 6, 20 * Math.sin(i / 6), i * 16, 0.5]);

describe('Cmd: the opposite sculpt tool', () => {
  it('every pair is a pair of existing tools, and each is the other\'s opposite', () => {
    for (const [a, b] of Object.entries(SCULPT_OPPOSITE)) {
      expect(SCULPTS[a], a).toBeTruthy();
      expect(SCULPTS[b], b).toBeTruthy();
      expect(SCULPT_OPPOSITE[b]).toBe(a);
    }
  });

  it('the pairs: simplify and resample, smooth and jitter, pinch and relax', () => {
    expect(effectiveSculpt('simplify', true)).toBe('resample');
    expect(effectiveSculpt('resample', true)).toBe('simplify');
    expect(effectiveSculpt('smooth', true)).toBe('jitter');
    expect(effectiveSculpt('jitter', true)).toBe('smooth');
    expect(effectiveSculpt('pinch', true)).toBe('relax');
    expect(effectiveSculpt('relax', true)).toBe('pinch');
  });

  it('without Cmd, and for unpaired tools, nothing changes', () => {
    expect(effectiveSculpt('simplify', false)).toBe('simplify');
    for (const id of ['push', 'grab', 'twist', 'thicken']) expect(effectiveSculpt(id, true)).toBe(id);
  });

  it('Cmd on Simplify resamples: more points; plain Simplify: no more', () => {
    const sparse = Array.from({ length: 23 }, (_, i) => [i * 22, (i % 2 ? 60 : 0) + Math.sin(i) * 20, i * 16, 0.5]);
    const e = { role: 'line', points: sparse, closed: false };
    const big = extra => stroke(240, 30, { radius: 119, ...extra });
    const plain = sculptMark(effectiveSculpt('simplify', false), e, big({}), undefined, () => 0.5, { orig: sparse, state: {} });
    const cmd = sculptMark(effectiveSculpt('simplify', true), e, big({ boost: true }), undefined, () => 0.5, { orig: sparse, state: {} });
    expect(plain.length).toBeLessThanOrEqual(sparse.length);
    expect(cmd.length).toBeGreaterThan(sparse.length);
  });

  it('Thicken: Cmd, like Alt, makes the line thinner', () => {
    const e = { role: 'line', points: line, closed: false };
    const pressure = out => out.reduce((a, q) => a + q[3], 0);
    const thick = sculptMark('thicken', e, stroke(120, 0), undefined, () => 0.5, { orig: line, state: {} });
    const thinCmd = sculptMark('thicken', e, stroke(120, 0, { boost: true }), undefined, () => 0.5, { orig: line, state: {} });
    const thinAlt = sculptMark('thicken', e, stroke(120, 0, { invert: true }), undefined, () => 0.5, { orig: line, state: {} });
    expect(pressure(thick)).toBeGreaterThan(pressure(line));
    expect(pressure(thinCmd)).toBeLessThan(pressure(line));
    expect(pressure(thinAlt)).toBeCloseTo(pressure(thinCmd), 9);
  });
});
