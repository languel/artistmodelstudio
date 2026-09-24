/**
 * Live Painter: runs the continuous Reference Fitter on a canvas laid over the
 * main preview. The candidate grid re-renders its DOM often, so the canvas is
 * re-attached to the current preview container on every frame.
 */
import { ContinuousFitter } from '../fitting/continuousFit.js';
import { canvasToRGB } from '../fitting/fitReference.js';
import { squareTarget } from '../artists/ReferenceFitterArtist.js';
import { WatercolorLayer, retentionFor } from '../fitting/continuousWatercolor.js';

let brushModule = null;
const loadBrush = async () => (brushModule ||= await import('p5.brush/standalone'));

export const LIVE_FIT_SIZE = 128;

export class LivePainter {
  constructor({ onFrame } = {}) {
    this.onFrame = onFrame;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'live-painter-canvas';
    this.running = false;
    this.cf = null;
    this.target = null;
  }

  /** Square RGB target for a reference image (also used by the p5 export). */
  static targetFor(image) {
    return canvasToRGB(squareTarget(image, LIVE_FIT_SIZE));
  }

  async start(image, params) {
    this.stop();
    if (params.render === 'watercolor') await loadBrush();
    this.target = LivePainter.targetFor(image);
    this.cf = new ContinuousFitter(this.target, LIVE_FIT_SIZE, params);
    this.params = { ...params };
    this.t = 0;
    this.last = performance.now();
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      const now = performance.now();
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      this.t += dt;
      this.cf.update(this.t, dt);
      this.paint(dt);
      this.onFrame?.(this);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  async setParams(params) {
    this.params = { ...this.params, ...params };
    if (this.params.render === 'watercolor') await loadBrush();
    this.cf?.setParams(params);
  }

  stop() {
    this.running = false;
    this.layer = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.canvas.remove();
  }

  paint(dt = 0) {
    const wrap = document.querySelector('#hero-canvas-wrap');
    if (!wrap) return;
    if (this.canvas.parentElement !== wrap) wrap.appendChild(this.canvas);
    const rect = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const ctx = this.canvas.getContext('2d');
    ctx.fillStyle = '#18191d';
    ctx.fillRect(0, 0, w, h);
    const side = Math.min(w, h);
    const x = (w - side) / 2, y = (h - side) / 2;
    if (this.params.render === 'watercolor' && brushModule) {
      this.layer ||= new WatercolorLayer(brushModule, { size: 1024 });
      this.layer.update(this.cf, this.t, dt, retentionFor(this.params.fadeOut));
      this.layer.draw(ctx, x, y, side);
    } else {
      this.cf.draw(ctx, x, y, side, this.t);
    }
  }

  /** Current picture as a Core DSL program, e.g. to keep as a candidate. */
  snapshot() {
    return this.cf ? this.cf.toProgram(this.t) : null;
  }
}
