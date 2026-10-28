// Synthesised drum voices in Web Audio. Each voice is a short sound built from an oscillator, noise, or both,
// shaped by a fast envelope. level (0..1) sets loudness and brightness; pan places it left to right.
export const VOICES = ['kick', 'snare', 'tomHigh', 'tomLow', 'hatClosed', 'hatOpen', 'clap', 'wood', 'conga', 'bell', 'stomp'];

export function createDrums() {
  let ctx = null, bus = null, noise = null;
  const params = { tune: 0, decay: 1, reverb: 0.2, volume: 0.8 };
  let reverbSend = null, out = null;
  function init() {
    ctx = new AudioContext(); out = ctx.createGain(); out.gain.value = params.volume;
    const comp = ctx.createDynamicsCompressor(); bus = ctx.createGain(); bus.connect(out); out.connect(comp); comp.connect(ctx.destination);
    const n = ctx.sampleRate * 1; noise = ctx.createBuffer(1, n, ctx.sampleRate); const d = noise.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const len = ctx.sampleRate * 1.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);     // a small room
    for (let c = 0; c < 2; c++) { const x = ir.getChannelData(c); for (let i = 0; i < len; i++) x[i] = (Math.random() * 2 - 1) * Math.exp(-5 * i / len); }
    const conv = ctx.createConvolver(); conv.buffer = ir; reverbSend = ctx.createGain(); reverbSend.gain.value = params.reverb; bus.connect(reverbSend); reverbSend.connect(conv); conv.connect(out);
  }
  const semis = () => 2 ** (params.tune / 12);
  // building blocks
  function tone(t, { f0, f1 = f0, dur, gain, type = 'sine', out: dest }) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f0 * semis(), t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1 * semis()), t + dur * 0.4);
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.05);
  }
  function hiss(t, { type = 'bandpass', freq, q = 1, dur, gain, delay = 0, out: dest }) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain(); s.buffer = noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(gain, t + delay); g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur); s.connect(f); f.connect(g); g.connect(dest); s.start(t + delay, Math.random() * 0.5, dur + 0.05);
  }
  // @key The drum voices | Each is a few lines: a pitch that falls fast (kick, toms, congas), noise through a filter (snare, hats, clap), or a pair of short sine tones (wood, bell). Harder hits are louder and brighter.
  const D = params;
  const voices = {
    kick: (t, l, o) => { tone(t, { f0: 160, f1: 45, dur: 0.38 * D.decay, gain: 0.9 * l, out: o }); hiss(t, { type: 'highpass', freq: 3000, dur: 0.015, gain: 0.25 * l, out: o }); },
    stomp: (t, l, o) => { tone(t, { f0: 110, f1: 38, dur: 0.5 * D.decay, gain: 1 * l, out: o }); hiss(t, { type: 'lowpass', freq: 400, dur: 0.12, gain: 0.5 * l, out: o }); },
    snare: (t, l, o) => { tone(t, { f0: 200, f1: 150, dur: 0.12 * D.decay, gain: 0.5 * l, type: 'triangle', out: o }); hiss(t, { freq: 1800 + 2500 * l, q: 0.7, dur: 0.2 * D.decay, gain: 0.8 * l, out: o }); },
    tomHigh: (t, l, o) => tone(t, { f0: 260, f1: 160, dur: 0.35 * D.decay, gain: 0.8 * l, out: o }),
    tomLow: (t, l, o) => tone(t, { f0: 170, f1: 95, dur: 0.45 * D.decay, gain: 0.9 * l, out: o }),
    hatClosed: (t, l, o) => hiss(t, { type: 'highpass', freq: 7000, dur: 0.05 * D.decay, gain: 0.55 * l, out: o }),
    hatOpen: (t, l, o) => hiss(t, { type: 'highpass', freq: 6000, dur: 0.38 * D.decay, gain: 0.5 * l, out: o }),
    clap: (t, l, o) => { for (const d of [0, 0.012, 0.026]) hiss(t, { freq: 1300, q: 1.2, dur: 0.02, gain: 0.7 * l, delay: d, out: o }); hiss(t, { freq: 1300, q: 1.2, dur: 0.2 * D.decay, gain: 0.5 * l, delay: 0.035, out: o }); },
    wood: (t, l, o) => { tone(t, { f0: 880, f1: 860, dur: 0.07 * D.decay, gain: 0.6 * l, out: o }); tone(t, { f0: 1320, f1: 1300, dur: 0.04, gain: 0.3 * l, out: o }); },
    conga: (t, l, o) => { tone(t, { f0: 330, f1: 220, dur: 0.26 * D.decay, gain: 0.8 * l, out: o }); hiss(t, { freq: 2200, q: 2, dur: 0.03, gain: 0.3 * l, out: o }); },
    bell: (t, l, o) => { tone(t, { f0: 1760, f1: 1750, dur: 0.9 * D.decay, gain: 0.3 * l, out: o }); tone(t, { f0: 2640, f1: 2630, dur: 0.6 * D.decay, gain: 0.18 * l, out: o }); },
  };
  // @/key
  return {
    params,
    get running() { return ctx?.state === 'running'; },
    resume() { if (!ctx) init(); return ctx.resume(); },       // browsers only start audio after a click
    set(name, v) { params[name] = v; if (name === 'volume' && out) out.gain.value = v; if (name === 'reverb' && reverbSend) reverbSend.gain.value = v; },
    hit(voice, level = 0.7, pan = 0) {
      if (!ctx || ctx.state !== 'running' || !voices[voice]) return;
      const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(bus);
      voices[voice](ctx.currentTime, Math.min(1, Math.max(0.05, level)), p);
    },
  };
}
