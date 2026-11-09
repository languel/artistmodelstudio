/**
 * Choosing a signal of the sound: the same menu everywhere a parameter can follow it (the keyframe dot, a lane on the Timeline).
 *   signalMenu(current, pick) → menu items; `pick(name)` is called with the signal chosen.
 * Names: level, pitch, clarity, bass, mid, treble, onset, centroid, band0..band7 (eight groups of the spectrum), fft0..fft63 (one band).
 */
import { askText } from './dialog.js';

export const SIGNAL_NAME = { level: 'Loudness', pitch: 'Pitch', clarity: 'Pitch clarity', bass: 'Bass', mid: 'Mid', treble: 'Treble', onset: 'Onsets', centroid: 'Brightness' };
export const signalName = n => SIGNAL_NAME[n] || (/^band(\d)$/.test(n) ? `Band ${+n.slice(4) + 1} of 8` : /^fft(\d+)$/.test(n) ? `FFT band ${+n.slice(3)}` : n);

export function signalMenu(current, pick) {
  return [
    ...Object.entries(SIGNAL_NAME).map(([n, label]) => ({ label, active: current === n, run: () => pick(n) })),
    '-',
    { label: 'Spectrum', hint: 'The FFT: eight bands from low to high, or one of its 64 bands', items: [
      ...Array.from({ length: 8 }, (_, k) => ({ label: `Band ${k + 1} of 8${k === 0 ? ' (lowest)' : k === 7 ? ' (highest)' : ''}`, active: current === `band${k}`, run: () => pick(`band${k}`) })),
      '-',
      { label: 'One FFT band (0 to 63)…', active: /^fft/.test(current || ''), run: async () => { const v = await askText('FFT band, 0 (lowest) to 63 (highest)', /^fft(\d+)$/.test(current || '') ? current.slice(3) : '8'); const k = Math.round(Number(v)); if (v !== null && Number.isFinite(k) && k >= 0 && k <= 63) pick(`fft${k}`); } }
    ] }
  ];
}
