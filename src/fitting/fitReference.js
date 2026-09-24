/**
 * Reference Fitter
 *
 * Answers one question: can the Core DSL (flat medium) express a given
 * reference image? Greedily adds rect / triangle / circle actions, each
 * chosen by random search plus hill climbing to minimise squared RGB error
 * against the reference. No model is involved.
 *
 * Geometry mirrors FlatCanvasMedium (toX/toY/toSize) so the emitted program
 * renders identically there; callers should still verify with the medium.
 */

export const SHAPE_TYPES = ['rect', 'triangle', 'circle'];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function toHex([r, g, b]) {
  return '#' + [r, g, b].map(v => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('');
}

/** Read an image (optionally cropped by fractional box) into RGB floats at w×h. */
export function imageToRGB(img, w, h, crop = null) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const box = crop || { x: 0, y: 0, w: 1, h: 1 };
  ctx.drawImage(img, box.x * iw, box.y * ih, box.w * iw, box.h * ih, 0, 0, w, h);
  return canvasToRGB(c);
}

export function canvasToRGB(canvas) {
  const { width: w, height: h } = canvas;
  const data = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const rgb = new Float32Array(w * h * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    rgb[j] = data[i];
    rgb[j + 1] = data[i + 1];
    rgb[j + 2] = data[i + 2];
  }
  return rgb;
}

/** Root-mean-square error over all channels, in 0–255 units. */
export function rmse(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return Math.sqrt(s / a.length);
}

export class ReferenceFitter {
  /**
   * @param {Float32Array} target RGB floats, width*height*3
   * @param {Object} [opts]
   * @param {string[]} [opts.shapes] subset of SHAPE_TYPES to use
   * @param {Float32Array} [opts.start] starting canvas (e.g. a parent program's render)
   * @param {string} [opts.background] background colour to emit when `start` is given
   * @param {number} [opts.precision] decimals kept in emitted coordinates (search accounts for rounding)
   */
  constructor(target, width, height, { seed = 1, trials = 64, climbs = 96, shapes = SHAPE_TYPES, start = null, background = null, precision = 3 } = {}) {
    this.target = target;
    this.w = width;
    this.h = height;
    this.rand = mulberry32(seed);
    this.trials = trials;
    this.climbs = climbs;
    this.scale = 10 ** precision;
    this.shapeTypes = shapes.filter(t => SHAPE_TYPES.includes(t));
    if (this.shapeTypes.length === 0) throw new Error(`No valid shape types in ${JSON.stringify(shapes)}`);

    this.maskCanvas = document.createElement('canvas');
    this.maskCanvas.width = width;
    this.maskCanvas.height = height;
    this.mctx = this.maskCanvas.getContext('2d', { willReadFrequently: true });

    const mean = [0, 0, 0];
    for (let i = 0; i < target.length; i += 3) {
      mean[0] += target[i];
      mean[1] += target[i + 1];
      mean[2] += target[i + 2];
    }
    const n = target.length / 3;
    this.background = toHex(mean.map(v => v / n));
    const bg = mean.map(v => Math.round(v / n));
    this.current = new Float32Array(target.length);
    for (let i = 0; i < this.current.length; i += 3) {
      this.current[i] = bg[0];
      this.current[i + 1] = bg[1];
      this.current[i + 2] = bg[2];
    }
    if (start) {
      this.current = Float32Array.from(start);
      if (background) this.background = background;
    }
    this.shapes = [];
  }

  // --- geometry identical to FlatCanvasMedium ---
  toX(x) { return (x + 1) * 0.5 * this.w; }
  toY(y) { return (y + 1) * 0.5 * this.h; }
  toSize(s) { return s * 0.5 * Math.min(this.w, this.h); }
  fromSize(px) { return px / (0.5 * Math.min(this.w, this.h)); }

