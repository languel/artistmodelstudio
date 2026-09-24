import { describe, it, expect } from 'vitest';
import { FlatCanvasMedium } from '../src/media/FlatCanvasMedium.js';
import { PixelMedium } from '../src/media/PixelMedium.js';
import { WatercolorMedium } from '../src/media/WatercolorMedium.js';
import { defaultMediaRegistry } from '../src/media/mediaRegistry.js';

describe('Media Layer', () => {
  it('registers the core media', () => {
    const list = defaultMediaRegistry.list();
    expect(list.length).toBe(4);
    const ids = list.map(m => m.id);
    expect(ids).toContain('flat');
    expect(ids).toContain('watercolor');
    expect(ids).toContain('pixel');
    expect(ids).toContain('ascii');
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

  it('renders vector programs with float coordinates in PixelMedium without hanging', async () => {
    const pixel = new PixelMedium({ cols: 32, rows: 48, displayScale: 1 });
    const vectorProgram = {
      version: 1,
      medium: 'watercolor',
      actions: [
        { op: 'background', color: '#faf7f2' },
        { op: 'stroke', color: '#2c5432', width: 2 },
        { op: 'line', x1: -0.6, y1: -0.1, x2: -0.4, y2: 0.7 },
        { op: 'line', x1: -0.2, y1: -0.2, x2: -0.05, y2: 0.75 },
        { op: 'fill', color: '#ce526d', opacity: 0.8 },
        { op: 'circle', x: -0.6, y: -0.1, diameter: 0.32 },
        { op: 'rect', x: 0.2, y: 0.2, width: 0.3, height: 0.3, color: '#f0b441' }
      ]
    };

    const start = Date.now();
    const result = await pixel.render(vectorProgram);
    const duration = Date.now() - start;

    // Must render virtually instantly without hanging
    expect(duration).toBeLessThan(500);
    expect(result.warnings.length).toBe(0);
    expect(pixel.grid.some(cell => cell === '#2c5432')).toBe(true);
    expect(pixel.grid.some(cell => cell === '#ce526d')).toBe(true);
    expect(pixel.grid.some(cell => cell === '#f0b441')).toBe(true);
  });

  it('drawLine handles fractional coordinates and does not enter infinite loop', () => {
    const pixel = new PixelMedium({ cols: 20, rows: 20 });
    // fractional coordinates that previously triggered infinite loop
    expect(() => {
      pixel.drawLine(-0.45, -0.05, -0.45, 0.65, '#ff0000');
      pixel.drawLine(0.123, 0.456, 18.789, 15.321, '#00ff00');
      pixel.drawLine(NaN, Infinity, 5, 5, '#0000ff');
    }).not.toThrow();
  });
});
