/**
 * Texture: what a brush can use to paint with grain, hairs and layers. Canvas 2D only, deterministic,
 * and written to be read and changed: a brush composes these (see the brush kit in brushes.js).
 *
 * The idea: a mark is painted white into a small layer (its own canvas, in world units), the paper's
 * grain is multiplied into the layer's alpha, the layer is tinted with the mark's color and put on the
 * picture. The grain is fixed to the paper (world coordinates), so strokes that cross share one
 * tooth, as on real paper. A layer is kept while its inputs stay the same, so a mark that only fades
 * (see envelope.js) is a cheap bitmap, not painted again on every frame.
 *
 *   txLayer(bounds, ppu)                    a layer for [x0, y0, x1, y1] (units), at ppu pixels per unit
 *   txDabs(lctx, frames, opts)              stamp a tip along a walk (spacing, size, flow, scatter, angle)
 *   txHairs(lctx, frames, opts)             bristles: parallel hairs that lift off where the paint runs dry
 *   txGrain(layer, { kind, scale, strength, seed })    multiply the paper's grain into the layer
 *   txPaint(ctx, spec)                      the whole thing: cache, draw, grain, tint, put on the picture
 */
const TX_CAP = 2048;                 // largest layer side in pixels
const TX_AREA = 250000;              // largest layer area in pixels (about 1 MB)
let TX_BUDGET = 128 * 1024 * 1024;   // bytes of layers kept
const txLayers = new Map();          // key → layer ({ …, used: when it was last drawn (ms), dead: given back })
let txBytes = 0;
let txClock = 0;                     // the moment of the frame being drawn (txBeginFrame)
let txQuality = 1;                   // 0.3..1: layers are painted at this share of the screen's pixels while the cache is short of room
let txCalm = 0;                      // frames since the cache last ran short of room
let txSweptAt = 0;
let txWait = 150;                    // calm frames before quality grows back (doubles each time the cache runs short again)

let txLost = false;                  // a canvas lost its context: what we kept is blank (see txReady)
const txStat = { hits: 0, misses: 0, paintMs: 0, evicted: 0, thrash: 0, swept: 0 };   // what the cache did (txStats)

/** What the layer cache holds and has done since txResetStats: layers, bytes, hits, misses (marks painted), ms spent painting. */
export function txStats(detail = false) {
  const out = { ...txStat, paintMs: +txStat.paintMs.toFixed(2), layers: txLayers.size, bytes: txBytes, budget: TX_BUDGET, quality: +txQuality.toFixed(2), fast: txFast.size };
  if (detail) { let inUse = 0, n = 0, px = 0; for (const l of txLayers.values()) if (txClock - l.used < 100) { inUse += l.bytes; n++; px += l.canvas.width * l.canvas.height; } out.inUseMB = +(inUse / 1048576).toFixed(1); out.inUse = n; out.avgPx = Math.round(px / Math.max(1, n)); }
  return out;
}
/** Give every kept layer back (and forget what was known about marks). */
export function txClear() {
  for (const l of txLayers.values()) { l.dead = true; txRelease(l.canvas); }
  txLayers.clear(); txFast.clear(); txBytes = 0;
}
/** Room for layers, in megabytes (default 128). */
export function txBudget(mb) { if (mb > 0) TX_BUDGET = mb * 1024 * 1024; return TX_BUDGET / 1048576; }

/**
 * A frame begins (the renderer calls this): layers drawn from now on count as in use. If the last frames ran short
 * of room (a layer that was in use had to go), layers are painted smaller, so that what is on screen fits; when
 * there has been room for a while, they grow back.
 */
export function txBeginFrame() {
  txClock = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (txStat.thrash > 0) { txQuality = Math.max(0.3, txQuality * 0.75); txStat.thrash = 0; txCalm = 0; txWait = Math.min(4800, txWait * 2); }
  else if (txQuality < 1 && ++txCalm > txWait) { txQuality = Math.min(1, txQuality * 1.25); txCalm = 0; if (txQuality >= 1) txWait = 150; }
  // Layers of marks that are long gone (their life is over) are given back every couple of seconds.
  if (txClock - txSweptAt > 2000) {
    txSweptAt = txClock;
    for (const [k, l] of txLayers) if (txClock - l.used > 20000) { txLayers.delete(k); txBytes -= l.bytes; l.dead = true; txRelease(l.canvas); txStat.swept = (txStat.swept || 0) + 1; }
  }
}

