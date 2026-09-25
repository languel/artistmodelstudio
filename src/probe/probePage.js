/**
 * Reference probe page: fits each reference with Core DSL shapes, verifies the
 * program through the real FlatCanvasMedium, and compares against a flat
 * mean-color baseline and the text-only procedural artist.
 *
 * URL params: ?set=klee&shapes=300&size=200&seed=1&only=<reference id>&save=1
 * (save=1 writes programs, images and report.json to fixtures/seeds/<set>/ via the dev server)
 */
import { FlatCanvasMedium } from '../media/FlatCanvasMedium.js';
import { MockArtist } from '../artists/MockArtist.js';
import { WatercolorMedium } from '../media/WatercolorMedium.js';
import { ReferenceFitter, imageToRGB, canvasToRGB, rmse } from '../fitting/fitReference.js';

const params = new URLSearchParams(location.search);
const SET = params.get('set') || 'klee';
const SHAPES = Number(params.get('shapes') || 300);
const SIZE = Number(params.get('size') || 200);
const SEED = Number(params.get('seed') || 1);
const ONLY = params.get('only');
const DISPLAY = 520;
const CHECKPOINTS = [10, 25, 50, 100, 200, 300, 500, 800].filter(n => n <= SHAPES);

const root = document.getElementById('probe');
const results = [];
window.__probe = { done: false, results, config: { SET, SHAPES, SIZE, SEED } };

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function dims(ref, long) {
  const c = ref.crop || { w: 1, h: 1 };
  const aw = ref.local.width * c.w, ah = ref.local.height * c.h;
  const k = long / Math.max(aw, ah);
  return [Math.round(aw * k), Math.round(ah * k)];
}

async function renderAt(program, w, h) {
  const m = new FlatCanvasMedium({ width: w, height: h });
  const out = await m.render(program);
  return out;
}

async function verify(program, target, w, h) {
  const out = await renderAt(program, w, h);
  return rmse(canvasToRGB(out.canvas), target);
}

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  Object.assign(e, attrs);
  kids.forEach(k => e.append(k));
  return e;
}

async function textBaseline(ref, target, w, h) {
  const artist = new MockArtist();
  artist.progressiveDelayMs = 0;
  const medium = new FlatCanvasMedium({ width: w, height: h });
  const prompt = `${ref.title} by ${ref.artist.split(' (')[0]}`;
  const cands = await artist.generate({ prompt, count: 4, mediumCapabilities: medium.capabilities() });
  let best = null;
  for (const c of cands) {
    const score = await verify(c.program, target, w, h);
    if (!best || score < best.rmse) best = { rmse: score, program: c.program, prompt };
  }
  return best;
}

