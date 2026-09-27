/**
 * A board's own code as a p5.js sketch: the score is kept as written (the idea stays readable) and
 * the few studio words it uses are defined after it, in plain p5. Sources become loadImage /
 * createVideo, sampled from their pixels, fitted like the studio does (cover). Minimal: no UI.
 *
 * The studio's point(), line(), plane(), rect() and circle() clash with p5's own, so in the sketch
 * they are drawPoint(), drawLine(), drawPlane(), rectPoints() and circlePoints().
 *
 * Not carried over (a comment says so): fit() (the shape fitter), pose / hands / mask (use ml5.js),
 * custom brushes (marks are drawn plainly), several boards.
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
  const missing = ['fit', 'brush', 'board', 'decide', 'sculpt', 'guide', 'gesture'].filter(uses);
  const landmarks = /\.(pose|hands|mask)\b/.test(code);
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
  if (need.has('drawPoint')) defs.push(`// A point: a dot of a size (in pixels) and a color.
function drawPoint(x, y, o = {}) {
  noStroke();
  fill(o.color || ${INK});
  circle(x${S}, y${SY}, o.size ?? 12);
}`);
  if (need.has('drawLine')) defs.push(`// A line through a list of points: smooth unless its path is 'straight'.
function drawLine(pts, o = {}) {
  noFill();
  stroke(o.color || ${INK});
  strokeWeight(o.width ?? 3);
  shape(pts, o.path !== 'straight', o.closed);
}`);
  if (need.has('drawPlane')) defs.push(`// A plane: a filled, closed shape.
function drawPlane(pts, o = {}) {
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
  if (uses('note')) defs.push(`function note(x, y, words) {
  noStroke();
  fill(${INK});
  text(words, x${S}, y${SY});
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
    value: (x, y) => { const [r, g, b] = rgb(x, y); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; }${landmarks ? `,
    pose: [], hands: [], mask: () => 0   // landmarks: not in plain p5 (see ml5.js: bodyPose, handPose, bodySegmentation)` : ''}
  };
}`);

  const files = names.map(n => sources[n]);
  const q = JSON.stringify;
  // p5 2.x loads files with await in an async setup(); p5 1.x in preload().
  const loads = names.filter(n => sources[n].kind === 'image' || sources[n].kind === 'animated')
    .map(n => `sources[${q(n)}] = ${v1 ? '' : 'await '}loadImage(${q(sources[n].file)});`);
  const starts = [
    ...names.filter(n => sources[n].kind === 'video').map(n => `  sources[${q(n)}] = createVideo(${q(sources[n].file)});\n  sources[${q(n)}].hide();\n  sources[${q(n)}].volume(0);\n  sources[${q(n)}].loop();`),
    ...names.filter(n => sources[n].kind === 'camera').map(n => `  sources[${q(n)}] = createCapture(VIDEO);\n  sources[${q(n)}].hide();`)
  ];
  const preload = !names.length ? '' : `let sources = {};\n${v1 && loads.length ? `\nfunction preload() {\n${loads.map(l => `  ${l}`).join('\n')}\n}\n` : ''}`;
  const startVideo = [...(v1 ? [] : loads.map(l => `  ${l}`)), ...starts];
  const frames = names.filter(n => sources[n].kind === 'animated').map(n => `  sources[${JSON.stringify(n)}].setFrame(frameCount % sources[${JSON.stringify(n)}].numFrames());   // the GIF's next frame`);
  const looping = loop && moving;

  const head = [`// ${board?.title || 'A board'}: its code from Artist Model Studio, as a p5.js sketch.`,
    absolute ? '// Coordinates are in pixels.' : '// Coordinates are fractions of the canvas (0..1), as in the studio.',
    ...(missing.length ? [`// Not in this sketch: ${missing.map(m => `${m}()`).join(', ')} (studio only; see the note at the end).`] : []),
    ...(files.some(f => f.file) ? [`// Needs ${files.filter(f => f.file).map(f => f.file).join(', ')} next to it.`] : [])].join('\n');

  return `${head}
${preload ? `\n${preload}` : ''}
${v1 || !loads.length ? '' : 'async '}function setup() {
  createCanvas(${Math.round(board?.width || 800)}, ${Math.round(board?.height || 600)});
${startVideo.join('\n')}${startVideo.length ? '\n' : ''}  ${looping ? 'frameRate(12);' : 'noLoop();'}
}

function draw() {
  background('${board?.ground && board.ground !== 'transparent' ? board.ground : '#f3efe6'}');
  randomSeed(${seed});
${frames.join('\n')}${frames.length ? '\n' : ''}${body}
}

// ---- the studio's words it uses, in p5 ----

${defs.join('\n\n')}
${missing.length ? `\n// ${missing.map(m => `${m}()`).join(', ')}: ${missing.includes('fit') ? 'fit() fits shapes to a source with a search that is too long to carry here; ' : ''}run the board in the studio for these.\n` : ''}`;
}

/** An index.html for a sketch (p5 from the CDN; the latest of a major version). */
export function p5SketchHtml(title, version = '2') {
  const v = String(version) === '1' ? '1' : '2';
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>${String(title).replace(/</g, '&lt;')}</title>
  <script src="https://cdn.jsdelivr.net/npm/p5@${v}/lib/p5.min.js"></script>
  <style>body { margin: 0; display: grid; place-items: center; min-height: 100vh; background: #1b1c1f; }</style>
</head>
<body>
  <script src="sketch.js"></script>
</body>
</html>
`;
}
