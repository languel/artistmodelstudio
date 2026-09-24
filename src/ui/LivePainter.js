/**
 * Live Painter: runs the continuous Reference Fitter on a canvas laid over the
 * main preview. The candidate grid re-renders its DOM often, so the canvas is
 * re-attached to the current preview container on every frame.
 */
import { ContinuousFitter } from '../fitting/continuousFit.js';
import { canvasToRGB } from '../fitting/fitReference.js';
import { fitTarget, fitDims } from '../artists/ReferenceFitterArtist.js';
import { WatercolorLayer, WatercolorSprites, retentionFor } from '../fitting/continuousWatercolor.js';
import { drawScene } from '../fitting/continuousScene.js';
import { getAsciiText } from '../fitting/stylize.js';
import { CanvasRecorder, saveBlob, videoMime } from '../export/recorder.js';
import { SourceSampler, letterbox, rgbOf } from '../fitting/referenceSource.js';
import { drawStylized } from '../fitting/stylize.js';

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
  static targetFor(image, aspect = 1, fit = 'cover') {
    const [w, h] = fitDims(aspect, LIVE_FIT_SIZE);
    const c = fitTarget(image, w, h, fit);
    return { rgb: canvasToRGB(c), width: w, height: h, contentRect: c.contentRect };
  }

  /**
   * @param image   still reference, or a live source's frame canvas
   * @param source  optional LiveSource (webcam / video / animation); its frames
   *                are sampled into the fitting target on the sampler's schedule
   */
  async start(image, params, aspect = 1, source = null) {
    this.stop();
    this.source = source;
    this.sampler = source ? new SourceSampler({ mode: params.sampling, interval: params.interval }) : null;
    if (params.render === 'watercolor' || params.render === 'layered') await loadBrush();
    this.aspect = aspect;
    this.fit = params.fit || 'cover';
    this.target = LivePainter.targetFor(image, aspect, this.fit);
    const [rw, rh] = fitDims(aspect, 1024);
    this.refCanvas = fitTarget(image, rw, rh, this.fit); // display-resolution reference for the overlay
    this.cf = new ContinuousFitter(this.target.rgb, this.target.width, this.target.height, params);
    this.cf.setContent(this.target.contentRect);
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
      this.sampleSource(dt);
      // Watercolor sprites are slow to build: hold back new strokes while any are queued.
      const cap = this.params.render === 'watercolor' && this.sprites ? (this.sprites.pending > 0 ? 0 : 2) : Infinity;
      this.cf.update(this.t, dt, cap);
      this.paint(dt);
      this.onFrame?.(this);
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Refresh the fitting target (and overlay image) from a live source when due. */
  sampleSource(dt) {
    if (!this.source || !this.sampler || !this.cf) return;
    if (!this.sampler.due(this.source, dt)) return;
    const frame = this.source.canvas;
    if (!frame.width || !frame.height) return;
    const placed = letterbox(frame, this.target.width, this.target.height, this.fit);
    this.cf.setTarget(rgbOf(placed));
    this.cf.setContent(placed.contentRect);
    const [rw, rh] = fitDims(this.aspect || 1, 1024);
    this.refCanvas = letterbox(frame, rw, rh, this.fit);
  }

  async setParams(params) {
    this.params = { ...this.params, ...params };
    if (this.sampler) {
      if (params.sampling) this.sampler.mode = params.sampling;
      if (params.interval !== undefined) this.sampler.interval = params.interval;
    }
    if (this.params.render === 'watercolor' || this.params.render === 'layered') await loadBrush();
    this.cf?.setParams(params);
  }

  /** Clear the canvas and keep painting from blank. */
  clear() {
    if (!this.cf) return;
    this.cf.clear();
    this.sprites = null;
    this.layer = null;
    if (!this.running) this.canvas.remove();
  }

  stop() {
    this.running = false;
    this.source = null;
    this.sampler = null;
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
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--canvas-bg').trim() || '#18191d';
    ctx.fillRect(0, 0, w, h);
    // Fit the canvas aspect inside the preview.
    const a = this.aspect || 1;
    const vw = Math.min(w, h * a), vh = vw / a;
    const x = (w - vw) / 2, y = (h - vh) / 2;
    const [lw, lh] = fitDims(a, 1024);
    const render = brushModule ? this.params.render : 'flat';
    if (render === 'watercolor') {
      // Per-stroke watercolor sprites with individual fades.
      this.sprites ||= new WatercolorSprites(brushModule, { width: lw, height: lh });
      this.sprites.opacity = this.params.opacity ?? 1;
      this.sprites.pigment = this.params.pigment ?? 0.6;
      this.sprites.update(this.cf, this.t);
    } else if (render === 'layered') {
      // Strokes painted once into one canvas; everything fades under washes.
      this.layer ||= new WatercolorLayer(brushModule, { width: lw, height: lh });
      this.layer.opacity = this.params.opacity ?? 1;
      this.layer.update(this.cf, this.t, dt, retentionFor(this.params.fadeOut));
    }
    drawScene(ctx, x, y, vw, vh, {
      cf: this.cf, now: this.t, render, sprites: this.sprites, layer: this.layer,
      ref: this.refCanvas, overlay: this.params.overlay || 'off', refOpacity: this.params.refOpacity ?? 0.5,
      style: this.params.style, stylize: drawStylized
    });
    this.view = { x, y, w: vw, h: vh };
    if (this.recorder) this.recorder.frame(this.canvas, x, y, vw, vh);
  }

  /** Current picture (no letterbox) as a PNG download. */
  savePNG(name) {
    const v = this.view;
    if (!v) return;
    const c = document.createElement('canvas');
    c.width = Math.round(v.w); c.height = Math.round(v.h);
    c.getContext('2d').drawImage(this.canvas, v.x, v.y, v.w, v.h, 0, 0, c.width, c.height);
    c.toBlob(b => b && saveBlob(b, name + '.png'), 'image/png');
  }

  /** Current ASCII frame as plain text (only while Render is ASCII). */
  saveText(name) {
    if (this.params?.render !== 'ascii') return false;
    saveBlob(new Blob([getAsciiText()], { type: 'text/plain;charset=utf-8' }), name + '.txt');
    return true;
  }

  get recording() { return !!this.recorder; }

  startRecording(format) {
    if (format !== 'gif' && !videoMime()) throw new Error('Video recording is not supported in this browser');
    this.recorder = new CanvasRecorder(format);
  }

  async stopRecording(name) {
    const rec = this.recorder;
    this.recorder = null;
    const out = rec && await rec.stop();
    if (out) saveBlob(out.blob, name + '.' + out.ext);
  }

  /** Strokes currently on screen (watercolor counts only strokes with a sprite). */
  visibleCount() {
    if (!this.cf) return 0;
    if (this.params?.render === 'watercolor' && this.sprites) return this.sprites.sprites.size;
    return this.cf.alive.length;
  }

  /** Current picture as a Core DSL program, e.g. to keep as a candidate. */
  snapshot() {
    return this.cf ? this.cf.toProgram(this.t) : null;
  }
}
