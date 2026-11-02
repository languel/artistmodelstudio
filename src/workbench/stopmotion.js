/**
 * Stop motion: a board that photographs another board, a frame at a time. Its spec is its code (process/stopmotion.js); the
 * shots are Assets of kind "frame" (kept out of the Assets list's All view); the board shows the live source with the last frame
 * faintly over it (the onion skin), a shutter, and a strip of the frames. Play runs them at fps; the film can be saved to Assets
 * or downloaded as WebM, MP4 or GIF.
 */
import { boardsOf, boardById, boardKind, MAIN } from '../process/boards.js';
import { readStopmotion, writeStopmotion, rangeOf, changedPercent } from '../process/stopmotion.js';
import { encodeGif } from '../export/gif.js';
import { download } from './ui.js';

const MAX_FRAMES = 1500;                       // a recording stops here
const IDLE_MS = 2000;                          // on change: a recording ends when nothing has moved for this long
const SIG = 64;                                // a picture is compared as a SIG × SIG grey thumbnail
let probe = null;
/** A picture as a small grey thumbnail (to tell whether the source moved). */
function signature(img) {
  if (!probe) { probe = document.createElement('canvas'); probe.width = probe.height = SIG; probe.g = probe.getContext('2d', { willReadFrequently: true }); }
  probe.g.drawImage(img, 0, 0, SIG, SIG);
  const px = probe.g.getImageData(0, 0, SIG, SIG).data, out = new Uint8Array(SIG * SIG);
  for (let i = 0, j = 0; i < px.length; i += 4, j++) out[j] = (px[i] * 77 + px[i + 1] * 150 + px[i + 2] * 29) >> 8;
  return out;
}
const slug = s => String(s || 'stop-motion').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'stop-motion';

export class StopMotion {
  constructor(app) {
    this.app = app;
    this.st = new Map();        // board id → { at (null: live, else the frame shown), playing, timer, live (canvas), images (asset id → bitmap), urls }
  }

  state(id) {
    let s = this.st.get(id);
    if (!s) { s = { at: null, playing: false, timer: 0, live: null, images: new Map(), urls: new Map(), busy: false, error: '' }; this.st.set(id, s); }
    return s;
  }

  /** Is a board's sketch being recorded, or watched by a stop-motion board that is on screen? Then it keeps running off screen (see Outputs.wants). */
  pinned(id) {
    const now = performance.now();
    for (const s of this.st.values()) {
      if (s.rec?.srcId === id) return true;
      if (s.watch?.src === id && now - s.watch.at < 1500) return true;
    }
    return false;
  }

  spec(b) { try { return { sm: readStopmotion(b.code || ''), error: '' }; } catch (err) { return { sm: null, error: err.message }; } }

  /** The board a stop-motion board photographs (by title or id). */
  sourceOf(sm) {
    const doc = this.app.store.doc, list = boardsOf(doc);
    // (an id, or a title: a title may belong to a frame (a slide) and to the sketch inside it; the sketch is what is photographed)
    return list.find(x => x.id === sm.source) || list.filter(x => x.title === sm.source).sort((a, b) => (a.kind === 'frame') - (b.kind === 'frame'))[0] || null;
  }

  /** Change the spec through a function (its controls and the shutter write the board's code). */
  edit(id, fn) {
    const b = boardById(this.app.store.doc, id); if (!b) return;
    const { sm } = this.spec(b); if (!sm) return;
    fn(sm);
    this.app.store.updateBoard(id, { code: writeStopmotion(sm) });
  }

  // ---- seeing ----------------------------------------------------------------------------------------------------------
  /** The picture of a frame (a bitmap, kept). */
  async image(id, asset) {
    const s = this.state(id);
    if (s.images.has(asset)) return s.images.get(asset);
    const a = await this.app.assetStore.get(asset);
    if (!a?.blob) return null;
    const bmp = await createImageBitmap(a.blob);
    s.images.set(asset, bmp);
    return bmp;
  }

