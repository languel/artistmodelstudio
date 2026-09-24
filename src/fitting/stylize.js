/**
 * Pixel and ASCII looks for any painting.
 *
 * Both draw the painting small, on a grid shaped to the view, then:
 *   pixel  enlarge with hard edges, optionally snapping colours to a palette
 *   ascii  map each cell's brightness to a character from a ramp (dark → light
 *          on a light ground is reversed automatically by `invert`), drawn in a
 *          monospace font. Cells are taller than wide (CELL_ASPECT), like real
 *          terminal characters, so the picture keeps its proportions.
 *
 * Shared by the studio (media and continuous mode) and the continuous p5
 * export, which embeds this file with import/export lines stripped, so keep it
 * free of imports.
 */

export const CELL_ASPECT = 0.55; // character width / height for common monospace fonts

export const ASCII_RAMPS = {
  standard: ' .:-=+*#%@',
  detailed: ' .\'`^",:;Il!i><~+_-?][}{1)(|\\/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$',
  blocks: ' ░▒▓█',
  dots: ' ·•●',
  minimal: ' .:*#',
  binary: ' 01',
  box: ' ─│┼╬',
  slashes: ' ./\\|X',
  tetragram: ' \u{1D356}\u{1D352}\u{1D32E}\u{1D32A}\u{1D306}', // Tai Xuan Jing, broken → solid lines
  cp437: ' ·∙░▒▓█',                  // IBM PC code page 437 shades
  petscii: ' .▗▚▞▙█',                // Commodore-style block graphics
  braille: ' ⣿',                       // 2×4 dots per character (sub-cell)
  sextants: ' 🬋🬹█',                  // Teletext / Legacy Computing 2×3 mosaics (sub-cell)
  quadrants: ' ▘▚▙█'                 // 2×2 block quadrants (sub-cell)
};

export const RAMP_LABELS = {
  standard: 'Standard', detailed: 'Detailed (70)', blocks: 'Blocks', dots: 'Dots', minimal: 'Minimal',
  binary: 'Binary', box: 'Box lines', slashes: 'Slashes', tetragram: 'Tetragrams', cp437: 'Code page 437',
  petscii: 'PETSCII blocks', braille: 'Braille (2×4)', sextants: 'Teletext sextants (2×3)',
  quadrants: 'Quadrants (2×2)', custom: 'Custom'
};

// Sub-cell sets: each character shows a small on/off dot or block pattern.
const SUBCELL = { braille: [2, 4], sextants: [2, 3], quadrants: [2, 2] };
const QUADS = ' ▘▝▀▖▌▞▛▗▚▐▜▄▙▟█';
function subcellGlyph(set, bits) {
  if (set === 'braille') {
    const map = [0x01, 0x08, 0x02, 0x10, 0x04, 0x20, 0x40, 0x80]; // (x, y) row-major → braille bit
    let v = 0;
    for (let i = 0; i < 8; i++) if (bits & (1 << i)) v |= map[i];
    return String.fromCharCode(0x2800 + v);
  }
  if (set === 'quadrants') return QUADS[bits];
  if (bits === 0) return ' ';
  if (bits === 21) return '▌';
  if (bits === 42) return '▐';
  if (bits === 63) return '█';
  return String.fromCodePoint(0x1FB00 + bits - 1 - (bits > 21 ? 1 : 0) - (bits > 42 ? 1 : 0));
}

let lastAsciiText = '';
/** Plain text of the most recent ASCII drawing (rows joined by newlines). */
export function getAsciiText() { return lastAsciiText; }

export const PIXEL_PALETTES = {
  full: null,
  pico8: ['#000000', '#1d2b53', '#7e2553', '#008751', '#ab5236', '#5f574f', '#c2c3c7', '#fff1e8', '#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#83769c', '#ff77a8', '#ffccaa'],
  gameboy: ['#0f380f', '#306230', '#8bac0f', '#9bbc0f'],
  cga: ['#000000', '#55ffff', '#ff55ff', '#ffffff'],
  bit1: ['#000000', '#ffffff'],
  gray8: ['#000000', '#242424', '#494949', '#6d6d6d', '#929292', '#b6b6b6', '#dbdbdb', '#ffffff']
};

export const DEFAULT_STYLE = {
  pixelCells: 64,        // cells on the long side
  pixelPalette: 'full',
  asciiRamp: 'standard', // a key of ASCII_RAMPS or 'custom'
  asciiCustom: ' .oO@',
  asciiCols: 96,
  asciiColor: 'color',   // 'color' (tinted characters) | 'mono'
  asciiInvert: true      // true: bright cells get dense characters (for dark grounds)
};

function hexToRgb(h) {
  return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
}

const paletteCache = {};
function paletteRgb(name) {
  if (!PIXEL_PALETTES[name]) return null;
  return (paletteCache[name] ||= PIXEL_PALETTES[name].map(hexToRgb));
}

function small(canvasCache, key, w, h) {
  let c = canvasCache[key];
  if (!c) c = canvasCache[key] = document.createElement('canvas');
  if (c.width !== w || c.height !== h) {
    c.width = w;
    c.height = h;
  }
  return c;
}

const caches = {};

