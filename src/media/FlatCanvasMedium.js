/**
 * Flat Canvas Medium
 *
 * Fast 2D Canvas baseline renderer without aesthetic embellishments.
 * Crucial for renderer ablation experiments.
 */

import { Medium } from './Medium.js';
import { CORE_OPS } from '../language/schema.js';
import { normalizeProgram } from '../language/normalize.js';

export class FlatCanvasMedium extends Medium {
  constructor(options = {}) {
    super('flat', 'Flat Canvas');
    this.width = options.width || 1024;
    this.height = options.height || 1024;

    // Create canvas (works in browser and node/test if canvas exists)
    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.ctx = this.canvas.getContext('2d');
    }
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

    if (this.canvas) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.ctx = this.canvas.getContext('2d');
      this.ctx.clearRect(0, 0, this.width, this.height);
    }
  }

  toX(x) {
    return (x + 1) * 0.5 * this.width;
  }

  toY(y) {
    return (y + 1) * 0.5 * this.height;
  }

  toSize(s) {
    return s * 0.5 * Math.min(this.width, this.height);
  }

  async render(program) {
    const startTime = performance.now();
    const warnings = [];

    if (!this.canvas && typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.ctx = this.canvas.getContext('2d');
    }

    if (!this.ctx) {
      return {
        image: null,
        width: this.width,
        height: this.height,
        warnings: ['Canvas 2D context unavailable.'],
        executionTimeMs: 0
      };
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.clearRect(0, 0, this.width, this.height);

    // Default drawing state
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.width, this.height);

    let hasFill = true;
    let hasStroke = false;
    let currentFillColor = '#333333';
    let currentFillOpacity = 1;
    let currentStrokeColor = '#111111';
    let currentStrokeOpacity = 1;
    let currentStrokeWidth = 1;
    const strokeScale = this.width / 400;

    const norm = normalizeProgram(program);

    for (const act of norm.actions) {
      try {
        switch (act.op) {
          case 'background':
          case 'clear':
            ctx.fillStyle = act.color || '#ffffff';
            ctx.fillRect(0, 0, this.width, this.height);
            break;

          case 'fill':
            hasFill = true;
            currentFillColor = act.color || '#000000';
            if (act.opacity !== undefined) currentFillOpacity = act.opacity;
            break;

          case 'noFill':
            hasFill = false;
            break;

          case 'stroke':
            hasStroke = true;
            currentStrokeColor = act.color || '#000000';
            if (act.width !== undefined) currentStrokeWidth = act.width;
            if (act.opacity !== undefined) currentStrokeOpacity = act.opacity;
            break;

          case 'noStroke':
            hasStroke = false;
            break;

          case 'strokeWidth':
            currentStrokeWidth = act.width ?? 1;
            break;

          case 'circle': {
            const cx = this.toX(act.x);
            const cy = this.toY(act.y);
            const r = Math.max(0.5, this.toSize(act.diameter) * 0.5);

            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);

            if (hasFill) {
              ctx.save();
              ctx.globalAlpha = currentFillOpacity;
              ctx.fillStyle = currentFillColor;
              ctx.fill();
              ctx.restore();
            }
            if (hasStroke) {
              ctx.save();
              ctx.globalAlpha = currentStrokeOpacity;
              ctx.strokeStyle = currentStrokeColor;
              ctx.lineWidth = currentStrokeWidth * strokeScale;
              ctx.stroke();
              ctx.restore();
            }
            break;
          }

          case 'rect': {
            const cx = this.toX(act.x);
            const cy = this.toY(act.y);
            const rw = this.toSize(act.width);
            const rh = this.toSize(act.height);
            const rx = cx - rw * 0.5;
            const ry = cy - rh * 0.5;

            ctx.beginPath();
            ctx.rect(rx, ry, rw, rh);

            if (hasFill || act.color) {
              ctx.save();
              ctx.globalAlpha = currentFillOpacity;
              ctx.fillStyle = act.color || currentFillColor;
              ctx.fill();
              ctx.restore();
            }
            if (hasStroke) {
              ctx.save();
              ctx.globalAlpha = currentStrokeOpacity;
              ctx.strokeStyle = currentStrokeColor;
              ctx.lineWidth = currentStrokeWidth * strokeScale;
              ctx.stroke();
              ctx.restore();
            }
            break;
          }

          case 'line': {
            const x1 = this.toX(act.x1);
            const y1 = this.toY(act.y1);
            const x2 = this.toX(act.x2);
            const y2 = this.toY(act.y2);

            ctx.beginPath();
            ctx.moveTo(x1, y1);
            ctx.lineTo(x2, y2);

            ctx.save();
            ctx.globalAlpha = currentStrokeOpacity;
            ctx.strokeStyle = act.color || currentStrokeColor;
            ctx.lineWidth = currentStrokeWidth * strokeScale;
            ctx.stroke();
            ctx.restore();
            break;
          }

          case 'polygon':
          case 'polyline': {
            if (!Array.isArray(act.points) || act.points.length < 2) break;

            ctx.beginPath();
            const start = act.points[0];
            ctx.moveTo(this.toX(start[0]), this.toY(start[1]));
            for (let i = 1; i < act.points.length; i++) {
              const pt = act.points[i];
              ctx.lineTo(this.toX(pt[0]), this.toY(pt[1]));
            }

            if (act.op === 'polygon') {
              ctx.closePath();
              if (hasFill) {
                ctx.save();
                ctx.globalAlpha = currentFillOpacity;
                ctx.fillStyle = currentFillColor;
                ctx.fill();
                ctx.restore();
              }
            }

            if (hasStroke || act.op === 'polyline') {
              ctx.save();
              ctx.globalAlpha = currentStrokeOpacity;
              ctx.strokeStyle = currentStrokeColor;
              ctx.lineWidth = currentStrokeWidth * strokeScale;
              ctx.stroke();
              ctx.restore();
            }
            break;
          }

          default:
            warnings.push(`Ignored unsupported action in FlatCanvas: ${act.op}`);
            break;
        }
      } catch (err) {
        warnings.push(`Error executing action ${act.op}: ${err.message}`);
      }
    }

    ctx.restore();

    const executionTimeMs = Math.round(performance.now() - startTime);

    let dataUrl = '';
    try {
      dataUrl = this.canvas.toDataURL('image/png');
    } catch (e) {
      warnings.push(`Canvas export error: ${e.message}`);
    }

    return {
      image: dataUrl,
      canvas: this.canvas,
      width: this.width,
      height: this.height,
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