  /** A thumbnail address for the strip. */
  async url(id, asset) {
    const s = this.state(id);
    if (s.urls.has(asset)) return s.urls.get(asset);
    const a = await this.app.assetStore.get(asset);
    const u = a?.thumb || (a?.blob ? URL.createObjectURL(a.blob) : '');
    s.urls.set(asset, u);
    return u;
  }

  /** The source's picture now, kept as the live view. */
  async look(id) {
    const b = boardById(this.app.store.doc, id); if (!b) return null;
    const { sm } = this.spec(b); if (!sm) return null;
    const src = this.sourceOf(sm);
    if (!src || src.id === id) return null;
    const c = await this.app.boardOutput(src.id);
    this.state(id).live = c;
    return c;
  }

  // ---- shooting --------------------------------------------------------------------------------------------------------
  async shoot(id) {
    const s = this.state(id);
    if (s.busy || s.rec) return;
    const b = boardById(this.app.store.doc, id); if (!b) return;
    const { sm, error } = this.spec(b);
    if (!sm) { this.app.log(`Stop motion: ${error}`, 'error'); return; }
    const src = this.sourceOf(sm);
    if (!src) { this.app.log('Stop motion: choose the board to photograph (the menu on the board, or `source:` in its code).', 'error'); return; }
    s.busy = true;
    try {
      const c = await this.app.boardOutput(src.id);
      if (!c) throw new Error('the source shows nothing yet');
      const blob = await new Promise(ok => c.toBlob(ok, 'image/webp', 0.92));
      const n = sm.frames.length + 1;
      const a = await this.app.assetStore.add(blob, { title: `${b.title} ${String(n).padStart(3, '0')}`, kind: 'frame', folder: `Stop motion/${b.title}`, tags: ['frame', 'stop-motion'], meta: { board: b.title, source: src.title } });
      this.edit(id, m => { for (let i = 0; i < m.hold; i++) m.frames.push(a.id); });
      s.live = c;
      s.at = sm.advance ? null : sm.frames.length + sm.hold - 1;
      this.stop(id, false);
    } catch (err) { this.app.log(`Stop motion: ${err.message}`, 'error'); }
    s.busy = false;
    this.app.canvas.invalidate();
  }

  /** Take the last shot away (or the one shown). */
  async remove(id, index = null) {
    const b = boardById(this.app.store.doc, id); if (!b) return;
    const { sm } = this.spec(b); if (!sm || !sm.frames.length) return;
    const s = this.state(id);
    const at = index ?? (s.at != null ? s.at : sm.frames.length - 1), asset = sm.frames[at];
    this.edit(id, m => {                                     // (a shot held for several exposures goes whole)
      let i = at; while (i > 0 && m.frames[i - 1] === asset) i--;
      let j = at; while (j < m.frames.length - 1 && m.frames[j + 1] === asset) j++;
      const c = j - i + 1;
      m.frames.splice(i, c);
      if (m.in > j) m.in -= c; else if (m.in >= i) m.in = i;                     // (the range follows the frames)
      if (m.out != null) { if (m.out > j) m.out -= c; else if (m.out >= i) m.out = Math.max(0, i - 1); }
    });
    const left = this.spec(boardById(this.app.store.doc, id)).sm?.frames || [];
    if (!left.includes(asset)) { try { await this.app.assetStore.remove(asset); } catch { /* gone */ } s.images.delete(asset); }
    s.at = s.at == null || !left.length ? null : Math.min(left.length - 1, s.at);
    this.app.canvas.invalidate();
  }

  /** Move the shown frame (null: live). */
  go(id, to) {
    const b = boardById(this.app.store.doc, id); if (!b) return;
    const { sm } = this.spec(b); if (!sm) return;
    const s = this.state(id);
    s.at = to == null || to >= sm.frames.length ? null : Math.max(0, to);
    this.app.canvas.invalidate();
  }

  step(id, d) {
    const b = boardById(this.app.store.doc, id); if (!b) return;
    const { sm } = this.spec(b); if (!sm) return;
    const s = this.state(id), cur = s.at == null ? sm.frames.length : s.at;
    this.go(id, Math.max(0, Math.min(sm.frames.length, cur + d)));
  }

