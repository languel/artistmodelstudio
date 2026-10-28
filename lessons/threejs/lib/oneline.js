// One continuous line, after Picasso's one-line (unicursal) drawings: take separate strokes (a face outline, an eye, an arm...)
// and chain them into a SINGLE path that never lifts: each stroke is smoothed, the strokes are put in a good order, and the gaps
// between them are filled with curves that leave and arrive in the direction the line was already travelling.
// No three.js here: points are plain {x,y,z}.

// ---- MediaPipe face mesh: the landmark indices of each feature, in drawing order ------------------------------------------
export const FACE = {
  oval: { closed: true, idx: [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109] },
  lips: { closed: true, idx: [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185] },
  eyeL: { closed: true, idx: [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466] },
  eyeR: { closed: true, idx: [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246] },
  browL: { closed: false, idx: [276, 283, 282, 295, 285] },
  browR: { closed: false, idx: [46, 53, 52, 65, 55] },
  nose: { closed: false, idx: [168, 6, 197, 195, 5, 4, 1, 19, 94, 2] },
};

const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }), add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }), mul = (a, k) => ({ x: a.x * k, y: a.y * k, z: a.z * k });
const len = a => Math.hypot(a.x, a.y, a.z), dist = (a, b) => len(sub(a, b)), norm = a => { const l = len(a) || 1e-9; return mul(a, 1 / l); };
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const lerp3 = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

// @key A smooth curve through the points | Centripetal Catmull-Rom: a curve that passes through every landmark without loops or overshoot, so a rough set of face points becomes a flowing pen stroke.
export function spline(pts, closed = false, per = 8) {
  const n = pts.length; if (n < 3) return pts.slice();
  const at = i => closed ? pts[((i % n) + n) % n] : pts[Math.min(n - 1, Math.max(0, i))], out = [], segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    const t0 = 0, t1 = t0 + Math.sqrt(dist(p0, p1)) + 1e-6, t2 = t1 + Math.sqrt(dist(p1, p2)) + 1e-6, t3 = t2 + Math.sqrt(dist(p2, p3)) + 1e-6;
    for (let s = 0; s < per; s++) {
      const t = t1 + (t2 - t1) * (s / per);
      const A1 = lerp3(p0, p1, (t - t0) / (t1 - t0)), A2 = lerp3(p1, p2, (t - t1) / (t2 - t1)), A3 = lerp3(p2, p3, (t - t2) / (t3 - t2));
      out.push(lerp3(lerp3(A1, A2, (t - t0) / (t2 - t0)), lerp3(A2, A3, (t - t1) / (t3 - t1)), (t - t1) / (t2 - t1)));
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}
// @/key

// equal spacing along the curve, so the pen's width and wobble do not depend on how the points happened to be placed
export function resample(poly, step) {
  if (poly.length < 2) return poly.slice();
  const out = [poly[0]]; let carry = 0;
  for (let i = 1; i < poly.length; i++) {
    let a = poly[i - 1]; const b = poly[i]; let d = dist(a, b);
    while (carry + d >= step) { const t = (step - carry) / d; a = lerp3(a, b, t); out.push(a); d = dist(a, b); carry = 0; }
    carry += d;
  }
  if (dist(out[out.length - 1], poly[poly.length - 1]) > step * 0.25) out.push(poly[poly.length - 1]);
  return out;
}

// the direction a polyline is heading at its start or end
const tangentAt = (poly, end) => { const n = poly.length, k = Math.min(n - 1, 3); return end ? norm(sub(poly[n - 1], poly[n - 1 - k])) : norm(sub(poly[k], poly[0])); };

// @key Connect without lifting the pen | A cubic Bezier from where the line is to where the next stroke starts, leaving along the direction it was travelling and arriving along the next stroke's. `curl` bends it sideways into a loop, the pen's wander.
export function connector(a, ta, b, tb, { step = 0.01, tension = 0.4, curl = 0.15, flip = 1 } = {}) {
  const d = dist(a, b); if (d < step * 0.5) return [];
  const k = d * (0.3 + tension), side = norm({ x: -(b.y - a.y), y: b.x - a.x, z: 0 }), bend = mul(side, d * curl * flip);
  const P1 = add(add(a, mul(ta, k)), bend), P2 = add(sub(b, mul(tb, k)), bend), out = [], n = Math.max(3, Math.ceil(d * (1 + curl * 2) / step));
  for (let i = 1; i < n; i++) {
    const t = i / n, u = 1 - t;
    out.push({ x: u * u * u * a.x + 3 * u * u * t * P1.x + 3 * u * t * t * P2.x + t * t * t * b.x, y: u * u * u * a.y + 3 * u * u * t * P1.y + 3 * u * t * t * P2.y + t * t * t * b.y, z: u * u * u * a.z + 3 * u * u * t * P1.z + 3 * u * t * t * P2.z + t * t * t * b.z });
  }
  return out;
}
// @/key

// strokes: [{ pts: [{x,y,z}], closed }]. opts: { order: 'shortest' | 'fixed', step, tension, curl }. Returns { points, joins } where joins are the indices where a connector starts.
export function unicursal(strokes, opts = {}) {
  const { order = 'shortest', step = 0.01 } = opts, todo = strokes.filter(s => s.pts.length >= 2);
  if (!todo.length) return { points: [], joins: [] };
  const smooth = todo.map(s => ({ ...s, line: spline(s.pts, s.closed, 6) }));
  const path = [], joins = []; let flip = 1;
  const place = (s, from) => {   // choose where on a stroke the pen enters (and for a loop, also leaves), and which way it runs
    let line = s.line;
    if (s.closed) {
      let bi = 0, bd = Infinity; for (let i = 0; i < line.length; i++) { const d = from ? dist(line[i], from) : i; if (d < bd) { bd = d; bi = i; } }
      line = [...line.slice(bi), ...line.slice(0, bi), line[bi]];
    } else if (from && dist(line[line.length - 1], from) < dist(line[0], from)) line = line.slice().reverse();
    return line;
  };
  const remaining = smooth.slice(); let cur = null;
  while (remaining.length) {
    let pick = 0;
    if (order === 'shortest' && cur) {
      let bd = Infinity; remaining.forEach((s, j) => { const d = s.closed ? Math.min(...s.line.map(p => dist(p, cur))) : Math.min(dist(s.line[0], cur), dist(s.line[s.line.length - 1], cur)); if (d < bd) { bd = d; pick = j; } });
    }
    const s = remaining.splice(pick, 1)[0], line = place(s, cur);
    if (path.length) { joins.push(path.length); flip = -flip; path.push(...connector(path[path.length - 1], tangentAt(path, true), line[0], tangentAt(line, false), { ...opts, flip })); }
    path.push(...line); cur = path[path.length - 1];
  }
  return { points: resample(path, step), joins };
}

// the whole drawing again, scaled, shifted and turned, and chained on: Picasso overlapped his faces and the line carried on through them
export function copies(path, n, { scale = 0.85, dx = 0.12, dy = 0.04, turn = 0.1, step = 0.01, ...c } = {}) {
  if (n <= 1 || path.length < 3) return path;
  const cen = path.reduce((s, p) => add(s, p), { x: 0, y: 0, z: 0 }), m = mul(cen, 1 / path.length);
  let out = path.slice();
  for (let k = 1; k < n; k++) {
    const sc = scale ** k, a = turn * k, ca = Math.cos(a), sa = Math.sin(a);
    const next = path.map(p => { const q = sub(p, m), r = { x: q.x * ca - q.y * sa, y: q.x * sa + q.y * ca, z: q.z }; return add(add(mul(r, sc), m), { x: dx * k, y: dy * k, z: 0 }); });
    out = [...out, ...connector(out[out.length - 1], tangentAt(out, true), next[0], tangentAt(next, false), { step, ...c }), ...next];
  }
  return out;
}

// ---- the pen: wobble, pressure and taper -----------------------------------------------------------------------------------
const hash = n => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
export const noise1 = x => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return (hash(i) * (1 - u) + hash(i + 1) * u) * 2 - 1; };   // smooth value noise in -1..1

