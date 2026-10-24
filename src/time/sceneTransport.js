/**
 * The scene's transport settings, kept in the document as `doc.transport` (seconds, like the rest of
 * src/time). The playhead itself is TakePlayer's; these are what time means in this scene.
 *
 *   tempo       beats a minute (20..400)
 *   signature   { numerator, denominator }
 *   fps         frames a second, for the frame ruler
 *   ruler       'time' | 'beats' | 'frames'
 *   loop        { start, end } seconds; end <= start means "no range" (the whole take)
 *   quant       a time ('1 beat', '1 bar', '1 s', '0.5 beat'…) that path lengths are rounded to; '' for none
 *   mixer       the channel mixer and global scale (src/score/mixer.js)
 *   beatUnits   artboard units in one beat: a line this long takes a beat (25: one minor cell of the default grid)
 */
import { clampTempo, normalizeTimeSignature } from './transport.js';
import { normalizeMixer } from '../score/mixer.js';

export const RULERS = Object.freeze(['time', 'beats', 'frames']);
export const FPS_CHOICES = Object.freeze([24, 25, 30, 50, 60]);

export const DEFAULT_TRANSPORT = Object.freeze({
  tempo: 120,
  signature: Object.freeze({ numerator: 4, denominator: 4 }),
  fps: 30,
  ruler: 'time',
  beatUnits: 25,
  quant: '',
  mixer: Object.freeze(normalizeMixer(null)),
  loop: Object.freeze({ start: 0, end: 0 })
});

const num = (v, d) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : d);

export function normalizeTransport(t) {
  const s = t && typeof t === 'object' ? t : {};
  const start = Math.max(0, num(s.loop?.start, 0));
  const end = Math.max(0, num(s.loop?.end, 0));
  return {
    tempo: clampTempo(s.tempo ?? DEFAULT_TRANSPORT.tempo),
    signature: normalizeTimeSignature(s.signature),
    fps: FPS_CHOICES.includes(Number(s.fps)) ? Number(s.fps) : DEFAULT_TRANSPORT.fps,
    ruler: RULERS.includes(s.ruler) ? s.ruler : DEFAULT_TRANSPORT.ruler,
    beatUnits: num(s.beatUnits, 0) > 0 ? Math.min(10000, Math.max(0.01, num(s.beatUnits, 25))) : DEFAULT_TRANSPORT.beatUnits,
    quant: typeof s.quant === 'string' && s.quant.length < 24 ? s.quant.trim() : '',
    mixer: normalizeMixer(s.mixer),
    loop: end > start ? { start, end } : { start: 0, end: 0 }
  };
}

/** The loop range in seconds, or null when none is set. */
export const loopRange = t => (t.loop.end > t.loop.start ? [t.loop.start, t.loop.end] : null);

/** The time context the expression parser and the ruler need. */
export const timeContext = t => ({ tempo: t.tempo, signature: t.signature, fps: t.fps });

/** A length in beats as people say it: '1 bar', '2 bars', '3 beats', '1.5 beats'. */
export function formatLength(beats, perBar = 4) {
  const bars = beats / perBar;
  if (beats >= perBar - 1e-6 && Math.abs(bars - Math.round(bars)) < 1e-3) return `${Math.round(bars)} bar${Math.round(bars) === 1 ? '' : 's'}`;
  const b = Math.round(beats * 100) / 100;
  return `${b} beat${b === 1 ? '' : 's'}`;
}

/** A length in seconds as the scene's ruler reads time: seconds, bars and beats, or frames. */
export function formatDuration(seconds, t) {
  if (t.ruler === 'beats') return formatLength((seconds * t.tempo) / 60, t.signature.numerator);
  if (t.ruler === 'frames') return `${Math.round(seconds * t.fps)} f`;
  if (seconds >= 60) { const m = Math.floor(seconds / 60); return `${m}:${(seconds - m * 60).toFixed(1).padStart(4, '0')}`; }
  return `${Math.round(seconds * 100) / 100} s`;
}

/** The divisions a length can be rounded to: [value, label]. */
export const QUANT_CHOICES = Object.freeze([['', 'Free'], ['1 bar', 'Bar'], ['1 beat', 'Beat'], ['0.5 beat', '½ beat'], ['0.25 beat', '¼ beat'], ['1 s', 'Second'], ['1 frame', 'Frame']]);
