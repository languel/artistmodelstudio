/**
 * Relations between marks, made by pointing: what two marks mean to each other is read from what they
 * are (after Sketchpad: you point, the system knows). Pure; the Play tool and the menus call these on
 * a draft document inside one undo step.
 *
 *   infer(a, b)                 → { kind, from, to } | null      what pointing from a to b would make
 *   travel(d, moverId, pathId)  a point travels a line, starting at the line's start (the point goes there)
 *   send(d, fromId, toId)       when the first sounds, a traveler goes to the second and it sounds there
 *   cue(d, triggerId, travelerId)  the trigger starts the traveler
 *   place(d, markId, pathId)    the mark moves so its middle is on the line (nothing is attached)
 *   offset(d, travelerId, u)    the traveler begins u (0..1) of the way along its line; its marker goes there
 *   edge(d, fromId, toId)       a path from one node to another (straight, or across then up, by the first's `shape`)
 *   input(d, nodeId, gateId)    the node is an input of the logic gate
 *   attachEvent(d, id, pathId, u)  an event sits on a line at u (0..1) and follows it; detach(d, id) frees a traveler or an event
 *   slideEvent(d, id, u)        an attached event moves along its line
 *   syncAttached(d)             attached events follow their lines (after an edit)
 *   syncEdges(d)                the edges follow their nodes (after a move; a hand-drawn edge keeps its middle): returns how many changed
 */
import { emitFor, DEFAULTS } from './presets.js';
import { outlineOf, centerOf, pointAt, nearestOn } from './geometry.js';
import { realizeAfter, newPart, canBePath } from '../process/playparts.js';
import { normalizeElement } from '../process/document.js';
import { pathTime } from './compile.js';
import { timeContext } from '../time/sceneTransport.js';

export const refOf = e => e.label || e.id;
const isLine = e => ['line', 'gesture', 'guide'].includes(e.role) && (e.points?.length || 0) >= 2;
const isPointish = e => e.role === 'point' && !e.play?.trigger && !e.play?.body;
const isTrig = e => Boolean(e.play?.trigger);
const isTrav = e => Boolean(e.play?.travel);
const nodeish = e => (e.role === 'point' || e.role === 'plane' || isTrig(e)) && !isTrav(e) && !e.play?.body;
const isNode = e => Boolean(e?.play?.node);
const LOGIC = new Set(['led', 'switch', 'counter', 'gate']);

/** What pointing from a to b would make (the relation is the same either way when the kinds differ). */
export function infer(a, b) {
  if (!a || !b || a.id === b.id) return null;
  // Nodes: to another node, an edge (a path between them); a lit-able node to a logic gate, one of its inputs; to a line, onto it.
  if (isNode(a) && isNode(b)) {
    if (b.play.node.kind === 'gate' && LOGIC.has(a.play.node.kind || 'note')) return { kind: 'input', from: a.id, to: b.id, label: `an input of ${refOf(b)}` };
    return { kind: 'edge', from: a.id, to: b.id, label: `an edge to ${refOf(b)}` };
  }
  if (isNode(a) && isLine(b)) return { kind: 'place', from: a.id, to: b.id, label: `on ${refOf(b)}` };
  const pair = (x, y) => {
    if ((isTrav(x) && isTrig(y)) || (isTrig(x) && isTrav(y))) { const t = isTrig(x) ? x : y, v = isTrig(x) ? y : x; return { kind: 'cue', from: t.id, to: v.id, label: `starts ${refOf(v)}` }; }
    if (isPointish(x) && isLine(y)) return { kind: 'travel', from: x.id, to: y.id, label: `travels ${refOf(y)}` };
    if (isTrav(x) && isLine(y)) return { kind: 'travel', from: x.id, to: y.id, label: `travels ${refOf(y)}` };
    if (isTrig(x) && isLine(y) && !isTrig(y)) return { kind: 'place', from: x.id, to: y.id, label: `on ${refOf(y)}` };
    return null;
  };
  const direct = pair(a, b) || pair(b, a);
  if (direct) return direct;
  if (nodeish(a) && nodeish(b)) return { kind: 'send', from: a.id, to: b.id, label: `sends to ${refOf(b)}` };
  if (a.role === 'plane' && isLine(b) && !isTrig(a)) return { kind: 'trigger', from: a.id, to: b.id, label: 'triggers' };
  return null;
}

