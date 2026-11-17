/**
 * Instrument presets and the drum synth's eight voices, ported from genereti (integrations/genereti_comfy_chop/web/synth-presets.js).
 * Presets are plain settings, so factory and saved patches live in the scene.
 */

export const DRUM_VOICES = [
  {
    name: "kick",
    note: 36,
    wave: "sine",
    level: 1,
    noise: 0,
    decay: 0.36,
    noise_decay: 0.08,
    freq_start: 150,
    freq_end: 45,
    pitch_decay: 0.1,
    cutoff: 12000,
  },
  {
    name: "snare",
    note: 38,
    wave: "triangle",
    level: 0.65,
    noise: 0.75,
    decay: 0.16,
    noise_decay: 0.17,
    freq_start: 240,
    freq_end: 150,
    pitch_decay: 0.05,
    cutoff: 3500,
  },
  {
    name: "hat",
    note: 42,
    wave: "square",
    level: 0.12,
    noise: 0.8,
    decay: 0.045,
    noise_decay: 0.06,
    freq_start: 7200,
    freq_end: 6000,
    pitch_decay: 0.03,
    cutoff: 10000,
  },
  {
    name: "open",
    note: 46,
    wave: "square",
    level: 0.12,
    noise: 0.7,
    decay: 0.28,
    noise_decay: 0.38,
    freq_start: 6800,
    freq_end: 5400,
    pitch_decay: 0.08,
    cutoff: 11000,
  },
  {
    name: "low tom",
    note: 41,
    wave: "sine",
    level: 0.8,
    noise: 0.1,
    decay: 0.27,
    noise_decay: 0.07,
    freq_start: 180,
    freq_end: 80,
    pitch_decay: 0.12,
    cutoff: 8500,
  },
  {
    name: "high tom",
    note: 45,
    wave: "sine",
    level: 0.75,
    noise: 0.1,
    decay: 0.22,
    noise_decay: 0.06,
    freq_start: 260,
    freq_end: 130,
    pitch_decay: 0.09,
    cutoff: 9000,
  },
  {
    name: "clap",
    note: 39,
    wave: "triangle",
    level: 0.12,
    noise: 0.9,
    decay: 0.1,
    noise_decay: 0.22,
    freq_start: 600,
    freq_end: 400,
    pitch_decay: 0.05,
    cutoff: 5000,
  },
  {
    name: "bell",
    note: 56,
    wave: "square",
    level: 0.5,
    noise: 0.05,
    decay: 0.22,
    noise_decay: 0.08,
    freq_start: 800,
    freq_end: 540,
    pitch_decay: 0.07,
    cutoff: 7000,
  },
];
export function readDrumVoices(text, overrides = {}) {
  let data;
  try {
    data = typeof text === "string" && text.trim() ? JSON.parse(text) : text;
  } catch {
    data = null;
  }
  const list = Array.isArray(data) ? data : data?.voices;
  return DRUM_VOICES.map((base, i) => {
    const raw = Array.isArray(list) ? (list[i] ?? {}) : {};
    const out = { ...base };
    for (const key of Object.keys(base))
      if (raw[key] !== undefined && typeof raw[key] === typeof base[key] && (typeof raw[key] !== "number" || Number.isFinite(raw[key])))
        out[key] = raw[key];
    for (const key of Object.keys(base)) {
      const value = overrides[`voice_${i + 1}_${key}`];
      if (value !== undefined && typeof value === typeof base[key] && (typeof value !== "number" || Number.isFinite(value)))
        out[key] = value;
    }
    return out;
  });
}
const kit = (fn) => JSON.stringify({ version: 1, voices: DRUM_VOICES.map((v, i) => ({ ...v, ...fn(v, i) })) });
export const FACTORY_PRESETS = {
  Synth: {
    "Warm keys": {
      voice: "subtractive",
      wave: "triangle",
      level: 0.35,
      attack: 0.012,
      decay: 0.32,
      sustain: 0.35,
      release: 0.45,
      cutoff: 1800,
      resonance: 0.7,
      glide: 0,
      vibrato: 0,
      filter_env: 0.3,
    },
    "FM bell": {
      voice: "fm",
      wave: "sine",
      level: 0.3,
      attack: 0.003,
      decay: 1.1,
      sustain: 0.05,
      release: 0.7,
      cutoff: 12000,
      resonance: 0.7,
      glide: 0,
      vibrato: 0,
      filter_env: 0,
      fm_ratio: 3.5,
      fm_index: 2.2,
    },
    "Soft pad": {
      voice: "subtractive",
      wave: "sawtooth",
      level: 0.2,
      attack: 0.8,
      decay: 0.8,
      sustain: 0.7,
      release: 1.2,
      cutoff: 1100,
      resonance: 0.6,
      glide: 0,
      vibrato: 0.08,
      vibrato_rate: 4,
      filter_env: 0.2,
    },
    Bass: {
      voice: "subtractive",
      wave: "sawtooth",
      level: 0.35,
      attack: 0.005,
      decay: 0.22,
      sustain: 0.3,
      release: 0.16,
      cutoff: 700,
      resonance: 2,
      glide: 0.03,
      vibrato: 0,
      filter_env: 0.7,
    },
    Reed: {
      voice: "reed",
      wave: "auto",
      level: 0.25,
      attack: 0.06,
      decay: 0.2,
      sustain: 0.65,
      release: 0.25,
      cutoff: 2400,
      resonance: 1,
      glide: 0,
      vibrato: 0.08,
      vibrato_rate: 5,
      filter_env: 0.1,
    },
  },
  Karplus: {
    "Plucked string": { level: 0.35, decay: 1.2, damping: 0.5, polyphony: 8 },
    "Muted pluck": { level: 0.4, decay: 0.35, damping: 0.15, polyphony: 8 },
    "Bright harp": { level: 0.3, decay: 3.2, damping: 0.85, polyphony: 12 },
  },
  Granular: {
    "Soft cloud": { level: 0.25, grain_size: 0.08, density: 16, spread: 0.25, release: 0.4, polyphony: 8 },
    Shimmer: { level: 0.2, grain_size: 0.045, density: 30, spread: 0.8, release: 0.8, polyphony: 8 },
  },
  DrumKit: {
    Tight: { level: 0.4, decay: 0.12, tone: 1.15 },
    Deep: { level: 0.4, decay: 0.35, tone: 0.7 },
    Bright: { level: 0.32, decay: 0.2, tone: 1.6 },
  },
  DrumSynth: {
    "Electronic kit": { level: 0.4, kit: kit(() => ({})) },
    "Soft kit": {
      level: 0.4,
      kit: kit((v) => ({
        wave: v.note === 42 ? "triangle" : v.wave,
        noise: v.noise * 0.55,
        decay: v.decay * 1.2,
        cutoff: v.cutoff * 0.65,
      })),
    },
    "Punchy kit": {
      level: 0.4,
      kit: kit((v) => ({ decay: v.decay * 0.65, noise_decay: v.noise_decay * 0.7, freq_start: v.freq_start * 1.3 })),
    },
  },
};
