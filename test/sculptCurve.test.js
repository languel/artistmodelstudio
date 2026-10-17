import { describe, it, expect } from 'vitest';
import { sculptMark } from '../src/process/sculpt.js';

// Seven points about 50 units apart on a circle of radius 100: a curve whose chords sit a few units inside it.
const R = 100;
const arc = Array.from({ length: 7 }, (_, i) => [R * Math.cos(i * 0.5), R * Math.sin(i * 0.5), i * 16, 0.5]);
const stroke = (extra = {}) => ({ x: R * Math.cos(1.5), y: R * Math.sin(1.5), dx: 0, dy: 0, radius: 400, strength: 1, pressure: 1, invert: false, boost: false, first: true, start: [R * Math.cos(1.5), R * Math.sin(1.5)], board: null, ...extra });
const offCircle = out => Math.max(...out.map(q => Math.abs(Math.hypot(q[0], q[1]) - R)));
// away from the two ends (an open curve has no neighbour beyond them, so its end segments are looser)
const interiorOff = out => offCircle(out.filter(q => { const a = Math.atan2(q[1], q[0]); return a > 0.55 && a < 2.45; }));
const mark = path => ({ role: 'line', points: arc, closed: false, ...(path ? { path } : {}) });

describe('new points follow the mark', () => {
  it('Resample on a smooth mark puts the new points on its curve', () => {
    const out = sculptMark('resample', mark(), stroke(), { density: 50 }, () => 0.5, { orig: arc, state: {} });
    expect(out.length).toBeGreaterThan(arc.length * 3);
    expect(interiorOff(out)).toBeLessThan(0.3);
    const straight = sculptMark('resample', mark('straight'), stroke(), { density: 50 }, () => 0.5, { orig: arc, state: {} });
    expect(offCircle(out)).toBeLessThan(offCircle(straight) * 0.6);   // clearly closer to the curve, ends included
  });

  it('Resample on a straight mark keeps the straight segments', () => {
    const out = sculptMark('resample', mark('straight'), stroke(), { density: 50 }, () => 0.5, { orig: arc, state: {} });
    expect(out.length).toBeGreaterThan(arc.length * 3);
    // the new points sit on the chords, a few units inside the circle the original points lie on
    expect(offCircle(out)).toBeGreaterThan(1.5);
    // and the line is exactly the same polyline: its length does not change
    const len = p => p.slice(1).reduce((a, q, i) => a + Math.hypot(q[0] - p[i][0], q[1] - p[i][1]), 0);
    expect(len(out)).toBeCloseTo(len(arc), 6);
  });

  it('every original point is kept', () => {
    const out = sculptMark('resample', mark(), stroke(), { density: 50 }, () => 0.5, { orig: arc, state: {} });
    for (const q of arc) expect(out.some(o => o[0] === q[0] && o[1] === q[1])).toBe(true);
  });

  it('the move tools add their points on the curve too (Push with no movement shows it)', () => {
    const smooth = sculptMark('push', mark(), stroke({ radius: 120 }), undefined, () => 0.5, { orig: arc, state: {} });
    const straight = sculptMark('push', mark('straight'), stroke({ radius: 120 }), undefined, () => 0.5, { orig: arc, state: {} });
    expect(smooth.length).toBeGreaterThan(arc.length);
    expect(interiorOff(smooth)).toBeLessThan(0.3);
    expect(interiorOff(straight)).toBeGreaterThan(0.8);
  });

  it('time and pressure interpolate between the neighbours', () => {
    const e = { role: 'line', points: [[0, 0, 0, 0.2], [60, 10, 100, 1], [120, 0, 200, 0.2], [180, 10, 300, 1]], closed: false };
    const out = sculptMark('resample', e, stroke({ x: 90, y: 5, radius: 400 }), { density: 50 }, () => 0.5, { orig: e.points, state: {} });
    const times = out.map(q => q[2]);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThanOrEqual(times[i - 1]);
    expect(out.every(q => q[3] >= 0.2 - 1e-9 && q[3] <= 1 + 1e-9)).toBe(true);
  });
});
