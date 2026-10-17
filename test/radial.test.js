import { describe, it, expect } from 'vitest';
import { radialRadius, radialSpot, radialIndex } from '../src/workbench/radial.js';
import { comboOf, defaultCommands } from '../src/workbench/shortcuts.js';

describe('radial menu geometry', () => {
  it('the first tool is at the top and the rest follow clockwise', () => {
    const R = 100;
    const [x0, y0] = radialSpot(0, 4, R);
    expect(x0).toBeCloseTo(0, 6); expect(y0).toBeCloseTo(-R, 6);          // top
    const [x1, y1] = radialSpot(1, 4, R);
    expect(x1).toBeCloseTo(R, 6); expect(y1).toBeCloseTo(0, 6);           // right
    const [x2, y2] = radialSpot(2, 4, R);
    expect(x2).toBeCloseTo(0, 6); expect(y2).toBeCloseTo(R, 6);           // bottom
  });

  it('the ring grows with the number of tools, so the buttons do not touch', () => {
    expect(radialRadius(3)).toBeGreaterThanOrEqual(72);
    expect(radialRadius(30)).toBeGreaterThan(radialRadius(8));
    // neighbours at least a button apart
    for (const n of [3, 8, 14, 30]) {
      const R = radialRadius(n), [ax, ay] = radialSpot(0, n, R), [bx, by] = radialSpot(1, n, R);
      expect(Math.hypot(ax - bx, ay - by)).toBeGreaterThanOrEqual(40);
    }
  });

  it('moving toward a tool picks it; the middle picks nothing', () => {
    const n = 6, R = 100;
    for (let i = 0; i < n; i++) {
      const [x, y] = radialSpot(i, n, R);
      expect(radialIndex(x, y, n)).toBe(i);
      expect(radialIndex(x * 0.5, y * 0.5, n)).toBe(i);   // anywhere along the same direction
    }
    expect(radialIndex(0, 0, n)).toBe(-1);
    expect(radialIndex(10, -10, n)).toBe(-1);   // inside the dead zone
  });

  it('works for a single tool and for none', () => {
    expect(radialIndex(50, 0, 1)).toBe(0);
    expect(radialIndex(50, 0, 0)).toBe(-1);
  });
});

describe('Shift+Space', () => {
  it('is matched as a combo (Space keeps Shift as a modifier) and bound to the radial menu', () => {
    const combo = comboOf({ key: ' ', code: 'Space', shiftKey: true, metaKey: false, ctrlKey: false, altKey: false });
    expect(combo).toBe('shift+space');
    const cmd = defaultCommands({ canvas: {}, store: {} }).find(c => c.keys.includes('shift+space'));
    expect(cmd?.id).toBe('tool.radial');
  });

  it('plain Space is still just space (the pan)', () => {
    expect(comboOf({ key: ' ', code: 'Space', shiftKey: false, metaKey: false, ctrlKey: false, altKey: false })).toBe('space');
  });
});
