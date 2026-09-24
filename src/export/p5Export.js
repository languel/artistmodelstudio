/**
 * p5.js export: turns an AMS drawing program into a standalone p5 sketch, and
 * packages it with a vendored p5.min.js as a self-contained project zip.
 *
 * Flat programs are drawn with p5 primitives using FlatCanvasMedium's geometry.
 * Watercolor programs use a vendored p5.brush and the studio's own watercolor
 * routine (src/media/watercolorBrush.js, embedded verbatim); W switches
 * between the watercolor and flat renderers.
 * Pixel programs are replayed from frames baked with the app's own
 * PixelMedium, so they match the studio exactly.
 */
import { normalizeProgram } from '../language/normalize.js';
import { createZip } from './zip.js';
import watercolorSource from '../media/watercolorBrush.js?raw';
import fitReferenceSource from '../fitting/fitReference.js?raw';
import continuousSource from '../fitting/continuousFit.js?raw';
import continuousWatercolorSource from '../fitting/continuousWatercolor.js?raw';
import continuousSceneSource from '../fitting/continuousScene.js?raw';

const MAX_FRAMES = 150;
const MAX_PIXEL_FRAMES = 60;

/** Frame action counts for an animation of `total` actions, capped at `max` frames. */
export function frameSteps(total, max = MAX_FRAMES) {
  const step = Math.max(1, Math.ceil(total / max));
  const steps = [];
  for (let n = step; n < total; n += step) steps.push(n);
  steps.push(total);
  return steps;
}

/** Render partial programs with the real PixelMedium and palette-index the grids. */
async function bakePixelFrames(program, medium) {
  const actions = program.actions;
  const palette = [];
  const index = new Map();
  const frames = [];
  const counts = actions.length ? frameSteps(actions.length, MAX_PIXEL_FRAMES) : [0];
  for (const n of counts) {
    await medium.render({ ...program, actions: actions.slice(0, n) });
    frames.push(medium.grid.map(c => {
      const key = c ?? '#000000';
      if (!index.has(key)) { index.set(key, palette.length); palette.push(key); }
      return index.get(key);
    }));
  }
  await medium.render(program); // leave the medium showing the full program
  return { cols: medium.cols, rows: medium.rows, palette, frames };
}

