/**
 * Nodes: the kinds of point a Midinous score is made of (after Midinous and midinojs), as marks that sit
 * on paths. A traveler that reaches a node is a signal: the node does what its kind does (plays a note,
 * counts, lets the signal through or not…) and sends the signal on, by its mode, down the paths that
 * leave it. A path drawn from one node to another is an edge; several nodes along one line are a chain.
 *
 *   play: { node: { kind, …settings } }   (see NODE_KINDS and normalizeNode for each kind's settings)
 *
 * Kinds:
 *   note        plays a note: `note` (a number or a name), or `rel` scale steps from the note the signal
 *               carries (`range` 'up' | 'down' | 'both' makes the step a random one up to `rel`); `force`
 *               snaps it to `scale`/`root` (else the scene's); `vel`, `ch`, `dur` (beats), `repeat` more
 *               times, each `dur` apart; `chance` (0..100) that it sounds; `mute` sounds nothing but still
 *               carries its note; `pass` leaves the signal as it came (no sound, no note of its own)
 *   cc          a controller: `cc`, `value`, `ch`; `slew` beats to glide from the last value
 *   anchor      a corner: does nothing but send the signal on
 *   led         lights up: for `dur` beats ('pulse'), or on and off in turn ('toggle')
 *   counter     lets every `count`-th signal through (the others stop here)
 *   switch      on and off in turn; with `block` (default) a signal goes on only while it is on
 *   gate        a logic gate: its `inputs` (other nodes, lit or not) decide whether a signal goes on:
 *               `type` 'and' | 'or' | 'xor' | 'nand' | 'nor' | 'xnor'
 *   terminator  stops what reaches it (the absorber: even a traveler that loops); `limit` stops only
 *               the first so many, `mode: 'stop'` stops every signal, `bypass` lets everything through
 *
 * Common: `mode` 'robin' (one way each time, in turn) | 'split' (every way) | 'random' (one way, by the
 * `weight` of where it leads) | 'portal' (straight to the nodes at the far ends, no travel); `start`
 * (it fires when play starts, or at a time); `to` (more ways out: paths, or nodes); `name`; `weight`;
 * `shape` 'line' | 'horz' | 'vert' (how a new edge from it is drawn).
 *
 * A signal is a traveler a node sent (it stops where it is stopped, and goes one way); a traveler you
 * placed (a driver) is never stopped but by a terminator: it carries the note on, and nodes it passes
 * send signals out the other ways. Lit: a note while it sounds, an LED while lit, a switch while on, a
 * counter and an anchor for a moment when they let one through; gates read that.
 */
import { snap, step, noteNumber } from './scale.js';

export const NODE_KINDS = Object.freeze(['note', 'cc', 'gate', 'led', 'counter', 'switch', 'terminator', 'anchor']);
export const NODE_INFO = Object.freeze({
  note: { label: 'Note', hint: 'Plays a note (or a step from the note the signal carries), then sends the signal on' },
  cc: { label: 'Controller', hint: 'Sends a MIDI controller value (gliding, with slew)' },
  gate: { label: 'Logic gate', hint: 'Lets a signal on only when its inputs say so (and, or, xor…)' },
  led: { label: 'LED', hint: 'Lights up when a signal passes: an input for logic gates' },
  counter: { label: 'Counter', hint: 'Lets every n-th signal through' },
  switch: { label: 'Switch', hint: 'On and off in turn: while off, signals stop here' },
  terminator: { label: 'Terminator', hint: 'Stops what reaches it, even a traveler that loops' },
  anchor: { label: 'Anchor', hint: 'A silent corner: sends the signal on' }
});
export const MODES = Object.freeze(['robin', 'split', 'random', 'portal']);
export const MODE_INFO = Object.freeze({
  robin: 'One way each time, in turn', split: 'Every way at once', random: 'One way at random, by weight', portal: 'Straight to the nodes at the far ends, no travel'
});
export const GATE_TYPES = Object.freeze(['and', 'or', 'xor', 'nand', 'nor', 'xnor']);
export const SHAPES = Object.freeze(['line', 'horz', 'vert']);

const num = (v, d) => (v === null || v === '' || v === undefined || !Number.isFinite(Number(v)) ? d : Number(v));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pitch = v => (typeof v === 'string' && !/^-?\d+(\.\d+)?$/.test(v) ? noteNumber(v) : num(v, 60));

