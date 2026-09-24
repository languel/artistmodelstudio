/**
 * Live Painter: runs the continuous Reference Fitter on a canvas laid over the
 * main preview. The candidate grid re-renders its DOM often, so the canvas is
 * re-attached to the current preview container on every frame.
 */
import { ContinuousFitter } from '../fitting/continuousFit.js';
import { canvasToRGB } from '../fitting/fitReference.js';
import { fitTarget, fitDims } from '../artists/ReferenceFitterArtist.js';
import { WatercolorLayer, WatercolorSprites, retentionFor } from '../fitting/continuousWatercolor.js';

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

  /** RGB target for a reference at a canvas aspect (also used by the p5 export). */
  static targetFor(image, aspect = 1) {
    const [w, h] = fitDims(aspect, LIVE_FIT_SIZE);
    return { rgb: canvasToRGB(fitTarget(image, w, h)), width: w, height: h };
  }

  async start(image, params, aspect = 1) {
    this.stop();
    if (params.render === 'watercolor' || params.render === 'layered') await loadBrush();
    this.aspect = aspect;
    this.target = LivePainter.targetFor(image, aspect);
    this.cf = new ContinuousFitter(this.target.rgb, this.target.width, this.target.height, params);
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
    if (this.params.render === 'watercolor' || this.params.render === 'layered') await loadBrush();
    this.cf?.setParams(params);
  }

  stop() {
    this.running = false;
    this.layer = null;
    this.sprites = null;
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
    // Fit the canvas aspect inside the preview.
    const a = this.aspect || 1;
    const vw = Math.min(w, h * a), vh = vw / a;
    const x = (w - vw) / 2, y = (h - vh) / 2;
    const [lw, lh] = fitDims(a, 1024);
    if (this.params.render === 'watercolor' && brushModule) {
      // Per-stroke watercolor sprites with individual fades.
      this.sprites ||= new WatercolorSprites(brushModule, { width: lw, height: lh });
      this.sprites.update(this.cf);
      this.sprites.draw(ctx, x, y, vw, vh, this.cf, this.t);
    } else if (this.params.render === 'layered' && brushModule) {
      // Strokes painted once into one canvas; everything fades under washes.
      this.layer ||= new WatercolorLayer(brushModule, { width: lw, height: lh });
      this.layer.update(this.cf, this.t, dt, retentionFor(this.params.fadeOut));
      this.layer.draw(ctx, x, y, vw, vh);
    } else {
      this.cf.draw(ctx, x, y, vw, vh, this.t);
    }
  }

  /** Current picture as a Core DSL program, e.g. to keep as a candidate. */
  snapshot() {
    return this.cf ? this.cf.toProgram(this.t) : null;
  }
}