// Runtime shared by every exported sketch. Plain ES5-style JS so it runs anywhere p5 runs.
const RUNTIME = String.raw`
// ---------------------------------------------------------------------------
// Renderer (normalized coordinates: -1..1 on both axes, sizes on the short side)
// ---------------------------------------------------------------------------
let shown = 0;          // actions (or pixel frame) currently drawn
let animating = false;
let looping = false;
let uiVisible = false;
let fitMode = true;     // true: keep the square artwork, letterboxed; false: stretch to fill
let renderer = PIXEL ? 'pixel' : (MEDIUM === 'watercolor' && typeof brush !== 'undefined' ? 'watercolor' : 'flat');
let wcCanvas = null;
let panel;
let view = { x: 0, y: 0, w: 1, h: 1 };  // drawing area inside the window
const LETTERBOX = '#111111';

const FRAMES = PIXEL ? PIXEL.frames.length : null;
const TOTAL = PIXEL ? FRAMES : PROGRAM.actions.length;
// Watercolor frames are full p5.brush renders, so animate them in fewer steps.
function stepSize() { return PIXEL ? 1 : Math.max(1, Math.ceil(TOTAL / (renderer === 'watercolor' ? 60 : 150))); }

function setup() {
  createCanvas(windowWidth, windowHeight);
  noLoop();
  buildPanel();
  shown = TOTAL;
  paint(shown);
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  paint(shown);
}

function draw() {
  if (!animating) return;
  shown = Math.min(TOTAL, shown + stepSize());
  paint(shown);
  if (shown >= TOTAL) {
    if (looping) {
      shown = 0;
    } else {
      animating = false;
      noLoop();
      updatePanel();
    }
  }
}

function paint(n) {
  if (PIXEL) paintPixels(Math.max(0, Math.min(FRAMES - 1, n - 1)));
  else if (renderer === 'watercolor') paintBrush(n);
  else paintActions(n);
}

// p5.brush binds to the first canvas it is given, so render into one fixed
// square canvas and scale it into the view (fit or fill).
const WC_LONG = 1200;
function paintBrush(n) {
  updateView();
  background(LETTERBOX);
  if (!wcCanvas) {
    wcCanvas = document.createElement('canvas');
    wcCanvas.width = ASPECT >= 1 ? WC_LONG : Math.round(WC_LONG * ASPECT);
    wcCanvas.height = ASPECT >= 1 ? Math.round(WC_LONG / ASPECT) : WC_LONG;
  }
  paintWatercolor(brush, wcCanvas, PROGRAM.actions.slice(0, n), { seed: WATERCOLOR_SEED });
  drawingContext.drawImage(wcCanvas, view.x, view.y, view.w, view.h);
}

function updateView() {
  if (fitMode) {
    const vw = Math.min(width, height * ASPECT), vh = vw / ASPECT;
    view = { x: (width - vw) / 2, y: (height - vh) / 2, w: vw, h: vh };
  } else {
    view = { x: 0, y: 0, w: width, h: height };
  }
}

function toX(x) { return view.x + (x + 1) * 0.5 * view.w; }
function toY(y) { return view.y + (y + 1) * 0.5 * view.h; }
function toSize(s) { return s * 0.5 * Math.min(view.w, view.h); }

// Invalid colours (e.g. a stray edit) are skipped, as the studio's canvas does.
// p5 2.x only throws when a bad colour is drawn, so check the string up front.
function isValidColor(value) {
  return typeof value === 'string' && typeof CSS !== 'undefined' && CSS.supports('color', value);
}
function safeColor(value, fallback) {
  if (typeof value === 'number' || isValidColor(value)) return color(value);
  return fallback === undefined ? null : color(fallback);
}

function withAlpha(hex, opacity) {
  const c = safeColor(hex, '#808080');
  c.setAlpha(255 * (opacity === undefined ? 1 : opacity));
  return c;
}

function paintArea(c) {
  noStroke();
  fill(c);
  rect(view.x, view.y, view.w, view.h);
}

function paintActions(n) {
  const strokeScale = view.w / 400;
  let hasFill = true, hasStroke = false;
  let fillColor = '#333333', fillOpacity = 1;
  let strokeColor = '#111111', strokeOpacity = 1, strokeW = 1;
  updateView();
  background(LETTERBOX);
  paintArea(255);

  const applyStyle = (override) => {
    if (hasFill || override) fill(withAlpha(override || fillColor, fillOpacity)); else noFill();
    if (hasStroke) { stroke(withAlpha(strokeColor, strokeOpacity)); strokeWeight(strokeW * strokeScale); } else noStroke();
  };

  for (let i = 0; i < n; i++) {
    const a = PROGRAM.actions[i];
    switch (a.op) {
      case 'background':
      case 'clear': { const c = safeColor(a.color || '#ffffff'); if (c) paintArea(c); break; }
      case 'fill': hasFill = true; fillColor = a.color || '#000000'; if (a.opacity !== undefined) fillOpacity = a.opacity; break;
      case 'noFill': hasFill = false; break;
      case 'stroke': hasStroke = true; strokeColor = a.color || '#000000'; if (a.width !== undefined) strokeW = a.width; if (a.opacity !== undefined) strokeOpacity = a.opacity; break;
      case 'noStroke': hasStroke = false; break;
      case 'strokeWidth': strokeW = a.width === undefined ? 1 : a.width; break;
      case 'circle': applyStyle(); circle(toX(a.x), toY(a.y), Math.max(1, toSize(a.diameter))); break;
      case 'rect': {
        applyStyle(a.color);
        const w = toSize(a.width), h = toSize(a.height);
        rect(toX(a.x) - w / 2, toY(a.y) - h / 2, w, h);
        break;
      }
      case 'line':
        stroke(withAlpha(a.color || strokeColor, strokeOpacity));
        strokeWeight(strokeW * strokeScale);
        line(toX(a.x1), toY(a.y1), toX(a.x2), toY(a.y2));
        break;
      case 'polygon':
      case 'polyline': {
        if (!a.points || a.points.length < 2) break;
        if (a.op === 'polygon') applyStyle();
        else { noFill(); stroke(withAlpha(a.color || strokeColor, strokeOpacity)); strokeWeight(strokeW * strokeScale); }
        beginShape();
        for (const p of a.points) vertex(toX(p[0]), toY(p[1]));
        if (a.op === 'polygon') endShape(CLOSE); else endShape();
        break;
      }
      default: break; // medium-specific ops (e.g. brush.*) are not reproduced
    }
  }
}

function paintPixels(f) {
  const grid = PIXEL.frames[f];
  // Fit keeps square cells; fill stretches cells to the window.
  const cw = fitMode ? Math.min(width / PIXEL.cols, height / PIXEL.rows) : width / PIXEL.cols;
  const ch = fitMode ? cw : height / PIXEL.rows;
  const ox = (width - cw * PIXEL.cols) / 2, oy = (height - ch * PIXEL.rows) / 2;
  background(LETTERBOX);
  noStroke();
  for (let y = 0; y < PIXEL.rows; y++) {
    for (let x = 0; x < PIXEL.cols; x++) {
      fill(safeColor(PIXEL.palette[grid[y * PIXEL.cols + x]], '#000000'));
      rect(ox + x * cw, oy + y * ch, Math.ceil(cw), Math.ceil(ch));
    }
  }
}

// ---------------------------------------------------------------------------
// Controls: hidden until U is pressed
//   U toggle panel · R re-render · A animate · L loop · F fit/fill
//   W watercolor/flat renderer · S save PNG
// ---------------------------------------------------------------------------
function rerender() { animating = false; noLoop(); shown = TOTAL; paint(shown); updatePanel(); }
function animate() { shown = 0; animating = true; loop(); updatePanel(); }
function toggleLoop() { looping = !looping; if (looping && !animating) animate(); updatePanel(); }
function toggleFit() { fitMode = !fitMode; paint(shown); updatePanel(); }
function toggleRenderer() {
  if (PIXEL || typeof brush === 'undefined') return;
  renderer = renderer === 'watercolor' ? 'flat' : 'watercolor';
  paint(shown);
  updatePanel();
}
function savePNG() { saveCanvas(TITLE_SLUG, 'png'); }

function keyPressed() {
  const k = key.toLowerCase();
  if (k === 'u') { uiVisible = !uiVisible; panel.style.display = uiVisible ? 'flex' : 'none'; }
  else if (k === 'r') rerender();
  else if (k === 'a') animate();
  else if (k === 'l') toggleLoop();
  else if (k === 'f') toggleFit();
  else if (k === 'w') toggleRenderer();
  else if (k === 's') savePNG();
}

function buildPanel() {
  panel = document.createElement('div');
  panel.id = 'ams-panel';
  const buttons = [['Re-render (R)', rerender], ['Animate (A)', animate], ['Loop (L)', toggleLoop], ['Fit (F)', toggleFit], ['Watercolor (W)', toggleRenderer], ['Save PNG (S)', savePNG]];
  for (const [label, fn] of buttons) {
    const b = document.createElement('button');
    b.textContent = label;
    b.addEventListener('click', fn);
    panel.appendChild(b);
  }
  panel.title = 'U shows or hides this panel';
  document.body.appendChild(panel);
  updatePanel();
}

function updatePanel() {
  if (!panel) return;
  panel.children[2].textContent = looping ? 'Loop: on (L)' : 'Loop: off (L)';
  panel.children[3].textContent = fitMode ? 'Fit (F)' : 'Fill (F)';
  panel.children[4].textContent = renderer === 'watercolor' ? 'Watercolor (W)' : renderer === 'flat' ? 'Flat (W)' : 'Pixel';
  panel.children[4].disabled = renderer === 'pixel' || typeof brush === 'undefined';
}
`;

