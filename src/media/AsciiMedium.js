/**
 * ASCII Medium
 *
 * Renders a Core DSL program as characters: the program is drawn at the
 * character-grid resolution, then each cell's brightness picks a glyph from
 * the character ramp (see src/fitting/stylize.js). Settings live in `style`
 * (shared with the Pixel medium, continuous mode and exports).
 */
import { Medium } from './Medium.js';
import { CORE_OPS } from '../language/schema.js';
import { normalizeProgram } from '../language/normalize.js';
import { FlatCanvasMedium } from './FlatCanvasMedium.js';
import { drawStylized, DEFAULT_STYLE } from '../fitting/stylize.js';

/** Render `program` at grid size, then draw it stylized into a w×h canvas. */
export async function renderStylized(kind, program, w, h, style, canvas, ground) {
  const s = { ...DEFAULT_STYLE, ...style };
  // Render at the view's own proportions (not the grid's): ASCII cells aren't square, so
  // drawing straight into the grid would turn circles into ellipses. drawStylized then
  // samples this image into the cell grid.
  const k = Math.min(1, 1024 / Math.max(w, h));
  const flat = new FlatCanvasMedium({ width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) });
  const out = await flat.render(program);
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, w, h);
  if (ground) {
    ctx.fillStyle = ground;
    ctx.fillRect(0, 0, w, h);
  }
  drawStylized(ctx, kind, 0, 0, w, h, (c, X, Y, W, H) => c.drawImage(out.canvas, X, Y, W, H), s);
  return out.warnings || [];
}

export class AsciiMedium extends Medium {
  constructor(options = {}) {
    super('ascii', 'ASCII');
    this.width = options.width || 1024;
    this.height = options.height || 1024;
    this.style = { ...DEFAULT_STYLE, ...(options.style || {}) };
    this.ground = '#111214';
    if (typeof document !== 'undefined') this.canvas = document.createElement('canvas');
  }

  capabilities() {
    return {
      id: this.id,
      name: this.name,
      coordinateSystem: 'normalized',
      range: { x: [-1, 1], y: [-1, 1] },
      core: [...CORE_OPS],
      extensions: []
    };
  }

  reset(config = {}) {
    if (config.width) this.width = config.width;
    if (config.height) this.height = config.height;
    if (config.style) this.style = { ...this.style, ...config.style };
  }

  async render(program) {
    const start = performance.now();
    if (!this.canvas) return { image: null, width: this.width, height: this.height, warnings: ['Canvas unavailable'], executionTimeMs: 0 };
    const norm = normalizeProgram(program);
    const ground = this.style.asciiInvert ? this.ground : '#f4f3ef';
    const warnings = await renderStylized('ascii', norm, this.width, this.height, this.style, this.canvas, ground);
    return {
      image: this.canvas.toDataURL('image/png'),
      canvas: this.canvas,
      width: this.width,
      height: this.height,
      warnings,
      executionTimeMs: Math.round(performance.now() - start)
    };
  }
}
