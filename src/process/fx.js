/**
 * Post effects: a stack of small image operations, for a source, a board's picture or a mask. Opt-in
 * everywhere: a board or source without a stack pays nothing.
 *
 *   [{ type: 'threshold', level: 0.5 }, { type: 'gradient', stops: ['#101030', '#f08040', '#fff8e0'] }]
 *
 * The point operations (threshold, levels, contrast, brightness, invert, posterize, gradient) look at one
 * pixel at a time, so a run of them is compiled into a few 256-entry tables and applied in one pass over the
 * pixels (about a millisecond for a 500 by 400 picture). Blur and pixelate need neighbors: they are canvas
 * operations, done by whoever owns the canvas (workbench/masks.js).
 *
 *   normalizeFx(list)      the list cleaned up: known types, parameters in range, strings allowed ('invert')
 *   fxKey(list)            a short signature (for caches)
 *   compileFx(list)        { key, stages }: point stages ({ t: 'rgb' | 'luma', lut, grad? }) and canvas stages ({ t: 'canvas', op, ... })
 *   runPoint(stage, data)  a point stage over RGBA pixels (a Uint8ClampedArray), in place
 *   toMask(data, mode, invert)   the pixels' alpha becomes the mask: from their luma or from their alpha
 */
const param = (key, label, min, max, step, def, doc) => ({ key, label, min, max, step, default: def, doc });

/** The effects: label, what it does, parameters (the same schema drives the editor, the docs and agents). */
export const FX = {
  threshold: { label: 'Threshold', kind: 'point', doc: 'Light above the level becomes white, below it black (soft: a ramp instead of an edge).',
    params: [param('level', 'Level', 0, 1, 0.01, 0.5, 'Where black turns to white.'), param('soft', 'Soft', 0, 0.5, 0.01, 0, 'Width of the ramp between them.')] },
  levels: { label: 'Levels', kind: 'point', doc: 'Black point, white point and gamma; the output range too.',
    params: [param('black', 'Black', 0, 1, 0.01, 0, 'Light at or below this is black.'), param('white', 'White', 0, 1, 0.01, 1, 'Light at or above this is white.'), param('gamma', 'Gamma', 0.1, 4, 0.05, 1, 'Above 1 lightens the middle, below darkens it.'), param('outBlack', 'Out black', 0, 1, 0.01, 0, 'What black becomes.'), param('outWhite', 'Out white', 0, 1, 0.01, 1, 'What white becomes.')] },
  contrast: { label: 'Contrast', kind: 'point', doc: 'More or less difference between light and dark.', params: [param('amount', 'Amount', -1, 1, 0.01, 0.3, 'Negative flattens, positive steepens.')] },
  brightness: { label: 'Brightness', kind: 'point', doc: 'Lighter or darker.', params: [param('amount', 'Amount', -1, 1, 0.01, 0.1, 'Added to the light.')] },
  invert: { label: 'Invert', kind: 'point', doc: 'Light becomes dark and dark light.', params: [] },
  posterize: { label: 'Posterize', kind: 'point', doc: 'Fewer steps of light.', params: [param('steps', 'Steps', 2, 16, 1, 4, 'How many levels remain.')] },
  gradient: { label: 'Gradient map', kind: 'point', doc: 'Color by light: dark takes the first color of the gradient, light the last (stops: colors, or [position, color]; 8-digit hex has alpha).',
    params: [], stops: true },
  blur: { label: 'Blur', kind: 'canvas', doc: 'Soften.', params: [param('radius', 'Radius', 0, 40, 0.5, 3, 'Pixels of the picture it is applied to.')] },
  pixelate: { label: 'Pixelate', kind: 'canvas', doc: 'Blocks.', params: [param('size', 'Size', 2, 64, 1, 8, 'Pixels a block is wide.')] }
};

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** '#rgb', '#rrggbb' or '#rrggbbaa' as [r, g, b, a] (0..255), or null. */
export function parseColor(c) {
  const m = /^#([0-9a-f]{3,8})$/i.exec(String(c || '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3 || h.length === 4) h = [...h].map(x => x + x).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  const n = i => parseInt(h.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), h.length === 8 ? n(6) : 255];
}

/** Gradient stops as [[position 0..1, '#hex'], …] sorted, from colors or pairs; at least two. */
export function normalizeStops(stops) {
  let list = Array.isArray(stops) ? stops : [];
  list = list.map((s, i) => (Array.isArray(s) ? [Number(s[0]), s[1]] : [list.length > 1 ? i / (list.length - 1) : 0, s])).filter(([t, c]) => Number.isFinite(t) && parseColor(c)).map(([t, c]) => [clamp(t, 0, 1), String(c).toLowerCase()]);
  list.sort((a, b) => a[0] - b[0]);
  if (list.length === 0) return [[0, '#000000'], [1, '#ffffff']];
  if (list.length === 1) return [[0, list[0][1]], [1, list[0][1]]];
  return list;
}

/** A list of effects cleaned up. Unknown ones are dropped; a string is an effect with its defaults. */
export function normalizeFx(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const raw of list) {
    const it = typeof raw === 'string' ? { type: raw } : raw;
    const def = it && FX[it.type];
    if (!def) continue;
    const e = { type: it.type };
    for (const p of def.params) { const v = Number(it[p.key]); e[p.key] = Number.isFinite(v) && it[p.key] !== '' && it[p.key] !== null ? clamp(v, p.min, p.max) : p.default; }
    if (def.stops) e.stops = normalizeStops(it.stops);
    if (it.off === true) e.off = true;   // switched off (kept in the stack, not applied)
    out.push(e);
  }
  return out;
}

