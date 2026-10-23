import { describe, it, expect } from 'vitest';
import { effectiveLazy } from '../src/process/strokes.js';

describe('lazy strokes', () => {
  it('the editor\'s Lazy and Smoothing apply to every tool, with the pen\'s Lazy off', () => {
    expect(effectiveLazy({ radius: 39, smoothing: 0.49, simplify: 0 }, {})).toEqual({ radius: 39, smoothing: 0.49, simplify: 0 });
    expect(effectiveLazy({ radius: 39, smoothing: 0.49 }, { on: false, radius: 80 }).radius).toBe(39);
  });
  it('a pen with Lazy on uses its own length when the editor has none', () => {
    expect(effectiveLazy({ radius: 0, smoothing: 0 }, { on: true, radius: 60 }).radius).toBe(60);
    expect(effectiveLazy({ radius: 0, smoothing: 0 }, { on: true }).radius).toBe(40);
    expect(effectiveLazy({ radius: 0, smoothing: 0 }, {}).radius).toBe(0);
  });
  it('the editor\'s length wins over the pen\'s stored one, so the sliders stay the one source', () => {
    expect(effectiveLazy({ radius: 20, smoothing: 0 }, { on: true, radius: 60 }).radius).toBe(20);
  });
});
