/**
 * Palettes: named colors in named sets. Built-in sets after Klee, Kandinsky and the Bauhaus,
 * plus your own (kept in the browser). Colors can be written by name (CSS names and artists'
 * pigments), and a palette can be drawn from an image.
 */

/** Artists' pigments (approximate masstones) and a few studio names. */
export const PIGMENTS = {
  'titanium white': '#f4f2ec', 'zinc white': '#eef0ec', 'ivory black': '#231f1c', 'lamp black': '#1b1b1b', "payne's gray": '#3d4650',
  'sepia': '#704214', 'burnt umber': '#6e3b23', 'raw umber': '#826644', 'burnt sienna': '#a0522d', 'raw sienna': '#c1843f',
  'yellow ochre': '#cc9933', 'naples yellow': '#f2d68a', 'cadmium yellow': '#f5c518', 'lemon yellow': '#f2e34c', 'indian yellow': '#e3a018',
  'cadmium orange': '#ed7a1c', 'cadmium red': '#d12e1f', 'vermilion': '#e2421f', 'alizarin crimson': '#a0182c', 'rose madder': '#d25a6e',
  'venetian red': '#a8412f', 'terre verte': '#6f8a6a', 'viridian': '#3a7d6a', 'sap green': '#4f6e2c', 'olive green': '#6b6b33',
  'cerulean blue': '#2a7ab0', 'cobalt blue': '#1f4fa3', 'ultramarine': '#243f9e', 'prussian blue': '#1c2f4e', 'indigo': '#2e2a55',
  'dioxazine violet': '#4b2a68', 'cobalt violet': '#8a5a9e', 'mars black': '#20201f', 'iron gall ink': '#3b3a5a', 'graphite': '#555555',
  'charcoal': '#36393b', 'chalk': '#f1efe8', 'paper': '#f3efe6', 'kraft': '#c6a57a', 'sticky yellow': '#fbe9a6'
};

const n = (name, hex) => ({ name, hex });
export const BUILTIN_PALETTES = {
  'Klee · Senecio': [n('warm orange', '#e59b3a'), n('ember', '#d9713c'), n('red earth', '#c8472f'), n('naples', '#f2d28a'), n('ochre light', '#e8c26b'), n('burnt sienna', '#9a4b2f'), n('ground', '#f4e3c1'), n('umber', '#5b3a2a')],
  'Klee · Castle and Sun': [n('castle red', '#c8473a'), n('sun orange', '#e6a23c'), n('pale gold', '#e8d27a'), n('leaf', '#7a9c4a'), n('slate blue', '#3d5a8a'), n('plum', '#6d3f6e'), n('night', '#2f2a4a'), n('parchment', '#f0e6cf')],
  'Klee · Twittering Machine': [n('fog blue', '#7d8aa6'), n('mist', '#a9b4c6'), n('dusty rose', '#c9a9b0'), n('sand', '#b9a58d'), n('bone', '#e0d8c5'), n('ink violet', '#3b3b52'), n('ash plum', '#5a4e5e'), n('rust', '#8c3b3b')],
  'Kandinsky': [n('yellow', '#f2c230'), n('orange', '#e07a2e'), n('red', '#c8322d'), n('violet', '#8e2f6b'), n('blue', '#2a4f9a'), n('light blue', '#3aa0c8'), n('green', '#6b8f3e'), n('black', '#1a1a1a')],
  'Bauhaus': [n('red', '#d12a2a'), n('yellow', '#f2c230'), n('blue', '#1f4fa3'), n('black', '#111111'), n('white', '#f3efe6'), n('gray', '#8a8a8a')],
  'Notebook inks': [n('black ink', '#1d1b19'), n('iron gall', '#3b3a5a'), n('blue-black', '#2e3a52'), n('sepia', '#704214'), n('red ink', '#a33b2b'), n('green ink', '#2f5a3a'), n('graphite', '#555555'), n('sticky yellow', '#fbe9a6')],
  'Grays': [n('black', '#000000'), n('ink', '#1d1b19'), n('dark', '#3f3a34'), n('mid dark', '#6d665c'), n('mid', '#9b9184'), n('mid light', '#c9c1b4'), n('light', '#e6e0d6'), n('white', '#ffffff')],
  'Pigments': Object.entries(PIGMENTS).slice(0, 36).map(([name, hex]) => n(name, hex))
};

const USER_KEY = 'ams_palettes_user';
const loadUser = () => { try { return JSON.parse(localStorage.getItem(USER_KEY)) || {}; } catch { return {}; } };
const saveUser = u => { try { localStorage.setItem(USER_KEY, JSON.stringify(u)); } catch { /* ignore */ } };

/** All palettes: built-in first, then yours. */
export function allPalettes() { return { ...BUILTIN_PALETTES, ...loadUser() }; }
export function userPaletteNames() { return Object.keys(loadUser()); }

