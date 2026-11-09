/**
 * Listening to a sound: its spectrum over time and the signals read from it.
 *
 * `analyseSamples` turns mono samples into one frame every 20 ms: a spectrum of 64 bands (log-spaced, 40 Hz up), and from it
 *   level     loudness (0..1; scaled so the file's usual loud parts sit near 1, quiet files still move)
 *   bass mid treble   how loud the low, middle and high bands are (0..1, on a decibel curve)
 *   onset     how sharply something just started (spectral flux, 0..1): drums, plucks, consonants
 *   centroid  where the energy sits (0 low .. 1 high): brightness
 *   pitch     the note being sung or played, on a log scale (60 Hz = 0, 1 kHz = 1; it holds its last value through a gap), with `clarity`
 *             (0..1: how sure it is there is one pitch) and the frequency itself in `pitchHz` (0 when there is none)
 *   fft0..fft63  each of the 64 spectrum bands (low to high), band0..band7 the same grouped in eight
 * Everything is 0..1 and read by time (ms), so it can be drawn (a spectrogram, a lane), put on the Timeline as a track, and read
 * from code as source('sound'). `analyseSrc` decodes a sound's URL once and remembers the result, as waveform.js does.
 */
export const BINS = 64, HOP_MS = 20, RATE = 22050;
const FFT = 2048, FMIN = 40, LAG = 2;   // (LAG: frames the onset signal is delayed by, see below)
export const SIGNALS = ['level', 'bass', 'mid', 'treble', 'onset', 'centroid', 'pitch', 'clarity'];
/** Whether `name` is a signal: a named one, fft0..fft63 (a band of the spectrum) or band0..band7 (eight groups of them). */
export const isSignal = name => SIGNALS.includes(name) || /^fft(\d|[1-5]\d|6[0-3])$/.test(name) || /^band[0-7]$/.test(name);
const PITCH_LO = 60, PITCH_HI = 1000;
const pitchScale = hz => (hz > 0 ? Math.max(0, Math.min(1, Math.log2(hz / PITCH_LO) / Math.log2(PITCH_HI / PITCH_LO))) : 0);

/**
 * The pitch in a stretch of samples (mono at `rate`): { hz, clarity }. The normalised autocorrelation (McLeod): the first strong peak
 * after the function first falls below zero, taken to a fraction of a sample by a parabola through its neighbours. hz is 0 when no
 * pitch is clear enough (noise, silence, a chord).
 */
export function pitchOf(x, start, len, rate) {
  const lagMin = Math.max(2, Math.floor(rate / PITCH_HI)), lagMax = Math.min(len - 2, Math.ceil(rate / PITCH_LO));
  if (lagMax <= lagMin + 2) return { hz: 0, clarity: 0 };
  const nsdf = new Float32Array(lagMax + 2);
  for (let tau = 0; tau <= lagMax; tau++) {
    let acf = 0, m = 0;
    for (let i = 0; i + tau < len; i++) { const a = x[start + i] || 0, b = x[start + i + tau] || 0; acf += a * b; m += a * a + b * b; }
    nsdf[tau] = m > 1e-9 ? 2 * acf / m : 0;
  }
  // (the peaks between each rise above zero and the next fall below it; the first that is nearly the highest is the pitch)
  let tau = 1; while (tau < lagMax && nsdf[tau] > 0) tau++;   // (out of the first lobe)
  const peaks = []; let best = 0;
  while (tau < lagMax) {
    while (tau < lagMax && nsdf[tau] <= 0) tau++;
    let top = -1, at = -1;
    while (tau < lagMax && nsdf[tau] > 0) { if (nsdf[tau] > top) { top = nsdf[tau]; at = tau; } tau++; }
    if (at >= lagMin && top > 0) { peaks.push({ at, v: top }); if (top > best) best = top; }
  }
  const pick = peaks.find(p => p.v >= 0.9 * best);
  if (!pick || best < 0.5) return { hz: 0, clarity: Math.max(0, best) };
  const a = nsdf[pick.at - 1], b = nsdf[pick.at], c = nsdf[pick.at + 1], d = a - 2 * b + c, shift = d ? 0.5 * (a - c) / d : 0;
  return { hz: rate / (pick.at + Math.max(-1, Math.min(1, shift))), clarity: Math.min(1, best) };
}