/** Make room: the layers used least recently go first (those used in the last quarter second count as thrash). */
function txEvict(target) {
  const list = [...txLayers.entries()].sort((a, b) => a[1].used - b[1].used);
  for (const [k, l] of list) {
    if (txBytes <= target) break;
    if (txClock - l.used < 250) txStat.thrash = (txStat.thrash || 0) + 1;
    txLayers.delete(k); txBytes -= l.bytes; l.dead = true; txRelease(l.canvas); txStat.evicted++;
  }
}

// ---- marks whose layer is known: a mark that has been painted once is put on the picture without asking its brush ----
const txFast = new Map();   // a mark's key → { layer, alpha }, or false (its brush paints more than one layer: ask it)
let txArmed = null;

/** The renderer is about to draw a mark with its brush: remember the layer it paints, under `fk`. */
export function txArm(fk) { txArmed = { fk, n: 0, entry: null }; }
export function txDisarm() {
  const a = txArmed; txArmed = null;
  if (!a) return;
  if (txFast.size > 30000) txFast.clear();
  txFast.set(a.fk, a.n === 1 ? a.entry : false);
}
/** The known layer of a mark: { layer, alpha } (ready to blit), false (ask the brush), or null (not seen yet). */
export function txKnown(fk) {
  const e = txFast.get(fk);
  if (e === undefined) return null;
  if (e === false) return false;
  if (e.layer.dead) { txFast.delete(fk); return null; }
  e.layer.used = txClock;
  return e;
}
/** Put a known layer on the picture (alpha: on top of the brush's own). */
export function txBlit(ctx, e, alpha = 1) {
  const l = e.layer, g = ctx.globalAlpha;
  ctx.globalAlpha = g * e.alpha * alpha;
  ctx.drawImage(l.canvas, l.x, l.y, l.w, l.h);
  ctx.globalAlpha = g;
}

export function txResetStats() { for (const k in txStat) txStat[k] = 0; }

function txCanvas(w, h) {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : null;
  if (!c) return null;   // no canvas here (a test, a worker without one): a textured mark is simply not drawn
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  c.addEventListener?.('contextlost', () => { txLost = true; });
  return c;
}

/** Give a canvas's memory back now (the browser would wait for a collection). */
function txRelease(c) { if (c) { c.width = 0; c.height = 0; } }

/**
 * Browsers take every canvas's contents away at times (memory pressure, a hidden window, a graphics reset):
 * what we kept, layers and grain tiles and tips, is then blank, and a blank grain tile wipes a whole mark.
 * After a loss nothing is painted until canvases work again; then everything kept is dropped and painted anew.
 */
function txReady() {
  if (!txLost) return true;
  const probe = txCanvas(2, 2), x = probe?.getContext('2d');
  if (!x || x.isContextLost?.()) return false;
  for (const l of txLayers.values()) { l.dead = true; txRelease(l.canvas); }
  txLayers.clear(); txFast.clear(); txBytes = 0; txSprites.clear(); txGrainTiles.clear();
  txLost = false;
  return true;
}

/** Pixels per unit for a view scale: about what the screen needs, in half-octave steps so zooming reuses layers. */
let txPpuFor = { scale: 0, q: 0, dpr: 0, ppu: 1 };
export function txPpu(scale) {
  const dpr = globalThis.devicePixelRatio || 1;
  if (txPpuFor.scale === scale && txPpuFor.q === txQuality && txPpuFor.dpr === dpr) return txPpuFor.ppu;
  const raw = Math.max(0.25, Math.min(4, (scale || 1) * dpr * txQuality));
  const ppu = Math.pow(2, Math.round(Math.log2(raw) * 2) / 2);
  txPpuFor = { scale, q: txQuality, dpr, ppu };
  return ppu;
}

/** A small stable key for numbers (points, parameters) that does not care about float dust. */
export function txHash(...parts) {
  let s = '';
  for (const p of parts) {
    if (Array.isArray(p)) { for (const q of p) s += Array.isArray(q) ? `${Math.round(q[0] * 4)},${Math.round(q[1] * 4)}${q.length > 3 ? `,${Math.round(q[3] * 20)}` : ''};` : `${q};`; }
    else if (p && typeof p === 'object') {
      // (plain parameters, the usual case, without JSON)
      let t = '{', plain = true;
      for (const k in p) { const v = p[k]; if (v !== null && typeof v === 'object') { plain = false; break; } t += `${k}:${v},`; }
      s += plain ? `${t}}` : JSON.stringify(p);
    }
    else s += `${p}|`;
  }
  return s;
}

