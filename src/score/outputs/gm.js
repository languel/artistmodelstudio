/**
 * The built-in sound: General MIDI through TinySynth (jzz-synth-tiny, MIT; TinySynth is g200kg's
 * webaudio-tinysynth), scheduled on the audio clock. A trimmed port of Underscores' internalMidiSynth.js, so a score can
 * be heard with no MIDI hardware. It takes raw MIDI bytes; both libraries load on the first use.
 *
 *   const gm = createGmOutput()
 *   await gm.resume()                     (from a click: browsers start audio only after one)
 *   gm.send([0x90, 60, 100], atMs)        atMs: a performance.now() time; omitted or past: now
 *   gm.setProgram(1, 24); gm.clear()
 *
 * Two things learned there: use an *unnamed* TinySynth port (a named one is a process-wide cache that
 * keeps stale voices), and never close the shared AudioContext, only the port.
 */
export const GM_PROGRAMS = Object.freeze([
  'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano', 'Honky-tonk Piano', 'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavinet',
  'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone', 'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
  'Drawbar Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ', 'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion',
  'Acoustic Guitar (nylon)', 'Acoustic Guitar (steel)', 'Electric Guitar (jazz)', 'Electric Guitar (clean)', 'Electric Guitar (muted)', 'Overdriven Guitar', 'Distortion Guitar', 'Guitar Harmonics',
  'Acoustic Bass', 'Electric Bass (finger)', 'Electric Bass (pick)', 'Fretless Bass', 'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2',
  'Violin', 'Viola', 'Cello', 'Contrabass', 'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani',
  'String Ensemble 1', 'String Ensemble 2', 'Synth Strings 1', 'Synth Strings 2', 'Choir Aahs', 'Voice Oohs', 'Synth Voice', 'Orchestra Hit',
  'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet', 'French Horn', 'Brass Section', 'Synth Brass 1', 'Synth Brass 2',
  'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax', 'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
  'Piccolo', 'Flute', 'Recorder', 'Pan Flute', 'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
  'Lead 1 (square)', 'Lead 2 (sawtooth)', 'Lead 3 (calliope)', 'Lead 4 (chiff)', 'Lead 5 (charang)', 'Lead 6 (voice)', 'Lead 7 (fifths)', 'Lead 8 (bass + lead)',
  'Pad 1 (new age)', 'Pad 2 (warm)', 'Pad 3 (polysynth)', 'Pad 4 (choir)', 'Pad 5 (bowed)', 'Pad 6 (metallic)', 'Pad 7 (halo)', 'Pad 8 (sweep)',
  'FX 1 (rain)', 'FX 2 (soundtrack)', 'FX 3 (crystal)', 'FX 4 (atmosphere)', 'FX 5 (brightness)', 'FX 6 (goblins)', 'FX 7 (echoes)', 'FX 8 (sci-fi)',
  'Sitar', 'Banjo', 'Shamisen', 'Koto', 'Kalimba', 'Bag Pipe', 'Fiddle', 'Shanai',
  'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock', 'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal',
  'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet', 'Telephone Ring', 'Helicopter', 'Applause', 'Gunshot'
]);

const PERCUSSION = 10;   // channel 10 (1-based) is drums

/**
 * TinySynth, scheduled on the audio clock: { send(bytes), sendAt(bytes, atMs), resume(), state() }.
 * jzz-synth-tiny is given a small stand-in for JZZ, whose AudioContext reads its `currentTime` a little
 * ahead while a message is sent: TinySynth then starts (or ends) the note at exactly that moment on the
 * audio clock, so what the scheduler sends ahead plays in time however busy the page is.
 */
export async function loadTinySynth() {
  const { default: installTinySynth } = await import('jzz-synth-tiny');
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  if (!AC) throw new Error('Web Audio is not available in this browser.');
  const real = loadTinySynth.ctx ||= new AC({ latencyHint: 'interactive' });   // (one context for the page: never closed)
  let ahead = 0;
  const ctx = new Proxy(real, {
    get(t, k) {
      if (k === 'currentTime') return t.currentTime + ahead;
      const v = Reflect.get(t, k, t);
      return typeof v === 'function' ? v.bind(t) : v;
    }
  });
  const fake = { synth: {}, lib: {
    getAudioContext: () => ctx,
    openMidiOut: (name, engine) => { const port = { _crash: e => { throw new Error(String(e)); }, _resume() {} }; engine._openOut(port, name); return port; },
    registerMidiOut: () => false
  } };
  installTinySynth(fake);
  const port = fake.synth.Tiny();
  const send = data => port._receive(data);
  return {
    send,
    sendAt: (data, atMs) => { ahead = Math.max(0, (atMs - performance.now()) / 1000); try { send(data); } finally { ahead = 0; } },
    resume: () => real.resume(), state: () => real.state, close: () => {}
  };
}

export function createGmOutput({
  backend = loadTinySynth, now = () => performance.now(),
  setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = t => clearTimeout(t), programs = {}
} = {}) {
  let be = null, loading = null;
  const timers = new Set();
  const prog = { ...programs };   // channel (1-based) → program 0..127
  const now1 = data => { if (be) be.send(Array.from(data, v => Number(v) & 0xff)); };

  const start = () => (loading ||= Promise.resolve(backend()).then(b => {
    be = b;
    for (const ch of Object.keys(prog)) now1([0xc0 | (ch - 1), prog[ch]]);
    return out;
  }).catch(e => { loading = null; throw e; }));

  const out = {
    id: 'gm', name: 'Built-in GM sound',
    /** Load the synth and start the audio context: call from a user gesture. */
    async resume() { await start(); await be.resume?.(); return be.state?.() || 'running'; },
    get ready() { return Boolean(be); },
    send(bytes, atMs) {
      if (!be) return;   // (not started: nothing sounds, nothing is queued)
      const delay = Number(atMs) - now();
      // Soon (what the scheduler sends ahead): on the audio clock, exactly. Later (a long note's end): a timer.
      if (be.sendAt && Number.isFinite(delay) && delay > 1 && delay < 3000) { be.sendAt(Array.from(bytes, v => Number(v) & 0xff), atMs); return; }
      if (Number.isFinite(delay) && delay > 1) {
        const t = setTimer(() => { timers.delete(t); now1(bytes); }, delay);
        timers.add(t);
      } else now1(bytes);
    },
    setProgram(channel, program) {
      prog[channel] = Math.max(0, Math.min(127, Math.round(program)));
      if (channel !== PERCUSSION && be) now1([0xc0 | (channel - 1), prog[channel]]);
    },
    /** Stop everything now: pending notes dropped; sustain, sound and notes off on every channel. */
    clear() {
      for (const t of timers) clearTimer(t);
      timers.clear();
      if (!be) return;
      for (let c = 0; c < 16; c++) for (const n of [64, 120, 123]) now1([0xb0 | c, n, 0]);
    },
    async close() { out.clear(); const b = be; be = null; loading = null; await b?.close?.(); }
  };
  return out;
}

/** An output that only remembers what it was sent (tests, and a score's dry run). */
export function createLogOutput() {
  const sent = [];
  return { id: 'log', name: 'Log', sent, send: (bytes, atMs) => sent.push({ bytes: [...bytes], atMs }), clear() { sent.push({ clear: true }); }, async resume() { return 'running'; } };
}
