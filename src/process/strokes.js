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

/**
 * Shift on a straight stroke (a guide, a click-path guide): the end moves to the nearest 15-degree direction from
 * the start, keeping its distance.
 */
export function straightEnd(from, to, step = Math.PI / 12) {
  const a = Math.round(Math.atan2(to[1] - from[1], to[0] - from[0]) / step) * step;
  const r = Math.hypot(to[0] - from[0], to[1] - from[1]);
  return [from[0] + Math.cos(a) * r, from[1] + Math.sin(a) * r];
}

/**
 * The lazy pen following the cursor from `from` to `to` (world units). A pointer event can jump far, so the
 * jump is split into steps of about `step`, and the string pulls the pen at each step: the pen follows the path
 * the cursor took (no snap to the edge of the string). Smoothing then eases the pen once toward where it ended.
 */
export function lazyFollow(pen, from, to, radius, smoothing = 0, step = 2) {
  const n = Math.max(1, Math.ceil(Math.hypot(to[0] - from[0], to[1] - from[1]) / Math.max(step, 1e-9)));
  let target = pen;
  for (let k = 1; k <= n; k++) target = lazyStep(target, [from[0] + (to[0] - from[0]) * k / n, from[1] + (to[1] - from[1]) * k / n], radius, 0);
  const s = Math.max(0, Math.min(0.95, smoothing));
  return [pen[0] + (target[0] - pen[0]) * (1 - s), pen[1] + (target[1] - pen[1]) * (1 - s)];
}

/**
 * The lazy pen catching up to a still cursor: it closes the gap by a share that grows with the time dt (ms) since
 * the last step (exponential, half the gap in tau·ln 2 ms). A pen already at the cursor does not move.
 */
export function lazyCatchUp(pen, cursor, dt, tau = 120) {
  const k = 1 - Math.exp(-Math.max(0, dt) / Math.max(tau, 1e-9));
  return [pen[0] + (cursor[0] - pen[0]) * k, pen[1] + (cursor[1] - pen[1]) * k];
}

