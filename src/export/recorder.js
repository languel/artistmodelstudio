/**
 * Canvas recorder: MP4 (or WebM where MP4 isn't supported) through
 * MediaRecorder, or an animated GIF encoded here. Frames are pushed with
 * `frame(source, sx, sy, sw, sh)` so only the picture (no letterbox) is kept.
 *
 * Import-free: the continuous p5 export embeds this file.
 */

export const GIF_MAX_SIDE = 480;
export const GIF_MAX_FRAMES = 450;

export function videoMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const m of ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export class CanvasRecorder {
  /** @param format 'video' | 'gif' */
  constructor(format = 'video', { fps = 30, gifFps = 12 } = {}) {
    this.format = format;
    this.fps = fps;
    this.gifFps = gifFps;
    this.canvas = document.createElement('canvas');
    this.frames = [];
    this.lastGif = -Infinity;
    this.started = performance.now();
    this.recorder = null;
    this.chunks = [];
  }

  get seconds() { return (performance.now() - this.started) / 1000; }

  frame(src, sx, sy, sw, sh) {
    sw = Math.max(1, Math.round(sw)); sh = Math.max(1, Math.round(sh));
    if (this.format === 'gif') {
      const now = performance.now();
      if (now - this.lastGif < 1000 / this.gifFps || this.frames.length >= GIF_MAX_FRAMES) return;
      this.lastGif = now;
      const k = Math.min(1, GIF_MAX_SIDE / Math.max(sw, sh));
      const w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
      if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
      const c = this.canvas.getContext('2d', { willReadFrequently: true });
      c.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
      this.frames.push({ w, h, data: c.getImageData(0, 0, w, h).data, time: now });
      return;
    }
    // Video: even dimensions keep H.264 encoders happy.
    const w = sw - (sw % 2), h = sh - (sh % 2);
    if (!this.recorder) {
      this.canvas.width = w; this.canvas.height = h;
      const mime = videoMime();
      if (!mime) throw new Error('Video recording is not supported in this browser');
      this.mime = mime;
      this.recorder = new MediaRecorder(this.canvas.captureStream(this.fps), { mimeType: mime, videoBitsPerSecond: 8e6 });
      this.recorder.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
      this.recorder.start(250);
    }
    this.canvas.getContext('2d').drawImage(src, sx, sy, sw, sh, 0, 0, this.canvas.width, this.canvas.height);
  }

  /** Stop and return { blob, ext }. */
  async stop() {
    if (this.format === 'gif') {
      return { blob: new Blob([encodeGif(this.frames)], { type: 'image/gif' }), ext: 'gif' };
    }
    if (!this.recorder) return null;
    await new Promise(resolve => { this.recorder.onstop = resolve; this.recorder.stop(); });
    const ext = this.mime.includes('mp4') ? 'mp4' : 'webm';
    return { blob: new Blob(this.chunks, { type: this.mime.split(';')[0] }), ext };
  }
}

/** Save a blob as a download. */
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---- GIF89a encoder (global 6×7×6 color cube, LZW) ------------------------

function gifPalette() {
  const pal = [];
  for (let r = 0; r < 6; r++) for (let g = 0; g < 7; g++) for (let b = 0; b < 6; b++) {
    pal.push(Math.round(r * 255 / 5), Math.round(g * 255 / 6), Math.round(b * 255 / 5));
  }
  while (pal.length < 256 * 3) pal.push(0);
  return pal;
}

function lzw(indices, minCode) {
  const out = [];
  let cur = 0, curBits = 0;
  const clear = 1 << minCode, eoi = clear + 1;
  let size = minCode + 1, next = eoi + 1;
  let dict = new Map();
  const emit = code => {
    cur |= code << curBits;
    curBits += size;
    while (curBits >= 8) { out.push(cur & 255); cur >>>= 8; curBits -= 8; }
  };
  emit(clear);
  let prefix = indices[0];
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = prefix * 256 + k;
    const hit = dict.get(key);
    if (hit !== undefined) { prefix = hit; continue; }
    emit(prefix);
    if (next < 4096) {
      dict.set(key, next++);
      if (next > (1 << size) && size < 12) size++;
    } else {
      emit(clear);
      dict = new Map();
      size = minCode + 1;
      next = eoi + 1;
    }
    prefix = k;
  }
  emit(prefix);
  emit(eoi);
  if (curBits > 0) out.push(cur & 255);
  return out;
}

export function encodeGif(frames) {
  const bytes = [];
  const push = (...b) => { for (const x of b) bytes.push(x); };
  const word = v => push(v & 255, (v >> 8) & 255);
  const w = frames[0]?.w || 1, h = frames[0]?.h || 1;
  const pal = gifPalette();
  push(0x47, 0x49, 0x46, 0x38, 0x39, 0x61);
  word(w); word(h);
  push(0xF7, 0, 0);
  push(...pal);
  push(0x21, 0xFF, 11, ...Array.from('NETSCAPE2.0', c => c.charCodeAt(0)), 3, 1, 0, 0, 0); // loop forever
  for (let f = 0; f < frames.length; f++) {
    const { data } = frames[f];
    const next = frames[f + 1];
    const delay = Math.max(2, Math.round(((next ? next.time : frames[f].time + 83) - frames[f].time) / 10));
    push(0x21, 0xF9, 4, 0, delay & 255, delay >> 8, 0, 0);
    push(0x2C); word(0); word(0); word(w); word(h); push(0);
    const idx = new Uint8Array(w * h);
    for (let i = 0, p = 0; p < idx.length; i += 4, p++) {
      // Ordered 2×2 dither softens the color cube's banding.
      const x = p % w, y = (p / w) | 0;
      const dth = [0, 0.5, 0.75, 0.25][(y & 1) * 2 + (x & 1)] - 0.375;
      const a = data[i + 3] / 255;
      const r = data[i] * a, g = data[i + 1] * a, b = data[i + 2] * a;
      const ri = Math.min(5, Math.max(0, Math.round(r / 51 + dth)));
      const gi = Math.min(6, Math.max(0, Math.round(g / 42.5 + dth)));
      const bi = Math.min(5, Math.max(0, Math.round(b / 51 + dth)));
      idx[p] = ri * 42 + gi * 6 + bi;
    }
    push(8);
    const data8 = lzw(idx, 8);
    for (let i = 0; i < data8.length; i += 255) {
      const chunk = data8.slice(i, i + 255);
      push(chunk.length, ...chunk);
    }
    push(0);
  }
  push(0x3B);
  return new Uint8Array(bytes);
}
