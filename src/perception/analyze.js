/**
 * Perception: what is on the reference, as structure a decision model can read.
 *
 * Deterministic computer vision, no learning:
 *   value masses   k-means on Lab color (seeded), smoothed
 *   regions        connected components of the masses, small ones merged, outer
 *                  boundary traced (Moore neighbour) and simplified (RDP) to polygons
 *   per region     area, centroid, bbox, mean value (0 dark … 1 light) and class,
 *                  color and hue name, edge density (Sobel), dominant orientation and
 *                  coherence (structure tensor), and a place name (upper left, center …)
 * Polygons come back in artboard units (fit: cover, like the reference underlay).
 */

const MAX_SIDE = 160;

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function toLab(r, g, b) {
  const lin = c => { c /= 255; return c > 0.04045 ? ((c + 0.055) / 1.055) ** 2.4 : c / 12.92; };
  const R = lin(r), G = lin(g), B = lin(b);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, Y = R * 0.2126 + G * 0.7152 + B * 0.0722, Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

export function hueName(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510, s = mx === mn ? 0 : (mx - mn) / (255 - Math.abs(mx + mn - 255));
  if (s < 0.18) return l > 0.8 ? 'white' : l < 0.2 ? 'black' : 'gray';
  let h = 0;
  if (mx === r) h = ((g - b) / (mx - mn)) % 6; else if (mx === g) h = (b - r) / (mx - mn) + 2; else h = (r - g) / (mx - mn) + 4;
  h = (h * 60 + 360) % 360;
  const names = [[15, 'red'], [40, 'orange'], [65, 'yellow'], [160, 'green'], [200, 'cyan'], [255, 'blue'], [290, 'violet'], [335, 'pink'], [360, 'red']];
  const base = names.find(([lim]) => h < lim)[1];
  return l < 0.3 ? `dark ${base}` : l > 0.75 ? `pale ${base}` : base;
}

/** Downsample an image (cover-fitted to the artboard aspect) to a small RGBA grid. A ready grid { w, h, data } passes through. */
function sample(img, aspect) {
  if (img?.data && img.w && img.h) return img;
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const w = aspect >= 1 ? MAX_SIDE : Math.round(MAX_SIDE * aspect), h = aspect >= 1 ? Math.round(MAX_SIDE / aspect) : MAX_SIDE;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const k = Math.max(w / iw, h / ih), dw = iw * k, dh = ih * k;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return { w, h, data: ctx.getImageData(0, 0, w, h).data };
}

function kmeans(points, k, rng, iters = 12) {
  const n = points.length;
  const cents = [points[Math.floor(rng() * n)].slice()];
  while (cents.length < k) {
    const d = points.map(p => Math.min(...cents.map(c => (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2)));
    const total = d.reduce((a, b) => a + b, 0) || 1;
    let r = rng() * total, i = 0;
    while (i < n - 1 && (r -= d[i]) > 0) i++;
    cents.push(points[i].slice());
  }
  const label = new Int32Array(n);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity;
      for (let j = 0; j < k; j++) { const c = cents[j], d = (points[i][0] - c[0]) ** 2 + (points[i][1] - c[1]) ** 2 + (points[i][2] - c[2]) ** 2; if (d < bd) { bd = d; best = j; } }
      label[i] = best;
    }
    const sum = cents.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) { const s = sum[label[i]]; s[0] += points[i][0]; s[1] += points[i][1]; s[2] += points[i][2]; s[3]++; }
    sum.forEach((s, j) => { if (s[3]) cents[j] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }
  return { label, cents };
}

function modeFilter(label, w, h) {
  const out = new Int32Array(label.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const counts = new Map();
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const xx = Math.min(w - 1, Math.max(0, x + dx)), yy = Math.min(h - 1, Math.max(0, y + dy)), l = label[yy * w + xx];
      counts.set(l, (counts.get(l) || 0) + 1);
    }
    out[y * w + x] = [...counts].sort((a, b) => b[1] - a[1])[0][0];
  }
  return out;
}

