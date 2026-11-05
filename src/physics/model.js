/**
 * Physics from the drawing (pure: no engine here). A board with physics on (`board.physics = { on: true, … }`)
 * makes its marks physical, as in Algodoo: what is drawn closed (a plane, a circle, a closed line) falls and
 * collides; what is drawn open (a line, a gesture) is ground, walls and ramps; points are small balls. A mark
 * says otherwise with `play.phys` ({ type: 'dynamic' | 'static' | 'kinematic' | 'sensor' | 'none', shape, … }).
 * Joints are marks too: `play.hinge` (a point: it pins what is under it to the world, or two things together;
 * a motor and limits), `play.weld` (a point: what is under it is glued), `play.spring` (a line between what is
 * under its two ends).
 *
 * physicsScene(doc) → [{ board, world, bodies, joints, key }] in pixels and seconds; the core converts to
 * metres with `world.ppm`. A body: { id, type, c: [cx, cy] (its origin: the centre of what it is),
 * shapes: [{ kind: 'ball', r, at } | { kind: 'hull', pts } | { kind: 'capsule', a, b, r }], density, friction,
 * bounce, damping, spin, v, sensor, trigger (the mark is an event: a touch fires it) }, shapes in the body's
 * own frame (relative to c). A joint: { id, kind: 'hinge' | 'weld' | 'spring', a, b (body ids; null: the
 * world), anchor (hinge, weld) or pa, pb (spring) in board pixels, motor, limits, stiffness, damping, rest }.
 */
import { boardsOf, MAIN } from '../process/boards.js';
import { outlineOf } from '../score/geometry.js';

/** What a board's world is unless it says otherwise. gravity in m/s² (y down, as the drawing), ppm: pixels a metre. */
export const WORLD_DEFAULTS = Object.freeze({ gravity: [0, 9.8], ppm: 50, speed: 1, clock: 'transport', walls: true, iterations: 4 });
/** A material unless a mark says otherwise. */
export const MATERIAL = Object.freeze({ density: 1, friction: 0.5, bounce: 0.2, damping: 0.05, angularDamping: 0.05 });
export const BODY_TYPES = ['dynamic', 'static', 'kinematic', 'sensor', 'none'];
export const SHAPES = ['auto', 'circle', 'box', 'hull', 'chain'];

/** A board's world settings, or null when its physics is off. */
export const physicsOf = b => (b?.physics?.on ? { ...WORLD_DEFAULTS, ...b.physics } : null);
/** The boards whose physics is on. */
export const physicsBoards = doc => boardsOf(doc).filter(b => physicsOf(b) && !b.hidden);
/** A mark is a joint (not a body). */
export const jointKind = e => (e.play?.hinge ? 'hinge' : e.play?.weld ? 'weld' : e.play?.spring ? 'spring' : null);

const width = e => Number(e.realize?.params?.width) || Number(e.realize?.params?.size) / 3 || 2;
const closedOf = e => Boolean(e.closed) || e.role === 'plane';

/**
 * What a mark is in a physical board: { type, shape } or null (not physical). Explicit `play.phys` wins;
 * else: notes, pictures, guides, scores' paths, travelers, gas bodies and joints are not bodies; closed
 * marks are dynamic; open lines are static (ground); points are small dynamic balls.
 */
export function roleOf(e) {
  const ph = e.play?.phys;
  if (ph?.type === 'none') return null;
  if (jointKind(e)) return null;
  if (ph?.type && e.play?.travel) return { type: 'kinematic', shape: 'circle' };   // (a traveler made physical pushes things along its path)
  if (ph?.type) return { type: ph.type, shape: ph.shape || 'auto' };
  if (['note', 'image', 'guide'].includes(e.role) || e.board === 'blackboard') return null;
  if (e.play?.travel || e.play?.body || e.play?.path || e.play?.node) return null;
  if (!e.points?.length) return null;
  if (e.role === 'point' || e.points.length === 1) return { type: 'dynamic', shape: 'circle' };
  if (closedOf(e)) return { type: 'dynamic', shape: ph?.shape || 'auto' };
  return { type: 'static', shape: 'chain' };
}

// ---- geometry -------------------------------------------------------------------------------------

/** The convex hull of points (Andrew's monotone chain), counter-clockwise, no repeats. */
export function convexHull(pts) {
  const p = pts.map(q => [q[0], q[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [], upper = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), q) <= 0) lower.pop(); lower.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), q) <= 0) upper.pop(); upper.push(q); }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** The area and centroid of a polygon. */
