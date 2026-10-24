/**
 * The world: travelers, triggers, and the events between them. Pure and deterministic: the same
 * definition and the same steps give the same events, whenever and wherever they run.
 *
 *   const w = createWorld({ paths, travelers, triggers, bounds, seed })
 *   w.step(t)            advance the clock to t (seconds); events with time <= t are made
 *   w.take()             the events made since the last take, in time order
 *   w.launch(pathId, o)  start a traveler now (also available to handlers as api.launch)
 *
 * Definition (all plain data except the handlers):
 *   paths:     { id: { points: [[x, y, t?, p?], …], closed? } }
 *   travelers: [{ id, on: pathId, start, dur | speed, rate, loop, tag, as: 'drawn', state, handle, die }]
 *              or a free one: { id, pos: t => ({ x, y }), start, tag, state, handle }
 *   triggers:  [{ id, region, on, gate, lockout, policy, filter, state, handle }]
 *   bounds:    { x, y, width, height }: the frame that nx, ny (0..1, y up) are measured in
 *
 * Detection is swept (see regions.js), so a fast traveler cannot jump over a thin trigger, and
 * event times are exact inside a step. A loop wrap is a jump, not a sweep.
 *
 * Trigger options:
 *   on       which events reach the handler: 'enter', 'exit', 'cross' (a line trigger). Default: the
 *            kinds its region can make.
 *   policy   'latched' (default): one voice per trigger, however many travelers are inside; it
 *            opens on the first entry and closes when the last has left.
 *            'pair': each traveler has its own voice.   'every': every entry and exit is an event.
 *   gate     seconds an opened trigger stays open at least: the exit is delayed to openT + gate.
 *   lockout  seconds after an opening before it can open again.
 *   filter   a tag ('bass') or a function (traveler) => boolean: which travelers it listens to.
 *
 * A handler is (event, api) => void. api = { launch(pathId, opts), kill(id), state, rng(), t }.
 * `state` is the trigger's (or, for a traveler's own handler, the traveler's) object, kept between
 * events. A traveler's handler hears 'end' (it finished a lap).
 *
 * Bodies (a gas, bouncing balls): points with a velocity and a radius that move by themselves, bounce off
 * the frame and each other (elastic), and touch triggers like any traveler. bodies: [{ id, x, y, vx, vy,
 * r, tag, data, handle, life }]. They run on a fixed step (1/120 s) so a run is the same every time; a
 * seek replays the motion silently from the start. A body's handler hears 'collide' ({ other }).
 * api.spawn({ x, y, vx, vy, r, tag, data, handle, life }) makes one; api.effect({ … }) asks for something
 * outside the world (the caller decides; the studio makes marks), collected by takeEffects().
 *
 * Event: { t, type: 'enter' | 'exit' | 'cross' | 'end' | 'arrive' | 'collide', traveler, trigger, tag, x, y, nx, ny,
 *          u, speed, p, dir, data, other }
 *   u: where along its path (0..1); speed: world units a second; p: the pressure of the path there.
 */
