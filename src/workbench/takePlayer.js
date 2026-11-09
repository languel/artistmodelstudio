/**
 * The transport, and playing a take with it. The playhead (t, in ms) belongs to the scene and runs
 * with or without a take; with one, the canvas shows the take's document at the playhead, the pen at
 * work, captions and title cards. The same frame code drives the standalone player and video.
 * Tempo, meter, fps, ruler and loop range are the scene's (`doc.transport`, src/time/sceneTransport.js);
 * `loop` (on or off) is this session's. Anything that plays in time (a score) listens to `t`.
 */
import { docAt, duration, touch, flatClips } from '../process/take.js';
import { fadeGain } from '../process/clipEdit.js';
import { boardById, MAIN } from '../process/boards.js';
import { boardLive } from './boardSource.js';
import { camerasOf, cameraById, shotAt, onAirShot, renderCamera, viewFor, releaseCameras, onionTimes, ONION_TINT } from './camera.js';
import { lanesOf, laneValue } from '../process/keyframes.js';
import { param } from './params.js';
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
    this.onion = { on: false, before: 2, after: 0, step: 120, opacity: 0.32 };   // onion skin through the camera (an editing aid, never rendered)
    this.listeners = new Set();
    app.canvas.drawLiveOverlay = (ctx, tf, W, H) => this.drawLive(ctx, tf, W, H);
    app.canvas.drawPreviewOverlay = (ctx, tf, W, H) => {
      if (!this.take) return;
      // The pen marker (a ring at the tip of a stroke being drawn back) is off unless Settings › Timeline › Pen marker is on: the pointer is the pen now.
      let marker = false; try { marker = localStorage.getItem('ams_pen_marker') === '1'; } catch { /* ignore */ }
      if (marker && !app.guide?.following) drawPen(ctx, app.canvas.previewDoc, tf);
      const dpr = app.canvas.dpr || 1;   // (drawCaptions works in device pixels, with no transform: on a sharp screen the view's CSS size is only a fraction of it)
      this.drawMedia(ctx, this.artboardRect(tf, app.canvas.previewDoc));
      drawCaptions(ctx, this.take, this.t, Math.round(W * dpr), Math.round(H * dpr));
      this.drawSelection(ctx, tf, app.canvas.previewDoc);
      // A quiet label: this is a recording, not the drawing (Esc or any tool goes back).
      ctx.save();
      ctx.font = '12px Inter, system-ui, sans-serif';
      // (it is only looked at: say so, and how to get back to the drawing)
      const label = this.recording ? `Recording onto: ${this.take.title}` : `Reviewing: ${this.take.title} · view only (record to draw onto it; the × in the Timeline goes back to your drawing)`;
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
    this.applied = null;
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
      a.volume = Math.max(0, Math.min(1, (c.volume ?? 1) * fadeGain(c, this.t)));   // (its fades; a crossfade with equal power)
      if (this.playing && inside) {
        const want = (this.t - c.start) / 1000 + (c.offset || 0) / 1000;
        a.playbackRate = Math.min(4, this.rate);
        if (a.paused) { a.currentTime = want; a.play().catch(() => {}); } else if (Math.abs(a.currentTime - want) > 0.3) a.currentTime = want;
      } else if (!a.paused) a.pause();
    }
    for (const [id, a] of this.audios) if (!flat.some(c => c.id === id)) { a.pause(); this.audios.delete(id); }
    this.syncMedia(flat);
  }

  /**
   * Media clips (moments of a video, by reference) follow the playhead like sounds, and show in the picture: each is a
   * hidden <video> kept at the clip's moment (playing with the take, seeked when scrubbed) and drawn over the artboard.
   */
  syncMedia(flat) {
    this.videos ||= new Map();
    for (const c of flat) {
      if (c.track !== 'media' || c.board || !(c.url || c.asset)) continue;
      const key = c.url || c.asset;
      let v = this.videos.get(c.id);
      if (!v || v.srcKey !== key) { v?.pause?.(); v = this.makeVideo(c, key); this.videos.set(c.id, v); }
      if (c.still) continue;   // (a picture holds: nothing to play or seek)
      const speed = c.speed > 0 ? c.speed : 1, want = (c.in || 0) + (this.t - c.start) / 1000 * speed;
      const inside = !c.muted && this.t >= c.start && this.t < c.start + c.dur;
      v.muted = !(c.volume > 0); v.volume = Math.max(0, Math.min(1, (c.volume || 0) * fadeGain(c, this.t)));
      if (inside) {
        v.playbackRate = Math.max(0.0625, Math.min(4, speed * this.rate));
        if (this.playing) { if (v.paused) { v.currentTime = want; v.play().catch(() => {}); } else if (Math.abs(v.currentTime - want) > 0.3) v.currentTime = want; }
        else { if (!v.paused) v.pause(); if (Math.abs(v.currentTime - want) > 0.04) v.currentTime = want; }   // (scrubbing: show the frame)
      } else if (!v.paused) v.pause();
    }
    for (const [id, v] of this.videos) if (!flat.some(c => c.id === id && c.track === 'media')) { v.pause?.(); v.removeAttribute('src'); v.load?.(); this.videos.delete(id); }
  }

  makeVideo(c, key) {
    if (c.still) {
      const im = new Image(); im.srcKey = key; im.crossOrigin = 'anonymous';
      im.onload = () => { this.app.canvas.invalidate(); for (const f of this.programListeners || []) f(); };
      if (c.url) im.src = c.url; else this.app.assetStore.get(c.asset).then(a => { if (a?.blob && im.srcKey === key) im.src = URL.createObjectURL(a.blob); }).catch(() => {});
      return im;
    }
    const v = document.createElement('video');
    v.srcKey = key; v.preload = 'auto'; v.playsInline = true; v.crossOrigin = 'anonymous'; v.loop = false;
    const redraw = () => { this.app.canvas.invalidate(); for (const f of this.programListeners || []) f(); };   // (a frame arrived: the Program picture is stale)
    v.addEventListener('seeked', redraw); v.addEventListener('loadeddata', redraw);
    if (c.url) v.src = c.url;
    else this.app.assetStore.get(c.asset).then(a => { if (a?.blob && v.srcKey === key) v.src = URL.createObjectURL(a.blob); }).catch(() => {});
    return v;
  }

  /**
   * A take of titles, narration, sound and media (nothing recorded: no drawing, no camera) is put together on the
   * Timeline while the canvas stays yours: you can still draw and edit. A take with a recording shows its own picture.
   */
  /** Recording onto this take: the canvas stays the live drawing (the recorder keeps it in step with the take). */
  get overdubbing() { return Boolean(this.recording && this.app.recorder?.overdubbing); }

  get composing() {
    if (!this.take || this.recording) return false;
    return !flatClips(this.take).some(c => !c.muted && (c.track === 'draw' || c.track === 'camera'));   // (the History track is muted: it does not make a take a recording)
  }

  /** Where the picture is on screen: the artboard of a take shown (at the view's transform), else the main board of the scene. */
  artboardRect(tf, doc) {
    if (doc?.artboard) return { X: tf.x, Y: tf.y, W: doc.artboard.width * tf.scale, H: doc.artboard.height * tf.scale };
    const b = boardById(this.app.store.doc, MAIN) || {};
    return { X: tf.x + (b.x || 0) * tf.scale, Y: tf.y + (b.y || 0) * tf.scale, W: (b.width || 1000) * tf.scale, H: (b.height || 1000) * tf.scale };
  }

  /** What a composing take adds over the live canvas: its media, captions and title cards (unless a Program board shows the sequence). */
  drawLive(ctx, tf, W, H) {
    if (!this.take || !(this.composing || this.overdubbing)) return;
    this.drawViewfinders(ctx, tf);
    if (this.app.programBoard?.()) return;
    this.drawMedia(ctx, this.artboardRect(tf, null));
    const dpr = this.app.canvas.dpr || 1;
    drawCaptions(ctx, this.take, this.t, Math.round(W * dpr), Math.round(H * dpr));
  }

  /** A board's picture for a clip of it (the board as a live source, drawn larger than a source is). */
  boardPicture(id) {
    this.boardLives ||= new Map();
    let live = this.boardLives.get(id);
    if (!live) { if (!boardById(this.app.store.doc, id)) return null; live = boardLive(this.app, id, 960); this.boardLives.set(id, live); }
    live.tick();
    return live.canvas;
  }

  /** Something the Program picture shows changed (a video frame decoded). */
  onProgramDirty(fn) { (this.programListeners ||= new Set()).add(fn); return () => this.programListeners.delete(fn); }

  /** The sequence as a picture on a canvas of its own (black ground, the media and captions): the Timeline source, the Program board. */
  drawProgram(ctx, W, H, cameraId = null) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
    // The camera: the shot active now (the one that started last for the Program, or this camera's own), shown contained.
    const shot = cameraId ? shotAt(this.take, this.t, cameraId) : onAirShot(this.take, this.t);
    if (shot) {
      const cam = cameraById(this.take, shot.camera), off = (this.camCanvases ||= new Map()).get(cam.id) || (() => { const c = document.createElement('canvas'); this.camCanvases.set(cam.id, c); return c; })();
      if (off.width !== cam.w || off.height !== cam.h) { off.width = cam.w; off.height = cam.h; }
      renderCamera(this.app, shot, this.t, off.getContext('2d'), cam.w, cam.h);
      const k = Math.min(W / cam.w, H / cam.h); ctx.drawImage(off, (W - cam.w * k) / 2, (H - cam.h * k) / 2, cam.w * k, cam.h * k);
      this.drawOnion(ctx, W, H, cam, cameraId);
    }
    if (!cameraId) {   // (the media and captions belong to the Program, not to one camera)
      this.syncMedia(flatClips(this.take));
      this.drawMedia(ctx, { X: 0, Y: 0, W, H });
      drawCaptions(ctx, this.take, this.t, W, H);
    }
    ctx.restore();
  }

  /**
   * Onion skin through the camera (an editing aid, never rendered): while paused, the frames just before (warm) and
   * after (cool) the playhead, as seen by the same camera, show faintly over the picture. Camera moves and stop-motion
   * frames show; a parameter that is only keyframed on a board does not (the boards are posed for the playhead alone).
   */
  drawOnion(ctx, W, H, cam, cameraId) {
    const o = this.onion;
    if (!o?.on || this.playing || this.app.frames?.renderMode) return;
    const ghosts = onionTimes(this.t, o, duration(this.take));
    if (!ghosts.length) return;
    const g = (this.onionCanvas ||= document.createElement('canvas'));
    if (g.width !== cam.w || g.height !== cam.h) { g.width = cam.w; g.height = cam.h; }
    const gc = g.getContext('2d'), k = Math.min(W / cam.w, H / cam.h);
    for (const gh of ghosts) {
      const shot = cameraId ? shotAt(this.take, gh.t, cameraId) : onAirShot(this.take, gh.t);
      if (!shot || (shot.camera || cam.id) !== cam.id) continue;
      renderCamera(this.app, shot, gh.t, gc, cam.w, cam.h);
      gc.save(); gc.globalCompositeOperation = 'multiply'; gc.fillStyle = ONION_TINT[gh.side]; gc.fillRect(0, 0, cam.w, cam.h); gc.restore();
      ctx.save(); ctx.globalAlpha = gh.a; ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(g, (W - cam.w * k) / 2, (H - cam.h * k) / 2, cam.w * k, cam.h * k);
      ctx.restore();
    }
  }

  /** The cameras' frames on the live canvas: a coloured outline where each camera is looking now (the shot active for it). */
  drawViewfinders(ctx, tf) {
    if (!this.take) return;
    for (const cam of camerasOf(this.take)) {
      const shot = shotAt(this.take, this.t, cam.id);
      if (!shot) continue;
      const r = viewFor(this.app.store.doc, shot, this.t, cam.w, cam.h).rect;
      const x = tf.x + r.x * tf.scale, y = tf.y + r.y * tf.scale, w = r.w * tf.scale, h = r.h * tf.scale, live = onAirShot(this.take, this.t)?.camera === cam.id;
      ctx.save();
      ctx.strokeStyle = cam.color; ctx.lineWidth = live ? 2.5 : 1.5; ctx.setLineDash(live ? [] : [6, 4]);
      ctx.strokeRect(x, y, w, h);
      ctx.setLineDash([]); ctx.fillStyle = cam.color; ctx.font = '11px ui-sans-serif, system-ui, sans-serif'; ctx.textBaseline = 'bottom';
      ctx.fillText(`${cam.name}${live ? ' · on air' : ''}`, x + 4, y - 3);
      ctx.restore();
    }
  }

  /** Draw the media clips under the playhead into a rectangle of the screen. */
  drawMedia(ctx, { X, Y, W, H }) {
    if (!this.take) return;
    for (const c of flatClips(this.take).filter(k => k.track === 'media').sort((a, b) => a.start - b.start)) {   // (the one that starts later is on top: a crossfade comes in over the other)
      if (c.muted || this.t < c.start || this.t >= c.start + c.dur) continue;
      const v = c.board ? this.boardPicture(c.board) : this.videos?.get(c.id);
      const vw = v?.videoWidth || v?.naturalWidth || v?.width, vh = v?.videoHeight || v?.naturalHeight || v?.height;
      if (!v || !vw || (v.readyState != null && v.readyState < 2)) continue;
      const k = (c.fit === 'cover' ? Math.max : Math.min)(W / vw, H / vh), w = vw * k, h = vh * k;
      const a = (c.opacity ?? 1) * fadeGain(c, this.t, { visual: true });   // (fades in and out, and a crossfade: src/process/clipEdit.js)
      ctx.save();
      ctx.beginPath(); ctx.rect(X, Y, W, H); ctx.clip();
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      if (c.blend && c.blend !== 'normal') ctx.globalCompositeOperation = c.blend;
      try { ctx.drawImage(v, X + (W - w) / 2, Y + (H - h) / 2, w, h); } catch { /* not decodable yet */ }
      ctx.restore();
    }
  }

  close() {
    this.pause();
    for (const a of this.audios?.values() || []) a.pause();
    for (const v of this.videos?.values() || []) v.pause();
    this.videos?.clear();
    this.applied = null;
    releaseCameras(); this.camCanvases = null;
    if (this.app.frames) this.app.frames.automated = null;
    for (const l of this.boardLives?.values() || []) l.stop?.();
    this.boardLives?.clear();
    this.take = null;
    this.app.canvas.previewDoc = null;
    this.app.canvas.invalidate();
    this.emit();
  }

  /** The take was edited: redraw at the same time. */
  changed() { if (this.take) { this.applied = null; touch(this.take); this.render(); this.emit(); } }

  // (without a take the timeline has no end: you can seek and play past the drawn length)
  /** Where the playhead is right now (ms): `t` is as of its last tick, up to a frame or a timer old. Sound wants this one. */
  position() { return this.playing ? this.t + (performance.now() - (this.at ?? performance.now())) * this.rate : this.t; }

  // (past a take's end too: that is where the next thing goes; playing from there starts it over)
  seek(t) { this.t = Math.max(0, Number.isFinite(t) ? t : this.duration); this.applied = null; /* a jump re-applies every lane: a value changed by hand goes back */ this.at = performance.now(); this.render(); this.syncAudio(); if (!this.playing) this.scrubCursor(); this.emit(); }

  /** The selection frames recorded with the interactions: the marks selected at this moment get a dashed frame, as they did when they were picked. */
  drawSelection(ctx, tf, doc) {
    if (!doc || !this.take) return;
    const sel = flatClips(this.take).filter(c => c.ui?.select && !c.muted && c.start <= this.t).sort((a, b) => a.start - b.start).at(-1);
    if (!sel?.ui.select.length) return;
    const els = doc.elements.filter(e => sel.ui.select.includes(e.id) && e.points?.length);
    if (!els.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const e of els) for (const p of e.points) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const a = [tf.x + x0 * tf.scale - 6, tf.y + y0 * tf.scale - 6], b = [tf.x + x1 * tf.scale + 6, tf.y + y1 * tf.scale + 6];
    ctx.save();
    ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(245,245,240,0.9)';
    ctx.strokeRect(a[0], a[1], b[0] - a[0], b[1] - a[1]);
    ctx.setLineDash([]); ctx.fillStyle = 'rgba(245,245,240,0.95)';
    for (const [hx, hy] of [[a[0], a[1]], [b[0], a[1]], [a[0], b[1]], [b[0], b[1]]]) ctx.fillRect(hx - 2.5, hy - 2.5, 5, 5);
    ctx.restore();
  }

  /** Scrubbing or paused inside a recorded interaction: the agent pointer is where the pointer was at that moment (a stroke, a click on a control); outside one it is put away. */
  scrubCursor() {
    const g = this.app.guide; if (!g || !this.take) return;
    let hide = false; try { hide = localStorage.getItem('ams_guide_playback') === 'hide'; } catch { /* ignore */ }
    const c = hide || !g.enabled ? null : flatClips(this.take).filter(x => x.ui && !x.muted && this.t >= x.start && this.t <= x.start + Math.max(x.dur || 0, 1)).pop();
    const at = c ? g.pointAt(c.ui, (this.t - c.start) / Math.max(c.dur || 1, 1)) : null;
    if (at) { g.scrubbing = true; g.cursor.style.opacity = '1'; g.place(at[0], at[1]); }
    else if (g.scrubbing) { g.scrubbing = false; g.cursor.style.opacity = '0'; }
  }

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
      const r = this.wrapRange(), t0 = this.t;
      // Time is the wall clock's (not the frames'): a slow frame skips ahead, it does not slow the music.
      this.t = advanceTransportPlaybackTime(this.t / 1000, (now - last) / 1000, { rate: this.rate, loopEnabled: Boolean(r), loopStart: r ? r[0] / 1000 : 0, loopEnd: r ? r[1] / 1000 : 0 }) * 1000;
      last = now; this.at = now;
      if (!r && this.stopAt != null && this.t >= this.stopAt) { this.t = this.stopAt; this.playing = false; clearInterval(this.timer); this.scrubCursor(); }
      else if (this.take && !r && !this.recording && this.t >= this.duration) { this.t = this.duration; this.playing = false; clearInterval(this.timer); this.scrubCursor(); }
      if (this.take && this.t > t0) this.fireCues(t0, this.t);
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

  /** Recorded interactions that fall in [a, b) play on the Guide's cursor (unmuted clips only). */
  fireCues(a, b) {
    const g = this.app.guide; if (!g?.active || b - a > 2000 || this.rate >= 4) return;   // (fast playback: the result, not the cursor)
    let hide = false; try { hide = localStorage.getItem('ams_guide_playback') === 'hide'; } catch { /* ignore */ }
    if (hide) return;   // (Settings › Guide › On playback: no pointer, for a video or a quick look)
    for (const c of flatClips(this.take)) if (c.ui && !c.muted && c.start >= a && c.start < b) g.cue(c.ui, c.label, { rate: this.rate });
  }

  /** Back to the start: In, if marked; else, while looping, the loop region's start; else 0. */
  rewind() { const io = this.inOut, r = this.loop ? this.loopRange : null; this.seek(io ? io[0] : r ? r[0] : 0); }

  /** Pause and go back to the start. */
  stop() { this.pause(); this.rewind(); }

  pause() { this.playing = false; cancelAnimationFrame(this.raf); clearInterval(this.timer); this.syncAudio(); this.scrubCursor(); this.emit(); }
  toggle() { this.playing ? this.pause() : this.play(); }

  /** The values lanes give a board's sketch controls now ({ name: value }): a sketch that starts again begins with them, not with the code's. */
  ctlValuesFor(id) {
    if (!this.take) return null;
    const o = {}, prefix = `ctl:${id}.`;
    for (const lane of lanesOf(this.take)) if (lane.address.startsWith(prefix)) { const v = laneValue(lane, this.t - lane.start, lane.meta); if (v != null) o[lane.address.slice(prefix.length)] = v; }
    return Object.keys(o).length ? o : null;
  }

  /** Automation: every parameter with a lane takes its value at the playhead (only when it differs, so nothing is redrawn for nothing). */
  applyAutomation() {
    if (!this.take) return;
    this.applied ||= new Map();
    const lanes = lanesOf(this.take);
    if (this.app.frames) this.app.frames.automated = new Set(lanes.filter(l => l.address.startsWith('ctl:')).map(l => l.address.slice(4)));   // (sketch controls a lane drives)
    this.applying = true;   // (the dots wait: a parameter set a moment before another is not 'changed')
    try {
      for (const lane of lanes) {
        const v = laneValue(lane, this.t - lane.start, lane.meta);
        if (v == null || JSON.stringify(this.applied.get(lane.address)) === JSON.stringify(v)) continue;
        const p = param(lane.address);
        if (!p) continue;
        p.set(v);
        this.applied.set(lane.address, v);
      }
    } finally { this.applying = false; }
  }

  render() {
    if (!this.take) return;
    this.applyAutomation();
    const cv = this.app.canvas, od = this.overdubbing;
    if (od) this.app.recorder.frame(this.t);   // (the live drawing follows the take; a gesture in progress is sampled)
    const doc = od ? null : docAt(this.take, this.t);
    cv.previewDoc = od || this.composing ? null : doc;   // (a take with no recording leaves the canvas live; so does recording onto one: the tools work on the drawing)
    // Follow the take's camera keyframes, if it has any.
    if (!od && !this.composing && this.followCamera && flatClips(this.take).some(c => c.track === 'camera')) {
      const tf = frameTransform(this.take, this.t, cv.w, cv.h, doc);
      cv.cam = { x: tf.x, y: tf.y, z: tf.scale };
    }
    cv.invalidate();
  }
}