  // ---- playing ---------------------------------------------------------------------------------------------------------
  toggle(id) { const s = this.state(id); if (s.playing) this.stop(id); else this.play(id); }

  play(id) {
    const b = boardById(this.app.store.doc, id); if (!b) return;
    const { sm } = this.spec(b); if (!sm || !sm.frames.length) return;
    const s = this.state(id);
    clearTimeout(s.timer);
    s.playing = true;
    const [lo0, hi0] = rangeOf(sm);
    if (s.at == null || s.at < lo0 || s.at >= hi0) s.at = lo0;
    const tick = () => {
      const cur = boardById(this.app.store.doc, id), spec = cur && this.spec(cur).sm;
      if (!spec || !s.playing) return;
      const [lo, hi] = rangeOf(spec);
      s.at += 1;
      if (s.at > hi || s.at < lo) { if (spec.loop) s.at = lo; else { s.at = hi; s.playing = false; this.app.canvas.invalidate(); return; } }
      this.app.canvas.invalidate();
      s.timer = setTimeout(tick, 1000 / spec.fps);
    };
    s.timer = setTimeout(tick, 1000 / sm.fps);
    this.app.canvas.invalidate();
  }

  stop(id, redraw = true) { const s = this.state(id); clearTimeout(s.timer); s.playing = false; if (redraw) this.app.canvas.invalidate(); }

  // ---- range and trim ----------------------------------------------------------------------------------------------------
  /** Set where the film starts ('in') or ends ('out') to a frame (the one shown, when none is given). */
  mark(id, which, at = null) {
    const b = boardById(this.app.store.doc, id); if (!b) return;
    const { sm } = this.spec(b); if (!sm || !sm.frames.length) return;
    const s = this.state(id), n = sm.frames.length;
    const i = Math.max(0, Math.min(n - 1, at ?? (s.at == null ? n - 1 : s.at)));
    this.edit(id, m => {
      const [lo, hi] = rangeOf(m);
      if (which === 'in') { m.in = Math.min(i, hi); } else { m.out = Math.max(i, lo); if (m.out >= n - 1) m.out = null; }
    });
    this.app.canvas.invalidate();
  }

  clearRange(id) { this.edit(id, m => { m.in = 0; m.out = null; }); this.app.canvas.invalidate(); }

  /** Keep only the frames in the range. The pictures stay in Assets (Cmd+Z brings the list back). */
  trim(id) {
    const b = boardById(this.app.store.doc, id); if (!b) return;
    const { sm } = this.spec(b); if (!sm) return;
    const [lo, hi] = rangeOf(sm);
    if (lo === 0 && hi === sm.frames.length - 1) { this.app.log('Stop motion: the range is all of the frames; set an in or an out first (the bracket buttons).'); return; }
    this.stop(id, false);
    this.edit(id, m => { m.frames = m.frames.slice(lo, hi + 1); m.in = 0; m.out = null; });
    const s = this.state(id); s.at = null;
    this.app.log(`Trimmed to ${hi - lo + 1} frames. The others are still in Assets (Stop motion/${b.title}).`);
    this.app.canvas.invalidate();
  }

