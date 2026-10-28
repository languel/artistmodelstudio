import { describe, expect, it } from 'vitest';
import { Painter, alpha, toOBJ } from '../lessons/threejs/lib/paint.js';

const P = (x, y = 0, z = 0) => ({ x, y, z });
// move a point along x at `speed` m/s for `secs`, sampled at 30 Hz
const move = (pa, id, from, speed, secs, t0 = 0) => { for (let i = 0; i <= secs * 30; i++) { const t = t0 + i / 30; pa.update(id, P(from + speed * (i / 30)), t); } return t0 + secs; };

describe('painter', () => {
  it('a moving point draws one stroke with evenly spaced samples', () => {
    const pa = new Painter(); move(pa, 'hand', 0, 1, 1);
    expect(pa.strokes.length).toBe(1);
    const pts = pa.strokes[0].pts; expect(pts.length).toBeGreaterThan(25);
    for (let i = 1; i < pts.length; i++) expect(pts[i].x - pts[i - 1].x).toBeGreaterThanOrEqual(0.012 - 1e-9);
    expect(pts.at(-1).s).toBeGreaterThan(0.8);                                  // the stored speed is about 1 m/s
  });
  it('a still point draws nothing, and lifts the pen after it has been still a while', () => {
    const pa = new Painter(); for (let i = 0; i < 60; i++) pa.update('hand', P(0.5), i / 30);
    expect(pa.strokes.length).toBe(0);
    const t = move(pa, 'hand', 0.5, 1, 0.5);                                    // moves: a stroke
    for (let i = 1; i <= 30; i++) pa.update('hand', P(1.0), t + i / 30);        // stops for a second
    const n = pa.strokes.length; move(pa, 'hand', 1.0, 1, 0.5, t + 2);          // moves again: a NEW stroke
    expect(pa.strokes.length).toBe(n + 1);
  });
  it('lifts on a lost point and on a jump', () => {
    const pa = new Painter(); let t = move(pa, 'a', 0, 1, 0.5);
    pa.update('a', null, t + 0.03); move(pa, 'a', 0.6, 1, 0.5, t + 0.1); expect(pa.strokes.length).toBe(2);
    const pb = new Painter(); t = move(pb, 'a', 0, 1, 0.5); pb.update('a', P(5), t + 0.03); move(pb, 'a', 5, 1, 0.5, t + 0.06); expect(pb.strokes.length).toBe(2);
    expect(Math.max(...pb.strokes.flatMap(s => s.pts.map(p => p.x))) - 1).toBeGreaterThan(3);   // the jump itself was not drawn as a line
  });
  it('forgets the oldest marks when over the limit', () => {
    const pa = new Painter({ maxPoints: 80 }); let t = 0; for (let k = 0; k < 6; k++) { t = move(pa, 'h' + k, 0, 1, 0.6, t + 0.5); }
    expect(pa.count).toBeLessThanOrEqual(80); expect(pa.strokes.length).toBeLessThan(6);
    expect(pa.strokes.at(-1).id).toBe('h5');                                    // the newest survives
  });
  it('fades with age, or never', () => {
    expect(alpha(0, 5)).toBe(1); expect(alpha(2.5, 5)).toBeLessThan(0.5); expect(alpha(6, 5)).toBe(0); expect(alpha(1000, 0)).toBe(1);
  });
  it('writes OBJ polylines', () => {
    const pa = new Painter(); move(pa, 'a', 0, 1, 0.5); move(pa, 'b', 0, 1, 0.5, 5);
    const obj = toOBJ(pa.strokes), vs = obj.split('\n').filter(l => l.startsWith('v ')), ls = obj.split('\n').filter(l => l.startsWith('l '));
    expect(ls.length).toBe(pa.strokes.length); expect(vs.length).toBe(pa.count);
    expect(ls[1].split(' ')[1]).toBe(String(pa.strokes[0].pts.length + 1));       // the second polyline starts after the first one's vertices
  });
});