export function polygonCentroid(pts) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % pts.length], k = x0 * y1 - x1 * y0;
    a += k; cx += (x0 + x1) * k; cy += (y0 + y1) * k;
  }
  if (Math.abs(a) < 1e-9) { const n = pts.length || 1; return { area: 0, c: [pts.reduce((s, q) => s + q[0], 0) / n, pts.reduce((s, q) => s + q[1], 0) / n] }; }
  return { area: Math.abs(a / 2), c: [cx / (3 * a), cy / (3 * a)] };
}

/** A closed outline round enough to be a circle: its centre and radius, else null. */
export function roundness(pts) {
  if (pts.length < 6) return null;
  const { c } = polygonCentroid(pts);
  const r = pts.map(q => Math.hypot(q[0] - c[0], q[1] - c[1]));
  const m = r.reduce((s, v) => s + v, 0) / r.length;
  const sd = Math.sqrt(r.reduce((s, v) => s + (v - m) ** 2, 0) / r.length);
  return m > 0 && sd / m < 0.08 ? { c, r: m } : null;
}

/** The shapes of a mark as a body, around its origin c (board pixels in, the body's frame out). */
export function shapesOf(e, shape = 'auto') {
  // (the outline as it is drawn, smoothed unless straight: what you see is what collides)
  const pts = (e.points.length > 2 ? outlineOf({ ...e, closed: closedOf(e) }) : e.points).map(q => [q[0], q[1]]);
  const w = width(e);
  if (e.role === 'point' || pts.length === 1) {
    const r = Math.max(2, (Number(e.realize?.params?.size) || 12) / 2);
    return { c: pts[0], shapes: [{ kind: 'ball', r, at: [0, 0] }] };
  }
  const closed = closedOf(e);
  if (shape === 'chain' || (!closed && shape === 'auto')) {
    // An open line (or a closed one asked to be hollow): rounded segments as thick as the stroke.
    const c = pts.reduce((s, q) => [s[0] + q[0] / pts.length, s[1] + q[1] / pts.length], [0, 0]);
    const r = Math.max(1.5, w / 2), shapes = [];
    const simple = thin(pts, Math.max(1, r * 0.5));
    for (let i = 1; i < simple.length; i++) shapes.push({ kind: 'capsule', a: [simple[i - 1][0] - c[0], simple[i - 1][1] - c[1]], b: [simple[i][0] - c[0], simple[i][1] - c[1]], r });
    if (closed && simple.length > 2) shapes.push({ kind: 'capsule', a: [simple.at(-1)[0] - c[0], simple.at(-1)[1] - c[1]], b: [simple[0][0] - c[0], simple[0][1] - c[1]], r });
    return { c, shapes };
  }
  const round = shape === 'circle' || shape === 'auto' ? roundness(pts) : null;
  if (round || shape === 'circle') {
    const rr = round || { c: polygonCentroid(pts).c, r: Math.max(...pts.map(q => Math.hypot(q[0] - polygonCentroid(pts).c[0], q[1] - polygonCentroid(pts).c[1]))) };
    return { c: rr.c, shapes: [{ kind: 'ball', r: rr.r + w / 2, at: [0, 0] }] };
  }
  if (shape === 'box') {
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const c = [(x0 + x1) / 2, (y0 + y1) / 2], hw = (x1 - x0) / 2 + w / 2, hh = (y1 - y0) / 2 + w / 2;
    return { c, shapes: [{ kind: 'hull', pts: [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] }] };
  }
  const hull = convexHull(pts);
  const { c, area } = polygonCentroid(hull);
  if (area < 4 || hull.length < 3) return shapesOf({ ...e, closed: false, role: 'line' }, 'chain');
  return { c, shapes: [{ kind: 'hull', pts: hull.map(q => [q[0] - c[0], q[1] - c[1]]) }] };
}

/** Fewer points along a line (every point at least `d` from the last kept), ends kept. */
function thin(pts, d) {
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) if (Math.hypot(pts[i][0] - out.at(-1)[0], pts[i][1] - out.at(-1)[1]) >= d) out.push(pts[i]);
  if (pts.length > 1) out.push(pts.at(-1));
  return out.slice(0, 200);
}

