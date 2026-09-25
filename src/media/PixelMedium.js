/**
 * Pixel Medium
 *
 * True discrete logical pixel grid renderer with nearest-neighbor enlargement.
 * Guarantees grid-aligned discrete pixel art.
 */

import { Medium } from './Medium.js';
import { PIXEL_OPS, DEFAULT_PIXEL_PALETTE } from '../language/schema.js';
import { normalizeProgram } from '../language/normalize.js';
import { renderStylized } from './AsciiMedium.js';
import { DEFAULT_STYLE } from '../fitting/stylize.js';

export class PixelMedium extends Medium {
  constructor(options = {}) {
    super('pixel', 'Pixel');
    this.cols = options.cols || 32;
    this.rows = options.rows || 48;
    this.displayScale = options.displayScale || 10;
    this.palette = [...(options.palette || DEFAULT_PIXEL_PALETTE)];
    this.style = { ...DEFAULT_STYLE, ...(options.style || {}) };
    this.outW = options.width || 1024; // output size for Core-shape programs
    this.outH = options.height || 1024;

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
      core: [...PIXEL_OPS, 'comment'],
      extensions: []
    };
  }

  reset(config = {}) {
    if (config.style) this.style = { ...this.style, ...config.style };
    if (config.width && config.height) {
      this.outW = config.width;
      this.outH = config.height;
      // Grid-coordinate programs: keep the long side and follow the canvas aspect.
      if (!config.cols && !config.rows) {
        const long = Math.max(this.cols, this.rows);
        const a = config.width / config.height;
        this.cols = a >= 1 ? long : Math.max(1, Math.round(long * a));
        this.rows = a >= 1 ? Math.max(1, Math.round(long / a)) : long;
      }
    }
    if (config.cols) this.cols = config.cols;
    if (config.rows) this.rows = config.rows;
    if (config.palette) this.palette = [...config.palette];
    if (config.displayScale) {
      this.displayScale = config.displayScale;
    } else if (config.width) {
      const maxDim = Math.max(this.cols, this.rows);
      this.displayScale = Math.max(1, Math.floor(config.width / maxDim));
    }

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

  isNormalizedProgram(norm) {
    if (norm.medium === 'pixel') return false;
    if (norm.medium === 'watercolor' || norm.medium === 'flat') return true;
    if (norm.actions.some(a => ['pixel', 'hline', 'vline', 'mirrorX', 'mirrorY', 'palette'].includes(a.op))) {
      return false;
    }
    const hasGridCoords = norm.actions.some(a =>
      (a.x !== undefined && Math.abs(a.x) > 2) ||
      (a.y !== undefined && Math.abs(a.y) > 2) ||
      (a.x1 !== undefined && Math.abs(a.x1) > 2) ||
      (a.y1 !== undefined && Math.abs(a.y1) > 2) ||
      (a.x2 !== undefined && Math.abs(a.x2) > 2) ||
      (a.y2 !== undefined && Math.abs(a.y2) > 2)
    );
    if (hasGridCoords) return false;

    for (const a of norm.actions) {
      if (['circle', 'fill', 'stroke', 'noStroke', 'noFill'].includes(a.op)) return true;
      if (typeof a.op === 'string' && a.op.startsWith('brush.')) return true;
      if (a.x !== undefined && a.x < 0) return true;
      if (a.y !== undefined && a.y < 0) return true;
      if (a.x1 !== undefined && a.x1 < 0) return true;
      if (a.y1 !== undefined && a.y1 < 0) return true;
      if (a.x2 !== undefined && a.x2 < 0) return true;
      if (a.y2 !== undefined && a.y2 < 0) return true;
    }
    return false;
  }

  toGridX(x, isNorm) {
    const val = Number(x) || 0;
    if (!isNorm) return Math.round(val);
    return Math.round(((val + 1.0) * 0.5) * (this.cols - 1));
  }

  toGridY(y, isNorm) {
    const val = Number(y) || 0;
    if (!isNorm) return Math.round(val);
    return Math.round(((val + 1.0) * 0.5) * (this.rows - 1));
  }

  toGridW(w, isNorm) {
    const val = Number(w) || 0;
    if (!isNorm) return Math.round(val);
    return Math.max(1, Math.round((val * 0.5) * this.cols));
  }

  toGridH(h, isNorm) {
    const val = Number(h) || 0;
    if (!isNorm) return Math.round(val);
    return Math.max(1, Math.round((val * 0.5) * this.rows));
  }

  toGridRadius(diamOrRadius, isNorm, isRadius = false) {
    const val = Number(diamOrRadius) || 0;
    if (!isNorm) {
      return Math.max(1, Math.round(isRadius ? val : val * 0.5));
    }
    const d = isRadius ? val * 2.0 : val;
    return Math.max(1, Math.round((d * 0.25) * Math.min(this.cols, this.rows)));
  }

  setPixel(x, y, color) {
    const rx = Math.round(Number(x) || 0);
    const ry = Math.round(Number(y) || 0);
    const resolved = this.resolveColor(color);
    this._drawPoint(rx, ry, resolved);

    if (this.mirrorX) {
      this._drawPoint(this.cols - 1 - rx, ry, resolved);
    }
    if (this.mirrorY) {
      this._drawPoint(rx, this.rows - 1 - ry, resolved);
    }
    if (this.mirrorX && this.mirrorY) {
      this._drawPoint(this.cols - 1 - rx, this.rows - 1 - ry, resolved);
    }
  }

  _drawPoint(x, y, resolvedColor) {
    if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) return;
    this.grid[y * this.cols + x] = resolvedColor;
  }

  drawLine(x1, y1, x2, y2, color) {
    // Bresenham's algorithm with guaranteed integer steps and maximum safety bound
    let x = Math.round(Number(x1) || 0);
    let y = Math.round(Number(y1) || 0);
    const targetX = Math.round(Number(x2) || 0);
    const targetY = Math.round(Number(y2) || 0);

    const dx = Math.abs(targetX - x);
    const dy = Math.abs(targetY - y);
    const sx = x < targetX ? 1 : -1;
    const sy = y < targetY ? 1 : -1;
    let err = dx - dy;

    const maxSteps = Math.max(1, (this.cols + this.rows) * 4);
    let step = 0;

    while (step++ < maxSteps) {
      this.setPixel(x, y, color);
      if (x === targetX && y === targetY) break;
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
    const ry = Math.round(Number(y) || 0);
    if (ry < 0 || ry >= this.rows) return;
    const rx1 = Math.round(Number(x1) || 0);
    const rx2 = Math.round(Number(x2) || 0);
    const start = Math.max(0, Math.min(rx1, rx2));
    const end = Math.min(this.cols - 1, Math.max(rx1, rx2));
    for (let x = start; x <= end; x++) {
      this.setPixel(x, ry, color);
    }
  }

  drawVLine(x, y1, y2, color) {
    const rx = Math.round(Number(x) || 0);
    if (rx < 0 || rx >= this.cols) return;
    const ry1 = Math.round(Number(y1) || 0);
    const ry2 = Math.round(Number(y2) || 0);
    const start = Math.max(0, Math.min(ry1, ry2));
    const end = Math.min(this.rows - 1, Math.max(ry1, ry2));
    for (let y = start; y <= end; y++) {
      this.setPixel(rx, y, color);
    }
  }

  drawRect(x, y, w, h, color, fill = true) {
    const rx = Math.round(Number(x) || 0);
    const ry = Math.round(Number(y) || 0);
    const rw = Math.round(Number(w) || 0);
    const rh = Math.round(Number(h) || 0);
    if (rw <= 0 || rh <= 0) return;

    if (fill) {
      const startY = Math.max(0, ry);
      const endY = Math.min(this.rows, ry + rh);
      const startX = Math.max(0, rx);
      const endX = Math.min(this.cols, rx + rw);
      for (let j = startY; j < endY; j++) {
        for (let i = startX; i < endX; i++) {
          this.setPixel(i, j, color);
        }
      }
    } else {
      this.drawHLine(ry, rx, rx + rw - 1, color);
      this.drawHLine(ry + rh - 1, rx, rx + rw - 1, color);
      this.drawVLine(rx, ry, ry + rh - 1, color);
      this.drawVLine(rx + rw - 1, ry, ry + rh - 1, color);
    }
  }

  drawCircle(cx, cy, radius, color, fill = true) {
    const rcx = Math.round(Number(cx) || 0);
    const rcy = Math.round(Number(cy) || 0);
    const r = Math.max(0, Math.round(Number(radius) || 0));

    if (r === 0) {
      this.setPixel(rcx, rcy, color);
      return;
    }

    if (fill) {
      for (let dy = -r; dy <= r; dy++) {
        const y = rcy + dy;
        if (y < 0 || y >= this.rows) continue;
        const halfW = Math.round(Math.sqrt(Math.max(0, r * r - dy * dy)));
        const startX = Math.max(0, rcx - halfW);
        const endX = Math.min(this.cols - 1, rcx + halfW);
        for (let x = startX; x <= endX; x++) {
          this.setPixel(x, y, color);
        }
      }
    } else {
      let x = r;
      let y = 0;
      let err = 1 - r;
      while (x >= y) {
        this.setPixel(rcx + x, rcy + y, color);
        this.setPixel(rcx + y, rcy + x, color);
        this.setPixel(rcx - y, rcy + x, color);
        this.setPixel(rcx - x, rcy + y, color);
        this.setPixel(rcx - x, rcy - y, color);
        this.setPixel(rcx - y, rcy - x, color);
        this.setPixel(rcx + y, rcy - x, color);
        this.setPixel(rcx + x, rcy - y, color);
        y++;
        if (err <= 0) {
          err += 2 * y + 1;
        } else {
          x--;
          err += 2 * (y - x) + 1;
        }
      }
    }
  }

  drawPolygon(points, color) {
    if (!Array.isArray(points) || points.length < 2) return;
    for (let i = 0; i < points.length; i++) {
      const p1 = points[i];
      const p2 = points[(i + 1) % points.length];
      if (Array.isArray(p1) && Array.isArray(p2)) {
        this.drawLine(p1[0], p1[1], p2[0], p2[1], color);
      }
    }
  }

  async render(program) {
    const startTime = performance.now();
    const warnings = [];

    const norm = normalizeProgram(program);
    const isNorm = this.isNormalizedProgram(norm);

    // Core-shape programs (e.g. Reference Fitter output): draw at pixel-grid
    // resolution with filled shapes, then enlarge with hard edges (stylize.js).
    if (isNorm && this.canvas) {
      const warnings = await renderStylized('pixel', norm, this.outW, this.outH, this.style, this.canvas, null);
      this.ctx = this.canvas.getContext('2d');
      return {
        image: this.canvas.toDataURL('image/png'),
        canvas: this.canvas,
        width: this.outW,
        height: this.outH,
        warnings,
        executionTimeMs: Math.round(performance.now() - startTime)
      };
    }

    // Pre-scan for palette if declared
    const paletteAct = norm.actions.find(a => a.op === 'palette');
    if (paletteAct && Array.isArray(paletteAct.colors) && paletteAct.colors.length > 0) {
      this.palette = [...paletteAct.colors];
    }

    // Clear grid to background color
    this.mirrorX = false;
    this.mirrorY = false;
    this.grid.fill(this.palette[0]);

    let hasFill = true;
    let hasStroke = true;
    let currentFillColor = this.palette[2] || '#ce526d';
    let currentStrokeColor = this.palette[1] || '#333333';

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

          case 'fill':
            hasFill = true;
            if (act.color !== undefined) {
              currentFillColor = this.resolveColor(act.color);
            }
            break;

          case 'noFill':
            hasFill = false;
            break;

          case 'stroke':
            hasStroke = true;
            if (act.color !== undefined) {
              currentStrokeColor = this.resolveColor(act.color);
            }
            break;

          case 'noStroke':
            hasStroke = false;
            break;

          case 'pixel': {
            const px = this.toGridX(act.x, isNorm);
            const py = this.toGridY(act.y, isNorm);
            this.setPixel(px, py, act.color ?? currentFillColor);
            break;
          }

          case 'hline': {
            const py = this.toGridY(act.y, isNorm);
            const px1 = this.toGridX(act.x1, isNorm);
            const px2 = this.toGridX(act.x2, isNorm);
            this.drawHLine(py, px1, px2, act.color ?? currentStrokeColor);
            break;
          }

          case 'vline': {
            const px = this.toGridX(act.x, isNorm);
            const py1 = this.toGridY(act.y1, isNorm);
            const py2 = this.toGridY(act.y2, isNorm);
            this.drawVLine(px, py1, py2, act.color ?? currentStrokeColor);
            break;
          }

          case 'line': {
            const px1 = this.toGridX(act.x1, isNorm);
            const py1 = this.toGridY(act.y1, isNorm);
            const px2 = this.toGridX(act.x2, isNorm);
            const py2 = this.toGridY(act.y2, isNorm);
            const col = act.color !== undefined ? this.resolveColor(act.color) : currentStrokeColor;
            this.drawLine(px1, py1, px2, py2, col);
            break;
          }

          case 'circle': {
            const cx = this.toGridX(act.x, isNorm);
            const cy = this.toGridY(act.y, isNorm);
            const r = this.toGridRadius(act.diameter, isNorm);
            const col = act.color !== undefined ? this.resolveColor(act.color) : currentFillColor;
            this.drawCircle(cx, cy, r, col, hasFill);
            if (hasStroke && !hasFill) {
              this.drawCircle(cx, cy, r, currentStrokeColor, false);
            }
            break;
          }

          case 'rect': {
            let rx, ry, rw, rh;
            if (isNorm) {
              const cx = this.toGridX(act.x, true);
              const cy = this.toGridY(act.y, true);
              rw = this.toGridW(act.width, true);
              rh = this.toGridH(act.height, true);
              rx = cx - Math.floor(rw / 2);
              ry = cy - Math.floor(rh / 2);
            } else {
              rx = act.x;
              ry = act.y;
              rw = act.width;
              rh = act.height;
            }
            const col = act.color !== undefined ? this.resolveColor(act.color) : (hasFill ? currentFillColor : currentStrokeColor);
            this.drawRect(rx, ry, rw, rh, col, act.fill !== false && hasFill);
            break;
          }

          case 'polygon':
          case 'polyline': {
            if (Array.isArray(act.points) && act.points.length >= 2) {
              const pts = act.points.map(pt => [
                this.toGridX(pt[0], isNorm),
                this.toGridY(pt[1], isNorm)
              ]);
              const col = act.color !== undefined ? this.resolveColor(act.color) : currentStrokeColor;
              this.drawPolygon(pts, col);
            }
            break;
          }

          default:
            // Non-pixel specific ops ignored gracefully
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
    if (this.canvas && typeof this.canvas.toDataURL === 'function') {
      try {
        dataUrl = this.canvas.toDataURL('image/png');
      } catch (e) {
        warnings.push(`Pixel canvas export error: ${e.message}`);
      }
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
