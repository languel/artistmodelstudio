/**
 * Live reference sources for continuous mode: webcam, video, animated image.
 *
 * Each source keeps `canvas`, its current frame (long side ≤ 1024), so the rest
 * of the studio can treat it like a still reference. A SourceSampler decides
 * when the fitter's target is refreshed from that frame:
 *
 *   continuous  every frame
 *   interval    every `interval` seconds
 *   hold        keep the last sample (the painting settles on it)
 *
 * Playback rate (video and animated images) is independent of sampling.
 *
 * Shared by the studio and the continuous p5 export (embedded with
 * import/export lines stripped), so keep it free of imports.
 */

const MAX_SIDE = 1024;

function sizeFor(w, h) {
  const k = Math.min(1, MAX_SIDE / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

export class LiveSource {
  constructor(kind) {
    this.kind = kind; // 'webcam' | 'video' | 'animated'
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.rate = 1;
    this.ready = false;
    this.version = 0; // increments whenever `canvas` gets a new frame
  }

  /** Camera via getUserMedia (the browser asks for permission). */
  static async webcam() {
    const src = new LiveSource('webcam');
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    src.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 } }, audio: false });
    video.srcObject = src.stream;
    await video.play();
    src.video = video;
    src.mirror = true; // selfie view
    src.ready = true;
    return src;
  }

  /** Video file (or blob) played muted and looped. */
  static async video(url, { crossOrigin = false } = {}) {
    const src = new LiveSource('video');
    const video = document.createElement('video');
    // From another address: the server must allow it (CORS), or the picture could not be read.
    if (crossOrigin) video.crossOrigin = 'anonymous';
    video.muted = true;
    video.loop = false;   // looping is ours (a range, and stopping at its end: see tick)
    video.playsInline = true;
    video.src = url;
    await new Promise((resolve, reject) => {
      video.onloadeddata = resolve;
      video.onerror = () => reject(new Error(crossOrigin ? 'Could not stream the video (the address, the format, or the server does not allow it)' : 'Could not load the video'));
    });
    await video.play().catch(() => {});
    src.video = video;
    src.ready = true;
    return src;
  }

  /** Animated GIF / WebP / APNG decoded with ImageDecoder (null if it is a still). */
  static async animated(blob) {
    if (typeof ImageDecoder === 'undefined') return null;
    const decoder = new ImageDecoder({ data: blob.stream(), type: blob.type });
    await decoder.tracks.ready;
    // A large file streams in: the frame count is only final once it has all arrived.
    await decoder.completed?.catch(() => {});
    const track = decoder.tracks.selectedTrack;
    if (!track || track.frameCount < 2) {
      decoder.close();
      return null;
    }
    const src = new LiveSource('animated');
    src.decoder = decoder;
    src.frameCount = track.frameCount;
    src.frameIndex = 0;
    src.frameClock = 0;
    await src.decode(0);
    src.ready = true;
    return src;
  }

  async decode(i) {
    const { image } = await this.decoder.decode({ frameIndex: i });
    this.frameDuration = (image.duration || 100000) / 1e6; // seconds
    const [w, h] = sizeFor(image.displayWidth, image.displayHeight);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.ctx.drawImage(image, 0, 0, w, h);
    image.close();
    this.version++;
  }

  /** Volume 0..1 (0: muted: the default, so a clip never surprises anyone); a video only. */
  setVolume(v) {
    if (!this.video || this.kind !== 'video') return;
    const vol = Math.max(0, Math.min(1, Number(v) || 0));
    this.video.volume = vol;
    this.video.muted = vol <= 0;
  }

  /** Whether the clip has a sound track: true, false, or null when the browser cannot say (yet). */
  hasAudio() {
    const v = this.video;
    if (!v || this.kind !== 'video') return false;
    if (this.sound !== undefined) return this.sound;
    let has = null;
    if (typeof v.mozHasAudio === 'boolean') has = v.mozHasAudio;
    else if (v.audioTracks && typeof v.audioTracks.length === 'number') has = v.audioTracks.length > 0;
    else if (v.readyState >= 1 && typeof v.captureStream === 'function') {
      // The tracks of the stream the element would give: an audio track is there when the clip has sound (paused or playing, muted or not).
      try { const n = v.captureStream().getAudioTracks().length; has = n > 0 ? true : v.readyState >= 2 ? false : null; } catch { has = null; }
    }
    if (has !== null) this.sound = has;   // (settled: asked once)
    return has;
  }

  /** Loop (or stop at the end) and the range played, as fractions of the clip (0..1): in and out. */
  setLoop(on) { this.loop = on !== false; }
  setRange(a = 0, b = 1) { this.inPoint = Math.max(0, Math.min(1, Number(a) || 0)); this.outPoint = Math.max(this.inPoint, Math.min(1, b == null ? 1 : Number(b))); }
  /** Whether playback is at the end of its range (a stopped clip: play starts it again from the in point). */
  atEnd() { const p = this.position?.(); return Boolean(p) && p.fraction >= (this.outPoint ?? 1) - 0.0005 && !this.loop || Boolean(this.video?.ended); }

  setRate(rate) {
    this.rate = Math.max(0, rate);
    if (this.video && this.kind === 'video') {
      if (this.rate === 0) this.video.pause();
      else {
        this.video.playbackRate = Math.min(16, Math.max(0.0625, this.rate));
        if (this.video.paused) this.video.play().catch(() => {});
      }
    }
  }

  /** Timeline position: { frame, frames, time, duration, fraction } (null for webcams). */
  position() {
    if (this.video && this.kind === 'video') {
      const d = this.video.duration || 0, t = this.video.currentTime || 0;
      const fps = this.fps || 30;
      return { frame: Math.round(t * fps), frames: Math.max(1, Math.round(d * fps)), time: t, duration: d, fraction: d ? t / d : 0 };
    }
    if (this.decoder) {
      return { frame: this.frameIndex, frames: this.frameCount, fraction: this.frameCount > 1 ? this.frameIndex / (this.frameCount - 1) : 0 };
    }
    return null;
  }

  /** Jump to a point on the timeline (0..1). */
  seek(fraction) {
    const f = Math.min(1, Math.max(0, fraction));
    if (this.video && this.kind === 'video') {
      if (this.video.duration) this.video.currentTime = f * this.video.duration;
    } else if (this.decoder) {
      this.goToFrame(Math.round(f * (this.frameCount - 1)));
    }
  }

  /** Step whole frames (negative = back). Videos step at ~30 fps. */
  step(n) {
    if (this.video && this.kind === 'video') {
      const d = this.video.duration || 0;
      let t = (this.video.currentTime || 0) + n / (this.fps || 30);
      if (d) t = ((t % d) + d) % d;
      this.video.currentTime = t;
    } else if (this.decoder) {
      this.goToFrame(((this.frameIndex + n) % this.frameCount + this.frameCount) % this.frameCount);
    }
  }

  goToFrame(i) {
    this.frameIndex = i;
    this.frameClock = 0;
    this.decoding = true;
    return this.decode(i).finally(() => { this.decoding = false; });
  }

  /** Advance playback by `dt` seconds and refresh `canvas`. */
  tick(dt) {
    if (!this.ready) return;
    if (this.video) {
      const v = this.video;
      if (!v.videoWidth) return;
      const [w, h] = sizeFor(v.videoWidth, v.videoHeight);
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
      }
      this.ctx.save();
      if (this.mirror) {
        this.ctx.translate(w, 0);
        this.ctx.scale(-1, 1);
      }
      this.ctx.drawImage(v, 0, 0, w, h);
      this.ctx.restore();
      this.version++;
      // The end of the range (or of the clip): back to the in point, or stop there.
      const d = v.duration, out = (this.outPoint ?? 1) * d, inn = (this.inPoint ?? 0) * d;
      if (d && (v.currentTime >= out - 0.04 || v.ended) && (!v.paused || v.ended) && this.rate > 0) {
        if (this.loop !== false) { v.currentTime = inn; if (v.paused) v.play().catch(() => {}); }
        else { v.pause(); v.currentTime = Math.min(out, d); this.onEnd?.(); }
      }
    } else if (this.decoder && !this.decoding && this.rate > 0) {
      this.frameClock += dt * this.rate;
      if (this.frameClock >= this.frameDuration) {
        this.frameClock %= Math.max(0.01, this.frameDuration);
        const last = Math.round((this.outPoint ?? 1) * (this.frameCount - 1)), first = Math.round((this.inPoint ?? 0) * (this.frameCount - 1));
        if (this.frameIndex >= last) {
          if (this.loop === false) { this.onEnd?.(); return; }   // stopped on its last frame
          this.frameIndex = first;
        } else this.frameIndex += 1;
        this.decoding = true;
        this.decode(this.frameIndex).finally(() => { this.decoding = false; });
      }
    }
  }

  stop() {
    this.ready = false;
    this.stream?.getTracks().forEach(t => t.stop());
    if (this.video) {
      this.video.pause();
      this.video.removeAttribute('src');
      this.video.srcObject = null;
    }
    this.decoder?.close();
  }
}

