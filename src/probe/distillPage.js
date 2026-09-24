/**
 * Distillation data generator. For every corpus image, runs the Reference
 * Fitter on AMS's square canvas (letterboxed, exactly as the Reference Fitter
 * engine does) and records prefix programs at several shape budgets.
 *
 * Output (via the dev save endpoint): training/<set>/data/fits.jsonl, one line
 * per (image, seed, budget) with the distillation text and pixel RMSE, plus a
 * contact sheet of fits for a quick visual check.
 *
 * URL params: ?set=klee&seeds=3&budgets=12,24,48&limit=0&save=1
 */
import { ReferenceFitter, canvasToRGB, rmse } from '../fitting/fitReference.js';
import { squareTarget } from '../artists/ReferenceFitterArtist.js';
import { FlatCanvasMedium } from '../media/FlatCanvasMedium.js';
import { programToDistillText, parseDistillText } from '../training/distillFormat.js';

const params = new URLSearchParams(location.search);
const SET = params.get('set') || 'klee';
const SEEDS = Number(params.get('seeds') || 3);
const BUDGETS = (params.get('budgets') || '12,24,48').split(',').map(Number);
const LIMIT = Number(params.get('limit') || 0);
const FIT = 192;
const status = document.getElementById('meta');
window.__distill = { done: false, lines: 0 };

const loadImage = src => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`load failed: ${src}`));
  img.src = src;
});

async function main() {
  const manifest = await (await fetch(`/training/${SET}/manifest.json`)).json();
  let refs = manifest.references;
  if (LIMIT) refs = refs.slice(0, LIMIT);
  const flat = new FlatCanvasMedium({ width: FIT, height: FIT });
  const lines = [];
  const thumbs = [];
  const t0 = performance.now();

  for (const [i, ref] of refs.entries()) {
    const img = await loadImage(`/training/${SET}/images/${ref.file}`);
    const target = canvasToRGB(squareTarget(img, FIT));
    for (let seed = 1; seed <= SEEDS; seed++) {
      const fitter = new ReferenceFitter(target, FIT, FIT, { seed: seed * 1009 + i, precision: 2 });
      for (const budget of BUDGETS) {
        for (let misses = 0; fitter.shapes.length < budget && misses < 25;) {
          if (!fitter.step()) misses++; else misses = 0;
        }
        const text = programToDistillText(fitter.toProgram(budget));
        // Verify the exact text the model will be trained on renders as scored.
        const { program, stats } = parseDistillText(text);
        const out = await flat.render(program);
        const err = rmse(canvasToRGB(out.canvas), target);
        lines.push(JSON.stringify({ id: ref.id, group: ref.group, split: ref.split, seed, budget, shapes: stats.shapes, rmse: Math.round(err * 100) / 100, text }));
        if (seed === 1 && budget === BUDGETS.at(-1) && thumbs.length < 60) thumbs.push({ img, fit: out.image });
      }
    }
    status.textContent = `${i + 1}/${refs.length} images · ${lines.length} programs · ${((performance.now() - t0) / 1000).toFixed(0)} s`;
    window.__distill.lines = lines.length;
    if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
  }

  // Contact sheet: reference | fit, for the first 60 images.
  const T = 128;
  const sheet = document.createElement('canvas');
  sheet.width = T * 2 * 6;
  sheet.height = T * Math.ceil(thumbs.length / 6);
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  for (const [k, t] of thumbs.entries()) {
    const x = (k % 6) * T * 2, y = Math.floor(k / 6) * T;
    ctx.drawImage(squareTarget(t.img, T), x, y);
    const fit = await loadImage(t.fit);
    ctx.drawImage(fit, x + T, y, T, T);
  }
  document.body.append(sheet);

  if (params.get('save') === '1') {
    const res = await fetch('/__probe/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ set: SET, root: 'distill', files: { 'fits.jsonl': lines.join('\n') + '\n', 'fits-contact-sheet.png': sheet.toDataURL('image/png') } })
    });
    window.__distill.saved = await res.json();
  }
  window.__distill.done = true;
  window.__distill.seconds = (performance.now() - t0) / 1000;
}

main().catch(err => {
  window.__distill.error = String(err && err.stack || err);
  status.textContent = window.__distill.error;
});
