import { describe, it, expect } from 'vitest';
import { gridFor, ASCII_RAMPS, PIXEL_PALETTES, CELL_ASPECT, DEFAULT_STYLE } from '../src/fitting/stylize.js';

describe('stylize grids', () => {
  it('keeps pixel cells square and follows the view aspect', () => {
    expect(gridFor('pixel', 1600, 900, { pixelCells: 64 })).toEqual([64, 36]);
    expect(gridFor('pixel', 900, 1600, { pixelCells: 64 })).toEqual([36, 64]);
    expect(gridFor('pixel', 1000, 1000, { pixelCells: 48 })).toEqual([48, 48]);
  });

  it('uses tall character cells for ASCII so the picture keeps its proportions', () => {
    const [cols, rows] = gridFor('ascii', 1000, 1000, { asciiCols: 100 });
    expect(cols).toBe(100);
    expect(rows).toBe(Math.round(100 * CELL_ASPECT));
  });

  it('ships ramps from sparse to dense and valid palettes', () => {
    for (const ramp of Object.values(ASCII_RAMPS)) expect(ramp[0]).toBe(' ');
    for (const pal of Object.values(PIXEL_PALETTES)) if (pal) for (const c of pal) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    expect(ASCII_RAMPS[DEFAULT_STYLE.asciiRamp]).toBeTruthy();
  });
});

import { encodeGif } from '../src/export/recorder.js';
describe('gif encoder', () => {
  it('writes a looping GIF89a with one image per frame', () => {
    const f = (v, t) => ({ w: 4, h: 3, data: new Uint8ClampedArray(48).fill(v), time: t });
    const g = encodeGif([f(0, 0), f(255, 100)]);
    expect(String.fromCharCode(...g.slice(0, 6))).toBe('GIF89a');
    expect(g[g.length - 1]).toBe(0x3B);
    expect(g.filter(b => b === 0x2C).length).toBeGreaterThanOrEqual(2);
  });
});