  randomShape(type = this.shapeTypes[Math.floor(this.rand() * this.shapeTypes.length)]) {
    const R = () => this.rand() * 2 - 1;
    const s = () => 0.02 + this.rand() * 0.3;
    if (type === 'rect') return { type, x: R(), y: R(), width: s(), height: s() };
    if (type === 'circle') return { type, x: R(), y: R(), diameter: s() };
    const cx = R(), cy = R(), k = 0.25;
    return { type, points: [0, 1, 2].map(() => [clamp(cx + (this.rand() - 0.5) * k * 2, -1, 1), clamp(cy + (this.rand() - 0.5) * k * 2, -1, 1)]) };
  }

  mutate(shape, scale) {
    const j = () => (this.rand() - 0.5) * 2 * scale;
    const m = JSON.parse(JSON.stringify(shape));
    if (m.type === 'rect') {
      const k = Math.floor(this.rand() * 4);
      if (k === 0) m.x = clamp(m.x + j(), -1.2, 1.2);
      if (k === 1) m.y = clamp(m.y + j(), -1.2, 1.2);
      if (k === 2) m.width = clamp(m.width + j(), 0.005, 2.5);
      if (k === 3) m.height = clamp(m.height + j(), 0.005, 2.5);
    } else if (m.type === 'circle') {
      const k = Math.floor(this.rand() * 3);
      if (k === 0) m.x = clamp(m.x + j(), -1.2, 1.2);
      if (k === 1) m.y = clamp(m.y + j(), -1.2, 1.2);
      if (k === 2) m.diameter = clamp(m.diameter + j(), 0.005, 2.5);
    } else {
      const p = m.points[Math.floor(this.rand() * 3)];
      p[0] = clamp(p[0] + j(), -1.2, 1.2);
      p[1] = clamp(p[1] + j(), -1.2, 1.2);
    }
    return m;
  }

  /** Rasterise a shape to coverage values over its clipped bounding box. */
  coverage(shape) {
    const ctx = this.mctx;
    let x0, y0, x1, y1;
    ctx.beginPath();
    if (shape.type === 'rect') {
      const rw = this.toSize(shape.width), rh = this.toSize(shape.height);
      const rx = this.toX(shape.x) - rw / 2, ry = this.toY(shape.y) - rh / 2;
      ctx.rect(rx, ry, rw, rh);
      [x0, y0, x1, y1] = [rx, ry, rx + rw, ry + rh];
    } else if (shape.type === 'circle') {
      const cx = this.toX(shape.x), cy = this.toY(shape.y);
      const r = Math.max(0.5, this.toSize(shape.diameter) * 0.5);
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      [x0, y0, x1, y1] = [cx - r, cy - r, cx + r, cy + r];
    } else {
      const pts = shape.points.map(([x, y]) => [this.toX(x), this.toY(y)]);
      ctx.moveTo(pts[0][0], pts[0][1]);
      pts.slice(1).forEach(p => ctx.lineTo(p[0], p[1]));
      ctx.closePath();
      x0 = Math.min(...pts.map(p => p[0])); x1 = Math.max(...pts.map(p => p[0]));
      y0 = Math.min(...pts.map(p => p[1])); y1 = Math.max(...pts.map(p => p[1]));
    }
    const bx = clamp(Math.floor(x0) - 1, 0, this.w), by = clamp(Math.floor(y0) - 1, 0, this.h);
    const bw = clamp(Math.ceil(x1) + 2, 0, this.w) - bx, bh = clamp(Math.ceil(y1) + 2, 0, this.h) - by;
    if (bw <= 0 || bh <= 0) return null;
    ctx.clearRect(bx, by, bw, bh);
    ctx.fillStyle = '#fff';
    ctx.fill();
    const a = ctx.getImageData(bx, by, bw, bh).data;
    ctx.clearRect(bx, by, bw, bh);
    return { bx, by, bw, bh, a };
  }

