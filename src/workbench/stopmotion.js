/**
 * Stop motion: a board that photographs another board, a frame at a time. Its spec is its code (process/stopmotion.js); the
 * shots are Assets of kind "frame" (kept out of the Assets list's All view); the board shows the live source with the last frame
 * faintly over it (the onion skin), a shutter, and a strip of the frames. Play runs them at fps; the film can be saved to Assets
 * or downloaded as WebM, MP4 or GIF.
 */
import { boardsOf, boardById, boardKind, MAIN } from '../process/boards.js';
import { readStopmotion, writeStopmotion } from '../process/stopmotion.js';
import { encodeGif } from '../export/gif.js';
import { download } from './ui.js';

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
    if (s.busy) return;
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
      m.frames.splice(i, j - i + 1);
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
    if (s.at == null || s.at >= sm.frames.length - 1) s.at = 0;
    const tick = () => {
      const cur = boardById(this.app.store.doc, id), spec = cur && this.spec(cur).sm;
      if (!spec || !s.playing) return;
      s.at += 1;
      if (s.at >= spec.frames.length) { if (spec.loop) s.at = 0; else { s.at = spec.frames.length - 1; s.playing = false; this.app.canvas.invalidate(); return; } }
      this.app.canvas.invalidate();
      s.timer = setTimeout(tick, 1000 / spec.fps);
    };
    s.timer = setTimeout(tick, 1000 / sm.fps);
    this.app.canvas.invalidate();
  }

  stop(id, redraw = true) { const s = this.state(id); clearTimeout(s.timer); s.playing = false; if (redraw) this.app.canvas.invalidate(); }

  // ---- the film --------------------------------------------------------------------------------------------------------
  /** Draw each frame onto canvases of one size ('width' pixels wide at most). */
  async canvases(id, width) {
    const b = boardById(this.app.store.doc, id), { sm } = this.spec(b);
    const out = [];
    let W = 0, H = 0;
    for (const asset of sm.frames) {
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
      const a = await this.app.assetStore.add(blob, { title: `${b.title} (${ext})`, kind: 'import', folder: this.app.assetPanel?.folder || '', tags: ['stop-motion', ext], meta: { source: 'stop motion', fps: sm.fps, frames: sm.frames.length } });
      this.app.log(`Saved “${a.title}” to Assets.`);
    } catch (err) { this.app.log(`Stop motion: ${err.message}`, 'error'); }
  }
}