  // ---- recording -------------------------------------------------------------------------------------------------------
  /** The record button: arm (it waits for the source to move, then records), and stop. */
  record(id) {
    const s = this.state(id);
    if (s.rec) { this.endRecording(id); return; }
    if (s.busy || s.saving) return;
    const b = boardById(this.app.store.doc, id); if (!b) return;
    const { sm, error } = this.spec(b);
    if (!sm) { this.app.log(`Stop motion: ${error}`, 'error'); return; }
    const src = this.sourceOf(sm);
    if (!src || src.id === id) { this.app.log('Stop motion: choose the board to record (the menu on the board, or `source:` in its code).', 'error'); return; }
    this.stop(id, false);
    s.at = null;
    const rec = s.rec = { phase: 'armed', sm, srcId: src.id, base: null, last: null, count: 0, pending: [], due: 0, lastKeep: 0, ended: false, timer: 0, off: null, canvas: document.createElement('canvas') };
    const gap = 1000 / sm.fps;
    // one picture of the source: decide whether it starts the recording, and whether it is kept
    const sample = img => {
      if (rec.ended) return;
      const sig = signature(img), now = performance.now();
      if (rec.phase === 'armed') {
        if (!rec.base) { rec.base = sig; return; }
        if (changedPercent(rec.base, sig) < sm.change) return;
        rec.phase = 'recording'; rec.due = now; this.app.canvas.invalidate();
      }
      if (sm.record === 'change' && rec.count && now - rec.lastKeep > IDLE_MS) { this.endRecording(id, 'nothing moved'); return; }
      if (now < rec.due) return;
      if (sm.record === 'change' && rec.last && changedPercent(rec.last, sig) < sm.change) return;
      const w = img.width, h = img.height, c = rec.canvas;
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      c.getContext('2d').drawImage(img, 0, 0);
      rec.pending.push(new Promise(ok => c.toBlob(ok, 'image/webp', 0.9)));   // (the canvas is copied at this call, so it can be drawn on again at once)
      rec.last = sig; rec.lastKeep = now; rec.count++;
      rec.due = sm.record === 'change' ? now + gap : (now - rec.due > gap ? now + gap : rec.due + gap);
      if (!s.tapView) s.live = c;                        // (a board showing the source live keeps that, not the last kept frame)
      this.app.canvas.invalidate();
      if (rec.count >= MAX_FRAMES) this.endRecording(id, `${MAX_FRAMES} frames is the most in one recording`);
    };
    // (on change, a source that is paused sends no pictures at all, so the quiet is timed apart from them)
    rec.idle = setInterval(() => { if (sm.record === 'change' && rec.count && performance.now() - rec.lastKeep > IDLE_MS) this.endRecording(id, 'nothing moved'); }, 400);
    const kind = boardKind(src);
    if (kind === 'p5' || kind === 'three') {
      // A sketch is read where it runs. Armed, it is pinned (it runs off screen too, see pinned()), and is picked up as soon as it is there.
      const attach = () => {
        if (rec.ended) return;
        rec.off = this.app.frames?.tap(src.id, sample);
        if (!rec.off) { this.app.canvas.invalidate(); rec.timer = setTimeout(attach, 200); }
      };
      attach();
    } else {                                          // a drawing, a page: its picture, asked for twice a frame
      const every = Math.max(16, 500 / sm.fps);
      const loop = async () => {
        if (rec.ended) return;
        const t0 = performance.now();
        try { const c = await this.app.boardOutput(src.id); if (c) sample(c); } catch { /* try again */ }
        if (!rec.ended) rec.timer = setTimeout(loop, Math.max(0, every - (performance.now() - t0)));
      };
      loop();
    }
    this.app.log(`Stop motion: armed. Press play on “${src.title}”; recording starts when it moves${sm.record === 'change' ? ' and keeps what changes' : ` at ${sm.fps} frames a second`}.`);
    this.app.canvas.invalidate();
  }

  /** Stop recording and keep what was seen: the pictures become Assets and join the frames. */
  async endRecording(id, why = '') {
    const s = this.state(id), rec = s.rec;
    if (!rec || rec.ended) return;
    rec.ended = true; rec.off?.(); clearTimeout(rec.timer); clearInterval(rec.idle);
    s.rec = null;
    if (!rec.pending.length) { this.app.log('Stop motion: nothing was recorded.'); this.app.canvas.invalidate(); return; }
    s.saving = true; this.app.canvas.invalidate();
    try {
      const b = boardById(this.app.store.doc, id), sm = b && this.spec(b).sm;
      if (!sm) throw new Error('the board is gone');
      const blobs = await Promise.all(rec.pending), ids = [], n0 = sm.frames.length;
      const src = this.sourceOf(sm);
      for (let i = 0; i < blobs.length; i++) {
        if (!blobs[i]) continue;
        const a = await this.app.assetStore.add(blobs[i], { title: `${b.title} ${String(n0 + i + 1).padStart(3, '0')}`, kind: 'frame', folder: `Stop motion/${b.title}`, tags: ['frame', 'stop-motion'], meta: { board: b.title, source: src?.title || '' } });
        ids.push(a.id);
      }
      this.edit(id, m => { m.frames.push(...ids); });
      s.at = null;
      this.app.log(`Stop motion: recorded ${ids.length} frames (${(ids.length / sm.fps).toFixed(1)} s)${why ? `; stopped: ${why}` : ''}. Cmd+Z undoes it.`);
    } catch (err) { this.app.log(`Stop motion: ${err.message}`, 'error'); }
    s.saving = false;
    this.app.canvas.invalidate();
  }