async function runOne(ref) {
  const img = await loadImage(`/fixtures/references/${SET}/${ref.file}`);
  const [w, h] = dims(ref, SIZE);
  const [dw, dh] = dims(ref, DISPLAY);
  const target = imageToRGB(img, w, h, ref.crop);

  const row = el('section', { className: 'row' });
  const status = el('p', { className: 'status', textContent: `Fitting ${ref.title}…` });
  row.append(el('h2', { textContent: `${ref.title}, ${ref.year}` }), status);
  root.append(row);

  const refCanvas = el('canvas', { width: dw, height: dh });
  const c = ref.crop || { x: 0, y: 0, w: 1, h: 1 };
  refCanvas.getContext('2d').drawImage(img, c.x * img.naturalWidth, c.y * img.naturalHeight, c.w * img.naturalWidth, c.h * img.naturalHeight, 0, 0, dw, dh);

  const flatBaseline = new ReferenceFitter(target, w, h).toProgram();
  const flatRMSE = await verify(flatBaseline, target, w, h);
  const text = await textBaseline(ref, target, w, h);

  const fitter = new ReferenceFitter(target, w, h, { seed: SEED });
  const checkpoints = [];
  const t0 = performance.now();
  // A step can fail when every random trial happens to worsen the fit; retry a
  // few times before concluding the search has stalled.
  for (let misses = 0; fitter.shapes.length < SHAPES && misses < 25;) {
    if (!fitter.step()) { misses++; continue; }
    misses = 0;
    if (CHECKPOINTS.includes(fitter.shapes.length)) {
      const n = fitter.shapes.length;
      checkpoints.push({ shapes: n, rmse: await verify(fitter.toProgram(n), target, w, h), seconds: (performance.now() - t0) / 1000 });
      status.textContent = `Fitting ${ref.title}… ${n} shapes, RMSE ${checkpoints.at(-1).rmse.toFixed(1)}`;
      await new Promise(r => setTimeout(r, 0));
    }
  }
  const program = fitter.toProgram();
  const finalRMSE = await verify(program, target, w, h);
  const internalRMSE = fitter.currentRMSE();
  const seconds = (performance.now() - t0) / 1000;

  const seedRender = await renderAt(program, dw, dh);
  const textRender = await renderAt(text.program, dw, dh);

  // Reference | fitted seed | text-only, for saving as one comparison image.
  const sheet = el('canvas', { width: dw * 3 + 16, height: dh });
  const sctx = sheet.getContext('2d');
  sctx.fillStyle = '#fff';
  sctx.fillRect(0, 0, sheet.width, sheet.height);
  sctx.drawImage(refCanvas, 0, 0);
  sctx.drawImage(seedRender.canvas, dw + 8, 0);
  sctx.drawImage(textRender.canvas, (dw + 8) * 2, 0);

  const counts = program.actions.reduce((m, a) => ((m[a.op] = (m[a.op] || 0) + 1), m), {});
  status.textContent = `${fitter.shapes.length} shapes in ${seconds.toFixed(1)} s. RMSE (0–255, lower is closer): fitted ${finalRMSE.toFixed(1)} · text-only ${text.rmse.toFixed(1)} · flat mean color ${flatRMSE.toFixed(1)}`;

  const fig = (canvasOrSrc, caption) => {
    const node = canvasOrSrc instanceof HTMLCanvasElement ? canvasOrSrc : el('img', { src: canvasOrSrc, width: dw, height: dh });
    return el('figure', {}, node, el('figcaption', { textContent: caption }));
  };
  row.append(el('div', { className: 'grid' },
    fig(refCanvas, 'Reference'),
    fig(seedRender.image, `Fitted seed · ${fitter.shapes.length} shapes · RMSE ${finalRMSE.toFixed(1)}`),
    fig(textRender.image, `Text-only procedural · "${text.prompt}" · RMSE ${text.rmse.toFixed(1)}`)
  ));
  row.append(el('p', { className: 'curve', textContent: 'RMSE by shape count: ' + checkpoints.map(p => `${p.shapes} → ${p.rmse.toFixed(1)}`).join(' · ') }));

  results.push({
    id: ref.id,
    title: ref.title,
    evalSize: [w, h],
    crop: ref.crop || null,
    seed: SEED,
    shapesRequested: SHAPES,
    shapesPlaced: fitter.shapes.length,
    opCounts: counts,
    seconds,
    rmse: { fitted: finalRMSE, fitterInternal: internalRMSE, textOnly: text.rmse, flatMean: flatRMSE },
    checkpoints,
    textBaseline: { prompt: text.prompt, program: text.program },
    program,
    images: { seed: seedRender.image, textOnly: textRender.image, comparison: sheet.toDataURL('image/png') }
  });
}

/**
 * mode=media: fit each reference at several shape budgets and render every fit
 * through both the flat and watercolor media, to see how much the medium adds.
 */
const BUDGETS = (params.get('budgets') || '12,40,120,300').split(',').map(Number);

