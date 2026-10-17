import { describe, it, expect } from 'vitest';
import { sculptMark, SCULPTABLE } from '../src/process/sculpt.js';

// A dense, smooth curve: 120 points along a gentle arc, about 3 units apart.
const arc = Array.from({ length: 120 }, (_, i) => [i * 3, 40 * Math.sin(i / 25) + i * 0.2, i * 16, 0.5]);
const brushAt = (x, y, radius, strength = 0.5, extra = {}) => ({ x, y, dx: 0, dy: 0, radius, strength, pressure: 1, invert: false, boost: false, first: true, start: [x, y], board: null, ...extra });

describe('the Simplify sculpt brush', () => {
  it('is a sculptable mark', () => {
    expect(SCULPTABLE({ role: 'line', points: arc })).toBe(true);
  });

  it('removes points under the brush, not elsewhere on the mark', () => {
    const e = { role: 'line', points: arc, closed: false };
    const out = sculptMark('simplify', e, brushAt(180, 50, 40), undefined, () => 0.5, { orig: arc, state: {} });
    expect(out).not.toBeNull();
    expect(out.length).toBeLessThan(arc.length);
    expect(out.length).toBeGreaterThan(arc.length * 0.5);   // local: most of the curve is untouched
    // the ends stay where they were
    expect(out[0].slice(0, 2)).toEqual(arc[0].slice(0, 2));
    expect(out.at(-1).slice(0, 2)).toEqual(arc.at(-1).slice(0, 2));
  });

  it('a stronger brush removes more', () => {
    const e = { role: 'line', points: arc, closed: false };
    const weak = sculptMark('simplify', e, brushAt(180, 50, 40, 0.25), undefined, () => 0.5, { orig: arc, state: {} });
    const strong = sculptMark('simplify', e, brushAt(180, 50, 40, 1), undefined, () => 0.5, { orig: arc, state: {} });
    expect(strong.length).toBeLessThan(weak.length);
  });
});

describe('the Resample sculpt brush', () => {
  const sparse = Array.from({ length: 23 }, (_, i) => [i * 22, (i % 2 ? 60 : 0) + Math.sin(i) * 20, i * 16, 0.5]);

  it('adds evenly spaced points under the brush and keeps every original point', () => {
    const e = { role: 'line', points: sparse, closed: false };
    const out = sculptMark('resample', e, brushAt(240, 30, 119, 1), undefined, () => 0.5, { orig: sparse, state: {} });
    expect(out.length).toBeGreaterThan(sparse.length);
    for (const q of sparse) expect(out.some(o => o[0] === q[0] && o[1] === q[1])).toBe(true);
  });

  it('on a straight mark the new points sit on the old segments: the line does not change', () => {
    const e = { role: 'line', points: sparse, closed: false, path: 'straight' };
    const out = sculptMark('resample', e, brushAt(240, 30, 119, 1), undefined, () => 0.5, { orig: sparse, state: {} });
    // the path length is unchanged (resampling cannot move a polyline)
    const len = p => p.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
    expect(len(out)).toBeCloseTo(len(sparse), 6);
  });

  it('does nothing away from the brush', () => {
    const e = { role: 'line', points: sparse, closed: false };
    const out = sculptMark('resample', e, brushAt(5000, 5000, 40, 1), undefined, () => 0.5, { orig: sparse, state: {} });
    expect(out === null || out.length === sparse.length).toBe(true);
  });
});