/** In-place radix-2 FFT of (re, im); both length n (a power of two). */
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
      }
    }
  }
}

const percentile = (arr, p) => { const s = Float32Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0; };

/** The frequency edge of band b (Hz): log-spaced from FMIN to just under the Nyquist. */
const edge = (b, rate) => FMIN * Math.pow((rate / 2 * 0.95) / FMIN, b / BINS);

/**
 * Mono samples → the analysis. `rate` is the samples' rate (RATE by default). `yieldEvery` frames, wait a tick so a long sound
 * does not freeze the page (pass 0 to run straight through, as tests do).
 */
export async function analyseSamples(samples, rate = RATE, { yieldEvery = 300 } = {}) {
  const hop = Math.max(1, Math.round(rate * HOP_MS / 1000)), n = Math.max(1, Math.floor(samples.length / hop));
  const bins = new Uint8Array(n * BINS);
  const pitch = new Float32Array(n), clarity = new Float32Array(n), pitchHz = new Float32Array(n);
  const level = new Float32Array(n), onset = new Float32Array(n), centroid = new Float32Array(n), bass = new Float32Array(n), mid = new Float32Array(n), treble = new Float32Array(n);
  const win = new Float32Array(FFT); for (let i = 0; i < FFT; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (FFT - 1));
  const re = new Float32Array(FFT), im = new Float32Array(FFT), mag = new Float32Array(FFT / 2);
  // each band's range of FFT bins (at least one bin wide: the low bands are narrower than the FFT's resolution, so they share)
  const lo = new Int32Array(BINS), hi = new Int32Array(BINS), binHz = rate / FFT;
  for (let b = 0; b < BINS; b++) { lo[b] = Math.min(FFT / 2 - 2, Math.max(1, Math.floor(edge(b, rate) / binHz))); hi[b] = Math.min(FFT / 2 - 1, Math.max(lo[b] + 1, Math.ceil(edge(b + 1, rate) / binHz))); }
  const prev = new Float32Array(BINS), cur = new Float32Array(BINS), rms = new Float32Array(n), flux = new Float32Array(n);
  const half = new Float32Array(samples.length >> 1); for (let i = 0; i < half.length; i++) half[i] = (samples[2 * i] + samples[2 * i + 1]) / 2;
  const pHz = new Float32Array(n), pCl = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    const centre = f * hop + (hop >> 1), start = centre - (FFT >> 1);
    let sq = 0;
    for (let i = 0; i < FFT; i++) { const v = samples[start + i] || 0; re[i] = v * win[i]; im[i] = 0; if (i >= (FFT >> 1) - hop && i < (FFT >> 1) + hop) sq += v * v; }
    rms[f] = Math.sqrt(sq / (2 * hop));
    if (f % 2 === 0) {   // (pitch every other frame, on the samples at half the rate: that is enough for a voice or a line)
      const p = pitchOf(half, Math.max(0, (centre >> 1) - 384), 768, rate / 2);
      pHz[f] = p.hz; pCl[f] = p.clarity;
    } else { pHz[f] = pHz[f - 1]; pCl[f] = pCl[f - 1]; }
    fft(re, im);
    for (let i = 1; i < FFT / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
    let fl = 0, cs = 0, ct = 0, sb = 0, sm = 0, st = 0;
    for (let b = 0; b < BINS; b++) {
      let m = 0; for (let i = lo[b]; i <= hi[b]; i++) if (mag[i] > m) m = mag[i];
      const db = 20 * Math.log10(m / (FFT / 4) + 1e-9), v = Math.max(0, Math.min(1, (db + 80) / 80));   // -80 dB .. 0 dB → 0..1
      cur[b] = v; bins[f * BINS + b] = Math.round(v * 255);
      if (f > 0 && v > prev[b]) fl += v - prev[b];
      cs += v * b; ct += v; if (b < BINS / 3) sb += v; else if (b < (2 * BINS) / 3) sm += v; else st += v;
    }
    prev.set(cur);
    flux[f] = fl; centroid[f] = ct > 1e-6 ? cs / ct / (BINS - 1) : 0;
    const third = BINS / 3; bass[f] = sb / third; mid[f] = sm / third; treble[f] = st / third;
    if (yieldEvery && f % yieldEvery === yieldEvery - 1) await new Promise(r => setTimeout(r, 0));
  }
  // (the spectrum of a frame is of 93 ms around it, so a hit shows in the flux about 40 ms before it happens: put it back)
  for (let f = n - 1; f >= 0; f--) flux[f] = f >= LAG ? flux[f - LAG] : 0;
  const ln = percentile(rms, 0.98) || 1, fn = percentile(flux, 0.98) || 1;
  let held = 0;
  for (let f = 0; f < n; f++) {
    level[f] = Math.min(1, rms[f] / ln * 0.9); onset[f] = Math.min(1, flux[f] / fn * 0.9);
    const voiced = pHz[f] > 0 && level[f] > 0.04;   // (a pitch needs a sound)
    pitchHz[f] = voiced ? pHz[f] : 0; clarity[f] = level[f] > 0.04 ? pCl[f] : 0;
    if (voiced) held = pitchScale(pHz[f]);
    pitch[f] = held;
  }
  return { hop: HOP_MS, n, duration: Math.round(samples.length / rate * 1000), bins, level, onset, centroid, bass, mid, treble, pitch, clarity, pitchHz };
}

