/**
 * The score bus: what a score is doing, as named signals for anything outside the drawing (a host page
 * through Poliplan, `__` in the embed). Pure: the studio feeds it the worlds and the events they make.
 *
 *   sampleFeatures(entries, t, doc)   → { features, ports }   every traveler and body, now (normalized board coordinates)
 *   createBus()                       → { record, frame, read, subscribe, recent }
 *
 * Names: a mark's label, else its id. A name shared by two boards is prefixed with the board's title.
 * Features (board-normalized: x and y run 0..1 across the board, y up; u is 0..1 along the path):
 *   <name>.x  <name>.y  <name>.u  <name>.speed  <name>.lap  <name>.active     travelers
 *   <name>.x  <name>.y  <name>.r  <name>.vx  <name>.vy                          bodies
 *   <name>.active                                                               events (inside now)
 * Events (recent, and to subscribers): { seq, t, name, board, phase, x, y, u, lat, dir, speed, traveler, other, tag }
 *   phase: entry | exit | cross | end | arrive | collide
 */
import { triggerIdOf } from './compile.js';

const PHASE = { enter: 'entry', exit: 'exit', cross: 'cross', end: 'end', arrive: 'arrive', collide: 'collide' };
const RING = 256;
const clamp01 = v => (Number.isFinite(v) ? v : 0);

/** The name every mark goes by in the bus: its label, else its id (and the events' name, the same rule). */
export function namesOf(doc) {
  const names = new Map();
  for (const e of doc?.elements || []) names.set(e.id, e.label || (e.play?.trigger || e.play?.node ? triggerIdOf(e) : e.id));
  return names;
}

/** The features of every worker in the entries (`[{ board, world }]`) at time t. Positions are board-local in the worlds. */
export function sampleFeatures(entries, t, doc) {
  const names = namesOf(doc), features = {};
  // Names used on more than one board are prefixed with the board title (only then).
  const boardsOfName = new Map();
  for (const { board, world } of entries) {
    for (const q of world.positions(t)) { const k = names.get(q.id) || q.id; boardsOfName.set(k, new Set([...(boardsOfName.get(k) || []), board.id])); }
    for (const b of world.bodies()) { const k = names.get(b.tr?.id) || b.tr?.id; boardsOfName.set(k, new Set([...(boardsOfName.get(k) || []), board.id])); }
  }
  const keyOf = (name, board) => ((boardsOfName.get(name)?.size || 0) > 1 ? `${board.title || board.id}/${name}` : name);
  for (const { board, world } of entries) {
    const W = board.width || 1, H = board.height || 1;
    const trav = new Map(world.travelers().map(tr => [tr.id, tr]));
    for (const q of world.positions(t)) {
      if (q.r !== undefined) continue;   // (bodies are below)
      const tr = trav.get(q.id), name = keyOf(names.get(q.id) || q.id, board);
      const spec = tr?.spec, dur = Math.max(1e-6, spec?.dur || 1), rate = spec?.rate ?? 1;
      const x = clamp01((q.x - board.x) / W), y = clamp01(1 - (q.y - board.y) / H);
      const lap = spec ? Math.max(0, Math.floor(((t - spec.start) * rate) / dur)) : 0;
      const pathLen = tr?.path?.length || 0;
      const f = { x, y, u: clamp01(q.u), speed: pathLen ? (pathLen / Math.max(1e-6, dur / rate)) / Math.max(W, H) : 0, lap, active: t >= (spec?.start ?? 0) ? 1 : 0 };
      for (const [k, v] of Object.entries(f)) features[`${name}.${k}`] = v;
      if (tr?.data?.to !== undefined) features[`${name}.routed`] = 1;
    }
    for (const b of world.bodies()) {
      const name = keyOf(names.get(b.tr?.id) || b.tr?.id, board);
      const f = { x: clamp01((b.x - board.x) / W), y: clamp01(1 - (b.y - board.y) / H), r: b.r / Math.max(W, H), vx: b.vx / W, vy: b.vy / H };
      for (const [k, v] of Object.entries(f)) features[`${name}.${k}`] = v;
    }
    for (const trig of world.triggers()) {
      const name = keyOf(names.get(trig.id) || trig.id, board);
      const on = Array.from(trig.pairs?.values?.() || []).some(p => p.geo || p.inside);
      features[`${name}.active`] = on ? 1 : 0;
    }
  }
  return { features, ports: {} };   // (designated ports come later)
}

/** The bus: keeps the recent events, and tells subscribers about frames and events. */
export function createBus({ now = () => performance.now() } = {}) {
  const ring = [];
  let seq = 0;
  const subs = new Set();
  const eventOf = (ev, board, doc) => {
    const names = namesOf(doc);
    const name = ev.trigger ? names.get(ev.trigger) || ev.trigger : ev.traveler ? names.get(ev.traveler) || ev.traveler : null;
    return {
      seq: ++seq, t: ev.t, name, board: board?.title || board?.id || null,
      phase: PHASE[ev.type] || ev.type, x: ev.nx ?? null, y: ev.ny ?? null, u: ev.u ?? null, lat: ev.lat ?? null, dir: ev.dir ?? null,
      speed: ev.speed ?? null, traveler: ev.traveler ? names.get(ev.traveler) || ev.traveler : null,
      other: ev.other ? names.get(ev.other) || ev.other : null, tag: ev.tag ?? null
    };
  };
  const matches = (sub, name) => !sub.names || sub.names.some(n => name === n || (name || '').startsWith(n + '.') || (name || '').startsWith(n + '/'));
  return {
    /** Events a world made: kept, and sent to subscribers who asked for them (by name). */
    record(evs, board, doc) {
      for (const ev of evs) {
        const e = eventOf(ev, board, doc);
        ring.push(e); if (ring.length > RING) ring.shift();
        for (const s of subs) if (s.onEvent && matches(s, e.name)) s.onEvent(e);
      }
    },
    /** Frames to subscribers whose rate is due (hz). `make()` returns { features, ports, t, playing } and is only called when someone listens. */
    frame(make) {
      let made = null, at = now();
      for (const s of subs) {
        if (!s.onFrame || at - s.last < 1000 / s.hz) continue;
        s.last = at;
        made ||= make();
        const features = s.names ? Object.fromEntries(Object.entries(made.features).filter(([k]) => matches(s, k))) : made.features;
        s.onFrame({ t: made.t, playing: made.playing, features, ports: made.ports });
      }
    },
    /** Subscribe: { names?: string[], hz?: number (default 25), onFrame?, onEvent? }. Returns unsubscribe. */
    subscribe(opts = {}) {
      const s = { names: opts.names?.length ? opts.names : null, hz: Math.min(60, Math.max(1, opts.hz || 25)), last: -Infinity, onFrame: opts.onFrame || null, onEvent: opts.onEvent || null };
      subs.add(s);
      return () => subs.delete(s);
    },
    hasFrameSubscribers: () => [...subs].some(s => s.onFrame),
    /** Recent events, newest last (optionally since a seq, optionally by name). */
    recent(since = 0, name = null) { return ring.filter(e => e.seq > since && (!name || e.name === name || (e.name || '').startsWith(name + '.'))); },
    /** Everything a host may read: the features now (or at the given sample). */
    read(name, sample) {
      const f = sample?.features || {};
      if (!name) return f;
      return Object.fromEntries(Object.entries(f).filter(([k]) => k === name || k.startsWith(name + '.')));
    }
  };
}
