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
 * Custom brushes (brush({ … draw(ctx, e, p, k) })) run as they are, on p5's drawingContext, with a
 * small kit (frames, smoothPath, tracePath, beginInk, segment, rng, noise, source).
 *
 * Not carried over (a comment says so): fit() (the shape fitter), several boards.
 */

const RENAMES = [['point', 'drawPoint'], ['line', 'drawLine'], ['plane', 'drawPlane'], ['rect', 'rectPoints'], ['circle', 'circlePoints']];

/**
 * source: the board's code. board: { title, width, height, ground }. sources: { name: { file, kind:
 * 'image' | 'animated' | 'video' } } for the sources it reads. loop: redraw every frame (a board
 * that follows moving sources).
 */
export function toP5Code(source, { board, sources = {}, loop = false, seed = 1, version = '2' } = {}) {
  const v1 = String(version) === '1';
  let code = String(source).replace(/\r/g, '');
  for (const [from, to] of RENAMES) code = code.replace(new RegExp(`(?<![.\\w$])${from}\\s*\\(`, 'g'), `${to}(`);
  const absolute = /\bunits\(\s*['"]artboard['"]\s*\)/.test(code);
  code = code.replace(/^\s*units\([^)]*\)\s*;?\s*$/gm, '').replace(/^\s*artboard\([^)]*\)\s*;?\s*$/gm, '');
  const uses = word => new RegExp(`(?<![.\\w$])${word}\\s*\\(`).test(code);
  const missing = ['fit', 'board', 'decide', 'sculpt', 'guide', 'gesture'].filter(uses);
  // What the code asks the sources for (ml5.js models, one per kind).
  const kinds = [/\.pose\b/.test(code) && 'pose', /\.hands\b/.test(code) && 'hands', /\.mask\s*\(/.test(code) && 'mask'].filter(Boolean);
  const brushes = uses('brush');
  const names = Object.keys(sources).filter(n => new RegExp(`source\\(\\s*['"\`]${n}['"\`]`).test(code));
  const moving = names.some(n => sources[n].kind !== 'image');

  const body = code.trim().split('\n').map(l => `  ${l}`).join('\n');
  const S = absolute ? '' : ' * width', SY = absolute ? '' : ' * height';
  const defs = [];
  const need = new Set();
  if (uses('drawPoint')) need.add('drawPoint');
  if (uses('drawLine')) need.add('drawLine').add('shape');
  if (uses('drawPlane')) need.add('drawPlane').add('shape');
  if (uses('source')) need.add('source');

  const INK = "'#1d1b19'";
  const viaBrush = role => (brushes ? `\n  if (o.brush && brushes[o.brush]) return useBrush(${role === 'point' ? '[[x, y]]' : 'pts'}, o, '${role}');` : '');
  if (need.has('drawPoint')) defs.push(`// A point: a dot of a size (in pixels) and a color.
function drawPoint(x, y, o = {}) {${viaBrush('point')}
  noStroke();
  fill(o.color || ${INK});
  circle(x${S}, y${SY}, o.size ?? 12);
}`);
  if (need.has('drawLine')) defs.push(`// A line through a list of points: smooth unless its path is 'straight'.
function drawLine(pts, o = {}) {${viaBrush('line')}
  noFill();
  stroke(o.color || ${INK});
  strokeWeight(o.width ?? 3);
  shape(pts, o.path !== 'straight', o.closed);
}`);
  if (need.has('drawPlane')) defs.push(`// A plane: a filled, closed shape.
function drawPlane(pts, o = {}) {${viaBrush('plane')}
  noStroke();
  fill(o.color || ${INK});
  shape(pts, o.path !== 'straight', true);
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
  if (/(?<![.\w$])range\s*\(/.test(code) || defs.some(d => d.includes('range('))) defs.push(`function range(n) {
  return Array.from({ length: n }, (_, i) => i);
}`);
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
  if (need.has('source')) defs.push(`// A source, sampled where you ask: the picture covers the canvas (cropped to its shape).
// x, y are ${absolute ? 'pixels' : 'fractions of the canvas'}.
function source(name) {
  const img = sources[name];
  img.loadPixels();
  const iw = img.width, ih = img.height;
  const k = max(width / iw, height / ih), ox = (width - iw * k) / 2, oy = (height - ih * k) / 2;
  const rgb = (x, y) => {
    const u = constrain(floor((x${S} - ox) / k), 0, iw - 1);
    const v = constrain(floor((y${SY} - oy) / k), 0, ih - 1);
    const i = 4 * (v * iw + u);
    return [img.pixels[i], img.pixels[i + 1], img.pixels[i + 2]];
  };
  return {
    rgb,
    color: (x, y) => '#' + rgb(x, y).map(c => hex(c, 2)).join(''),
    value: (x, y) => { const [r, g, b] = rgb(x, y); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }${brushes ? `,
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
  if (brushes) defs.push(`// Brushes from the studio: each draws one mark with the canvas's 2D context (p5's drawingContext).
const brushes = {};
function brush(def) {
  brushes[def.id] = def;
}

// A mark for a brush: points [x, y, time, pressure] in pixels, its color and whether it is closed.
function useBrush(pts, o, role) {
  const def = brushes[o.brush], p = {};
  for (const [key, v] of Object.entries(def.params || {})) p[key] = o[key] ?? (Array.isArray(v) ? v[2] : v.default);
  const pressure = i => (typeof o.pressures === 'function' ? o.pressures(i / max(1, pts.length - 1), i) : 0.5);
  const e = { role, color: o.color || kit.INK, closed: role === 'plane' || Boolean(o.closed),
    points: pts.map(([x, y], i) => [x${S}, y${SY}, i * 16, pressure(i)]) };
  push();
  def.draw(drawingContext, e, p, kit);
  pop();
}

// The studio's brush kit, in brief.
const kit = {
  INK: ${INK},
  rng: () => random(),
  noise: (x, y = 0) => noise(x, y) * 2 - 1,
  // A smooth path through the points (Catmull-Rom), n samples per span.
  smoothPath(points, closed = false, n = 8) {
    if (points.length < 3) return points.map(q => q.slice());
    const out = [], m = points.length;
    const at = i => (closed ? points[(i + m) % m] : points[constrain(i, 0, m - 1)]);
    for (let i = 0; i < (closed ? m : m - 1); i++) {
      const [a, b, c, d] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
      for (let s = 0; s < n; s++) {
        const t = s / n, cr = j => 0.5 * (2 * b[j] + (c[j] - a[j]) * t + (2 * a[j] - 5 * b[j] + 4 * c[j] - d[j]) * t * t + (3 * b[j] - a[j] - 3 * c[j] + d[j]) * t * t * t);
        out.push([cr(0), cr(1), lerp(b[2], c[2], t), lerp(b[3], c[3], t)]);
      }
    }
    if (!closed) out.push(points[m - 1].slice());
    return out;
  },
  // Along the mark: each step's place, its normal (nx, ny), speed and pressure.
  frames(e, n = 4) {
    const pts = kit.smoothPath(e.points, e.closed, n);
    return pts.map((q, i) => {
      const a = pts[max(0, i - 1)], b = pts[min(pts.length - 1, i + 1)];
      const d = dist(a[0], a[1], b[0], b[1]) || 1;
      return { x: q[0], y: q[1], nx: -(b[1] - a[1]) / d, ny: (b[0] - a[0]) / d, speed: i ? dist(q[0], q[1], a[0], a[1]) : 0, pressure: q[3] ?? 0.5 };
    });
  },
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
  }${need.has('source') ? `,
  source: name => source(name)` : ''}
};`);

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
  const frames = names.filter(n => sources[n].kind === 'animated').map(n => `  sources[${JSON.stringify(n)}].setFrame(frameCount % sources[${JSON.stringify(n)}].numFrames());   // the GIF's next frame`);
  const looping = loop && moving;

  const head = [`// ${board?.title || 'A board'}: its code from Artist Model Studio, as a p5.js sketch.`,
    absolute ? '// Coordinates are in pixels.' : '// Coordinates are fractions of the canvas (0..1), as in the studio.',
    ...(missing.length ? [`// Not in this sketch: ${missing.map(m => `${m}()`).join(', ')} (studio only; see the note at the end).`] : []),
    ...(files.some(f => f.file) ? [`// Needs ${files.filter(f => f.file).map(f => f.file).join(', ')} next to it.`] : [])].join('\n');

  return `${head}
${preload ? `\n${preload}` : ''}
${v1 || !allLoads.length ? '' : 'async '}function setup() {
  createCanvas(${Math.round(board?.width || 800)}, ${Math.round(board?.height || 600)});
${startVideo.join('\n')}${startVideo.length ? '\n' : ''}  ${looping ? 'frameRate(12);' : 'noLoop();'}
}

function draw() {
  background('${board?.ground && board.ground !== 'transparent' ? board.ground : '#f3efe6'}');
  randomSeed(${seed});
${[...frames, ...asks].join('\n')}${frames.length || asks.length ? '\n' : ''}${body}
}

// ---- the studio's words it uses, in p5 ----

${defs.join('\n\n')}
${missing.length ? `\n// ${missing.map(m => `${m}()`).join(', ')}: ${missing.includes('fit') ? 'fit() fits shapes to a source with a search that is too long to carry here; ' : ''}run the board in the studio for these.\n` : ''}`;
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