/** A blank layer over [x0, y0, x1, y1] (units): drawn in units with lctx, kept as a canvas of ppu pixels a unit. */
export function txLayer(bounds, ppu) {
  let [x0, y0, x1, y1] = bounds;
  let w = Math.ceil((x1 - x0) * ppu), h = Math.ceil((y1 - y0) * ppu);
  // Not larger than a side of TX_CAP pixels or an area of TX_AREA: a broad soft stroke does not need every pixel of the screen.
  const k = Math.min(1, TX_CAP / Math.max(w, h), Math.sqrt(TX_AREA / Math.max(1, w * h)));
  if (k < 1) { ppu *= k; w = Math.ceil((x1 - x0) * ppu); h = Math.ceil((y1 - y0) * ppu); }
  const canvas = txCanvas(w, h), lctx = canvas?.getContext('2d');
  if (!lctx) return null;
  lctx.setTransform(ppu, 0, 0, ppu, -x0 * ppu, -y0 * ppu);
  return { canvas, lctx, x: x0, y: y0, w: (x1 - x0), h: (y1 - y0), ppu, px: [canvas.width, canvas.height] };
}

// ---- noise and grain --------------------------------------------------------------------------------

function txRng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Periodic value noise on a lattice (so a tile repeats without seams): 0..1. */
function txNoiseField(size, cells, seed) {
  const r = txRng(seed), lat = new Float32Array(cells * cells);
  for (let i = 0; i < lat.length; i++) lat[i] = r();
  const out = new Float32Array(size * size), step = cells / size;
  for (let y = 0; y < size; y++) {
    const fy = y * step, j = Math.floor(fy), v = fy - j, sv = v * v * (3 - 2 * v);
    for (let x = 0; x < size; x++) {
      const fx = x * step, i = Math.floor(fx), u = fx - i, su = u * u * (3 - 2 * u);
      const a = lat[j % cells * cells + i % cells], b = lat[j % cells * cells + (i + 1) % cells], c = lat[(j + 1) % cells * cells + i % cells], d = lat[(j + 1) % cells * cells + (i + 1) % cells];
      out[y * size + x] = a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv;
    }
  }
  return out;
}

const txGrainTiles = new Map();
const TX_TILE = 128;

/**
 * A grain tile: alpha 255 lets paint through, less holds it back. kinds:
 *   paper   the tooth of drawing paper: small pits everywhere, coarser hollows
 *   canvas  a weave
 *   fibre   streaks in one direction (a rough brush, wood)
 *   noise   soft mottling
 * strength 0 (no grain) .. 1 (paint only stays on the tops).
 */
function txGrainTile(kind, seed, strength) {
  const key = `${kind}|${seed}|${Math.round(strength * 20)}`;
  let tile = txGrainTiles.get(key);
  if (tile) return tile;
  const s = Math.round(strength * 20) / 20, size = TX_TILE;
  const fine = txNoiseField(size, 32, seed * 7 + 1), mid = txNoiseField(size, 16, seed * 7 + 2), coarse = txNoiseField(size, 8, seed * 7 + 3);
  const streak = kind === 'fibre' ? txNoiseField(size, 4, seed * 7 + 4) : null;
  tile = txCanvas(size, size);
  const ctx = tile.getContext('2d'), img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    let v;   // 0 (pit) .. 1 (top)
    if (kind === 'canvas') {
      const wx = Math.abs(Math.sin(x / size * Math.PI * 8)), wy = Math.abs(Math.sin(y / size * Math.PI * 8));
      v = 0.2 * (wx + wy) + 0.8 * (0.55 * fine[i] + 0.45 * mid[i]);   // a weave under a lot of tooth: not a grid
    } else if (kind === 'fibre') {
      // Noise stretched along x: sample the coarse field on a few rows only.
      v = 0.6 * streak[(Math.floor(y / 2) % size) * size + x] + 0.4 * fine[i];
    } else if (kind === 'noise') v = 0.5 * mid[i] + 0.5 * coarse[i];
    else v = 0.5 * fine[i] + 0.3 * mid[i] + 0.2 * coarse[i];   // paper
    const t = Math.min(1, Math.max(0, (v - 0.3) / 0.45));
    const top = t * t * (3 - 2 * t);
    img.data[i * 4 + 3] = Math.round(255 * (1 - s * (1 - top)));
  }
  ctx.putImageData(img, 0, 0);
  txGrainTiles.set(key, tile);
  return tile;
}

