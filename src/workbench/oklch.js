/**
 * OKLCH: lightness, chroma and hue in the perceptually even Oklab space (Björn Ottosson). Equal steps look equal, so a
 * disc of hue (angle) and chroma (radius) at one lightness is an honest map of the colors there, and two colors on
 * it can be compared by eye: the distance between the dots is how different they look.
 */
const toLin = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = c => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.abs(c) ** (1 / 2.4) - 0.055);

/** '#rrggbb' → { L, C, h } with L 0..1, C ≥ 0 (about 0..0.33 inside sRGB) and h in degrees [0, 360). */
export function hexToOklch(hex) {
  const r = toLin(parseInt(hex.slice(1, 3), 16) / 255), g = toLin(parseInt(hex.slice(3, 5), 16) / 255), b = toLin(parseInt(hex.slice(5, 7), 16) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const C = Math.hypot(A, B);
  return { L, C: C < 1e-4 ? 0 : C, h: C < 1e-4 ? 0 : ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

/** Linear sRGB (unclamped) of an OKLCH color. */
export function oklchLinear(L, C, h) {
  const a = C * Math.cos((h * Math.PI) / 180), b = C * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}

const EPS = 1e-4;
export const inGamut = lin => lin.every(v => v >= -EPS && v <= 1 + EPS);

/** The largest chroma ≤ C that fits in sRGB at this lightness and hue. */
export function fitChroma(L, C, h) {
  if (L <= 0 || L >= 1) return 0;
  if (inGamut(oklchLinear(L, C, h))) return C;
  let lo = 0, hi = C;
  for (let i = 0; i < 18; i++) { const mid = (lo + hi) / 2; if (inGamut(oklchLinear(L, mid, h))) lo = mid; else hi = mid; }
  return lo;
}

/** [r, g, b] 0..255 of an OKLCH color, with the chroma pulled in until it fits. */
export function oklchRgb(L, C, h) {
  const lin = oklchLinear(Math.max(0, Math.min(1, L)), fitChroma(L, C, h), h);
  return lin.map(v => Math.round(Math.max(0, Math.min(1, toSrgb(Math.max(0, v)))) * 255));
}

export const oklchHex = (L, C, h) => `#${oklchRgb(L, C, h).map(v => v.toString(16).padStart(2, '0')).join('')}`;

/** The chroma the disc's edge stands for: a little beyond the most saturated sRGB color. */
export const CHROMA_MAX = 0.33;
