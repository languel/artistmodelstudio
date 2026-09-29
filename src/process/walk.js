/**
 * The walk of a path: Catmull-Rom resampling, and along it each step's place, unit normal, speed and
 * pressure. Brushes read it (k.smoothPath, k.frames); p5 exports embed this file with them.
 */

/** Catmull-Rom resampling so hand-drawn and scripted paths render smoothly. */
function smoothPath(points, closed, samplesPerSeg) {
  if (points.length < 3) return points.map(p => p.slice());
  const out = [];
  const n = points.length;
  const get = i => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    // Samples follow the span's length (about one per 3 units, 6 to 96), so few, far-apart points
    // (a simplified line) still curve smoothly; a caller can ask for a fixed number.
    const k = samplesPerSeg || Math.max(6, Math.min(96, Math.ceil(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / 3)));
    for (let s = 0; s < k; s++) {
      const t = s / k, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), p1[2] + (p2[2] - p1[2]) * t, p1[3] + (p2[3] - p1[3]) * t]);
    }
  }
  if (!closed) out.push(points[n - 1].slice());
  return out;
}

/**
 * The walk of a line (after William Ngan's "Taking a line for a walk"): resampled points with
 * the unit normal and the hand's speed at each, from the recorded time (units per 16 ms frame),
 * smoothed so a line's character follows its motion rather than its jitter.
 */
function walkFrames(e, samples = 4, smoothing = 0.5) {
  const pts = smoothPath(e.points, e.closed, samples);
  let v = 0;
  return pts.map((q, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const prev = pts[Math.max(0, i - 1)];
    const step = Math.hypot(q[0] - prev[0], q[1] - prev[1]);
    const dt = (q[2] ?? 0) - (prev[2] ?? 0);
    const raw = i === 0 ? 0 : dt > 0.5 ? (step / dt) * 16 : step;
    v = i === 0 ? raw : v * smoothing + raw * (1 - smoothing);
    return { x: q[0], y: q[1], nx: -dy, ny: dx, speed: v, pressure: q[3] ?? 0.5 };
  });
}

export { smoothPath, walkFrames };
