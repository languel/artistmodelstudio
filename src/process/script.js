/**
 * Authoring library: a small point / line / plane vocabulary for JS.
 *
 * A script is the score; running it records a process document (the performance).
 * Every call becomes an element or a decision with its stage, parameters, seed,
 * reason (`why`) and author. The same scripts export as p5 sketches.
 *
 *   artboard(1000, 1000, '#f3efe6')
 *   stage('Construction', 'construction')           // later calls land in this stage
 *   decide('Where does the weight sit?', ['low left', 'center'], 'low left', 'lower left feels heavy')
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
import { BRUSHES, mulberry32, installLines, defSource, registerBrush, isBuiltin } from './brushes.js';

const ELEMENT_KEYS = new Set(['why', 'color', 'brush', 'stage', 'closed', 'pressures', 'text', 'seed', 'by', 'label', 'opacity', 'blend', 'note', 'src', 'asset', 'hidden', 'locked', 'group', 'id']);

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
export function runScript(source, opts = {}) {
  // Fractions of the artboard by default; units('artboard' | 'fraction') decides explicitly. A score
  // without units() whose coordinates are clearly absolute (beyond 0..1) is rerun in artboard units.
  const explicit = (String(source).match(/\bunits\(\s*['"](fraction|artboard)['"]\s*\)/) || [])[1];
  if (explicit) return runOnce(source, { ...opts, units: explicit });
  const first = runOnce(source, { ...opts, units: 'fraction' });
  if (first.maxRaw > 2.5) return runOnce(source, { ...opts, units: 'artboard' });
  return first;
}

function runOnce(source, { seed = 1, by = { kind: 'script', name: 'script' }, base = null, units = 'fraction' } = {}) {
  const doc = base ? normalizeDocument(base) : createDocument();
  if (!base) doc.stages = [];
  let rng = mulberry32(seed);
  let noise = makeNoise(rng);
  let current = null;
  let clock = 0; // synthetic time so scripted paths carry an order and a duration
  const abm = String(source).match(/\bartboard\(\s*([\d.]+)\s*,\s*([\d.]+)/);
  const W = abm ? Number(abm[1]) : doc.artboard.width, H = abm ? Number(abm[2]) : doc.artboard.height;
  const frac = units === 'fraction';
  const aspect = W / H;
  let maxRaw = 0;
  // Score coordinates → artboard units (fractions are scaled by the artboard's width and height).
  const toAb = pts => pts.map(q => { maxRaw = Math.max(maxRaw, Math.abs(q[0]), Math.abs(q[1])); return frac ? [q[0] * W, q[1] * H, ...q.slice(2)] : q; });
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
    // stage: an existing stage's id or name (created if new), else the current stage.
    const named = el.stage ? doc.stages.find(st => st.id === el.stage || st.name === el.stage) : null;
    const stage = named ? named.id : el.stage ? api.stage(String(el.stage), 'marks').id : ensureStage().id;
    const brush = el.brush || defaultBrush;
    installLines(doc);
    if (!BRUSHES[brush]) throw new Error(`Unknown brush "${brush}" (have: ${Object.keys(BRUSHES).join(', ')})`);
    const e = {
      id: newId(role), stage, role,
      points: timed(toAb(pts), el.pressures),
      closed: role === 'plane' ? true : Boolean(el.closed),
      realize: { brush, params },
      color: el.color || null,
      text: el.text,
      ...Object.fromEntries(['label', 'opacity', 'blend', 'note', 'src', 'asset', 'hidden', 'locked', 'group'].filter(k => el[k] !== undefined).map(k => [k, el[k]])),
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
    /** A picture placed through its four corners (top-left, top-right, bottom-right, bottom-left): image(corners, { src }). */
    image(corners, opts = {}) { return add('image', corners, opts, 'image'); },
    /**
     * Create a line before drawing it: defineLine(name, [{ doc, params: { key: [min, max, default] } },] (ctx, frames, p, env) => { ... })
     * frames: [{ x, y, nx, ny, speed, pressure }] along the walk; env: { color, rng, closed, points }. Then line(pts, { brush: name }).
     */
    defineLine(name, spec, fn) {
      if (typeof spec === 'function') { fn = spec; spec = {}; }
      if (typeof name !== 'string' || !/^[a-z][\w-]*$/i.test(name)) throw new Error('defineLine(name, fn): name must be a word like "teeth"');
      if (typeof fn !== 'function') throw new Error('defineLine(name, fn): fn draws the line: (ctx, frames, p, env) => { ... }');
      if (BRUSHES[name] && !BRUSHES[name].custom) throw new Error(`"${name}" is a built-in brush; choose another name`);
      doc.lines = doc.lines || {};
      doc.lines[name] = { source: fn.toString(), doc: spec.doc || '', params: spec.params || {} };
      installLines(doc);
      return name;
    },
    /**
     * Define a brush in code (kept in the drawing): brush({ id, label, roles, doc,
     * params: { key: [min, max, default, doc] }, draw(ctx, e, p, k) { … } }). Then line(pts, { brush: id }).
     */
    brush(def) {
      if (!def || typeof def !== 'object' || typeof def.draw !== 'function') throw new Error('brush({ id, params, draw(ctx, e, p, k) { … } })');
      if (isBuiltin(def.id)) throw new Error(`"${def.id}" is a built-in brush; give yours its own id`);
      const src = defSource(def);
      registerBrush(src, 'doc');
      doc.brushes = doc.brushes || {};
      doc.brushes[def.id] = src;
      return def.id;
    },
    decide(question, options, chosen, why = '') {
      doc.decisions.push({ id: newId('dec'), stage: ensureStage().id, question, options, chosen, why, by, t: clock });
      return chosen;
    },
    /** A line going for a walk: heading in degrees, turn(i, t) returns degrees to turn each step. */
    walk({ from = [0, 0], heading = 0, steps = 50, step = frac ? 0.01 : 10, turn = () => 0 } = {}) {
      const pts = [[from[0], from[1]]];
      let [x, y] = from, h = heading;
      for (let i = 0; i < steps; i++) {
        h += turn(i, i / Math.max(1, steps - 1)) || 0;
        const a = (h * Math.PI) / 180;
        x += Math.cos(a) * step; y += Math.sin(a) * step * (frac ? aspect : 1);   // in fractions, keep the walk's shape
        pts.push([x, y]);
      }
      return pts;
    },
    circle(cx, cy, r, n = 48) { const ry = frac ? r * aspect : r; return Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * Math.PI * 2) * r, cy + Math.sin((i / n) * Math.PI * 2) * ry]); },
    units() { /* read before the run: units('fraction') or units('artboard') */ },
    width: W, height: H,
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
    doc.meta.units = units;
    return { doc: normalizeDocument(doc), error: null, logs, maxRaw, units };
  } catch (err) {
    // The score's own line: V8 counts the Function header (2 lines) and our wrapper (2 lines).
    const m = String(err.stack || '').match(/<anonymous>:(\d+):(\d+)/);
    const errorLine = m ? Math.max(1, Number(m[1]) - 4) : null;
    return { doc: null, error: err.message || String(err), errorLine, logs, maxRaw: 0, units };
  }
}