const clamp = (i, n) => Math.max(0, Math.min(n - 1, i));
/** The frame at t (ms from the start of the sound). */
export const frameAt = (an, t) => clamp(Math.floor(t / an.hop), an.n);
/** A signal at t (ms from the start of the sound), 0..1; 0 outside it. (The pitch in Hz: pitchHzAt.) */
export function signalAt(an, name, t) {
  if (!an || t < 0 || t > an.duration + an.hop) return 0;
  const m = /^(fft|band)(\d+)$/.exec(name);
  if (m) {
    const k = Number(m[2]), f = frameAt(an, t), at = i => (an.bins[f * BINS + i] || 0) / 255;
    if (m[1] === 'fft') return k < BINS ? at(k) : 0;
    const a = Math.floor(k * BINS / 8), b = Math.floor((k + 1) * BINS / 8); let mx = 0; for (let i = a; i < b; i++) mx = Math.max(mx, at(i)); return mx;
  }
  if (!an[name] || name === 'pitchHz') return 0;
  const x = t / an.hop, i = clamp(Math.floor(x), an.n), j = clamp(i + 1, an.n), u = x - Math.floor(x);
  return an[name][i] * (1 - u) + an[name][j] * u;
}
/** n loudness values (0..1) low pitch to high at t: the spectrum's 64 bands grouped (the loudest in each group). */
export function spectrumAt(an, t, n = BINS) {
  const out = new Array(n).fill(0);
  if (!an || t < 0 || t > an.duration + an.hop) return out;
  const o = frameAt(an, t) * BINS;
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * BINS / n), b = Math.max(a + 1, Math.floor((i + 1) * BINS / n));
    let m = 0; for (let k = a; k < b; k++) if (an.bins[o + k] > m) m = an.bins[o + k];
    out[i] = m / 255;
  }
  return out;
}
/** Where things start (ms): the peaks of the onset signal above `threshold`, at least `minGap` ms apart. */
export function onsetsOf(an, { threshold = 0.45, minGap = 150 } = {}) {
  const out = [];
  for (let i = 1; i < an.n - 1; i++) {
    const v = an.onset[i];
    if (v < threshold || v < an.onset[i - 1] || v <= an.onset[i + 1]) continue;
    const t = i * an.hop;
    if (out.length && t - out[out.length - 1] < minGap) { if (v > an.onset[Math.round(out[out.length - 1] / an.hop)]) out[out.length - 1] = t; continue; }
    out.push(t);
  }
  return out;
}
/** A guess at the tempo (beats per minute, 60..200) from the rhythm of the onsets; null if there is no steady one. */
export function tempoOf(an) {
  const lagMin = Math.round(60000 / 200 / an.hop), lagMax = Math.round(60000 / 60 / an.hop);
  if (an.n < lagMax * 3) return null;
  let best = 0, bestV = 0, zero = 0;
  for (let i = 0; i < an.n; i++) zero += an.onset[i] * an.onset[i];
  if (zero < 1e-6) return null;
  const score = [];
  for (let lag = Math.max(1, lagMin >> 1); lag <= lagMax; lag++) {
    let s = 0; for (let i = lag; i < an.n; i++) s += an.onset[i] * an.onset[i - lag];
    score[lag] = s / zero;
    if (lag >= lagMin && score[lag] > bestV) { bestV = score[lag]; best = lag; }
  }
  // (a bar that repeats every two beats scores as high as the beat: take the half when it is nearly as strong)
  while (best >> 1 >= lagMin && (score[best >> 1] || 0) >= 0.6 * bestV) best >>= 1;
  return bestV > 0.15 ? Math.round(60000 / (best * an.hop)) : null;
}

