import { describe, it, expect } from 'vitest';
import { shapePoints } from '../src/workbench/shapes.js';
import { runScript } from '../src/process/script.js';

const bounds = pts => {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
};
const close = (a, b, tol = 1e-6) => Math.abs(a - b) < tol;

describe('shapePoints (the Circle and Rectangle tools, ams_add shape)', () => {
  it('a rectangle is its four corners', () => {
    const pts = shapePoints('rect', 100, 50, 500, 250);
    expect(pts.map(p => p.slice(0, 2))).toEqual([[100, 50], [500, 50], [500, 250], [100, 250]]);
  });

  it('a rounded rectangle keeps its box and loses its corners', () => {
    const pts = shapePoints('rect', 100, 50, 500, 250, { round: 0.5 });
    expect(pts).toHaveLength(28);
    expect(bounds(pts).map(Math.round)).toEqual([100, 50, 500, 250]);
    const corners = [[100, 50], [500, 50], [500, 250], [100, 250]];
    expect(pts.some(p => corners.some(([x, y]) => close(p[0], x) && close(p[1], y)))).toBe(false);
    // every corner arc has the radius half the shorter side times the roundness: 0.5 * 200 / 2
    const r = 50;
    for (const [cx, cy, first] of [[450, 100, 0], [450, 200, 7], [150, 200, 14], [150, 100, 21]]) {
      for (let k = 0; k <= 6; k++) expect(close(Math.hypot(pts[first + k][0] - cx, pts[first + k][1] - cy), r, 1e-6)).toBe(true);
    }
  });

  it('roundness 1 is a pill and 0 is square, and is clamped', () => {
    expect(shapePoints('rect', 0, 0, 400, 200, { round: 0 })).toHaveLength(4);
    expect(shapePoints('rect', 0, 0, 400, 200, { round: 1 })).toHaveLength(28);
    expect(shapePoints('rect', 0, 0, 400, 200, { round: 9 })).toHaveLength(28);
    expect(shapePoints('rect', 0, 0, 400, 200, { round: -3 })).toHaveLength(4);
  });

  it('a circle has the points asked for, on the ellipse in its box', () => {
    for (const sides of [3, 6, 12, 48]) {
      const pts = shapePoints('circle', 0, 0, 400, 200, { sides });
      expect(pts).toHaveLength(sides);
      for (const [x, y] of pts) expect(close(((x - 200) / 200) ** 2 + ((y - 100) / 100) ** 2, 1)).toBe(true);
    }
    expect(shapePoints('circle', 0, 0, 10, 10)).toHaveLength(12);
  });

  it('the side count is clamped to 3..64', () => {
    expect(shapePoints('circle', 0, 0, 10, 10, { sides: 1 })).toHaveLength(3);
    expect(shapePoints('circle', 0, 0, 10, 10, { sides: 500 })).toHaveLength(64);
  });

  it('the points carry increasing times and a pressure', () => {
    const pts = shapePoints('circle', 0, 0, 10, 10, { sides: 4 });
    expect(pts.map(p => p[2])).toEqual([0, 60, 120, 180]);
    expect(pts.every(p => p[3] === 0.5)).toBe(true);
  });
});

describe('score rect(x, y, w, h, round)', () => {
  it('without round it is the four corners, as before', () => {
    const res = runScript(`artboard(800, 400)\nplane(rect(0.1, 0.2, 0.5, 0.4))`);
    expect(res.error).toBeNull();
    expect(res.doc.elements[0].points.map(p => p.slice(0, 2).map(Math.round))).toEqual([[80, 80], [480, 80], [480, 240], [80, 240]]);
  });

  it('with round the corners are arcs that stay round on a wide artboard', () => {
    const res = runScript(`artboard(800, 400)\nplane(rect(0.1, 0.2, 0.5, 0.4, 1), { path: 'straight' })`);
    expect(res.error).toBeNull();
    const pts = res.doc.elements[0].points;
    expect(pts).toHaveLength(28);
    expect(bounds(pts).map(Math.round)).toEqual([80, 80, 480, 240]);
    // a pill: the end caps are half circles of radius 80 (half the 160 px height), centered 80 px inside the box ends
    const [cx, cy] = [160, 160];
    for (let k = 0; k <= 6; k++) expect(Math.abs(Math.hypot(pts[21 + k][0] - cx, pts[21 + k][1] - cy) - 80)).toBeLessThan(1e-6);
  });
});
