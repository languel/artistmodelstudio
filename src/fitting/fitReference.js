/**
 * Reference Fitter
 *
 * Answers one question: can the Core DSL (flat medium) express a given
 * reference image? Greedily adds rect / triangle / circle actions, each
 * chosen by random search plus hill climbing to minimise squared RGB error
 * against the reference. No model is involved.
 *
 * Geometry mirrors FlatCanvasMedium (toX/toY/toSize); coverage is computed (anti-aliased) rather
 * than drawn, so it runs anywhere (a worker) and fast. Callers can verify with the medium.
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
   * @param {string} [opts.background] background color to emit when `start` is given
   * @param {number} [opts.precision] decimals kept in emitted coordinates (search accounts for rounding)
   * Set `mask` (Uint8Array, one entry per pixel, 0 = ignore) to fit only part of the canvas.
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

  /**
   * A shape's coverage (0..1 per cell) over its clipped bounding box, computed (no canvas, so it runs
   * in a worker, and no read-back per try): rectangles exactly (the overlap of each cell), circles and
   * triangles anti-aliased by the distance to their edge.
   */
  coverage(shape) {
    let x0, y0, x1, y1, at;
    if (shape.type === 'rect') {
      const rw = this.toSize(shape.width), rh = this.toSize(shape.height);
      const rx = this.toX(shape.x) - rw / 2, ry = this.toY(shape.y) - rh / 2;
      [x0, y0, x1, y1] = [rx, ry, rx + rw, ry + rh];
      const span = (a, b, p) => Math.max(0, Math.min(b, p + 1) - Math.max(a, p));
      at = (px, py) => span(x0, x1, px) * span(y0, y1, py);
    } else if (shape.type === 'circle') {
      const cx = this.toX(shape.x), cy = this.toY(shape.y);
      const r = Math.max(0.5, this.toSize(shape.diameter) * 0.5);
      [x0, y0, x1, y1] = [cx - r, cy - r, cx + r, cy + r];
      at = (px, py) => { const dx = px + 0.5 - cx, dy = py + 0.5 - cy, v = r + 0.5 - Math.sqrt(dx * dx + dy * dy); return v <= 0 ? 0 : v >= 1 ? 1 : v; };
    } else {
      const pts = shape.points.map(([x, y]) => [this.toX(x), this.toY(y)]);
      x0 = Math.min(...pts.map(p => p[0])); x1 = Math.max(...pts.map(p => p[0]));
      y0 = Math.min(...pts.map(p => p[1])); y1 = Math.max(...pts.map(p => p[1]));
      // Each edge as a line (nx, ny, c) with the inside positive, by the winding.
      const area = pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0);
      if (Math.abs(area) < 1e-6) return null;
      const sign = area > 0 ? 1 : -1;
      const edges = pts.map((p, i) => {
        const q = pts[(i + 1) % pts.length], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len * sign, ny = dx / len * sign;
        return [nx, ny, -(nx * p[0] + ny * p[1])];
      });
      at = (px, py) => {
        let d = Infinity;
        for (const [nx, ny, c] of edges) d = Math.min(d, nx * (px + 0.5) + ny * (py + 0.5) + c);
        return clamp(d + 0.5, 0, 1);
      };
    }
    const bx = clamp(Math.floor(x0) - 1, 0, this.w), by = clamp(Math.floor(y0) - 1, 0, this.h);
    const bw = clamp(Math.ceil(x1) + 2, 0, this.w) - bx, bh = clamp(Math.ceil(y1) + 2, 0, this.h) - by;
    if (bw <= 0 || bh <= 0) return null;
    const a = new Float32Array(bw * bh);
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) a[y * bw + x] = at(bx + x, by + y);
    return { bx, by, bw, bh, a };
  }

  /** Best opaque color for this shape and the resulting change in squared error. */
  score(shape) {
    const cov = this.coverage(shape);
    if (!cov) return { delta: Infinity };
    const { bx, by, bw, bh, a } = cov;
    const { target: T, current: C, w } = this;
    // Color minimising sum a^2 (c - (T - (1-a)C)/a)^2  → weighted mean of target under coverage
    const M = this.mask;
    let sw = 0, sr = 0, sg = 0, sb = 0;
    for (let y = 0; y < bh; y++) {
      const row = (by + y) * w + bx;
      for (let x = 0; x < bw; x++) {
        const al = a[y * bw + x];
        if (al === 0 || (M && !M[row + x])) continue;
        const i = (row + x) * 3, k = 1 - al;
        sw += al * al;
        sr += al * (T[i] - k * C[i]);
        sg += al * (T[i + 1] - k * C[i + 1]);
        sb += al * (T[i + 2] - k * C[i + 2]);
      }
    }
    if (sw < 1) return { delta: Infinity };
    // Emitted color is 8-bit hex, so score with the rounded color.
    const r0 = clamp(Math.round(sr / sw), 0, 255), g0 = clamp(Math.round(sg / sw), 0, 255), b0 = clamp(Math.round(sb / sw), 0, 255);
    let delta = 0;
    for (let y = 0; y < bh; y++) {
      const row = (by + y) * w + bx;
      for (let x = 0; x < bw; x++) {
        const al = a[y * bw + x];
        if (al === 0 || (M && !M[row + x])) continue;
        const i = (row + x) * 3;
        // before: T - C; after: T - (C + (c - C) al) = (T - C) - (c - C) al
        let d = T[i] - C[i], e = d - (r0 - C[i]) * al; delta += e * e - d * d;
        d = T[i + 1] - C[i + 1]; e = d - (g0 - C[i + 1]) * al; delta += e * e - d * d;
        d = T[i + 2] - C[i + 2]; e = d - (b0 - C[i + 2]) * al; delta += e * e - d * d;
      }
    }
    return { delta, color: [r0, g0, b0], cov };
  }

  apply(shape, color, cov) {
    const { bx, by, bw, bh, a } = cov;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const al = a[y * bw + x];
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
