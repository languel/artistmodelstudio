/**
 * Sculpt tools: brushes that reshape marks' points (after threegrease's sculpt brushes). Like
 * brushes, they are code:
 *
 *   sculpt({
 *     id: 'push', label: 'Push', doc: '…',
 *     params: { amount: [0, 2, 1, 'How far points follow the cursor'] },
 *     step(pts, s, p, k) { … return pts }
 *   })
 *
 * step runs for each mark under the brush, every time the pointer moves. It gets:
 *   pts  the mark's points [x, y, t, pressure] (artboard units), to change or replace
 *   s    the stroke: { x, y, dx, dy, radius, strength, pressure, invert, boost (Cmd held), closed, first,
 *        start: [x, y], orig (this mark's points when the stroke began), state (kept for the stroke) }
 *   p    the tool's params
 *   k    the kit: w(pt) (falloff × strength at the cursor), falloff(d, r), mean(pts, i, closed),
 *        rdp(pts, eps), refine(pts, maxSeg, near(a, b)), nearMark(pts, x, y, r), rng()
 * Alt inverts (pinch → inflate, thicken → thin). A tool with refine: true gets extra points near
 * the cursor first, so few-point marks can bend.
 *
 * Sculpting changes points (it is destructive, one undo step per stroke); a modifier stack for
 * non-destructive operations comes next.
 */

const param = (key, label, min, max, step, def, doc) => ({ key, label, min, max, step, default: def, doc });

// ---- kit -----------------------------------------------------------------------------------
export function falloff(d, r) {
  if (d >= r) return 0;
  const t = 1 - d / r;
  return t * t * (3 - 2 * t);
}

/** Where a point's neighbours average out to (null at an open mark's ends). */
function mean(pts, i, closed) {
  const n = pts.length;
  if (!closed && (i === 0 || i === n - 1)) return null;
  const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

export function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const L = Math.hypot(bx - ax, by - ay) || 1;
  let far = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / L;
    if (d > far) { far = d; at = i; }
  }
  if (far <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, at + 1), eps).slice(0, -1), ...rdp(pts.slice(at), eps)];
}

/** Split segments longer than maxSeg (only where near(a, b) is true for the segment), interpolating time and pressure. */
function refine(pts, maxSeg, near = () => true, closed = false) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    out.push(a);
    if (i === n - 1 && !closed) break;
    const b = pts[(i + 1) % n];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (d <= maxSeg || !near(a, b)) continue;
    const m = Math.min(24, Math.ceil(d / maxSeg));
    for (let j = 1; j < m; j++) { const u = j / m; out.push(a.map((v, c) => v + ((b[c] ?? v) - v) * u)); }
  }
  return out;
}

const KIT = { falloff, mean, rdp, refine, nearMark: (...a) => nearMark(...a) };