/** Grid size for a w×h view: pixel cells are square, ASCII cells are CELL_ASPECT wide. */
export function gridFor(kind, w, h, style) {
  if (kind === 'pixel') {
    const n = Math.max(4, Math.round(style.pixelCells || 64));
    return w >= h ? [n, Math.max(1, Math.round(n * h / w))] : [Math.max(1, Math.round(n * w / h)), n];
  }
  const cols = Math.max(8, Math.round(style.asciiCols || 96));
  return [cols, Math.max(1, Math.round(cols * (h / w) * CELL_ASPECT))];
}

/**
 * Draw a painting at (x, y, w, h) in pixel or ASCII style.
 * @param paint  (ctx, x, y, w, h) => void, draws the painting into the given rect
 * @param ground colour behind ASCII characters (null = leave transparent)
 */
export function drawStylized(ctx, kind, x, y, w, h, paint, style = DEFAULT_STYLE, ground = null) {
  const s = Object.assign({}, DEFAULT_STYLE, style);
  const [cols, rows] = gridFor(kind, w, h, s);
  const grid = small(caches, kind, cols, rows);
  const gctx = grid.getContext('2d', { willReadFrequently: true });
  gctx.clearRect(0, 0, cols, rows);
  paint(gctx, 0, 0, cols, rows);

  if (kind === 'pixel') {
    const pal = paletteRgb(s.pixelPalette);
    if (pal) {
      const img = gctx.getImageData(0, 0, cols, rows);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        let best = 0, bestD = Infinity;
        for (let k = 0; k < pal.length; k++) {
          const dr = d[i] - pal[k][0], dg = d[i + 1] - pal[k][1], db = d[i + 2] - pal[k][2];
          const dist = dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
          if (dist < bestD) { bestD = dist; best = k; }
        }
        d[i] = pal[best][0]; d[i + 1] = pal[best][1]; d[i + 2] = pal[best][2];
        d[i + 3] = d[i + 3] > 127 ? 255 : 0;
      }
      gctx.putImageData(img, 0, 0);
    }
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(grid, x, y, w, h);
    ctx.restore();
    return;
  }

  // ASCII
  const sub = s.asciiRamp !== 'custom' && SUBCELL[s.asciiRamp];
  const ramp = (s.asciiRamp === 'custom' ? s.asciiCustom : ASCII_RAMPS[s.asciiRamp]) || ASCII_RAMPS.standard;
  const chars = Array.from(ramp);
  if (chars.length < 2) chars.unshift(' ');
  const cw = w / cols, ch = h / rows;
  let d = gctx.getImageData(0, 0, cols, rows).data, sd = null, sx = 1, sy = 1;
  if (sub) {
    [sx, sy] = sub;
    const fine = small(caches, 'sub', cols * sx, rows * sy);
    const fctx = fine.getContext('2d', { willReadFrequently: true });
    fctx.clearRect(0, 0, fine.width, fine.height);
    paint(fctx, 0, 0, fine.width, fine.height);
    sd = fctx.getImageData(0, 0, fine.width, fine.height).data;
  }
  const level = (r, g, b) => {
    const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    // Dense characters for dark cells on a light page; the reverse with invert.
    return s.asciiInvert ? lum : 1 - lum;
  };
  const lines = [];
  ctx.save();
  if (ground) {
    ctx.fillStyle = ground;
    ctx.fillRect(x, y, w, h);
  }
  ctx.font = Math.max(4, ch * 0.95).toFixed(1) + 'px "JetBrains Mono", "SF Mono", Menlo, Consolas, "Noto Sans Symbols 2", "Segoe UI Symbol", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let r = 0; r < rows; r++) {
    let line = '';
    for (let c = 0; c < cols; c++) {
      const i = (r * cols + c) * 4;
      const a = d[i + 3] / 255;
      let glyph = ' ';
      if (a >= 0.05) {
        if (sub) {
          let bits = 0, k = 0;
          const fw = cols * sx;
          for (let yy = 0; yy < sy; yy++) {
            for (let xx = 0; xx < sx; xx++, k++) {
              const j = ((r * sy + yy) * fw + c * sx + xx) * 4;
              if (sd[j + 3] > 12 && level(sd[j], sd[j + 1], sd[j + 2]) * (sd[j + 3] / 255) > 0.5) bits |= 1 << k;
            }
          }
          glyph = subcellGlyph(s.asciiRamp, bits);
          if (s.asciiRamp === 'braille' && bits === 0) glyph = ' ';
        } else {
          const t = level(d[i], d[i + 1], d[i + 2]);
          glyph = chars[Math.min(chars.length - 1, Math.round(t * (chars.length - 1)))];
        }
      }
      line += glyph;
      if (glyph === ' ') continue;
      ctx.globalAlpha = sub ? 1 : a;
      ctx.fillStyle = s.asciiColor === 'mono' ? (s.asciiInvert ? '#e8e6e1' : '#1f2023') : 'rgb(' + d[i] + ',' + d[i + 1] + ',' + d[i + 2] + ')';
      ctx.fillText(glyph, x + (c + 0.5) * cw, y + (r + 0.5) * ch);
    }
    lines.push(line.replace(/\s+$/, ''));
  }
  lastAsciiText = lines.join('\n') + '\n';
  ctx.restore();
}