// @key The pen | Along the line: a slow noise nudges it sideways (a hand that is not quite steady), width follows a second noise (pressure) and thins on tight turns, and both ends taper to a point.
export function pen(points, { time = 0, wobble = 0.004, freq = 6, width = 0.012, pressure = 0.35, taper = 0.06, curl = 0.5 } = {}) {
  const n = points.length, pos = new Array(n), w = new Array(n), arc = new Array(n); arc[0] = 0;
  for (let i = 1; i < n; i++) arc[i] = arc[i - 1] + dist(points[i], points[i - 1]);
  const total = arc[n - 1] || 1;
  for (let i = 0; i < n; i++) {
    const p = points[i], a = points[Math.max(0, i - 1)], b = points[Math.min(n - 1, i + 1)], t = norm(sub(b, a)), nx = -t.y, ny = t.x;
    const d = noise1(arc[i] * freq + time * 0.3) * wobble;
    pos[i] = { x: p.x + nx * d, y: p.y + ny * d, z: p.z };
    const c = i > 0 && i < n - 1 ? 1 - Math.max(-1, Math.min(1, dot(norm(sub(p, a)), norm(sub(b, p))))) : 0;           // 0 straight, 2 a U-turn
    const k = Math.min(1, arc[i] / (total * taper + 1e-6), (total - arc[i]) / (total * taper + 1e-6));
    w[i] = width * (1 - pressure * 0.5 + pressure * 0.5 * noise1(arc[i] * 2.1 + 40)) * (1 - curl * Math.min(1, c * 0.6)) * (0.15 + 0.85 * Math.sqrt(Math.max(0, k)));
  }
  return { pos, w, arc, total };
}
// @/key