// ---- built-in tools --------------------------------------------------------------------------
export const SCULPTS = {
  push: {
    label: 'Push', refine: true, doc: 'Points under the brush follow the cursor.',
    params: [param('amount', 'Amount', 0, 2, 0.05, 1, 'How far points follow the cursor.')],
    step(pts, s, p, k) {
      return pts.map(q => { const w = k.w(q) * p.amount; return w ? [q[0] + s.dx * w, q[1] + s.dy * w, q[2], q[3]] : q; });
    }
  },

  grab: {
    label: 'Grab', refine: true, doc: 'Pick up the points under the brush where the stroke began and move them with the cursor.',
    params: [],
    step(pts, s, p, k) {
      // s.state lasts the whole stroke (one per mark): what the brush picked up at the start.
      if (!s.state.held) s.state.held = s.orig.map(q => k.falloff(Math.hypot(q[0] - s.start[0], q[1] - s.start[1]), s.radius) * s.strength);
      const held = s.state.held;
      if (!held.some(Boolean)) return null;
      const mx = s.x - s.start[0], my = s.y - s.start[1];
      return s.orig.map((q, i) => (held[i] ? [q[0] + mx * held[i], q[1] + my * held[i], q[2], q[3]] : q));
    }
  },

  smooth: {
    label: 'Smooth', doc: 'Points move toward their neighbours: wiggles relax, corners round, and pressure (thickness) evens out.',
    params: [param('amount', 'Amount', 0, 1, 0.05, 0.5, 'How far each pass moves a point toward its neighbours.')],
    step(pts, s, p, k) {
      return pts.map((q, i) => {
        const w = k.w(q) * p.amount;
        const m = w && k.mean(pts, i, s.closed);
        if (!m) return q;
        // Pressure evens out too (thickened passages blend into the rest).
        const n = pts.length, a = pts[(i - 1 + n) % n][3] ?? 0.5, b = pts[(i + 1) % n][3] ?? 0.5, pr = q[3] ?? 0.5;
        return [q[0] + (m[0] - q[0]) * w, q[1] + (m[1] - q[1]) * w, q[2], pr + ((a + b) / 2 - pr) * w];
      });
    }
  },

  relax: {
    label: 'Relax', doc: 'Evens out the spacing along the mark without changing its shape (Smooth that only slides points along).',
    params: [param('amount', 'Amount', 0, 1, 0.05, 0.6, 'How far each pass slides a point.')],
    step(pts, s, p, k) {
      const n = pts.length;
      return pts.map((q, i) => {
        const w = k.w(q) * p.amount;
        const m = w && k.mean(pts, i, s.closed);
        if (!m) return q;
        const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
        let tx = b[0] - a[0], ty = b[1] - a[1];
        const L = Math.hypot(tx, ty) || 1; tx /= L; ty /= L;
        const along = (m[0] - q[0]) * tx + (m[1] - q[1]) * ty;
        return [q[0] + tx * along * w, q[1] + ty * along * w, q[2], q[3]];
      });
    }
  },

  pinch: {
    label: 'Pinch', refine: true, doc: 'Points gather toward the cursor (Alt: inflate, away from it).',
    params: [param('amount', 'Amount', 0, 1, 0.02, 0.15, 'How much of the way to the cursor each pass goes.')],
    step(pts, s, p, k) {
      const dir = s.invert ? -1 : 1;
      return pts.map(q => { const w = k.w(q) * p.amount * dir; return w ? [q[0] + (s.x - q[0]) * w, q[1] + (s.y - q[1]) * w, q[2], q[3]] : q; });
    }
  },

  twist: {
    label: 'Twist', refine: true, doc: 'Points turn around the cursor as you move (Alt: the other way).',
    params: [param('speed', 'Speed', 0, 0.2, 0.005, 0.04, 'Radians per pass at full strength.')],
    step(pts, s, p, k) {
      const turn = (s.invert ? -1 : 1) * p.speed * (1 + Math.hypot(s.dx, s.dy) / Math.max(1, s.radius) * 4);
      return pts.map(q => {
        const a = k.w(q) * turn;
        if (!a) return q;
        const c = Math.cos(a), sn = Math.sin(a), x = q[0] - s.x, y = q[1] - s.y;
        return [s.x + x * c - y * sn, s.y + x * sn + y * c, q[2], q[3]];
      });
    }
  },

  jitter: {
    label: 'Jitter', doc: 'Seeded tremor: points shake a little under the brush.',
    params: [param('amount', 'Amount', 0, 0.2, 0.005, 0.03, 'Shake, as a fraction of the brush radius.')],
    step(pts, s, p, k) {
      const a = s.radius * p.amount;
      return pts.map(q => { const w = k.w(q); return w ? [q[0] + (k.rng() - 0.5) * a * w, q[1] + (k.rng() - 0.5) * a * w, q[2], q[3]] : q; });
    }
  },

  simplify: {
    label: 'Simplify', doc: 'Fewer points under the brush, same shape (Ramer–Douglas–Peucker on the part you brush). Alt: resample, more points, evenly spaced.',
    params: [
      param('tolerance', 'Tolerance', 0, 0.2, 0.005, 0.03, 'How far the shape may move, as a fraction of the brush radius.'),
      param('density', 'Density', 1, 50, 1, 8, 'Alt (resample): points per brush radius at the center (more = denser); it eases back to the mark’s own spacing toward the edge.')
    ],
    step(pts, s, p, k) {
      if (s.invert) {
        // Resample: split what the brush covers into even steps (the finer, the stronger).
        // Spacing follows the brush falloff: p.density × radius at the center, easing to the
        // segment's own length at the edge, so the new points blend into the old spacing.
        const out = [], n = pts.length, segs = s.closed ? n : n - 1;
        for (let i = 0; i < n; i++) {
          out.push(pts[i]);
          if (i >= segs) break;
          const a = pts[i], b = pts[(i + 1) % n];
          const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
          const w = k.w([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
          if (w <= 0) continue;
          const t = Math.min(1, w * 2);   // strength 0.5 reaches the full density at the center
          const target = d + (s.radius / Math.max(1, p.density) - d) * t;
          const m = Math.min(24, Math.ceil(d / Math.max(0.5, target) - 0.2));
          for (let j = 1; j < m; j++) { const u = j / m; out.push(a.map((v, c) => v + ((b[c] ?? v) - v) * u)); }
        }
        return out;
      }
      const eps = s.radius * p.tolerance * s.strength;
      const out = [];
      let run = [];
      const flush = () => { if (run.length) out.push(...(run.length > 2 ? k.rdp(run, eps) : run)); run = []; };
      pts.forEach((q, i) => {
        // Only where the brush is strong enough: fewer points toward the center, not a hard edge.
        const keep = i === 0 || i === pts.length - 1 || k.w(q) < 0.25;
        if (keep) { flush(); out.push(q); } else run.push(q);
      });
      flush();
      // A run between two kept points: simplify it with its ends so the shape holds.
      return out.length >= 2 ? out : pts;
    }
  },

  thicken: {
    label: 'Thicken', refine: true, doc: 'Raises the pressure under the brush, so pressure-aware brushes (Ink) draw wider (Alt: thinner). Pressure can go past 1 (a mouse line is already near 1): up to 2, or up to 10 with Cmd held.',
    params: [param('amount', 'Amount', 0, 0.5, 0.01, 0.12, 'Pressure added per pass.')],
    step(pts, s, p, k) {
      const dir = s.invert ? -1 : 1;
      return pts.map(q => { const w = k.w(q); return w ? [q[0], q[1], q[2], Math.max(0.02, Math.min(s.boost ? 10 : 2, (q[3] ?? 0.5) + dir * w * p.amount * (s.boost ? 3 : 1)))] : q; });
    }
  }
};

// Every tool keeps its raw function as its source; step always gets a kit.
for (const [id, t] of Object.entries(SCULPTS)) { t.id = id; t.rawStep = t.step; }

const q = v => JSON.stringify(v);
/** A sculpt tool as code. */
export function sculptSource(id) {
  const t = SCULPTS[id];
  if (!t) return null;
  if (t.source) return t.source;
  const params = t.params.map(p => `    ${p.key}: [${p.min}, ${p.max}, ${p.default}${p.doc ? `, ${q(p.doc)}` : ''}]`).join(',\n');
  let fn = t.rawStep.toString();
  if (!/^step\s*\(/.test(fn)) fn = `step${fn.replace(/^function\s*\w*\s*/, '')}`;
  const lines = fn.split('\n');
  const base = lines.length > 1 ? lines[lines.length - 1].match(/^ */)[0].length : 0;
  fn = [lines[0], ...lines.slice(1).map(l => `  ${l.slice(Math.min(base, l.match(/^ */)[0].length))}`)].join('\n');
  return `sculpt({
  id: ${q(id)},
  label: ${q(t.label)},
  doc: ${q(t.doc || '')},${t.refine ? '\n  refine: true,' : ''}
  params: {
${params}
  },
  ${fn}
})
`;
}

/** Compile sculpt code: sculpt({ id, label, doc, refine?, params, step(pts, s, p, k) { … } }). */
export function compileSculpt(source) {
  let def = null;
  // eslint-disable-next-line no-new-func
  new Function('sculpt', `"use strict";\n${source}`)(d => { def = d; });
  if (!def) throw new Error('The code must call sculpt({ id, step(pts, s, p, k) { … } })');
  if (!/^[a-z][\w-]*$/i.test(def.id || '')) throw new Error('sculpt id must be a word like "comb"');
  if (typeof def.step !== 'function') throw new Error('sculpt needs step(pts, s, p, k) { … }');
  const params = Object.entries(def.params || {}).map(([key, v]) => {
    const [min, max, dflt, doc] = Array.isArray(v) ? v : [v.min ?? 0, v.max ?? 1, v.default ?? 0, v.doc];
    return param(key, key, Number(min), Number(max), Math.abs(Number(max) - Number(min)) / 100 || 0.01, Number(dflt), doc || '');
  });
  return { id: def.id, label: def.label || def.id, doc: def.doc || '', refine: Boolean(def.refine), params, step: def.step, rawStep: def.step, source, custom: true };
}

const LIB_KEY = 'ams_sculpts_v1';
const BUILTIN = new Set(Object.keys(SCULPTS));
export const isBuiltinSculpt = id => BUILTIN.has(id);
export function librarySculpts() { try { return JSON.parse(globalThis.localStorage?.getItem(LIB_KEY) || '{}'); } catch { return {}; } }

/** Save sculpt code to your library (built-ins cannot be replaced: fork under a new id). */
export function saveSculpt(source) {
  const def = compileSculpt(source);
  if (BUILTIN.has(def.id)) throw new Error(`"${def.id}" is a built-in sculpt tool: give your version its own id`);
  SCULPTS[def.id] = def;
  const lib = librarySculpts(); lib[def.id] = source;
  try { globalThis.localStorage?.setItem(LIB_KEY, JSON.stringify(lib)); } catch { /* ignore */ }
  return def;
}

export function deleteSculpt(id) {
  if (BUILTIN.has(id)) return false;
  const lib = librarySculpts(); delete lib[id];
  try { globalThis.localStorage?.setItem(LIB_KEY, JSON.stringify(lib)); } catch { /* ignore */ }
  delete SCULPTS[id];
  return true;
}

export function loadSculptLibrary() {
  for (const src of Object.values(librarySculpts())) { try { const d = compileSculpt(src); if (!BUILTIN.has(d.id)) SCULPTS[d.id] = d; } catch (err) { console.warn('sculpt library:', err.message); } }
}

export function sculptParams(id, values = {}) {
  const t = SCULPTS[id];
  const out = {};
  for (const p of t?.params || []) out[p.key] = Number.isFinite(values[p.key]) ? values[p.key] : p.default;
  return out;
}

/** Is any part of the mark (its segments, not only its points) within r of (x, y)? */
export function nearMark(pts, x, y, r, closed = false) {
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    if (Math.hypot(a[0] - x, a[1] - y) < r) return true;
    if (i === n - 1 && !closed) break;
    const b = pts[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
    const u = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)) : 0;
    if (Math.hypot(a[0] + dx * u - x, a[1] + dy * u - y) < r) return true;
  }
  return false;
}

export const SCULPTABLE = e => !['point', 'note', 'image'].includes(e.role) && e.points.length >= 2;

/**
 * One pass of a sculpt tool over a mark. `s` is the stroke state (world units); returns new
 * points, or null when nothing under the brush changed.
 */
export function sculptMark(id, e, s, values, rng = Math.random, mark = { orig: e.points, state: {} }) {
  const t = SCULPTS[id];
  if (!t) return null;
  const near = (a, b) => nearMark([a, b], s.x, s.y, s.radius);
  let pts = e.points;
  if (id !== 'grab' && !nearMark(pts, s.x, s.y, s.radius, e.closed)) return null;
  if (t.refine && id !== 'grab') pts = refine(pts, s.radius / 6, near, e.closed);
  else if (id === 'grab' && s.first) mark.orig = refine(mark.orig, s.radius / 6, (a, b) => nearMark([a, b], s.start[0], s.start[1], s.radius * 2), e.closed);
  const k = { ...KIT, rng, w: q => falloff(Math.hypot(q[0] - s.x, q[1] - s.y), s.radius) * s.strength * (s.pressure ?? 1) };
  try {
    const out = t.step(pts.map(q => q.slice()), { ...s, closed: Boolean(e.closed), orig: mark.orig, state: mark.state }, sculptParams(id, values), k);
    return Array.isArray(out) && out.length >= 2 && out.every(q => Number.isFinite(q[0]) && Number.isFinite(q[1])) ? out : null;
  } catch (err) {
    if (!t.warned) { t.warned = true; console.warn(`sculpt "${id}" failed: ${err.message}`); }
    return null;
  }
}