/** Multiply the paper's grain into a layer's alpha: { kind, scale (units a texel), strength, seed }. */
export function txGrain(layer, { kind = 'paper', scale = 0.6, strength = 0.5, seed = 1 } = {}) {
  if (!(strength > 0)) return;
  const { lctx, ppu, x, y, canvas } = layer;
  const pat = lctx.createPattern(txGrainTile(kind, seed, strength), 'repeat');
  if (!pat) return;
  // Fixed to the paper: the texel grid starts at world (0, 0), whichever layer this is.
  const m = new DOMMatrix().translate(-x * ppu, -y * ppu).scale(scale * ppu);
  pat.setTransform?.(m);
  lctx.save();
  lctx.setTransform(1, 0, 0, 1, 0, 0);
  lctx.globalCompositeOperation = 'destination-in';
  lctx.fillStyle = pat;
  lctx.fillRect(0, 0, canvas.width, canvas.height);
  lctx.restore();
}

// ---- tips and walks -----------------------------------------------------------------------------------

const txSprites = new Map();
/** A soft round dab, white, at hardness 0 (a haze) .. 1 (a hard disc), as a sprite to scale. */
function txSoftSprite(hardness) {
  const h = Math.round(hardness * 10) / 10;
  let sp = txSprites.get(h);
  if (sp) return sp;
  sp = txCanvas(64, 64);
  const c = sp.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(Math.max(0.01, Math.min(0.99, h)), 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.fillRect(0, 0, 64, 64);
  txSprites.set(h, sp);
  return sp;
}

/**
 * Stamp a tip along a walk (frames from the kit: x, y, nx, ny, speed, pressure).
 *   tip       'soft' (round, hardness), 'flat' (a chisel: aspect, angle) or 'square'
 *   size      diameter (units), or (frame) => diameter
 *   flow      the alpha of each dab, or (frame) => alpha (dabs overlap and build up)
 *   spacing   distance between dabs, in diameters (0.05 dense .. 1 a string of beads)
 *   scatter   random drift across the walk, in diameters
 *   hardness  of a soft tip;  aspect, angle  of a flat tip (angle: 'follow' across the walk, 'along' with it, or radians)
 *   rng       the mark's seeded random
 */
export function txDabs(lctx, frames, { tip = 'soft', size = 10, flow = 0.5, spacing = 0.12, scatter = 0, hardness = 0.5, aspect = 0.3, angle = 'follow', rng = Math.random } = {}) {
  if (!frames.length) return;
  const sizeAt = f => (typeof size === 'function' ? size(f) : size), flowAt = f => (typeof flow === 'function' ? flow(f) : flow);
  const dab = (x, y, f) => {
    const d = Math.max(0.1, sizeAt(f)), a = Math.max(0, Math.min(1, flowAt(f)));
    if (a <= 0.002) return;
    let px = x, py = y;
    if (scatter) { const j = (rng() - 0.5) * scatter * d; px += f.nx * j; py += f.ny * j; }
    lctx.globalAlpha = a;
    if (tip === 'soft') { lctx.drawImage(txSoftSprite(hardness), px - d / 2, py - d / 2, d, d); return; }
    lctx.save();
    lctx.translate(px, py);
    // 'follow': the flat side across the walk; 'along': with it; or an angle (radians).
    const dir = Math.atan2(-f.nx, f.ny);
    lctx.rotate(angle === 'follow' ? dir + Math.PI / 2 : angle === 'along' ? dir : angle);
    lctx.fillStyle = '#fff';
    if (tip === 'flat') lctx.fillRect(-d / 2, -d * aspect / 2, d, d * aspect);
    else lctx.fillRect(-d / 2, -d / 2, d, d);
    lctx.restore();
  };
  lctx.save();
  let carry = 0, last = frames[0];
  dab(last.x, last.y, last);
  for (let i = 1; i < frames.length; i++) {
    const f = frames[i];
    let dx = f.x - last.x, dy = f.y - last.y, dist = Math.hypot(dx, dy);
    while (dist > 1e-6) {
      const step = Math.max(0.15, sizeAt(f) * spacing);
      if (carry + dist < step) { carry += dist; last = { ...f, x: f.x, y: f.y }; dist = 0; break; }
      const u = (step - carry) / dist;
      last = { ...f, x: last.x + dx * u, y: last.y + dy * u };
      dab(last.x, last.y, last);
      dx = f.x - last.x; dy = f.y - last.y; dist = Math.hypot(dx, dy); carry = 0;
    }
  }
  lctx.restore();
}

/**
 * Bristles: `count` parallel hairs across `width` (units), each its own thin line along the walk,
 * with its own thickness and strength. The paint runs down along the stroke (faster with `dry`, and
 * with speed): hairs lift off one after another and leave gaps: the dry-brush look.
 *   width  across the whole brush, or (frame, u) => width (u: 0..1 along the walk; pressure spreads the bristles)
 *   trim   0..1: each hair may start late and end early, by up to this share of the walk (ragged ends)
 *   streaks  0..1: how much the hairs differ in the paint they carry (0 an even body of paint)
 *   dry    0 (loaded, unbroken) .. 1 (nearly dry)
 */
export function txHairs(lctx, frames, { count = 24, width = 20, thickness = 1.2, dry = 0.35, flow = 0.85, trim = 0, streaks = 0.55, rng = Math.random } = {}) {
  if (frames.length < 2) return;
  const widthAt = (f, i) => (typeof width === 'function' ? width(f, i / Math.max(1, frames.length - 1)) : width);
  lctx.save();
  lctx.lineCap = 'round'; lctx.lineJoin = 'round'; lctx.strokeStyle = '#fff';
  const phases = [];
  for (let h = 0; h < count; h++) phases.push({ off: count === 1 ? 0 : h / (count - 1) - 0.5 + (rng() - 0.5) * 0.5 / count, th: thickness * (0.5 + rng()), a: flow * (1 - streaks * rng()), ph: rng() * 1000, fq: 0.015 + rng() * 0.04, need: rng(), from: rng() * trim, to: 1 - rng() * trim });
  // Arc length along the walk: the paint on the brush runs down along it.
  const len = [0];
  for (let i = 1; i < frames.length; i++) len.push(len[i - 1] + Math.hypot(frames[i].x - frames[i - 1].x, frames[i].y - frames[i - 1].y));
  const total = Math.max(1e-6, len[len.length - 1]);
  for (const hr of phases) {
    let drawing = false;
    lctx.globalAlpha = hr.a; lctx.lineWidth = hr.th;
    lctx.beginPath();
    frames.forEach((f, i) => {
      // The load falls along the stroke and with speed; each hair needs its own amount to hold paint, so the
      // hairs drop out one after another (a little wavering keeps the breaks uneven).
      const paint = 1 - dry * (0.3 + 0.7 * len[i] / total) - dry * Math.min(0.35, f.speed * 0.008);
      const holds = paint + 0.3 * (Math.sin(hr.ph + len[i] * hr.fq) * 0.5) > hr.need * 0.9 && len[i] >= hr.from * total && len[i] <= hr.to * total;
      const o = hr.off * widthAt(f, i), x = f.x + f.nx * o, y = f.y + f.ny * o;
      if (holds) { drawing ? lctx.lineTo(x, y) : lctx.moveTo(x, y); drawing = true; }
      else drawing = false;
    });
    lctx.stroke();
  }
  lctx.restore();
}

/** Bounds of a walk grown by `pad`: [x0, y0, x1, y1]. */
export function txBounds(frames, pad) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of frames) { x0 = Math.min(x0, f.x); y0 = Math.min(y0, f.y); x1 = Math.max(x1, f.x); y1 = Math.max(y1, f.y); }
  return [Math.floor(x0 - pad), Math.floor(y0 - pad), Math.ceil(x1 + pad), Math.ceil(y1 + pad)];
}

