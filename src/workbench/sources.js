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

const KEY = 'ams_sources_v1';
const SAMPLE = 256;   // the sampled frame's long side (what code reads)

export class Sources {
  constructor(app) {
    this.app = app;
    this.entries = new Map();   // name → runtime { def, live, still, frame (canvas), data, version, samples, landmarks }
    this.listeners = new Set();
    try { this.defs = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { this.defs = []; }
    setSourceProvider((name, rect) => this.sampler(name, rect));
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
  async startAll() { for (const d of this.defs) await this.start(d).catch(err => this.app.log(`Source “${d.name}”: ${err.message}`, 'error')); }

  uniqueName(base) { let n = base, i = 2; while (this.def(n)) n = `${base}${i++}`; return n; }

  /** Add a source: { kind: 'camera' } or { kind: 'asset', assetId }. Returns its name. */
  async add({ kind, assetId, name, sampling = 'continuous', interval = 2 }) {
    const asset = kind === 'asset' ? await this.app.assetStore.get(assetId) : null;
    if (kind === 'asset' && !asset) throw new Error('No such asset');
    const d = { name: this.uniqueName(name || (kind === 'camera' ? 'cam' : String(asset.title || 'source').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'source')), kind, ...(assetId ? { assetId } : {}), sampling, interval };
    this.defs.push(d);
    this.save();
    await this.start(d);
    return d.name;
  }

  remove(name) {
    this.entries.get(name)?.live?.stop();
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
    this.save();
  }

  async start(d) {
    if (this.entries.get(d.name)?.ready) return;
    const e = { def: d, frame: document.createElement('canvas'), data: null, version: 0, landmarks: {}, want: new Set(), busy: false, sampler: new SourceSampler({ mode: d.sampling, interval: d.interval }) };
    this.entries.set(d.name, e);
    if (d.kind === 'camera') e.live = await LiveSource.webcam();
    else {
      const a = await this.app.assetStore.get(d.assetId);
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
    e.ready = true;
    this.sample(e);
  }

  /** The current full-size frame (for underlays and previews). */
  view(name) { const e = this.entries.get(name); return e?.live?.canvas || e?.still || null; }

  tick() {
    const now = performance.now(), dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    for (const e of this.entries.values()) {
      if (!e.ready || !e.live) continue;
      e.live.tick(dt);
      if (e.sampler.due(e.live, dt)) this.sample(e);
    }
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
    this.detect(e);
    this.emit(e.def.name);
  }

  /** Pose, hands, mask for the latest sample (one detection at a time; results stay until replaced). */
  async detect(e) {
    if (e.busy || !e.want.size) return;
    e.busy = true;
    try {
      const { detectRaw } = await import('../perception/mediapipe.js');
      const img = e.live?.canvas || e.still;
      for (const kind of e.want) e.landmarks[kind] = await detectRaw(kind, img);
      e.landmarkVersion = e.version;
      this.emit(e.def.name);
    } catch (err) {
      if (!e.warned) { e.warned = true; this.app.log(`Landmarks for “${e.def.name}”: ${err.message}`, 'error'); }
    } finally { e.busy = false; }
  }

  /** A sampler for code (see src/process/streams.js), fitted (cover) to a rectangle in world units. */
  sampler(name, rect) {
    const e = this.entries.get(name);
    if (!e?.data) return null;
    const sw = e.frame.width, sh = e.frame.height, data = e.data;
    const ra = rect.width / rect.height, sa = sw / sh;
    // Rect fraction → source fraction (cover: the source fills the rect, cropped).
    const toSrc = (fx, fy) => (sa > ra ? [0.5 + (fx - 0.5) * (ra / sa), fy] : [fx, 0.5 + (fy - 0.5) * (sa / ra)]);
    const toRect = (u, v) => (sa > ra ? [0.5 + (u - 0.5) / (ra / sa), v] : [u, 0.5 + (v - 0.5) / (sa / ra)]);
    const rgb = (fx, fy) => {
      const [u, v] = toSrc(fx, fy);
      const x = Math.max(0, Math.min(sw - 1, Math.floor(u * sw))), y = Math.max(0, Math.min(sh - 1, Math.floor(v * sh)));
      const i = (y * sw + x) * 4;
      return [data[i], data[i + 1], data[i + 2]];
    };
    const hex = c => `#${c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
    const lum = c => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    const world = (x, y) => [(x - rect.x) / rect.width, (y - rect.y) / rect.height];
    const land = kind => { e.want.add(kind); if (!e.landmarks[kind] && !e.busy) this.detect(e); return e.landmarks[kind]; };
    return {
      ready: true, name, frame: e.version, width: e.live?.canvas?.width || e.still?.width || sw, height: e.live?.canvas?.height || e.still?.height || sh, rect,
      rgb, color: (x, y) => hex(rgb(x, y)), value: (x, y) => lum(rgb(x, y)),
      colorAt: (x, y) => hex(rgb(...world(x, y))), valueAt: (x, y) => lum(rgb(...world(x, y))),
      get pose() { return (land('pose') || []).map(p => p.map(q => { const [x, y] = toRect(q.x, q.y); return { x, y, v: q.v }; })); },
      get hands() { return (land('hands') || []).map(p => p.map(q => { const [x, y] = toRect(q.x, q.y); return { x, y }; })); },
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