/** Short reference shown in the Script panel and given to models. */
export const SCRIPT_REFERENCE = `// Coordinates are fractions of the artboard (0..1); width and height give its size. units('artboard') for absolute.
artboard(w, h, ground)
stage(name, kind)            kind: ${STAGE_KINDS.join(' | ')}
point(x, y, {size, color, why})
line(points, {brush, width, pressure, taper, wobble, color, why, pressures: t => 0..1})
plane(points, {brush: flat | hatch | stipple, angle, spacing, density, color, why})
guide(points, {why})   gesture(points, {why})   note(x, y, text)
decide(question, options, chosen, why)
brush({id, label, roles, doc, params: {k: [min, max, def, doc]}, draw(ctx, e, p, k) {...}})   then line(pts, {brush: id})
  k: frames(e) smoothPath spans rotatePts segment beginInk tracePath draw(id, ctx, e, p) rng() noise(x, y)
defineLine(name, {doc, params: {k: [min, max, def]}}, (ctx, frames, p, env) => {...})   (shorthand)
  frames: [{x, y, nx, ny, speed, pressure}]   env: {color, rng, closed}
walk({from, heading, steps, step, turn: (i, t) => degrees})
circle(cx, cy, r)   rect(x, y, w, h)
random(a, b)  noise(x, y)  seed(n)  lerp  map  range(n)  sin cos PI TAU  print(...)`;

