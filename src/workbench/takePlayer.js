/**
 * Playing a take in the studio: the canvas shows the take's document at the playhead, the pen at
 * work, captions and title cards. The same frame code drives the standalone player and video.
 */
import { docAt, duration, touch } from '../process/take.js';
import { drawCaptions, drawPen, frameTransform } from '../process/takeRender.js';

export class TakePlayer {
  constructor(app) {
    this.app = app;
    this.take = null;
    this.t = 0;
    this.playing = false;
    this.rate = 1;
    this.loop = false;
    this.followCamera = true;
    this.listeners = new Set();
    app.canvas.drawPreviewOverlay = (ctx, tf, W, H) => {
      if (!this.take) return;
      drawPen(ctx, app.canvas.previewDoc, tf);
      drawCaptions(ctx, this.take, this.t, W, H);
      // A quiet label: this is a recording, not the drawing (Esc or any tool goes back).
      ctx.save();
      ctx.font = '12px Inter, system-ui, sans-serif';
      const label = `Reviewing: ${this.take.title}`;
      const w = Math.min(W - 24, ctx.measureText(label).width + 20);
      ctx.fillStyle = 'rgba(20,19,18,0.72)';
      ctx.beginPath(); ctx.roundRect ? ctx.roundRect(12, 12, w, 24, 12) : ctx.rect(12, 12, w, 24); ctx.fill();
      ctx.fillStyle = '#f3efe6'; ctx.textBaseline = 'middle';
      ctx.fillText(label, 22, 24, w - 20);
      ctx.restore();
    };
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const f of this.listeners) f(this); }
  get duration() { return this.take ? duration(this.take) : 0; }

  /** Load a take for review (the canvas shows it until close). */
  load(take) {
    this.pause();
    this.take = take;
    touch(take);
    this.t = 0;
    this.render();
    this.emit();
  }

  close() {
    this.pause();
    this.take = null;
    this.app.canvas.previewDoc = null;
    this.app.canvas.invalidate();
    this.emit();
  }

  /** The take was edited: redraw at the same time. */
  changed() { if (this.take) { touch(this.take); this.render(); this.emit(); } }

  seek(t) { this.t = Math.max(0, Math.min(this.duration, t)); this.render(); this.emit(); }

  play() {
    if (!this.take || this.playing) return;
    if (this.t >= this.duration) this.t = 0;
    this.playing = true;
    let last = performance.now();
    const tick = now => {
      if (!this.playing) return;
      this.t += (now - last) * this.rate; last = now;
      if (this.t >= this.duration) { if (this.loop) this.t = 0; else { this.t = this.duration; this.playing = false; } }
      this.render(); this.emit();
      if (this.playing) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.emit();
  }

  pause() { this.playing = false; cancelAnimationFrame(this.raf); this.emit(); }
  toggle() { this.playing ? this.pause() : this.play(); }

  render() {
    if (!this.take) return;
    const cv = this.app.canvas;
    const doc = docAt(this.take, this.t);
    cv.previewDoc = doc;
    // Follow the take's camera keyframes, if it has any.
    if (this.followCamera && this.take.clips.some(c => c.track === 'camera')) {
      const tf = frameTransform(this.take, this.t, cv.w, cv.h, doc);
      cv.cam = { x: tf.x, y: tf.y, z: tf.scale };
    }
    cv.invalidate();
  }
}
