/**
 * Sources: the project's named streams (a camera, an image or video from Assets, an animated image),
 * shared by every scene and board, reached from code by name: source('cam').
 *
 * Each source is sampled (continuous: every frame; interval: every N seconds; hold: once) into a
 * small frame that samplers read. Pose, hands and a person mask are computed from the sampled frame
 * when code asks for them (MediaPipe, loaded on demand), and kept for the next frames.
 *
 * The list (names, kinds, sampling) is kept in the browser; media comes back from Assets or the
 * camera when the app starts.
 */
import { LiveSource, SourceSampler } from '../fitting/referenceSource.js';
import { setSourceProvider } from '../process/streams.js';
import { bodyFrom, expressionsOf } from '../process/gestures.js';
import { isVideoUrl } from './mediaUrl.js';
import { boardLive } from './boardSource.js';

const KEY = 'ams_sources_v1';
const SAMPLE = 256;   // the sampled frame's long side (what code reads)

export class Sources {
  constructor(app) {
    this.app = app;
    this.entries = new Map();   // name → runtime { def, live, still, frame (canvas), data, version, samples, landmarks }
    this.listeners = new Set();
    this.keep = new Map();      // name → kinds of landmarks something outside code needs (gestures)
    try { this.defs = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { this.defs = []; }
    setSourceProvider((name, rect, fit) => this.sampler(name, rect, fit));
    this.last = performance.now();
    // A timer, not rAF: sources keep sampling in a background tab (a live board keeps redrawing).
    this.timer = setInterval(() => this.tick(), 33);
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(name) { for (const f of this.listeners) { try { f(name); } catch (err) { console.error(err); } } }
  save() { try { localStorage.setItem(KEY, JSON.stringify(this.defs)); } catch { /* ignore */ } this.emit(null); }
  get list() { return this.defs; }
  def(name) { return this.defs.find(d => d.name === name); }

  /** Start every listed source (cameras ask the browser for permission). */
  async startAll() { for (const d of this.defs.filter(d => !d.lazy)) await this.start(d).catch(err => this.app.log(`Source “${d.name}”: ${err.message}`, 'error')); }

  uniqueName(base) { let n = base, i = 2; while (this.def(n)) n = `${base}${i++}`; return n; }

  /** Resolves when the named sources have a sampled frame (or after `timeout` ms). */
  async whenReady(names = this.defs.map(d => d.name), timeout = 20000) {
    const t0 = performance.now();
    while (performance.now() - t0 < timeout) {
      if (names.every(n => !this.def(n) || this.def(n).lazy && !this.entries.has(n) || this.entries.get(n)?.data)) return true;
      await new Promise(r => setTimeout(r, 100));
    }
    return false;
  }

  /** Whether a source is paused (nothing live needs it). */
  paused(name) { return Boolean(this.entries.get(name)?.paused); }

  /** Add a source: { kind: 'camera' } or { kind: 'asset', assetId }. Returns its name. */
  async add({ kind, assetId, name, sampling = 'continuous', interval = 2, url, mediaKind, meta, lazy = false, boardId }) {
    const asset = kind === 'asset' ? await this.app.assetStore.get(assetId) : null;
    if (kind === 'asset' && !asset) throw new Error('No such asset');
    const d = { name: this.uniqueName(name || (kind === 'camera' ? 'cam' : String(asset?.title || 'source').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'source')), kind, ...(assetId ? { assetId } : {}), ...(boardId ? { boardId } : {}), ...(url ? { url, mediaKind, ...(meta ? { meta } : {}) } : {}), ...(lazy ? { lazy: true } : {}), sampling, interval };
    this.defs.push(d);
    this.save();
    if (lazy) return d.name;   // a lazy stream starts when a board that shows it is on screen and big enough (see wake)
    try { await this.start(d); } catch (err) { this.remove(d.name); throw err; }   // (an address that does not work leaves nothing behind)
    return d.name;
  }

  remove(name) {
    this.entries.get(name)?.live?.stop?.();
    this.entries.delete(name);
    this.defs = this.defs.filter(d => d.name !== name);
    this.save();
  }

  rename(name, to) {
    const d = this.def(name);
    if (!d || !to || this.def(to)) return;
    const e = this.entries.get(name);
    d.name = to;
    if (e) { this.entries.delete(name); this.entries.set(to, e); }
    this.save();
  }

  update(name, patch) {
    const d = this.def(name);
    if (!d) return;
    Object.assign(d, patch);
    const e = this.entries.get(name);
    if (e) e.sampler = new SourceSampler({ mode: d.sampling, interval: d.interval });
    if (e && ('loop' in patch || 'in' in patch || 'out' in patch)) { e.live?.setLoop?.(d.loop); e.live?.setRange?.(d.in, d.out); }
    if (e && 'volume' in patch) e.live?.setVolume?.(d.volume ?? 0);
    if (e && 'speed' in patch) e.live?.setRate?.(d.speed ?? 1);   // playback speed: a GIF or video only (a camera is live)
    this.save();
  }

  async start(d) {
    if (this.entries.get(d.name)?.ready) return;
    const e = { def: d, frame: document.createElement('canvas'), data: null, version: 0, landmarks: {}, want: new Map(), busy: false, sampler: new SourceSampler({ mode: d.sampling, interval: d.interval }) };
    this.entries.set(d.name, e);
    if (d.kind === 'camera') e.live = await LiveSource.webcam();
    else if (d.kind === 'board') e.live = boardLive(this.app, d.boardId);   // a board's picture, live
    else if (d.kind === 'url' && isVideoUrl(d)) e.live = await LiveSource.video(d.url, { crossOrigin: true });   // streamed
    else {
      const a = d.kind === 'url' ? { blob: await fetch(d.url).then(r => { if (!r.ok) throw new Error(`The address answered ${r.status}`); return r.blob(); }) } : await this.app.assetStore.get(d.assetId);
      if (!a?.blob) throw new Error('its asset is gone');
      if (a.blob.type.startsWith('video/')) e.live = await LiveSource.video(URL.createObjectURL(a.blob));
      else {
        e.live = await LiveSource.animated(a.blob).catch(() => null);
        if (!e.live) {
          const img = new Image();
          img.src = URL.createObjectURL(a.blob);
          await img.decode();
          e.still = document.createElement('canvas');
          const k = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
          e.still.width = Math.round(img.naturalWidth * k); e.still.height = Math.round(img.naturalHeight * k);
          e.still.getContext('2d').drawImage(img, 0, 0, e.still.width, e.still.height);
        }
      }
    }
    e.live?.setRate?.(d.speed ?? 1);
    e.live?.setVolume?.(d.volume ?? 0);   // muted unless raised
    // A clip cut from a long film waits at its in point (a paused first frame there).
    const vd = e.live?.video?.duration;
    if (vd && d.in > 0) e.live.video.currentTime = d.in * vd;
    if (e.live) { e.live.setLoop(d.loop); e.live.setRange(d.in, d.out); e.live.onEnd = () => { if ((this.def(d.name)?.speed ?? 1) > 0) this.update(d.name, { speed: 0 }); }; }   // stopping at the end reads as paused
    e.ready = true;
    this.sample(e);
  }

  /** New frames per second over the last few (for the performance readout). */
  fps(name) {
    const now = performance.now(), t = (this.entries.get(name)?.times || []).filter(x => now - x < 3000);
    return t.length / 3;
  }

  /** Start a lazy stream now. */
  wake(d) {
    (this.waking ||= new Set()).add(d.name);
    this.start(d).catch(err => { this.app.log(`Source “${d.name}”: ${err.message}`, 'error'); this.entries.delete(d.name); d.lazy = 'failed'; }).finally(() => { this.waking.delete(d.name); this.emit(null); });
  }

  /** The current full-size frame (for underlays and previews). */
  view(name) { const e = this.entries.get(name); return e?.live?.canvas || e?.still || null; }

  tick() {
    const now = performance.now(), dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    // Nothing is sampled while the page is hidden (another tab, the pane closed): no one sees it,
    // and hours of sampling and detection in the background wear out the GPU.
    if (document.hidden) return;
    let changed = false;
    // Lazy streams (from a list of clips) start only when a board showing them is on screen and big enough.
    for (const d of this.defs) if (d.lazy === true && !this.entries.has(d.name) && this.lazyWanted?.(d.name) && !this.waking?.has(d.name)) this.wake(d);
    // ...and lets go again after half a minute unseen (the stream is closed; it starts again at its in point when wanted).
    for (const d of this.defs) {
      const e = d.lazy === true && this.entries.get(d.name);
      if (!e?.ready) continue;
      if (!e.paused) { e.idleSince = 0; continue; }
      e.idleSince ||= now;
      if (now - e.idleSince > 30000) { e.live?.stop?.(); this.entries.delete(d.name); this.emit(null); }
    }
    for (const e of this.entries.values()) {
      if (!e.ready || !e.live) continue;
      // Paused while nothing live needs it (this.wanted, set by the app): it keeps its last frame.
      const kept = this.keep.get(e.def.name);
      if (kept) for (const k of kept) e.want.set(k, now);
      const want = Boolean(kept?.size) || (this.wanted ? this.wanted(e.def.name) : true);
      if (Boolean(e.paused) === want) { e.paused = !want; changed = true; }
      if (!want) continue;
      e.live.tick(dt);
      if (e.sampler.due(e.live, dt)) this.sample(e);
    }
    if (changed) this.emit(null);
  }

  /** Take a sampled frame: a small copy code reads; landmarks for it when asked for. */
  sample(e) {
    const src = e.live?.canvas || e.still;
    if (!src?.width) return;
    const k = Math.min(1, SAMPLE / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
    if (e.frame.width !== w || e.frame.height !== h) { e.frame.width = w; e.frame.height = h; }
    const ctx = e.frame.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, w, h);
    e.data = ctx.getImageData(0, 0, w, h).data;
    e.version++;
    (e.times ||= []).push(performance.now()); if (e.times.length > 200) e.times.shift();
    this.detect(e);
    this.emit(e.def.name);
  }

  /** Pose, hands, mask for the latest sample (one detection at a time; results stay until replaced). */
  async detect(e) {
    // Landmarks only while code asked for them a moment ago (a board that stopped reading pose
    // no longer costs a model run per frame).
    const now = performance.now();
    for (const [kind, at] of e.want) if (now - at > 2000) e.want.delete(kind);
    // One detection at a time; one that never answers (a lost GPU context) is given up after 5 s.
    if ((e.busy && now - e.busyAt < 5000) || !e.want.size) return;
    e.busy = true; e.busyAt = now;
    try {
      const { detectRaw } = await import('../perception/mediapipe.js');
      const img = e.live?.canvas || e.still;
      // A video or camera is tracked (video mode: steadier, timestamps that only increase). An animated
      // picture loops and jumps back, which throws a tracker off, so each frame is its own image
      // (the full model); a still is one image.
      const tracked = e.live && e.live.kind !== 'animated';
      const opts = tracked ? { stream: e.id || (e.id = `s${Math.random().toString(36).slice(2, 8)}`), t: (e.t = Math.max((e.t || 0) + 1, Math.round(performance.now()))) } : { full: true };
      for (const kind of [...e.want.keys()]) {
        const r = await detectRaw(kind, img, opts), now = performance.now();
        // A frame where the model finds nobody, just after one where it did, is usually a miss:
        // the last answer is kept for a moment (people who really leave go after half a second).
        const empty = !r || (Array.isArray(r) && !r.length);
        if (!empty) { e.landmarks[kind] = r; (e.foundAt ||= {})[kind] = now; }
        else if (now - (e.foundAt?.[kind] || 0) > 600) e.landmarks[kind] = r;
      }
      e.landmarkVersion = e.version; e.landmarkAt = performance.now();
      this.emit(e.def.name);
    } catch (err) {
      if (!e.warned) { e.warned = true; this.app.log(`Landmarks for “${e.def.name}”: ${err.message}`, 'error'); }
    } finally { e.busy = false; }
  }

  /**
   * The person in a source, as a body (see process/gestures.js): named points in the source's pixels.
   * Null until its pose or hands have been found once.
   */
  body(name) {
    const e = this.entries.get(name);
    if (!e || (!e.landmarks.pose && !e.landmarks.hands && !e.landmarks.face)) return null;
    const img = e.live?.canvas || e.still;
    return bodyFrom({ face: e.landmarks.face?.[0] || null, pose: e.landmarks.pose?.[0] || null, hands: (e.landmarks.hands || []).map(p => ({ points: p, label: p.label })), width: img?.width || 1, height: img?.height || 1, mirrored: Boolean(e.def.mirrored), t: e.landmarkAt || performance.now() });
  }

  /** A sampler for code (see src/process/streams.js), fitted (cover) to a rectangle in world units. */
  sampler(name, rect, fit = 'cover') {
    const e = this.entries.get(name);
    if (!e?.data) return null;
    const sw = e.frame.width, sh = e.frame.height, data = e.data;
    const ra = rect.width / rect.height, sa = sw / sh;
    // Rect fraction → source fraction. cover: the source fills the rect, cropped; contain: all of it, letterboxed.
    const wide = fit === 'contain' ? sa < ra : sa > ra;
    const toSrc = (fx, fy) => (wide ? [0.5 + (fx - 0.5) * (ra / sa), fy] : [fx, 0.5 + (fy - 0.5) * (sa / ra)]);
    const toRect = (u, v) => (wide ? [0.5 + (u - 0.5) / (ra / sa), v] : [u, 0.5 + (v - 0.5) / (sa / ra)]);
    const rgb = (fx, fy) => {
      const [u, v] = toSrc(fx, fy);
      if (u < 0 || u > 1 || v < 0 || v > 1) return [0, 0, 0];   // outside the picture (contain): black
      const x = Math.max(0, Math.min(sw - 1, Math.floor(u * sw))), y = Math.max(0, Math.min(sh - 1, Math.floor(v * sh)));
      const i = (y * sw + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const hex = c => `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
    const lum = c => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    const world = (x, y) => [(x - rect.x) / rect.width, (y - rect.y) / rect.height];
    const land = kind => { e.want.set(kind, performance.now()); if (!e.landmarks[kind] && !e.busy) this.detect(e); return e.landmarks[kind]; };
    return {
      ready: true, name, frame: e.version, width: e.live?.canvas?.width || e.still?.width || sw, height: e.live?.canvas?.height || e.still?.height || sh, rect,
      rgb, color: (x, y) => hex(rgb(x, y)), value: (x, y) => lum(rgb(x, y)),
      colorAt: (x, y) => hex(rgb(...world(x, y))), valueAt: (x, y) => lum(rgb(...world(x, y))),
      get pose() { return (land('pose') || []).map(p => p.map(q => { const [x, y] = toRect(q.x, q.y); return { x, y, v: q.v }; })); },
      get hands() { return (land('hands') || []).map(p => p.map(q => { const [x, y] = toRect(q.x, q.y); return { x, y }; })); },
      // Faces: { points: [{ x, y, z }] × 478, blend: { jawOpen, mouthSmileLeft… 0..1 }, box: { x0, y0, x1, y1 } } (fractions of the rect).
      get face() {
        return (land('face') || []).map(f => {
          const points = f.points.map(q => { const [x, y] = toRect(q.x, q.y); return { x, y, z: q.z }; });
          const xs = points.map(q => q.x), ys = points.map(q => q.y);
          return { points, blend: expressionsOf(f.shapes), box: { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) } };
        });
      },
      // Any tracker by name: track('pose' | 'hands' | 'face'); the same as the getters above.
      track(kind) { return kind === 'pose' ? this.pose : kind === 'hands' ? this.hands : kind === 'face' ? this.face : kind === 'mask' ? this.mask : (() => { throw new Error(`No tracker “${kind}” (pose, hands, face, mask)`); })(); },
      // A named point of the person (nose, left.pinky…; see process/gestures.js), and gestures that fired.
      point: n => { land('pose'); land('hands'); const b = this.body(name), p = b?.point(n); if (!p) return null; const [x, y] = toRect(p.x / b.width, p.y / b.height); return { x, y }; },
      fired: (g, ms) => Boolean(this.app.gestures?.recent(g, ms)),
      mask: (fx, fy) => {
        const m = land('mask');
        if (!m) return 0;
        const [u, v] = toSrc(fx, fy);
        return m.data[Math.max(0, Math.min(m.h - 1, Math.floor(v * m.h))) * m.w + Math.max(0, Math.min(m.w - 1, Math.floor(u * m.w)))] || 0;
      },
      pixels: (w, h) => {
        const out = new Float32Array(w * h * 3);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = rgb((x + 0.5) / w, (y + 0.5) / h); const i = (y * w + x) * 3; out[i] = c[0]; out[i + 1] = c[1]; out[i + 2] = c[2]; }
        return out;
      }
    };
  }
}