/** Is a point (board pixels) inside a body (at rest), with a little slack for lines? */
export function bodyContains(body, x, y, slack = 4) {
  const lx = x - body.c[0], ly = y - body.c[1];
  return body.shapes.some(s => {
    if (s.kind === 'ball') return Math.hypot(lx - s.at[0], ly - s.at[1]) <= s.r + slack;
    if (s.kind === 'capsule') return segDist(lx, ly, s.a, s.b) <= s.r + slack;
    return inPolygon(lx, ly, s.pts) || s.pts.some((p, i) => segDist(lx, ly, p, s.pts[(i + 1) % s.pts.length]) <= slack);
  });
}
function segDist(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  const t = L ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L)) : 0;
  return Math.hypot(x - (a[0] + t * dx), y - (a[1] + t * dy));
}
function inPolygon(x, y, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i], [xj, yj] = pts[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ---- the scene ------------------------------------------------------------------------------------

/** The bodies under a point, topmost (drawn last) first. */
const bodiesAt = (bodies, x, y) => bodies.filter(b => b.type !== 'sensor' && bodyContains(b, x, y)).reverse();

/** A joint's two ends: the explicit ones (ids, or 'world'), else what is under its point(s). */
function ends(j, bodies, ids, pa, pb = pa) {
  const pick = ref => (ref === 'world' ? null : ids.has(ref) ? ref : undefined);
  let a = pick(j.a), b = pick(j.b);
  if (a === undefined || b === undefined) {
    if (pa === pb) {
      const under = bodiesAt(bodies, pa[0], pa[1]);
      if (a === undefined) a = under[0]?.id ?? null;
      if (b === undefined) b = under.find(x => x.id !== a)?.id ?? null;
    } else {
      if (a === undefined) a = bodiesAt(bodies, pa[0], pa[1])[0]?.id ?? null;
      if (b === undefined) b = bodiesAt(bodies, pb[0], pb[1]).find(x => x.id !== a)?.id ?? null;
    }
  }
  return [a, b];
}

/** The physics of a document: one scene per board with physics on. */
export function physicsScene(doc) {
  const out = [];
  for (const board of physicsBoards(doc)) {
    const world = physicsOf(board);
    const marks = (doc.elements || []).filter(e => (e.board || MAIN) === board.id);
    const bodies = [];
    for (const e of marks) {
      const role = roleOf(e);
      if (!role) continue;
      const ph = e.play?.phys || {};
      const { c, shapes } = shapesOf(e, ph.shape || role.shape);
      if (!shapes.length) continue;
      bodies.push({
        id: e.id, type: role.type === 'sensor' ? 'static' : role.type, sensor: role.type === 'sensor', c, shapes,
        density: ph.density ?? MATERIAL.density, friction: ph.friction ?? MATERIAL.friction, bounce: ph.bounce ?? MATERIAL.bounce,
        damping: ph.damping ?? MATERIAL.damping, angularDamping: ph.angularDamping ?? MATERIAL.angularDamping,
        v: Array.isArray(ph.v) ? ph.v : null, spin: Number(ph.spin) || 0, trigger: Boolean(e.play?.trigger),
        ...(e.play?.travel ? { traveler: true } : {})   // (its motion: the studio adds `follow`, its path and timing, from the score)
      });
    }
    const ids = new Set(bodies.map(b => b.id)), joints = [];
    for (const e of marks) {
      const kind = jointKind(e);
      if (!kind || !e.points?.length) continue;
      const j = e.play[kind] === true ? {} : e.play[kind] || {};
      if (kind === 'spring') {
        const pa = e.points[0].slice(0, 2), pb = e.points.at(-1).slice(0, 2);
        const [a, b] = ends(j, bodies, ids, pa, pb);
        if (a == null && b == null) continue;
        joints.push({ id: e.id, kind, a, b, pa, pb, rest: j.rest ?? Math.hypot(pb[0] - pa[0], pb[1] - pa[1]), stiffness: j.stiffness ?? 40, damping: j.damping ?? 1.5 });
      } else {
        const anchor = (e.points.length === 1 ? e.points[0] : centreOf(e.points)).slice(0, 2);
        const [a, b] = ends(j, bodies, ids, anchor);
        if (a == null && b == null) continue;
        joints.push({ id: e.id, kind, a, b, anchor, motor: kind === 'hinge' && j.motor?.on !== false && j.motor ? { speed: Number(j.motor.speed) || 0, torque: j.motor.torque ?? 1000 } : null, limits: Array.isArray(j.limits) ? j.limits : null });
      }
    }
    const scene = { board: { id: board.id, x: board.x, y: board.y, width: board.width, height: board.height }, world, bodies, joints };
    scene.key = JSON.stringify(scene);
    out.push(scene);
  }
  return out;
}

const centreOf = pts => pts.reduce((s, q) => [s[0] + q[0] / pts.length, s[1] + q[1] / pts.length], [0, 0]);

/** Where a point of a body is now: pose { x, y, a } of a body whose origin rests at c. */
export const placeAt = (pose, c, x, y) => {
  const dx = x - c[0], dy = y - c[1], cs = Math.cos(pose.a), sn = Math.sin(pose.a);
  return [pose.x + dx * cs - dy * sn, pose.y + dx * sn + dy * cs];
};
