/**
 * From marks to a world definition. A mark plays when it carries `play`:
 *
 *   play: {
 *     path:    true | 'name',                         a line that can be travelled (by its mark id, or by the name)
 *     travel:  { on: id, dur | speed, start, rate, loop, as, tag },   a point that travels line `on`
 *     body:    { v: [vx, vy] | speed: n | [min, max], angle, r, emit, tag },   a point that moves by itself, bounces, collides
 *     trigger: { on, gate, lockout, policy, filter, r, emit, emitExit, name, start, dir, to },   a plane, circle, line or point
 *     node:    { kind, mode, start, to, … }   a node of a Midinous-style graph on the paths (see nodes.js)
 *              dir: -1 | 1 limits a crossing to one way; to: [ref | { to, dur }] sends a traveler on to those triggers (a route)
 *     travel:  also { at: 0..1 (begins that far along), cue: a trigger that starts it (it waits until the trigger fires) }
 *              name: how others reach it (arrive, a traveler's data.to); start: a time at which a signal arrives from nowhere
 *   }
 *
 * `emit` is code: an expression (or statements) run on each event the trigger (or, in `travel`, the
 * traveler: its 'end') hears. The event's fields (t, type, x, y, nx, ny, u, speed, p, dir, tag, …)
 * and the helpers (music.js: note, cc, map, snap, launch, state…) are in scope, and so is `api`.
 * Notes held with 'gate' end when the trigger is left; `emitExit` runs then as well, if given.
 * Handlers can also be passed by name in `handlers`, for code that is not a string.
 *
 * Times (start, dur, gate, lockout) are seconds or times ('2 beats', '1 bar', '500ms') read with
 * the scene's tempo (`ctx`).
 *
 * Lines and planes are followed and covered along their drawn (smooth) curve, not their control points,
 * unless the mark is path: 'straight'.
 *
 * Coordinates are the board's own (boardDoc), so a score does not depend on where its board sits.
 */
import { boardDoc, MAIN } from '../process/boards.js';
import { outlineOf as outline, centerOf, lengthBy, nearestOn } from './geometry.js';
import { makeNodeHandler, normalizeNode, isLit } from './nodes.js';
import { FIELDS, HELPER_NAMES } from './music.js';
import { resolveTimeValue } from '../time/timeValue.js';
import { DEFAULT_TRANSPORT, timeContext } from '../time/sceneTransport.js';

const xy = pts => pts.map(q => [q[0], q[1]]);