const find = (d, id) => d.elements.find(x => x.id === id);
const setRealize = el => { const r = realizeAfter(el, el.play); if (r !== el.realize) el.realize = { ...r }; };
const withPlay = (el, fn) => { const play = structuredClone(el.play || {}); fn(play); if (Object.keys(play).length) el.play = play; else delete el.play; setRealize(el); };
const moveTo = (el, x, y) => { const [cx, cy] = centerOf(el); const dx = x - cx, dy = y - cy; el.points = el.points.map(q => [q[0] + dx, q[1] + dy, ...q.slice(2)]); };

/** A line's own angle at u, for a bar across it (perpendicular). */
export const barAngle = (line, u) => { const q = pointAt(outlineOf(line), u); return Math.round((Math.atan2(q[3], q[2]) * 180) / Math.PI + 90); };

export function travel(d, moverId, pathId) {
  const el = find(d, moverId), line = find(d, pathId);
  if (!el || !line || !isLine(line)) return false;
  withPlay(line, pl => { pl.path = pl.path || true; });
  withPlay(el, pl => {
    delete pl.body;
    pl.travel = { ...newPart('travel', { path: line.id }), ...(pl.travel || {}), on: line.id };
    delete pl.travel.cue; delete pl.travel.at;
    if (pl.travel.width > 0) pl.travel.angle = barAngle(line, 0);
  });
  if (el.role === 'point') { const q = pointAt(outlineOf(line), 0); el.points = [[q[0], q[1], el.points[0]?.[2] ?? 0, el.points[0]?.[3] ?? 0.5]]; }
  return true;
}

/** A mark made an event gets a sound to start with. */
const makeTrigger = el => withPlay(el, pl => { pl.trigger ||= { emit: emitFor(DEFAULTS.height) }; delete pl.body; delete pl.travel; });

export function trigger(d, id) { const el = find(d, id); if (!el) return false; makeTrigger(el); return true; }

export function send(d, fromId, toId, dur) {
  const a = find(d, fromId), b = find(d, toId);
  if (!a || !b) return false;
  makeTrigger(a); makeTrigger(b);
  withPlay(a, pl => {
    const list = [].concat(pl.trigger.to || []).map(r => (typeof r === 'string' ? { to: r } : r));
    const ref = refOf(b);
    if (!list.some(r => r.to === ref || r.to === b.id)) list.push(dur ? { to: ref, dur } : { to: ref });
    pl.trigger.to = list;
  });
  return true;
}

export function cue(d, triggerId, travelerId) {
  const t = find(d, triggerId), v = find(d, travelerId);
  if (!t || !v?.play?.travel) return false;
  makeTrigger(t);
  withPlay(v, pl => { pl.travel.cue = refOf(t); });
  return true;
}

export function place(d, markId, pathId) {
  const el = find(d, markId), line = find(d, pathId);
  if (!el || !line) return false;
  const [cx, cy] = centerOf(el);
  const hit = nearestOn(outlineOf(line), cx, cy);
  if (el.play?.trigger) return attachEvent(d, markId, pathId, hit.u);   // an event placed on a line stays on it
  moveTo(el, hit.x, hit.y);
  return true;
}

/** An event sits on a line at u (0..1): its middle is there, and stays there when the line changes. */
export function attachEvent(d, id, pathId, u) {
  const el = find(d, id), line = find(d, pathId);
  if (!el?.play?.trigger || !line || !isLine(line)) return false;
  const at = Math.max(0, Math.min(1, u));
  withPlay(el, pl => { pl.trigger = { ...pl.trigger, path: refOf(line), at: Math.round(at * 10000) / 10000 }; });
  withPlay(line, pl => { pl.path = pl.path || true; });
  const q = pointAt(outlineOf(line), at);
  moveTo(el, q[0], q[1]);
  return true;
}

