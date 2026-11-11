/**
 * The eraser: a round tip of radius r swept from (ax, ay) to (bx, by) (one pointer move), taking away what it passes over.
 *
 * - A line loses the points under the tip; where the tip crosses it the line is cut cleanly (a point is put at the
 *   edge of the tip), so a line erased across its middle becomes two lines, and a closed line opens.
 * - A plane loses the points under the tip and stays one closed shape (the bite is closed straight across).
 * - A point under the tip goes. Notes and images are left alone (they are erased by deleting them).
 *
 * Points keep their time and pressure (cut points take them in between), so pieces still play back as drawn.
 */

/** Distance from (px, py) to the segment a–b. */
export function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  const u = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
  return Math.hypot(ax + dx * u - px, ay + dy * u - py);
}

/** Shortest distance between the segments p–q and a–b. */
function segSegDist(p, q, a, b) {
  const cross = (o, s, t) => (s[0] - o[0]) * (t[1] - o[1]) - (s[1] - o[1]) * (t[0] - o[0]);
  const d1 = cross(a, b, p), d2 = cross(a, b, q), d3 = cross(p, q, a), d4 = cross(p, q, b);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return 0;
  return Math.min(segDist(p[0], p[1], a[0], a[1], b[0], b[1]), segDist(q[0], q[1], a[0], a[1], b[0], b[1]), segDist(a[0], a[1], p[0], p[1], q[0], q[1]), segDist(b[0], b[1], p[0], p[1], q[0], q[1]));
}

const lerp = (p, q, u) => p.map((v, i) => (i < 2 || Number.isFinite(q[i]) ? v + ((q[i] ?? v) - v) * u : v));

/**
 * Erase along a sweep from the points of one mark. Returns null when nothing was under the tip, else the pieces left:
 * an array of point arrays (empty when all of it went). `closed`: the points make a loop. `keepClosed`: a plane (it stays
 * one closed shape).
 */
export function erasePoints(pts, { ax, ay, bx, by, r, closed = false, keepClosed = false }) {
  const n = pts.length;
  if (!n) return null;
  const tip = [[ax, ay], [bx, by]];
  const under = q => segDist(q[0], q[1], ax, ay, bx, by) < r;
  // Walk the segments; where one passes under the tip, put points along it (a quarter of the tip apart) so the cut lands at its edge.
  const seq = [];   // { q, inserted }
  const last = closed ? n : n - 1;
  for (let i = 0; i < n; i++) {
    seq.push({ q: pts[i], inserted: false });
    if (i >= last) continue;
    const a = pts[i], b = pts[(i + 1) % n];
    if (segSegDist(a, b, tip[0], tip[1]) >= r) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]), steps = Math.min(400, Math.ceil(len / (r / 4)));
    for (let k = 1; k < steps; k++) seq.push({ q: lerp(a, b, k / steps), inserted: true });
  }
  const gone = seq.map(s => under(s.q));
  if (!gone.some(Boolean)) return null;
  if (gone.every(Boolean)) return [];
  // Keep a point put along a segment only where it is the new end of a piece (next to what was erased).
  const m = seq.length, wrap = closed;
  const keep = seq.map((s, i) => {
    if (gone[i]) return false;
    if (!s.inserted) return true;
    const prev = i > 0 ? gone[i - 1] : wrap ? gone[m - 1] : false, next = i < m - 1 ? gone[i + 1] : wrap ? gone[0] : false;
    return prev || next;
  });
  // Runs of kept points (a loop's run that wraps round the start is joined).
  const runs = [];
  let cur = null;
  for (let i = 0; i < m; i++) {
    if (!gone[i]) { if (keep[i]) (cur ||= []).push(seq[i].q); }
    else if (cur) { runs.push(cur); cur = null; }
  }
  if (cur) runs.push(cur);
  if (closed && runs.length > 1 && !gone[0] && !gone[m - 1]) { const first = runs.shift(); runs[runs.length - 1] = runs[runs.length - 1].concat(first); }
  if (keepClosed) { const all = runs.flat(); return all.length >= 3 ? [all] : []; }
  return runs.filter(r => r.length >= 2);
}

/** Does the eraser's sweep touch this mark? (A quick test before the work.) */
export function sweepTouches(pts, { ax, ay, bx, by, r, closed = false }) {
  const n = pts.length, tip = [[ax, ay], [bx, by]];
  if (n === 1) return segDist(pts[0][0], pts[0][1], ax, ay, bx, by) < r;
  for (let i = 0; i < (closed ? n : n - 1); i++) if (segSegDist(pts[i], pts[(i + 1) % n], tip[0], tip[1]) < r) return true;
  return false;
}

/** Marks the eraser works on. */
export const ERASABLE = e => ['point', 'line', 'plane', 'gesture', 'guide'].includes(e.role) || (e.role !== 'note' && e.role !== 'image' && e.points?.length >= 2);

/**
 * One sweep of the eraser over a mark. Returns null (untouched), or { pieces } where pieces are the point arrays that remain
 * (none: the mark goes; one: it is changed; more: it was cut).
 */
export function eraseMark(e, sweep) {
  if (!ERASABLE(e) || !e.points?.length) return null;
  if (e.role === 'point' || e.points.length === 1) return sweepTouches(e.points, sweep) ? { pieces: [] } : null;
  const plane = e.role === 'plane';
  const pieces = erasePoints(e.points, { ...sweep, closed: plane || Boolean(e.closed), keepClosed: plane });
  return pieces ? { pieces } : null;
}