  /** Best opaque colour for this shape and the resulting change in squared error. */
  score(shape) {
    const cov = this.coverage(shape);
    if (!cov) return { delta: Infinity };
    const { bx, by, bw, bh, a } = cov;
    const { target: T, current: C, w } = this;
    // Colour minimising sum a^2 (c - (T - (1-a)C)/a)^2  → weighted mean of target under coverage
    let sw = 0, sr = 0, sg = 0, sb = 0;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const al = a[(y * bw + x) * 4 + 3] / 255;
        if (al === 0) continue;
        const i = ((by + y) * w + bx + x) * 3;
        const wt = al * al;
        sw += wt;
        sr += al * (T[i] - (1 - al) * C[i]);
        sg += al * (T[i + 1] - (1 - al) * C[i + 1]);
        sb += al * (T[i + 2] - (1 - al) * C[i + 2]);
      }
    }
    if (sw < 1) return { delta: Infinity };
    // Emitted colour is 8-bit hex, so score with the rounded colour.
    const col = [sr / sw, sg / sw, sb / sw].map(v => clamp(Math.round(v), 0, 255));
    let delta = 0;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const al = a[(y * bw + x) * 4 + 3] / 255;
        if (al === 0) continue;
        const i = ((by + y) * w + bx + x) * 3;
        for (let ch = 0; ch < 3; ch++) {
          const before = T[i + ch] - C[i + ch];
          const after = T[i + ch] - (C[i + ch] + (col[ch] - C[i + ch]) * al);
          delta += after * after - before * before;
        }
      }
    }
    return { delta, color: col, cov };
  }

  apply(shape, color, cov) {
    const { bx, by, bw, bh, a } = cov;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const al = a[(y * bw + x) * 4 + 3] / 255;
        if (al === 0) continue;
        const i = ((by + y) * this.w + bx + x) * 3;
        for (let ch = 0; ch < 3; ch++) this.current[i + ch] += (color[ch] - this.current[i + ch]) * al;
      }
    }
    this.shapes.push({ ...shape, color: toHex(color) });
  }

  /** Round shape coords to the precision the program will carry. */
  quantize(shape) {
    const r = v => Math.round(v * this.scale) / this.scale;
    const q = { ...shape };
    for (const k of ['x', 'y', 'width', 'height', 'diameter']) if (k in q) q[k] = r(q[k]);
    if (q.points) q.points = q.points.map(([x, y]) => [r(x), r(y)]);
    return q;
  }

  /** Add one shape. Returns false when no candidate improves the fit. */
  step() {
    let best = null;
    for (let t = 0; t < this.trials; t++) {
      const s = this.randomShape();
      const r = this.score(s);
      if (!best || r.delta < best.delta) best = { shape: s, ...r };
    }
    for (let c = 0; c < this.climbs; c++) {
      const scale = 0.15 * (1 - c / this.climbs) + 0.01;
      const s = this.mutate(best.shape, scale);
      const r = this.score(s);
      if (r.delta < best.delta) best = { shape: s, ...r };
    }
    const q = this.quantize(best.shape);
    const final = this.score(q);
    if (!(final.delta < 0)) return false;
    this.apply(q, final.color, final.cov);
    return true;
  }

  currentRMSE() {
    return rmse(this.current, this.target);
  }

  /** Shape actions only (fill + shape pairs), for appending to an existing program. */
  shapeActions(limit = this.shapes.length) {
    const actions = [];
    for (const s of this.shapes.slice(0, limit)) {
      actions.push({ op: 'fill', color: s.color, opacity: 1 });
      if (s.type === 'rect') actions.push({ op: 'rect', x: s.x, y: s.y, width: s.width, height: s.height });
      else if (s.type === 'circle') actions.push({ op: 'circle', x: s.x, y: s.y, diameter: s.diameter });
      else actions.push({ op: 'polygon', points: s.points });
    }
    return actions;
  }

  toProgram(limit = this.shapes.length) {
    return {
      version: 1,
      actions: [{ op: 'background', color: this.background }, { op: 'noStroke' }, ...this.shapeActions(limit)]
    };
  }
}