export async function buildP5Sketch(program, { mediumId = 'flat', medium = null, title = 'AMS sketch', source = '', aspect = null } = {}) {
  const norm = normalizeProgram(program);
  const pixel = mediumId === 'pixel' && medium ? await bakePixelFrames(norm, medium) : null;
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ams-sketch';
  const header = [
    `// ${title}`,
    `// Exported from Artist–Model Studio on ${new Date().toISOString().slice(0, 10)}${source ? ` · ${source}` : ''}`,
    `// Medium: ${mediumId}`,
    '// Press U for controls: re-render, animate, loop, fit/fill, watercolor/flat, save PNG.',
    ''
  ].join('\n');
  const data = pixel
    ? `const PROGRAM = null;\nconst PIXEL = ${JSON.stringify(pixel)};\n`
    : `const PROGRAM = ${JSON.stringify(norm, null, 1)};\nconst PIXEL = null;\n`;
  const seed = Number(medium?.seed ?? 42) || 42;
  const shared = `\n// ---- Studio watercolor routine (src/media/watercolorBrush.js) ----\n${inlineModule(watercolorSource)}`;
  const canvasAspect = aspect || (medium?.width && medium?.height ? medium.width / medium.height : 1);
  return `${header}const TITLE_SLUG = ${JSON.stringify(slug)};\nconst ASPECT = ${Number(canvasAspect.toFixed(4))};\nconst MEDIUM = ${JSON.stringify(mediumId)};\nconst WATERCOLOR_SEED = ${seed};\n${data}${RUNTIME}${shared}`;
}

