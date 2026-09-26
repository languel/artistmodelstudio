import { describe, it, expect } from 'vitest';
import { SCULPTS, sculptMark, sculptSource, compileSculpt, falloff } from './sculpt.js';

const line = () => ({ role: 'line', closed: false, points: Array.from({ length: 11 }, (_, i) => [i * 10, 0, i * 10, 0.5]) });
const stroke = (o = {}) => ({ x: 50, y: 0, dx: 0, dy: 5, radius: 20, strength: 1, pressure: 1, invert: false, first: true, start: [50, 0], ...o });

describe('sculpt tools', () => {
  it('falloff is 1 at the center and 0 at the edge', () => {
    expect(falloff(0, 10)).toBe(1);
    expect(falloff(10, 10)).toBe(0);
  });

  it('push moves points under the brush, not the rest', () => {
    const e = line();
    const out = sculptMark('push', e, stroke());
    const mid = out.find(q => Math.abs(q[0] - 50) < 1e-6);
    expect(mid[1]).toBeGreaterThan(4);
    expect(out[0][1]).toBe(0);
    expect(out[out.length - 1][1]).toBe(0);
  });

  it('returns null when the brush is away from the mark', () => {
    expect(sculptMark('push', line(), stroke({ x: 500, y: 500 }))).toBeNull();
  });

  it('smooth pulls a spike toward its neighbours', () => {
    const e = line(); e.points[5][1] = 20;
    const out = sculptMark('smooth', e, stroke({ y: 20 }));
    expect(out[5][1]).toBeLessThan(20);
  });

  it('simplify removes points under the brush', () => {
    const e = line();
    const out = sculptMark('simplify', e, stroke({ radius: 40 }));
    expect(out.length).toBeLessThan(e.points.length);
    expect(out[0]).toEqual(e.points[0]);
  });

  it('pinch and Alt (inflate) move points opposite ways', () => {
    const e = { role: 'line', closed: false, points: [[0, 10, 0, .5], [40, 10, 1, .5], [50, 10, 2, .5], [60, 10, 3, .5], [100, 10, 4, .5]] };
    const inn = sculptMark('pinch', e, stroke({ y: 0 }));
    const out = sculptMark('pinch', e, stroke({ y: 0, invert: true }));
    const at50 = pts => pts.reduce((b, q) => (Math.abs(q[0] - 50) < Math.abs(b[0] - 50) ? q : b));
    expect(at50(inn)[1]).toBeLessThan(10);
    expect(at50(out)[1]).toBeGreaterThan(10);
  });

  it('every built-in is shown as code that compiles back', () => {
    for (const id of Object.keys(SCULPTS)) {
      const def = compileSculpt(sculptSource(id));
      expect(def.id).toBe(id);
      expect(typeof def.step).toBe('function');
    }
  });
});
