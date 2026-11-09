import { describe, it, expect } from 'vitest';
import { analyseSamples, signalAt, spectrumAt, onsetsOf, tempoOf, BINS, RATE } from './audioAnalysis.js';

const seconds = (s, f) => Float32Array.from({ length: Math.round(s * RATE) }, (_, i) => f(i / RATE));
const run = s => analyseSamples(s, RATE, { yieldEvery: 0 });

describe('listening to a sound', () => {
  it('puts the energy of a low tone in the low bands and a high tone in the high ones', async () => {
    const low = await run(seconds(1, t => 0.5 * Math.sin(2 * Math.PI * 100 * t)));
    const high = await run(seconds(1, t => 0.5 * Math.sin(2 * Math.PI * 5000 * t)));
    const peak = a => { const s = spectrumAt(a, 500); return s.indexOf(Math.max(...s)); };
    expect(peak(low)).toBeLessThan(BINS * 0.3);
    expect(peak(high)).toBeGreaterThan(BINS * 0.7);
    expect(signalAt(low, 'bass', 500)).toBeGreaterThan(signalAt(low, 'treble', 500) * 3);
    expect(signalAt(high, 'treble', 500)).toBeGreaterThan(signalAt(high, 'bass', 500) * 3);
    expect(signalAt(high, 'centroid', 500)).toBeGreaterThan(signalAt(low, 'centroid', 500));
  });
  it('level follows loudness and is 0 outside the sound', async () => {
    const a = await run(seconds(2, t => (t < 1 ? 0.05 : 0.5) * Math.sin(2 * Math.PI * 440 * t)));
    expect(signalAt(a, 'level', 1500)).toBeGreaterThan(signalAt(a, 'level', 500) * 3);
    expect(signalAt(a, 'level', -50)).toBe(0);
    expect(signalAt(a, 'level', 99999)).toBe(0);
    expect(a.duration).toBe(2000);
  });
  it('finds the starts of clicks and their tempo', async () => {
    // a click every 500 ms (120 beats a minute), for 12 s
    const a = await run(seconds(12, t => { const p = (t % 0.5); return p < 0.03 ? 0.9 * Math.sin(2 * Math.PI * 800 * p) * (1 - p / 0.03) : 0; }));
    const ons = onsetsOf(a);
    expect(ons.length).toBeGreaterThan(18);
    expect(Math.abs((ons[5] - ons[4]) - 500)).toBeLessThan(60);
    expect(Math.min(...ons.map(t => Math.abs(t - 2000)))).toBeLessThanOrEqual(25);   // (a click at 2.0 s is heard there, not 40 ms before)
    expect(Math.abs(tempoOf(a) - 120)).toBeLessThanOrEqual(3);
  });
  it('is silent for silence', async () => {
    const a = await run(new Float32Array(RATE));
    expect(signalAt(a, 'level', 500)).toBe(0);
    expect(onsetsOf(a)).toEqual([]);
    expect(tempoOf(a)).toBeNull();
  });
});
