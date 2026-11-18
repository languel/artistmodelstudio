/**
 * The modular sound engine, ported from genereti (integrations/genereti_comfy_chop/web/modular-audio.js): a graph of
 * modules (instruments, effects, a mixer, an output) as native Web Audio nodes. sync(defs, outputs) makes the graph match
 * a description (modules are kept, made, changed or removed; cables connected and disconnected), so editing a patch never
 * restarts the sound. trigger(id, note, time, duration, velocity) plays a voice on an instrument, on the audio clock.
 * The patch as data, its defaults and its sequencers are in patch.js; the studio side is src/workbench/patchPlayer.js.
 * (genereti's analysis modules are not ported: the studio has its own, in workbench/audioAnalysis.js.)
 */
import { readDrumVoices } from "./presets.js";
import { encodeWav } from "./wav.js";
const ANALYSIS_KINDS = new Set();
const analysisFrame = () => null;
// Native Web Audio graph: bus connections retain AudioNodes, never PCM copies.
const clamp = (n, a, b) => Math.max(a, Math.min(b, Number(n) || 0));
const hz = (n) => 440 * 2 ** ((n - 69) / 12);
const targets = new WeakMap();
function smooth(p, value, now) {
  if (!targets.has(p)) p.setValueAtTime(value, now);
  else if (targets.get(p) !== value) p.setTargetAtTime(value, now, 0.015);
  targets.set(p, value);
}
export const INSTRUMENT_KINDS = Object.freeze(["Synth", "DrumKit", "DrumSynth", "Karplus", "Granular", "Sampler"]);
const IS_INSTRUMENT = new Set(INSTRUMENT_KINDS);
/** LFO cycles in beats when synced (patch.js LFO_SYNC). */
const SYNC_BEATS = { "1/16": 0.25, "1/8": 0.5, "1/4": 1, "1/2": 2, "1 bar": 4, "2 bars": 8, "4 bars": 16 };
/**
 * How far a modulation cable moves a setting at full swing (amount 1, a source at ±1): the setting's own value for what
 * scales (a frequency, a level), a fixed span for the rest. An LFO's depth scales its swing before this.
 */
