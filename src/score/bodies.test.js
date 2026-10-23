import { describe, it, expect } from 'vitest';
import { createWorld, renderEvents } from './world.js';
import { compileDoc } from './compile.js';
import { normalizeDocument } from '../process/document.js';

const box = { x: 0, y: 0, width: 100, height: 100 };
const energy = w => w.bodies().reduce((s, b) => s + b.m * (b.vx * b.vx + b.vy * b.vy), 0);
const momentum = w => w.bodies().reduce((s, b) => [s[0] + b.m * b.vx, s[1] + b.m * b.vy], [0, 0]);

describe('bodies', () => {
  it('move, bounce off the frame and stay in it', () => {
    const w = createWorld({ bounds: box, bodies: [{ id: 'a', x: 50, y: 50, vx: 300, vy: 170, r: 5 }] });
    for (let t = 0.05; t <= 20; t += 0.05) {
      w.step(t);
      const b = w.bodies()[0];
      expect(b.x).toBeGreaterThanOrEqual(5 - 1e-9); expect(b.x).toBeLessThanOrEqual(95 + 1e-9);
      expect(b.y).toBeGreaterThanOrEqual(5 - 1e-9); expect(b.y).toBeLessThanOrEqual(95 + 1e-9);
    }
    expect(Math.hypot(w.bodies()[0].vx, w.bodies()[0].vy)).toBeCloseTo(Math.hypot(300, 170), 6);   // a wall only turns it
  });

  it('collide elastically: energy and momentum are kept, and both hear it', () => {
    const heard = [];
    const w = createWorld({ bounds: { x: -1000, y: -1000, width: 3000, height: 3000 }, bodies: [
      { id: 'a', x: 0, y: 0, vx: 100, vy: 0, r: 5, handle: e => heard.push(['a', e.other, +e.t.toFixed(3)]) },
      { id: 'b', x: 50, y: 0, vx: -50, vy: 0, r: 10, handle: e => heard.push(['b', e.other, +e.t.toFixed(3)]) }
    ] });
    const e0 = energy(w), p0 = momentum(w);
    w.step(1);
    expect(heard.map(h => h.slice(0, 2))).toEqual([['a', 'b'], ['b', 'a']]);
    expect(heard[0][2]).toBeGreaterThan(0.23); expect(heard[0][2]).toBeLessThan(0.25);   // they meet when the gap 50 - 15 = 35 closes at 150 a second: 0.233 s, plus a step
    expect(energy(w)).toBeCloseTo(e0, 6);
    expect(momentum(w)[0]).toBeCloseTo(p0[0], 6);
    expect(w.bodies()[0].vx).toBeLessThan(0);          // the small one bounced back
  });

  it('are the same every run, and after a seek', () => {
    const def = { bounds: box, bodies: Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, x: 10 + i * 7, y: 20 + (i % 4) * 15, vx: 40 + i * 9, vy: -30 + i * 6, r: 4 })) };
    const run = () => { const w = createWorld(def); for (let t = 0.1; t <= 6; t += 0.1) w.step(t); return w.bodies().map(b => [b.x, b.y, b.vx, b.vy]); };
    expect(run()).toEqual(run());
    const w = createWorld(def);
    w.seek(6); w.step(6.0001);
    const at6 = createWorld(def); for (let t = 0.1; t <= 6.0001; t += 0.1) at6.step(t);
    const a = w.bodies().map(b => b.x), b = at6.bodies().map(b => b.x);
    a.forEach((x, i) => expect(x).toBeCloseTo(b[i], 4));
  });

  it('touch triggers like any traveler', () => {
    const ev = renderEvents({ bounds: box, bodies: [{ id: 'a', x: 5, y: 50, vx: 40, vy: 0, r: 2 }], triggers: [{ id: 'z', region: { kind: 'polygon', pts: [[40, 40], [60, 40], [60, 60], [40, 60]] } }] }, 3);
    const at = type => ev.filter(e => e.type === type).map(e => e.t);
    expect(at('enter')).toHaveLength(1); expect(at('enter')[0]).toBeCloseTo(0.875, 2);   // x = 40 at 5 + 40 t
    expect(at('exit')).toHaveLength(1); expect(at('exit')[0]).toBeCloseTo(1.375, 2);
  });

  it('spawn new bodies, which live a while; effects are collected', () => {
    let made = 0;
    const w = createWorld({ bounds: box, bodies: [{ id: 'a', x: 5, y: 50, vx: 40, vy: 0, r: 2, handle: (e, api) => { if (e.type === 'collide' && made++ < 1) api.spawn({ x: 80, y: 80, vx: 10, vy: 0, r: 3, life: 0.5 }); } }, { id: 'b', x: 30, y: 50, vx: -10, vy: 0, r: 4 }] });
    w.step(1.2);
    expect(w.bodies().length).toBe(3);
    w.step(2);
    expect(w.bodies().length).toBe(2);   // it lived 0.5 s
    const f = createWorld({ bounds: box, bodies: [{ id: 'a', x: 5, y: 50, vx: 40, vy: 0, r: 2, handle: (e, api) => api.effect({ type: 'mark', x: e.x, y: e.y }) }, { id: 'b', x: 30, y: 50, vx: 0, vy: 0, r: 4 }] });
    f.step(2);
    expect(f.takeEffects().length).toBeGreaterThan(0);
    expect(f.takeEffects()).toEqual([]);
  });

  it('a hundred bodies stay fast (a grid, not every pair)', () => {
    const def = { bounds: { x: 0, y: 0, width: 1000, height: 1000 }, bodies: Array.from({ length: 300 }, (_, i) => ({ id: `b${i}`, x: 20 + (i * 37) % 960, y: 20 + (i * 91) % 960, vx: ((i * 13) % 200) - 100, vy: ((i * 29) % 200) - 100, r: 5 })) };
    const w = createWorld(def);
    const t0 = performance.now();
    w.step(5);
    expect(performance.now() - t0).toBeLessThan(2500);
  });
});

describe('bodies in marks', () => {
  it('a point with play.body moves by its seeded velocity, the same every run', () => {
    const doc = normalizeDocument({ artboard: { width: 100, height: 100 }, elements: [
      { id: 'g', role: 'point', points: [[50, 50]], play: { body: { speed: [20, 60], r: 3 } } },
      { id: 'h', role: 'point', points: [[20, 20]], play: { body: { speed: 30, angle: 0 } } }
    ] });
    const a = compileDoc(doc, { seed: 7 }).def.bodies, b = compileDoc(doc, { seed: 7 }).def.bodies, c = compileDoc(doc, { seed: 8 }).def.bodies;
    expect(a).toEqual(b); expect(a[0].vx).not.toBe(c[0].vx);
    expect(Math.hypot(a[0].vx, a[0].vy)).toBeGreaterThanOrEqual(20);
    expect([a[1].vx, a[1].vy]).toEqual([30, 0]);
  });
});
