import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { txHash, txPpu, txBounds, txPaint, txDabs } from './texture.js';

// A canvas that only records what is asked of it.
function fakeContext() {
  const calls = [];
  const target = { calls };
  return new Proxy(target, {
    get: (t, k) => (k in t ? t[k] : (...a) => {
      calls.push([String(k), ...a]);
      if (k === 'createPattern') return {};
      if (k === 'createImageData') return { data: new Uint8ClampedArray(a[0] * a[1] * 4) };
    }),
    set: (t, k, v) => { t[k] = v; return true; }
  });
}
const fakeCanvas = () => { const ctx = fakeContext(); return { width: 0, height: 0, getContext: () => ctx, ctx }; };

describe('texture helpers', () => {
  it('txHash ignores float dust and tells different marks apart', () => {
    const a = [[10.001, 20.002, 0, 0.5], [30, 40, 0, 0.5]], b = [[10.0012, 20.0021, 0, 0.5], [30, 40, 0, 0.5]], c = [[10, 20, 0, 0.5], [30, 44, 0, 0.5]];
    expect(txHash('x', a, { w: 3 }, 7)).toBe(txHash('x', b, { w: 3 }, 7));
    expect(txHash('x', a, { w: 3 }, 7)).not.toBe(txHash('x', c, { w: 3 }, 7));
    expect(txHash('x', a, { w: 3 }, 7)).not.toBe(txHash('x', a, { w: 4 }, 7));
  });
  it('txPpu moves in half-octaves, so zooming reuses layers', () => {
    expect(txPpu(1)).toBe(1);
    expect(txPpu(1.1)).toBe(1);
    expect(txPpu(1.5)).toBeCloseTo(Math.SQRT2);
    expect(txPpu(0.001)).toBe(0.25);
    expect(txPpu(100)).toBe(4);
  });
  it('txBounds grows the walk by the pad', () => {
    expect(txBounds([{ x: 10.2, y: 5 }, { x: 30, y: 8.7 }], 4)).toEqual([6, 1, 34, 13]);
  });
});

describe('txPaint', () => {
  let made;
  beforeEach(() => {
    made = [];
    globalThis.document = { createElement: () => { const c = fakeCanvas(); made.push(c); return c; } };
    globalThis.DOMMatrix = class { translate() { return this; } scale() { return this; } };
  });
  afterEach(() => { delete globalThis.document; delete globalThis.DOMMatrix; });

  it('paints a mark once and reuses the layer while its key and view stay the same', () => {
    const target = fakeContext();
    let painted = 0;
    const spec = k => ({ key: k, bounds: [0, 0, 40, 20], color: '#123456', alpha: 0.5, scale: 1, grain: { kind: 'paper', scale: 1, strength: 0.5, seed: 1 }, draw: () => { painted++; } });
    txPaint(target, spec('unit-test-a'));
    txPaint(target, spec('unit-test-a'));
    expect(painted).toBe(1);
    txPaint(target, spec('unit-test-b'));
    expect(painted).toBe(2);
    expect(target.calls.filter(c => c[0] === 'drawImage')).toHaveLength(3);
  });
  it('a different color, or a zoom into another octave, is a different layer', () => {
    const target = fakeContext();
    let painted = 0;
    const base = { key: 'unit-test-c', bounds: [0, 0, 10, 10], draw: () => { painted++; }, scale: 1 };
    txPaint(target, { ...base, color: '#000' });
    txPaint(target, { ...base, color: '#f00' });
    txPaint(target, { ...base, color: '#000', scale: 2 });
    expect(painted).toBe(3);
  });
  it('without a canvas, nothing is drawn and nothing breaks', () => {
    delete globalThis.document;
    const target = fakeContext();
    expect(() => txPaint(target, { key: 'unit-test-none', bounds: [0, 0, 10, 10], draw: () => { throw new Error('no'); } })).not.toThrow();
    expect(target.calls.filter(c => c[0] === 'drawImage')).toHaveLength(0);
  });
});

describe('txDabs', () => {
  const frames = Array.from({ length: 11 }, (_, i) => ({ x: i * 10, y: 0, nx: 0, ny: 1, speed: 10, pressure: 0.5 }));
  it('spaces dabs by the tip size: closer spacing stamps more', () => {
    globalThis.document = { createElement: () => fakeCanvas() };
    const count = spacing => { const l = fakeContext(); txDabs(l, frames, { tip: 'square', size: 10, spacing }); return l.calls.filter(c => c[0] === 'fillRect').length; };
    expect(count(0.5)).toBeGreaterThan(count(1));
    expect(count(1)).toBeGreaterThanOrEqual(9);
    delete globalThis.document;
  });
  it('is deterministic for a seeded rng', () => {
    const run = () => { let a = 5; const rng = () => { a = (a * 1103515245 + 12345) % 2147483648; return a / 2147483648; }; const l = fakeContext(); txDabs(l, frames, { tip: 'square', size: 6, scatter: 1, rng }); return JSON.stringify(l.calls); };
    expect(run()).toBe(run());
  });
});
