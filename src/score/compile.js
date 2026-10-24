/**
 * From marks to a world definition. A mark plays when it carries `play`:
 *
 *   play: {
 *     path:    true | 'name',                         a line that can be travelled (by its mark id, or by the name)
 *     travel:  { on: id, dur | speed, start, rate, loop, as, tag },   a point that travels line `on`
 *     body:    { v: [vx, vy] | speed: n | [min, max], angle, r, emit, tag },   a point that moves by itself, bounces, collides
 *     trigger: { on, gate, lockout, policy, filter, r, emit, name, start },   a plane, circle, line or point
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
import { smoothPath } from '../process/walk.js';
import { FIELDS, HELPER_NAMES } from './music.js';
import { resolveTimeValue } from '../time/timeValue.js';
import { DEFAULT_TRANSPORT, timeContext } from '../time/sceneTransport.js';

const xy = pts => pts.map(q => [q[0], q[1]]);

/**
 * The curve a mark is drawn along: its points joined by the smooth path the renderer uses (Catmull-Rom),
 * or straight when the mark says path: 'straight'. Travelers follow it and triggers cover it, so what is
 * seen is what plays.
 */
const outline = e => (e.path === 'straight' ? e.points : smoothPath(e.points, e.closed));

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

  // A path is known by its mark id, or by the name given as `path: 'name'` (names survive a mark being remade).
  const pathKey = new Map();
  for (const e of d.elements) {
    if (!e.play?.path && !marks.some(m => m.play.travel?.on === e.id)) continue;
    const key = typeof e.play?.path === 'string' && e.play.path ? e.play.path : e.id;
    pathKey.set(e.id, key);
    paths[key] = { points: outline(e), closed: Boolean(e.closed) };
  }

  for (const e of marks) {
    const { travel, trigger, body } = e.play;
    if (body) {
      // A mover with a velocity: `v: [vx, vy]`, or `speed` (a number or [min, max]) and `angle` (degrees; omitted: any way, by the seed).
      const rnd = rngFor(seed, bodies.length);
      const pick = v => (Array.isArray(v) ? v[0] + rnd() * (v[1] - v[0]) : v);
      let vx = body.v?.[0], vy = body.v?.[1];
      if (vx === undefined) {
        const sp = pick(body.speed ?? 100), an = body.angle !== undefined ? pick(body.angle) * Math.PI / 180 : rnd() * Math.PI * 2;
        vx = Math.cos(an) * sp; vy = Math.sin(an) * sp;
      }
      bodies.push({ id: e.id, x: e.points[0][0], y: e.points[0][1], vx, vy, r: body.r ?? Math.max(2, (e.size || 12) / 2), tag: body.tag ?? e.tag ?? null, data: body.data, handle: body.emit ? wrap(body.emit) : null });
    }
    if (travel) {
      const on = pathKey.get(travel.on) ?? travel.on;
      if (!paths[on]) info.skipped.push(`${e.id}: no path "${travel.on}"`);
      else {
        const { emit, ...t } = travel;
        travelers.push({ id: e.id, ...t, on, start: secs(t.start), dur: secs(t.dur), tag: t.tag ?? e.tag ?? null, handle: emit ? wrap(emit) : handlers[t.handler] || null });
      }
    }
    if (trigger) {
      const pts = xy(outline(e));
      let region;
      if (e.role === 'point' || pts.length === 1) region = { kind: 'circle', x: e.points[0][0], y: e.points[0][1], r: trigger.r ?? 8 };
      else if (e.closed || e.role === 'plane') region = { kind: 'polygon', pts };
      else region = { kind: 'line', pts };
      const handle = typeof trigger.emit === 'string' || trigger.emitExit ? wrap(trigger.emit, trigger.emitExit) : handlers[trigger.handler] || null;
      const { emit, emitExit, handler, r, name, start, ...opts } = trigger;
      const id = name || e.id;
      triggers.push({ id, region, ...opts, gate: secs(opts.gate), lockout: secs(opts.lockout), handle });
      if (start !== undefined && start !== false) starts.push({ trigger: id, t: start === true ? 0 : secs(start), data: {} });
    }
  }

  return { def: { paths, travelers, triggers, starts, bodies, bounds: { x: 0, y: 0, width: d.artboard.width, height: d.artboard.height }, seed }, info };
}
