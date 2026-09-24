/**
 * Watercolor Medium
 *
 * Simulates organic watercolor painting using p5.brush with natural
 * pigment bleeding, paper texture, cross-hatching, and seeded reproducibility.
 */

import { Medium } from './Medium.js';
import { CORE_OPS, WATERCOLOR_OPS } from '../language/schema.js';
import { normalizeProgram } from '../language/normalize.js';
import { paintWatercolor } from './watercolorBrush.js';

let standaloneBrush = null;
async function getBrush() {
  if (!standaloneBrush && typeof window !== 'undefined') {
    try {
      standaloneBrush = await import('p5.brush/standalone');
    } catch (e) {
      console.warn('Could not load standalone p5.brush:', e);
    }
  }
  return standaloneBrush;
}

export class WatercolorMedium extends Medium {
  constructor(options = {}) {
    super('watercolor', 'Watercolor');
    this.width = options.width || 1024;
    this.height = options.height || 1024;
    this.seed = options.seed || 42;

    this.defaultBleed = 0.25;
    this.defaultTexture = 0.4;
    this.defaultHatchDistance = 0; // 0 = no hatch
    this.defaultHatchAngle = 45;

    if (typeof document !== 'undefined') {
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }
  }

  capabilities() {
    return {
      id: this.id,
      name: this.name,
      coordinateSystem: 'normalized',
      range: { x: [-1, 1], y: [-1, 1] },
      core: [...CORE_OPS],
      extensions: [...WATERCOLOR_OPS]
    };
  }

  reset(config = {}) {
    if (config.width) this.width = config.width;
    if (config.height) this.height = config.height;
    if (config.seed !== undefined) this.seed = config.seed;
    if (this.canvas) {
      this.canvas.width = this.width;
      this.canvas.height = this.height;
    }
    if (this.canvas2D) {
      this.canvas2D.width = this.width;
      this.canvas2D.height = this.height;
    }
    this.brushCanvas = null;
  }

  toX(x) {
    // p5.brush uses WebGL mode where (0, 0) is the center of the canvas [-width/2, width/2]
    return x * (this.width * 0.5);
  }

  toY(y) {
    // p5.brush uses WebGL mode where (0, 0) is the center of the canvas [-height/2, height/2]
    return y * (this.height * 0.5);
  }

  toSize(s) {
    return s * 0.5 * Math.min(this.width, this.height);
  }

