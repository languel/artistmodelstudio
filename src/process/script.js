/**
 * Authoring library: a small point / line / plane vocabulary for JS.
 *
 * A script is the score; running it records a process document (the performance).
 * Every call becomes an element or a decision with its stage, parameters, seed,
 * reason (`why`) and author. The same scripts export as p5 sketches.
 *
 *   artboard(1000, 1000, '#f3efe6')
 *   stage('Construction', 'construction')           // later calls land in this stage
 *   decide('Where does the weight sit?', ['low left', 'centre'], 'low left', 'lower left feels heavy')
 *   guide([[0, 620], [1000, 620]], { why: 'horizon' })
 *   const path = walk({ from: [120, 700], heading: -20, steps: 60, step: 12, turn: i => sin(i / 6) * 9 })
 *   line(path, { width: 3, why: 'the active line walks toward the light' })
 *   plane([[...], ...], { brush: 'hatch', angle: 30, spacing: 8 })
 *   point(700, 300, { size: 40, why: 'the weight' })
 *   note(40, 40, 'Kandinsky: a point high right feels light')
 *
 * Helpers: random(a?, b?), noise(x, y?), seed(n), sin, cos, PI, TAU, lerp, map, range(n).
 */
import { createDocument, normalizeDocument, newId, STAGE_KINDS } from './document.js';
import { BRUSHES, mulberry32 } from './brushes.js';

const ELEMENT_KEYS = new Set(['why', 'color', 'brush', 'stage', 'closed', 'pressures', 'text', 'seed', 'by']);

/** 1D/2D value noise (seeded, smooth), enough for gentle variation. */
function makeNoise(rng) {
  const perm = Array.from({ length: 512 }, () => rng());
  const h = (i, j = 0) => perm[(((i * 73856093) ^ (j * 19349663)) >>> 0) % 512];
  const s = t => t * t * (3 - 2 * t);
  return (x, y = 0) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = s(x - xi), yf = s(y - yi);
    const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}

/**
 * Run a script and return { doc, error, logs }.
 * @param source  JS source using the vocabulary above
 * @param opts    { seed, by: { kind, name }, base: document to start from (else a blank one) }
 */
