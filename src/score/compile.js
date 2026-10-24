/**
 * From marks to a world definition. A mark plays when it carries `play`:
 *
 *   play: {
 *     path:    true | 'name',                         a line that can be travelled (by its mark id, or by the name)
 *     travel:  { on: id, dur | speed, start, rate, loop, as, tag },   a point that travels line `on`
 *     body:    { v: [vx, vy] | speed: n | [min, max], angle, r, emit, tag },   a point that moves by itself, bounces, collides
 *     trigger: { on, gate, lockout, policy, filter, r, emit, emitExit, name, start, dir, to },   a plane, circle, line or point
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
import { outlineOf as outline, centerOf } from './geometry.js';
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

export function compileDoc(doc, { board = MAIN, helpers = {}, handlers = {}, seed = 1, ctx = timeContext(DEFAULT_TRANSPORT) } = {}) {
  const d = boardDoc(doc, board);
  const marks = d.elements.filter(e => e.play && e.points?.length);
  const paths = {}, travelers = [], triggers = [], starts = [], bodies = [];
  const info = { skipped: [] };
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
  const wanted = new Set(marks.map(m => m.play.travel?.on).filter(Boolean));
  for (const e of d.elements) {
    const named = typeof e.play?.path === 'string' && e.play.path ? e.play.path : null;
    if (!e.play?.path && !wanted.has(e.id) && !(e.label && wanted.has(e.label))) continue;
    const key = named || e.id;
    pathKey.set(e.id, key);
    if (e.label && !pathKey.has(e.label)) pathKey.set(e.label, key);
    paths[key] = { points: outline(e), closed: Boolean(e.closed) };
  }

  // Triggers are reached by their name, label or id: from routes (`to`) and cues (`cue`).
  const triggerId = e => e.play.trigger.name || e.label || e.id;
  const trigKey = new Map();
  for (const e of marks) if (e.play.trigger) { trigKey.set(e.id, triggerId(e)); if (e.label && !trigKey.has(e.label)) trigKey.set(e.label, triggerId(e)); }
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
        const { emit, cue, angle, ...t } = travel;
        const spec = { ...t, on, start: secs(t.start), dur: secs(t.dur), tag: t.tag ?? e.tag ?? null };
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
