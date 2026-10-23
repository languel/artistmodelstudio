/**
 * From marks to a world definition. A mark plays when it carries `play`:
 *
 *   play: {
 *     path:    true,                                  a line that can be travelled
 *     travel:  { on: id, dur | speed, start, rate, loop, as, tag },   a point that travels line `on`
 *     trigger: { on, gate, lockout, policy, filter, r, emit },        a plane, circle, line or point
 *   }
 *
 * `emit` is code: an expression (or statements) run on each event the trigger accepts. The event's
 * fields (t, type, x, y, nx, ny, u, speed, p, dir, tag) and the helper names given in `helpers`
 * are in scope, and so is `api` (launch, kill, state, rng). Handlers can also be passed by name in
 * `handlers`, for code that is not a string.
 *
 * Coordinates are the board's own (boardDoc), so a score does not depend on where its board sits.
 */
import { boardDoc, MAIN } from '../process/boards.js';

const xy = pts => pts.map(q => [q[0], q[1]]);

/** Handler from source text. Throws on a syntax error, so a bad score fails when compiled. */
export function compileEmit(src, helpers = {}) {
  const names = Object.keys(helpers);
  const fields = ['t', 'type', 'x', 'y', 'nx', 'ny', 'u', 'speed', 'p', 'dir', 'tag', 'traveler', 'trigger'];
  // eslint-disable-next-line no-new-func
  const fn = new Function(...names, 'api', ...fields, `${/\breturn\b|;|\n/.test(src) ? src : `return (${src})`}`);
  return (e, api) => fn(...names.map(n => helpers[n]), api, ...fields.map(f => e[f]));
}

export function compileDoc(doc, { board = MAIN, helpers = {}, handlers = {}, seed = 1 } = {}) {
  const d = boardDoc(doc, board);
  const marks = d.elements.filter(e => e.play && e.points?.length);
  const paths = {}, travelers = [], triggers = [];
  const info = { skipped: [] };

  for (const e of d.elements) {
    if (!e.play?.path && !marks.some(m => m.play.travel?.on === e.id)) continue;
    paths[e.id] = { points: e.points, closed: Boolean(e.closed) };
  }

  for (const e of marks) {
    const { travel, trigger } = e.play;
    if (travel) {
      if (!paths[travel.on]) info.skipped.push(`${e.id}: no path "${travel.on}"`);
      else travelers.push({ id: e.id, ...travel, tag: travel.tag ?? e.tag ?? null });
    }
    if (trigger) {
      const pts = xy(e.points);
      let region;
      if (e.role === 'point' || pts.length === 1) region = { kind: 'circle', x: pts[0][0], y: pts[0][1], r: trigger.r ?? 8 };
      else if (e.closed || e.role === 'plane') region = { kind: 'polygon', pts };
      else region = { kind: 'line', pts };
      const handle = typeof trigger.emit === 'string'
        ? (compileEmit(trigger.emit, helpers))
        : handlers[trigger.handler] || null;
      const { emit, handler, r, ...opts } = trigger;
      triggers.push({ id: e.id, region, ...opts, handle });
    }
  }

  return { def: { paths, travelers, triggers, bounds: { x: 0, y: 0, width: d.artboard.width, height: d.artboard.height }, seed }, info };
}