async function runMedia(ref) {
  const img = await loadImage(`/fixtures/references/${SET}/${ref.file}`);
  const [w, h] = dims(ref, SIZE);
  const [dw, dh] = dims(ref, 360);
  const target = imageToRGB(img, w, h, ref.crop);
  const refCanvas = el('canvas', { width: dw, height: dh });
  const c = ref.crop || { x: 0, y: 0, w: 1, h: 1 };
  refCanvas.getContext('2d').drawImage(img, c.x * img.naturalWidth, c.y * img.naturalHeight, c.w * img.naturalWidth, c.h * img.naturalHeight, 0, 0, dw, dh);

  const fitter = new ReferenceFitter(target, w, h, { seed: SEED });
  const water = new WatercolorMedium({ width: dw, height: dh, seed: SEED });
  const gap = 8;
  const sheet = el('canvas', { width: (dw + gap) * (BUDGETS.length + 1), height: dh * 2 + gap });
  const sctx = sheet.getContext('2d');
  sctx.fillStyle = '#fff';
  sctx.fillRect(0, 0, sheet.width, sheet.height);
  sctx.drawImage(refCanvas, 0, 0);

  const rows = [];
  for (const [col, n] of BUDGETS.entries()) {
    for (let misses = 0; fitter.shapes.length < n && misses < 25;) {
      if (!fitter.step()) { misses++; continue; }
      misses = 0;
    }
    const program = fitter.toProgram(n);
    const flat = await renderAt(program, dw, dh);
    const wc = await water.render(program);
    const x = (dw + gap) * (col + 1);
    sctx.drawImage(flat.canvas, x, 0);
    sctx.drawImage(wc.canvas, x, dh + gap);
    rows.push({ shapes: n, flatRMSE: await verify(program, target, w, h), watercolorWarnings: wc.warnings });
  }

  root.append(el('section', { className: 'row' },
    el('h2', { textContent: `${ref.title}, ${ref.year}` }),
    el('p', { className: 'status', textContent: `Top: flat · bottom: watercolor · columns: reference, then ${BUDGETS.join(' / ')} shapes` }),
    el('figure', {}, el('img', { src: sheet.toDataURL('image/png'), style: 'max-width:100%;border:1px solid #ccc' }))
  ));
  results.push({ id: ref.id, budgets: rows, images: { media: sheet.toDataURL('image/png') } });
}

async function main() {
  const manifest = await (await fetch(`/fixtures/references/${SET}/sources.json`)).json();
  if (params.get('mode') === 'media') {
    document.getElementById('meta').textContent = `Flat vs watercolor at ${BUDGETS.join(', ')} shapes · seed ${SEED}`;
    for (const ref of manifest.references) {
      if (ONLY && ref.id !== ONLY) continue;
      await runMedia(ref);
    }
    if (params.get('save') === '1') {
      const files = Object.fromEntries(results.map(r => [`${r.id}.media.png`, r.images.media]));
      files['media-report.json'] = JSON.stringify({ generatedAt: new Date().toISOString(), budgets: BUDGETS, seed: SEED, results: results.map(({ images, ...rest }) => rest) }, null, 2);
      const res = await fetch('/__probe/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ set: SET, files }) });
      window.__probe.saved = await res.json();
    }
    window.__probe.done = true;
    return;
  }
  document.getElementById('meta').textContent =
    `${manifest.collection} · ${SHAPES} shapes max · evaluated at ${SIZE}px long side · seed ${SEED}`;
  for (const ref of manifest.references) {
    if (ONLY && ref.id !== ONLY) continue;
    await runOne(ref);
  }
  if (params.get('save') === '1') await save(manifest);
  window.__probe.done = true;
  document.getElementById('meta').textContent += ' · done';
}

async function save(manifest) {
  const files = {};
  for (const r of results) {
    files[`${r.id}.program.json`] = JSON.stringify(r.program, null, 1);
    files[`${r.id}.seed.png`] = r.images.seed;
    files[`${r.id}.comparison.png`] = r.images.comparison;
  }
  const report = {
    generatedAt: new Date().toISOString(),
    config: window.__probe.config,
    method: 'Greedy shape fitting (rect/triangle/circle, opaque flat fill) minimising RGB squared error; verified by rendering through FlatCanvasMedium.',
    metric: 'RMSE over RGB channels in 0–255 units at the eval size; lower is closer. Pixel error, not a judgement of artistic quality.',
    references: manifest.references.filter(ref => results.some(r => r.id === ref.id)).map(ref => ({ id: ref.id, file: ref.file, commonsPage: ref.source.commonsPage })),
    results: results.map(({ program, images, textBaseline, ...rest }) => ({ ...rest, textBaseline: { prompt: textBaseline.prompt, actionCount: textBaseline.program.actions.length } }))
  };
  files['report.json'] = JSON.stringify(report, null, 2);
  const res = await fetch('/__probe/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ set: SET, files }) });
  window.__probe.saved = await res.json();
}

main().catch(err => {
  window.__probe.error = String(err && err.stack || err);
  root.append(el('pre', { textContent: window.__probe.error }));
});
