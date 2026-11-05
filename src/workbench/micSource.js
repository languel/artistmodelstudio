/**
 * A microphone as a source. Like a camera it is a picture that changes: here, the spectrum of the sound now, low pitches at the left,
 * loud at the top, so `source('mic').value(x, y)` and `.color(x, y)` read it like any other source, and a board can show it.
 * Plus what a sound needs that a picture does not: `level` (0..1 loudness) and `bands(n)` (n loudness values, low to high).
 * The stream comes from `inputs.js`, so dictation and a lecture recording share it, and the browser's light goes out when none holds it.
 */
import { inputs } from './inputs.js';

const W = 256, H = 128;

export async function micLive() {
  const mic = await inputs.open('mic');
  const AC = window.AudioContext || window.webkitAudioContext;
  const ctx = new AC(), src = ctx.createMediaStreamSource(mic.stream), an = ctx.createAnalyser();
  an.fftSize = 1024; an.smoothingTimeConstant = 0.6; src.connect(an);
  const freq = new Uint8Array(an.frequencyBinCount), wave = new Uint8Array(an.fftSize);
  const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d', { willReadFrequently: true });
  const live = {
    kind: 'mic', canvas, ready: true, version: 0, level: 0, mirror: false, stream: mic.stream,
    /** n loudness values 0..1, low pitch to high, on a curve that gives the low end room (as hearing does) */
    bands(n = 8) {
      const out = new Array(n).fill(0), top = Math.floor(freq.length * 0.75);
      for (let i = 0; i < n; i++) {
        const a = Math.floor(Math.pow(i / n, 2) * top), b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / n, 2) * top));
        let m = 0; for (let j = a; j < b; j++) m = Math.max(m, freq[j]); out[i] = m / 255;
      }
      return out;
    },
    tick() {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      an.getByteFrequencyData(freq); an.getByteTimeDomainData(wave);
      let peak = 0; for (let i = 0; i < wave.length; i += 2) peak = Math.max(peak, Math.abs(wave[i] - 128));
      const v = Math.min(1, (peak / 128) * 1.6); live.level = v > live.level ? v : live.level * 0.85 + v * 0.15;
      g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
      const bars = live.bands(W / 2);
      for (let i = 0; i < bars.length; i++) {
        const h = Math.max(1, bars[i] * (H - 4)), hue = 200 - bars[i] * 160;
        g.fillStyle = `hsl(${hue} 80% ${25 + bars[i] * 40}%)`; g.fillRect(i * 2, H - h, 2, h);
      }
      g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1; g.beginPath();   // the wave on top
      for (let i = 0; i < wave.length; i += 4) { const x = (i / wave.length) * W, y = H * 0.25 + ((wave[i] - 128) / 128) * H * 0.22; i ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
      live.version++;
    },
    // (the controls a clip has; a microphone has none)
    setRate() {}, setVolume() {}, setLoop() {}, setRange() {},
    stop() { try { src.disconnect(); ctx.close(); } catch { /* closed */ } mic.release(); }
  };
  return live;
}
