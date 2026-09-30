import { describe, it, expect } from 'vitest';
import { FX, normalizeFx, normalizeStops, fxKey, compileFx, runPoint, toMask, fxIsEmpty, parseColor } from './fx.js';

const px = (...rgba) => Uint8ClampedArray.from(rgba);
const run = (list, data) => { for (const s of compileFx(list).stages) if (s.t !== 'canvas') runPoint(s, data); return data; };

describe('normalizing', () => {
  it('keeps known effects with parameters in range, allows strings, drops the rest', () => {
    const l = normalizeFx(['invert', { type: 'threshold', level: 5, soft: -1 }, { type: 'nope' }, { type: 'levels', gamma: 'x' }, null]);
    expect(l.map(e => e.type)).toEqual(['invert', 'threshold', 'levels']);
    expect(l[1]).toMatchObject({ level: 1, soft: 0 });
    expect(l[2].gamma).toBe(1);
  });
  it('gradient stops: colors, pairs, alpha, sorted, at least two', () => {
    expect(normalizeStops(['#000', '#ffffff'])).toEqual([[0, '#000'], [1, '#ffffff']]);
    expect(normalizeStops([[1, '#fff'], [0, '#000']])).toEqual([[0, '#000'], [1, '#fff']]);
    expect(normalizeStops(['#123456'])).toEqual([[0, '#123456'], [1, '#123456']]);
    expect(normalizeStops(['nonsense'])).toEqual([[0, '#000000'], [1, '#ffffff']]);
    expect(parseColor('#f008')).toEqual([255, 0, 0, 136]);
  });
  it('equal lists have equal keys, and an empty list, or one switched off, is empty', () => {
    expect(fxKey([{ type: 'threshold', level: 0.5 }])).toBe(fxKey(['threshold']));
    expect(fxKey(['invert'])).not.toBe(fxKey(['threshold']));
    expect(fxIsEmpty([])).toBe(true);
    expect(fxIsEmpty([{ type: 'invert', off: true }])).toBe(true);
    expect(fxIsEmpty(['invert'])).toBe(false);
    expect(Object.keys(FX)).toContain('gradient');
  });
});

describe('point effects', () => {
  it('invert and levels act on each channel; alpha stays', () => {
    expect(Array.from(run(['invert'], px(0, 100, 255, 200)))).toEqual([255, 155, 0, 200]);
    expect(Array.from(run([{ type: 'levels', black: 0.2, white: 0.8 }], px(51, 128, 204, 255)))).toEqual([0, 128, 255, 255]);
  });
  it('threshold turns the light to black or white', () => {
    const d = run([{ type: 'threshold', level: 0.5 }], px(200, 200, 200, 255, 30, 30, 30, 255));
    expect(Array.from(d)).toEqual([255, 255, 255, 255, 0, 0, 0, 255]);
  });
  it('a soft threshold ramps', () => {
    const d = run([{ type: 'threshold', level: 0.5, soft: 0.4 }], px(128, 128, 128, 255));
    expect(d[0]).toBeGreaterThan(100); expect(d[0]).toBeLessThan(160);
  });
  it('a gradient colors by light, with alpha from its stops', () => {
    const d = run([{ type: 'gradient', stops: ['#ff0000', '#0000ff'] }], px(0, 0, 0, 255, 255, 255, 255, 255));
    expect(Array.from(d)).toEqual([255, 0, 0, 255, 0, 0, 255, 255]);
    const t = run([{ type: 'gradient', stops: ['#ff000000', '#ff0000ff'] }], px(255, 255, 255, 255, 0, 0, 0, 255));
    expect([t[3], t[7]]).toEqual([255, 0]);
  });
  it('a run of point effects is one table, and one pass', () => {
    const c = compileFx([{ type: 'brightness', amount: 0.1 }, 'invert', { type: 'contrast', amount: 0.2 }, { type: 'posterize', steps: 4 }]);
    expect(c.stages).toHaveLength(1);
    expect(c.stages[0].t).toBe('rgb');
    const g = compileFx(['invert', { type: 'levels', gamma: 2 }, { type: 'threshold' }, 'gradient']);
    expect(g.stages).toHaveLength(1);
    expect(g.stages[0].t).toBe('luma');
    expect(g.stages[0].grad).toBeTruthy();
  });
  it('effects after a gradient act on its colors; blur and pixelate are canvas stages that split a run', () => {
    const c = compileFx(['gradient', 'invert', { type: 'blur', radius: 2 }, 'invert']);
    expect(c.stages.map(s => s.t)).toEqual(['luma', 'rgb', 'canvas', 'rgb']);
    expect(c.stages[2]).toMatchObject({ op: 'blur', radius: 2 });
  });
  it('nothing to do compiles to nothing', () => {
    expect(compileFx([]).stages).toEqual([]);
    expect(compileFx([{ type: 'invert', off: true }]).stages).toEqual([]);
    expect(compileFx([{ type: 'levels' }]).stages).toEqual([]);   // defaults: an identity
  });
});

describe('masks from pixels', () => {
  it('luma: light shows; alpha: the picture\'s own; invert flips', () => {
    const luma = px(255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 128);
    toMask(luma, 'luma', false);
    expect([luma[3], luma[7], luma[11]]).toEqual([255, 0, 128]);
    const alpha = px(10, 10, 10, 40, 200, 200, 200, 255);
    toMask(alpha, 'alpha', false);
    expect([alpha[3], alpha[7]]).toEqual([40, 255]);
    toMask(alpha, 'alpha', true);
    expect([alpha[3], alpha[7]]).toEqual([215, 0]);
  });
});