/** The vocabulary as data: completions and hover docs in the editor, and references for models. */
export const SCRIPT_VOCAB = [
  ['artboard', 'artboard(width, height, ground)', 'Size of the sheet and its paper color.'],
  ['width', 'width', 'The artboard width in artboard units (coordinates are fractions: 0..1 across).'],
  ['height', 'height', 'The artboard height in artboard units (coordinates are fractions: 0..1 down).'],
  ['units', "units('fraction' | 'artboard')", "Coordinates as fractions of the artboard (the default) or in artboard units."],
  ['brush', "brush({ id, label, roles, doc, params: { key: [min, max, default, doc] }, draw(ctx, e, p, k) { … } })", 'Define a brush in code (the drawing keeps it). k is the brush kit: k.frames, k.smoothPath, k.spans, k.segment, k.beginInk, k.rng, k.noise, k.draw.'],
  ['stage', "stage(name, kind)", `Start a stage; later marks land in it. kind: ${STAGE_KINDS.join(', ')}.`],
  ['point', 'point(x, y, { size, color, why })', 'A mark at a place.'],
  ['points', 'points([[x, y], …], opts)', 'Several points with the same options.'],
  ['line', "line(points, { brush, width, pressure, taper, wobble, color, why, pressures: t => 0..1 })", 'A point that moved. Brushes: ink, speed, restate, zigzag, inner, dotted, arcs, or your own (defineLine).'],
  ['plane', "plane(points, { brush: 'flat' | 'hatch' | 'stipple', angle, spacing, density, color, why })", 'An enclosed area.'],
  ['guide', 'guide(points, { why })', 'Construction: axes, proportions (process view only).'],
  ['gesture', 'gesture(points, { why })', 'The movement behind a form (process view only).'],
  ['note', 'note(x, y, text)', 'Writing on the process.'],
  ['decide', 'decide(question, options, chosen, why)', 'Record a decision; returns the chosen option.'],
  ['defineLine', 'defineLine(name, { doc, params: { key: [min, max, default] } }, (ctx, frames, p, env) => { … })', 'Create your own line. frames: [{ x, y, nx, ny, speed, pressure }]; env: { color, rng, closed }. Then line(pts, { brush: name }).'],
  ['walk', 'walk({ from: [x, y], heading, steps, step, turn: (i, t) => degrees })', 'A line going for a walk: returns its points.'],
  ['circle', 'circle(cx, cy, r, n = 48)', 'Points around a circle.'],
  ['rect', 'rect(x, y, w, h)', 'The four corners of a rectangle.'],
  ['random', 'random(a, b)', 'Seeded random: random() 0..1, random(b) 0..b, random(a, b).'],
  ['noise', 'noise(x, y)', 'Seeded smooth noise, about -1..1.'],
  ['seed', 'seed(n)', 'Reseed random() and noise().'],
  ['lerp', 'lerp(a, b, t)', 'Linear interpolation.'],
  ['map', 'map(v, a, b, c, d)', 'Map v from a..b to c..d.'],
  ['range', 'range(n)', '[0, 1, …, n-1]'],
  ['print', 'print(...values)', 'Write to the output under the editor.'],
  ['sin', 'sin(a)', ''], ['cos', 'cos(a)', ''], ['abs', 'abs(v)', ''], ['min', 'min(...v)', ''], ['max', 'max(...v)', ''],
  ['sqrt', 'sqrt(v)', ''], ['floor', 'floor(v)', ''], ['round', 'round(v)', ''], ['PI', 'PI', 'π'], ['TAU', 'TAU', '2π']
].map(([name, signature, doc]) => ({ name, signature, doc }));
