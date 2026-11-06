/** The shape tools' geometry (Circle and Rectangle under Plane): the canvas draws with it and agents add with it (ams_add shape). */

const CORNER_STEPS = 6;
/**
 * The points of a rectangle or a circle (an ellipse in the box): plane marks keep their points. A circle has
 * `sides` points: round when its path is smooth, a polygon when straight. A rectangle has its four corners; with
 * `round` above 0 (1 is a pill) each corner becomes an arc of CORNER_STEPS segments, baked into the points.
 */
export function shapePoints(tool, x0, y0, x1, y1, { sides = 12, round = 0 } = {}) {
  const timed = pts => pts.map(([x, y], i) => [x, y, i * 60, 0.5]);
  if (tool === 'rect') {
    const r = Math.min(Math.max(round, 0), 1) * Math.min(x1 - x0, y1 - y0) / 2;
    if (r < 0.5) return timed([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
    const pts = [];
    for (const [cx, cy, a0] of [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]]) {
      for (let k = 0; k <= CORNER_STEPS; k++) { const a = a0 + (k / CORNER_STEPS) * (Math.PI / 2); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    }
    return timed(pts);
  }
  const n = Math.max(3, Math.min(64, Math.round(sides)));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
  return timed(Array.from({ length: n }, (_, i) => { const a = -Math.PI / 2 + (i * 2 * Math.PI) / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; }));
}

/**
 * More names for a shape than the two tools have: a triangle, a diamond, a pentagon… are a circle with that many straight sides (a regular polygon in the box,
 * pointing up). Returns { shape: 'circle' | 'rect', sides?, path? } for a name, or null if the name is not one of these.
 */
export function polygonOf(name, sides) {
  const n = String(name || '').toLowerCase();
  const N = { triangle: 3, diamond: 4, rhombus: 4, pentagon: 5, hexagon: 6, octagon: 8, polygon: Number(sides) || 5 }[n];
  return N ? { shape: 'circle', sides: n === 'polygon' ? Math.max(3, Math.min(64, N)) : N, path: 'straight' } : null;
}
