/**
 * Masks and effects on boards, drawn. Everything here is opt-in: a board without a mask or effects never comes
 * near this file's work (the canvas asks `needs(board)` and draws it as it always did).
 *
 * A board with a mask (`maskWith`) or effects (`fx`) is composed into a canvas of its own: paper, the source under it
 * (with its own effects), its marks, then its effects, then the mask; and that picture is put on the canvas.
 * A mask is any source (a camera, a picture or clip from Assets, a board seen as a stream) or a board of marks;
 * its light (luma) or its alpha decides what shows; it has effects of its own (a threshold makes it hard-edged,
 * a gradient map recolors it) and a feather.
 *
 * What keeps it light: results are kept by a signature (the board's marks, the source's frame, the effects), so a
 * still board with a still source is composed once; effects and masks are computed at most FX_CAP pixels across
 * and drawn up; a run of point effects is one pass over the pixels (fx.js).
 */
import { boardsOf, findBoard, MAIN } from '../process/boards.js';
import { renderDocument } from '../process/render.js';
import { nextChange } from '../process/envelope.js';
import { compileFx, fxKey, runPoint, toMask, fxIsEmpty } from '../process/fx.js';

const FX_CAP = 900;     // longest side, in pixels, that effects are computed at
const MASK_CAP = 512;   // ... and masks (maskWith.res: more)
const PIC_CAP = 2048;   // ... and the picture of a board that has only a mask

const own = () => document.createElement('canvas');
const mix = (h, v) => Math.imul(h ^ (v | 0), 16777619) | 0;

export class Composer {
  constructor(app) {
    this.app = app;
    this.pictures = new Map();   // board (and variant) → { key, canvas }
    this.masks = new Map();      // board → { key, canvas }
    this.views = new Map();      // board → { key, canvas }: the source under it, with its effects
    this.compiled = new Map();   // effects signature → stages
    this.scratch = null;
    this.sigs = new Map();       // board id → what its marks are, as a number (this frame)
    this.anim = new Set();       // boards with a mark that is moving (this frame)
    this.stats = { composed: 0, masked: 0, ms: 0 };
  }

  hasFx(list) { return Array.isArray(list) && list.length > 0 && !fxIsEmpty(list); }
  /** Does the board have a mask or effects? (Nothing else here costs anything for a board that has none.) */
  needs(b) { return Boolean(b && (b.maskWith || this.hasFx(b.fx))); }

  compile(list) {
    const key = fxKey(list);
    let c = this.compiled.get(key);
    if (!c) { if (this.compiled.size > 64) this.compiled.clear(); c = compileFx(list); this.compiled.set(key, c); }
    return c;
  }

  /** Once a frame, before boards are composed: what each board's marks are (a number that changes when they do), and which are moving. */
  begin(doc, now) {
    this.sigs.clear(); this.anim.clear();
    for (const e of doc.elements) {
      const id = e.board || MAIN, p = e.points, n = p.length;
      let h = this.sigs.get(id) ?? 2166136261;
      h = mix(h, n); h = mix(h, (p[0]?.[0] ?? 0) * 64); h = mix(h, (p[0]?.[1] ?? 0) * 64); h = mix(h, (p[n - 1]?.[0] ?? 0) * 64); h = mix(h, (p[n >> 1]?.[1] ?? 0) * 64);
      const s = e.id; h = mix(h, s.length); h = mix(h, s.charCodeAt(s.length - 1)); h = mix(h, s.charCodeAt(s.length - 2) || 0); h = mix(h, s.charCodeAt(s.length - 3) || 0);
      if (e.color) h = mix(h, e.color.charCodeAt(1) * 131 + e.color.charCodeAt(e.color.length - 1));
      const params = e.realize?.params; if (params) for (const k in params) { const v = params[k]; if (typeof v === 'number') h = mix(h, v * 100); }
      this.sigs.set(id, h);
      if (e.time && nextChange(e.time, (now - (e.born ?? now)) / 1000) === 0) this.anim.add(id);
    }
  }
  sig(id) { return this.sigs.get(id) ?? 0; }

  // ---- pixels ----------------------------------------------------------------------------------------------

