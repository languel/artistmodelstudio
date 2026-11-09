/**
 * The Timeline's sound as a source: what the take sounds like at the playhead, as signals code can read.
 * Like the microphone (micSource.js) it is a picture that changes (the spectrum now, low pitches at the left, loud at the top) with
 * `level` and `bands(n)`; and since the sound is known ahead of time it also gives what a microphone cannot: `onset` (a hit just
 * happened), `bass`, `mid`, `treble`, `centroid` (brightness), `spectrum(n)` and `signal(name)`. All 0..1.
 *
 *   const s = source('sound');  s.level;  s.bands(16);  s.onset;  s.signal('bass')
 *
 * It follows the playhead, so scrubbing and playing both move it, and it adds up every audio clip that is sounding (the loudest of each
 * signal). It is made from the clips' analysis (audioAnalysis.js), started the first time a clip is under the playhead.
 */
import { flatClips } from '../process/take.js';
import { analysisOf, signalAt, spectrumAt, SIGNALS, BINS } from './audioAnalysis.js';

const W = 256, H = 128;
const group = (v, n) => Array.from({ length: n }, (_, i) => { const a = Math.floor(i * v.length / n), b = Math.max(a + 1, Math.floor((i + 1) * v.length / n)); let m = 0; for (let k = a; k < b; k++) m = Math.max(m, v[k] || 0); return m; });

export function soundLive(app) {
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const live = {
    kind: 'sound', canvas, ready: true, version: 0, heard: true, spec: new Array(BINS).fill(0), t: -1, level: 0, bass: 0, mid: 0, treble: 0, onset: 0, centroid: 0,
    /** n loudness values 0..1, low pitch to high, at the playhead */
    bands: (n = 8) => group(live.spec, Math.max(1, Math.min(BINS, Math.round(n)))),
    spectrum: (n = BINS) => live.bands(n),
    signal: name => (SIGNALS.includes(name) ? live[name] : 0),
    tick() {
      const p = app.player, take = p?.take, t = p?.t ?? 0;
      if (t === live.t && !p?.playing && !live.waiting && live.rev === take?.rev) return;   // (nothing moved or changed)
      live.rev = take?.rev;
      live.t = t; live.waiting = false;
      const now = { level: 0, bass: 0, mid: 0, treble: 0, onset: 0, centroid: 0 }, spec = new Array(BINS).fill(0);
      let any = false;
      for (const c of take ? flatClips(take) : []) {
        if (c.track !== 'audio' || c.muted || !c.src || t < c.start || t >= c.start + (c.dur || 0)) continue;
        const an = analysisOf(c.src);
        if (!an) { live.waiting = true; continue; }   // (being read: tick again)
        const at = (c.offset || 0) + (t - c.start); any = true;
        for (const k of SIGNALS) now[k] = Math.max(now[k], signalAt(an, k, at));
        const s = spectrumAt(an, at, BINS); for (let i = 0; i < BINS; i++) spec[i] = Math.max(spec[i], s[i]);
      }
      // (an onset is a moment, 20 ms long, and a sketch reads it a few times a second: it fades over about a tenth of a second while playing)
      const dt = performance.now() - (live.at || 0); live.at = performance.now();
      if (p?.playing && any) now.onset = Math.max(now.onset, live.onset * Math.pow(0.5, dt / 120));
      Object.assign(live, now); live.spec = spec; live.ok = any;
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const bars = group(spec, W / 2);
      for (let i = 0; i < bars.length; i++) {
        const hh = Math.max(1, bars[i] * (H - 4)), hue = 200 - bars[i] * 160;
        g.fillStyle = `hsl(${hue} 80% ${25 + bars[i] * 40}%)`; g.fillRect(i * 2, H - hh, 2, hh);
      }
      live.version++;
    },
    setRate() {}, setVolume() {}, setLoop() {}, setRange() {}, position: () => null, hasAudio: () => false,
    stop() { live.ready = false; }
  };
  return live;
}
