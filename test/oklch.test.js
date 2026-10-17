import { describe, it, expect } from 'vitest';
import { hexToOklch, oklchHex, fitChroma, oklchLinear, inGamut } from '../src/workbench/oklch.js';

describe('oklch', () => {
  it('white, black and grays have no chroma; lightness runs 0 to 1', () => {
    expect(hexToOklch('#ffffff').L).toBeCloseTo(1, 2);
    expect(hexToOklch('#000000').L).toBeCloseTo(0, 3);
    expect(hexToOklch('#808080').C).toBeLessThan(0.002);
  });

  it('round-trips colors through hex', () => {
    for (const hex of ['#e03030', '#2050c0', '#88e030', '#6d3f6e', '#e8d27a', '#1d1b19']) {
      const { L, C, h } = hexToOklch(hex);
      expect(oklchHex(L, C, h)).toBe(hex);
    }
  });

  it('red sits near hue 29 and blue near 264', () => {
    expect(hexToOklch('#ff0000').h).toBeGreaterThan(25);
    expect(hexToOklch('#ff0000').h).toBeLessThan(35);
    expect(hexToOklch('#0000ff').h).toBeGreaterThan(260);
    expect(hexToOklch('#0000ff').h).toBeLessThan(268);
  });

  it('an out-of-gamut chroma is pulled in until it fits, and keeps its hue and lightness', () => {
    const C = fitChroma(0.9, 0.3, 260);
    expect(C).toBeLessThan(0.3);
    expect(inGamut(oklchLinear(0.9, C, 260))).toBe(true);
    const back = hexToOklch(oklchHex(0.9, 0.3, 260));
    expect(back.L).toBeCloseTo(0.9, 1);
    expect(Math.abs(back.h - 260)).toBeLessThan(4);
  });

  it('white and black leave no room for chroma', () => {
    expect(fitChroma(1, 0.2, 100)).toBe(0);
    expect(fitChroma(0, 0.2, 100)).toBe(0);
  });
});
