import { describe, it, expect } from 'vitest';
import { FlatCanvasMedium } from '../src/media/FlatCanvasMedium.js';
import { PixelMedium } from '../src/media/PixelMedium.js';
import { WatercolorMedium } from '../src/media/WatercolorMedium.js';
import { defaultMediaRegistry } from '../src/media/mediaRegistry.js';

describe('Media Layer', () => {
  it('registers all 3 core media', () => {
    const list = defaultMediaRegistry.list();
    expect(list.length).toBe(3);
    const ids = list.map(m => m.id);
    expect(ids).toContain('flat');
    expect(ids).toContain('watercolor');
    expect(ids).toContain('pixel');
  });

  it('declares proper capabilities for FlatCanvas', () => {
    const flat = new FlatCanvasMedium();
    const caps = flat.capabilities();
    expect(caps.id).toBe('flat');
    expect(caps.coordinateSystem).toBe('normalized');
    expect(caps.core).toContain('circle');
    expect(caps.core).toContain('polygon');
    expect(caps.extensions.length).toBe(0);
  });

  it('declares proper capabilities for Watercolor', () => {
    const water = new WatercolorMedium();
    const caps = water.capabilities();
    expect(caps.id).toBe('watercolor');
    expect(caps.coordinateSystem).toBe('normalized');
    expect(caps.extensions).toContain('brush.bleed');
    expect(caps.extensions).toContain('brush.texture');
  });

  it('declares proper capabilities for Pixel', () => {
    const pixel = new PixelMedium({ cols: 32, rows: 48 });
    const caps = pixel.capabilities();
    expect(caps.id).toBe('pixel');
    expect(caps.coordinateSystem).toBe('pixel');
    expect(caps.dimensions).toEqual({ cols: 32, rows: 48 });
    expect(caps.core).toContain('pixel');
    expect(caps.core).toContain('mirrorX');
  });

  it('renders pixel grid accurately with symmetry', async () => {
    const pixel = new PixelMedium({ cols: 10, rows: 10, displayScale: 1 });
    const program = {
      version: 1,
      actions: [
        { op: 'palette', colors: ['#000000', '#ff0000'] },
        { op: 'mirrorX', enabled: true },
        { op: 'pixel', x: 2, y: 5, color: 1 }
      ]
    };
    await pixel.render(program);

    // Pixel at (2, 5) should be set
    expect(pixel.grid[5 * 10 + 2]).toBe('#ff0000');
    // Mirrored pixel at (10 - 1 - 2, 5) = (7, 5) should also be set!
    expect(pixel.grid[5 * 10 + 7]).toBe('#ff0000');
    // Other pixels remain background
    expect(pixel.grid[5 * 10 + 0]).toBe('#000000');
  });
});