/** A small seeded random stream per body, so a score's gas is the same every run. */
function rngFor(seed, n) {
  let a = (Math.imul((seed >>> 0) + 1, 2654435761) ^ Math.imul(n + 1, 40503)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Handler code from source text: (helpers, event, api) => result. Throws on a syntax error, so a bad score fails when compiled. */
export function compileEmit(src, names = HELPER_NAMES) {
  const head = `const { ${names.join(', ')} } = h;\n`;
  const make = body => new Function('h', 'api', ...FIELDS, head + body);   // eslint-disable-line no-new-func
  let fn;
  try { fn = make(`return (${src});`); } catch { fn = make(src); }   // an expression, else statements (a syntax error throws here)
  return (h, e, api) => fn(h, api, ...FIELDS.map(f => e[f]));
}

/**
 * How long a path takes: its length read as time. By default a length in the grid: one beat for each
 * `beatUnits` of it (so a line four minor grid cells long is a bar of 4/4). A path can say otherwise:
 *   play: { path: { len: '1 bar' } }             a time
 *   play: { path: { len: 'grid', metric } }      by the grid, measured 'arc' (along it), 'x', 'y' or 'manhattan'
 *   play: { path: { len: 'speed', speed: 50 } }  units a second
 *   play: { path: { len: 'drawn' } }             as long as it took to draw (when the points are timed)
 *   play: { path: { loop: true } }               travelers on it loop (default: when the line is closed); a traveler's own `loop` wins
 *   play: { path: { quant: '1 beat' } }          rounded to a division ('1 bar', '0.5 beat', '1 s'; 'off' for none; else the scene's)
 * A traveler that does not say how long it takes runs its path in this time (times its range and ratio).
 */
export function pathTime(e, { ctx = timeContext(DEFAULT_TRANSPORT), beatUnits = DEFAULT_TRANSPORT.beatUnits, quant = '' } = {}) {
  const spec = e.play?.path && typeof e.play.path === 'object' ? e.play.path : {};
  const pts0 = outline(e), pts = e.closed && pts0.length > 2 ? [...pts0, pts0[0]] : pts0;   // (a closed line is travelled all the way round)
  const beatSeconds = resolveTimeValue('1 beat', ctx);
  const units = lengthBy(pts, spec.metric || 'arc');
  const len = spec.len;
  let seconds, mode = 'grid';
  if (len === 'speed' && spec.speed > 0) { seconds = lengthBy(pts, 'arc') / spec.speed; mode = 'speed'; }
  else if (len === 'drawn' && (e.points.at(-1)?.[2] ?? 0) > (e.points[0]?.[2] ?? 0)) { seconds = (e.points.at(-1)[2] - e.points[0][2]) / 1000; mode = 'drawn'; }
  else if (len != null && len !== 'grid' && len !== 'drawn' && len !== 'speed') { seconds = typeof len === 'number' ? len : resolveTimeValue(String(len), ctx); mode = 'time'; }
  else seconds = (units / Math.max(0.001, beatUnits)) * beatSeconds;
  // Rounded to a division (the path's own `quant`, else the scene's; 'off' leaves it): not for a time written out, which is exact.
  const q = spec.quant != null ? spec.quant : quant;
  if (mode !== 'time' && q && q !== 'off') {
    const quantum = typeof q === 'number' ? q : resolveTimeValue(String(q), ctx);
    if (quantum > 0.001) seconds = Math.max(quantum, Math.round(seconds / quantum) * quantum);
  }
  return { seconds: Math.max(0.001, seconds), beats: Math.max(0.001, seconds) / beatSeconds, units, mode };
}

/** The name a trigger is reached by: its `name`, else the mark's label, else its id. */
export const triggerIdOf = e => e.play?.trigger?.name || e.play?.node?.name || e.label || e.id;

export function compileDoc(doc, { board = MAIN, helpers = {}, handlers = {}, seed = 1, ctx = timeContext(DEFAULT_TRANSPORT), beatUnits = DEFAULT_TRANSPORT.beatUnits, quant = '' } = {}) {
  const d = boardDoc(doc, board);
  const marks = d.elements.filter(e => e.play && e.points?.length);
  const paths = {}, travelers = [], triggers = [], starts = [], bodies = [];
  const info = { skipped: [], paths: [] };
  const make = typeof helpers === 'function' ? helpers : () => helpers;
  const names = typeof helpers === 'function' ? HELPER_NAMES : Object.keys(helpers);
  const secs = v => (typeof v === 'number' || v == null ? v : resolveTimeValue(String(v), ctx));
  const wrap = (src, srcExit) => {
    const run = src ? compileEmit(src, names) : null;
    const runExit = srcExit ? compileEmit(srcExit, names) : null;
    return (e, api) => {
      const h = make(e, api);
      if (e.type === 'exit') { h.release?.(); if (runExit) runExit(h, e, api); } else if (run) run(h, e, api);
    };
  };

  // A path is known by its mark id, its label (the mark's name), or the name given as `path: 'name'`
  // (names survive a mark being remade; ids do not).
  const pathKey = new Map();
  const pathTimes = new Map();   // path key → the seconds it takes
  const pathLoops = new Map();   // path key → whether travelers on it loop (unless they say): `path.loop`, else the path is closed
  const pathWeights = new Map(); // path key → its `weight` (how likely a random node sends down it)
  const wanted = new Set(marks.map(m => m.play.travel?.on).filter(Boolean));
  for (const e of d.elements) {
    const named = typeof e.play?.path === 'string' && e.play.path ? e.play.path : e.play?.path?.name || null;
    if (!e.play?.path && !wanted.has(e.id) && !(e.label && wanted.has(e.label))) continue;
    const key = named || e.id;
    pathKey.set(e.id, key);
    if (e.label && !pathKey.has(e.label)) pathKey.set(e.label, key);
    paths[key] = { points: outline(e), closed: Boolean(e.closed) };
    const time = pathTime(e, { ctx, beatUnits, quant });
    pathTimes.set(key, time.seconds);
    const pl = e.play?.path && typeof e.play.path === 'object' ? e.play.path.loop : undefined;
    pathLoops.set(key, pl === undefined ? Boolean(e.closed) : Boolean(pl));
    if (e.play?.path?.weight != null) pathWeights.set(key, Number(e.play.path.weight));
    info.paths.push({ id: e.id, key, ...time });
  }

  // Triggers are reached by their name, label or id: from routes (`to`) and cues (`cue`).
  const triggerId = triggerIdOf;
  const trigKey = new Map();
  for (const e of marks) if (e.play.trigger || e.play.node) { trigKey.set(e.id, triggerId(e)); if (e.label && !trigKey.has(e.label)) trigKey.set(e.label, triggerId(e)); }
  const cues = new Map();   // trigger id → travelers it starts: [{ path, opts }]
  const pending = [];       // triggers whose handlers are finished once everything is known

  for (const e of marks) {
    const { travel, trigger, body } = e.play;
    if (body && travel) info.skipped.push(`${e.label || e.id}: a mark travels a path or moves by itself, not both (it travels)`);
    if (body && !travel) {
      // A mover with a velocity: `v: [vx, vy]`, or `speed` (a number or [min, max]) and `angle` (degrees; omitted: any way, by the seed).
      const rnd = rngFor(seed, bodies.length);
      const pick = v => (Array.isArray(v) ? v[0] + rnd() * (v[1] - v[0]) : v);
      let vx = body.v?.[0], vy = body.v?.[1];
      if (vx === undefined) {
        const sp = pick(body.speed ?? 100), an = body.angle !== undefined ? pick(body.angle) * Math.PI / 180 : rnd() * Math.PI * 2;
        vx = Math.cos(an) * sp; vy = Math.sin(an) * sp;
      }
      bodies.push({ id: e.id, x: e.points[0][0], y: e.points[0][1], vx, vy, r: body.r ?? Math.max(2, (e.realize?.params?.size || 12) / 2), tag: body.tag ?? e.tag ?? null, data: body.data, handle: body.emit ? wrap(body.emit) : null });
    }
    if (travel) {
      const on = pathKey.get(travel.on) ?? travel.on;
      if (!paths[on]) info.skipped.push(`${e.label || e.id}: no path "${travel.on}"`);
      else {
        const { emit, cue, angle, ratio, ...t } = travel;
        // How long a lap takes: what it says, else its path's time (a fraction of it for a range), times its ratio.
        const span = Array.isArray(t.range) ? Math.max(0.001, Math.abs(t.range[1] - t.range[0])) : 1;
        const dur = secs(t.dur) ?? (t.speed > 0 ? undefined : pathTimes.get(on) * span * (ratio > 0 ? ratio : 1));
        const spec = { ...t, on, start: secs(t.start), dur, tag: t.tag ?? e.tag ?? null, loop: t.loop ?? (pathLoops.get(on) ? 'loop' : 'once') };
        if (cue) {
          // Started by a trigger: it waits, and each time the trigger fires it begins again.
          const tk = trigKey.get(cue);
          if (!tk) info.skipped.push(`${e.label || e.id}: no trigger "${cue}" to start it`);
          else (cues.get(tk) || cues.set(tk, []).get(tk)).push(spec);
        } else travelers.push({ id: e.id, ...spec, handle: emit ? wrap(emit) : handlers[t.handler] || null });
      }
    }
    if (trigger) {
      const pts = xy(outline(e));
      let region;
      if (e.role === 'point' || pts.length === 1) region = { kind: 'circle', x: e.points[0][0], y: e.points[0][1], r: trigger.r ?? Math.max(3, (e.realize?.params?.size || 16) / 2) };
      else if (e.closed || e.role === 'plane') region = { kind: 'polygon', pts };
      else region = { kind: 'line', pts };
      const base = typeof trigger.emit === 'string' || trigger.emitExit ? wrap(trigger.emit, trigger.emitExit) : handlers[trigger.handler] || null;
      const { emit, emitExit, handler, r, name, start, to, dir, ...opts } = trigger;
      const id = triggerId(e);
      // Routes: when it fires, a traveler goes to each trigger it sends to and arrives there.
      const routes = [];
      for (const rel of [].concat(to || [])) {
        const spec = typeof rel === 'string' ? { to: rel } : rel;
        const target = d.elements.find(x => x.id === spec.to || x.label === spec.to);
        const tk = target && trigKey.get(target.id);
        if (!tk) { info.skipped.push(`${e.label || e.id}: no trigger "${spec.to}" to send to`); continue; }
        const key = `route:${id}->${tk}:${routes.length}`;
        paths[key] = { points: [centerOf(e), centerOf(target)], closed: false };
        routes.push({ key, dur: secs(spec.dur ?? '1 beat'), to: tk });
      }
      const obj = { id, region, ...opts, gate: secs(opts.gate), lockout: secs(opts.lockout), handle: base };
      triggers.push(obj);
      pending.push({ obj, base, routes, dir });
      if (start !== undefined && start !== false) starts.push({ trigger: id, t: start === true ? 0 : secs(start), data: {} });
    }
  }

  // Nodes (nodes.js): a trigger whose handler is its kind's, with the ways out that the paths around it make.
  const beat = resolveTimeValue('1 beat', ctx);
  const nodeMarks = marks.filter(e => e.play.node && !e.play.trigger);
  const realPaths = Object.keys(paths).filter(k => !k.startsWith('route:'));
  const nodeInfo = new Map();   // node id → { e, n, c, r, state }
  for (const e of nodeMarks) {
    const n = normalizeNode(e.play.node), c = centerOf(e);
    const r = e.play.node.r ?? Math.max(4, (e.realize?.params?.size || 14) / 2);
    nodeInfo.set(triggerId(e), { e, n, c, r, state: {} });
  }
  const nodeAt = (x, y) => {   // the node a place is on (the nearest, within its radius)
    let best = null, bd = Infinity;
    for (const [id, ni] of nodeInfo) { const dd = Math.hypot(ni.c[0] - x, ni.c[1] - y); if (dd <= ni.r + 1 && dd < bd) { best = id; bd = dd; } }
    return best;
  };
  const pathEnd = new Map(realPaths.map(k => { const pts = paths[k].points, q = pts[pts.length - 1]; return [k, paths[k].closed ? null : nodeAt(q[0], q[1])]; }));
  const closedPaths = new Set(realPaths.filter(k => paths[k].closed));
  const ccLast = new Map();
  for (const [id, ni] of nodeInfo) {
    const { e, n, c, r } = ni;
    const onPath = new Map(), outs = [], extra = [];
    for (const k of realPaths) {
      const hit = nearestOn(paths[k].points, c[0], c[1]);
      if (!hit || hit.d > r + 1) continue;
      onPath.set(k, hit.u);
      if (hit.u < 0.995 || paths[k].closed) outs.push({ key: k, u: hit.u >= 0.995 ? 0 : hit.u, seconds: pathTimes.get(k) ?? 1, end: pathEnd.get(k) ?? null, weight: pathWeights.get(k) ?? nodeInfo.get(pathEnd.get(k))?.n.weight ?? 100 });
    }
    for (const ref of n.to) {
      const target = d.elements.find(x => x.id === ref || x.label === ref || x.play?.node?.name === ref);
      const pk = target && pathKey.get(target.id);
      if (pk && paths[pk]) {
        const hit = nearestOn(paths[pk].points, c[0], c[1]);
        const u = hit && hit.d <= r + 1 ? hit.u : 0;
        extra.push({ path: { key: pk, u, seconds: pathTimes.get(pk) ?? 1 }, end: pathEnd.get(pk) ?? null, weight: nodeInfo.get(pathEnd.get(pk))?.n.weight ?? 100 });
        continue;
      }
      const tk = target && trigKey.get(target.id);
      if (!tk) { info.skipped.push(`${e.label || e.id}: nothing called "${ref}" to send to`); continue; }
      const tc = centerOf(target), key = `route:${id}->${tk}:${extra.length}`;
      paths[key] = { points: [c, tc], closed: false };
      const cells = (Math.abs(tc[0] - c[0]) + Math.abs(tc[1] - c[1])) / Math.max(0.001, beatUnits);
      extra.push({ node: tk, route: { key, dur: Math.max(0.01, cells * beat) }, weight: nodeInfo.get(tk)?.n.weight ?? 100 });
    }
    const pts = xy(outline(e));
    const region = e.role === 'point' || pts.length === 1 ? { kind: 'circle', x: c[0], y: c[1], r, center: true }   // (touched when a traveler passes its centre, like a Midinous node)
      : e.closed || e.role === 'plane' ? { kind: 'polygon', pts } : { kind: 'line', pts };
    const handler = makeNodeHandler(n, {
      beat, onPath, outs, extra, closed: closedPaths, scene: {}, ccLast,
      lit: (ref, t) => { const k = trigKey.get(ref) ?? ref, o = nodeInfo.get(k); return o ? isLit(o.n.kind, o.n, o.state, t) : false; }
    });
    triggers.push({ id, region, policy: 'pair', on: region.kind === 'line' ? ['cross'] : ['enter'], state: ni.state, meta: { node: n.kind, count: n.count, hold: n.hold, on: n.on }, handle: (ev, api) => handler(ev, api, make(ev, api)) });
    if (n.start !== false && n.start !== undefined && n.start !== null) starts.push({ trigger: id, t: n.start === true ? 0 : secs(n.start), data: {} });
  }

  // Handlers: the sound, then what it sends on and starts. A crossing can be limited to one direction.
  for (const { obj, base, routes, dir } of pending) {
    const cued = cues.get(obj.id) || [];
    if (!base && !routes.length && !cued.length && !dir) continue;
    obj.handle = (e, api) => {
      if (dir && e.type === 'cross' && e.dir !== dir) return;
      base?.(e, api);
      if (e.type === 'exit') return;
      for (const r of routes) api.launch(r.key, { dur: r.dur, data: { to: r.to } });
      cued.forEach((c, i) => {
        const prev = api.state._cued?.[i];
        if (prev) api.kill(prev);
        const { on, ...o } = c;
        (api.state._cued ||= [])[i] = api.launch(on, o);
      });
    };
  }

  return { def: { paths, travelers, triggers, starts, bodies, bounds: { x: 0, y: 0, width: d.artboard.width, height: d.artboard.height }, seed }, info };
}