  async render(program) {
    const startTime = performance.now();
    const warnings = [];

    const norm = normalizeProgram(program);
    const brush = await getBrush();

    let renderedWithBrush = false;

    if (brush && typeof document !== 'undefined') {
      try {
        if (!this.brushCanvas || this.brushCanvas.width !== this.width || this.brushCanvas.height !== this.height) {
          this.brushCanvas = document.createElement('canvas');
          this.brushCanvas.width = this.width;
          this.brushCanvas.height = this.height;
        }

        warnings.push(...paintWatercolor(brush, this.brushCanvas, norm.actions, {
          seed: this.seed,
          defaultBleed: this.defaultBleed,
          defaultTexture: this.defaultTexture
        }));

        this.canvas = this.brushCanvas;
        renderedWithBrush = true;
      } catch (err) {
        warnings.push(`p5.brush WebGL render note: ${err.message}. Falling back to watercolor 2D shader.`);
      }
    }

    // High quality 2D watercolor paper & pigment simulation fallback if WebGL brush is unavailable
    if (!renderedWithBrush) {
      this.renderWatercolor2DFallback(norm, warnings);
      this.canvas = this.canvas2D;
    }

    const executionTimeMs = Math.round(performance.now() - startTime);

    let dataUrl = '';
    try {
      dataUrl = this.canvas ? this.canvas.toDataURL('image/png') : '';
    } catch (e) {
      warnings.push(`Watercolor export error: ${e.message}`);
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

  /**
   * Watercolor 2D organic wash & paper texture fallback.
   * Ensures watercolor aesthetic even in headless/restricted canvas environments.
   */
  renderWatercolor2DFallback(norm, warnings) {
    if (!this.canvas2D && typeof document !== 'undefined') {
      this.canvas2D = document.createElement('canvas');
      this.canvas2D.width = this.width;
      this.canvas2D.height = this.height;
    }
    if (!this.canvas2D) return;

    this.canvas2D.width = this.width;
    this.canvas2D.height = this.height;
    const ctx = this.canvas2D.getContext('2d');
    if (!ctx) return;
    const w = this.width;
    const h = this.height;

    // Draw textured paper background
    ctx.fillStyle = '#f8f4eb';
    ctx.fillRect(0, 0, w, h);

    // Subtle paper grain
    ctx.save();
    ctx.fillStyle = 'rgba(180, 160, 140, 0.05)';
    for (let i = 0; i < 600; i++) {
      const px = ((Math.sin(this.seed + i * 13) + 1) * 0.5) * w;
      const py = ((Math.cos(this.seed + i * 19) + 1) * 0.5) * h;
      ctx.fillRect(px, py, 2, 2);
    }
    ctx.restore();

    let hasFill = true;
    let hasStroke = false;
    let fillColor = '#ce526d';
    let fillOpacity = 0.75;
    let strokeColor = '#333333';
    let bleed = 0.25;

    for (const act of norm.actions) {
      switch (act.op) {
        case 'background':
        case 'clear':
          ctx.fillStyle = act.color || '#f8f4eb';
          ctx.fillRect(0, 0, w, h);
          break;

        case 'brush.bleed':
          bleed = act.amount ?? 0.25;
          break;

        case 'fill':
          hasFill = true;
          fillColor = act.color || '#ce526d';
          if (act.opacity !== undefined) fillOpacity = act.opacity;
          break;

        case 'noFill':
          hasFill = false;
          break;

        case 'stroke':
          hasStroke = true;
          strokeColor = act.color || '#333333';
          break;

        case 'noStroke':
          hasStroke = false;
          break;

        case 'circle': {
          const cx = (act.x + 1) * 0.5 * w;
          const cy = (act.y + 1) * 0.5 * h;
          const radius = Math.max(1, this.toSize(act.diameter) * 0.5);

          if (hasFill) {
            // Draw multiple layered organic bleeding passes
            const passes = 4;
            for (let p = 0; p < passes; p++) {
              ctx.save();
              ctx.globalAlpha = (fillOpacity / passes) * 1.3;
              ctx.fillStyle = fillColor;
              ctx.beginPath();

              const numPoints = 24;
              for (let i = 0; i <= numPoints; i++) {
                const angle = (i / numPoints) * Math.PI * 2;
                const jitter = (Math.sin(angle * 5 + p + this.seed) * 0.12 + Math.cos(angle * 3) * 0.08) * bleed;
                const r = radius * (1 - p * 0.08 + jitter);
                const x = cx + Math.cos(angle) * r;
                const y = cy + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
              }
              ctx.closePath();
              ctx.fill();
              ctx.restore();
            }
          }

          if (hasStroke) {
            ctx.save();
            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.7;
            ctx.beginPath();
            ctx.arc(cx, cy, radius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
          }
          break;
        }

        case 'rect': {
          const cx = (act.x + 1) * 0.5 * w;
          const cy = (act.y + 1) * 0.5 * h;
          const rw = this.toSize(act.width);
          const rh = this.toSize(act.height);

          if (hasFill) {
            ctx.save();
            ctx.globalAlpha = fillOpacity;
            ctx.fillStyle = fillColor;
            ctx.fillRect(cx - rw * 0.5, cy - rh * 0.5, rw, rh);
            ctx.restore();
          }
          break;
        }

        case 'polygon': {
          if (Array.isArray(act.points) && act.points.length >= 3 && hasFill) {
            ctx.save();
            ctx.globalAlpha = fillOpacity;
            ctx.fillStyle = fillColor;
            ctx.beginPath();
            ctx.moveTo((act.points[0][0] + 1) * 0.5 * w, (act.points[0][1] + 1) * 0.5 * h);
            for (let i = 1; i < act.points.length; i++) {
              ctx.lineTo((act.points[i][0] + 1) * 0.5 * w, (act.points[i][1] + 1) * 0.5 * h);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
          break;
        }

        case 'line': {
          ctx.save();
          ctx.strokeStyle = strokeColor;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo((act.x1 + 1) * 0.5 * w, (act.y1 + 1) * 0.5 * h);
          ctx.lineTo((act.x2 + 1) * 0.5 * w, (act.y2 + 1) * 0.5 * h);
          ctx.stroke();
          ctx.restore();
          break;
        }
      }
    }
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
