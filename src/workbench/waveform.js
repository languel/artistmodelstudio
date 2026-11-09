/**
 * Waveforms: what a sound looks like on the Timeline.
 *
 * `analyse` decodes a sound once and keeps, for every small slice of it, the lowest and highest sample (and the loudness, RMS)
 * as whole numbers -127 to 127. A one-second slice is 100 slices, so a clip shows real detail when it is wide and stays small when it is long.
 * `drawWave` paints any stretch of that onto a canvas, one column per pixel, taking the extremes under each column, so zooming
 * in and out never makes the picture lie. The shape is a filled envelope (peaks, light) with the loudness inside it (dark),
 * like an audio editor, and a centre line so silence still reads as a sound that is there.
 */

const PER_SECOND = 100, MAX_SLICES = 24000;
const cache = new Map();   // src → Promise<wave>

/** Decode `data` (an ArrayBuffer) into { rate, min[], max[], rms[], duration } */
export async function analyseBuffer(data) {
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const buf = await new AC(1, 44100, 44100).decodeAudioData(data);
  const ch = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));
  const len = buf.length, seconds = buf.duration;
  const rate = Math.min(PER_SECOND, MAX_SLICES / Math.max(1, seconds));
  const n = Math.max(1, Math.ceil(seconds * rate)), per = len / n;
  const min = new Array(n), max = new Array(n), rms = new Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * per), b = Math.max(a + 1, Math.min(len, Math.floor((i + 1) * per)));
    let lo = 0, hi = 0, sum = 0, count = 0;
    const stride = Math.max(1, Math.floor((b - a) / 64));   // (a long slice is sampled, not read through)
    for (let j = a; j < b; j += stride) {
      let v = 0; for (let k = 0; k < ch.length; k++) v += ch[k][j] || 0; v /= ch.length;
      if (v < lo) lo = v; if (v > hi) hi = v; sum += v * v; count++;
    }
    min[i] = Math.round(Math.max(-1, lo) * 127); max[i] = Math.round(Math.min(1, hi) * 127); rms[i] = Math.round(Math.min(1, Math.sqrt(sum / Math.max(1, count))) * 127);
  }
  return { rate, min, max, rms, duration: Math.round(seconds * 1000) };
}

/** The wave for a sound's URL (a data: or blob: URL). Remembered, so each sound is decoded once. */
export function waveFor(src) {
  if (!src) return Promise.resolve(null);
  if (!cache.has(src)) cache.set(src, fetch(src).then(r => r.arrayBuffer()).then(analyseBuffer).catch(() => null));
  return cache.get(src);
}

/** Old clips carried only `peaks` (a rough maximum, 120 of them): turn that into something drawable. */
export function fromPeaks(peaks, durationMs) {
  if (!peaks?.length) return null;
  const max = peaks.map(p => Math.round(Math.min(1, p) * 127));
  return { rate: peaks.length / Math.max(0.001, durationMs / 1000), min: max.map(v => -v), max, rms: max.map(v => Math.round(v * 0.6)), duration: durationMs, rough: true };
}

/**
 * Paint [from, to] (seconds of the sound) across `canvas`, which is `width`×`height` CSS pixels.
 * colors: { peak, body, line }; fluid: leave the height to the stylesheet (the picture is drawn at `height` and stretched to fit)
 */
export function drawWave(canvas, wave, { from = 0, to = wave?.duration / 1000, width, height, colors = {}, fluid = false } = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(width)), H = Math.max(2, Math.round(height));
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  canvas.style.width = `${W}px`; if (!fluid) canvas.style.height = `${H}px`;   // (fluid: the page gives it its height, so it fills a clip of any height)
  const g = canvas.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
  const mid = H / 2, amp = H / 2 - 1;
  g.fillStyle = colors.line || 'rgba(40,30,36,0.35)'; g.fillRect(0, Math.floor(mid), W, 1);
  if (!wave?.max?.length) return;
  const n = wave.max.length, span = Math.max(1e-6, to - from);
  const col = x => {   // the slices that fall under pixel column x
    const a = Math.floor((from + (x / W) * span) * wave.rate), b = Math.max(a + 1, Math.ceil((from + ((x + 1) / W) * span) * wave.rate));
    let lo = 0, hi = 0, sq = 0, c = 0;
    for (let i = Math.max(0, a); i < Math.min(n, b); i++) { if (wave.min[i] < lo) lo = wave.min[i]; if (wave.max[i] > hi) hi = wave.max[i]; if (wave.rms[i] > sq) sq = wave.rms[i]; c++; }
    return c ? { lo: lo / 127, hi: hi / 127, rms: sq / 127 } : null;
  };
  const cols = []; for (let x = 0; x < W; x++) cols.push(col(x));
  // The envelope, and the loudness inside it.
  g.fillStyle = colors.peak || 'rgba(40,30,36,0.38)';
  for (let x = 0; x < W; x++) { const c = cols[x]; if (!c) continue; const top = mid - Math.max(c.hi, 0.012) * amp, bot = mid - Math.min(c.lo, -0.012) * amp; g.fillRect(x, top, 1, Math.max(1, bot - top)); }
  if (!wave.rough) {
    g.fillStyle = colors.body || 'rgba(40,30,36,0.72)';
    for (let x = 0; x < W; x++) { const c = cols[x]; if (!c) continue; const r = Math.min(c.rms, Math.max(c.hi, -c.lo)) * amp; g.fillRect(x, mid - r, 1, Math.max(1, r * 2)); }
  }
}
