/**
 * Held-out evaluation for the Klee distillation models.
 *
 * Reads training/<set>/runs/eval/<model>.jsonl (from generate_eval.py), parses
 * each program with the strict distillation parser, renders it on the flat
 * medium at the fitting size, and compares it with the held-out painting.
 *
 * Baselines, all on the same held-out paintings and budgets:
 *   oracle       Reference Fitter on the painting itself (sees the image; an upper bound)
 *   random-train a random training-split fit at the same budget (ignores the prompt)
 *   procedural   the text-only MockArtist
 *   flat-mean    one flat colour (the painting's mean)
 *
 * Metrics (lower is better unless noted):
 *   rmse         pixel RMSE, 0–255
 *   layout       RMSE after downsampling both images to 8×8 (composition and colour placement)
 *   palette      1 − histogram intersection of 4×4×4 colour histograms (0 = same palette)
 *   valid        share of non-empty output lines that parse (higher is better)
 *   usable       share of generations with ≥1 shape and ≥90% valid lines (higher is better)
 *   rank         where the true painting ranks among all held-out paintings when sorted by
 *                layout+palette distance to the generation (1 = best; chance ≈ half the count).
 *                Tests whether the text prompt carries information into the picture.
 *   top5         share of generations whose true painting is in that top 5 (higher is better)
 *
 * URL: /eval.html?set=klee&models=qwen-base,qwen-lora&sheet=12&save=1
 */
import { canvasToRGB, rmse } from '../fitting/fitReference.js';
import { squareTarget } from '../artists/ReferenceFitterArtist.js';
import { FlatCanvasMedium } from '../media/FlatCanvasMedium.js';
import { MockArtist } from '../artists/MockArtist.js';
import { parseDistillText } from '../training/distillFormat.js';

const params = new URLSearchParams(location.search);
const SET = params.get('set') || 'klee';
const MODELS = (params.get('models') || '').split(',').filter(Boolean);
const SHEET_ROWS = Number(params.get('sheet') || 12);
const FIT = 192;
const meta = document.getElementById('meta');
const root = document.getElementById('probe');
window.__eval = { done: false };

const loadImage = src => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error(`load failed: ${src}`));
  img.src = src;
});
const jsonl = async url => (await (await fetch(url)).text()).split('\n').filter(Boolean).map(l => JSON.parse(l));

function downsample(rgb, size, n) {
  const out = new Float32Array(n * n * 3);
  const cell = size / n;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const o = (Math.floor(y / cell) * n + Math.floor(x / cell)) * 3, i = (y * size + x) * 3;
      out[o] += rgb[i]; out[o + 1] += rgb[i + 1]; out[o + 2] += rgb[i + 2];
    }
  }
  return out.map(v => v / (cell * cell));
}

function histogram(rgb) {
  const h = new Float32Array(64);
  for (let i = 0; i < rgb.length; i += 3) h[(rgb[i] >> 6) * 16 + (rgb[i + 1] >> 6) * 4 + (rgb[i + 2] >> 6)]++;
  const n = rgb.length / 3;
  return h.map(v => v / n);
}

function histDistance(ha, hb) {
  let inter = 0;
  for (let i = 0; i < 64; i++) inter += Math.min(ha[i], hb[i]);
  return 1 - inter;
}

const paletteDistance = (a, b) => histDistance(histogram(a), histogram(b));

const mean = xs => xs.reduce((s, v) => s + v, 0) / (xs.length || 1);
const median = xs => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : NaN; };