export class SourceSampler {
  constructor({ mode = 'continuous', interval = 2 } = {}) {
    this.mode = mode;         // 'continuous' | 'interval' | 'hold'
    this.interval = interval; // seconds, for 'interval'
    this.elapsed = Infinity;  // sample on the first check
    this.lastVersion = -1;
  }

  /** True when the target should be refreshed from `source` now. */
  due(source, dt) {
    this.elapsed += dt;
    if (!source?.ready || source.version === this.lastVersion) return false;
    if (this.mode === 'hold' && this.lastVersion !== -1) return false;
    if (this.mode === 'interval' && this.elapsed < this.interval) return false;
    this.elapsed = 0;
    this.lastVersion = source.version;
    return true;
  }
}

/**
 * Place a drawable into a w×h canvas when aspects differ:
 *   cover    crop to fill (nothing outside the reference is sampled)
 *   contain  whole reference, padded with its mean color; the returned canvas
 *            has `contentRect` {x, y, w, h} (0–1) marking the reference area
 *   stretch  fill by distorting
 */
export function letterbox(image, w, h, fit = 'contain') {
  const iw = image.naturalWidth || image.videoWidth || image.width;
  const ih = image.naturalHeight || image.videoHeight || image.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  c.contentRect = { x: 0, y: 0, w: 1, h: 1 };
  if (fit === 'stretch') {
    ctx.drawImage(image, 0, 0, w, h);
    return c;
  }
  if (fit === 'cover') {
    const k = Math.max(w / iw, h / ih);
    ctx.drawImage(image, (w - iw * k) / 2, (h - ih * k) / 2, iw * k, ih * k);
    return c;
  }
  const probe = document.createElement('canvas');
  probe.width = probe.height = 1;
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  pctx.drawImage(image, 0, 0, 1, 1);
  const [r, g, b] = pctx.getImageData(0, 0, 1, 1).data;
  ctx.fillStyle = 'rgb(' + r + ',' + g + ',' + b + ')';
  ctx.fillRect(0, 0, w, h);
  const k = Math.min(w / iw, h / ih);
  const dw = iw * k, dh = ih * k;
  ctx.drawImage(image, (w - dw) / 2, (h - dh) / 2, dw, dh);
  c.contentRect = { x: (w - dw) / 2 / w, y: (h - dh) / 2 / h, w: dw / w, h: dh / h };
  return c;
}

/** RGB floats of a canvas. */
export function rgbOf(canvas) {
  const d = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data;
  const out = new Float32Array(canvas.width * canvas.height * 3);
  for (let i = 0, j = 0; i < d.length; i += 4, j += 3) {
    out[j] = d[i]; out[j + 1] = d[i + 1]; out[j + 2] = d[i + 2];
  }
  return out;
}
