/**
 * The transport, and playing a take with it. The playhead (t, in ms) belongs to the scene and runs
 * with or without a take; with one, the canvas shows the take's document at the playhead, the pen at
 * work, captions and title cards. The same frame code drives the standalone player and video.
 * Tempo, meter, fps, ruler and loop range are the scene's (`doc.transport`, src/time/sceneTransport.js);
 * `loop` (on or off) is this session's. Anything that plays in time (a score) listens to `t`.
 */
import { docAt, duration, touch, on } from '../process/take.js';
import { advanceTransportPlaybackTime } from '../time/transport.js';
import { normalizeTransport, loopRange } from '../time/sceneTransport.js';

/** How long the timeline is drawn when nothing gives it a length (ms). */
export const DEFAULT_SPAN = 60000;
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
  /** The scene's transport settings (tempo, signature, fps, ruler, loop range), in seconds. */
  get settings() { return normalizeTransport(this.app.store?.doc?.transport); }
  /** Change them; one undo step, saved with the scene. */
  setSettings(patch) {
    this.app.store.change('transport', d => { d.transport = normalizeTransport({ ...normalizeTransport(d.transport), ...patch }); });
    this.emit();
  }
  /** The loop range in ms, or null. */
  get loopRange() { const r = loopRange(this.settings); return r ? [r[0] * 1000, r[1] * 1000] : null; }
  /** The length of the timeline (ms): the take's, else the loop range's end, else a default; a score may extend it. */
  get duration() {
    if (this.take) return duration(this.take);
    // (the drawn length grows with the playhead, half a minute at a time)
    return Math.max(this.loopRange?.[1] || 0, this.extent || 0, DEFAULT_SPAN, (Math.floor(this.t / 30000) + 2) * 30000);
  }

  /** Load a take for review (the canvas shows it until close). */
  load(take) {
    this.pause();
    this.take = take;
    touch(take);
    this.t = 0;
    this.render();
    this.emit();
  }

  /** Sound clips follow the playhead (started, seeked, paused with it). */
  syncAudio() {
    this.audios ||= new Map();
    for (const c of this.take?.clips || []) {
      if (c.track !== 'audio' || !c.src) continue;
      let a = this.audios.get(c.id);
      if (!a || a.srcKey !== c.src) { a?.pause(); a = new Audio(c.src); a.srcKey = c.src; a.preload = 'auto'; this.audios.set(c.id, a); }
      const inside = on(this.take, c) && this.t >= c.start && this.t < c.start + c.dur;
      if (this.playing && inside) {
        const want = (this.t - c.start) / 1000 + (c.offset || 0) / 1000;
        a.playbackRate = Math.min(4, this.rate);
        if (a.paused) { a.currentTime = want; a.play().catch(() => {}); } else if (Math.abs(a.currentTime - want) > 0.3) a.currentTime = want;
      } else if (!a.paused) a.pause();
    }
    for (const [id, a] of this.audios) if (!this.take?.clips.some(c => c.id === id)) { a.pause(); this.audios.delete(id); }
  }

  close() {
    this.pause();
    for (const a of this.audios?.values() || []) a.pause();
    this.take = null;
    this.app.canvas.previewDoc = null;
    this.app.canvas.invalidate();
    this.emit();
  }

  /** The take was edited: redraw at the same time. */
  changed() { if (this.take) { touch(this.take); this.render(); this.emit(); } }

  // (without a take the timeline has no end: you can seek and play past the drawn length)
  seek(t) { this.t = Math.max(0, this.take ? Math.min(this.duration, t) : t); this.render(); this.syncAudio(); this.emit(); }

  /** The range playback wraps in (ms), or null: the loop range, else the whole take. */
  wrapRange() {
    if (!this.loop) return null;
    return this.loopRange || (this.take ? [0, this.duration] : null);
  }

  play() {
    if (this.playing) return;
    const wrap = this.wrapRange();
    if (this.take && !wrap && this.t >= this.duration) this.t = 0;
    if (wrap && (this.t < wrap[0] || this.t >= wrap[1])) this.t = wrap[0];
    this.playing = true;
    let last = performance.now();
    const tick = now => {
      if (!this.playing) return;
      const r = this.wrapRange();
      // Time is the wall clock's (not the frames'): a slow frame skips ahead, it does not slow the music.
      this.t = advanceTransportPlaybackTime(this.t / 1000, (now - last) / 1000, { rate: this.rate, loopEnabled: Boolean(r), loopStart: r ? r[0] / 1000 : 0, loopEnd: r ? r[1] / 1000 : 0 }) * 1000;
      last = now;
      if (this.take && !r && this.t >= this.duration) { this.t = this.duration; this.playing = false; }
      this.render(); this.syncAudio(); this.emit();
      if (this.playing) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
    this.emit();
  }

  pause() { this.playing = false; cancelAnimationFrame(this.raf); this.syncAudio(); this.emit(); }
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