import { makePath, sample, sampleDrawn, drawnDuration } from './paths.js';
import { localTime, lapEnds } from './travel.js';
import { prepare, overlaps } from './regions.js';

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWorld(def = {}) {
  const w = {
    now: 0, cur: 0, seq: 0, queue: [], events: [], travelers: [], triggers: [],
    paths: new Map(), max: def.maxTravelers ?? 256, live: 0, bodies: [], effects: [], simT: 0, silent: false,
    bounds: { x: 0, y: 0, width: 1, height: 1, ...(def.bounds || {}) },
    rng: mulberry32(def.seed ?? 1), auto: 0
  };

  for (const [id, p] of Object.entries(def.paths || {})) w.paths.set(id, p.pts ? p : makePath(p.points, { closed: p.closed }));

  // ---- triggers ----------------------------------------------------------------------------
  for (const t of def.triggers || []) {
    const region = prepare(t.region);
    const rd = t.region;
    const center = rd.kind === 'circle' ? { x: rd.x, y: rd.y } : rd.kind === 'polygon' ? { x: rd.pts.reduce((a, q) => a + q[0], 0) / rd.pts.length, y: rd.pts.reduce((a, q) => a + q[1], 0) / rd.pts.length } : rd.kind === 'line' ? { x: rd.pts[0][0], y: rd.pts[0][1] } : { x: 0, y: 0 };
    w.triggers.push({
      id: t.id, region, regionDef: t.region, center, policy: t.policy || 'latched', gate: t.gate ?? 0, lockout: t.lockout ?? 0,
      on: t.on || (region.kind === 'line' ? ['cross'] : ['enter', 'exit']),
      filter: t.filter ?? null, handle: t.handle || null, state: t.state || {},
      slots: new Map(), pairs: new Map()
    });
  }

  const passes = (trig, tr) => {
    const f = trig.filter;
    if (f == null || f === '*') return true;
    return typeof f === 'function' ? Boolean(f(tr)) : tr.tag === f;
  };
  const pairOf = (trig, tr) => {
    let p = trig.pairs.get(tr.id);
    if (!p) { p = { geo: false, inside: false, slot: null }; trig.pairs.set(tr.id, p); }
    return p;
  };
  const slotOf = (trig, tr) => {
    if (trig.policy === 'every') return { count: 0, open: false, openT: 0, lockedUntil: -Infinity };
    const key = trig.policy === 'pair' ? tr.id : '*';
    let s = trig.slots.get(key);
    if (!s) { s = { count: 0, open: false, openT: 0, lockedUntil: -Infinity }; trig.slots.set(key, s); }
    return s;
  };

  // ---- the queue (sorted by time, then by the order made) ----------------------------------
  function push(ev) {
    ev.seq = w.seq++;
    let lo = 0, hi = w.queue.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const q = w.queue[mid];
      if (q.t < ev.t || (q.t === ev.t && q.seq < ev.seq)) lo = mid + 1; else hi = mid;
    }
    w.queue.splice(lo, 0, ev);
  }

  // ---- travelers ---------------------------------------------------------------------------
  function addTraveler(d, { silent = false, die = false } = {}) {
    const id = d.id ?? `t${++w.auto}`;
    let spec, path = null;
    if (d.pos) {
      spec = { start: d.start ?? 0 };
    } else {
      path = w.paths.get(d.on);
      if (!path) throw new Error(`traveler ${id}: no path "${d.on}"`);
      let dur = d.dur;
      if (d.as === 'drawn' && path.drawn) dur = drawnDuration(path);
      else if (dur == null && d.speed > 0) dur = path.length / d.speed;
      spec = { start: d.start ?? 0, dur: dur ?? 1, rate: d.rate ?? 1, loop: d.loop || 'once' };
      // `at`: it begins that far along (0..1 of a lap), as if it had started earlier.
      if (d.at) spec.start -= (d.at * spec.dur) / Math.max(0.001, spec.rate);
    }
    const drawn = d.as === 'drawn' && path?.drawn;
    // `range`: it runs only this part of the path, [from, to] as fractions of its length (to < from: backwards).
    const range = Array.isArray(d.range) ? [Math.max(0, Math.min(1, d.range[0])), Math.max(0, Math.min(1, d.range[1]))] : null;
    const totalMs = drawn ? drawnDuration(path) * 1000 : 0;
    const tr = {
      id, spec, path, tag: d.tag ?? null, data: d.data, width: Math.max(0, Number(d.width) || 0), state: d.state || {}, handle: d.handle || null,
      die: d.die ?? die, silent, seeded: false, done: false, lastT: 0, fn: d.pos || null,
      atProgress(u0) {
        const u = range ? range[0] + (range[1] - range[0]) * u0 : u0;
        const s = drawn ? sampleDrawn(path, u * totalMs) : sample(path, u);
        return { x: s.x, y: s.y, p: s.p, u, tx: s.tx, ty: s.ty };
      },
      pointAt(t) {
        if (this.fn) { const q = this.fn(t); return { x: q.x, y: q.y, p: q.p ?? null, u: 0 }; }
        return this.atProgress(localTime(t, spec).progress);
      }
    };
    w.travelers.push(tr);
    w.live++;
    return tr;
  }

  const frame = p => ({ nx: (p.x - w.bounds.x) / w.bounds.width, ny: 1 - (p.y - w.bounds.y) / w.bounds.height });
  const lerpPt = (a, b, f) => ({
    x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, u: a.u + (b.u - a.u) * f,
    p: a.p == null || b.p == null ? (a.p ?? b.p) : a.p + (b.p - a.p) * f
  });

  /** The traveler appears at time t: triggers it is inside of notice it (or, if silent, don't). */
  function seed(tr, t, silent) {
    tr.seeded = true;
    const p = tr.pointAt(t);
    for (const trig of w.triggers) {
      if (trig.region.kind !== 'area' || !passes(trig, tr) || !trig.region.inside(p.x, p.y)) continue;
      const pair = pairOf(trig, tr);
      pair.geo = true;
      if (silent) {
        pair.inside = true;
        pair.slot = slotOf(trig, tr);
        pair.slot.count++;
      } else {
        push({ type: 'enter', t, tr, trig, pt: p, speed: 0 });
      }
    }
  }

  /** Test one straight move of a traveler against every trigger. */
  function segment(tr, ta, tb, pa, pb) {
    const dt = tb - ta;
    const speed = dt > 0 ? Math.hypot(pb.x - pa.x, pb.y - pa.y) / dt : 0;
    for (const trig of w.triggers) {
      if (!passes(trig, tr)) continue;
      if (tr.width > 0 && trig.regionDef.kind === 'circle' && pa.tx !== undefined) { wide(tr, trig, ta, tb, pa, pb, speed); continue; }
      if (!overlaps(trig.region.bounds, pa.x, pa.y, pb.x, pb.y)) continue;
      const pair = trig.region.kind === 'area' ? pairOf(trig, tr) : null;
      let cs = trig.region.crossings(pa, pb, pair ? pair.geo : false);
      if (pair && cs.length) {
        // A contact at a step edge can be found at the end of one move and the start of the next:
        // keep the one that agrees with where the traveler ends up.
        const ends = trig.region.inside(pb.x, pb.y);
        if ((pair.geo !== (cs.length % 2 === 1)) !== ends) {
          if (cs[0].s < 1e-6) cs = cs.slice(1);
          else if (cs[cs.length - 1].s > 1 - 1e-6) cs = cs.slice(0, -1);
        }
      }
      for (const c of cs) {
        if (pair) pair.geo = c.type === 'enter';
        push({ type: c.type, t: ta + c.s * dt, tr, trig, pt: lerpPt(pa, pb, c.s), speed, dir: c.dir });
      }
      if (pair && pair.geo !== trig.region.inside(pb.x, pb.y)) {   // rounding at an edge: settle at the end
        pair.geo = !pair.geo;
        push({ type: pair.geo ? 'enter' : 'exit', t: tb, tr, trig, pt: pb, speed });
      }
    }
  }

  /**
   * A traveler with a width is a bar across its path (IanniX's cursor). A circular trigger is touched
   * when the bar passes its centre (in the traveler's own frame, along the path), within half the width
   * of the path. The touch is a moment: it enters and leaves at once (a trigger's gate holds it open).
   */
  function wide(tr, trig, ta, tb, pa, pb, speed) {
    const { x: cx, y: cy, r } = trig.regionDef;
    const f0 = (cx - pa.x) * pa.tx + (cy - pa.y) * pa.ty, f1 = (cx - pb.x) * pb.tx + (cy - pb.y) * pb.ty;
    if (!((f0 > 0 && f1 <= 0) || (f0 < 0 && f1 >= 0))) return;
    const s = f0 / (f0 - f1);
    const at = lerpPt(pa, pb, s);
    const tx = pa.tx + (pb.tx - pa.tx) * s, ty = pa.ty + (pb.ty - pa.ty) * s;
    if (Math.abs(-(cx - at.x) * ty + (cy - at.y) * tx) > tr.width / 2 + r) return;
    const t = ta + s * (tb - ta);
    const lat = Math.max(-1, Math.min(1, (-(cx - at.x) * ty + (cy - at.y) * tx) / (tr.width / 2)));   // across the bar: -1 to 1, 0 on the path
    const pt = { x: cx, y: cy, u: at.u, p: at.p, lat };
    push({ type: 'enter', t, tr, trig, pt, speed });
    push({ type: 'exit', t, tr, trig, pt, speed });
  }

  /** A jump (a loop wrap): no sweep, only who is inside afterwards. */
  function teleport(tr, t, p) {
    for (const trig of w.triggers) {
      if (trig.region.kind !== 'area' || !passes(trig, tr)) continue;
      const pair = pairOf(trig, tr);
      const now = trig.region.inside(p.x, p.y);
      if (now !== pair.geo) { pair.geo = now; push({ type: now ? 'enter' : 'exit', t, tr, trig, pt: p, speed: 0 }); }
    }
  }

  /** Move a traveler from where it was last looked at up to t1, making raw contacts. */
  function sweep(tr, t1) {
    if (tr.done || tr.body) return;
    if (!tr.seeded) {
      if (t1 < tr.spec.start) return;
      tr.lastT = tr.spec.start;
      seed(tr, tr.spec.start, tr.silent);
    }
    const t0 = tr.lastT;
    if (t1 <= t0) return;
    tr.lastT = t1;
    if (tr.fn) { segment(tr, t0, t1, tr.pointAt(t0), tr.pointAt(t1)); return; }

    const spec = tr.spec;
    const ends = lapEnds(spec, t0, t1);
    const wraps = spec.loop === 'loop' ? ends : [];
    let ta = t0, pa = tr.pointAt(t0);
    for (const tw of wraps) {
      segment(tr, ta, tw, pa, tr.atProgress(1));
      ta = tw; pa = tr.atProgress(0);
      teleport(tr, tw, pa);
    }
    segment(tr, ta, t1, pa, tr.pointAt(t1));
    for (const te of ends) push({ type: 'end', t: te, tr, pt: tr.atProgress(spec.loop === 'pingpong' && Math.round((te - spec.start) * (spec.rate ?? 1) / spec.dur) % 2 === 1 ? 1 : 0), speed: 0 });
    if (spec.loop === 'once' && ends.length) {
      tr.done = true;
      if (tr.die) push({ type: 'release', t: ends[0], tr, pt: tr.atProgress(1), speed: 0 });
    }
  }

  // ---- policy and handlers -----------------------------------------------------------------
  function record(type, ev, extra) {
    const { nx, ny } = frame(ev.pt);
    return {
      t: ev.t, type, traveler: ev.tr?.id ?? null, trigger: ev.trig?.id ?? null, tag: ev.tr?.tag ?? null,
      x: ev.pt.x, y: ev.pt.y, nx, ny, u: ev.pt.u, speed: ev.speed || 0, p: ev.pt.p ?? null, lat: ev.pt.lat, data: ev.data ?? ev.tr?.data, ...(extra || {})
    };
  }

  function api(state, t) {
    return {
      state, t, rng: w.rng,
      launch: (pathId, opts = {}) => launch(pathId, { ...opts, start: opts.start ?? t }),
      arrive: (triggerId, data, delay = 0) => arrive(triggerId, data, t + delay),
      spawn: spec => spawn({ x: 0, y: 0, vx: 0, vy: 0, ...spec }, t),
      effect: fx => { if (!w.silent) w.effects.push({ t, ...fx }); },
      kill: id => kill(id, t)
    };
  }

  function fire(type, ev) {
    const rec = record(type, ev, ev.dir ? { dir: ev.dir } : null);
    w.events.push(rec);
    if (ev.trig && ev.trig.handle && (type === 'arrive' || ev.trig.on.includes(type))) ev.trig.handle(rec, api(ev.trig.state, ev.t));
  }

  function enter(ev) {
    const { trig, tr } = ev;
    const pair = pairOf(trig, tr);
    pair.inside = true;
    pair.slot = slotOf(trig, tr);
    const slot = pair.slot;
    slot.count++;
    if (slot.open || ev.t < slot.lockedUntil) return;
    slot.open = true; slot.openT = ev.t; slot.lockedUntil = ev.t + trig.lockout;
    fire('enter', ev);
  }

  function exit(ev) {
    const { trig, tr } = ev;
    const pair = pairOf(trig, tr);
    if (!pair.inside) return;
    pair.inside = false;
    const slot = pair.slot;
    slot.count--;
    if (slot.count > 0 || !slot.open) return;
    const te = trig.policy === 'every' ? ev.t : Math.max(ev.t, slot.openT + trig.gate);
    if (te <= ev.t) { slot.open = false; fire('exit', ev); }
    else push({ type: 'close', t: te, tr, trig, slot, pt: ev.pt, speed: ev.speed });
  }

  function cross(ev) {
    const slot = slotOf(ev.trig, ev.tr);
    if (ev.t < slot.lockedUntil) return;
    slot.lockedUntil = ev.t + ev.trig.lockout;
    fire('cross', ev);
  }

  function process(ev) {
    w.cur = ev.t;
    // A traveler sent to a trigger (a route) is a message: it arrives there, and touches nothing on the way.
    if (ev.tr?.data?.to != null && (ev.type === 'enter' || ev.type === 'exit' || ev.type === 'cross')) return;
    if (ev.type === 'enter') enter(ev);
    else if (ev.type === 'exit') exit(ev);
    else if (ev.type === 'cross') cross(ev);
    else if (ev.type === 'close') {
      if (ev.slot.count === 0 && ev.slot.open) { ev.slot.open = false; fire('exit', ev); }
    } else if (ev.type === 'arrive') {
      fire('arrive', ev);
    } else if (ev.type === 'collide') {
      for (const [me, other] of [[ev.tr, ev.other], [ev.other, ev.tr]]) {
        if (!me.handle) continue;
        const rec = record('collide', { ...ev, tr: me }, { other: other.id });
        w.events.push(rec);
        me.handle(rec, api(me.state, ev.t));
      }
    } else if (ev.type === 'end') {
      const rec = record('end', ev);
      w.events.push(rec);
      if (ev.tr.handle) ev.tr.handle(rec, api(ev.tr.state, ev.t));
      // A traveler sent to a node arrives there when its path ends.
      if (ev.tr.data?.to != null) arrive(ev.tr.data.to, ev.tr.data, ev.t);
    } else if (ev.type === 'release') {
      // The traveler is gone: it leaves whatever it was inside of.
      for (const trig of w.triggers) {
        const pair = trig.pairs.get(ev.tr.id);
        if (pair?.inside) exit({ ...ev, type: 'exit', trig });
      }
      w.live--;
    }
  }

  function drain(t1) {
    while (w.queue.length && w.queue[0].t <= t1) process(w.queue.shift());
  }

  // ---- the surface -------------------------------------------------------------------------
  function launch(pathId, opts = {}) {
    if (w.live >= w.max) return null;
    const tr = addTraveler({ ...opts, on: pathId, start: opts.start ?? w.cur }, { silent: opts.silent ?? true, die: opts.die ?? true });
    sweep(tr, w.now);
    return tr.id;
  }

  /** Deliver a signal to a trigger at time t, as if a traveler had reached it (a node of a graph): handlers hear 'arrive'. */
  function arrive(triggerId, data, t = w.cur) {
    const trig = w.triggers.find(x => x.id === triggerId);
    if (!trig) return false;
    push({ type: 'arrive', t, trig, tr: null, data, pt: { ...trig.center, u: 0, p: null }, speed: 0 });
    return true;
  }

  function kill(id, t = w.cur) {
    const tr = w.travelers.find(x => x.id === id && !x.done);
    if (!tr) return false;
    tr.done = true;
    push({ type: 'release', t, tr, pt: tr.pointAt(Math.max(t, tr.spec.start)), speed: 0 });
    return true;
  }

  // ---- bodies --------------------------------------------------------------------------------
  const DT = 1 / 120;
  function addBody(d, born = 0) {
    const b = { x: d.x, y: d.y, vx: d.vx || 0, vy: d.vy || 0, r: Math.max(0.5, d.r ?? 6), life: d.life ?? Infinity, born };   // (only a spawned body has a life)
    b.m = b.r * b.r;
    b.init = { x: b.x, y: b.y, vx: b.vx, vy: b.vy };
    const tr = addTraveler({ id: d.id, pos: () => ({ x: b.x, y: b.y }), start: 0, tag: d.tag, data: d.data, state: d.state, handle: d.handle, die: d.life != null });
    tr.body = b; b.tr = tr;
    w.bodies.push(b);
    return tr;
  }
  function spawn(d, t) {
    if (w.live >= w.max) return null;
    const tr = addBody(d, t);
    tr.seeded = true;   // (born where it is: not "entering" what it is born inside of)
    for (const trig of w.triggers) if (trig.region.kind === 'area' && passes(trig, tr) && trig.region.inside(d.x, d.y)) pairOf(trig, tr).geo = true;
    return tr.id;
  }
  /** One fixed step of every body: move, bounce off the frame, touch triggers, collide in pairs. */
  function bodyStep(t) {
    const { x: bx, y: by, width: bw, height: bh } = w.bounds;
    for (const b of w.bodies) {
      if (b.dead) continue;
      b.px = b.x; b.py = b.y;
      b.x += b.vx * DT; b.y += b.vy * DT;
      if (b.x < bx + b.r) { b.x = bx + b.r; b.vx = Math.abs(b.vx); } else if (b.x > bx + bw - b.r) { b.x = bx + bw - b.r; b.vx = -Math.abs(b.vx); }
      if (b.y < by + b.r) { b.y = by + b.r; b.vy = Math.abs(b.vy); } else if (b.y > by + bh - b.r) { b.y = by + bh - b.r; b.vy = -Math.abs(b.vy); }
    }
    if (!w.silent) {
      for (const b of w.bodies) {
        if (b.dead) continue;
        if (!b.tr.seeded) { b.tr.seeded = true; seed(b.tr, t - DT, false); }
        segment(b.tr, t - DT, t, { x: b.px, y: b.py, u: 0, p: null }, { x: b.x, y: b.y, u: 0, p: null });
      }
    }
    // Collisions: a grid of cells twice the largest radius, so each body only meets its neighbours.
    const live = w.bodies.filter(b => !b.dead);
    if (live.length > 1) {
      const cell = 2 * Math.max(...live.map(b => b.r));
      const grid = new Map();
      live.forEach((b, i) => { const k = `${Math.floor(b.x / cell)},${Math.floor(b.y / cell)}`; (grid.get(k) || grid.set(k, []).get(k)).push(i); });
      for (let i = 0; i < live.length; i++) {
        const a = live[i], cx = Math.floor(a.x / cell), cy = Math.floor(a.y / cell);
        for (let gx = cx - 1; gx <= cx + 1; gx++) for (let gy = cy - 1; gy <= cy + 1; gy++) {
          for (const j of grid.get(`${gx},${gy}`) || []) {
            if (j <= i) continue;
            const c = live[j];
            const dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy, rr = a.r + c.r;
            if (d2 >= rr * rr || d2 === 0) continue;
            const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
            const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;   // closing speed along the normal
            const push = (rr - d) / 2;
            a.x -= nx * push; a.y -= ny * push; c.x += nx * push; c.y += ny * push;
            if (rel <= 0) continue;
            const ja = (2 * c.m) / (a.m + c.m) * rel, jc = (2 * a.m) / (a.m + c.m) * rel;
            a.vx -= ja * nx; a.vy -= ja * ny; c.vx += jc * nx; c.vy += jc * ny;
            if (!w.silent) push2({ type: 'collide', t, tr: a.tr, other: c.tr, pt: { x: a.x + nx * a.r, y: a.y + ny * a.r, u: 0, p: null }, speed: rel });
          }
        }
      }
    }
    for (const b of w.bodies) if (!b.dead && t - b.born >= b.life) { b.dead = true; b.tr.done = true; push({ type: 'release', t, tr: b.tr, pt: { x: b.x, y: b.y, u: 0, p: null }, speed: 0 }); }
    if (w.bodies.some(b => b.dead)) w.bodies = w.bodies.filter(b => !b.dead);
  }
  const push2 = ev => push(ev);
  function stepBodies(t1) {
    while (w.simT + DT <= t1 + 1e-9) { w.simT += DT; bodyStep(w.simT); }
  }
  function resetBodies() {
    w.bodies = w.bodies.filter(b => b.tr.id in initial);
    for (const b of w.bodies) { Object.assign(b, b.init, { dead: false, px: b.init.x, py: b.init.y }); b.tr.done = false; b.tr.seeded = false; }
    w.simT = 0;
  }

  for (const d of def.travelers || []) addTraveler(d);
  const initial = {};
  for (const d of def.bodies || []) { const tr = addBody({ ...d, life: undefined }); initial[tr.id] = true; }
  // Signals that start the graph: { trigger, t, data }
  const starts = def.starts || [];
  for (const st of starts) arrive(st.trigger, st.data || {}, st.t || 0);

  /**
   * Jump to time t without sweeping over what lies between (a seek, or starting in the middle):
   * dynamic travelers are dropped, handlers' state is kept, and travelers already under way (and
   * who is inside what) are taken as they stand, silently. A traveler that starts at t or later
   * begins as usual.
   */
  function seek(t) {
    w.queue = []; w.events = []; w.effects = [];
    for (const st of starts) if ((st.t || 0) >= t) arrive(st.trigger, st.data || {}, st.t || 0);
    w.travelers = w.travelers.filter(tr => !tr.die);
    w.live = w.travelers.length;
    for (const trig of w.triggers) { trig.pairs.clear(); trig.slots.clear(); }
    w.now = w.cur = t;
    // The bodies: back to where they began, and run up to t without a sound (the same steps, so the same places).
    w.travelers = w.travelers.filter(tr => !tr.body || tr.body.tr.id in initial);
    resetBodies();
    w.silent = true;
    stepBodies(Math.min(t, 300));
    w.silent = false;
    for (const b of w.bodies) {
      b.tr.seeded = true;
      for (const trig of w.triggers) {
        if (trig.region.kind !== 'area' || !passes(trig, b.tr) || !trig.region.inside(b.x, b.y)) continue;
        const pair = pairOf(trig, b.tr);
        pair.geo = pair.inside = true; pair.slot = slotOf(trig, b.tr); pair.slot.count++;
      }
    }
    for (const tr of w.travelers) {
      if (tr.body) continue;
      tr.done = false; tr.seeded = false; tr.lastT = t;
      if (t <= tr.spec.start) continue;
      if (!tr.fn && tr.spec.loop === 'once' && lapEnds(tr.spec, tr.spec.start - 1, t).length) { tr.done = true; continue; }
      tr.seeded = true;
      const p = tr.pointAt(t);
      for (const trig of w.triggers) {
        if (trig.region.kind !== 'area' || !passes(trig, tr) || !trig.region.inside(p.x, p.y)) continue;
        const pair = pairOf(trig, tr);
        pair.geo = pair.inside = true;
        pair.slot = slotOf(trig, tr);
        pair.slot.count++;
      }
    }
  }

  return {
    seek,
    step(t1) {
      w.now = Math.max(w.now, t1);
      stepBodies(t1);
      for (let i = 0; i < w.travelers.length; i++) sweep(w.travelers[i], t1);
      drain(t1);
      w.travelers = w.travelers.filter(tr => !(tr.done && tr.die));
    },
    take() { const e = w.events; w.events = []; return e.sort((a, b) => a.t - b.t); },
    takeEffects() { const e = w.effects; w.effects = []; return e; },
    bodies: () => w.bodies.filter(b => !b.dead),
    launch, kill, arrive,
    /** Where every live traveler is at time t: for drawing. */
    positions(t) {
      const out = [];
      for (const tr of w.travelers) if (t >= tr.spec.start) out.push({ id: tr.id, tag: tr.tag, ...(tr.body ? { x: tr.body.x, y: tr.body.y, r: tr.body.r } : tr.pointAt(t)) });
      return out;
    },
    travelers: () => w.travelers, triggers: () => w.triggers
  };
}

/**
 * Make the events of a whole score ahead of time (tests, MIDI file export, replays).
 * def as for createWorld; seconds long; dt the step (1/240 by default).
 */
export function renderEvents(def, seconds, { dt = 1 / 240 } = {}) {
  const w = createWorld(def);
  const out = [];
  const n = Math.ceil(seconds / dt);
  for (let i = 1; i <= n; i++) { w.step(Math.min(seconds, i * dt)); out.push(...w.take()); }
  return out.sort((a, b) => a.t - b.t);
}