// ---- washes ---------------------------------------------------------------------------------------------

/**
 * A wash: a closed shape whose pigment gathers at its edge and is grainy inside (a layer's alpha).
 *   edge    how much darker the rim is than the middle (0 flat .. 1 strong), rimWidth in units
 *   rough   how much the edge wanders (units)
 */
export function txWash(layer, poly, { edge = 0.5, rimWidth = 4, rough = 1.5, base = 0.6, seed = 1 } = {}) {
  const { lctx, ppu } = layer, r = txRng(seed);
  // The outline, wandering a little (a wet edge is never a straight one).
  const ring = poly.map(([x, y], i) => { const ph = r() * 6.28; return [x + Math.cos(ph + i) * rough * r(), y + Math.sin(ph + i * 1.3) * rough * r()]; });
  const path = c => { c.beginPath(); ring.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
  lctx.save();
  lctx.fillStyle = '#fff';
  lctx.globalAlpha = base; path(lctx); lctx.fill();
  const canBlur = 'filter' in lctx;
  if (edge > 0 && canBlur) {
    // The rim: the shape minus a blurred copy of itself (the blur is weakest at the edge).
    const a = txCanvas(layer.canvas.width, layer.canvas.height), ac = a.getContext('2d');
    ac.setTransform(ppu, 0, 0, ppu, -layer.x * ppu, -layer.y * ppu); ac.fillStyle = '#fff'; path(ac); ac.fill();
    const b = txCanvas(a.width, a.height), bc = b.getContext('2d');
    bc.filter = `blur(${Math.max(0.5, rimWidth * ppu)}px)`; bc.drawImage(a, 0, 0);
    ac.setTransform(1, 0, 0, 1, 0, 0); ac.globalCompositeOperation = 'destination-out'; ac.drawImage(b, 0, 0);
    lctx.setTransform(1, 0, 0, 1, 0, 0);
    lctx.globalAlpha = Math.min(1, edge * 1.6); lctx.drawImage(a, 0, 0); lctx.drawImage(a, 0, 0);   // twice: the rim reads through the grain
    txRelease(a); txRelease(b);
  } else if (edge > 0) {
    lctx.globalAlpha = edge * 0.7; lctx.strokeStyle = '#fff'; lctx.lineWidth = rimWidth * 0.6; path(lctx); lctx.stroke();
  }
  lctx.restore();
}

// ---- putting it together ----------------------------------------------------------------------------------

/**
 * Paint one mark through a layer.
 *   ctx        the picture's context (units)
 *   spec       { key, bounds, draw(lctx, layer), grain, color, alpha, ppu, scale }
 *              key: what the layer depends on (points, parameters, seed): the same key reuses the layer
 *              draw(lctx, layer): paint white into the layer, in units
 *              grain: { kind, scale, strength, seed } or null;  color, alpha: how it lands on the picture
 */
export function txPaint(ctx, { key, bounds, draw, grain = null, color = '#1d1b19', alpha = 1, scale = 1 }) {
  if (!txReady()) return;
  const ppu = txPpu(scale), full = `${key}|${color}|${ppu}|${txHash(grain)}`;
  let layer = txLayers.get(full);
  if (layer) txStat.hits++;
  else {
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    txStat.misses++;
    layer = txLayer(bounds, ppu);
    if (!layer) return;
    layer.lctx.save(); draw(layer.lctx, layer); layer.lctx.restore();
    if (grain) txGrain(layer, grain);
    // Tint: the white layer takes the mark's color, keeping its alpha.
    layer.lctx.save();
    layer.lctx.setTransform(1, 0, 0, 1, 0, 0);
    layer.lctx.globalCompositeOperation = 'source-in';
    layer.lctx.fillStyle = color;
    layer.lctx.fillRect(0, 0, layer.canvas.width, layer.canvas.height);
    layer.lctx.restore();
    layer.bytes = layer.canvas.width * layer.canvas.height * 4;
    txLayers.set(full, layer); txBytes += layer.bytes;
    if (txBytes > TX_BUDGET) txEvict(TX_BUDGET * 0.8);
    if (t0) txStat.paintMs += performance.now() - t0;
  }
  layer.used = txClock;
  if (txArmed) { txArmed.n++; txArmed.entry = { layer, alpha }; }
  const g = ctx.globalAlpha;
  ctx.globalAlpha = g * alpha;
  ctx.drawImage(layer.canvas, layer.x, layer.y, layer.w, layer.h);
  ctx.globalAlpha = g;
}