export function savePalette(name, colors) {
  const clean = colors.map(c => {
    if (typeof c === 'string') { const hx = toHex(c); return { hex: hx, name: /^#/.test(c) ? nameOf(hx) : c }; }
    const hx = toHex(c.hex || c.color || c.name);
    return { hex: hx, name: c.name || nameOf(hx), ...(c.share ? { share: c.share } : {}) };
  }).filter(c => c.hex);
  if (!name || !clean.length) throw new Error('A palette needs a name and at least one color');
  const u = loadUser(); u[name] = clean; saveUser(u);
  window.dispatchEvent(new CustomEvent('ams-palettes'));
  return { name, colors: clean };
}

export function deletePalette(name) {
  const u = loadUser(); const had = name in u; delete u[name]; saveUser(u);
  window.dispatchEvent(new CustomEvent('ams-palettes'));
  return had;
}

// ---- names ---------------------------------------------------------------------------
let cssCtx = null;
/** '#abc', '#rrggbb(aa)', a CSS color name, or a pigment name → '#rrggbb(aa)' (or null). */
export function toHex(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s)) return s.length === 4 ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase() : s.toLowerCase();
  const key = s.toLowerCase().replace(/\s+/g, ' ');
  if (PIGMENTS[key]) return PIGMENTS[key];
  for (const pal of Object.values(allPalettes())) { const hit = pal.find(c => c.name?.toLowerCase() === key); if (hit) return hit.hex; }
  try {
    cssCtx ||= (typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas')).getContext('2d');
    cssCtx.fillStyle = '#010203';
    cssCtx.fillStyle = key.replace(/ /g, '');
    const out = cssCtx.fillStyle;
    if (out !== '#010203' || key === '#010203') return out.startsWith('#') ? out : null;
  } catch { /* no canvas */ }
  return null;
}

const CSS_NAMES = { black: '#000000', white: '#ffffff', gray: '#808080', silver: '#c0c0c0', maroon: '#800000', red: '#ff0000', crimson: '#dc143c', firebrick: '#b22222', tomato: '#ff6347', coral: '#ff7f50', salmon: '#fa8072', orange: '#ffa500', gold: '#ffd700', khaki: '#f0e68c', olive: '#808000', yellowgreen: '#9acd32', green: '#008000', forestgreen: '#228b22', seagreen: '#2e8b57', teal: '#008080', turquoise: '#40e0d0', skyblue: '#87ceeb', steelblue: '#4682b4', navy: '#000080', royalblue: '#4169e1', slateblue: '#6a5acd', purple: '#800080', plum: '#dda0dd', orchid: '#da70d6', pink: '#ffc0cb', brown: '#a52a2a', chocolate: '#d2691e', tan: '#d2b48c', wheat: '#f5deb3', beige: '#f5f5dc', ivory: '#fffff0', linen: '#faf0e6', slategray: '#708090', darkslategray: '#2f4f4f', lavender: '#e6e6fa', midnightblue: '#191970', cadetblue: '#5f9ea0' };
const lab = hex => {
  const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v > 0.04045 ? ((v + 0.055) / 1.055) ** 2.4 : v / 12.92));
  const x = (c[0] * 0.4124 + c[1] * 0.3576 + c[2] * 0.1805) / 0.95047, y = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722, z = (c[0] * 0.0193 + c[1] * 0.1192 + c[2] * 0.9505) / 1.08883;
  const f = t => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
};
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The nearest pigment or CSS name for a color (pigments first: this is a studio). */
export function nameOf(hex) {
  if (!hex) return '';
  const L = lab(hex.slice(0, 7));
  let best = '', bd = Infinity;
  for (const [name, h] of Object.entries(PIGMENTS)) { const d = dist(L, lab(h)); if (d < bd) { bd = d; best = name; } }
  for (const [name, h] of Object.entries(CSS_NAMES)) { const d = dist(L, lab(h)) + 4; if (d < bd) { bd = d; best = name; } }
  const [l] = L;
  return bd > 18 ? `${l > 70 ? 'pale ' : l < 30 ? 'deep ' : ''}${best}` : best;
}

// ---- from an image -------------------------------------------------------------------
/**
 * A palette from an image: k-means in Lab on a small sample, ordered dark to light, each color
 * named. img: an HTMLImageElement / ImageBitmap / canvas.
 */
export function paletteFromImage(img, count = 6) {
  const W = 96, iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const H = Math.max(1, Math.round((W * ih) / iw));
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, W, H);
  const d = ctx.getImageData(0, 0, W, H).data;
  const px = [];
  for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 128) px.push([d[i], d[i + 1], d[i + 2]]);
  const hex = ([r, g, b]) => `#${[r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
  const pts = px.map(p => lab(hex(p)));
  // k-means++ seeding with a fixed seed so the same image gives the same palette.
  let s = 7; const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const cents = [pts[Math.floor(rnd() * pts.length)]];
  while (cents.length < count) {
    const dd = pts.map(p => Math.min(...cents.map(q => dist(p, q))) ** 2), tot = dd.reduce((a, b) => a + b, 0);
    let r = rnd() * tot, i = 0; while (r > dd[i] && i < dd.length - 1) r -= dd[i++];
    cents.push(pts[i]);
  }
  const assign = new Array(pts.length).fill(0);
  for (let it = 0; it < 10; it++) {
    for (let i = 0; i < pts.length; i++) { let b = 0, bd = Infinity; cents.forEach((q, k) => { const dd = dist(pts[i], q); if (dd < bd) { bd = dd; b = k; } }); assign[i] = b; }
    for (let k = 0; k < count; k++) { const m = px.filter((_, i) => assign[i] === k); if (m.length) cents[k] = lab(hex([0, 1, 2].map(j => m.reduce((a, p) => a + p[j], 0) / m.length))); }
  }
  const out = [];
  for (let k = 0; k < count; k++) {
    const m = px.filter((_, i) => assign[i] === k);
    if (!m.length) continue;
    const h = hex([0, 1, 2].map(j => m.reduce((a, p) => a + p[j], 0) / m.length));
    out.push({ hex: h, name: nameOf(h), share: m.length / px.length });
  }
  return out.sort((a, b) => lab(a.hex)[0] - lab(b.hex)[0]).map(({ hex: h, name, share }) => ({ hex: h, name, share: Math.round(share * 100) / 100 }));
}