function components(label, w, h) {
  const comp = new Int32Array(label.length).fill(-1), sizes = [];
  let n = 0;
  for (let i = 0; i < label.length; i++) {
    if (comp[i] >= 0) continue;
    const stack = [i]; comp[i] = n; let size = 0;
    while (stack.length) {
      const p = stack.pop(); size++;
      const x = p % w, y = (p - x) / w;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const q = yy * w + xx;
        if (comp[q] < 0 && label[q] === label[i]) { comp[q] = n; stack.push(q); }
      }
    }
    sizes.push(size); n++;
  }
  return { comp, sizes };
}

/** Merge components smaller than minSize into their most common neighbour. */
function mergeSmall(comp, sizes, w, h, minSize) {
  for (let pass = 0; pass < 3; pass++) {
    for (let c = 0; c < sizes.length; c++) {
      if (!sizes[c] || sizes[c] >= minSize) continue;
      const nb = new Map();
      for (let i = 0; i < comp.length; i++) {
        if (comp[i] !== c) continue;
        const x = i % w, y = (i - x) / w;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const o = comp[yy * w + xx];
          if (o !== c) nb.set(o, (nb.get(o) || 0) + 1);
        }
      }
      if (!nb.size) continue;
      const to = [...nb].sort((a, b) => b[1] - a[1])[0][0];
      for (let i = 0; i < comp.length; i++) if (comp[i] === c) comp[i] = to;
      sizes[to] += sizes[c]; sizes[c] = 0;
    }
  }
}

/** Outer boundary of component c by Moore-neighbour tracing (pixel corners). */
function trace(comp, w, h, c) {
  let start = -1;
  for (let i = 0; i < comp.length; i++) if (comp[i] === c) { start = i; break; }
  if (start < 0) return [];
  const inC = (x, y) => x >= 0 && y >= 0 && x < w && y < h && comp[y * w + x] === c;
  const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  let x = start % w, y = (start - x) / w;
  const sx = x, sy = y, out = [[x, y]];
  let d = 6;
  for (let steps = 0; steps < w * h * 4; steps++) {
    let found = false;
    for (let k = 0; k < 8; k++) {
      const nd = (d + 6 + k) % 8, nx = x + dirs[nd][0], ny = y + dirs[nd][1];
      if (inC(nx, ny)) { x = nx; y = ny; d = nd; found = true; break; }
    }
    if (!found || (x === sx && y === sy)) break;
    out.push([x, y]);
  }
  return out;
}

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [a, b] = [pts[0], pts[pts.length - 1]];
  let idx = 0, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    const d = Math.abs(dy * x - dx * y + b[0] * a[1] - b[1] * a[0]) / L;
    if (d > dmax) { dmax = d; idx = i; }
  }
  if (dmax <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}

function place(cx, cy) {
  const v = cy < 0.34 ? 'upper' : cy > 0.66 ? 'lower' : 'middle';
  const hz = cx < 0.34 ? 'left' : cx > 0.66 ? 'right' : 'center';
  return v === 'middle' && hz === 'center' ? 'center' : v === 'middle' ? `middle ${hz}` : `${v} ${hz}`;
}

/**
 * Analyze an image for an artboard. Returns { masses, regions, field } where regions carry
 * artboard-space polygons.
 */
