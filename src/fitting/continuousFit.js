/**
 * Continuous Reference Fitter
 *
 * The population holds about `density` shapes and turns over once every
 * `lifetime` seconds (the cycle). Each new shape is fitted by the Reference
 * Fitter against the picture made by the shapes still alive, so the painting
 * keeps re-approximating the reference forever. Two styles:
 *
 *   strokes  one shape per beat (beat = lifetime / density), each living exactly
 *            one cycle, so the oldest leaves as the newest arrives, like the
 *            Animate replay on a loop, a time-lapse of strokes. Each stroke
 *            fades in over 1 + 20 × fadeIn beats and out over 1 + 20 × fadeOut.
 *   fade     lifetimes vary ±20%; each shape fades in over `fadeIn` of its life
 *            and out over `fadeOut`, so many shapes are fading at once.
 *
 * `fade` sets both fadeIn and fadeOut.
 *
 * Shared by the studio's live preview and the p5.js export, which embeds this
 * file's source next to fitReference.js with import/export lines stripped, so
 * keep this file's only import on a single line.
 *
 * Drawing uses a plain CanvasRenderingContext2D (p5's `drawingContext` is one),
 * with the same geometry as FlatCanvasMedium.
 */
import { ReferenceFitter } from './fitReference.js';

export class ContinuousFitter {
  /**
   * @param {Float32Array} target RGB floats, width*height*3
   * @param {number} width fitting resolution
   * @param {number} height fitting resolution
   */
  constructor(target, width, height, { ground = 'transparent', groundTime = 5, mode = 'strokes', density = 150, lifetime = 12, fade = 0.1, fadeIn, fadeOut, shapes = ['rect', 'triangle', 'circle'], seed = 1, trials = 48, climbs = 64 } = {}) {
    this.w = width;
    this.h = height;
    this.fitter = new ReferenceFitter(target, width, height, { seed, shapes, trials, climbs });
    this.background = this.fitter.background;
    this.bgRGB = [1, 3, 5].map(i => parseInt(this.background.slice(i, i + 2), 16));
    this.buffer = new Float32Array(target.length);
    this.alive = [];
    this.opacity = 1;
    // 'transparent' | 'fixed' (set at start and Clear) | 'follow' (each frame's mean)
    // | 'drift' (eases toward the mean over `groundTime` seconds)
    this.ground = 'transparent';
    this.groundTime = 5;
    this.nextId = 1;
    this.spawnDebt = 0;
    this.maxSpawnsPerFrame = 4;
    this.setParams({ mode, density, lifetime, fade, fadeIn, fadeOut, ground, groundTime });
  }

  setParams({ mode, density, lifetime, fade, fadeIn, fadeOut, shapes, opacity, ground, groundTime } = {}) {
    if (['transparent', 'fixed', 'follow', 'drift'].includes(ground)) this.ground = ground;
    if (groundTime !== undefined) this.groundTime = Math.max(0.05, groundTime);
    if (opacity !== undefined) this.opacity = Math.min(1, Math.max(0, opacity));
    if (mode === 'strokes' || mode === 'fade') this.mode = mode;
    if (density !== undefined) this.density = Math.max(1, Math.round(density));
    if (lifetime !== undefined) this.lifetime = Math.max(0.1, lifetime);
    const clampFade = v => Math.min(1, Math.max(0, v));
    if (fade !== undefined) this.fadeIn = this.fadeOut = clampFade(fade);
    if (fadeIn !== undefined) this.fadeIn = clampFade(fadeIn);
    if (fadeOut !== undefined) this.fadeOut = clampFade(fadeOut);
    if (shapes !== undefined && shapes.length) this.fitter.shapeTypes = shapes;
  }

  /**
   * Swap in a new target (a live source frame). The ground color changes only
   * with ground 'follow', and then only when the mean moves noticeably, so
   * watercolor paper is not rebuilt every frame.
   */
  setTarget(target) {
    if (!target || target.length !== this.fitter.target.length) return;
    this.fitter.target = target;
    this.targetMean = this.meanOf(target);
    if (this.ground === 'follow') this.updateBackground(10);
  }

  meanOf(target) {
    const n = target.length / 3;
    const mean = [0, 0, 0];
    for (let i = 0; i < target.length; i += 3) { mean[0] += target[i]; mean[1] += target[i + 1]; mean[2] += target[i + 2]; }
    return mean.map(v => v / n);
  }

