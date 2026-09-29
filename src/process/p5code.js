/**
 * A board's own code as a p5.js sketch: the score is kept as written (the idea stays readable) and
 * the few studio words it uses are defined after it, in plain p5. Sources become loadImage /
 * createVideo, sampled from their pixels, fitted like the studio does (cover). Minimal: no UI.
 *
 * The studio's point(), line(), plane(), rect() and circle() clash with p5's own, so in the sketch
 * they are drawPoint(), drawLine(), drawPlane(), rectPoints() and circlePoints().
 *
 * Pose, hands and a person mask come from ml5.js (bodyPose BlazePose: the same 33 points as the
 * studio; handPose: 21; bodySegmentation SelfieSegmentation), loaded only when the code asks.
 * Brushes (brush({ … draw(ctx, e, p, k) }), and the studio's own textured ones by name: charcoal,
 * chalk, pencil, bristles, oil, marker, wash) run as they are, on p5's drawingContext, with the studio's
 * kit: its walk (frames, smoothPath), tracePath, beginInk, segment, rng, noise, source, and, for the
 * textured ones, its layer kit (paint, dabs, hairs, wash: texture.js, embedded). Marks may carry a time
 * envelope (time: { in, hold, out, life, draw }, born): they fade and draw on by their age (envelope.js).
 *
 * fit() comes as a compact greedy fitter (rectangles and circles; live: true keeps its shapes between
 * frames through state()), and state(name) as an object kept across draw() calls.
 * Not carried over (a comment says so): several boards, decide, sculpt, guide, gesture.
 */

import { BRUSHES, brushSource } from './brushes.js';
import walkSrc from './walk.js?raw';
import textureSrc from './texture.js?raw';
import envelopeSrc from './envelope.js?raw';

// A module of the studio, as a value in the sketch: its source without import and export, in a function of its own.
const strip = src => src.replace(/^import[^;]*;\s*$/gm, '').replace(/^export\s+\{[^}]*\};?\s*$/gm, '').replace(/^export\s+(default\s+)?/gm, '');
const moduleAs = (src, take) => `(() => {\n${strip(src).trim().split('\n').map(l => `  ${l}`.trimEnd()).join('\n')}\n  return { ${take.join(', ')} };\n})()`;

const RENAMES = [['point', 'drawPoint'], ['line', 'drawLine'], ['plane', 'drawPlane'], ['rect', 'rectPoints'], ['circle', 'circlePoints']];

/**
 * source: the board's code. board: { title, width, height, ground }. sources: { name: { file, kind:
 * 'image' | 'animated' | 'video' } } for the sources it reads. loop: redraw every frame (a board
 * that follows moving sources).
 */