export function analyzeImage(img, { width = 1000, height = 1000, k = 5, seed = 7, minArea = 0.01 } = {}) {
  const { w, h, data } = sample(img, width / height);
  const n = w * h;
  const lab = [], lum = new Float32Array(n);
  for (let i = 0; i < n; i++) { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; lab.push(toLab(r, g, b)); lum[i] = (0.299 * r + 0.587 * g + 0.114 * b) / 255; }
  const { label, cents } = kmeans(lab, k, mulberry32(seed));
  const smooth = modeFilter(modeFilter(label, w, h), w, h);
  const { comp, sizes } = components(smooth, w, h);
  mergeSmall(comp, sizes, w, h, Math.max(4, n * minArea));

  // Sobel gradients for edges and the structure tensor.
  const gx = new Float32Array(n), gy = new Float32Array(n);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const L = (dx, dy) => lum[(y + dy) * w + x + dx];
    gx[y * w + x] = (L(1, -1) + 2 * L(1, 0) + L(1, 1)) - (L(-1, -1) + 2 * L(-1, 0) + L(-1, 1));
    gy[y * w + x] = (L(-1, 1) + 2 * L(0, 1) + L(1, 1)) - (L(-1, -1) + 2 * L(0, -1) + L(1, -1));
  }

  const sx = width / w, sy = height / h;
  const regions = [];
  sizes.forEach((size, c) => {
    if (!size) return;
    let cx = 0, cy = 0, r = 0, g = 0, b = 0, v = 0, edge = 0, jxx = 0, jyy = 0, jxy = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
    for (let i = 0; i < n; i++) {
      if (comp[i] !== c) continue;
      const x = i % w, y = (i - x) / w;
      cx += x; cy += y; r += data[i * 4]; g += data[i * 4 + 1]; b += data[i * 4 + 2]; v += lum[i];
      const m = Math.hypot(gx[i], gy[i]); edge += m;
      jxx += gx[i] * gx[i]; jyy += gy[i] * gy[i]; jxy += gx[i] * gy[i];
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
    cx /= size; cy /= size; r /= size; g /= size; b /= size; v /= size;
    // Dominant stroke direction runs along the edges: perpendicular to the mean gradient.
    const gradAngle = 0.5 * Math.atan2(2 * jxy, jxx - jyy);
    const lam = Math.sqrt((jxx - jyy) ** 2 + 4 * jxy * jxy), coherence = (jxx + jyy) ? lam / (jxx + jyy) : 0;
    let orient = (gradAngle * 180) / Math.PI + 90;
    orient = ((orient + 90) % 180 + 180) % 180 - 90;
    const poly = rdp(trace(comp, w, h, c), 0.9).map(([x, y]) => [Math.round((x + 0.5) * sx), Math.round((y + 0.5) * sy)]);
    if (poly.length < 3) return;
    const hex = '#' + [r, g, b].map(q => Math.round(q).toString(16).padStart(2, '0')).join('');
    regions.push({
      area: size / n, centroid: [(cx + 0.5) / w, (cy + 0.5) / h], bbox: [x0 / w, y0 / h, (x1 + 1) / w, (y1 + 1) / h],
      value: v, valueClass: v < 0.36 ? 'dark' : v > 0.66 ? 'light' : 'middle', color: hex, hue: hueName(r, g, b),
      edges: Math.min(1, edge / size / 1.2), orientation: Math.round(orient), coherence: +coherence.toFixed(2),
      place: place((cx + 0.5) / w, (cy + 0.5) / h), polygon: poly
    });
  });
  regions.sort((a, b) => b.area - a.area);
  regions.forEach((r, i) => { r.id = `r${i + 1}`; });
  const masses = cents.map((c, j) => ({ lightness: +(c[0] / 100).toFixed(2), share: +(label.filter(l => l === j).length / n).toFixed(3) })).sort((a, b) => a.lightness - b.lightness);
  return { width, height, grid: [w, h], masses, regions };
}

/** One line per region, compact enough for a decision model's state budget. */
export function describeRegion(r) {
  const dir = r.coherence < 0.25 ? 'no clear direction' : Math.abs(r.orientation) < 20 ? 'horizontal' : Math.abs(r.orientation) > 70 ? 'vertical' : r.orientation > 0 ? 'rising diagonal' : 'falling diagonal';
  return `${r.id}: ${r.place}, ${Math.round(r.area * 100)}%, ${r.valueClass} ${r.hue}, ${r.edges > 0.35 ? 'busy edges' : r.edges > 0.12 ? 'some edges' : 'calm'}, ${dir}`;
}
