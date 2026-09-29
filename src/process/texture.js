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
const TX_BUDGET = 96 * 1024 * 1024;  // bytes of layers kept
const txLayers = new Map();          // key → layer, least recently used first
let txBytes = 0;

function txCanvas(w, h) {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : null;
  if (!c) return null;   // no canvas here (a test, a worker without one): a textured mark is simply not drawn
  c.width = Math.max(1, w); c.height = Math.max(1, h);
  return c;
}

/** Pixels per unit for a view scale: about what the screen needs, in half-octave steps so zooming reuses layers. */
export function txPpu(scale) {
  const ppu = Math.max(0.25, Math.min(4, (scale || 1) * (globalThis.devicePixelRatio || 1)));
  return Math.pow(2, Math.round(Math.log2(ppu) * 2) / 2);
}

/** A small stable key for numbers (points, parameters) that does not care about float dust. */
export function txHash(...parts) {
  let s = '';
  for (const p of parts) {
    if (Array.isArray(p)) { for (const q of p) s += Array.isArray(q) ? `${Math.round(q[0] * 4)},${Math.round(q[1] * 4)}${q.length > 3 ? `,${Math.round(q[3] * 20)}` : ''};` : `${q};`; }
    else if (p && typeof p === 'object') s += JSON.stringify(p);
    else s += `${p}|`;
  }
  return s;
}

/** A blank layer over [x0, y0, x1, y1] (units): drawn in units with lctx, kept as a canvas of ppu pixels a unit. */
export function txLayer(bounds, ppu) {
  let [x0, y0, x1, y1] = bounds;
  let w = Math.ceil((x1 - x0) * ppu), h = Math.ceil((y1 - y0) * ppu);
  const k = Math.min(1, TX_CAP / Math.max(w, h));
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
 *   width  across the whole brush, or (frame) => width (pressure spreads the bristles)
 *   dry    0 (loaded, unbroken) .. 1 (nearly dry)
 */
export function txHairs(lctx, frames, { count = 24, width = 20, thickness = 1.2, dry = 0.35, flow = 0.85, rng = Math.random } = {}) {
  if (frames.length < 2) return;
  const widthAt = f => (typeof width === 'function' ? width(f) : width);
  lctx.save();
  lctx.lineCap = 'round'; lctx.lineJoin = 'round'; lctx.strokeStyle = '#fff';
  const phases = [];
  for (let h = 0; h < count; h++) phases.push({ off: count === 1 ? 0 : h / (count - 1) - 0.5 + (rng() - 0.5) * 0.5 / count, th: thickness * (0.5 + rng()), a: flow * (0.45 + 0.55 * rng()), ph: rng() * 1000, fq: 0.015 + rng() * 0.04, need: rng() });
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
      const holds = paint + 0.3 * (Math.sin(hr.ph + len[i] * hr.fq) * 0.5) > hr.need * 0.9;
      const o = hr.off * widthAt(f), x = f.x + f.nx * o, y = f.y + f.ny * o;
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
  const ppu = txPpu(scale), full = `${key}|${color}|${ppu}|${txHash(grain)}`;
  let layer = txLayers.get(full);
  if (layer) { txLayers.delete(full); txLayers.set(full, layer); }
  else {
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
    while (txBytes > TX_BUDGET && txLayers.size > 1) {
      const [oldKey, old] = txLayers.entries().next().value;
      txLayers.delete(oldKey); txBytes -= old.bytes;
    }
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.drawImage(layer.canvas, layer.x, layer.y, layer.w, layer.h);
  ctx.restore();
}