/** A node's settings with every default filled in (what the kernel and the Properties editor read). */
export function normalizeNode(n) {
  const s = n && typeof n === 'object' ? n : {};
  const kind = NODE_KINDS.includes(s.kind) ? s.kind : 'note';
  return {
    kind,
    mode: MODES.includes(s.mode) ? s.mode : 'robin',
    start: s.start ?? false,
    to: [].concat(s.to ?? []).filter(Boolean),
    name: s.name || '',
    weight: Math.max(0, num(s.weight, 100)),
    shape: SHAPES.includes(s.shape) ? s.shape : 'line',
    mute: Boolean(s.mute), pass: Boolean(s.pass),
    // note
    note: clamp(Math.round(pitch(s.note ?? 60)), 0, 127),
    rel: s.rel === undefined || s.rel === null || s.rel === '' ? null : Math.round(num(s.rel, 0)),
    range: ['up', 'down', 'both'].includes(s.range) ? s.range : null,
    force: s.force === undefined ? kind === 'note' && s.rel != null : Boolean(s.force),
    scale: s.scale || '', root: s.root === undefined || s.root === null || s.root === '' ? null : clamp(Math.round(num(s.root, 0)), 0, 127),
    vel: clamp(Math.round(num(s.vel, 100)), 1, 127),
    ch: clamp(Math.round(num(s.ch, 1)), 1, 16),
    dur: Math.max(0.01, num(s.dur, 1)),
    repeat: clamp(Math.round(num(s.repeat, 0)), 0, 64),
    chance: clamp(num(s.chance, 100), 0, 100),
    // cc
    cc: clamp(Math.round(num(s.cc, 1)), 0, 127), value: clamp(Math.round(num(s.value, 127)), 0, 127), slew: Math.max(0, num(s.slew, 0)),
    // led
    hold: s.hold === 'toggle' ? 'toggle' : 'pulse',
    // counter
    count: Math.max(1, Math.round(num(s.count, 4))),
    // switch
    on: Boolean(s.on), block: s.block === undefined ? true : Boolean(s.block),
    // gate
    type: GATE_TYPES.includes(s.type) ? s.type : 'and', inputs: [].concat(s.inputs ?? []).filter(Boolean),
    // terminator
    limit: Math.max(0, Math.round(num(s.limit, 0))), bypass: Boolean(s.bypass), stop: s.mode === 'stop' || Boolean(s.stop)
  };
}

/** What a logic gate makes of its inputs (booleans). */
export function evalGate(type, ins) {
  const on = ins.filter(Boolean).length;
  const and = ins.length > 0 && on === ins.length, or = on > 0, xor = on % 2 === 1;
  return { and, or, xor, nand: !and, nor: !or, xnor: !xor }[type] ?? and;
}

/** Is a node lit at time t (from its state)? */
export function isLit(kind, n, st, t) {
  if (!st) return kind === 'switch' ? n.on : false;
  if (kind === 'switch' || (kind === 'led' && n.hold === 'toggle')) return Boolean(st.on ?? n.on);
  if (kind === 'gate') return Boolean(st.open);
  return (st.litFrom ?? Infinity) <= t && t < (st.litUntil ?? -Infinity);
}

/** The note a note node plays for a signal carrying `base` (null: none). */
export function nodeNote(n, base, rng = Math.random, scene = {}) {
  const scale = n.scale || scene.scale || 'Chromatic', root = n.root ?? scene.root ?? 60;
  let p;
  if (n.rel == null) p = n.note;
  else {
    let k = n.rel;
    if (n.range) {
      const r = Math.floor(rng() * (Math.abs(k) + 1));
      k = n.range === 'up' ? r : n.range === 'down' ? -r : (rng() < 0.5 ? -r : r);
    }
    const from = base ?? n.note;
    p = k === 0 ? from : step(from, k, scale, root);
  }
  if (n.force) p = snap(p, scale, root);
  return clamp(Math.round(p), 0, 127);
}

const THROUGH = { through: true, weight: 100 };

/**
 * The handler of one node. env (made by compile.js):
 *   beat       seconds in a beat
 *   onPath     Map path key → where along it the node sits (0..1): the paths it is on
 *   outs       [{ key, u, seconds, weight, end }]: the paths that leave it (end: the node at the far end)
 *   extra      [{ path? { key, u, seconds }, node?, route? { key, dur }, weight }]: its `to`
 *   lit(id, t) is another node lit at t;  scene { scale, root };  ccLast: Map 'ch:cc' → the last value sent (shared)
 * The returned function is (event, api, helpers) => void (helpers: music.js's, for note and cc).
 */