  // ---- the film --------------------------------------------------------------------------------------------------------
  /** Draw each frame onto canvases of one size ('width' pixels wide at most). */
  async canvases(id, width) {
    const b = boardById(this.app.store.doc, id), { sm } = this.spec(b);
    const out = [];
    let W = 0, H = 0;
    const [lo, hi] = rangeOf(sm);
    for (const asset of sm.frames.slice(lo, hi + 1)) {
      const bmp = await this.image(id, asset); if (!bmp) continue;
      if (!W) { const k = Math.min(1, width / bmp.width); W = Math.round(bmp.width * k / 2) * 2; H = Math.round(bmp.height * k / 2) * 2; }
      const c = document.createElement('canvas'); c.width = W; c.height = H;
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.drawImage(bmp, 0, 0, W, H);
      out.push(c);
    }
    return out;
  }

  /** The film as a Blob: 'webm', 'mp4' or 'gif'. */
  async film(id, fmt) {
    const b = boardById(this.app.store.doc, id), { sm } = this.spec(b);
    if (!sm?.frames.length) throw new Error('There are no frames yet');
    if (fmt === 'gif') return { blob: encodeGif(await this.canvases(id, 480), { fps: sm.fps, loop: sm.loop }), ext: 'gif' };
    const frames = await this.canvases(id, 1280);
    const c = document.createElement('canvas'); c.width = frames[0].width; c.height = frames[0].height;
    const g = c.getContext('2d');
    const types = fmt === 'mp4' ? ['video/mp4;codecs=avc1.42E01E', 'video/mp4'] : ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mimeType = types.find(t => window.MediaRecorder?.isTypeSupported?.(t));
    if (!mimeType) throw new Error(`This browser cannot record ${fmt.toUpperCase()}: try WebM or GIF`);
    const stream = c.captureStream(sm.fps);
    const rec = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    rec.start(250);
    for (const f of frames) { g.drawImage(f, 0, 0); await new Promise(r => setTimeout(r, 1000 / sm.fps)); }   // a timer, not animation frames: it runs in a background tab
    g.drawImage(frames[frames.length - 1], 0, 0);
    await new Promise(r => setTimeout(r, 250));
    rec.stop();
    await done;
    return { blob: new Blob(chunks, { type: mimeType.split(';')[0] }), ext: mimeType.includes('mp4') ? 'mp4' : 'webm' };
  }

  /** Save the film to Assets or download it. */
  async save(id, fmt, to = 'assets') {
    const b = boardById(this.app.store.doc, id); if (!b) return;
    const s = this.state(id);
    s.error = ''; this.app.log(`Making the ${fmt.toUpperCase()}…`);
    try {
      const { blob, ext } = await this.film(id, fmt);
      const { sm } = this.spec(b);
      if (to === 'download') { download(blob, `${slug(b.title)}.${ext}`, blob.type); this.app.log(`“${b.title}” saved as ${slug(b.title)}.${ext}.`); return; }
      const a = await this.app.assetStore.add(blob, { title: `${b.title} (${ext})`, kind: 'import', folder: this.app.assetPanel?.folder || '', tags: ['stop-motion', ext], meta: { source: 'stop motion', fps: sm.fps, frames: rangeOf(sm)[1] - rangeOf(sm)[0] + 1 } });
      this.app.log(`Saved “${a.title}” to Assets.`);
    } catch (err) { this.app.log(`Stop motion: ${err.message}`, 'error'); }
  }
}
