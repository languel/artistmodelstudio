// Performance bench for the painterly demo: the cost of a run (board code) and of a draw (renderDocument), by step.
import { E } from './harness.js';
import { runScript } from '/src/process/script.js';
import { renderDocument } from '/src/process/render.js';
import { BRUSHES, KIT, kitFor, resolveParams, mulberry32 } from '/src/process/brushes.js';
import { txPaint, txHash, txBounds, txStats, txResetStats } from '/src/process/texture.js';

const avg = a => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length);
const pct = (a, p) => { const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(b.length * p))]; };
const time = (n, fn) => { const t = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); fn(i); t.push(performance.now() - t0); } return { avg: +avg(t).toFixed(3), p50: +pct(t, 0.5).toFixed(3), p95: +pct(t, 0.95).toFixed(3) }; };

// The live loop: on each redraw the code runs, then the picture is drawn (the marks that are new are painted on the way).
export async function runLive(q) {
  const name = q.get('name') || 'castle', seconds = Number(q.get('seconds') || 40), W = Number(q.get('W') || 600), scale = Number(q.get('scale') || 0.4);
  await E.load(name, { castle: '/fixtures/references/klee/klee-1928-castle-and-sun.jpg', senecio: '/fixtures/references/klee/klee-1922-senecio.jpg', twittering: '/fixtures/references/klee/klee-1922-twittering-machine.jpg' }[name]);
  const H = Math.round(W * E.imgs[name].aspect);
  const dpr = devicePixelRatio || 1;
  const canvas = document.createElement('canvas'); canvas.width = Math.round(W * scale * dpr); canvas.height = Math.round(H * scale * dpr); const ctx = canvas.getContext('2d');
  if (q.get('noblit')) ctx.drawImage = () => {};   // the JavaScript of a draw alone (no pixels)
  const frames = [];
  txResetStats();
  const replace = q.get('replace') ? JSON.parse(q.get('replace')) : [];
  const skip = Number(q.get('skip') || 300);
  let lastDoc = null;
  const run = await E.run({ tag: 'live', name, seconds, snaps: [], replace, brush: q.get('brush') || 'oil', tolerance: Number(q.get('tolerance') || 1), keepDoc: true, onFrame: (doc, T, i, runMs) => {
    const s0 = txStats();
    const t0 = performance.now();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    renderDocument(ctx, doc, { mode: 'final', ground: true, now: T, transform: { x: 0, y: 0, scale } });
    const drawMs = performance.now() - t0, s1 = txStats();
    frames.push({ i, runMs, drawMs, marks: doc.elements.length, misses: s1.misses - s0.misses, paintMs: s1.paintMs - s0.paintMs, layers: s1.layers, mb: s1.bytes / 1048576 });
  } });
  lastDoc = { doc: run.doc, T: run.T };
  const res = E.results.live;   // (the last run's document is kept by keepDoc)
  let fidelity = {};
  if (lastDoc) { const c = document.createElement('canvas'); c.width = 480; c.height = Math.round(480 * H / W); const x = c.getContext('2d'); x.fillStyle = '#f3efe6'; x.fillRect(0, 0, c.width, c.height); renderDocument(x, lastDoc.doc, { mode: 'final', ground: false, now: lastDoc.T, transform: { x: 0, y: 0, scale: 480 / W } }); fidelity = E.metrics(name, c); }
  const tail = frames.slice(skip);
  const col = k => tail.map(f => f[k]);
  const r = k => +avg(col(k)).toFixed(2);
  const animated = !(q.get('static'));
  // The main thread's share at 12 runs a second, and a draw each run (still) or up to 30 draws a second (fading, drawing on).
  const cpu = +((12 * r('runMs') + (animated ? 30 : 12) * r('drawMs')) / 1000).toFixed(3);
  return { name, scale, marks: r('marks'), runMs: r('runMs'), drawMs: r('drawMs'), drawP95: +pct(col('drawMs'), 0.95).toFixed(1), missesPerFrame: r('misses'), paintMsPerFrame: r('paintMs'), cacheMB: r('mb'), cpu, ...fidelity, quality: txStats().quality };
}

// Where a run of the board code spends its time, by section of the demo (markers put into its text).
export async function runProf(q) {
  const name = q.get('name') || 'castle';
  await E.load(name, { castle: '/fixtures/references/klee/klee-1928-castle-and-sun.jpg', senecio: '/fixtures/references/klee/klee-1922-senecio.jpg', twittering: '/fixtures/references/klee/klee-1922-twittering-machine.jpg' }[name]);
  globalThis.__prof = [];
  const mark = (code, at, ins, before = true) => { if (!code.includes(at)) throw new Error('no marker ' + at); return before ? code.replace(at, ins + at) : code.replace(at, at + ins); };
  const hook = code => {
    code = mark(code, "const memo = state('paint')", "const __p = [performance.now()]\n");
    code = mark(code, "const paper = memo.ground\n", "__p.push(performance.now())\n", false);
    code = mark(code, "const cellOf =", "__p.push(performance.now())\n");
    code = mark(code, "// One stroke of a layer", "__p.push(performance.now())\n");
    code = mark(code, "memo.strokes = alive", "__p.push(performance.now())\n");
    return code + "\n__p.push(performance.now()); globalThis.__prof.push(__p)\n";
  };
  await E.run({ tag: 'prof', name, seconds: Number(q.get('seconds') || 25), snaps: [], keepDoc: true, codeHook: hook, replace: q.get('replace') ? JSON.parse(q.get('replace')) : [] });
  const tail = globalThis.__prof.slice(-100), names = ['source+ground', 'blur+light', 'model', 'births', 'emit'];
  const out = {};
  names.forEach((n, i) => { out[n] = +avg(tail.map(p => p[i + 1] - p[i])).toFixed(2); });
  out.total = +avg(tail.map(p => p[p.length - 1] - p[0])).toFixed(2);
  return out;
}