  /** Drift: ease the ground toward the latest frame's mean (time constant groundTime). */
  driftBackground(dt) {
    if (this.ground !== 'drift' || !this.targetMean) return;
    this.driftRGB ||= this.bgRGB.slice();
    const k = 1 - Math.exp(-dt / this.groundTime);
    this.driftRGB = this.driftRGB.map((v, i) => v + (this.targetMean[i] - v) * k);
    const m = this.driftRGB.map(Math.round);
    if (m.some((v, i) => v !== this.bgRGB[i])) {
      this.bgRGB = m;
      this.background = '#' + m.map(v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0')).join('');
      this.fitter.background = this.background;
    }
  }

  /**
   * Limit fitting and drawing to the reference's area (fit 'contain'): `rect`
   * is {x, y, w, h} in 0–1. Padding outside it is ignored by the fitter and
   * clipped when drawing. A full rect removes the limit.
   */
  setContent(rect) {
    const full = !rect || (rect.x <= 0.001 && rect.y <= 0.001 && rect.w >= 0.999 && rect.h >= 0.999);
    this.contentRect = full ? null : rect;
    if (full) { this.fitter.mask = null; return; }
    const W = this.w, H = this.h;
    const x0 = Math.floor(rect.x * W), x1 = Math.ceil((rect.x + rect.w) * W);
    const y0 = Math.floor(rect.y * H), y1 = Math.ceil((rect.y + rect.h) * H);
    const mask = new Uint8Array(W * H);
    for (let y = Math.max(0, y0); y < Math.min(H, y1); y++) mask.fill(1, y * W + Math.max(0, x0), y * W + Math.min(W, x1));
    this.fitter.mask = mask;
  }

  /** Set the ground color to the target's mean (if it moved more than `threshold`). */
  updateBackground(threshold = 0) {
    const target = this.fitter.target;
    const n = target.length / 3;
    const mean = [0, 0, 0];
    for (let i = 0; i < target.length; i += 3) { mean[0] += target[i]; mean[1] += target[i + 1]; mean[2] += target[i + 2]; }
    const m = mean.map(v => Math.round(v / n));
    if (m.some((v, i) => Math.abs(v - this.bgRGB[i]) > threshold)) {
      this.bgRGB = m;
      this.background = '#' + m.map(v => v.toString(16).padStart(2, '0')).join('');
      this.fitter.background = this.background;
    }
  }

  /** Wipe the painting: remove every shape; new ones start filling from blank. */
  clear() {
    this.alive = [];
    this.spawnDebt = 0;
    this.updateBackground(); // fixed ground: re-take the color on every Clear
    this.driftRGB = null;
  }

  /** Seconds between strokes. */
  get beat() {
    return this.lifetime / this.density;
  }

  /** Fade durations in seconds for a shape living `life` seconds. */
  fadeTimes(life) {
    const strokes = this.mode === 'strokes';
    const t = f => (strokes ? this.beat * (1 + 20 * f) : Math.max(0.01, f * life));
    let fin = t(this.fadeIn), fout = t(this.fadeOut);
    const total = fin + fout;
    if (total > life) { fin *= life / total; fout *= life / total; }
    return { fin: Math.max(0.01, fin), fout: Math.max(0.01, fout) };
  }

  /** Opacity envelope: fade in over `fin` seconds at birth, out over `fout` before death. */
  alpha(s, now) {
    const age = now - s.born;
    if (age <= 0 || age >= s.life) return 0;
    return Math.min(1, age / s.fin, (s.life - age) / s.fout);
  }

  /**
   * Composite the living shapes into the fitter's working canvas as they will
   * look at time `at` (with their opacity then), so a new shape is fitted
   * against the picture it will actually join once it has faded in.
   */
  rebuild(at) {
    const buf = this.buffer;
    const [r, g, b] = this.bgRGB;
    for (let i = 0; i < buf.length; i += 3) { buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; }
    const w = this.w;
    for (const s of this.alive) {
      const op = this.alpha(s, at);
      if (op <= 0) continue;
      const { bx, by, bw, bh, a } = s.cov;
      for (let y = 0; y < bh; y++) {
        for (let x = 0; x < bw; x++) {
          const al = (a[(y * bw + x) * 4 + 3] / 255) * op;
          if (al === 0) continue;
          const i = ((by + y) * w + bx + x) * 3;
          buf[i] += (s.rgb[0] - buf[i]) * al;
          buf[i + 1] += (s.rgb[1] - buf[i + 1]) * al;
          buf[i + 2] += (s.rgb[2] - buf[i + 2]) * al;
        }
      }
    }
    this.fitter.current = buf;
  }

  spawn(now) {
    // Fit against the picture at the moment this shape becomes fully opaque.
    this.rebuild(now + this.fadeTimes(this.lifetime).fin);
    const f = this.fitter;
    f.shapes = [];
    for (let tries = 0; tries < 6 && f.shapes.length === 0; tries++) f.step();
    if (!f.shapes.length) return false;
    const shape = f.shapes[0];
    const cov = f.coverage(shape);
    if (!cov) return false;
    const rgb = [1, 3, 5].map(i => parseInt(shape.color.slice(i, i + 2), 16));
    const strokes = this.mode === 'strokes';
    const life = strokes ? this.lifetime : this.lifetime * (0.8 + 0.4 * f.rand());
    const { fin, fout } = this.fadeTimes(life);
    this.alive.push({ id: this.nextId++, shape, rgb, color: shape.color, cov, born: now, life, fin, fout });
    return true;
  }

  /**
   * Advance the simulation to time `now` (seconds); `dt` is the elapsed time.
   * `maxSpawns` lets a slow renderer apply backpressure (e.g. watercolor sprites).
   */
  update(now, dt, maxSpawns = Infinity) {
    this.driftBackground(dt);
    this.alive = this.alive.filter(s => now - s.born < s.life);
    const strokes = this.mode === 'strokes';
    // Strokes keep a steady one-per-beat pace (also while filling); fade builds up faster at first.
    const rate = (this.density / this.lifetime) * (!strokes && this.alive.length < this.density * 0.9 ? 3 : 1);
    const maxPerFrame = Math.min(maxSpawns, strokes ? Math.max(1, Math.ceil(rate / 30)) : this.maxSpawnsPerFrame);
    this.spawnDebt = Math.min(this.spawnDebt + dt * rate, Math.max(1, maxPerFrame) * 2);
    let spawned = 0;
    while (this.spawnDebt >= 1 && spawned < maxPerFrame) {
      this.spawnDebt -= 1;
      if (this.spawn(now)) spawned++;
    }
    return spawned;
  }

  /** Draw at time `now` into the view rectangle (x, y, w, h); `ground: false` skips the background fill. */
  draw(ctx, x, y, w, h, now, { ground = true } = {}) {
    const X = v => x + (v + 1) * 0.5 * w;
    const Y = v => y + (v + 1) * 0.5 * h;
    const S = v => v * 0.5 * Math.min(w, h);
    ctx.save();
    ctx.globalAlpha = 1;
    if (ground) {
      ctx.fillStyle = this.background;
      ctx.fillRect(x, y, w, h);
    }
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    for (const s of this.alive) {
      const a = this.alpha(s, now) * this.opacity;
      if (a <= 0) continue;
      const sh = s.shape;
      ctx.globalAlpha = a;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      if (sh.type === 'rect') {
        const w = S(sh.width), h = S(sh.height);
        ctx.rect(X(sh.x) - w / 2, Y(sh.y) - h / 2, w, h);
      } else if (sh.type === 'circle') {
        ctx.arc(X(sh.x), Y(sh.y), Math.max(0.5, S(sh.diameter) * 0.5), 0, Math.PI * 2);
      } else {
        ctx.moveTo(X(sh.points[0][0]), Y(sh.points[0][1]));
        for (let i = 1; i < sh.points.length; i++) ctx.lineTo(X(sh.points[i][0]), Y(sh.points[i][1]));
        ctx.closePath();
      }
      ctx.fill();
    }
    ctx.restore();
  }

  /** Snapshot of the current picture as a Core DSL program (alpha baked into opacity). */
  toProgram(now) {
    const actions = [{ op: 'background', color: this.background }, { op: 'noStroke' }];
    for (const s of this.alive) {
      const a = this.alpha(s, now);
      if (a <= 0) continue;
      const sh = s.shape;
      actions.push({ op: 'fill', color: s.color, opacity: Math.round(a * 100) / 100 });
      if (sh.type === 'rect') actions.push({ op: 'rect', x: sh.x, y: sh.y, width: sh.width, height: sh.height });
      else if (sh.type === 'circle') actions.push({ op: 'circle', x: sh.x, y: sh.y, diameter: sh.diameter });
      else actions.push({ op: 'polygon', points: sh.points });
    }
    return { version: 1, actions };
  }
}
