/**
 * Pixel Medium
 *
 * True discrete logical pixel grid renderer with nearest-neighbor enlargement.
 * Guarantees grid-aligned discrete pixel art.
 */

import { Medium } from './Medium.js';
import { PIXEL_OPS, DEFAULT_PIXEL_PALETTE } from '../language/schema.js';
import { normalizeProgram } from '../language/normalize.js';

export class PixelMedium extends Medium {
  constructor(options = {}) {
    super('pixel', 'Pixel');
    this.cols = options.cols || 32;
    this.rows = options.rows || 48;
    this.displayScale = options.displayScale || 10;
    this.palette = [...(options.palette || DEFAULT_PIXEL_PALETTE)];

    this.mirrorX = false;
    this.mirrorY = false;

    // Allocate grid: null or color string
    this.grid = new Array(this.cols * this.rows).fill(null);

    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.cols * this.displayScale;
      this.canvas.height = this.rows * this.displayScale;
      this.ctx = this.canvas.getContext('2d');
    }
  }

  capabilities() {
    return {
      id: this.id,
      name: this.name,
      coordinateSystem: 'pixel',
      dimensions: { cols: this.cols, rows: this.rows },
      core: [...PIXEL_OPS],
      extensions: []
    };
  }

  reset(config = {}) {
    if (config.cols) this.cols = config.cols;
    if (config.rows) this.rows = config.rows;
    if (config.palette) this.palette = [...config.palette];
    if (config.displayScale) this.displayScale = config.displayScale;

    this.mirrorX = false;
    this.mirrorY = false;
    this.grid = new Array(this.cols * this.rows).fill(null);

    if (this.canvas) {
      this.canvas.width = this.cols * this.displayScale;
      this.canvas.height = this.rows * this.displayScale;
      this.ctx = this.canvas.getContext('2d');
    }
  }

  resolveColor(colorInput) {
    if (colorInput === null || colorInput === undefined) return this.palette[0];
    if (typeof colorInput === 'number') {
      const idx = Math.abs(Math.floor(colorInput)) % this.palette.length;
      return this.palette[idx];
    }
    return String(colorInput);
  }

  setPixel(x, y, color) {
    const resolved = this.resolveColor(color);
    this._drawPoint(x, y, resolved);

    if (this.mirrorX) {
      this._drawPoint(this.cols - 1 - x, y, resolved);
    }
    if (this.mirrorY) {
      this._drawPoint(x, this.rows - 1 - y, resolved);
    }
    if (this.mirrorX && this.mirrorY) {
      this._drawPoint(this.cols - 1 - x, this.rows - 1 - y, resolved);
    }
  }

  _drawPoint(x, y, resolvedColor) {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
    this.grid[y * this.cols + x] = resolvedColor;
  }

  drawLine(x1, y1, x2, y2, color) {
    // Bresenham's algorithm
    let x = x1;
    let y = y1;
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    const sx = x1 < x2 ? 1 : -1;
    const sy = y1 < y2 ? 1 : -1;
    let err = dx - dy;

    while (true) {
      this.setPixel(x, y, color);
      if (x === x2 && y === y2) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
  }

  drawHLine(y, x1, x2, color) {
    const start = Math.max(0, Math.min(x1, x2));
    const end = Math.min(this.cols - 1, Math.max(x1, x2));
    for (let x = start; x <= end; x++) {
      this.setPixel(x, y, color);
    }
  }

  drawVLine(x, y1, y2, color) {
    const start = Math.max(0, Math.min(y1, y2));
    const end = Math.min(this.rows - 1, Math.max(y1, y2));
    for (let y = start; y <= end; y++) {
      this.setPixel(x, y, color);
    }
  }

  drawRect(x, y, w, h, color, fill = true) {
    if (fill) {
      for (let j = y; j < y + h; j++) {
        for (let i = x; i < x + w; i++) {
          this.setPixel(i, j, color);
        }
      }
    } else {
      this.drawHLine(y, x, x + w - 1, color);
      this.drawHLine(y + h - 1, x, x + w - 1, color);
      this.drawVLine(x, y, y + h - 1, color);
      this.drawVLine(x + w - 1, y, y + h - 1, color);
    }
  }

  drawPolygon(points, color) {
    if (!points || points.length < 3) return;
    // Outline edges
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      this.drawLine(Math.round(p1[0]), Math.round(p1[1]), Math.round(p2[0]), Math.round(p2[1]), color);
    }
  }

  async render(program) {
    const startTime = performance.now();
    const warnings = [];

    const norm = normalizeProgram(program);

    // Pre-scan for palette if declared
    const paletteAct = norm.actions.find(a => a.op === 'palette');
    if (paletteAct && Array.isArray(paletteAct.colors) && paletteAct.colors.length > 0) {
      this.palette = [...paletteAct.colors];
    }

    // Clear grid to background color
    this.mirrorX = false;
    this.mirrorY = false;
    this.grid.fill(this.palette[0]);

    for (const act of norm.actions) {
      try {
        switch (act.op) {
          case 'background':
          case 'clear': {
            const col = this.resolveColor(act.color ?? 0);
            this.grid.fill(col);
            break;
          }

          case 'palette':
            if (Array.isArray(act.colors) && act.colors.length > 0) {
              this.palette = [...act.colors];
            }
            break;

          case 'mirrorX':
            this.mirrorX = Boolean(act.enabled);
            break;

          case 'mirrorY':
            this.mirrorY = Boolean(act.enabled);
            break;

          case 'pixel':
            this.setPixel(act.x, act.y, act.color);
            break;

          case 'hline':
            this.drawHLine(act.y, act.x1, act.x2, act.color);
            break;

          case 'vline':
            this.drawVLine(act.x, act.y1, act.y2, act.color);
            break;

          case 'line':
            this.drawLine(act.x1, act.y1, act.x2, act.y2, act.color);
            break;

          case 'rect':
            this.drawRect(act.x, act.y, act.width, act.height, act.color, act.fill !== false);
            break;

          case 'polygon':
            this.drawPolygon(act.points, act.color);
            break;

          default:
            // Gracefully ignore or warn
            warnings.push(`Pixel Medium ignored non-pixel action: ${act.op}`);
            break;
        }
      } catch (err) {
        warnings.push(`Pixel render action error ${act.op}: ${err.message}`);
      }
    }

    // Render grid onto canvas with sharp nearest-neighbor enlargement
    if (!this.canvas && typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
    }

    if (this.canvas) {
      const displayW = this.cols * this.displayScale;
      const displayH = this.rows * this.displayScale;
      this.canvas.width = displayW;
      this.canvas.height = displayH;

      const ctx = this.ctx;
      ctx.imageSmoothingEnabled = false;

      // Draw each pixel block
      for (let y = 0; y < this.rows; y++) {
        for (let x = 0; x < this.cols; x++) {
          const col = this.grid[y * this.cols + x] || this.palette[0];
          ctx.fillStyle = col;
          ctx.fillRect(
            x * this.displayScale,
            y * this.displayScale,
            this.displayScale,
            this.displayScale
          );
        }
      }
    }

    const executionTimeMs = Math.round(performance.now() - startTime);

    let dataUrl = '';
    try {
      dataUrl = this.canvas.toDataURL('image/png');
    } catch (e) {
      warnings.push(`Pixel canvas export error: ${e.message}`);
    }

    return {
      image: dataUrl,
      canvas: this.canvas,
      width: this.cols * this.displayScale,
      height: this.rows * this.displayScale,
      warnings,
      executionTimeMs
    };
  }

  async snapshot() {
    return new Promise(resolve => {
      if (this.canvas) {
        this.canvas.toBlob(resolve, 'image/png');
      } else {
        resolve(null);
      }
    });
  }
}
