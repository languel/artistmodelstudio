/**
 * The curves of marks, for scores: the outline a mark is drawn along (smooth, unless it says straight),
 * and where on it a point is nearest. Pure; used by compile (what plays), the Play tool (snapping and
 * sliding) and the overlay. Points are [x, y, t, p] in the mark's own coordinates.
 */
import { smoothPath } from '../process/walk.js';

/** The curve a mark is drawn along: its points joined by the smooth path the renderer uses, or straight. */
export const outlineOf = e => (e.path === 'straight' || (e.points?.length || 0) < 3 ? e.points : smoothPath(e.points, e.closed));

/** The middle of a mark: a point's place, an area's centroid, a line's midpoint by length. */
export function centerOf(e) {
  const p = e.points;
  if (!p?.length) return [0, 0];
  if (p.length === 1) return [p[0][0], p[0][1]];
  if (e.role === 'plane' || e.closed) return [p.reduce((a, q) => a + q[0], 0) / p.length, p.reduce((a, q) => a + q[1], 0) / p.length];
  const q = pointAt(outlineOf(e), 0.5);
  return [q[0], q[1]];
}

/** Total length of a polyline. */
export const lengthOf = pts => pts.reduce((s, q, i) => (i ? s + Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0);

/** The point at u (0..1) along a polyline, with its direction: [x, y, tx, ty]. */
export function pointAt(pts, u) {
  const total = lengthOf(pts);
  if (!pts.length) return [0, 0, 1, 0];
  if (pts.length === 1 || total === 0) return [pts[0][0], pts[0][1], 1, 0];
  let s = Math.max(0, Math.min(1, u)) * total;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (s <= len || i === pts.length - 1) {
      const f = len ? Math.min(1, s / len) : 0;
      const tx = len ? (pts[i][0] - pts[i - 1][0]) / len : 1, ty = len ? (pts[i][1] - pts[i - 1][1]) / len : 0;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * f, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * f, tx, ty];
    }
    s -= len;
  }
  return [pts.at(-1)[0], pts.at(-1)[1], 1, 0];
}

/** The nearest place on a polyline to (x, y): { x, y, u (0..1 by length), d (distance), tx, ty }. */
export function nearestOn(pts, x, y) {
  let best = null, run = 0;
  const total = lengthOf(pts);
  for (let i = 1; i < pts.length; i++) {
    const ax = pts[i - 1][0], ay = pts[i - 1][1], bx = pts[i][0], by = pts[i][1];
    const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy, len = Math.sqrt(len2);
    const f = len2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0;
    const px = ax + dx * f, py = ay + dy * f, d = Math.hypot(x - px, y - py);
    if (!best || d < best.d) best = { x: px, y: py, u: total ? (run + f * len) / total : 0, d, tx: len ? dx / len : 1, ty: len ? dy / len : 0 };
    run += len;
  }
  return best || { x: pts[0]?.[0] ?? 0, y: pts[0]?.[1] ?? 0, u: 0, d: Math.hypot(x - (pts[0]?.[0] ?? 0), y - (pts[0]?.[1] ?? 0)), tx: 1, ty: 0 };
}

/** The mark nearest to (x, y) among `marks` that can be travelled, within `radius`: { mark, hit }. */
export function nearestPath(marks, x, y, radius, accept = () => true) {
  let best = null;
  for (const m of marks) {
    if (!accept(m) || (m.points?.length || 0) < 2) continue;
    const hit = nearestOn(outlineOf(m), x, y);
    if (hit.d <= radius && (!best || hit.d < best.hit.d)) best = { mark: m, hit };
  }
  return best;
}