export function buildIndexHtml(title, { brush = true } = {}) {
  const safe = String(title).replace(/[<&>]/g, c => ({ '<': '&lt;', '&': '&amp;', '>': '&gt;' }[c]));
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${safe}</title>
  <style>
    html, body { margin: 0; height: 100%; overflow: hidden; background: #111; }
    canvas { display: block; }
    #ams-panel { position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: center;
      padding: 8px; border-radius: 8px; background: rgba(20, 20, 24, 0.86); font: 13px system-ui, sans-serif; color: #b8bac0; }
    #ams-panel[hidden] { display: none; }
    #ams-panel button { font: inherit; padding: 5px 10px; border: 1px solid #3a3c44; border-radius: 5px; background: #24262d; color: #e4e5e8; cursor: pointer; }
    #ams-panel button:hover { background: #2f323a; }
    #ams-panel button:disabled { opacity: 0.4; cursor: default; }
    #ams-panel span { min-width: 64px; text-align: center; font-variant-numeric: tabular-nums; }
    /* Continuous player: a card of labelled controls, like the studio's Reference tab */
    #ams-panel:has(.ams-control) { left: auto; right: 14px; transform: none; width: 300px; flex-direction: column; align-items: stretch; gap: 6px; padding: 10px 12px; }
    .ams-row { display: flex; gap: 6px; }
    .ams-control { display: grid; grid-template-columns: 72px 1fr 80px; align-items: center; gap: 8px; }
    #ams-panel .ams-control span { min-width: 0; text-align: left; color: #9a9ea6; }
    .ams-control select { grid-column: 2 / 4; font: inherit; background: #1b1d22; color: #e4e5e8; border: 1px solid #2f323a; border-radius: 4px; padding: 3px 6px; outline: none; }
    #ams-panel .ams-value { display: flex; align-items: center; justify-content: flex-end; gap: 4px; min-width: 0; }
    #ams-panel .ams-value .num { width: 44px; flex: none; }
    #ams-panel .ams-count { min-width: 0; font: 12px ui-monospace, Menlo, monospace; color: #6a6e76; white-space: nowrap; }
    .ams-control .num { width: 100%; font: 12px ui-monospace, Menlo, monospace; background: transparent; color: #e4e5e8; border: 1px solid transparent; border-radius: 4px; text-align: right; padding: 1px 3px; outline: none; }
    .ams-control .num:hover { border-color: #2f323a; }
    .ams-control .num:focus { border-color: #4a4d56; background: #1b1d22; }
    #ams-panel input[type="range"] { -webkit-appearance: none; appearance: none; background: transparent; height: 16px; width: 100%; cursor: pointer; }
    #ams-panel input[type="range"]::-webkit-slider-runnable-track { height: 2px; background: #4a4d56; }
    #ams-panel input[type="range"]::-moz-range-track { height: 2px; background: #4a4d56; }
    #ams-panel input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 11px; height: 11px; margin-top: -4.5px; border-radius: 50%; background: #b8bac0; border: none; }
    #ams-panel input[type="range"]::-moz-range-thumb { width: 11px; height: 11px; border-radius: 50%; background: #b8bac0; border: none; }
    #ams-panel input[type="range"]:focus { outline: none; }
  </style>
  <script src="p5.min.js"></script>
${brush ? '  <script src="brush.js"></script>\n' : ''}  <script src="sketch.js"></script>
</head>
<body></body>
</html>
`;
}

export async function buildP5ProjectZip(program, options = {}) {
  const title = options.title || 'AMS sketch';
  const [sketch, p5src, brushSrc] = await Promise.all([
    buildP5Sketch(program, options),
    import('../../node_modules/p5/lib/p5.min.js?raw').then(m => m.default),
    import('../../node_modules/p5.brush/dist/brush.js?raw').then(m => m.default)
  ]);
  const readme = `# ${title}

A self-contained p5.js sketch exported from Artist–Model Studio.

Open \`index.html\` in a browser (no server needed). Press **U** for controls:
re-render (R), animate (A), loop (L), fit or fill the window (F),
switch watercolor/flat rendering (W), save PNG (S).

- \`sketch.js\`: the drawing program and a small renderer.
- \`p5.min.js\`: p5.js 2.3.3, vendored unmodified. p5.js is licensed under the
  GNU LGPL 2.1; source at https://github.com/processing/p5.js.
- \`brush.js\`: p5.brush 2.2.2 (standalone build) by Alejandro Campos, vendored
  unmodified, MIT licence; source at https://github.com/acamposuribe/p5.brush.
  The watercolor renderer needs WebGL.
`;
  return createZip([
    { name: 'index.html', data: buildIndexHtml(title) },
    { name: 'sketch.js', data: sketch },
    { name: 'p5.min.js', data: p5src },
    { name: 'brush.js', data: brushSrc },
    { name: 'README.md', data: readme }
  ]);
}

export function downloadBytes(bytes, filename, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------------------------------------------------------------------------
// Continuous mode: an endless, self-repainting sketch driven by the fitter
// ---------------------------------------------------------------------------

/** Drop import lines and `export` keywords so modules can be inlined in a sketch. */
function inlineModule(src) {
  return src.replace(/^import .*$/gm, '').replace(/^export (?=(const|function|class) )/gm, '');
}

function rgbToBase64(rgb) {
  let bin = '';
  for (let i = 0; i < rgb.length; i++) bin += String.fromCharCode(Math.max(0, Math.min(255, Math.round(rgb[i]))));
  return btoa(bin);
}

const CONTINUOUS_RUNTIME = String.raw`
// ---------------------------------------------------------------------------
// Player. The panel mirrors the studio's continuous controls.
// Keys: U panel · Space pause · C clear · W render (flat / watercolor / layered)
//       M style · [ ] density · , . cycle · O overlay · F fit/fill · S save PNG
// Names avoid single letters (brush.js defines globals t and e) and p5 globals such as set().
// ---------------------------------------------------------------------------
let cf, simTime = 0, lastMillis = 0, paused = false, fitMode = true, panel = null;
let sprites = null, layer = null, refImg = null;
const state = Object.assign({ render: 'flat', overlay: 'off', refOpacity: 0.5, opacity: 1, pigment: 0.6 }, PARAMS);
if (typeof brush === 'undefined' && state.render !== 'flat') state.render = 'flat';

function decodeTarget() {
  const bin = atob(TARGET_B64);
  const out = new Float32Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  cf = new ContinuousFitter(decodeTarget(), TARGET_W, TARGET_H, state);
  cf.setParams({ opacity: state.opacity });
  refImg = new Image();
  refImg.src = REF_DATA_URL;
  lastMillis = millis();
  buildPanel();
}

function windowResized() { resizeCanvas(windowWidth, windowHeight); }

function rendererDims() {
  const aspect = TARGET_W / TARGET_H;
  return aspect >= 1 ? { width: 1024, height: Math.round(1024 / aspect) } : { width: Math.round(1024 * aspect), height: 1024 };
}

function draw() {
  const now = millis();
  const dt = Math.min(0.1, (now - lastMillis) / 1000);
  lastMillis = now;
  if (!paused) {
    simTime += dt;
    // Watercolor sprites are slow to build: hold back new strokes while any are queued.
    const cap = state.render === 'watercolor' && sprites ? (sprites.pending > 0 ? 0 : 2) : Infinity;
    cf.update(simTime, dt, cap);
  }
  if (state.render === 'watercolor') {
    sprites ||= new WatercolorSprites(brush, rendererDims());
    sprites.opacity = state.opacity;
    sprites.pigment = state.pigment;
    sprites.update(cf, simTime);
  } else if (state.render === 'layered') {
    layer ||= new WatercolorLayer(brush, rendererDims());
    layer.opacity = state.opacity;
    if (!paused) layer.update(cf, simTime, dt, retentionFor(state.fadeOut));
  }
  background('#111111');
  const aspect = TARGET_W / TARGET_H;
  let x = 0, y = 0, w = width, h = height;
  if (fitMode) {
    w = Math.min(width, height * aspect);
    h = w / aspect;
    x = (width - w) / 2;
    y = (height - h) / 2;
  }
  if (panel && !panel.hidden && frameCount % 15 === 0) {
    const shown = state.render === 'watercolor' && sprites ? sprites.sprites.size : cf.alive.length;
    const el = panel.querySelector('.ams-count');
    if (el) el.textContent = shown + ' /';
  }
  drawScene(drawingContext, x, y, w, h, {
    cf, now: simTime, render: state.render, sprites, layer,
    ref: refImg && refImg.complete ? refImg : null, overlay: state.overlay, refOpacity: state.refOpacity
  });
}

// ---- controls -------------------------------------------------------------
const RENDERS = ['flat', 'watercolor', 'layered'];
const OVERLAYS = ['off', 'under', 'over', 'solo'];

function setParam(key, value) {
  state[key] = value;
  if (key === 'render') { sprites = null; layer = null; }
  if (key === 'opacity') cf.setParams({ opacity: value });
  if (key === 'shapes') cf.setParams({ shapes: value === 'mixed' ? ['rect', 'triangle', 'circle'] : [value] });
  else if (['mode', 'density', 'lifetime', 'fadeIn', 'fadeOut'].includes(key)) cf.setParams({ [key]: value });
  syncPanel();
}

function togglePause() { paused = !paused; syncPanel(); }
function clearCanvas() { cf.clear(); sprites = null; layer = null; }
function toggleFit() { fitMode = !fitMode; syncPanel(); }
function savePNG() { saveCanvas(TITLE_SLUG, 'png'); }
function cycleParam(list, key) { setParam(key, list[(list.indexOf(state[key]) + 1) % list.length]); }

function keyPressed() {
  const k = key.toLowerCase();
  if (document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
  if (k === 'u') panel.hidden = !panel.hidden;
  else if (k === ' ') togglePause();
  else if (k === 'c') clearCanvas();
  else if (k === 'w' && typeof brush !== 'undefined') cycleParam(RENDERS, 'render');
  else if (k === 'm') setParam('mode', state.mode === 'strokes' ? 'fade' : 'strokes');
  else if (k === '[') setParam('density', Math.max(1, Math.round(state.density * 0.8)));
  else if (k === ']') setParam('density', Math.round(state.density * 1.25));
  else if (k === ',') setParam('lifetime', +(state.lifetime * 1.25).toFixed(2));
  else if (k === '.') setParam('lifetime', Math.max(0.1, +(state.lifetime * 0.8).toFixed(2)));
  else if (k === 'o') cycleParam(OVERLAYS, 'overlay');
  else if (k === 'f') toggleFit();
  else if (k === 's') savePNG();
}

// [key, label, kind, options, tip]; sliders: [min, max, step, typedMin, typedMax]
const CONTROLS = [
  ['render', 'Render', 'select', [['flat', 'Flat'], ['watercolor', 'Watercolor'], ['layered', 'Watercolor, layered']], 'W'],
  ['mode', 'Style', 'select', [['strokes', 'Strokes'], ['fade', 'Fade']], 'M'],
  ['density', 'Density', 'range', [10, 800, 10, 1, Infinity], 'Shapes alive at once ([ ])'],
  ['lifetime', 'Cycle s', 'range', [1, 60, 0.5, 0.1, Infinity], 'Seconds for a full turnover (, .)'],
  ['fadeIn', 'Fade in', 'range', [0, 0.5, 0.05, 0, 1], 'How gradually each shape appears'],
  ['fadeOut', 'Fade out', 'range', [0, 0.5, 0.05, 0, 1], 'How gradually each shape disappears'],
  ['opacity', 'Opacity', 'range', [0.1, 1, 0.05, 0, 1], 'Stroke strength at full life'],
  ['pigment', 'Pigment', 'range', [0, 1, 0.05, 0, 1], 'Watercolor: 0 pale wash, 1 fitted colour'],
  ['shapes', 'Shapes', 'select', [['mixed', 'Mixed'], ['rect', 'Rectangles'], ['circle', 'Circles'], ['triangle', 'Triangles']], 'Shape vocabulary'],
  ['overlay', 'Overlay', 'select', [['off', 'Off'], ['under', 'Under'], ['over', 'Over'], ['solo', 'Solo']], 'Reference (O)'],
  ['refOpacity', 'Ref opacity', 'range', [0, 1, 0.05, 0, 1], 'Reference opacity for Under and Over']
];

function buildPanel() {
  if (!state.shapes || Array.isArray(state.shapes)) {
    const s = state.shapes || [];
    state.shapes = s.length === 1 ? s[0] : 'mixed';
  }
  panel = document.createElement('div');
  panel.id = 'ams-panel';
  panel.hidden = true;
  panel.title = 'U shows or hides this panel';
  const buttons = document.createElement('div');
  buttons.className = 'ams-row';
  for (const [id, label, fn, tip] of [['pause', 'Pause', togglePause, 'Space'], ['clear', 'Clear', clearCanvas, 'C: clear and repaint from blank'], ['fit', 'Fit', toggleFit, 'F'], ['save', 'Save PNG', savePNG, 'S']]) {
    const b = document.createElement('button');
    b.dataset.id = id;
    b.textContent = label;
    b.title = tip;
    b.addEventListener('click', fn);
    buttons.appendChild(b);
  }
  panel.appendChild(buttons);
  for (const [key, label, kind, opts, tip] of CONTROLS) {
    const row = document.createElement('label');
    row.className = 'ams-control';
    row.title = tip;
    const name = document.createElement('span');
    name.textContent = label;
    row.appendChild(name);
    if (kind === 'select') {
      const sel = document.createElement('select');
      sel.dataset.key = key;
      for (const [value, text] of opts) sel.add(new Option(text, value));
      if (key === 'render' && typeof brush === 'undefined') sel.disabled = true;
      sel.addEventListener('change', () => { setParam(key, sel.value); sel.blur(); });
      row.appendChild(sel);
    } else {
      const [min, max, step, tmin, tmax] = opts;
      const range = document.createElement('input');
      range.type = 'range';
      range.min = min; range.max = max; range.step = step;
      range.dataset.key = key;
      const num = document.createElement('input');
      num.className = 'num';
      num.dataset.key = key;
      range.addEventListener('input', () => setParam(key, Number(range.value)));
      if (key === 'density') row.title = tip + '. The muted number is how many are on screen now.';
      num.addEventListener('change', () => {
        const v = Number(num.value);
        if (Number.isFinite(v)) setParam(key, Math.min(tmax, Math.max(tmin, v)));
        num.blur();
      });
      row.appendChild(range);
      // Value cell: the typed value, preceded by the live count for density.
      const cell = document.createElement('span');
      cell.className = 'ams-value';
      if (key === 'density') {
        const count = document.createElement('span');
        count.className = 'ams-count';
        cell.appendChild(count);
      }
      cell.appendChild(num);
      row.appendChild(cell);
    }
    panel.appendChild(row);
  }
  document.body.appendChild(panel);
  syncPanel();
}

function syncPanel() {
  if (!panel) return;
  panel.querySelector('[data-id="pause"]').textContent = paused ? 'Play' : 'Pause';
  panel.querySelector('[data-id="fit"]').textContent = fitMode ? 'Fit' : 'Fill';
  for (const el of panel.querySelectorAll('[data-key]')) {
    const v = state[el.dataset.key];
    if (document.activeElement !== el) el.value = v;
  }
}
`;

/**
 * @param {{rgb: Float32Array, width: number, height: number}} target RGB target at the canvas aspect
 * @param {{mode?:string, density:number, lifetime:number, fadeIn?:number, fadeOut?:number, fade?:number, shapes:string[], seed:number}} params
 */
export function buildContinuousSketch(target, params, { title = 'AMS continuous', source = '', refDataUrl = '' } = {}) {
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'ams-continuous';
  const header = [
    `// ${title}: continuous Reference Fitter`,
    `// Exported from Artist–Model Studio on ${new Date().toISOString().slice(0, 10)}${source ? ` · ${source}` : ''}`,
    '// Shapes live, fade and are replaced by new fits, repainting the reference forever.',
    '// Press U for controls.',
    ''
  ].join('\n');
  return `${header}const TITLE_SLUG = ${JSON.stringify(slug)};
const TARGET_W = ${target.width};
const TARGET_H = ${target.height};
const PARAMS = ${JSON.stringify(params)};
const TARGET_B64 = "${rgbToBase64(target.rgb)}";
const REF_DATA_URL = ${JSON.stringify(refDataUrl)};
${CONTINUOUS_RUNTIME}
// ---- Studio fitter (src/fitting/fitReference.js) ----
${inlineModule(fitReferenceSource)}
// ---- Continuous mode (src/fitting/continuousFit.js) ----
${inlineModule(continuousSource)}
// ---- Studio watercolor routine (src/media/watercolorBrush.js) ----
${inlineModule(watercolorSource)}
// ---- Continuous watercolor (src/fitting/continuousWatercolor.js) ----
${inlineModule(continuousWatercolorSource)}
// ---- Scene with reference overlay (src/fitting/continuousScene.js) ----
${inlineModule(continuousSceneSource)}`;
}

export async function buildContinuousZip(target, params, options = {}) {
  const title = options.title || 'AMS continuous';
  const sketch = buildContinuousSketch(target, params, options);
  const [p5src, brushSrc] = await Promise.all([
    import('../../node_modules/p5/lib/p5.min.js?raw').then(m => m.default),
    import('../../node_modules/p5.brush/dist/brush.js?raw').then(m => m.default)
  ]);
  const readme = `# ${title}

A self-contained p5.js sketch exported from Artist–Model Studio. It repaints
the reference forever: each shape fades in, lives for a while, fades out, and is
replaced by a new shape fitted to what is left.

Open \`index.html\` in a browser (no server needed). Press **U** for controls:
the same controls as the studio's Reference tab (render, style, density, cycle,
fades, opacity, pigment, shapes, reference overlay). Keys: Space pause, C clear,
W render, M style, [ ] density, , . cycle, O overlay, F fit or fill, S save PNG.

Watercolor paints each stroke with p5.brush as its own translucent sprite that
fades in and out; "Watercolor, layered" paints strokes onto one sheet that fades
under thin washes. Both need WebGL. The overlay shows the reference under the
painting, over it, or on its own.

Styles: **strokes** adds one shape at a time and retires the oldest, like a
looping stroke-by-stroke replay; **fade** lets many shapes fade in and out at once.

Settings at export: ${params.render || 'flat'} render, overlay ${params.overlay || 'off'}, ${params.mode || 'strokes'} style, ${params.density} shapes, ${params.lifetime} s cycle, fade in ${params.fadeIn ?? params.fade}, fade out ${params.fadeOut ?? params.fade}, shapes: ${params.shapes.join(', ')}.

- \`sketch.js\`: the player, the studio's fitter and continuous-mode code, and a
  ${target.width}×${target.height} copy of the reference used as the fitting target.
- \`p5.min.js\`: p5.js 2.3.3, vendored unmodified, GNU LGPL 2.1;
  source at https://github.com/processing/p5.js.
- \`brush.js\`: p5.brush 2.2.2 (standalone build) by Alejandro Campos, vendored
  unmodified, MIT licence; source at https://github.com/acamposuribe/p5.brush.
`;
  return createZip([
    { name: 'index.html', data: buildIndexHtml(title) },
    { name: 'sketch.js', data: sketch },
    { name: 'p5.min.js', data: p5src },
    { name: 'brush.js', data: brushSrc },
    { name: 'README.md', data: readme }
  ]);
}
