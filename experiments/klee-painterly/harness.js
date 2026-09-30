// Temporary (not committed): the painterly experiment, headless, in its own page: a simulated clock and seeded random.
import { runScript } from '/src/process/script.js';
import { renderDocument } from '/src/process/render.js';
import { setSourceProvider, clearStreamState } from '/src/process/streams.js';

const SAVE = 'http://127.0.0.1:3999/';
const save = (path, body) => fetch(SAVE + path, { method: 'POST', body });
const mulberry = seed => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const blob = (canvas, type = 'image/jpeg', q = 0.9) => new Promise(ok => canvas.toBlob(ok, type, q));

export const IMAGES = { castle: '/fixtures/references/klee/klee-1928-castle-and-sun.jpg', senecio: '/fixtures/references/klee/klee-1922-senecio.jpg', twittering: '/fixtures/references/klee/klee-1922-twittering-machine.jpg' };
export const E = { imgs: {}, results: {}, baselines: {}, jobs: { done: [], running: null, error: null } };

E.load = async (name, url) => {
  const img = new Image(); img.src = url; await img.decode();
  const cw = 320, ch = Math.round(320 * img.naturalHeight / img.naturalWidth);
  const c = document.createElement('canvas'); c.width = cw; c.height = ch; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, cw, ch);
  const data = x.getImageData(0, 0, cw, ch).data;
  const rgb = (u, v) => { const i = 4 * (Math.min(ch - 1, Math.max(0, Math.floor(v * ch))) * cw + Math.min(cw - 1, Math.max(0, Math.floor(u * cw)))); return [data[i], data[i + 1], data[i + 2]]; };
  const hex = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
  const lum = c => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
  const full = document.createElement('canvas'); full.width = 480; full.height = Math.round(480 * img.naturalHeight / img.naturalWidth); full.getContext('2d').drawImage(img, 0, 0, full.width, full.height);
  E.imgs[name] = { aspect: img.naturalHeight / img.naturalWidth, canvas: c, full, sampler: { ready: true, name, frame: 1, width: cw, height: ch, rgb, color: (u, v) => hex(rgb(u, v)), value: (u, v) => lum(rgb(u, v)), pose: [], hands: [], face: [], mask: () => 0, point: () => null, track: () => [], pixels: (w, h) => { const o = new Float32Array(w * h * 3); for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) o.set(rgb((i + 0.5) / w, (j + 0.5) / h), (j * w + i) * 3); return o; } } };
};
setSourceProvider(name => E.imgs[name]?.sampler);

E.code = async (name, { brush = 'oil', tolerance = 1, W = 600, replace = [] }) => {
  const m = await import('/src/workbench/sourceDemos.js?v=' + Date.now());
  const H = Math.round(W * E.imgs[name].aspect);
  let code = m.SOURCE_DEMOS.find(d => d.id === 'paint').code(name);
  code = code.replace("const brushId = 'oil'", `const brushId = '${brush}'`).replace(/const tolerance = 1(?= \/\*)/, `const tolerance = ${tolerance}`);
  for (const [a, b] of replace) { if (!code.includes(a)) throw new Error('no match: ' + a); code = code.replace(a, b); }
  if (brush !== 'oil') code = code.replace(/const look = \{[^}]*\}/, 'const look = {}');
  return `artboard(${W}, ${H})\n${code}`;
};

E.metrics = (name, pic) => {
  const im = E.imgs[name], w = 96, h = Math.round(96 * im.aspect);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(pic, 0, 0, w, h); const p = x.getImageData(0, 0, w, h).data;
  const s = document.createElement('canvas'); s.width = w; s.height = h; const sx = s.getContext('2d', { willReadFrequently: true }); sx.drawImage(im.canvas, 0, 0, w, h); const q = sx.getImageData(0, 0, w, h).data;
  let err = 0, cover = 0; const lp = [], lq = [];
  for (let i = 0; i < w * h; i++) {
    const a = [p[i * 4], p[i * 4 + 1], p[i * 4 + 2]], b = [q[i * 4], q[i * 4 + 1], q[i * 4 + 2]];
    err += (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3;
    if (p[i * 4 + 3] === 0 || Math.abs(a[0] - 243) > 14 || Math.abs(a[1] - 239) > 14 || Math.abs(a[2] - 230) > 14) cover++;
    lp.push(0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2]); lq.push(0.2126 * b[0] + 0.7152 * b[1] + 0.0722 * b[2]);
  }
  let ss = 0, nb = 0; const C1 = 6.5, C2 = 58.5;
  for (let by = 0; by + 8 <= h; by += 4) for (let bx = 0; bx + 8 <= w; bx += 4) {
    let mp = 0, mq = 0; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { mp += lp[(by + j) * w + bx + i]; mq += lq[(by + j) * w + bx + i]; } mp /= 64; mq /= 64;
    let vp = 0, vq = 0, cv = 0; for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) { const a = lp[(by + j) * w + bx + i] - mp, b = lq[(by + j) * w + bx + i] - mq; vp += a * a; vq += b * b; cv += a * b; } vp /= 63; vq /= 63; cv /= 63;
    ss += ((2 * mp * mq + C1) * (2 * cv + C2)) / ((mp * mp + mq * mq + C1) * (vp + vq + C2)); nb++;
  }
  return { err: +(err / (w * h)).toFixed(2), ssim: +(ss / nb).toFixed(3), cover: +(cover / (w * h)).toFixed(3) };
};