/** A short signature of a list (equal lists, equal keys). */
export function fxKey(list) {
  return normalizeFx(list).filter(e => !e.off).map(e => `${e.type}(${Object.entries(e).filter(([k]) => k !== 'type' && k !== 'off').map(([, v]) => (Array.isArray(v) ? v.map(s => s.join('@')).join(',') : v)).join(',')})`).join('>');
}

// ---- compiling ------------------------------------------------------------------------------------------

const identity = () => { const t = new Uint8Array(256); for (let i = 0; i < 256; i++) t[i] = i; return t; };
const through = (lut, f) => { const out = new Uint8Array(256); for (let i = 0; i < 256; i++) out[i] = Math.round(clamp(f(lut[i] / 255), 0, 1) * 255); return out; };
const smooth = (a, b, v) => { if (b <= a) return v >= a ? 1 : 0; const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const isIdentity = lut => { for (let i = 0; i < 256; i++) if (lut[i] !== i) return false; return true; };

/** The scalar function (light 0..1 to 0..1) of a point effect, or null (gradient, canvas effects). */
function scalarOf(e) {
  switch (e.type) {
    case 'threshold': return v => (e.soft > 0 ? smooth(e.level - e.soft / 2, e.level + e.soft / 2, v) : (v >= e.level ? 1 : 0));
    case 'levels': { const span = Math.max(1e-6, e.white - e.black); return v => e.outBlack + (e.outWhite - e.outBlack) * Math.pow(clamp((v - e.black) / span, 0, 1), 1 / e.gamma); }
    case 'contrast': { const k = e.amount >= 0 ? 1 / (1 - e.amount * 0.99) : 1 + e.amount; return v => (v - 0.5) * k + 0.5; }
    case 'brightness': return v => v + e.amount;
    case 'invert': return v => 1 - v;
    case 'posterize': return v => Math.round(v * (e.steps - 1)) / (e.steps - 1);
    default: return null;
  }
}

/** The gradient as a 256-entry table of [r, g, b, a]. */
function gradientTable(stops) {
  const t = new Uint8Array(1024), pts = stops.map(([p, c]) => [p, parseColor(c)]);
  for (let i = 0; i < 256; i++) {
    const v = i / 255;
    let a = pts[0], b = pts[pts.length - 1];
    for (let j = 0; j < pts.length - 1; j++) if (v >= pts[j][0] && v <= pts[j + 1][0]) { a = pts[j]; b = pts[j + 1]; break; }
    const u = b[0] > a[0] ? clamp((v - a[0]) / (b[0] - a[0]), 0, 1) : 0;
    for (let c = 0; c < 4; c++) t[i * 4 + c] = Math.round(a[1][c] + (b[1][c] - a[1][c]) * u);
  }
  return t;
}

/**
 * The list as stages, in order. Consecutive point effects share one table. Light-based ones (threshold,
 * gradient) work on the pixel's luma, and so do the point effects before them in the same run; after
 * them the gray or the gradient's colors come out, and what follows acts on those channels.
 */
export function compileFx(list) {
  const fx = normalizeFx(list).filter(e => !e.off), stages = [];
  let pend = identity(), luma = false;   // pend: the table so far; luma: it will be applied to the pixel's luma
  const flush = (grad = null) => {
    if (luma || grad) stages.push({ t: 'luma', lut: pend, ...(grad ? { grad } : {}) });
    else if (!isIdentity(pend)) stages.push({ t: 'rgb', lut: pend });
    pend = identity(); luma = false;
  };
  for (const e of fx) {
    const def = FX[e.type];
    if (def.kind === 'canvas') { flush(); stages.push({ t: 'canvas', op: e.type, ...(e.type === 'blur' ? { radius: e.radius } : { size: e.size }) }); continue; }
    if (e.type === 'gradient') { luma = true; flush(gradientTable(e.stops)); continue; }   // (what came before acts on the light)
    if (e.type === 'threshold') luma = true;
    pend = through(pend, scalarOf(e));
  }
  flush();
  return { key: fxKey(list), stages };
}

// ---- applying (pixels) --------------------------------------------------------------------------------------

/** A point stage over RGBA pixels, in place. */
export function runPoint(stage, data) {
  const n = data.length, lut = stage.lut;
  if (stage.t === 'rgb') {
    for (let i = 0; i < n; i += 4) { data[i] = lut[data[i]]; data[i + 1] = lut[data[i + 1]]; data[i + 2] = lut[data[i + 2]]; }
    return;
  }
  const g = stage.grad;
  for (let i = 0; i < n; i += 4) {
    const v = lut[(data[i] * 54 + data[i + 1] * 183 + data[i + 2] * 19) >> 8];
    if (g) { const k = v * 4; data[i] = g[k]; data[i + 1] = g[k + 1]; data[i + 2] = g[k + 2]; data[i + 3] = (data[i + 3] * g[k + 3] + 127) / 255; }
    else { data[i] = v; data[i + 1] = v; data[i + 2] = v; }
  }
}

/** The pixels' alpha becomes the mask: from their luma (light shows) or their own alpha; invert flips it. Color is left as it is. */
export function toMask(data, mode = 'luma', invert = false) {
  const n = data.length;
  for (let i = 0; i < n; i += 4) {
    let a = mode === 'alpha' ? data[i + 3] : (((data[i] * 54 + data[i + 1] * 183 + data[i + 2] * 19) >> 8) * data[i + 3] + 127) / 255;
    if (invert) a = 255 - a;
    data[i + 3] = a;
  }
}

/** Is there anything to do? (A list that is empty, or all switched off, costs nothing.) */
export const fxIsEmpty = list => !Array.isArray(list) || normalizeFx(list).every(e => e.off);
