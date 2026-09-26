/**
 * Turning a hand's input into points: a lasso closed smoothly, and a lazy pen (a string between
 * the cursor and the pen, and smoothing) for steadier lines.
 */

/**
 * Close a hand-drawn lasso: where its start and end overshoot each other, cut the two tails at
 * their nearest pair; then relax the points around the seam so the closure has no spike.
 * `tol` is how close (world units) the ends must come to count as overlapping.
 */
export function closeLasso(pts, tol = 6) {
  const n = pts.length;
  if (n < 6) return pts;
  const k = Math.max(3, Math.floor(n * 0.25));
  let best = Infinity, bi = 0, bj = n - 1;
  for (let i = 0; i < k; i++) for (let j = n - k; j < n; j++) {
    const d = Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
    if (d < best) { best = d; bi = i; bj = j; }
  }
  let out = best < tol * 4 && bj - bi > 4 ? pts.slice(bi, bj + 1) : pts.slice();
  // The two ends meet: drop the last point if it sits on the first.
  if (out.length > 4 && Math.hypot(out[0][0] - out.at(-1)[0], out[0][1] - out.at(-1)[1]) < tol) out = out.slice(0, -1);
  // Relax the seam: a few passes of neighbour averaging on the points either side of it.
  const m = out.length, reach = Math.min(4, Math.floor(m / 4));
  const seam = [...Array(reach).keys(), ...Array.from({ length: reach }, (_, i) => m - 1 - i)];
  for (let pass = 0; pass < 3; pass++) {
    const prev = out.map(q => q.slice());
    for (const i of seam) {
      const a = prev[(i - 1 + m) % m], b = prev[(i + 1) % m];
      out[i] = [(a[0] + prev[i][0] * 2 + b[0]) / 4, (a[1] + prev[i][1] * 2 + b[1]) / 4, prev[i][2], prev[i][3]];
    }
  }
  return out;
}

/**
 * A lazy pen: the pen trails the cursor on a string of length `radius` (it moves only when the
 * cursor pulls the string taut), and `smoothing` (0..1) eases it further. Returns the next pen
 * position, given the last one and the cursor.
 */
export function lazyStep(pen, cursor, radius, smoothing = 0) {
  let [px, py] = pen;
  const dx = cursor[0] - px, dy = cursor[1] - py, d = Math.hypot(dx, dy);
  if (radius > 0) {
    if (d <= radius) return pen;
    px += dx * (1 - radius / d); py += dy * (1 - radius / d);
  } else { px = cursor[0]; py = cursor[1]; }
  const s = Math.max(0, Math.min(0.95, smoothing));
  return [pen[0] + (px - pen[0]) * (1 - s), pen[1] + (py - pen[1]) * (1 - s)];
}
