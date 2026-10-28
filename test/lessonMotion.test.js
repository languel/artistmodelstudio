import { describe, expect, it } from 'vitest';
import { MotionCleaner, PRESETS } from '../lessons/threejs/lib/motion.js';

// a standing body, hip-centred metres (y up), and the matching image-space hips/shoulders
const base = () => {
  const w = Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 })), set = (i, x, y, z = 0) => { w[i] = { x, y, z }; };
  set(11, -0.19, 0.5); set(12, 0.19, 0.5); set(13, -0.2, 0.25); set(14, 0.2, 0.25); set(15, -0.2, 0.0); set(16, 0.2, 0.0); set(19, -0.2, -0.08); set(20, 0.2, -0.08);
  set(23, -0.09, 0); set(24, 0.09, 0); set(25, -0.1, -0.45); set(26, 0.1, -0.45); set(27, -0.1, -0.9); set(28, 0.1, -0.9); set(29, -0.1, -0.95, -0.05); set(30, 0.1, -0.95, -0.05); set(31, -0.1, -0.95, 0.12); set(32, 0.1, -0.95, 0.12);
  return w;
};
const rawOf = (w, hip = { x: 0, y: 0 }) => ({ w, vis: w.map(() => 1), p: Object.assign(Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 })), { 11: { x: hip.x - 0.19, y: hip.y + 0.5 }, 12: { x: hip.x + 0.19, y: hip.y + 0.5 }, 23: { x: hip.x - 0.09, y: hip.y }, 24: { x: hip.x + 0.09, y: hip.y } }) });
const out = () => ({ w: Array.from({ length: 33 }, () => ({ x: 0, y: 0, z: 0 })), vis: new Array(33).fill(0) });
const noise = (seed => () => (seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5)(7);
const jitter = (w, a) => w.map(p => ({ x: p.x + noise() * a, y: p.y + noise() * a, z: p.z + noise() * a }));
const run = (m, frames, fn, o = out(), step = 1 / 30) => { let last; for (let i = 0; i < frames; i++) { const t = i * step; last = m.process(fn(i, t), t, o); } return last; };
const rms = (xs) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0) / xs.length);

describe('motion cleaner', () => {
  it('removes jitter from a still body', () => {
    const still = base(), raw = new MotionCleaner(PRESETS.raw), clean = new MotionCleaner(PRESETS.performance), a = out(), b = out(), ea = [], eb = [];
    for (let i = 0; i < 120; i++) { const t = i / 30, r = rawOf(jitter(still, 0.03)); raw.process(r, t, a); clean.process(r, t, b); if (i > 30) { ea.push(a.w[15].x - -0.2, a.w[15].y); eb.push(b.w[15].x - -0.2, b.w[15].y); } }
    expect(rms(eb)).toBeLessThan(rms(ea) * 0.5);
  });
  it('follows a fast move with little lag', () => {
    const m = new MotionCleaner(PRESETS.performance), o = out(); let lag = 0;
    for (let i = 0; i < 90; i++) { const t = i / 30, w = base(), dx = 0.5 * Math.sin(t * 6); for (const j of [14, 16, 20]) w[j] = { ...w[j], x: w[j].x + dx };   // the whole arm swings, so the bones stay a possible length
      m.process(rawOf(w), t, o); if (i > 40) lag = Math.max(lag, Math.abs(o.w[16].x - w[16].x)); }
    expect(lag).toBeLessThan(0.1);     // an arm swinging half a metre at 6 rad/s (3 m/s peak) stays within 10 cm of the raw hand
  });
  it('keeps bone lengths steady when the raw ones wobble', () => {
    const m = new MotionCleaner({ ...PRESETS.performance, rigid: 1 }), o = out(), lens = [];
    for (let i = 0; i < 120; i++) { const w = jitter(base(), 0.04); m.process(rawOf(w), i / 30, o); if (i > 40) lens.push(Math.hypot(o.w[13].x - o.w[15].x, o.w[13].y - o.w[15].y, o.w[13].z - o.w[15].z)); }
    expect(Math.max(...lens) - Math.min(...lens)).toBeLessThan(0.03);
  });
  it('holds a joint that drops out briefly, then drops it', () => {
    const m = new MotionCleaner({ ...PRESETS.performance, hold: 0.4 }), o = out(); const raw = rawOf(base());
    run(m, 10, () => raw, o);
    const lost = { ...raw, vis: raw.vis.map((v, i) => i === 15 ? 0 : v) };
    m.process(lost, 10 / 30 + 0.1, o); expect(o.vis[15]).toBe(1);
    m.process(lost, 10 / 30 + 0.8, o); expect(o.vis[15]).toBe(0);
  });
  it('moves the dancer on stage from the image, and recentres', () => {
    const m = new MotionCleaner({ ...PRESETS.raw, travel: 1 }), o = out();
    run(m, 5, () => rawOf(base()), o);
    run(m, 30, (i) => rawOf(base(), { x: 0.5, y: 0 }), o);     // the hips move right by 0.5 image units; shoulders 0.38 m wide = 0.38 units -> 0.5 m
    expect(o.root.x).toBeGreaterThan(0.4);
    m.params.travel = 0; run(m, 30, () => rawOf(base(), { x: 0.5, y: 0 }), o); expect(Math.abs(o.root.x)).toBeLessThan(0.05);
  });
  it('plants a still foot and keeps it from skating while the hips wobble, then lets it go when lifted', () => {
    const m = new MotionCleaner({ ...PRESETS.performance, inertia: 0, noise: 0 }), o = out(), xs = [];
    for (let i = 0; i < 60; i++) { const w = base(), dx = Math.sin(i / 3) * 0.02; for (let j = 0; j < 33; j++) w[j] = { ...w[j], x: w[j].x + (j >= 23 && j <= 26 ? dx : 0) }; w[27].x += noise() * 0.004; m.process(rawOf(w), i / 30, o); if (i > 20) xs.push(o.w[27].x); }
    expect(o.planted[0]).toBe(true); expect(Math.max(...xs) - Math.min(...xs)).toBeLessThan(0.01);
    const w = base(); for (const j of [25, 27, 29, 31]) w[j] = { ...w[j], y: w[j].y + 0.3 };
    for (let i = 0; i < 10; i++) m.process(rawOf(w), 2 + i / 30, o);
    expect(o.planted[0]).toBe(false);
  });
  it('keeps the planted leg at its length (the knee follows)', () => {
    const m = new MotionCleaner({ ...PRESETS.performance, inertia: 0, noise: 0 }), o = out();
    for (let i = 0; i < 50; i++) { const w = base(); for (const j of [23, 24, 25, 26]) w[j] = { ...w[j], y: w[j].y - 0.0 + Math.sin(i / 4) * 0.03 }; m.process(rawOf(w), i / 30, o); }
    const L = (a, b) => Math.hypot(o.w[a].x - o.w[b].x, o.w[a].y - o.w[b].y, o.w[a].z - o.w[b].z);
    expect(L(23, 25)).toBeCloseTo(0.45, 1); expect(L(25, 27)).toBeCloseTo(0.45, 1);
  });
});
