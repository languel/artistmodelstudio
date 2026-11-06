/**
 * The transport, and playing a take with it. The playhead (t, in ms) belongs to the scene and runs
 * with or without a take; with one, the canvas shows the take's document at the playhead, the pen at
 * work, captions and title cards. The same frame code drives the standalone player and video.
 * Tempo, meter, fps, ruler and loop range are the scene's (`doc.transport`, src/time/sceneTransport.js);
 * `loop` (on or off) is this session's. Anything that plays in time (a score) listens to `t`.
 */
import { docAt, duration, touch, flatClips } from '../process/take.js';
import { advanceTransportPlaybackTime } from '../time/transport.js';
import { normalizeTransport, loopRange, inOutRange } from '../time/sceneTransport.js';

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
      const dpr = app.canvas.dpr || 1;   // (drawCaptions works in device pixels, with no transform: on a sharp screen the view's CSS size is only a fraction of it)
      drawCaptions(ctx, this.take, this.t, Math.round(W * dpr), Math.round(H * dpr));
      // A quiet label: this is a recording, not the drawing (Esc or any tool goes back).
      ctx.save();
      ctx.font = '12px Inter, system-ui, sans-serif';
      // (it is only looked at: say so, and how to get back to the drawing)
      const label = this.recording ? `Recording onto: ${this.take.title}` : `Reviewing: ${this.take.title} · view only (the × in the Timeline, or a tool, goes back to the drawing)`;
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
  get settings() {
    // Read many times a frame (the sound, the mixer, the overlay): normalized once per change of the scene's transport.
    const doc = this.app.store?.doc, tr = doc?.transport;
    if (this._sDoc !== doc || this._sTr !== tr || !this._s) { this._sDoc = doc; this._sTr = tr; this._s = normalizeTransport(tr); }
    return this._s;
  }
  /** Change them; one undo step, saved with the scene. */
  setSettings(patch) {
    this.app.store.change('transport', d => { d.transport = normalizeTransport({ ...normalizeTransport(d.transport), ...patch }); });
    this.emit();
  }
  /** The loop region in ms, or null. */
  get loopRange() { const r = loopRange(this.settings); return r ? [r[0] * 1000, r[1] * 1000] : null; }
  /** In and Out in ms, or null. */
  get inOut() { const r = inOutRange(this.settings); return r ? [r[0] * 1000, r[1] * 1000] : null; }
  /** The length of the timeline (ms): the take's, else the loop range's end, else a default; a score may extend it. */
  get duration() {
    if (this.take) return duration(this.take);
    // (the drawn length grows with the playhead, half a minute at a time)
    return Math.max(this.loopRange?.[1] || 0, this.inOut?.[1] || 0, this.extent || 0, DEFAULT_SPAN, (Math.floor(this.t / 30000) + 2) * 30000);
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
    const flat = this.take ? flatClips(this.take) : [];   // (sounds inside compositions too)
    for (const c of flat) {
      if (c.track !== 'audio' || !c.src) continue;
      let a = this.audios.get(c.id);
      if (!a || a.srcKey !== c.src) { a?.pause(); a = new Audio(c.src); a.srcKey = c.src; a.preload = 'auto'; this.audios.set(c.id, a); }
      const inside = !c.muted && this.t >= c.start && this.t < c.start + c.dur;
      if (this.playing && inside) {
        const want = (this.t - c.start) / 1000 + (c.offset || 0) / 1000;
        a.playbackRate = Math.min(4, this.rate);
        if (a.paused) { a.currentTime = want; a.play().catch(() => {}); } else if (Math.abs(a.currentTime - want) > 0.3) a.currentTime = want;
      } else if (!a.paused) a.pause();
    }
    for (const [id, a] of this.audios) if (!flat.some(c => c.id === id)) { a.pause(); this.audios.delete(id); }
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
  /** Where the playhead is right now (ms): `t` is as of its last tick, up to a frame or a timer old. Sound wants this one. */
  position() { return this.playing ? this.t + (performance.now() - (this.at ?? performance.now())) * this.rate : this.t; }

  // (past a take's end too: that is where the next thing goes; playing from there starts it over)
  seek(t) { this.t = Math.max(0, Number.isFinite(t) ? t : this.duration); this.at = performance.now(); this.render(); this.syncAudio(); this.emit(); }

  /** The range playback wraps in (ms), or null: with Loop on, the loop region, else In to Out, else the whole take. */
  wrapRange() {
    if (!this.loop) return null;
    return this.loopRange || this.inOut || (this.take ? [0, this.duration] : null);
  }

  play() {
    if (this.playing) return;
    const wrap = this.wrapRange();
    if (this.take && !wrap && !this.recording && this.t >= this.duration) this.t = 0;
    if (wrap && (this.t < wrap[0] || this.t >= wrap[1])) this.t = wrap[0];
    // Not looping, from before Out: play stops at Out (as an editor's In to Out).
    const io = this.inOut;
    this.stopAt = !wrap && io && this.t < io[1] ? io[1] : null;
    this.playing = true;
    let last = performance.now();
    this.at = last;
    const tick = () => {
      if (!this.playing) return;
      const now = performance.now();
      if (now - last < 1) return;   // (the frame and the timer below both call this)
      const r = this.wrapRange();
      // Time is the wall clock's (not the frames'): a slow frame skips ahead, it does not slow the music.
      this.t = advanceTransportPlaybackTime(this.t / 1000, (now - last) / 1000, { rate: this.rate, loopEnabled: Boolean(r), loopStart: r ? r[0] / 1000 : 0, loopEnd: r ? r[1] / 1000 : 0 }) * 1000;
      last = now; this.at = now;
      if (!r && this.stopAt != null && this.t >= this.stopAt) { this.t = this.stopAt; this.playing = false; clearInterval(this.timer); }
      else if (this.take && !r && !this.recording && this.t >= this.duration) { this.t = this.duration; this.playing = false; clearInterval(this.timer); }
      this.render(); this.syncAudio(); this.emit();
    };
    // Every frame (a skipped tick must not end the chain: on a 120 Hz screen frames come every 8 ms).
    const frame = () => { this.raf = 0; tick(); if (this.playing) this.raf = requestAnimationFrame(frame); };
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(frame);
    // Frames stop in a hidden or unfocused pane; the transport (and what plays on it) must not.
    clearInterval(this.timer);
    this.timer = setInterval(() => { if (performance.now() - last > 60) tick(); }, 40);
    this.emit();
  }

  /** Back to the start: In, if marked; else, while looping, the loop region's start; else 0. */
  rewind() { const io = this.inOut, r = this.loop ? this.loopRange : null; this.seek(io ? io[0] : r ? r[0] : 0); }

  /** Pause and go back to the start. */
  stop() { this.pause(); this.rewind(); }

  pause() { this.playing = false; cancelAnimationFrame(this.raf); clearInterval(this.timer); this.syncAudio(); this.emit(); }
  toggle() { this.playing ? this.pause() : this.play(); }

  render() {
    if (!this.take) return;
    const cv = this.app.canvas;
    const doc = docAt(this.take, this.t);
    cv.previewDoc = doc;
    // Follow the take's camera keyframes, if it has any.
    if (this.followCamera && flatClips(this.take).some(c => c.track === 'camera')) {
      const tf = frameTransform(this.take, this.t, cv.w, cv.h, doc);
      cv.cam = { x: tf.x, y: tf.y, z: tf.scale };
    }
    cv.invalidate();
  }
}