/**
 * A traveler dropped on a line (maybe another one) begins there: it is on that line, and where it is *now* (at the
 * playhead `t`, in seconds) is u, so it carries on from where it was dropped.
 */
export function attachTraveler(d, id, pathId, u, t = 0, settings = null) {
  const el = find(d, id), line = find(d, pathId);
  if (!el?.play?.travel || !line || !isLine(line)) return false;
  withPlay(line, pl => { pl.path = pl.path || true; });
  withPlay(el, pl => { pl.travel = { ...pl.travel, on: line.id }; delete pl.travel.cue; delete pl.travel.at; });
  // Where it would be now without a phase: how far along its lap the playhead is (not clamped: a once-through traveler dropped
  // late is still where it was let go; its phase is negative).
  let here = 0;
  const tv = el.play.travel;
  if (t > 0 && settings) {
    const sec = pathTime(line, { ctx: timeContext(settings), beatUnits: settings.beatUnits, quant: settings.quant }).seconds;
    const dur = (typeof tv.dur === 'number' ? tv.dur : sec) / Math.max(0.001, tv.rate ?? 1);
    here = (t - (typeof tv.start === 'number' ? tv.start : 0)) / Math.max(0.001, dur);
  }
  return offset(d, id, u, u - here);
}

/** An attached event moves along its line. */
export function slideEvent(d, id, u) {
  const el = find(d, id), ref = el?.play?.trigger?.path;
  const line = ref && d.elements.find(x => x.id === ref || x.label === ref);
  return line ? attachEvent(d, id, line.id, u) : false;
}

/** Where along a line (0..1) a mark's middle is nearest. */
export function nearestU(d, id, pathId) {
  const el = find(d, id), line = find(d, pathId);
  if (!el || !line) return 0;
  const [cx, cy] = centerOf(el);
  return nearestOn(outlineOf(line), cx, cy).u;
}

/** A traveler or an event leaves its path (it stays where it is). */
export function detach(d, id) {
  const el = find(d, id);
  if (!el) return false;
  withPlay(el, pl => {
    if (pl.travel) { pl.travel = { ...pl.travel, on: '' }; delete pl.travel.at; }
    if (pl.trigger) { pl.trigger = { ...pl.trigger }; delete pl.trigger.path; delete pl.trigger.at; }
  });
  return true;
}

/** Attached events follow their lines: each is moved so its middle is at its place on the line. In place; returns how many moved. */
export function syncAttached(d) {
  let moved = 0;
  for (const e of d.elements) {
    const t = e.play?.trigger;
    if (!t?.path) continue;
    const line = d.elements.find(x => x.id === t.path || x.label === t.path);
    if (!line || !isLine(line)) continue;
    const q = pointAt(outlineOf(line), t.at ?? 0), [cx, cy] = centerOf(e);
    if (Math.abs(q[0] - cx) < 1e-6 && Math.abs(q[1] - cy) < 1e-6) continue;
    moveTo(e, q[0], q[1]);
    moved++;
  }
  return moved;
}

/** `phase` (default u): the traveler's `at`, which differs from u when the playhead is not at the start (see the Play tool). */
export function offset(d, travelerId, u, phase = u) {
  const el = find(d, travelerId);
  const line = el?.play?.travel && d.elements.find(x => x.id === el.play.travel.on || x.label === el.play.travel.on);
  if (!line) return false;
  const at = Math.max(0, Math.min(1, u));
  // The phase: how far along it is at time zero. A looping traveler's wraps round; a once-through one's does not (it may be
  // negative: it has been running a while by the time it was dropped; wrapping it would put it at the end of the line).
  const tv = el.play.travel, loops = tv.loop === 'loop' || (tv.loop === undefined && Boolean(line.closed));
  const ph = loops ? ((phase % 1) + 1) % 1 : phase;
  withPlay(el, pl => { if (Math.abs(ph) > 0.0005 && (!loops || ph < 0.9995)) pl.travel.at = Math.round(ph * 1000) / 1000; else delete pl.travel.at; });
  const q = pointAt(outlineOf(line), at);
  if (el.role === 'point') el.points = [[q[0], q[1], el.points[0]?.[2] ?? 0, el.points[0]?.[3] ?? 0.5]];
  return true;
}