export function toP5Code(source, { board, sources = {}, loop = false, seed = 1, version = '2', rate = 0 } = {}) {
  const v1 = String(version) === '1';
  let code = String(source).replace(/\r/g, '');
  for (const [from, to] of RENAMES) code = code.replace(new RegExp(`(?<![.\\w$])${from}\\s*\\(`, 'g'), `${to}(`);
  const absolute = /\bunits\(\s*['"]artboard['"]\s*\)/.test(code);
  code = code.replace(/^\s*units\([^)]*\)\s*;?\s*$/gm, '').replace(/^\s*artboard\([^)]*\)\s*;?\s*$/gm, '');
  const uses = word => new RegExp(`(?<![.\\w$])${word}\\s*\\(`).test(code);
  const missing = ['board', 'decide', 'sculpt', 'guide', 'gesture'].filter(uses);
  if (/\.face\b|\.track\(\s*['"]face/.test(code)) missing.push('source.face');   // (the face model is studio-only; ml5's faceMesh has no expression scores)
  // What the code asks the sources for (ml5.js models, one per kind).
  const kinds = [/\.pose\b/.test(code) && 'pose', /\.hands\b/.test(code) && 'hands', /\.mask\s*\(/.test(code) && 'mask'].filter(Boolean);
  // Brushes: the code's own, and the studio's textured ones it asks for by name (their source goes in the sketch).
  const builtIn = Object.keys(BRUSHES).filter(id => BRUSHES[id].texture && new RegExp(`['"\`]${id}['"\`]`).test(code));
  const brushes = uses('brush') || builtIn.length > 0;
  const texture = builtIn.length > 0 || /\bk\.(paint|dabs|hairs|wash|bounds|hash|layer|grain)\b/.test(code);
  const timed = /\b(time|born)\s*:/.test(code);
  const names = Object.keys(sources).filter(n => new RegExp(`(source|fit)\\(\\s*['"\`]${n}['"\`]`).test(code));
  const moving = names.some(n => sources[n].kind !== 'image');

  const body = code.trim().split('\n').map(l => `  ${l}`).join('\n');
  const S = absolute ? '' : ' * width', SY = absolute ? '' : ' * height';
  const defs = [];
  const need = new Set();
  if (uses('drawPoint')) need.add('drawPoint');
  if (uses('drawLine')) need.add('drawLine').add('shape');
  if (uses('drawPlane')) need.add('drawPlane').add('shape');
  if (uses('source') || uses('fit')) need.add('source');
  if (uses('fit')) need.add('drawPlane').add('shape');

  const INK = "'#1d1b19'";
  const viaBrush = role => (brushes ? `\n  if (o.brush && brushes[o.brush]) return useBrush(${role === 'point' ? '[[x, y]]' : 'pts'}, o, '${role}');` : '');
  if (need.has('drawPoint')) defs.push(`// A point: a dot of a size (in pixels) and a color.
function drawPoint(x, y, o = {}) {${viaBrush('point')}${timed ? '\n  const a = fade(o);\n  if (a <= 0.003) return;\n  push();\n  drawingContext.globalAlpha *= a;' : ''}
  noStroke();
  fill(o.color || ${INK});
  circle(x${S}, y${SY}, o.size ?? 12);${timed ? '\n  pop();' : ''}
}`);
  if (need.has('drawLine')) defs.push(`// A line through a list of points: smooth unless its path is 'straight'.
function drawLine(pts, o = {}) {${viaBrush('line')}${timed ? '\n  const a = fade(o);\n  if (a <= 0.003) return;\n  pts = drawn(o, pts);\n  push();\n  drawingContext.globalAlpha *= a;' : ''}
  noFill();
  stroke(o.color || ${INK});
  strokeWeight(o.width ?? 3);
  shape(pts, o.path !== 'straight', o.closed);${timed ? '\n  pop();' : ''}
}`);
  if (need.has('drawPlane')) defs.push(`// A plane: a filled, closed shape.
function drawPlane(pts, o = {}) {${viaBrush('plane')}${timed ? '\n  const a = fade(o);\n  if (a <= 0.003) return;\n  push();\n  drawingContext.globalAlpha *= a;' : ''}
  noStroke();
  fill(o.color || ${INK});
  shape(pts, o.path !== 'straight', true);${timed ? '\n  pop();' : ''}
}`);
  if (need.has('shape')) defs.push(v1 ? `function shape(pts, smooth, closed) {
  beginShape();
  if (!smooth) for (const [x, y] of pts) vertex(x${S}, y${SY});
  else {
    // curveVertex needs a control point before the first and after the last (closed: wrap around).
    const seq = closed ? [pts.at(-1), ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts.at(-1)];
    for (const [x, y] of seq) curveVertex(x${S}, y${SY});
  }
  if (closed && !smooth) endShape(CLOSE); else endShape();
}` : `function shape(pts, smooth, closed) {
  beginShape();
  for (const [x, y] of pts) {
    if (smooth) splineVertex(x${S}, y${SY});
    else vertex(x${S}, y${SY});
  }
  if (closed) endShape(CLOSE); else endShape();
}`);
  if (uses('rectPoints')) defs.push(`function rectPoints(x, y, w, h) {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}`);
  if (uses('circlePoints')) defs.push(`function circlePoints(cx, cy, r, n = 48) {
  const ry = r${absolute ? '' : ' * width / height'};
  return range(n).map(i => [cx + cos(i / n * TAU) * r, cy + sin(i / n * TAU) * ry]);
}`);
  if (uses('walk')) defs.push(`// A walk: steps of a length, turning (in degrees) as it goes.
function walk({ from = [0, 0], heading = 0, steps = 50, step = ${absolute ? 10 : 0.01}, turn = () => 0 } = {}) {
  const pts = [from.slice()];
  let [x, y] = from, h = heading;
  for (let i = 0; i < steps; i++) {
    h += turn(i, i / max(1, steps - 1)) || 0;
    x += cos(radians(h)) * step;
    y += sin(radians(h)) * step${absolute ? '' : ' * width / height'};
    pts.push([x, y]);
  }
  return pts;
}`);
  if (uses('fit')) defs.push(`// fit(): greedy shape fitting (the studio's, simplified): each shape is the best of many random tries,
// the one that brings the picture closest to the source. live: true keeps the shapes from one frame
// to the next and replaces the oldest few (the continuous redraw).
function fit(src, o = {}) {
  const s = typeof src === 'string' ? source(src) : src;
  const n = o.shapes ?? 80, tries = o.tries ?? 40, turnover = max(1, round(n * (o.turnover ?? 0.08)));
  const W = 64, H = max(8, round(64 * height / width));
  const target = s.pixels(W, H), memo = state('fit' + (o.key || ''));
  const cells = sh => {
    const out = [];
    if (sh.kind === 'rect') { for (let y = sh.y0; y < sh.y1; y++) for (let x = sh.x0; x < sh.x1; x++) out.push(y * W + x); }
    else for (let y = max(0, ceil(sh.cy - sh.r)); y <= min(H - 1, sh.cy + sh.r); y++)
      for (let x = max(0, ceil(sh.cx - sh.r)); x <= min(W - 1, sh.cx + sh.r); x++)
        if ((x - sh.cx) ** 2 + (y - sh.cy) ** 2 <= sh.r ** 2) out.push(y * W + x);
    return out;
  };
  const colorOf = cs => [0, 1, 2].map(k => { let t = 0; for (const j of cs) t += target[j * 3 + k]; return t / max(1, cs.length); });
  const gain = (img, cs, c) => { let g = 0; for (const j of cs) for (const k of [0, 1, 2]) { const t = target[j * 3 + k]; g += (img[j * 3 + k] - t) ** 2 - (c[k] - t) ** 2; } return g; };
  const paint = (img, cs, c) => { for (const j of cs) for (const k of [0, 1, 2]) img[j * 3 + k] = c[k]; };
  const tryShape = () => {
    const size = 2 + Math.random() * W / 3;
    if (Math.random() < 0.5) {
      const x0 = floor(Math.random() * W), y0 = floor(Math.random() * H);
      return { kind: 'rect', x0, y0, x1: min(W, x0 + 1 + floor(Math.random() * size)), y1: min(H, y0 + 1 + floor(Math.random() * size)) };
    }
    return { kind: 'circle', cx: Math.random() * W, cy: Math.random() * H, r: 1 + Math.random() * size / 2 };
  };
  const ground = colorOf(range(W * H));
  const img = new Float32Array(W * H * 3).map((_, i) => ground[i % 3]);
  memo.shapes = o.live ? (memo.shapes || []).slice((memo.shapes || []).length >= n ? turnover : 0) : [];
  for (const sh of memo.shapes) { const cs = cells(sh); sh.color = colorOf(cs); paint(img, cs, sh.color); }
  while (memo.shapes.length < n) {
    let best = null;
    for (let i = 0; i < tries; i++) {
      const sh = tryShape(), cs = cells(sh);
      if (!cs.length) continue;
      const c = colorOf(cs), g = gain(img, cs, c);
      if (!best || g > best.g) best = { sh, cs, c, g };
    }
    if (!best || best.g <= 0) break;
    best.sh.color = best.c; paint(img, best.cs, best.c); memo.shapes.push(best.sh);
  }
  const hexOf = c => '#' + c.map(v => hex(round(v), 2)).join('');
  const at = (x, y) => [x / W${absolute ? ' * width' : ''}, y / H${absolute ? ' * height' : ''}];
  if (o.ground !== false) drawPlane([at(0, 0), at(W, 0), at(W, H), at(0, H)], { color: hexOf(ground), path: 'straight' });
  for (const sh of memo.shapes) {
    if (sh.kind === 'rect') drawPlane([at(sh.x0, sh.y0), at(sh.x1, sh.y0), at(sh.x1, sh.y1), at(sh.x0, sh.y1)], { color: hexOf(sh.color), path: 'straight' });
    else drawPlane(range(12).map(i => at(sh.cx + sh.r * cos(i / 12 * TAU), sh.cy + sh.r * sin(i / 12 * TAU))), { color: hexOf(sh.color) });
  }
  return memo.shapes.length;
}`);
  if (uses('state') || uses('fit')) defs.push(`// state(name): an object kept from one draw() to the next (for processes that carry on).
const states = {};
function state(name = '') {
  return states[name] ??= {};
}`);
  if (/(?<![.\w$])range\s*\(/.test(code) || defs.some(d => d.includes('range('))) defs.push(`function range(n) {
  return Array.from({ length: n }, (_, i) => i);
}`);
  if (uses('underlay')) defs.push(`// The studio shows a source under a board; in p5 the picture is the source itself (loadImage), so nothing to do.
function underlay() {}`);
  if (uses('stage')) defs.push(`// Stages order the work in the studio; here the code runs top to bottom.
function stage() {}`);
  if (uses('note')) defs.push(`// A note: text from its top-left corner, wrapped to its width (in pixels).
function note(x, y, words, o = {}) {
  const n = o.note || {};
  noStroke();
  fill(o.color || ${INK});
  textSize(n.size ?? 16);
  textFont(n.font === 'mono' ? 'monospace' : n.font === 'serif' ? 'serif' : 'sans-serif');
  textAlign(LEFT, TOP);
  text(words, x${S}, y${SY}, n.width ?? 280);
}`);
  const stills = names.filter(n => sources[n].kind === 'image');
  if (need.has('source')) defs.push(`${stills.length ? 'const pixelsOf = {};   // the pictures\' pixels, once\n\n' : ''}// A source, sampled where you ask: the picture covers the canvas (cropped), or with { fit: 'contain' } all of it shows.
// x, y are ${absolute ? 'pixels' : 'fractions of the canvas'}.
function source(name, o = {}) {
  const img = sources[name];
  ${stills.length ? `// A picture is read once (a browser can take a canvas's contents away: a read that comes back empty is not kept).
  let px;
  if (${JSON.stringify(stills)}.includes(name) && pixelsOf[name]) px = pixelsOf[name];
  else {
    img.loadPixels();
    px = img.pixels;
    if (${JSON.stringify(stills)}.includes(name)) { for (let i = 0; i < px.length; i += 61) if (px[i]) { pixelsOf[name] = px = Uint8ClampedArray.from(px); break; } }
  }` : `img.loadPixels();
  const px = img.pixels;`}
  const iw = img.width, ih = img.height;
  const k = (o.fit === 'contain' ? min : max)(width / iw, height / ih), ox = (width - iw * k) / 2, oy = (height - ih * k) / 2;
  const rgb = (x, y) => {
    const u = floor((x${S} - ox) / k), v = floor((y${SY} - oy) / k);
    if (u < 0 || v < 0 || u >= iw || v >= ih) return [0, 0, 0];   // outside the picture (fit: 'contain')
    const i = 4 * (v * iw + u);
    return [px[i], px[i + 1], px[i + 2]];
  };
  return {
    rgb,
    color: (x, y) => '#' + rgb(x, y).map(c => hex(c, 2)).join(''),
    value: (x, y) => { const [r, g, b] = rgb(x, y); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; },
    // the picture as a w×h grid of r, g, b (as the canvas sees it)
    pixels: (w, h) => {
      const out = new Float32Array(w * h * 3);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.set(rgb((x + 0.5) / w${absolute ? ' * width' : ''}, (y + 0.5) / h${absolute ? ' * height' : ''}), (y * w + x) * 3);
      return out;
    }${brushes ? `,
    // in pixels (brushes work in pixels)
    colorAt: (x, y) => '#' + rgb(x${absolute ? '' : ' / width'}, y${absolute ? '' : ' / height'}).map(c => hex(c, 2)).join(''),
    valueAt: (x, y) => { const [r, g, b] = rgb(x${absolute ? '' : ' / width'}, y${absolute ? '' : ' / height'}); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }` : ''}${kinds.includes('pose') ? `,
    // ml5.js answers in the picture's pixels; here, as in the studio, fractions of the canvas
    pose: (found[name].pose || []).map(p => p.keypoints.map(q => ({ x: (ox + q.x * k) / width, y: (oy + q.y * k) / height, v: q.confidence }))) ` : ''}${kinds.includes('hands') ? `,
    hands: (found[name].hands || []).map(h => h.keypoints.map(q => ({ x: (ox + q.x * k) / width, y: (oy + q.y * k) / height })))` : ''}${kinds.includes('mask') ? `,
    mask: (x, y) => {
      const m = found[name].mask;
      if (!m) return 0;
      if (m.readAt !== frameCount) { m.loadPixels(); m.readAt = frameCount; }
      const u = constrain(floor((x${S} - ox) / k * m.width / iw), 0, m.width - 1);
      const v = constrain(floor((y${SY} - oy) / k * m.height / ih), 0, m.height - 1);
      return m.pixels[4 * (v * m.width + u) + 3] / 255;   // the person is opaque
    }` : ''}
  };
}`);
  if (kinds.length) defs.push(`// Ask a model about a source's current picture; the answer arrives a moment later (then it redraws).
const asking = {};
function ask(model, name, kind) {
  if (asking[name + kind]) return;
  asking[name + kind] = true;
  model.detect(sources[name], r => {
    found[name][kind] = kind === 'mask' ? r.mask : r;
    asking[name + kind] = false;${loop ? '' : '\n    redraw();'}
  });
}`);
  if (timed) defs.push(`// A mark's time envelope (the studio's envelope.js): time: { in, hold, out, life, draw, curve }, born in milliseconds.
const { envelope: lifeAlpha, reveal: lifeReveal, expired: lifeExpired, cutPath: lifeCut } = ${moduleAs(envelopeSrc, ['envelope', 'reveal', 'expired', 'cutPath'])};

function ageOf(o) {
  return (Date.now() - (o.born ?? Date.now())) / 1000;
}

// How visible a mark is now (0 when its life is over).
function fade(o) {
  if (!o.time) return 1;
  const age = ageOf(o);
  return lifeExpired(o.time, age) ? 0 : lifeAlpha(o.time, age);
}

// The part of a line drawn so far (a line that draws itself on), cut by its length as the canvas shows it.
function drawn(o, pts) {
  if (!o.time) return pts;
  const share = lifeReveal(o.time, ageOf(o));
  if (share >= 1) return pts;
  const ry = ${absolute ? '1' : 'height / width'};
  return lifeCut(pts.map(q => [q[0], q[1] * ry, ...q.slice(2)]), share).map(q => [q[0], q[1] / ry, ...q.slice(2)]);
}`);
  if (brushes) defs.push(`// Brushes from the studio: each draws one mark with the canvas's 2D context (p5's drawingContext).
const brushes = {};
function brush(def) {
  brushes[def.id] = def;
}

// The studio's walk: a path resampled (Catmull-Rom), and at each step its place, normal, speed and pressure.
const { smoothPath: walkSmooth, walkFrames } = ${moduleAs(walkSrc, ['smoothPath', 'walkFrames'])};
${texture ? `
// The studio's layer kit: a mark painted into a layer, the paper's grain multiplied in, tinted and put on the picture.
const { txPaint, txDabs, txHairs, txWash, txBounds, txHash, txLayer, txGrain } = ${moduleAs(textureSrc, ['txPaint', 'txDabs', 'txHairs', 'txWash', 'txBounds', 'txHash', 'txLayer', 'txGrain'])};
` : ''}
// A seeded random for a mark (the same mark, the same marks).
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A mark for a brush: points [x, y, time, pressure] in pixels, its color and whether it is closed.
function useBrush(pts, o, role) {
  const def = brushes[o.brush], p = {};
  for (const [key, v] of Object.entries(def.params || {})) p[key] = o[key] ?? (Array.isArray(v) ? v[2] : v.default);
  const pressure = i => (typeof o.pressures === 'function' ? o.pressures(i / max(1, pts.length - 1), i) : 0.5);${timed ? '\n  const a = fade(o);\n  if (a <= 0.003) return;' : ''}
  let seed = o.seed;
  if (seed == null) { seed = 7; for (const q of pts) seed = (seed * 31 + round(q[0] * 1000) + round(q[1] * 1000) * 7) | 0; seed >>>= 0; }
  const shown = ${timed ? 'drawn(o, ' : '('}pts.map(([x, y], i) => [x, y, i * 16, pressure(i)]));
  const e = { role, color: o.color || kit.INK, closed: role === 'plane' || Boolean(o.closed), seed,
    points: shown.map(([x, y, t, q]) => [x${S}, y${SY}, t, q]) };
  const k = Object.create(kit);
  k.rng = seeded(seed);
  k.scale = 1;
  k.age = ${timed ? 'ageOf(o)' : '0'};
  push();${timed ? '\n  drawingContext.globalAlpha *= a;' : ''}
  def.draw(drawingContext, e, p, k);
  pop();
}

// The studio's brush kit.
const kit = {
  INK: ${INK},
  rng: () => random(),
  noise: (x, y = 0) => noise(x, y) * 2 - 1,
  smoothPath: walkSmooth,
  // Along the mark: each step's place, its normal (nx, ny), speed and pressure.
  frames: walkFrames,
  tracePath(ctx, pts, closed) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (closed) ctx.closePath();
  },
  segment(ctx, x1, y1, x2, y2) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  },
  beginInk(ctx, e, p) {
    ctx.save();
    ctx.globalAlpha *= p.opacity ?? 1;
    ctx.strokeStyle = ctx.fillStyle = e.color || kit.INK;
    ctx.lineWidth = p.width ?? 3;
    ctx.lineCap = ctx.lineJoin = 'round';
  },
  // Another brush, or a dot.
  draw(id, ctx, e, p = {}) {
    const d = brushes[id];
    if (d) return d.draw(ctx, e, p, kit);
    ctx.save();
    ctx.globalAlpha *= p.opacity ?? 1;
    ctx.fillStyle = e.color || kit.INK;
    ctx.beginPath();
    ctx.arc(e.points[0][0], e.points[0][1], (p.size ?? 8) / 2, 0, TAU);
    ctx.fill();
    ctx.restore();
  }${texture ? `,
  // Textured painting: paint a mark through a layer (cached), stamp a tip along a walk, hairs, a wash.
  paint(ctx, spec) { return txPaint(ctx, { scale: this.scale ?? 1, ...spec }); },
  dabs: txDabs, hairs: txHairs, wash: txWash, bounds: txBounds, hash: txHash, layer: txLayer, grain: txGrain` : ''}${need.has('source') ? `,
  source: name => source(name)` : ''}
};${builtIn.length ? `

// The studio's own brushes this code asks for, as they are.
${builtIn.map(id => brushSource(id)).join('\n')}` : ''}`);

  const files = names.map(n => sources[n]);
  const q = JSON.stringify;
  const MODELS = { pose: ['bodyPose', "ml5.bodyPose('BlazePose')", '33 points per person, as in the studio'], hands: ['handPose', 'ml5.handPose()', '21 points per hand'], mask: ['bodySegmentation', "ml5.bodySegmentation('SelfieSegmentation', { maskType: 'person' })", 'where a person is'] };
  const modelLoads = kinds.map(kd => `${MODELS[kd][0]} = ${v1 ? '' : 'await '}${MODELS[kd][1]};   // ${MODELS[kd][2]}`);
  // A video or camera is watched continuously; a picture (or a GIF's frame) is asked each time it is drawn.
  // Which source each kind is asked of: source('walk').pose, or const s = source('walk') … s.pose.
  const askedOf = (kd, n) => {
    const vars = [...code.matchAll(new RegExp(`(\\w+)\\s*=\\s*source\\(\\s*['"\`]${n}['"\`]\\s*\\)`, 'g'))].map(m => m[1]);
    return [`source\\(\\s*['"\`]${n}['"\`]\\s*\\)`, ...vars].some(v => new RegExp(`${v}\\.${kd === 'mask' ? 'mask\\s*\\(' : `${kd}\\b`}`).test(code));
  };
  const target = kd => { const hit = names.filter(n => askedOf(kd, n)); return hit.length ? hit : names; };
  const watch = kinds.flatMap(kd => target(kd).filter(n => sources[n].kind === 'video' || sources[n].kind === 'camera')
    .map(n => `  ${MODELS[kd][0]}.detectStart(sources[${q(n)}], r => { found[${q(n)}].${kd} = ${kd === 'mask' ? 'r.mask' : 'r'}; });`));
  const asks = kinds.flatMap(kd => target(kd).filter(n => sources[n].kind === 'image' || sources[n].kind === 'animated')
    .map(n => `  ask(${MODELS[kd][0]}, ${q(n)}, '${kd}');`));
  // p5 2.x loads files with await in an async setup(); p5 1.x in preload().
  const loads = names.filter(n => sources[n].kind === 'image' || sources[n].kind === 'animated')
    .map(n => `sources[${q(n)}] = ${v1 ? '' : 'await '}loadImage(${q(sources[n].file)});`);
  const starts = [
    ...names.filter(n => sources[n].kind === 'video').map(n => `  sources[${q(n)}] = createVideo(${q(sources[n].file)});\n  sources[${q(n)}].hide();\n  sources[${q(n)}].volume(0);\n  sources[${q(n)}].loop();`),
    ...names.filter(n => sources[n].kind === 'camera').map(n => `  sources[${q(n)}] = createCapture(VIDEO);\n  sources[${q(n)}].hide();`)
  ];
  const allLoads = [...loads, ...modelLoads];
  const globals = [names.length && 'let sources = {};', kinds.length && `let ${kinds.map(kd => MODELS[kd][0]).join(', ')};`, kinds.length && `let found = { ${names.map(n => `${q(n)}: {}`).join(', ')} };   // the models' latest answers, per source`].filter(Boolean).join('\n');
  const preload = !globals ? '' : `${globals}\n${v1 && allLoads.length ? `\nfunction preload() {\n${allLoads.map(l => `  ${l}`).join('\n')}\n}\n` : ''}`;
  const startVideo = [...(v1 ? [] : allLoads.map(l => `  ${l}`)), ...starts, ...watch];
  const gifs = names.filter(n => sources[n].kind === 'animated');
  const looping = loop && (moving || rate > 0);
  // GIFs play at their own timing; a sketch that follows only GIFs draws when one shows a new frame
  // (as a studio board that follows its sources runs again on each new frame).
  // (With a redraw rate the sketch draws at that rate, with fresh randomness each time, and the GIF only decides what it sees.)
  const onlyGifs = looping && !rate && gifs.length && names.every(n => sources[n].kind === 'animated' || sources[n].kind === 'image');
  const frames = onlyGifs ? [] : gifs.map(n => `  gifFrame(sources[${JSON.stringify(n)}]);   // the GIF's frame now`);
  const gate = onlyGifs ? `  if (!newFrame()) return;   // nothing new: keep the picture\n` : '';
  if (gifs.length) defs.push(`// A GIF at its own timing (each frame's delay): shows the frame for now; true if it changed.
function gifFrame(img) {
  const f = img.gifProperties && img.gifProperties.frames;
  if (!f) return false;
  const delay = x => x.delay || 100;
  let t = millis() % f.reduce((sum, x) => sum + delay(x), 0), i = 0;
  while (i < f.length - 1 && t >= delay(f[i])) { t -= delay(f[i]); i++; }
  if (img.getCurrentFrame() === i && frameCount > 1) return false;
  img.setFrame(i);
  return true;
}`);
  if (onlyGifs) defs.push(`// Whether any GIF shows a new frame (the first frame always draws).
function newFrame() {
  return [${gifs.map(n => JSON.stringify(n)).join(', ')}].map(n => gifFrame(sources[n])).some(Boolean) || frameCount === 1;
}`);

  const head = [`// ${board?.title || 'A board'}: its code from Artist Model Studio, as a p5.js sketch.`,
    absolute ? '// Coordinates are in pixels.' : '// Coordinates are fractions of the canvas (0..1), as in the studio.',
    ...(missing.length ? [`// Not in this sketch: ${missing.map(m => (m.includes('.') ? m : `${m}()`)).join(', ')} (studio only; see the note at the end).`] : []),
    ...(files.some(f => f.file) ? [`// Needs ${files.filter(f => f.file).map(f => f.file).join(', ')} next to it.`] : [])].join('\n');

  return `${head}
${preload ? `\n${preload}` : ''}
${v1 || !allLoads.length ? '' : 'async '}function setup() {
  createCanvas(${Math.round(board?.width || 800)}, ${Math.round(board?.height || 600)});
${startVideo.join('\n')}${startVideo.length ? '\n' : ''}  ${looping ? `frameRate(${rate > 0 ? Math.round(rate) : 30});` : 'noLoop();'}
}

function draw() {
${gate}  background('${board?.ground && board.ground !== 'transparent' ? board.ground : '#f3efe6'}');
  randomSeed(${rate > 0 ? 'frameCount' : seed});
${[...frames, ...asks].join('\n')}${frames.length || asks.length ? '\n' : ''}${body}
}

// ---- the studio's words it uses, in p5 ----

${defs.join('\n\n')}
${missing.length ? `\n// ${missing.map(m => (m.includes('.') ? m : `${m}()`)).join(', ')}: run the board in the studio for these.\n` : ''}`;
}

/** An index.html for a sketch (p5 from the CDN, the latest of a major version; ml5.js when it uses pose, hands or a mask). */
export const usesMl5 = code => /\bml5\./.test(code);

export function p5SketchHtml(title, version = '2', { ml5 = false } = {}) {
  const v = String(version) === '1' ? '1' : '2';
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${String(title).replace(/</g, '&lt;')}</title>
  <script src="https://cdn.jsdelivr.net/npm/p5@${v}/lib/p5.min.js"></script>${ml5 ? '\n  <script src="https://cdn.jsdelivr.net/npm/ml5@1/dist/ml5.min.js"></script>' : ''}
  <style>body { margin: 0; display: grid; place-items: center; min-height: 100vh; background: #1b1c1f; }</style>
</head>
<body>
  <script src="sketch.js"></script>
</body>
</html>
`;
}