export function runScript(source, { seed = 1, by = { kind: 'script', name: 'script' }, base = null } = {}) {
  const doc = base ? normalizeDocument(base) : createDocument();
  if (!base) doc.stages = [];
  let rng = mulberry32(seed);
  let noise = makeNoise(rng);
  let current = null;
  let clock = 0; // synthetic time so scripted paths carry an order and a duration
  const logs = [];

  const ensureStage = () => {
    if (!current) current = api.stage('Marks', 'marks');
    return current;
  };
  const splitOpts = (opts = {}) => {
    const el = {}, params = {};
    for (const [k, v] of Object.entries(opts)) (ELEMENT_KEYS.has(k) ? el : params)[k] = v;
    return { el, params };
  };
  const timed = (pts, pressure) => {
    const start = clock;
    const out = pts.map((q, i) => {
      const p = typeof pressure === 'function' ? pressure(i / Math.max(1, pts.length - 1), i) : (q[3] ?? pressure ?? 0.5);
      return [q[0], q[1], (q[2] ?? (start + i * 16)) , Math.max(0, Math.min(1, p))];
    });
    clock = start + pts.length * 16 + 120;
    return out;
  };
  const add = (role, pts, opts, defaultBrush) => {
    if (!Array.isArray(pts) || !pts.length || !pts.every(q => Array.isArray(q) && Number.isFinite(Number(q[0])) && Number.isFinite(Number(q[1])))) {
      throw new Error(`${role}() needs a list of points like [[x, y], [x, y], ...] (got ${Array.isArray(pts) ? `an array whose items are ${typeof pts[0]}` : typeof pts}). walk(), circle() and rect() return such lists.`);
    }
    const { el, params } = splitOpts(opts);
    for (const [k, v] of Object.entries(params)) {
      if (typeof v !== 'number' && typeof v !== 'string') throw new Error(`Brush parameter "${k}" must be a number (got ${typeof v}). For per-point variation use pressures: t => 0..1, or make several marks.`);
    }
    const stage = el.stage || ensureStage().id;
    const brush = el.brush || defaultBrush;
    if (!BRUSHES[brush]) throw new Error(`Unknown brush "${brush}" (have: ${Object.keys(BRUSHES).join(', ')})`);
    const e = {
      id: newId(role), stage, role,
      points: timed(pts, el.pressures),
      closed: role === 'plane' ? true : Boolean(el.closed),
      realize: { brush, params },
      color: el.color || null,
      text: el.text,
      why: el.why || '',
      by: el.by || by,
      seed: el.seed ?? Math.floor(rng() * 1e9),
      created: clock
    };
    doc.elements.push(e);
    return e.id;
  };

  const api = {
    artboard(width = 1000, height = 1000, ground = '#f3efe6') { doc.artboard = { width, height, ground }; return doc.artboard; },
    stage(name, kind = 'marks', opts = {}) {
      const k = STAGE_KINDS.includes(kind) ? kind : 'marks';
      let s = doc.stages.find(x => x.name === name);
      if (!s) { s = { id: newId('stage'), name, kind: k, visible: true, locked: false, why: opts.why || '' }; doc.stages.push(s); }
      current = s;
      return s;
    },
    point(x, y, opts = {}) { return add('point', [[x, y]], opts, 'dot'); },
    points(list, opts = {}) { return list.map(([x, y]) => api.point(x, y, opts)); },
    line(pts, opts = {}) { return add('line', pts, opts, 'ink'); },
    plane(pts, opts = {}) { return add('plane', pts, opts, 'flat'); },
    guide(pts, opts = {}) { return add('guide', pts, opts, 'guide'); },
    gesture(pts, opts = {}) { return add('gesture', pts, opts, 'guide'); },
    note(x, y, text, opts = {}) { return add('note', [[x, y]], { ...opts, text }, 'none'); },
    decide(question, options, chosen, why = '') {
      doc.decisions.push({ id: newId('dec'), stage: ensureStage().id, question, options, chosen, why, by, t: clock });
      return chosen;
    },
    /** A line going for a walk: heading in degrees, turn(i, t) returns degrees to turn each step. */
    walk({ from = [0, 0], heading = 0, steps = 50, step = 10, turn = () => 0 } = {}) {
      const pts = [[from[0], from[1]]];
      let [x, y] = from, h = heading;
      for (let i = 0; i < steps; i++) {
        h += turn(i, i / Math.max(1, steps - 1)) || 0;
        const a = (h * Math.PI) / 180;
        x += Math.cos(a) * step; y += Math.sin(a) * step;
        pts.push([x, y]);
      }
      return pts;
    },
    circle(cx, cy, r, n = 48) { return Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * r]); },
    rect(x, y, w, h) { return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]; },
    random(a, b) { const r = rng(); if (a === undefined) return r; if (b === undefined) return r * a; return a + r * (b - a); },
    noise(x, y) { return noise(x, y); },
    seed(n) { rng = mulberry32(n); noise = makeNoise(rng); },
    lerp: (a, b, t) => a + (b - a) * t,
    map: (v, a, b, c, d) => c + ((v - a) / (b - a)) * (d - c),
    range: n => Array.from({ length: n }, (_, i) => i),
    sin: Math.sin, cos: Math.cos, abs: Math.abs, min: Math.min, max: Math.max, sqrt: Math.sqrt, floor: Math.floor, round: Math.round,
    PI: Math.PI, TAU: Math.PI * 2,
    print: (...a) => logs.push(a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' '))
  };

  try {
    // eslint-disable-next-line no-new-func
    // The score runs in its own block, so it may declare names that shadow the vocabulary.
    new Function(...Object.keys(api), `"use strict";\n{\n${source}\n}`)(...Object.values(api));
    if (!doc.stages.length) api.stage('Marks', 'marks');
    doc.meta = { ...(doc.meta || {}), script: source, seed, by, ran: new Date().toISOString() };
    return { doc: normalizeDocument(doc), error: null, logs };
  } catch (err) {
    return { doc: null, error: err.message || String(err), logs };
  }
}

/** Short reference shown in the Script panel and given to models. */
export const SCRIPT_REFERENCE = `artboard(w, h, ground)
stage(name, kind)            kind: ${STAGE_KINDS.join(' | ')}
point(x, y, {size, color, why})
line(points, {brush, width, pressure, taper, wobble, color, why, pressures: t => 0..1})
plane(points, {brush: flat | hatch | stipple, angle, spacing, density, color, why})
guide(points, {why})   gesture(points, {why})   note(x, y, text)
decide(question, options, chosen, why)
walk({from, heading, steps, step, turn: (i, t) => degrees})
circle(cx, cy, r)   rect(x, y, w, h)
random(a, b)  noise(x, y)  seed(n)  lerp  map  range(n)  sin cos PI TAU  print(...)`;