// The whole run as the app does it (script, then the store takes the marks in), by part.
export async function runStoreBench(q) {
  const { ProcessStore } = await import('/src/process/document.js');
  const name = q.get('name') || 'castle', W = 600;
  await E.load(name, { castle: '/fixtures/references/klee/klee-1928-castle-and-sun.jpg', senecio: '/fixtures/references/klee/klee-1922-senecio.jpg', twittering: '/fixtures/references/klee/klee-1922-twittering-machine.jpg' }[name]);
  const H = Math.round(W * E.imgs[name].aspect);
  const code = (await E.code(name, { W })).replace(/^artboard\([^)]*\)\n/, '');
  const store = new ProcessStore();
  store.change('size', d => { d.artboard = { ...d.artboard, width: W, height: H }; }, { transient: true });
  const { mulberry32 } = await import('/src/process/brushes.js');
  const realNow = Date.now, realRandom = Math.random; let T = 1_800_000_000_000; const rnd = mulberry32(1);
  Date.now = () => T; Math.random = rnd;
  const rows = [];
  try {
    for (let i = 0; i < 360; i++) {
      T = 1_800_000_000_000 + Math.round(i * 1000 / 12);
      let scriptMs = 0;
      const run = (...a) => { const t = performance.now(); const r = runScript(...a); scriptMs = performance.now() - t; return r; };
      const t0 = performance.now();
      store.runBoardCode('main', code, run, { transient: true, fresh: true, seed: i + 1 });
      rows.push({ total: performance.now() - t0, script: scriptMs });
    }
  } finally { Date.now = realNow; Math.random = realRandom; }
  const tail = rows.slice(-120);
  return { marks: store.doc.elements.length, totalMs: +avg(tail.map(r => r.total)).toFixed(2), scriptMs: +avg(tail.map(r => r.script)).toFixed(2), storeMs: +avg(tail.map(r => r.total - r.script)).toFixed(2) };
}

const setConst = (name, v) => [`const ${name} = `, `const ${name} = ${v} // `];
export async function runSweep(q) {
  const scale = q.get('scale') || '0.8', seconds = q.get('seconds') || '40';
  const V = (label, sets = {}, extra = {}) => ({ label, replace: Object.entries(sets).map(([k, v]) => [`const ${k} = ${{ density: 1, detail: 4, size: 1, fade: 1, drawOn: 1, linger: 1, tolerance: 1, speed: 1, stop: 50 }[k]}`, `const ${k} = ${v}`]), static: extra.static, brush: extra.brush, });
  const variants = JSON.parse(q.get('variants') || 'null') || [
    V('default'),
    V('density 0.5', { density: 0.5 }), V('density 0.25', { density: 0.25 }),
    V('detail 3', { detail: 3 }), V('detail 2', { detail: 2 }), V('detail 5', { detail: 5 }),
    V('size 1.5', { size: 1.5 }), V('size 2', { size: 2 }),
    V('no fade, no draw-on', { fade: 0, drawOn: 0 }, { static: true }), V('fade 0.5, draw-on 0.5', { fade: 0.5, drawOn: 0.5 }),
    V('lite: density 0.5, detail 3, size 1.5', { density: 0.5, detail: 3, size: 1.5 }),
    V('lite, no fade', { density: 0.5, detail: 3, size: 1.5, fade: 0, drawOn: 0 }, { static: true }),
    V('chalk', {}, { brush: 'chalk' })
  ];
  const out = [];
  for (const v of variants) {
    const p = new URLSearchParams({ live: '1', scale, seconds, name: q.get('name') || 'castle', replace: JSON.stringify(v.replace), ...(v.static ? { static: '1' } : {}), ...(v.brush ? { brush: v.brush } : {}) });
    const r = await runLive(p);
    out.push({ label: v.label, ...r });
    window.SWEEP = out;
  }
  return out;
}