/** The points of an edge from a to b: straight, across first ('horz'), or up or down first ('vert'). */
export function edgePoints(a, b, shape = 'line') {
  if (shape === 'line' || a[0] === b[0] || a[1] === b[1]) return [[a[0], a[1]], [b[0], b[1]]];
  return shape === 'vert' ? [[a[0], a[1]], [a[0], b[1]], [b[0], b[1]]] : [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]]];
}

/** A path drawn from node a to node b (a line that remembers its ends, so it follows them). Returns the new line. */
export function edge(d, fromId, toId, { shape } = {}) {
  const a = find(d, fromId), b = find(d, toId);
  if (!a || !b || a.id === b.id) return null;
  const sh = shape || a.play?.node?.shape || 'line';
  const line = normalizeElement({ role: 'line', points: edgePoints(centerOf(a), centerOf(b), sh).map(q => [q[0], q[1], 0, 0.5]), path: 'straight', play: { path: { edge: [refOf(a), refOf(b)], ...(sh !== 'line' ? { shape: sh } : {}) } } }, a.stage);
  if (a.board) line.board = a.board;
  setRealize(line);
  d.elements.push(line);
  return line;
}

/** The node is one of the gate's inputs. */
export function input(d, nodeId, gateId) {
  const n = find(d, nodeId), g = find(d, gateId);
  if (!n || !g?.play?.node) return false;
  withPlay(g, pl => { const list = [].concat(pl.node.inputs || []); const ref = refOf(n); if (!list.includes(ref) && !list.includes(n.id)) list.push(ref); pl.node.inputs = list; });
  return true;
}

/** Edges follow their nodes: each line with `path.edge` is redrawn from its nodes' middles. In place; returns how many changed. */
export function syncEdges(d) {
  let changed = 0;
  const byRef = new Map();
  for (const e of d.elements) { byRef.set(e.id, e); for (const k of [e.label, e.play?.node?.name]) if (k && !byRef.has(k)) byRef.set(k, e); }
  for (const e of d.elements) {
    const ed = e.play?.path?.edge;
    if (!Array.isArray(ed)) continue;
    const a = byRef.get(ed[0]), b = byRef.get(ed[1]);
    if (!a || !b) continue;
    // A shaped edge is redrawn; one drawn by hand (more than two points, no shape) keeps its middle and moves its ends.
    const ca = centerOf(a), cb = centerOf(b);
    const pts = !e.play.path.shape && e.points.length > 2 ? [ca, ...e.points.slice(1, -1), cb] : edgePoints(ca, cb, e.play.path.shape || 'line');
    if (pts.length === e.points.length && pts.every((q, i) => Math.abs(q[0] - e.points[i][0]) < 1e-6 && Math.abs(q[1] - e.points[i][1]) < 1e-6)) continue;
    e.points = pts.map((q, i) => [q[0], q[1], e.points[i]?.[2] ?? 0, e.points[i]?.[3] ?? 0.5]);
    changed++;
  }
  return changed;
}

/** Apply what infer says. */
export function apply(d, rel) {
  if (!rel) return false;
  if (rel.kind === 'edge') return Boolean(edge(d, rel.from, rel.to));
  if (rel.kind === 'input') return input(d, rel.from, rel.to);
  if (rel.kind === 'travel') return travel(d, rel.from, rel.to);
  if (rel.kind === 'send') return send(d, rel.from, rel.to);
  if (rel.kind === 'cue') return cue(d, rel.from, rel.to);
  if (rel.kind === 'place') return place(d, rel.from, rel.to);
  if (rel.kind === 'trigger') return trigger(d, rel.from);
  return false;
}

export { canBePath };

/** The middle of a mark, as [x, y]. */
export const centerPoint = centerOf;
