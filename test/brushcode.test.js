import { describe, it, expect } from 'vitest';
import { BRUSHES, brushSource, compileBrush, registerBrush, isBuiltin, KIT, resolveParams, mulberry32 } from '../src/process/brushes.js';
import { runScript } from '../src/process/script.js';
import { EXERCISES } from '../src/process/exercises.js';
import { toSVG } from '../src/process/exports.js';

const stubCtx = () => { const calls = { draw: 0 }; const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (['lineTo', 'arc', 'fill', 'stroke'].includes(k) ? () => { calls.draw++; } : () => {})), set: (t, k, v) => { t[k] = v; return true; } }); return { ctx, calls }; };
const stroke = { role: 'line', points: Array.from({ length: 12 }, (_, i) => [i * 20, 100 + (i % 3) * 10, i * 16, 0.5]), closed: false, color: null };
const plane = { role: 'plane', points: [[0, 0, 0, 0.5], [100, 0, 0, 0.5], [100, 100, 0, 0.5], [0, 100, 0, 0.5]], closed: true, color: null };

describe('brushes as code', () => {
  it('every built-in has source that compiles and draws the same way', () => {
    for (const id of Object.keys(BRUSHES).filter(isBuiltin)) {
      const src = brushSource(id).replace(`"${id}"`, `"${id}-copy"`);
      const def = compileBrush(src);
      expect(def.params.map(p => [p.key, p.default])).toEqual(BRUSHES[id].params.map(p => [p.key, p.default]));
      const e = BRUSHES[id].roles.includes('plane') && !BRUSHES[id].roles.includes('line') ? plane : stroke;
      const a = stubCtx(), b = stubCtx();
      BRUSHES[id].draw(a.ctx, e, resolveParams(id, {}), { rng: mulberry32(3), scale: 1 });
      def.draw(b.ctx, e, Object.fromEntries(def.params.map(p => [p.key, p.default])), { rng: mulberry32(3), scale: 1 });
      expect(b.calls.draw).toBe(a.calls.draw);
    }
  });

  it('refuses to replace a built-in and reports missing parts', () => {
    expect(() => registerBrush(brushSource('ink'))).toThrow(/built-in/);
    expect(() => compileBrush('brush({ id: "x" })')).toThrow(/draw/);
  });

  it('a score can define a brush; the drawing carries its code', () => {
    const res = runScript(`
      brush({ id: 'ticks', params: { len: [1, 40, 10] }, draw(ctx, e, p, k) {
        k.beginInk(ctx, e, { width: 1, opacity: 1 })
        for (const f of k.frames(e)) k.segment(ctx, f.x, f.y, f.x + f.nx * p.len, f.y + f.ny * p.len)
        ctx.restore()
      } })
      line(walk({ from: [0.1, 0.5], steps: 30, step: 0.02 }), { brush: 'ticks' })`);
    expect(res.error).toBeNull();
    expect(res.doc.brushes.ticks).toMatch(/k\.segment/);
    expect(toSVG(res.doc)).toMatch(/<path/);
  });
});

describe('fraction coordinates', () => {
  it('default: fractions of the artboard, with width and height', () => {
    const res = runScript(`artboard(800, 400)\npoint(0.5, 0.25)\nprint(width, height)`);
    expect(res.units).toBe('fraction');
    expect(res.doc.elements[0].points[0].slice(0, 2)).toEqual([400, 100]);
    expect(res.logs[0]).toBe('800 400');
  });
  it('circles stay round on a wide artboard', () => {
    const res = runScript(`artboard(800, 400)\nplane(circle(0.5, 0.5, 0.25))`);
    const xs = res.doc.elements[0].points.map(p => p[0]), ys = res.doc.elements[0].points.map(p => p[1]);
    expect(Math.round(Math.max(...xs) - Math.min(...xs))).toBe(Math.round(Math.max(...ys) - Math.min(...ys)));
  });
  it('older absolute scores still run in artboard units', () => {
    for (const ex of EXERCISES) { const r = runScript(ex.source); expect(r.error).toBeNull(); expect(r.units).toBe('artboard'); }
  });
  it('units() decides explicitly', () => {
    expect(runScript(`units('artboard')\npoint(0.5, 0.5)`).doc.elements[0].points[0][0]).toBe(0.5);
  });
});
