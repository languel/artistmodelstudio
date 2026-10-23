/**
 * Regions: what a trigger covers.
 *
 *   { kind: 'polygon', pts: [[x, y], …] }     an area (a plane)
 *   { kind: 'circle', x, y, r }               an area (a point with a radius is a small circle)
 *   { kind: 'line', pts: [[x, y], …] }        no area: fires when crossed, with a direction
 *   { kind: 'field', inside: (x, y) => bool, bounds? }    any area you can test (not swept exactly:
 *                                                         found by stepping along the segment)
 *
 * prepare(def) → { kind, bounds, inside(x, y), crossings(p0, p1, inside0) }
 *
 * crossings gives, for the segment p0→p1 (points {x, y}), the contacts in order of s (0..1, the
 * share of the segment): enter / exit for an area (alternating, starting from `inside0`), cross for
 * a line (dir is the sign of the cross product of the travel direction and the line's own: a mirror
 * image of the line reverses it, and so does travelling the other way).
 * That is the swept test: a fast traveler cannot skip a thin region between two steps.
 */
const EPS = 1e-9;
// Contacts within TOL of a segment's ends count (clamped to it): a boundary met exactly at a step edge
// would otherwise be lost to rounding in one segment and the next. world.js reconciles the pair.
const TOL = 1e-9;
const clamp01 = s => (s < 0 ? 0 : s > 1 ? 1 : s);

function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return { x0, y0, x1, y1 };
}

/** Whether segment a→b (as a box) can touch bounds. */
export const overlaps = (b, ax, ay, bx, by) => !(Math.max(ax, bx) < b.x0 || Math.min(ax, bx) > b.x1 || Math.max(ay, by) < b.y0 || Math.min(ay, by) > b.y1);

/** s along p0→p1 and t along c→d where they meet, or null. */
function segHit(p0, p1, c, d) {
  const rx = p1.x - p0.x, ry = p1.y - p0.y, sx = d[0] - c[0], sy = d[1] - c[1];
  const den = rx * sy - ry * sx;
  if (Math.abs(den) < EPS) return null;
  const qx = c[0] - p0.x, qy = c[1] - p0.y;
  const s = (qx * sy - qy * sx) / den, u = (qx * ry - qy * rx) / den;
  if (s < -TOL || s > 1 + TOL || u < 0 || u > 1) return null;
  return { s: clamp01(s), den };
}

function pointInPolygon(pts, x, y) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Alternate enter / exit along a sorted list of boundary contacts, starting from inside0. */
function toggles(ss, inside0) {
  const out = [];
  let inside = inside0;
  let last = -1;
  for (const s of ss) {
    if (s - last < 1e-9 && out.length) continue;   // a corner touched twice is one contact
    last = s;
    inside = !inside;
    out.push({ s, type: inside ? 'enter' : 'exit' });
  }
  return out;
}

export function prepare(def) {
  if (def.kind === 'circle') {
    const { x: cx, y: cy, r } = def;
    const bounds = { x0: cx - r, y0: cy - r, x1: cx + r, y1: cy + r };
    return {
      kind: 'area', bounds,
      inside: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r,
      crossings(p0, p1, inside0) {
        const dx = p1.x - p0.x, dy = p1.y - p0.y, fx = p0.x - cx, fy = p0.y - cy;
        const a = dx * dx + dy * dy;
        if (a < EPS) return [];
        const b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
        const disc = b * b - 4 * a * c;
        if (disc < 0) return [];
        const q = Math.sqrt(disc);
        const ss = [(-b - q) / (2 * a), (-b + q) / (2 * a)].filter(s => s > -TOL && s <= 1 + TOL).map(clamp01);
        return toggles(ss, inside0);
      }
    };
  }
  if (def.kind === 'polygon') {
    const pts = def.pts;
    const bounds = bboxOf(pts);
    return {
      kind: 'area', bounds,
      inside: (x, y) => pointInPolygon(pts, x, y),
      crossings(p0, p1, inside0) {
        const ss = [];
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const h = segHit(p0, p1, pts[j], pts[i]);
          if (h) ss.push(h.s);
        }
        return toggles(ss.sort((a, b) => a - b), inside0);
      }
    };
  }
  if (def.kind === 'line') {
    const pts = def.pts;
    return {
      kind: 'line', bounds: bboxOf(pts), inside: () => false,
      crossings(p0, p1) {
        const out = [];
        for (let i = 1; i < pts.length; i++) {
          const h = segHit(p0, p1, pts[i - 1], pts[i]);
          if (h && h.s > 0) out.push({ s: h.s, type: 'cross', dir: h.den > 0 ? 1 : -1 });
        }
        return out.sort((a, b) => a.s - b.s);
      }
    };
  }
  if (def.kind === 'field') {
    const bounds = def.bounds || { x0: -Infinity, y0: -Infinity, x1: Infinity, y1: Infinity };
    return {
      kind: 'area', bounds, inside: def.inside,
      crossings(p0, p1, inside0) {
        // No boundary to intersect: look along the segment (about 1 unit apart, at most 64 looks).
        const n = Math.min(64, Math.max(1, Math.ceil(Math.hypot(p1.x - p0.x, p1.y - p0.y))));
        const out = [];
        let inside = inside0;
        for (let i = 1; i <= n; i++) {
          const s = i / n;
          const now = Boolean(def.inside(p0.x + (p1.x - p0.x) * s, p0.y + (p1.y - p0.y) * s));
          if (now !== inside) { out.push({ s, type: now ? 'enter' : 'exit' }); inside = now; }
        }
        return out;
      }
    };
  }
  throw new Error(`region kind: ${def.kind}`);
}