export function makeNodeHandler(spec, env) {
  const n = normalizeNode(spec);
  const beat = env.beat || 0.5;
  return (e, api, h) => {
    const st = api.state, t = e.t;
    const sig = e.data && typeof e.data === 'object' ? e.data : {};
    const traveler = e.type === 'arrive' ? null : e.traveler;
    const driver = Boolean(traveler) && !e.dynamic;
    const lit = d => { if (!(st.litUntil > t)) st.litFrom = t; st.litUntil = Math.max(st.litUntil ?? -Infinity, t + d); };
    st.hits = (st.hits || 0) + 1;
    let open = true, carry = { ...sig };
    delete carry.to;

    if (n.kind === 'note') {
      const p = nodeNote(n, sig.note ?? null, api.rng, env.scene);
      if (!n.pass) carry = { ...carry, note: p, vel: n.vel, ch: n.ch };
      if (!n.mute && !n.pass && (n.chance >= 100 || api.rng() * 100 < n.chance)) {
        const d = n.dur * beat;
        for (let k = 0; k <= n.repeat; k++) h.note(n.ch, p, n.vel, d, d * k);
        st.played = p;
        lit(d * (n.repeat + 1));
      }
    } else if (n.kind === 'cc') {
      if (!n.mute && !n.pass) {
        const key = `${n.ch}:${n.cc}`, from = env.ccLast?.get(key) ?? n.value, d = n.slew * beat;   // (glides from the controller's last value, whichever node sent it)
        if (d > 0 && from !== n.value) {
          const steps = clamp(Math.round(n.slew * 8), 2, 64);
          for (let k = 1; k <= steps; k++) h.cc(n.ch, n.cc, Math.round(from + ((n.value - from) * k) / steps), (d * k) / steps);
        } else h.cc(n.ch, n.cc, n.value);
        env.ccLast?.set(key, n.value);
        lit(Math.max(d, 0.1 * beat));
      }
    } else if (n.kind === 'anchor') lit(0.25 * beat);
    else if (n.kind === 'led') {
      if (n.hold === 'toggle') st.on = !(st.on ?? n.on); else lit(n.dur * beat);
    } else if (n.kind === 'counter') {
      st.n = (st.n || 0) + 1;
      if (st.n >= n.count) { st.n = 0; lit(0.5 * beat); } else open = false;
    } else if (n.kind === 'switch') {
      st.on = !(st.on ?? n.on);
      open = !n.block || st.on;
    } else if (n.kind === 'gate') {
      open = evalGate(n.type, n.inputs.map(id => env.lit(id, t)));
      st.open = open; st.at = t;
    } else if (n.kind === 'terminator') {
      st.n = (st.n || 0) + 1;
      if (!n.bypass && (n.limit === 0 || st.n <= n.limit)) {
        lit(0.5 * beat);
        if (n.stop) api.killAll?.();
        else if (traveler) api.kill(traveler);
        return;
      }
    }

    // Stopped here: a signal ends; a driver goes on, but nothing is sent from here.
    if (!open) { if (traveler && !driver) api.kill(traveler); return; }

    // The ways out: on along the path it came by (when the path goes on past the node), the paths that leave the node, and its `to`.
    const here = traveler ? env.onPath.get(e.path) : undefined;
    const through = Boolean(traveler) && (here === undefined ? (e.u ?? 1) < 0.995 : here < 0.995 || env.closed?.has(e.path));
    const outs = [...env.outs.filter(o => o.key !== e.path), ...env.extra];
    const choose = list => {
      if (!list.length) return [];
      if (n.mode === 'split' || n.mode === 'portal') return list;
      if (n.mode === 'random') {
        const total = list.reduce((a, o) => a + (o.weight ?? 100), 0);
        if (total <= 0) return [list[Math.floor(api.rng() * list.length)]];
        let r = api.rng() * total;
        return [list.find(o => (r -= o.weight ?? 100) < 0) || list[list.length - 1]];
      }
      const i = st.rr = ((st.rr ?? -1) + 1) % list.length;
      return [list[i]];
    };
    let picks;
    if (driver) { picks = choose(outs); api.carry?.(traveler, carry); }
    else {
      picks = choose(n.mode === 'portal' ? outs : [...(through ? [THROUGH] : []), ...outs]);
      if (traveler) { if (picks.includes(THROUGH)) api.carry?.(traveler, carry); else api.kill(traveler); }
    }
    for (const o of picks) {
      if (o.through) continue;
      if (n.mode === 'portal') {
        const target = o.end ?? o.node;
        if (target) api.arrive(target, carry);
        continue;
      }
      const path = o.path || (o.key ? o : null);
      if (path) api.launch(path.key, { range: path.u > 0.0005 ? [path.u, 1] : undefined, dur: Math.max(0.01, path.seconds * (1 - path.u)), data: carry, tag: e.tag ?? null });
      else if (o.route) api.launch(o.route.key, { dur: o.route.dur, data: { ...carry, to: o.node } });
      else if (o.node) api.arrive(o.node, carry);
    }
  };
}