function modSpan(kind, param, s) {
  if (param === "freq") return Math.max(1, Number(s.freq) || 110);
  if (param === "cutoff") return Math.max(20, Number(s.cutoff) || 1000) * 0.9;
  if (param === "level") return (Number(s.level) || 0.5) * (IS_INSTRUMENT.has(kind) ? 0.3 : 1);
  if (param === "master" || param === "rate" || param === "seconds") return Math.max(0.01, Number(s[param]) || 0.5) * 0.5;
  return { detune: 1200, resonance: 6, pan: 1, feedback: 0.4, mix: 0.5, depth: 0.5 }[param] ?? 1;
}
/** A second of coloured noise (looped). */
function noiseBuffer(c, color) {
  const n = c.sampleRate * 2, b = c.createBuffer(1, n, c.sampleRate), a = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (color === "pink") { b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913; a[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2; }
    else if (color === "brown") { last = (last + 0.02 * w) / 1.02; a[i] = last * 3.5; }
    else a[i] = w;
  }
  return b;
}
export class AudioPatch {
  constructor(ctx) {
    this.ctx = ctx;
    this.modules = new Map();
    this.edges = new Map();
    this.waveformTaps = new Map();
    this.mods = new Map();        // modulation cables: key → { from, gain, param }
    this.noise = null;
    this.tempo = 120;             // (LFOs synced to the Timeline; the player sets it)
    this.buffers = new Map();     // Sampler: a sample's name → AudioBuffer | Promise | null
    this.fetchSample = null;      // async name → ArrayBuffer (the studio gives it: the Media library)
  }
  /** A sample, decoded (once); null when there is none. */
  loadSample(name) {
    if (!name) return null;
    if (this.buffers.has(name)) return this.buffers.get(name);
    if (!this.fetchSample) return null;
    const p = Promise.resolve()
      .then(() => this.fetchSample(name))
      .then((bytes) => (bytes ? this.ctx.decodeAudioData(bytes) : null))
      .catch(() => null)
      .then((buf) => { this.buffers.set(name, buf); return buf; });
    this.buffers.set(name, p);
    return p;
  }
  /** Wait for every sample the Samplers want (before a render books its notes). */
  async prepare() {
    await Promise.all([...this.modules.values()].filter((m) => m.kind === "Sampler").map((m) => this.loadSample(m.settings.sample)));
  }
  sync(defs, outputs) {
    const wanted = new Set(),
      visiting = new Set();
    const visit = (id) => {
      if (visiting.has(id)) throw Error("Audio cable cycles are unsupported; use audio.delay for feedback");
      if (wanted.has(id)) return;
      const d = defs.get(id);
      if (!d) return;
      visiting.add(id);
      for (const source of Object.values(d.inputs ?? {})) visit(source);
      visiting.delete(id);
      wanted.add(id);
    };
    for (const id of outputs) visit(id);
    for (const [id, m] of this.modules)
      if (!wanted.has(id)) {
        this.removeWaveformTap(id);
        this.dispose(m);
        this.modules.delete(id);
      }
    for (const id of wanted) {
      const d = defs.get(id);
      let m = this.modules.get(id);
      if (m && m.kind !== d.kind) {
        this.removeWaveformTap(id);
        this.dispose(m);
        this.modules.delete(id);
        m = null;
      }
      if (!m) {
        m = this.create(d.kind);
        this.modules.set(id, m);
      }
      m.settings = d.settings;
      this.update(m, d.settings);
    }
    const next = new Map(), nextMods = new Map();
    for (const id of wanted) {
      const d = defs.get(id),
        m = this.modules.get(id);
      for (const [slot, source] of Object.entries(d.inputs ?? {})) {
        const from = this.modules.get(source)?.output;
        if (slot.startsWith("mod:")) {   // modulation: through its own gain (amount × span) into the setting
          const param = slot.slice(4), to = m.params?.[param];
          if (from && to) nextMods.set(`${source}:${id}:${slot}`, { from, to, scale: (d.amounts?.[slot] ?? 1) * modSpan(m.kind, param, d.settings) });
          continue;
        }
        if (m.kind === "Merge" && from && !m.inputs[slot]) {
          const input = this.ctx.createGain();
          m.nodes.push(input);
          input.connect(m.output);
          m.inputs[slot] = input;
        }
        const to = m.inputs[slot];
        if (from && to) next.set(`${source}:${id}:${slot}`, { from, to });
      }
      if (outputs.has(id) && m.kind === "Output") next.set(`${id}:destination`, { from: m.output, to: this.ctx.destination });
    }
    for (const [key, e] of this.edges)
      if (!next.has(key) || next.get(key).from !== e.from || next.get(key).to !== e.to) {
        try {
          e.from.disconnect(e.to);
        } catch {}
      }
    for (const [key, e] of next)
      if (!this.edges.has(key) || this.edges.get(key).from !== e.from || this.edges.get(key).to !== e.to) e.from.connect(e.to);
    this.edges = next;
    for (const [key, g] of this.mods) {
      const n = nextMods.get(key);
      if (n && n.from === g.from && n.to === g.to) continue;
      try { g.from.disconnect(g.gain); } catch {}
      g.gain.disconnect();
      this.mods.delete(key);
    }
    for (const [key, n] of nextMods) {
      let g = this.mods.get(key);
      if (!g) {
        g = { from: n.from, to: n.to, gain: this.ctx.createGain() };
        n.from.connect(g.gain);
        g.gain.connect(n.to);
        this.mods.set(key, g);
      }
      smooth(g.gain.gain, n.scale, this.ctx.currentTime);
    }
  }
  create(kind) {
    const c = this.ctx,
      m = { kind, nodes: [], inputs: {}, voices: new Set(), held: new Map() };
    const make = (method) => {
      const n = c[method]();
      m.nodes.push(n);
      return n;
    };
    m.output = make("createGain");
    m.params = { level: m.output.gain };
    if (IS_INSTRUMENT.has(kind)) return m;
    if (kind === "Osc" || kind === "LFO") {
      m.osc = make("createOscillator");
      m.osc.connect(m.output);
      m.osc.start();
      m.params = kind === "Osc" ? { freq: m.osc.frequency, detune: m.osc.detune, level: m.output.gain } : { rate: m.osc.frequency, depth: m.output.gain };
      return m;
    }
    if (kind === "Noise") return m;   // (its source is made when its colour is known: update)
    if (kind === "Merge") return m;
    if (kind === "Mixer") {
      m.meters = [];
      for (let i = 1; i <= 8; i++) {
        const gain = make("createGain"),
          pan = make("createStereoPanner"),
          meter = make("createAnalyser");
        meter.fftSize = 256;
        gain.connect(pan);
        pan.connect(m.output);
        pan.connect(meter);
        m.inputs[`input_${i}`] = gain;
        m[`pan_${i}`] = pan;
        m.params.master = m.output.gain;
        m.meters.push(meter);
      }
      m.masterMeter = make("createAnalyser");
      m.masterMeter.fftSize = 256;
      m.output.connect(m.masterMeter);
      m.meterBuffer = new Float32Array(256);
      return m;
    }
    const input = make("createGain");
    m.inputs.input = input;
    if (kind === "Gain") {
      m.pan = make("createStereoPanner");
      input.connect(m.pan);
      m.pan.connect(m.output);
      m.params.pan = m.pan.pan;
    } else if (kind === "Filter") {
      m.filter = make("createBiquadFilter");
      input.connect(m.filter);
      m.filter.connect(m.output);
      m.params = { cutoff: m.filter.frequency, resonance: m.filter.Q };
    } else if (kind === "Delay") {
      m.delay = c.createDelay(2);
      m.nodes.push(m.delay);
      m.feedback = make("createGain");
      m.wet = make("createGain");
      m.dry = make("createGain");
      input.connect(m.dry);
      m.dry.connect(m.output);
      input.connect(m.delay);
      m.delay.connect(m.feedback);
      m.feedback.connect(m.delay);
      m.delay.connect(m.wet);
      m.wet.connect(m.output);
      m.params = { seconds: m.delay.delayTime, feedback: m.feedback.gain, mix: m.wet.gain };
    } else if (kind === "Reverb" || kind === "Distortion") {
      m.wet = make("createGain");
      m.dry = make("createGain");
      m.effect = make(kind === "Reverb" ? "createConvolver" : "createWaveShaper");
      input.connect(m.dry);
      m.dry.connect(m.output);
      input.connect(m.effect);
      m.effect.connect(m.wet);
      m.wet.connect(m.output);
      m.params = { mix: m.wet.gain };
    } else if (ANALYSIS_KINDS.has(kind)) {
      input.channelCount = 2;
      input.channelCountMode = "explicit";
      input.connect(m.output);
      m.split = c.createChannelSplitter(2);
      m.nodes.push(m.split);
      input.connect(m.split);
      m.analysers = [make("createAnalyser"), make("createAnalyser")];
      m.analysers.forEach((a, i) => m.split.connect(a, i));
    } else if (kind === "Output") {
      m.compressor = make("createDynamicsCompressor");
      m.analyser = make("createAnalyser");
      m.analyser.fftSize = 512;
      m.samples = new Float32Array(512);
      input.connect(m.compressor);
      m.compressor.connect(m.output);
      m.output.connect(m.analyser);
    } else input.connect(m.output);
    return m;
  }
  update(m, s) {
    if (ANALYSIS_KINDS.has(m.kind)) {
      const size = Number(s.fft_size) || 1024;
      for (const a of m.analysers) {
        a.fftSize = size;
        a.smoothingTimeConstant = clamp(s.smoothing, 0, 0.99);
      }
      if (m.left?.length !== size) {
        m.left = new Float32Array(size);
        m.right = new Float32Array(size);
        m.db = new Float32Array(size / 2);
        m.dbRight = new Float32Array(size / 2);
      }
      return;
    }
    const now = this.ctx.currentTime;
    if (m.kind === "Osc") {
      m.osc.type = ["sine", "triangle", "sawtooth", "square"].includes(s.wave) ? s.wave : "sine";
      smooth(m.osc.frequency, clamp(s.freq, 0.1, 8000), now);
      smooth(m.osc.detune, clamp(s.detune, -1200, 1200), now);
      smooth(m.output.gain, clamp(s.level, 0, 1), now);
      return;
    }
    if (m.kind === "LFO") {
      m.osc.type = ["sine", "triangle", "sawtooth", "square"].includes(s.wave) ? s.wave : "sine";
      const beats = SYNC_BEATS[s.sync];
      smooth(m.osc.frequency, beats ? this.tempo / 60 / beats : clamp(s.rate, 0.01, 40), now);
      smooth(m.output.gain, clamp(s.depth, 0, 1), now);
      return;
    }
    if (m.kind === "Noise") {
      if (m.color !== s.color) {
        if (m.src) { try { m.src.stop(); } catch {} m.src.disconnect(); }
        m.src = this.ctx.createBufferSource();
        m.src.buffer = noiseBuffer(this.ctx, s.color);
        m.src.loop = true;
        m.src.connect(m.output);
        m.src.start();
        m.color = s.color;
      }
      smooth(m.output.gain, clamp(s.level, 0, 1), now);
      return;
    }
    if (m.kind === "Sampler") this.loadSample(s.sample);
    if (m.kind === "Mixer") {
      const solo = [1, 2, 3, 4, 5, 6, 7, 8].some((i) => s[`solo_${i}`]);
      for (let i = 1; i <= 8; i++) {
        smooth(m.inputs[`input_${i}`].gain, s[`mute_${i}`] || (solo && !s[`solo_${i}`]) ? 0 : clamp(s[`level_${i}`], 0, 2), now);
        smooth(m[`pan_${i}`].pan, clamp(s[`pan_${i}`], -1, 1), now);
      }
      smooth(m.output.gain, clamp(s.master, 0, 1), now);
    } else if (m.kind === "Gain" || m.kind === "Output") {
      smooth(m.output.gain, s.mute ? 0 : clamp(s.level, 0, 2), now);
      if (m.pan) smooth(m.pan.pan, clamp(s.pan, -1, 1), now);
    } else if (m.kind === "Filter") {
      m.filter.type = s.mode;
      smooth(m.filter.frequency, clamp(s.cutoff, 20, 18000), now);
      smooth(m.filter.Q, clamp(s.resonance, 0.1, 12), now);
    } else if (m.kind === "Delay") {
      smooth(m.delay.delayTime, clamp(s.seconds, 0.01, 2), now);
      smooth(m.feedback.gain, clamp(s.feedback, 0, 0.85), now);
      smooth(m.wet.gain, clamp(s.mix, 0, 1), now);
      smooth(m.dry.gain, 1 - clamp(s.mix, 0, 1), now);
    } else if (m.kind === "Reverb" || m.kind === "Distortion") {
      const mix = clamp(s.mix, 0, 1);
      smooth(m.wet.gain, mix, now);
      smooth(m.dry.gain, 1 - mix, now);
      if (m.kind === "Reverb") {
        const decay = clamp(s.decay, 0.1, 5);
        if (m.effectDecay !== decay) {
          const length = Math.max(1, Math.floor(this.ctx.sampleRate * decay)),
            buffer = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
          for (let channel = 0; channel < 2; channel++) {
            const data = buffer.getChannelData(channel);
            for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3);
          }
          m.effect.buffer = buffer;
          m.effectDecay = decay;
        }
      } else {
        const drive = clamp(s.drive, 0, 20);
        if (m.effectDrive !== drive) {
          const curve = new Float32Array(2048);
          for (let i = 0; i < curve.length; i++) {
            const x = (i / (curve.length - 1)) * 2 - 1;
            curve[i] = drive ? Math.tanh(x * (1 + drive)) / Math.tanh(1 + drive) : x;
          }
          m.effect.curve = curve;
          m.effectDrive = drive;
        }
      }
    } else if (IS_INSTRUMENT.has(m.kind)) {
      smooth(m.output.gain, clamp(s.level, 0, 1) * (m.kind === "Sampler" ? 1 : 0.3), now);
      for (const v of m.voices)
        if (v.filter && m.kind === "Synth") {
          if (["lowpass", "highpass", "bandpass"].includes(s.filter_mode)) v.filter.type = s.filter_mode;
          if (!(v.filterEnvUntil > now)) smooth(v.filter.frequency, clamp(s.cutoff, 20, 18000), now);
          smooth(v.filter.Q, clamp(s.resonance, 0.1, 12), now);
          if (v.carrier && v.carrier.detune) smooth(v.carrier.detune, clamp(s.detune, -100, 100), now);
        }
    }
  }
  trigger(id, note, time, duration, velocity = 1) {
    const m = this.modules.get(id);
    if (!m || !IS_INSTRUMENT.has(m.kind)) return;
    if (m.kind === "Sampler" && !(this.buffers.get(m.settings.sample) instanceof AudioBuffer)) { this.loadSample(m.settings.sample); return null; }
    const c = this.ctx,
      s = m.settings,
      t = Math.max(c.currentTime, time),
      v = { sources: [], nodes: [], ended: false, time: t, note };
    m.voices.add(v);
    while (m.voices.size > clamp(s.polyphony ?? 24, 1, 32)) this.destroyVoice(m, m.voices.values().next().value);
    const gain = c.createGain(),
      filter = c.createBiquadFilter();
    v.gain = gain;
    v.filter = filter;
    v.nodes.push(gain, filter);
    filter.connect(gain);
    gain.connect(m.output);
    filter.type = ["lowpass", "highpass", "bandpass"].includes(s.filter_mode) && m.kind === "Synth" ? s.filter_mode : "lowpass";
    filter.frequency.value = clamp(s.cutoff ?? 18000, 20, 18000);
    filter.Q.value = clamp(s.resonance ?? 0.7, 0.1, 12);
    const osc = (type, freq, dest = filter) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.connect(dest);
      o.start(t);
      v.sources.push(o);
      return o;
    };
    if (m.kind === "Sampler") {
      const buf = this.buffers.get(s.sample), src = c.createBufferSource(),
        rate = 2 ** ((note - clamp(s.root, 0, 127)) / 12), attack = clamp(s.attack, 0.001, 2), release = clamp(s.release, 0.005, 5);
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.loop = Boolean(s.loop);
      filter.frequency.value = 18000;
      src.connect(filter);
      v.sources.push(src);
      src.start(t, clamp(s.start, 0, 1) * buf.duration);
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(clamp(velocity, 0, 1), t + attack);
      const natural = s.loop ? Infinity : (buf.duration * (1 - clamp(s.start, 0, 1))) / rate;
      const end = t + Math.min(Number.isFinite(duration) ? Math.max(duration, attack) : Infinity, natural);
      if (Number.isFinite(end)) {
        gain.gain.setValueAtTime(clamp(velocity, 0, 1), end);
        gain.gain.linearRampToValueAtTime(0, end + release);
        this.finish(m, v, end + release + 0.02);
      }
      return v;
    }
    if (m.kind === "DrumSynth") {
      const aliases = { 35: 36, 37: 38, 40: 38, 43: 41, 44: 42, 47: 45, 51: 46, 59: 46 },
        key = aliases[Math.round(note)] ?? Math.round(note),
        voice = readDrumVoices(s.kit, s).find((x) => Math.round(x.note) === key);
      if (!voice) {
        this.destroyVoice(m, v);
        return null;
      }
      const decay = clamp(voice.decay, 0.01, 3),
        noiseDecay = clamp(voice.noise_decay, 0.01, 3),
        pitchDecay = clamp(voice.pitch_decay, 0.005, 3),
        end = t + Math.max(decay, noiseDecay),
        wave = ["sine", "triangle", "sawtooth", "square"].includes(voice.wave) ? voice.wave : "sine";
      filter.frequency.value = clamp(voice.cutoff, 20, 18000);
      filter.Q.value = 0.7;
      gain.gain.setValueAtTime(clamp(velocity, 0, 1), t);
      const tonal = c.createGain();
      v.nodes.push(tonal);
      tonal.connect(filter);
      tonal.gain.setValueAtTime(Math.max(0.0001, clamp(voice.level, 0, 1)), t);
      tonal.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      const tone = osc(wave, clamp(voice.freq_start, 20, 18000), tonal);
      tone.frequency.exponentialRampToValueAtTime(clamp(voice.freq_end, 20, 18000), t + pitchDecay);
      if (voice.noise > 0) {
        this.noise ??= c.createBuffer(1, c.sampleRate, c.sampleRate);
        if (!this.noiseFilled) {
          const a = this.noise.getChannelData(0);
          for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
          this.noiseFilled = true;
        }
        const src = c.createBufferSource(),
          ng = c.createGain();
        v.nodes.push(ng);
        v.sources.push(src);
        src.buffer = this.noise;
        src.loop = true;
        src.connect(ng);
        ng.connect(filter);
        ng.gain.setValueAtTime(Math.max(0.0001, clamp(voice.noise, 0, 1)), t);
        ng.gain.exponentialRampToValueAtTime(0.0001, t + noiseDecay);
        src.start(t);
      }
      this.finish(m, v, end + 0.02);
      return v;
    }
    if (m.kind === "DrumKit") {
      const names = {
          35: "kick",
          36: "kick",
          37: "rim",
          38: "snare",
          40: "snare",
          39: "clap",
          41: "tomlo",
          43: "tomlo",
          42: "hat",
          44: "hat",
          45: "tomhi",
          47: "tomhi",
          46: "openhat",
          51: "ride",
          59: "ride",
          56: "cowbell",
        },
        prefix = names[Math.round(note)];
      let decay = clamp(s[prefix + "_decay"] ?? s.decay, 0.03, 2);
      const tone = clamp(s[prefix + "_tone"] ?? s.tone, 0.25, 2);
      velocity *= clamp(s[prefix + "_level"] ?? 1, 0, 1);
      duration = decay;
      const noise = () => {
        this.noise ??= c.createBuffer(1, c.sampleRate, c.sampleRate);
        if (!this.noiseFilled) {
          const a = this.noise.getChannelData(0);
          for (let i = 0; i < a.length; i++) a[i] = Math.random() * 2 - 1;
          this.noiseFilled = true;
        }
        const n = c.createBufferSource();
        n.buffer = this.noise;
        n.connect(filter);
        n.start(t);
        v.sources.push(n);
        return n;
      };
      const drop = (type, from, to, len = decay) => {
        const o = osc(type, from * tone);
        o.frequency.exponentialRampToValueAtTime(to * tone, t + len);
        return o;
      };
      if (note === 35 || note === 36) drop("sine", 150, 45);
      else if (note === 41 || note === 43) drop("sine", 120, 60);
      else if (note === 45 || note === 47) drop("sine", 190, 100);
      else if (note === 37) {
        decay = Math.min(decay, 0.05);
        noise();
        filter.type = "highpass";
        filter.frequency.value = 2500 * tone;
        osc("triangle", 420 * tone);
      } else if (note === 39) {
        decay = Math.min(Math.max(decay, 0.12), 0.3);
        noise();
        filter.type = "bandpass";
        filter.frequency.value = 1300 * tone;
        filter.Q.value = 1.2;
        for (const d of [0.012, 0.026]) gain.gain.setValueAtTime(Math.max(0.0001, velocity * 0.6), t + d);
      } else if (note === 42 || note === 44) {
        decay = Math.min(decay, 0.07);
        noise();
        filter.type = "highpass";
        filter.frequency.value = 6500 * tone;
      } else if (note === 46) {
        decay = Math.max(decay, 0.3) * 1.4;
        noise();
        filter.type = "highpass";
        filter.frequency.value = 6000 * tone;
      } else if (note === 51 || note === 59) {
        decay = Math.max(decay, 0.5);
        noise();
        filter.type = "highpass";
        filter.frequency.value = 8000 * tone;
        osc("square", 340 * tone);
      } else if (note === 56) {
        decay = Math.min(Math.max(decay, 0.15), 0.4);
        filter.type = "bandpass";
        filter.frequency.value = 700 * tone;
        filter.Q.value = 2;
        osc("square", 540 * tone);
        osc("square", 800 * tone);
      } else {
        noise();
        filter.type = "highpass";
        filter.frequency.value = (note === 38 || note === 40 ? 1000 : 6500) * tone;
        if (note === 38 || note === 40) osc("triangle", 180 * tone);
      }
      gain.gain.setValueAtTime(Math.max(0.0001, velocity), t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay);
      this.finish(m, v, t + decay + 0.02);
      return v;
    }
    if (m.kind === "Karplus" || m.kind === "Granular") {
      const buffer = c.createBuffer(1, Math.max(1, Math.round(c.sampleRate * (m.kind === "Granular" ? 1 : 0.08))), c.sampleRate),
        samples = buffer.getChannelData(0),
        src = c.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      v.sources.push(src);
      if (m.kind === "Karplus") {
        for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
        const excite = c.createGain(),
          delay = c.createDelay(1),
          feedback = c.createGain(),
          damp = c.createBiquadFilter();
        v.nodes.push(excite, delay, feedback, damp);
        delay.delayTime.value = 1 / hz(note);
        feedback.gain.value = Math.min(0.995, Math.max(0.01, Math.pow(0.001, 1 / (Math.max(0.05, Number(s.decay) || 1) * hz(note)))));
        damp.type = "lowpass";
        damp.frequency.value = 500 + clamp(s.damping ?? 0.5, 0, 1) * 17500;
        // A low-pass that never boosts. For a Web Audio low-pass Q is a resonance in dB: the default (1 dB) boosts ~12% near
        // the cutoff, which inside this feedback loop is a gain over 1, and the string grew without end instead of dying
        // away. -3.01 dB is a Butterworth (flat, no peak). Fixed in the port.
        damp.Q.value = -3.01;
        src.connect(excite);
        excite.connect(delay);
        delay.connect(damp);
        damp.connect(feedback);
        feedback.connect(delay);
        delay.connect(filter);
        excite.gain.setValueAtTime(velocity, t);
        excite.gain.setValueAtTime(0, t + 0.025);
        gain.gain.setValueAtTime(1, t);
      } else {
        const size = clamp(s.grain_size, 0.02, 0.3),
          density = clamp(s.density, 1, 40),
          spread = clamp(s.spread, 0, 1),
          count = Math.max(1, Math.round(density)),
          len = samples.length,
          span = Math.max(1, Math.floor(size * c.sampleRate)),
          normal = Math.max(1, density * size) * 0.8;
        for (let j = 0; j < count; j++) {
          const start = Math.floor((j * len) / count),
            freq = hz(note) * Math.pow(2, ((Math.random() * 2 - 1) * spread) / 12),
            phase = Math.random() * Math.PI * 2;
          for (let i = 0; i < span; i++) {
            const index = (start + i) % len;
            samples[index] +=
              (Math.sin(phase + (2 * Math.PI * freq * i) / c.sampleRate) * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / span))) / normal;
          }
        }
        src.connect(filter);
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(velocity, t + 0.01);
      }
      src.start(t);
      if (Number.isFinite(duration)) {
        const end = t + Math.max(0.02, duration),
          release = clamp(s.release ?? 0.15, 0.01, 3);
        gain.gain.setValueAtTime(m.kind === "Karplus" ? 1 : velocity, end);
        gain.gain.linearRampToValueAtTime(0, end + release);
        this.finish(m, v, end + release + 0.02);
      }
      return v;
    }
    const wave = ["sine", "triangle", "sawtooth", "square"].includes(s.wave)
        ? s.wave
        : s.voice === "subtractive"
          ? "sawtooth"
          : s.voice === "reed"
            ? "square"
            : "sine",
      carrier = osc(wave, hz(note));
    v.carrier = carrier;
    if (carrier.detune) carrier.detune.value = clamp(s.detune, -100, 100);
    if (s.voice === "fm") {
      const g = c.createGain();
      g.gain.value = hz(note) * clamp(s.fm_index ?? 0.7, 0, 10);
      g.connect(carrier.frequency);
      v.nodes.push(g);
      osc("sine", hz(note) * clamp(s.fm_ratio ?? 2, 0.1, 10), g);
    }
    if (Number(s.vibrato) > 0) {
      const g = c.createGain();
      g.gain.value = hz(note) * (2 ** (Number(s.vibrato) / 12) - 1);
      g.connect(carrier.frequency);
      v.nodes.push(g);
      osc("sine", Number(s.vibrato_rate), g);
    }
    const attack = clamp(s.attack, 0.001, 5),
      decay = clamp(s.decay, 0.001, 5);
    const envAmount = clamp(s.filter_env, 0, 1);
    if (envAmount > 0) {
      const cut = clamp(s.cutoff, 20, 18000),
        top = Math.min(18000, cut * (1 + envAmount * 7)),
        end = t + attack + decay + 0.05;
      filter.frequency.setValueAtTime(cut, t);
      filter.frequency.linearRampToValueAtTime(top, t + attack);
      filter.frequency.exponentialRampToValueAtTime(Math.max(20, cut), end);
      v.filterEnvUntil = end;
    }
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(velocity, t + attack);
    gain.gain.linearRampToValueAtTime(velocity * clamp(s.sustain, 0, 1), t + attack + decay);
    if (Number.isFinite(duration)) {
      const releaseAt = t + Math.max(duration, attack + decay);
      gain.gain.setValueAtTime(velocity * clamp(s.sustain, 0, 1), releaseAt);
      gain.gain.linearRampToValueAtTime(0, releaseAt + clamp(s.release, 0.005, 5));
      this.finish(m, v, releaseAt + clamp(s.release, 0.005, 5) + 0.02);
    }
    return v;
  }
  finish(m, v, time) {
    v.visualEnd = time;
    let remaining = v.sources.length;
    for (const source of v.sources) {
      source.onended = () => {
        if (--remaining === 0) this.destroyVoice(m, v);
      };
      source.stop(time);
    }
  }
  release(m, v, at) {
    if (!v || v.ended) return;
    const t = Math.max(this.ctx.currentTime, Number.isFinite(at) ? at : 0),
      p = v.gain.gain;
    p.cancelAndHoldAtTime(t);
    const seconds = clamp(m.settings.release ?? 0.1, 0.005, 5);
    p.linearRampToValueAtTime(0, t + seconds);
    this.finish(m, v, t + seconds + 0.02);
  }
  setHeld(id, notes) {
    const m = this.modules.get(id);
    if (!m) return;
    const next = new Map(notes.map((n) => [n.key, n]));
    for (const [key, v] of m.held)
      if (!next.has(key)) {
        this.release(m, v.voice);
        m.held.delete(key);
      } else if (next.get(key).note !== v.note) {
        if (Number(m.settings.glide) > 0 && v.voice?.carrier && !v.voice.ended) {
          v.voice.carrier.frequency.setTargetAtTime(hz(next.get(key).note), this.ctx.currentTime, Number(m.settings.glide));
          v.note = next.get(key).note;
        } else {
          this.release(m, v.voice);
          m.held.delete(key);
        }
      }
    for (const [key, n] of next)
      if (!m.held.has(key)) {
        const voice = this.trigger(id, n.note, this.ctx.currentTime, Infinity, n.velocity);
        m.held.set(key, { ...n, voice });
      }
  }
  clearVoices(id) {
    const m = this.modules.get(id);
    if (m) {
      for (const v of [...m.voices]) this.destroyVoice(m, v);
      m.held.clear();
    }
  }
  destroyVoice(m, v) {
    if (!v || v.ended) return;
    v.ended = true;
    for (const source of v.sources) {
      try {
        source.stop();
      } catch {}
      source.disconnect();
    }
    for (const n of v.nodes) n.disconnect();
    m.voices.delete(v);
  }
  analyze(id) {
    const m = this.modules.get(id);
    if (!m?.analysers) return null;
    m.analysers[0].getFloatTimeDomainData(m.left);
    m.analysers[1].getFloatTimeDomainData(m.right);
    m.analysers[0].getFloatFrequencyData(m.db);
    m.analysers[1].getFloatFrequencyData(m.dbRight);
    for (let i = 0; i < m.db.length; i++) {
      const power = (10 ** (m.db[i] / 10) + 10 ** (m.dbRight[i] / 10)) * 0.5;
      m.db[i] = power > 0 ? 10 * Math.log10(power) : -Infinity;
    }
    return analysisFrame(m.kind, m.left, m.right, m.db, this.ctx.sampleRate, this.ctx.currentTime);
  }
  levels(id) {
    const m = this.modules.get(id);
    if (!m?.meters) return null;
    const peak = (a) => {
      a.getFloatTimeDomainData(m.meterBuffer);
      let p = 0;
      for (const x of m.meterBuffer) p = Math.max(p, Math.abs(x));
      return p;
    };
    return { strips: m.meters.map(peak), master: peak(m.masterMeter) };
  }
  // Record an Output's signal. stop() resolves to a Blob: a 16-bit WAV when the browser can decode its own recording, else the raw take.
  record(id) {
    const m = this.modules.get(id);
    if (!m || m.kind !== "Output") throw Error("Start this output before recording");
    if (typeof MediaRecorder === "undefined") throw Error("Recording is unavailable in this browser");
    const dest = this.ctx.createMediaStreamDestination(),
      rec = new MediaRecorder(dest.stream),
      chunks = [],
      started = this.ctx.currentTime;
    m.output.connect(dest);
    rec.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    rec.start(250);
    return {
      seconds: () => this.ctx.currentTime - started,
      stop: () =>
        new Promise((resolve) => {
          rec.onstop = async () => {
            try {
              m.output.disconnect(dest);
            } catch {}
            const raw = new Blob(chunks, { type: rec.mimeType });
            try {
              const audio = await this.ctx.decodeAudioData(await raw.arrayBuffer());
              resolve({
                blob: new Blob(
                  [
                    encodeWav(
                      Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i)),
                      audio.sampleRate,
                    ),
                  ],
                  { type: "audio/wav" },
                ),
                ext: "wav",
              });
            } catch {
              resolve({ blob: raw, ext: (rec.mimeType.split("/")[1] || "webm").split(";")[0] });
            }
          };
          rec.stop();
        }),
    };
  }
  waveform(id) {
    if (!this.modules.has(id)) {
      const key = [...this.modules.keys()].find((key) => String(key) === String(id));
      if (key !== undefined) id = key;
    }
    const m = this.modules.get(id);
    if (!m?.output) return null;
    let tap = this.waveformTaps.get(id);
    if (!tap) {
      const analyser = this.ctx.createAnalyser();
      analyser.fftSize = 256;
      m.output.connect(analyser);
      tap = { source: m.output, analyser, samples: new Float32Array(256), last: -Infinity };
      this.waveformTaps.set(id, tap);
    }
    const now = this.ctx.currentTime;
    if (now - tap.last >= 1 / 30) {
      tap.analyser.getFloatTimeDomainData(tap.samples);
      tap.last = now;
    }
    return tap.samples;
  }
  removeWaveformTap(id) {
    const tap = this.waveformTaps.get(id);
    if (!tap) return;
    try {
      tap.source.disconnect(tap.analyser);
    } catch {}
    tap.analyser.disconnect();
    this.waveformTaps.delete(id);
  }
  clearWaveforms() {
    for (const id of [...this.waveformTaps.keys()]) this.removeWaveformTap(id);
  }
  /** An Output's spectrum now (0..1 a bin, low to high) and its wave, for pictures: { spec: Float32Array(256), wave: Float32Array(512) } or null. */
  spectrum(id) {
    const m = this.modules.get(id);
    if (!m?.analyser) return null;
    m.bytes ||= new Uint8Array(m.analyser.frequencyBinCount);
    m.analyser.getByteFrequencyData(m.bytes);
    m.analyser.getFloatTimeDomainData(m.samples);
    return { spec: m.bytes, wave: m.samples };
  }
  meter(id) {
    const m = this.modules.get(id);
    if (!m?.analyser) return { rms: 0, peak: 0 };
    m.analyser.getFloatTimeDomainData(m.samples);
    let sum = 0,
      peak = 0;
    for (const x of m.samples) {
      sum += x * x;
      peak = Math.max(peak, Math.abs(x));
    }
    return { rms: Math.sqrt(sum / m.samples.length), peak };
  }
  dispose(m) {
    for (const v of [...m.voices]) this.destroyVoice(m, v);
    if (m.src) { try { m.src.stop(); } catch {} }
    if (m.osc) { try { m.osc.stop(); } catch {} }
    for (const n of m.nodes) n.disconnect();
  }
  stop() {
    this.clearWaveforms();
    for (const m of this.modules.values()) this.dispose(m);
    this.modules.clear();
    this.edges.clear();
    for (const g of this.mods.values()) g.gain.disconnect();
    this.mods.clear();
  }
}
