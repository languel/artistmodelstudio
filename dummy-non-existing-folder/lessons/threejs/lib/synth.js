// A sustained, organ-like voice in Web Audio, played for as long as a beam is interrupted, plus the scales that map beams to notes.
export const SCALES = {
  'modal minor (Rendez-Vous mood)': [0, 2, 3, 5, 7, 9, 10],          // Dorian: minor with a bright sixth
  'natural minor': [0, 2, 3, 5, 7, 8, 10], 'pentatonic minor': [0, 3, 5, 7, 10], 'pentatonic major': [0, 2, 4, 7, 9], major: [0, 2, 4, 5, 7, 9, 11],
  hijaz: [0, 1, 4, 5, 7, 8, 10], 'whole tone': [0, 2, 4, 6, 8, 10], chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// @key Beams to notes | Beam i is the i-th note of the scale, climbing an octave each time the scale wraps.
export const noteMidi = (root, scale, i) => { const s = SCALES[scale]; return root + 12 * Math.floor(i / s.length) + s[i % s.length]; };
// @/key
export const midiHz = m => 440 * 2 ** ((m - 69) / 12);
export const noteName = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);

export function createSynth() {
  let ctx = null, bus = null, reverbSend = null, voices = new Map(), organWave = null;
  // everything a player can change, read when a note starts (volume and reverb act live)
  const params = { attack: 0.25, release: 0.9, sustain: 0.8, wave: 'saw pad', cutLow: 250, cutHigh: 6500, q: 5, reverb: 0.35, volume: 0.6 };
  const state = { notes: 0 };

  function init() {
    ctx = new AudioContext();
    const comp = ctx.createDynamicsCompressor(), out = ctx.createGain(); out.gain.value = params.volume;
    bus = ctx.createGain(); bus.connect(out); out.connect(comp); comp.connect(ctx.destination); params.out = out;
    // a long reverb from decaying noise: the hall around the beams
    const len = ctx.sampleRate * 3.4, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-3.2 * i / len); }
    const conv = ctx.createConvolver(); conv.buffer = ir; reverbSend = ctx.createGain(); reverbSend.gain.value = params.reverb;
    bus.connect(reverbSend); reverbSend.connect(conv); conv.connect(out);
    // a slow echo on top
    const dl = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain(); dl.delayTime.value = 0.42; fb.gain.value = 0.38; wet.gain.value = 0.22;
    bus.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(out);
    // organ drawbars as a periodic wave: partials 1, 2, 3, 4, 6, 8
    const re = new Float32Array(9), im = new Float32Array(9); [[1, 1], [2, 0.8], [3, 0.55], [4, 0.45], [6, 0.3], [8, 0.2]].forEach(([n, a]) => im[n] = a);
    organWave = ctx.createPeriodicWave(re, im);
  }
  // cutoff in Hz for a height 0..1: exponential, so equal movements sound like equal sweeps
  const cutoff = h => params.cutLow * (params.cutHigh / params.cutLow) ** Math.min(1, Math.max(0, h));
  return {
    state, params,
    get running() { return ctx?.state === 'running'; },
    resume() { if (!ctx) init(); return ctx.resume(); },       // browsers only start audio after a click
    set(name, v) { params[name] = v; if (name === 'volume' && params.out) params.out.gain.value = v; if (name === 'reverb' && reverbSend) reverbSend.gain.value = v; },

    // @key A held note | Start: oscillators through a low-pass filter into a gain that fades in over the attack time. The filter's cutoff follows the hand's height.
    voiceOn(id, midi, h = 0.5, pan = 0) {
      if (!ctx || ctx.state !== 'running') return;
      this.voiceOff(id, true);
      const t = ctx.currentTime, f = midiHz(midi), g = ctx.createGain(), lp = ctx.createBiquadFilter(), p = ctx.createStereoPanner(), oscs = [];
      lp.type = 'lowpass'; lp.Q.value = params.q; lp.frequency.value = cutoff(h);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(params.sustain, t + Math.max(0.005, params.attack));
      p.pan.value = Math.max(-1, Math.min(1, pan));
      const layers = params.wave === 'organ' ? [['wave', 1, 0.7], ['sine', 0.5, 0.5], ['sine', 2, 0.25]]
        : params.wave === 'square' ? [['square', 1, 0.5], ['square', 1.004, 0.4], ['sine', 0.5, 0.5]]
        : [['sawtooth', 1, 0.45], ['sawtooth', 1.006, 0.4], ['sawtooth', 0.994, 0.4], ['sine', 0.5, 0.5]];   // detuned saws and a sub: the brassy pad of the original sound
      for (const [type, mul, amp] of layers) {
        const o = ctx.createOscillator(), a = ctx.createGain(); if (type === 'wave') o.setPeriodicWave(organWave); else o.type = type;
        o.frequency.value = f * mul; a.gain.value = amp; o.connect(a); a.connect(lp); o.start(t); oscs.push(o);
      }
      lp.connect(g); g.connect(p); p.connect(bus); voices.set(id, { g, lp, oscs }); state.notes++;
    },
    // @/key
    // @key Height is the filter sweep | While the beam is held, the cutoff glides to wherever the hand is: low on the beam is dark and muffled, high is bright and open.
    voiceMove(id, h) {
      const v = voices.get(id); if (!v) return;
      v.lp.frequency.setTargetAtTime(cutoff(h), ctx.currentTime, 0.04);
    },
    // @/key
    // @key Let go: the release | The gain fades out over the release time, then the oscillators are stopped. Letting go and pressing again overlaps the old tail with the new note.
    voiceOff(id, quick = false) {
      const v = voices.get(id); if (!v) return; voices.delete(id);
      const t = ctx.currentTime, rel = quick ? 0.05 : Math.max(0.03, params.release);
      v.g.gain.cancelScheduledValues(t); v.g.gain.setValueAtTime(v.g.gain.value, t); v.g.gain.setTargetAtTime(0, t, rel / 4);
      for (const o of v.oscs) o.stop(t + rel + 0.4);
    },
    // @/key
    allOff() { for (const id of [...voices.keys()]) this.voiceOff(id); },
  };
}
