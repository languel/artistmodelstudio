import { describe, expect, it } from 'vitest';
import { spline, resample, unicursal, copies, pen, connector, FACE } from '../lessons/threejs/lib/oneline.js';

const P = (x, y, z = 0) => ({ x, y, z });
const d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const maxGap = pts => Math.max(...pts.slice(1).map((p, i) => d(p, pts[i])));
const travel = (strokes, order, step = 0.02) => { const r = unicursal(strokes, { order, step }); return r; };
const line = (x0, y0, x1, y1, n = 6) => ({ closed: false, pts: Array.from({ length: n }, (_, i) => P(x0 + (x1 - x0) * i / (n - 1), y0 + (y1 - y0) * i / (n - 1))) });
const square = (cx, cy, r) => ({ closed: true, pts: [P(cx - r, cy - r), P(cx + r, cy - r), P(cx + r, cy + r), P(cx - r, cy + r)] });

describe('one line', () => {
  it('splines pass through their points and resampling spaces them evenly', () => {
    const pts = [P(0, 0), P(1, 0.5), P(2, 0), P(3, 0.5)], s = spline(pts, false, 10);
    for (const p of pts) expect(Math.min(...s.map(q => d(p, q)))).toBeLessThan(1e-6);
    const r = resample(s, 0.1), gaps = r.slice(1, -1).map((p, i) => d(p, r[i + 1 - 1 + 0]));
    expect(Math.max(...r.slice(1, -1).map((p, i) => d(p, r[i])))).toBeLessThan(0.1 + 1e-6);
  });
  it('chains separate strokes into one path with no jumps, visiting every stroke', () => {
    const strokes = [line(0, 0, 1, 0), line(3, 1, 3, 2), square(1.5, 2.5, 0.3), line(5, 0, 6, 0)];
    const { points } = travel(strokes, 'shortest');
    expect(maxGap(points)).toBeLessThan(0.02 * 1.6);                   // never lifts: no gap bigger than a step
    for (const s of strokes) for (const p of s.pts) expect(Math.min(...points.map(q => d(p, q)))).toBeLessThan(0.02);
  });
  it('a closed stroke starts and ends at the same point (the pen goes round and carries on)', () => {
    const { points } = travel([square(0, 0, 1)], 'fixed');
    expect(d(points[0], points.at(-1))).toBeLessThan(0.03);
  });
  it('"shortest" ordering travels less between strokes than a bad fixed order', () => {
    const strokes = [line(0, 0, 0.5, 0), line(9, 0, 9.5, 0), line(1, 0, 1.5, 0), line(8, 0, 8.5, 0)];
    expect(travel(strokes, 'shortest').points.length).toBeLessThan(travel(strokes, 'fixed').points.length);
  });
  it('leaves a connector along the direction it was travelling (no corner at the join)', () => {
    const a = line(0, 0, 1, 0), b = line(2, 1, 3, 1), r = unicursal([a, b], { order: 'fixed', step: 0.02, curl: 0 });
    const j = r.joins[0], before = [r.points[j - 1], r.points[j - 4]], after = [r.points[j + 3], r.points[j]];
    const dir = (p, q) => { const l = d(p, q); return { x: (p.x - q.x) / l, y: (p.y - q.y) / l }; }, u = dir(before[0], before[1]), v = dir(after[0], after[1]);
    expect(u.x * v.x + u.y * v.y).toBeGreaterThan(0.5);                // still heading roughly the same way, not turned back
  });
  it('copies chain on continuously and scale down', () => {
    const base = unicursal([square(0, 0, 1)], { step: 0.05 }).points, out = copies(base, 3, { scale: 0.5, step: 0.05 });
    expect(out.length).toBeGreaterThan(base.length * 2); expect(maxGap(out)).toBeLessThan(0.3);
  });
  it('the pen tapers to a point at both ends and wobbles only sideways a little', () => {
    const pts = Array.from({ length: 200 }, (_, i) => P(i * 0.01, 0)), r = pen(pts, { wobble: 0.004, width: 0.01, taper: 0.1 });
    expect(r.w[0]).toBeLessThan(r.w[100] * 0.5); expect(r.w.at(-1)).toBeLessThan(r.w[100] * 0.5);
    expect(Math.max(...r.pos.map(p => Math.abs(p.y)))).toBeLessThanOrEqual(0.0041); expect(r.pos.every((p, i) => Math.abs(p.x - pts[i].x) < 1e-9)).toBe(true);
  });
  it('face feature lists use valid mesh indices', () => {
    for (const f of Object.values(FACE)) for (const i of f.idx) expect(i).toBeLessThan(468);
  });
  it('connectors are empty for coincident points', () => { expect(connector(P(0, 0), P(1, 0), P(0, 0), P(1, 0))).toEqual([]); });
});
