import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { runScript } from './script.js';
import { renderDocument } from './render.js';
import { txStats, txResetStats, txBudget, txBeginFrame, txPaint, txClear } from './texture.js';

// A canvas that only records what is asked of it.
function fakeContext() {
  const calls = [];
  return new Proxy({ calls }, {
    get: (t, k) => (k in t ? t[k] : (...a) => {
      calls.push([String(k), ...a]);
      if (k === 'createPattern') return {};
      if (k === 'createImageData') return { data: new Uint8ClampedArray(a[0] * a[1] * 4) };
    }),
    set: (t, k, v) => { t[k] = v; return true; }
  });
}
const fakeCanvas = () => { const ctx = fakeContext(); return { width: 0, height: 0, getContext: () => ctx, ctx, addEventListener() {} }; };
const count = (ctx, name) => ctx.calls.filter(c => c[0] === name).length;

describe('textured marks in the renderer', () => {
  beforeEach(() => { txClear(); globalThis.document = { createElement: () => fakeCanvas() }; globalThis.DOMMatrix = class { translate() { return this; } scale() { return this; } }; });
  afterEach(() => { delete globalThis.document; delete globalThis.DOMMatrix; });
  const doc = born => runScript(`artboard(400, 300)
line([[0.1, 0.5], [0.5, 0.4], [0.9, 0.5]], { brush: 'oil', width: 30, color: '#a03020', seed: 5, born: ${born}, time: { in: 0.2, out: 1, life: 6, draw: 2 } })`).doc;

  it('paints a mark once, then puts its layer on the picture without asking the brush', () => {
    const d = doc(1000), target = fakeContext();
    txResetStats();
    renderDocument(target, d, { mode: 'final', now: 1000 + 3000, ground: false });
    const misses = txStats().misses;
    expect(misses).toBe(1);
    const draws = count(target, 'drawImage');
    renderDocument(target, d, { mode: 'final', now: 1000 + 3100, ground: false });
    expect(txStats().misses).toBe(misses);
    expect(count(target, 'drawImage')).toBe(draws + 1);
  });

  it('a stroke drawing itself on is one layer under a clip, not a new layer each frame', () => {
    const d = doc(1000), target = fakeContext();
    txResetStats();
    for (const t of [200, 500, 900, 1300, 1700]) renderDocument(target, d, { mode: 'final', now: 1000 + t, ground: false });
    expect(txStats().misses).toBe(1);
    expect(count(target, 'clip')).toBeGreaterThanOrEqual(4);
    expect(count(target, 'drawImage')).toBe(5);
  });

  it('a mark that has not begun, or is gone, is not drawn; one outside the view is not painted', () => {
    const d = doc(1000), target = fakeContext();
    renderDocument(target, d, { mode: 'final', now: 1000 - 5000, ground: false });
    renderDocument(target, d, { mode: 'final', now: 1000 + 60000, ground: false });
    expect(count(target, 'drawImage')).toBe(0);
    txResetStats();
    renderDocument(target, d, { mode: 'final', now: 1000 + 3000, ground: false, view: [1000, 1000, 1200, 1200] });
    expect(txStats().misses).toBe(0);
    renderDocument(target, d, { mode: 'final', now: 1000 + 3000, ground: false, view: [0, 0, 400, 300] });
    expect(txStats().misses).toBe(1);
  });
});

describe('a board\'s code draws on the board as its canvas', () => {
  beforeEach(() => { txClear(); globalThis.document = { createElement: () => fakeCanvas() }; globalThis.DOMMatrix = class { translate() { return this; } scale() { return this; } }; });
  afterEach(() => { delete globalThis.document; delete globalThis.DOMMatrix; });
  const draw = (by, x) => {
    const d = runScript(`artboard(400, 300)\nline([[${x}, 0.5], [${x + 0.05}, 0.45]], { brush: 'oil', width: 40, color: '#a03020', seed: ${Math.round(x * 100)} })`, { by }).doc;
    const target = fakeContext();
    renderDocument(target, d, { mode: 'final', ground: false });
    return target;
  };
  it('crops what a mark made by code reaches beyond the board, and only when it does', () => {
    const code = { kind: 'code', name: 'main' };
    expect(count(draw(code, 0.97), 'clip')).toBe(1);   // near the edge: cropped
    expect(count(draw(code, 0.5), 'clip')).toBe(0);    // inside: not
    expect(count(draw({ kind: 'user', name: 'you' }, 0.97), 'clip')).toBe(0);   // made by hand: free to go over
  });
});

describe('the layer cache running short of room', () => {
  beforeEach(() => { globalThis.document = { createElement: () => { const c = fakeCanvas(); return c; } }; globalThis.DOMMatrix = class { translate() { return this; } scale() { return this; } }; });
  afterEach(() => { delete globalThis.document; delete globalThis.DOMMatrix; txBudget(128); });
  it('gives layers back when they do not fit, and paints smaller once a frame has had to drop what it used', () => {
    txBudget(0.0004);   // 400 bytes: a couple of layers
    txBeginFrame();
    const target = fakeContext();
    for (let i = 0; i < 6; i++) txPaint(target, { key: `short-${i}`, bounds: [0, 0, 8, 8], draw: () => {}, scale: 1 });
    expect(txStats().evicted).toBeGreaterThan(0);
    const before = txStats().quality;
    txBeginFrame();   // the frame that follows sees that layers in use had to go
    expect(txStats().quality).toBeLessThan(before);
  });
});