// ---- decoding a sound's URL, once ---------------------------------------------------------------------------------------
const cache = new Map();   // src → Promise<analysis>
export function analyseSrc(src) {
  if (!src) return Promise.resolve(null);
  if (!cache.has(src)) {
    cache.set(src, (async () => {
      const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const buf = await new AC(1, RATE, RATE).decodeAudioData(await (await fetch(src)).arrayBuffer());   // (decoded at 22.05 kHz)
      const ch = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));
      const mono = ch.length === 1 ? ch[0] : Float32Array.from({ length: buf.length }, (_, i) => { let v = 0; for (const c of ch) v += c[i]; return v / ch.length; });
      return analyseSamples(mono, RATE);
    })().then(an => { if (an) ready.set(src, an); return an; }).catch(() => null));
  }
  return cache.get(src);
}
/** The analysis if it is ready (null while it is being made, and it is started). */
export function analysisOf(src) {
  const e = ready.get(src);
  if (e) return e;
  analyseSrc(src).then(an => { if (an) ready.set(src, an); });
  return null;
}
const ready = new Map();

// ---- drawing ------------------------------------------------------------------------------------------------------------
const PALETTE = (() => {   // dark → violet → red → orange → pale yellow
  const stops = [[0, [12, 8, 24]], [0.25, [62, 20, 110]], [0.5, [176, 48, 90]], [0.75, [240, 130, 40]], [1, [252, 240, 170]]];
  return Array.from({ length: 256 }, (_, i) => {
    const u = i / 255, k = Math.min(stops.length - 2, stops.findIndex((s, j) => u <= stops[j + 1][0])), [a, ca] = stops[k], [b, cb] = stops[k + 1], f = (u - a) / (b - a);
    return ca.map((x, c) => Math.round(x + (cb[c] - x) * f));
  });
})();

/** Paint [from, to] ms of the sound as a spectrogram: time across, low pitch at the bottom. */
export function drawSpectrogram(canvas, an, { from = 0, to = an?.duration, width, height } = {}) {
  const W = Math.max(1, Math.round(width)), H = Math.max(2, Math.round(height)), dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  const g = canvas.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0);
  const w = canvas.width, h = canvas.height, img = g.createImageData(w, h), span = Math.max(1, to - from);
  if (an?.n) {
    for (let x = 0; x < w; x++) {
      const f = frameAt(an, from + (x / w) * span), o = f * BINS;
      for (let y = 0; y < h; y++) {
        const v = an.bins[o + Math.min(BINS - 1, Math.floor((1 - (y + 0.5) / h) * BINS))], c = PALETTE[v], i = (y * w + x) * 4;
        img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255;
      }
    }
  }
  g.putImageData(img, 0, 0);
}

/** Paint a signal (level, bass, onset…) from `from` for `dur` ms as a filled curve; onsets as bars. */
export function drawSignal(canvas, an, name, { from = 0, dur = an?.duration, width, height } = {}) {
  const W = Math.max(1, Math.round(width)), H = Math.max(2, Math.round(height)), dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); canvas.style.width = `${W}px`;   // (its height is the lane's, from the stylesheet)
  const g = canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  if (!an?.n) return;
  g.fillStyle = 'rgba(40,30,36,0.62)';
  for (let x = 0; x < W; x++) {
    const a = from + (x / W) * dur, b = from + ((x + 1) / W) * dur;
    let v = 0; for (let t = a; t <= b + an.hop * 0.5; t += an.hop) v = Math.max(v, signalAt(an, name, t));   // (the loudest under the column, so a quick onset is never lost)
    const hgt = Math.max(v > 0.01 ? 1 : 0, v * (H - 2));
    g.fillRect(x, H - 1 - hgt, 1, hgt);
  }
}

/** The frequency (Hz) being played or sung at t (ms from the start of the sound); 0 when there is no clear pitch. */
export function pitchHzAt(an, t) { return an && t >= 0 && t <= an.duration + an.hop ? an.pitchHz[frameAt(an, t)] || 0 : 0; }