async function main() {
  const manifest = await (await fetch(`/training/${SET}/manifest.json`)).json();
  const refs = Object.fromEntries(manifest.references.map(r => [r.id, r]));
  const prompts = await jsonl(`/training/${SET}/data/eval_prompts.jsonl`);
  const fits = await jsonl(`/training/${SET}/data/fits.jsonl`);
  const flat = new FlatCanvasMedium({ width: FIT, height: FIT });

  // Targets for each held-out painting.
  const targets = {};
  for (const id of new Set(prompts.map(p => p.id))) {
    const img = await loadImage(`/training/${SET}/images/${refs[id].file}`);
    const canvas = squareTarget(img, FIT);
    const rgb = canvasToRGB(canvas);
    targets[id] = { canvas, rgb, rgb8: downsample(rgb, FIT, 8), hist: histogram(rgb) };
  }

  // Generations to score: models plus baselines, keyed by system name.
  const systems = {};
  for (const m of MODELS) systems[m] = await jsonl(`/training/${SET}/runs/eval/${m}.jsonl`);
  const oracle = fits.filter(f => f.split === 'test' && f.seed === 1);
  systems.oracle = prompts.map(p => ({ ...p, sample: 0, text: oracle.find(f => f.id === p.id && f.budget === p.budget)?.text || '' }));
  const trainFits = fits.filter(f => f.split === 'train');
  let k = 0;
  systems['random-train'] = prompts.flatMap(p => [0, 1].map(s => {
    const pool = trainFits.filter(f => f.budget === p.budget);
    return { ...p, sample: s, text: pool[(k++ * 7919) % pool.length].text };
  }));

  const results = {};
  const renders = {}; // system -> id -> budget -> dataURL (sample 0), for the sheet
  const score = async (system, id, program, stats) => {
    const out = await flat.render(program);
    const rgb = canvasToRGB(out.canvas);
    const t = targets[id];
    const rgb8 = downsample(rgb, FIT, 8);
    const hist = histogram(rgb);
    const dist = tt => rmse(rgb8, tt.rgb8) / 64 + histDistance(hist, tt.hist);
    const own = dist(t);
    const rank = 1 + Object.values(targets).filter(tt => tt !== t && dist(tt) < own).length;
    return {
      rank,
      image: out.image,
      rmse: rmse(rgb, t.rgb),
      layout: rmse(rgb8, t.rgb8),
      palette: paletteDistance(rgb, t.rgb),
      valid: stats ? stats.valid / Math.max(1, stats.lines) : 1,
      usable: stats ? (stats.shapes > 0 && stats.valid / Math.max(1, stats.lines) >= 0.9 ? 1 : 0) : 1,
      shapes: stats ? stats.shapes : null
    };
  };

  for (const [system, gens] of Object.entries(systems)) {
    meta.textContent = `Scoring ${system}…`;
    const rows = [];
    for (const g of gens) {
      const { program, stats } = parseDistillText(g.text);
      const r = await score(system, g.id, program, stats);
      rows.push({ id: g.id, budget: g.budget, sample: g.sample, ...r, image: undefined, invalidExamples: stats.invalidExamples });
      if (g.sample === 0) ((renders[system] ||= {})[g.id] ||= {})[g.budget] = r.image;
    }
    results[system] = rows;
    await new Promise(r => setTimeout(r, 0));
  }

  // Procedural text-only and flat-mean floors.
  const mock = new MockArtist();
  mock.progressiveDelayMs = 0;
  results.procedural = [];
  results['flat-mean'] = [];
  for (const p of prompts) {
    const [cand] = await mock.generate({ prompt: p.caption, count: 1, mediumCapabilities: flat.capabilities() });
    const r = await score('procedural', p.id, cand.program, null);
    results.procedural.push({ id: p.id, budget: p.budget, sample: 0, ...r, image: undefined });
    ((renders.procedural ||= {})[p.id] ||= {})[p.budget] = r.image;
    const t = targets[p.id].rgb;
    const m = [0, 1, 2].map(c => { let s = 0; for (let i = c; i < t.length; i += 3) s += t[i]; return s / (t.length / 3); });
    const hex = '#' + m.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    const f = await score('flat-mean', p.id, { version: 1, actions: [{ op: 'background', color: hex }] }, null);
    results['flat-mean'].push({ id: p.id, budget: p.budget, sample: 0, ...f, image: undefined });
  }

  // Summary table: per system × budget.
  const budgets = [...new Set(prompts.map(p => p.budget))].sort((a, b) => a - b);
  const summary = {};
  for (const [system, rows] of Object.entries(results)) {
    summary[system] = {};
    for (const b of [...budgets, 'all']) {
      const rs = rows.filter(r => b === 'all' || r.budget === b);
      const usable = rs.filter(r => r.usable);
      summary[system][b] = {
        n: rs.length,
        usable: mean(rs.map(r => r.usable)),
        valid: mean(rs.map(r => r.valid)),
        rmse: median(usable.map(r => r.rmse)),
        layout: median(usable.map(r => r.layout)),
        palette: median(usable.map(r => r.palette)),
        rank: median(usable.map(r => r.rank)),
        top5: mean(usable.map(r => (r.rank <= 5 ? 1 : 0))),
        shapes: median(usable.filter(r => r.shapes != null).map(r => r.shapes))
      };
    }
  }

  const order = ['oracle', ...MODELS, 'random-train', 'procedural', 'flat-mean'];
  const table = document.createElement('table');
  table.innerHTML = `<tr><th>system</th><th>budget</th><th>n</th><th>usable</th><th>valid lines</th><th>shapes</th><th>pixel RMSE</th><th>layout RMSE</th><th>palette dist</th><th>true-painting rank</th><th>top-5</th></tr>` +
    order.flatMap(s => [...budgets, 'all'].map(b => {
      const v = summary[s][b];
      const f = x => (x == null || Number.isNaN(x)) ? '–' : (x < 2 ? x.toFixed(2) : x.toFixed(1));
      return `<tr><td>${s}</td><td>${b}</td><td>${v.n}</td><td>${f(v.usable)}</td><td>${f(v.valid)}</td><td>${f(v.shapes)}</td><td>${f(v.rmse)}</td><td>${f(v.layout)}</td><td>${f(v.palette)}</td><td>${f(v.rank)}</td><td>${f(v.top5)}</td></tr>`;
    })).join('');
  root.append(table);
  const legend = document.createElement('p');
  legend.className = 'curve';
  legend.textContent = 'oracle and flat-mean see the held-out painting (upper bound and image-informed floor). ' +
    'Every other row gets only the text prompt: the models, random-train (a random training program at the same budget) and the procedural artist. ' +
    'Pixel RMSE, layout RMSE and palette distance are medians over usable generations; lower is closer to the held-out painting.';
  root.append(legend);

  // Contact sheet at the middle budget: painting | each system (sample 0).
  const B = budgets[Math.floor(budgets.length / 2)];
  const cols = ['painting', ...order.filter(s => s !== 'flat-mean')];
  const ids = [...new Set(prompts.map(p => p.id))].slice(0, SHEET_ROWS);
  const T = 144, pad = 4, head = 22;
  const sheet = document.createElement('canvas');
  sheet.width = cols.length * (T + pad);
  sheet.height = head + ids.length * (T + pad);
  const ctx = sheet.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, sheet.width, sheet.height);
  ctx.fillStyle = '#222';
  ctx.font = '13px system-ui';
  cols.forEach((c, i) => ctx.fillText(c === 'painting' ? `held-out · ${B} shapes` : c, i * (T + pad) + 4, 15));
  for (const [row, id] of ids.entries()) {
    const y = head + row * (T + pad);
    ctx.drawImage(targets[id].canvas, 0, y, T, T);
    for (const [ci, s] of cols.slice(1).entries()) {
      const src = renders[s]?.[id]?.[B];
      if (src) ctx.drawImage(await loadImage(src), (ci + 1) * (T + pad), y, T, T);
    }
  }
  root.append(sheet);

  const report = {
    generatedAt: new Date().toISOString(),
    models: MODELS,
    heldOutArtworks: ids.length === 0 ? 0 : new Set(prompts.map(p => p.id)).size,
    budgets,
    metrics: 'rmse/layout/palette are medians over usable generations; usable and valid are means. See src/probe/evalPage.js.',
    seesImage: ['oracle', 'flat-mean'],
    summary,
    invalidExamples: Object.fromEntries(MODELS.map(m => [m, results[m].flatMap(r => r.invalidExamples || []).slice(0, 12)]))
  };
  window.__eval = { done: true, summary };
  if (params.get('save') === '1') {
    const tag = params.get('tag') || 'eval';
    const res = await fetch('/__probe/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ set: SET, root: 'report', files: { [`${tag}.json`]: JSON.stringify(report, null, 2), [`${tag}-sheet.png`]: sheet.toDataURL('image/png') } })
    });
    window.__eval.saved = await res.json();
  }
  meta.textContent = `Held-out evaluation · ${report.heldOutArtworks} artworks · budgets ${budgets.join('/')} · done`;
}

main().catch(err => {
  window.__eval = { done: true, error: String(err && err.stack || err) };
  meta.textContent = window.__eval.error;
});
