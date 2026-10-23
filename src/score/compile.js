/**
 * From marks to a world definition. A mark plays when it carries `play`:
 *
 *   play: {
 *     path:    true | 'name',                         a line that can be travelled (by its mark id, or by the name)
 *     travel:  { on: id, dur | speed, start, rate, loop, as, tag },   a point that travels line `on`
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
 * Coordinates are the board's own (boardDoc), so a score does not depend on where its board sits.
 */
import { boardDoc, MAIN } from '../process/boards.js';
import { FIELDS, HELPER_NAMES } from './music.js';
import { resolveTimeValue } from '../time/timeValue.js';
import { DEFAULT_TRANSPORT, timeContext } from '../time/sceneTransport.js';

const xy = pts => pts.map(q => [q[0], q[1]]);

/** Handler code from source text: (helpers, event, api) => result. Throws on a syntax error, so a bad score fails when compiled. */
export function compileEmit(src, names = HELPER_NAMES) {
  const body = /\breturn\b|;|\n/.test(src) ? src : `return (${src})`;
  // eslint-disable-next-line no-new-func
  const fn = new Function('h', 'api', ...FIELDS, `const { ${names.join(', ')} } = h;\n${body}`);
  return (h, e, api) => fn(h, api, ...FIELDS.map(f => e[f]));
}

export function compileDoc(doc, { board = MAIN, helpers = {}, handlers = {}, seed = 1, ctx = timeContext(DEFAULT_TRANSPORT) } = {}) {
  const d = boardDoc(doc, board);
  const marks = d.elements.filter(e => e.play && e.points?.length);
  const paths = {}, travelers = [], triggers = [], starts = [];
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
    paths[key] = { points: e.points, closed: Boolean(e.closed) };
  }

  for (const e of marks) {
    const { travel, trigger } = e.play;
    if (travel) {
      const on = pathKey.get(travel.on) ?? travel.on;
      if (!paths[on]) info.skipped.push(`${e.id}: no path "${travel.on}"`);
      else {
        const { emit, ...t } = travel;
        travelers.push({ id: e.id, ...t, on, start: secs(t.start), dur: secs(t.dur), tag: t.tag ?? e.tag ?? null, handle: emit ? wrap(emit) : handlers[t.handler] || null });
      }
    }
    if (trigger) {
      const pts = xy(e.points);
      let region;
      if (e.role === 'point' || pts.length === 1) region = { kind: 'circle', x: pts[0][0], y: pts[0][1], r: trigger.r ?? 8 };
      else if (e.closed || e.role === 'plane') region = { kind: 'polygon', pts };
      else region = { kind: 'line', pts };
      const handle = typeof trigger.emit === 'string' || trigger.emitExit ? wrap(trigger.emit, trigger.emitExit) : handlers[trigger.handler] || null;
      const { emit, emitExit, handler, r, name, start, ...opts } = trigger;
      const id = name || e.id;
      triggers.push({ id, region, ...opts, gate: secs(opts.gate), lockout: secs(opts.lockout), handle });
      if (start !== undefined && start !== false) starts.push({ trigger: id, t: start === true ? 0 : secs(start), data: {} });
    }
  }

  return { def: { paths, travelers, triggers, starts, bounds: { x: 0, y: 0, width: d.artboard.width, height: d.artboard.height }, seed }, info };
}