export async function runBench(q) {
  if (q.get('sweep')) return runSweep(q);
  if (q.get('store')) return runStoreBench(q);
  if (q.get('prof')) return runProf(q);
  if (q.get('live')) return runLive(q);
  const name = q.get('name') || 'castle', seconds = Number(q.get('seconds') || 25), W = Number(q.get('W') || 600), scale = Number(q.get('scale') || 1.3333);
  await E.load(name, { castle: '/fixtures/references/klee/klee-1928-castle-and-sun.jpg', senecio: '/fixtures/references/klee/klee-1922-senecio.jpg', twittering: '/fixtures/references/klee/klee-1922-twittering-machine.jpg' }[name]);
  const replace = q.get('replace') ? JSON.parse(q.get('replace')) : [];
  const res = await E.run({ tag: 'bench', name, seconds, snaps: [], keepDoc: true, replace, brush: q.get('brush') || 'oil' });
  const { doc, T } = res; const H = Math.round(W * E.imgs[name].aspect);
  const lines = doc.elements.filter(e => e.role === 'line');
  const out = { name, seconds, marks: doc.elements.length, lines: lines.length, runMs: +avg(res.recent).toFixed(2), runMsP95: +pct(res.recent, 0.95).toFixed(2) };
  // The full draw, caches warm
  const canvas = document.createElement('canvas'); canvas.width = Math.round(W * scale); canvas.height = Math.round(H * scale); const ctx = canvas.getContext('2d');
  const draw = i => { ctx.clearRect(0, 0, canvas.width, canvas.height); renderDocument(ctx, doc, { mode: 'final', ground: true, now: T + i * 5, transform: { x: 0, y: 0, scale } }); };
  for (let i = 0; i < 4; i++) draw(i);
  out.draw = time(40, draw);
  out.drawPerMarkUs = +(out.draw.avg * 1000 / lines.length).toFixed(1);
  // By step (the same work the renderer and the oil brush do for each mark), on the real marks
  const env = { scale, rng: null, frozen: false, now: T, age: 3, board: { x: 0, y: 0, width: W, height: H } };
  const P = lines.map(e => resolveParams(e.realize.brush, e.realize.params));
  const n = lines.length, steps = {};
  steps.sortOrder = time(20, () => { const rank = new Map(doc.stages.map((s, i) => [s.id, i])); doc.elements.map((e, i) => [e, i]).sort((a, b) => (rank.get(a[0].stage) ?? 0) - (rank.get(b[0].stage) ?? 0) || a[1] - b[1]).map(([e]) => e); });
  steps.resolveParams = time(20, () => { for (const e of lines) resolveParams(e.realize.brush, e.realize.params); });
  steps.mulberryAndKit = time(20, () => { for (const e of lines) { env.rng = mulberry32(e.seed || 1); kitFor(env); } });
  const k = kitFor(env);
  steps.frames = time(20, () => { for (const e of lines) k.frames(e, 3, 0.7); });
  const FR = lines.map(e => k.frames(e, 3, 0.7));
  steps.bounds = time(20, () => { for (let i = 0; i < n; i++) txBounds(FR[i], 30); });
  steps.hash = time(20, () => { for (let i = 0; i < n; i++) txHash('oil', lines[i].points, P[i], lines[i].seed); });
  const B = lines.map((e, i) => txBounds(FR[i], P[i].width * 0.8));
  for (let w = 0; w < 2; w++) { ctx.save(); ctx.scale(scale, scale); for (let i = 0; i < n; i++) { env.rng = mulberry32(lines[i].seed || 1); BRUSHES.oil.draw(ctx, lines[i], P[i], env); } ctx.restore(); }
  steps.brushDrawOnly = time(20, () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save(); ctx.scale(scale, scale); for (let i = 0; i < n; i++) { env.rng = mulberry32(lines[i].seed || 1); BRUSHES.oil.draw(ctx, lines[i], P[i], env); } ctx.restore(); });
  steps.paintCached = time(20, () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.save(); ctx.scale(scale, scale); for (let i = 0; i < n; i++) txPaint(ctx, { scale, key: txHash('oil', lines[i].points, P[i], lines[i].seed), bounds: B[i], color: lines[i].color, alpha: 1, grain: { kind: 'canvas', scale: P[i].grain, strength: P[i].tooth, seed: 17 }, draw: () => {} }); ctx.restore(); });
  // the drawImage cost alone: blit every layer's canvas at its place
  out.steps = Object.fromEntries(Object.entries(steps).map(([k2, v]) => [k2, { ...v, perMarkUs: +(v.avg * 1000 / (k2 === 'sortOrder' ? doc.elements.length : n)).toFixed(2) }]));
  // The cost of emitting marks in board code (run): a script that only calls line() n times
  const code = `artboard(${W}, ${H})\nconst n = ${n}\nfor (const i of range(n)) line([[0.1 + 0.0004 * i % 0.8, 0.2], [0.2, 0.3 + 0.0002 * i % 0.5]], { brush: 'oil', width: 20, color: '#884433', seed: i, born: Date.now(), time: { in: 0.4, out: 3, life: 12, draw: 0.6 }, pressures: t => 0.5 + 0.5 * Math.sin(Math.PI * t) })`;
  out.emit = time(10, i => { const r = runScript(code, { seed: i, by: { kind: 'code', name: 'bench-emit' }, fresh: true }); if (r.error) throw new Error(r.error); });
  out.emitPerMarkUs = +(out.emit.avg * 1000 / n).toFixed(1);
  return out;
}