E.baseline = name => {
  const im = E.imgs[name], out = {};
  for (const n of [96, 48, 24]) { const c = document.createElement('canvas'); c.width = n; c.height = Math.round(n * im.aspect); const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.drawImage(im.canvas, 0, 0, c.width, c.height); const b = document.createElement('canvas'); b.width = 480; b.height = Math.round(480 * im.aspect); const y = b.getContext('2d'); y.imageSmoothingEnabled = false; y.drawImage(c, 0, 0, b.width, b.height); out[`mosaic ${n}`] = E.metrics(name, b); }
  return out;
};

E.run = async ({ tag, name, brush = 'oil', tolerance = 1, seconds = 60, snaps = [5, 10, 20, 30, 45, 60], seed = 1, hz = 12, W = 600, replace = [], label, keepDoc = false, onFrame = null, codeHook = null }) => {
  let code = await E.code(name, { brush, tolerance, W, replace }); if (codeHook) code = codeHook(code); const H = Math.round(W * E.imgs[name].aspect);
  const by = { kind: 'code', name: `exp-${tag}` };
  clearStreamState(`state:exp-${tag}`);
  const realNow = Date.now, realRandom = Math.random, rnd = mulberry(seed);
  let T = 1_800_000_000_000; const t0 = T;
  const res = { tag, name, brush, tolerance, seconds, seed, label: label || tag, snaps: [], runMs: [] };
  Date.now = () => T; Math.random = rnd;
  let doc = null; const recent = [];
  try {
    const n = Math.round(seconds * hz);
    for (let i = 0; i < n; i++) {
      T = t0 + Math.round(i * 1000 / hz);
      const t1 = performance.now();
      const r = runScript(code, { seed: seed * 1000 + i, by, fresh: true });
      res.runMs.push(performance.now() - t1); recent.push(res.runMs[res.runMs.length - 1]); if (recent.length > 60) recent.shift();
      if (r.error) throw new Error(r.error);
      doc = r.doc;
      if (onFrame) onFrame(doc, T, i, res.runMs[res.runMs.length - 1]);
      const sec = (i + 1) / hz;
      const due = snaps.find(s => Math.abs(s - sec) < 0.5 / hz);
      if (due !== undefined && !res.snaps.some(s => s.t === due)) {
        const c = document.createElement('canvas'); c.width = 480; c.height = Math.round(480 * H / W);
        const ctx = c.getContext('2d'); ctx.fillStyle = '#f3efe6'; ctx.fillRect(0, 0, c.width, c.height);
        renderDocument(ctx, doc, { mode: 'final', ground: false, now: T, transform: { x: 0, y: 0, scale: 480 / W } });
        const m = E.metrics(name, c);
        const lines = doc.elements.filter(e => e.role === 'line');
        const file = `${tag}/${String(due).padStart(3, '0')}s.jpg`;
        await save(file, await blob(c));
        res.snaps.push({ t: due, ...m, strokes: lines.length, born5s: lines.filter(e => T - e.born < 5000).length, file, lost: ctx.isContextLost?.() || false });
      }
      if (i % 12 === 0) await new Promise(r => setTimeout(r, 0));
    }
  } finally { Date.now = realNow; Math.random = realRandom; }
  res.meanRunMs = +(res.runMs.reduce((a, b) => a + b, 0) / res.runMs.length).toFixed(1);
  res.maxRunMs = +Math.max(...res.runMs).toFixed(1);
  delete res.runMs;
  if (keepDoc) { res.doc = doc; res.T = T; res.recent = recent; return res; }
  E.results[tag] = res;
  await save(E.outFile || `${tag.split('/')[0] === tag ? '' : tag.split('/')[0] + '/'}results.json`, JSON.stringify({ results: E.results, baselines: E.baselines }, null, 1));   // (a tag with a folder, 'perf/castle', saves beside its folder)
  return res;
};

E.runAll = async jobs => {
  try {
    for (const n of Object.keys(IMAGES)) { if (!E.imgs[n]) await E.load(n, IMAGES[n]); E.baselines[n] = E.baseline(n); }
    for (const j of jobs) { E.jobs.running = j.tag; await E.run(j); E.jobs.done.push(j.tag); }
    E.jobs.running = null;
  } catch (e) { E.jobs.error = String(e.stack || e); }
};
window.E = E;
