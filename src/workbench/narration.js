/**
 * Narration: a line of text spoken by a voice that runs in the browser (Kokoro, in a worker), kept as an audio Asset so it is made once.
 * A script prepares all its lines before it plays, so each cue knows how long it is. The audio goes to the speakers and to a stream
 * (`stream`) that a recording takes. The voice is a setting; the clips are Assets, so a recorded or cloned voice can stand in for one.
 */
export const KOKORO = 'onnx-community/Kokoro-82M-v1.0-ONNX';
export const DEFAULT_VOICE = 'af_heart';
const KEY = { on: 'ams_narrate', voice: 'ams_narrate_voice', speed: 'ams_narrate_speed', ready: 'ams_narrate_ready' };
const get = (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } };
const set = (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* ignore */ } };

/** A short stable hash of the voice and the words (the clip's name in Assets). */
export function clipHash(model, voice, speed, text) {
  let h1 = 0x811c9dc5, h2 = 0x9747b28c;
  const s = `${model}|${voice}|${speed}|${text}`;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ c, 2246822519) >>> 0; }
  return h1.toString(36) + h2.toString(36);
}

export function encodeWav(samples, rate = 24000) {
  const pcm = samples instanceof Float32Array ? samples : Float32Array.from(samples || []);
  const buf = new ArrayBuffer(44 + pcm.length * 2), v = new DataView(buf);
  const w = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) { const x = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true); }
  return buf;
}

export class Narrator {
  constructor(app) {
    this.app = app;
    this.worker = null; this.requests = new Map(); this.nextId = 1;
    this.voices = []; this.loading = null; this.loaded = false;
    this.buffers = new Map();     // hash → AudioBuffer
    this.blobs = new Map();       // hash → the WAV (for an export)
    this.assets = null;           // hash → asset id (read from Assets once)
    this.ctx = null; this.out = null; this.stream = null;
  }

  get on() { return get(KEY.on, '1') !== '0'; }
  set on(v) { set(KEY.on, v ? '1' : '0'); }
  get voice() { return get(KEY.voice, DEFAULT_VOICE); }
  set voice(v) { set(KEY.voice, v); }
  get speed() { return Math.min(1.5, Math.max(0.6, Number(get(KEY.speed, '1')) || 1)); }
  set speed(v) { set(KEY.speed, v); }
  /** Has the voice been loaded on this machine before (so it comes from the browser's cache)? */
  get ready() { return get(KEY.ready, '') === '1'; }

  // ---- the voice ---------------------------------------------------------------------------------------------------------
  call(msg, onProgress) {
    if (!this.worker) {
      this.worker = new Worker(new URL('./narrationWorker.js', import.meta.url), { type: 'module' });
      this.worker.onmessage = ({ data }) => {
        const p = this.requests.get(data.requestId); if (!p) return;
        if (data.type === 'progress') { p.progress?.(data.progress); return; }
        this.requests.delete(data.requestId);
        if (data.type === 'reject') p.reject(new Error(data.error)); else p.resolve(data);
      };
      this.worker.onerror = e => { for (const p of this.requests.values()) p.reject(new Error(e.message || 'The voice failed.')); this.requests.clear(); this.worker?.terminate(); this.worker = null; this.loaded = false; this.loading = null; };
    }
    return new Promise((resolve, reject) => { const requestId = this.nextId++; this.requests.set(requestId, { resolve, reject, progress: onProgress }); this.worker.postMessage({ ...msg, requestId }); });
  }

  /** Load the voice (once). `onProgress(percent)` while the model comes down. */
  load(onProgress) {
    if (this.loaded) return Promise.resolve(this.voices);
    this.loading ||= this.call({ type: 'load', model: KOKORO }, onProgress).then(r => { this.voices = r.voices; this.loaded = true; set(KEY.ready, '1'); return r.voices; }).catch(err => { this.loading = null; throw err; });
    return this.loading;
  }

  // ---- clips -------------------------------------------------------------------------------------------------------------
  audio() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.out = this.ctx.createGain();
      this.out.connect(this.ctx.destination);
      this.stream = this.ctx.createMediaStreamDestination();
      this.out.connect(this.stream);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  async known() {
    if (this.assets) return this.assets;
    this.assets = new Map();
    try { for (const a of await this.app.assetStore.all()) if (a.kind === 'audio' && a.meta?.narration && a.meta.hash) this.assets.set(a.meta.hash, a.id); } catch { /* no assets */ }
    return this.assets;
  }

  /** The clip for a line: from memory, from Assets, or made now. → { buffer, duration, hash } */
  async clip(text, { voice = this.voice, speed = this.speed, folder = 'Narration', onProgress } = {}) {
    const hash = clipHash(KOKORO, voice, speed, text), ctx = this.audio();
    const mem = this.buffers.get(hash);
    if (mem && this.blobs.has(hash)) return { buffer: mem, duration: mem.duration, hash, blob: this.blobs.get(hash) };
    const known = await this.known(), id = known.get(hash);
    if (id) {
      try {
        const a = await this.app.assetStore.get(id);
        if (a?.blob) { const buffer = await ctx.decodeAudioData(await a.blob.arrayBuffer()); this.buffers.set(hash, buffer); this.blobs.set(hash, a.blob); return { buffer, duration: buffer.duration, hash, blob: a.blob }; }
      } catch { /* made again below */ }
    }
    await this.load(onProgress);
    const r = await this.call({ type: 'generate', text, options: { voice, speed } });
    const samples = r.audio, rate = r.samplingRate;
    const wav = new Blob([encodeWav(samples, rate)], { type: 'audio/wav' });
    const buffer = await ctx.decodeAudioData(await wav.arrayBuffer());
    this.buffers.set(hash, buffer); this.blobs.set(hash, wav);
    wav.kindHint = 'audio'; wav.durationMs = Math.round(buffer.duration * 1000);   // (how the Assets list knows to draw an audio card)
    try {
      const a = await this.app.assetStore.add(wav, { title: `Narration · ${text.slice(0, 48)}`, kind: 'audio', folder, tags: ['narration', 'kokoro', voice], meta: { narration: true, hash, text, voice, speed, model: KOKORO, duration: buffer.duration } });
      known.set(hash, a.id);
    } catch { /* kept in memory only */ }
    return { buffer, duration: buffer.duration, hash, blob: wav };
  }

  /** Play a clip. → { ended: Promise, stop() } */
  play(buffer) {
    const ctx = this.audio(), src = ctx.createBufferSource();
    src.buffer = buffer; src.connect(this.out);
    const ended = new Promise(r => { src.onended = r; });
    src.start();
    return { ended, stop: () => { try { src.stop(); } catch { /* done */ } } };
  }
}
