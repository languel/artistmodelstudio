// A small Web Audio plucked-string voice and the scales that map beams to notes.
export const SCALES = {
  'pentatonic minor': [0, 3, 5, 7, 10], 'pentatonic major': [0, 2, 4, 7, 9], major: [0, 2, 4, 5, 7, 9, 11], 'natural minor': [0, 2, 3, 5, 7, 8, 10],
  hijaz: [0, 1, 4, 5, 7, 8, 10], 'whole tone': [0, 2, 4, 6, 8, 10], chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
};
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// @key Beams to notes | Beam i is the i-th note of the scale, climbing an octave each time the scale wraps.
export const noteMidi = (root, scale, i) => { const s = SCALES[scale]; return root + 12 * Math.floor(i / s.length) + s[i % s.length]; };
// @/key
export const midiHz = m => 440 * 2 ** ((m - 69) / 12);
export const noteName = m => NAMES[m % 12] + (Math.floor(m / 12) - 1);

export function createSynth() {
  let ctx = null, master = null; const state = { plucks: 0 };
  function init() {
    ctx = new AudioContext(); master = ctx.createGain(); master.gain.value = 0.6;
    const comp = ctx.createDynamicsCompressor(), delay = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
    delay.delayTime.value = 0.28; fb.gain.value = 0.35; wet.gain.value = 0.3;
    master.connect(comp); comp.connect(ctx.destination);
    master.connect(delay); delay.connect(fb); fb.connect(delay); delay.connect(wet); wet.connect(comp);   // an echo, for space
  }
  return {
    state,
    get running() { return ctx?.state === 'running'; },
    resume() { if (!ctx) init(); return ctx.resume(); },       // browsers only start audio after a click
    set volume(v) { if (master) master.gain.value = v; },
    // @key A plucked note | Two oscillators with a fast attack and a long exponential decay; a low-pass filter that closes after the strike makes it sound plucked, and harder hits are brighter.
    pluck(midi, velocity = 0.6, pan = 0) {
      if (!ctx || ctx.state !== 'running') return;
      const t = ctx.currentTime, f = midiHz(midi), v = Math.min(1, Math.max(0.15, velocity));
      const g = ctx.createGain(), lp = ctx.createBiquadFilter(), p = ctx.createStereoPanner();
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(600 + v * 5000, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.9);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.45 * v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
      p.pan.value = Math.max(-1, Math.min(1, pan));
      for (const [type, mul, amp] of [['triangle', 1, 1], ['sawtooth', 1.004, 0.35], ['sine', 2, 0.25]]) {
        const o = ctx.createOscillator(), a = ctx.createGain(); o.type = type; o.frequency.value = f * mul; a.gain.value = amp;
        o.connect(a); a.connect(lp); o.start(t); o.stop(t + 2);
      }
      lp.connect(g); g.connect(p); p.connect(master); state.plucks++;
    },
    // @/key
  };
}