  scratchCanvas(w, h) { const c = (this.scratch ||= own()); if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } return c; }

  /** A canvas effect (blur, pixelate) on a canvas, in place. */
  canvasOp(c, st) {
    const w = c.width, h = c.height, ctx = c.getContext('2d'), t = this.scratchCanvas(w, h), tc = t.getContext('2d');
    tc.setTransform(1, 0, 0, 1, 0, 0); tc.clearRect(0, 0, w, h);
    if (st.op === 'blur') {
      if (!('filter' in tc) || !(st.radius > 0)) return;
      tc.filter = `blur(${st.radius}px)`; tc.drawImage(c, 0, 0); tc.filter = 'none';
    } else {
      const k = Math.max(1, Math.round(st.size)), sw = Math.max(1, Math.ceil(w / k)), sh = Math.max(1, Math.ceil(h / k));
      tc.imageSmoothingEnabled = true; tc.drawImage(c, 0, 0, sw, sh);
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h); ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, sw, sh, 0, 0, sw * k, sh * k); ctx.restore();
      return;
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, h); ctx.drawImage(t, 0, 0); ctx.restore();
  }

  /** Effects over a canvas, in place; `finish(pixels)` last (a mask's alpha comes from it). One read and one write for a run of point effects. */
  runStack(c, stages, finish = null) {
    const ctx = c.getContext('2d', { willReadFrequently: true }), w = c.width, h = c.height;
    let img = null;
    const put = () => { if (img) { ctx.putImageData(img, 0, 0); img = null; } };
    for (const st of stages) {
      if (st.t === 'canvas') { put(); this.canvasOp(c, st); continue; }
      img ||= ctx.getImageData(0, 0, w, h);
      runPoint(st, img.data);
    }
    if (finish) { img ||= ctx.getImageData(0, 0, w, h); finish(img.data); }
    put();
  }

  // ---- the source under a board ---------------------------------------------------------------------------

  /** What to draw under a board: its source, with the source's effects when it has any (kept while the frame and the effects are the same). */
  underlay(b) {
    if (!b.source || (b.sourceOpacity ?? 0.5) <= 0) return null;
    const view = this.app.sources?.view(b.source);
    if (!view?.width) return null;
    if (!this.hasFx(b.sourceFx)) return view;
    const key = `${this.app.sources.stamp(b.source)}|${fxKey(b.sourceFx)}`;
    let e = this.views.get(b.id);
    if (!e || e.key !== key) {
      const k = Math.min(1, FX_CAP / Math.max(view.width, view.height)), c = e?.canvas || own();
      c.width = Math.max(1, Math.round(view.width * k)); c.height = Math.max(1, Math.round(view.height * k));
      c.getContext('2d').drawImage(view, 0, 0, c.width, c.height);
      this.runStack(c, this.compile(b.sourceFx).stages);
      e = { key, canvas: c }; this.views.set(b.id, e);
    }
    return e.canvas;
  }

  /** The underlay drawn on a board's local canvas (pixels per unit: s). */
  paintUnderlay(ctx, b, img, s) {
    const k = (b.sourceFit === 'contain' ? Math.min : Math.max)(b.width / img.width, b.height / img.height), w = img.width * k, h = img.height * k;
    ctx.save();
    ctx.globalAlpha = b.sourceOpacity ?? 0.5;
    if (b.sourceBlend && b.sourceBlend !== 'normal') ctx.globalCompositeOperation = b.sourceBlend;
    ctx.drawImage(img, (b.width - w) / 2 * s, (b.height - h) / 2 * s, w * s, h * s);
    ctx.restore();
  }

  // ---- masks ----------------------------------------------------------------------------------------------

  /** What the mask depends on, as text (so that a mask is made again only when it must be). */
  maskKey(b, o) {
    const m = b.maskWith;
    let src = '';
    if (m.source) src = this.app.sources.stamp(m.source);
    else if (m.board) { const t = findBoard(o.doc, m.board); src = t ? `${this.sig(t.id)}${this.anim.has(t.id) ? `.${Math.floor(o.now / 40)}` : ''}${t.maskWith || this.hasFx(t.fx) ? '*' : ''}` : '-'; }
    return `${m.source || m.board}|${m.mode}|${m.invert ? 1 : 0}|${m.feather || 0}|${m.fit || ''}|${m.res || ''}|${fxKey(m.fx)}|${src}`;
  }

  /**
   * The mask of a board: a canvas whose alpha says what shows (from the mask's light or its alpha), or null
   * (the board is not masked: a mask whose source is missing lets everything show).
   */
  maskCanvas(b, o, W, H) {
    const m = b.maskWith, mode = m.mode === 'alpha' ? 'alpha' : 'luma';
    const k = Math.min(1, Math.min(1024, Math.max(128, Number(m.res) || MASK_CAP)) / Math.max(W, H)), mw = Math.max(1, Math.round(W * k)), mh = Math.max(1, Math.round(H * k));
    const key = `${this.maskKey(b, o)}|${mw}x${mh}`;
    let e = this.masks.get(b.id);
    if (e?.key === key) return e.canvas;
    let img = null, stretch = false;
    if (m.source) { const v = this.app.sources?.view(m.source); if (v?.width) img = v; }
    else if (m.board) {
      const t = findBoard(o.doc, m.board);
      if (t && t.id !== b.id && !(o.chain || []).includes(t.id) && (o.chain || []).length < 3) {
        img = this.compose(t, { ...o, scale: mw / t.width, transparent: true, chain: [...(o.chain || []), b.id] });
        stretch = true;
      }
    }
    if (!img?.width) return null;
    const c = e?.canvas || own();
    c.width = mw; c.height = mh;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, mw, mh);
    if (stretch) ctx.drawImage(img, 0, 0, mw, mh);
    else {
      const f = (m.fit === 'contain' ? Math.min : Math.max)(mw / img.width, mh / img.height), w = img.width * f, h = img.height * f;
      ctx.drawImage(img, (mw - w) / 2, (mh - h) / 2, w, h);
    }
    // Its effects, then its light or alpha as the mask, then a feather.
    this.runStack(c, this.hasFx(m.fx) ? this.compile(m.fx).stages : [], px => toMask(px, mode, Boolean(m.invert)));
    if (m.feather > 0) this.canvasOp(c, { t: 'canvas', op: 'blur', radius: m.feather * k });
    e = { key, canvas: c };
    this.masks.set(b.id, e);
    this.stats.masked++;
    return c;
  }

  // ---- the board's picture ---------------------------------------------------------------------------------

  /**
   * A board (with its mask and effects) as a canvas: { doc, scale (pixels per unit), now, mode, transparent (no paper: for a
   * board used as a mask), chain }. The same canvas comes back while nothing it depends on has changed. The picture before
   * the mask (paper, source, marks, effects) is kept apart from the masked one, so a moving mask over a still board only
   * costs the mask and one copy.
   */
  compose(b, o) {
    const fxOn = this.hasFx(b.fx);
    const k = Math.min(1, (fxOn ? FX_CAP : PIC_CAP) / Math.max(1, Math.max(b.width, b.height) * o.scale)), s = o.scale * k;
    const W = Math.max(1, Math.round(b.width * s)), H = Math.max(1, Math.round(b.height * s));
    const under = b.source ? this.app.sources.stamp(b.source) : '';
    const baseKey = [this.sig(b.id), this.anim.has(b.id) ? Math.floor(o.now / 40) : '', W, H, o.transparent ? 't' : '', o.mode, under, fxKey(b.fx), b.ground, b.source ? `${b.sourceOpacity}${b.sourceBlend}${b.sourceFit}${fxKey(b.sourceFx)}` : ''].join('|');
    const slot = o.transparent ? `${b.id}:t` : b.id;
    // The picture before the mask.
    let base = this.pictures.get(`${slot}#b`);
    if (base?.key !== baseKey) {
      const t0 = performance.now();
      const c = base?.canvas || own();
      if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
      const ctx = c.getContext('2d');
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H);
      if (!o.transparent) { ctx.fillStyle = b.ground || '#ffffff'; ctx.fillRect(0, 0, W, H); const u = this.underlay(b); if (u) this.paintUnderlay(ctx, b, u, s); }
      const marks = o.doc.elements.filter(x => (x.board || MAIN) === b.id);
      if (marks.length) renderDocument(ctx, { ...o.doc, elements: marks }, { mode: o.mode || 'picture', transform: { x: -b.x * s, y: -b.y * s, scale: s }, ground: false, screenNotes: true, now: o.now });
      if (fxOn) this.runStack(c, this.compile(b.fx).stages);
      base = { key: baseKey, canvas: c };
      this.pictures.set(`${slot}#b`, base);
      this.stats.composed++; this.stats.ms += performance.now() - t0;
    }
    if (!b.maskWith) return base.canvas;
    // Through the mask.
    const key = `${baseKey}|${this.maskKey(b, o)}`;
    let out = this.pictures.get(slot);
    if (out?.key === key) return out.canvas;
    const t1 = performance.now();
    const mask = this.maskCanvas(b, o, W, H);
    if (!mask) return base.canvas;   // no mask to be had: the board shows as it is
    const c = out?.canvas || own();
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    const ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; ctx.clearRect(0, 0, W, H);
    ctx.drawImage(base.canvas, 0, 0);
    ctx.globalCompositeOperation = 'destination-in'; ctx.drawImage(mask, 0, 0, W, H); ctx.globalCompositeOperation = 'source-over';
    out = { key, canvas: c };
    this.pictures.set(slot, out);
    this.stats.ms += performance.now() - t1;
    return c;
  }

  /** Give back what is kept for boards that are gone, or no longer masked or affected (called now and then). */
  sweep(doc) {
    const live = new Map(boardsOf(doc).map(b => [b.id, b]));
    for (const id of [...this.pictures.keys()]) { const plain = id.replace(/#b$/, ''), b = live.get(plain.replace(/:t$/, '')); if (!b || (!plain.endsWith(':t') && !this.needs(b))) this.pictures.delete(id); }
    for (const id of [...this.masks.keys()]) if (!live.get(id)?.maskWith) this.masks.delete(id);
    for (const id of [...this.views.keys()]) if (!this.hasFx(live.get(id)?.sourceFx)) this.views.delete(id);
  }
}
