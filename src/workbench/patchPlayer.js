/**
 * The scene's modular synth, playing (data: `doc.transport.patch`, src/audio/modular/patch.js; engine: src/audio/modular/engine.js).
 * What plays is the scene's whole patch (scene()): the Patch panel's and the one drawn on the canvas (modules and cables as
 * marks, src/modular) together; patch() and setPatch() are the panel's own.
 *
 * - The graph follows the patch: every change (the node editor, code, undo) is synced into the running engine, which
 *   keeps what did not change, so editing never stops the sound.
 * - Scores reach it through the mixer: a channel whose out is 'patch' sends its notes here, and they play every
 *   instrument on that channel (`midi(bytes, atMs)`, times as the other outputs take them: performance.now() ms).
 * - Sequencers play on the Timeline's clock (app.player): while it plays, a timer books every step due in the next
 *   0.15 s on the audio clock; a seek or a loop coming round starts again from the playhead.
 * - The AudioContext is made on the first play (a click), and kept.
 */
import { AudioPatch } from '../audio/modular/engine.js';
import { toDefs, instrumentsOn, targetsOf, isSequencer, stepsBetween, settingsOf, normalizePatch, examplePatch } from '../audio/modular/patch.js';
import { scenePatch } from '../modular/model.js';

const AHEAD = 0.15, TICK_MS = 25;

export class PatchPlayer {
  constructor(app) {
    this.app = app;
    this.ctx = null; this.engine = null;
    this.synced = null;
    this.held = new Map();            // `${instrument}:${note}` → [voices] (score notes waiting for their note-off)
    this.lastBeat = null;             // where the sequencers have booked up to (beats)
    this.steps = new Map();           // sequencer id → { step, t } the last step played, for the editor's playheads
    this.timer = null;
    this.listeners = new Set();
    this.live = new Map();            // `${module}.${setting}` → a value automation set (Timeline lanes: 'patch:<module>.<setting>'), not saved
    app.player.on(() => this.onPlayer());
    app.store?.subscribe?.(() => { this.sync(); if (app.player.playing && !this.timer && this.engine && this.hasSequencers()) this.onPlayer(); });   // (undo, redo, another scene, a module drawn: the sound follows)
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const f of this.listeners) f(this); }

  /** The Patch panel's patch (normalized): what the panel and ams_patch edit. */
  patch() { return this.app.player.settings.patch; }
  /** What plays: the panel's patch and the canvas's together (the same object while neither changes). */
  scene() {
    const doc = this.app.store.doc, panel = this.patch(), rev = this.app.store.rev;
    if (this.sceneOf && this.sceneOf.rev === rev && this.sceneOf.panel === panel && this.sceneOf.doc === doc) return this.sceneOf.patch;
    const next = scenePatch(doc, panel), json = JSON.stringify(next);
    const patch = this.sceneOf?.json === json ? this.sceneOf.patch : next;
    this.sceneOf = { rev, panel, doc, json, patch };
    return patch;
  }
  /** Replace the patch: one undo step, saved with the scene; the sound follows. */
  setPatch(next, { transient = false } = {}) {
    const p = normalizePatch(next);
    if (transient) this.app.store.change('patch', d => { d.transport = { ...(d.transport || {}), patch: p }; }, { transient: true });
    else this.app.player.setSettings({ patch: p });
    this.sync(); this.emit();
  }
  /** Start from a ready-made patch ('starter', 'arecibo'). */
  loadExample(name, bits) { this.setPatch(examplePatch(name, bits)); }

  /** Make the sound (from a click: browsers start audio only then). */
  ensure() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.engine = new AudioPatch(this.ctx);
      this.engine.fetchSample = name => fetchSample(this.app, name);
      this.pumpTimer = setInterval(() => this.pump(), 33);   // (pictures that read the patch: boardFrames.sendPatch)
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    this.sync();
    return true;
  }
  get running() { return Boolean(this.ctx && this.ctx.state === 'running'); }
  /** Sound on or off (the modular toolbar's power: drones and sources stop with it; the Timeline's Play turns it on). */
  power(on = !this.running) {
    if (on) return this.ensure();
    this.allNotesOff();
    this.ctx?.suspend().catch(() => {});
    this.emit();
    return false;
  }

  sync() {
    if (!this.engine) return;
    const p = this.scene(), tempo = this.app.player.settings.tempo || 120;
    if (p === this.synced && tempo === this.engine.tempo) return;
    this.synced = p; this.engine.tempo = tempo;
    const { defs, outputs } = toDefs(p);
    for (const [key, v] of this.live) { const [id, prop] = key.split('.'); if (defs.has(id)) defs.get(id).settings[prop] = v; }   // (what lanes set holds)
    try { this.engine.sync(defs, outputs); }
    catch (err) { this.app.log?.(`Patch: ${err.message}`, 'error'); }
  }

  /** A setting as it sounds now: what automation set, else the patch's. */
  liveValue(id, prop) {
    const key = `${id}.${prop}`;
    if (this.live.has(key)) return this.live.get(key);
    const m = this.scene().modules.find(x => x.id === id);
    return m ? settingsOf(m)[prop] : undefined;
  }
  /** Automation: change a setting of the running sound (no undo step, not saved; the patch keeps its own value). */
  setLive(id, prop, v) {
    this.live.set(`${id}.${prop}`, v);
    const em = this.engine?.modules.get(id);
    if (em) { em.settings = { ...em.settings, [prop]: v }; this.engine.update(em, em.settings); }
  }
  /** A module with what automation set laid over it (for the sequencers). */
  withLive(m) {
    let settings = null;
    for (const [key, v] of this.live) if (key.startsWith(`${m.id}.`)) (settings ||= { ...m.settings })[key.slice(m.id.length + 1)] = v;
    return settings ? { ...m, settings } : m;
  }

  audioTime(atMs) { return this.ctx.currentTime + Math.max(0, ((atMs ?? performance.now()) - performance.now()) / 1000); }

  /** A MIDI message from a score (through the mixer): notes on a channel play the patch's instruments on that channel. */
  midi(bytes, atMs) {
    if (!this.ensure()) return;
    const [st, note, vel] = bytes, kind = st & 0xf0, ch = (st & 0x0f) + 1, t = this.audioTime(atMs);
    if (kind === 0xb0 && (note === 120 || note === 123)) { this.allNotesOff(); return; }
    if (kind !== 0x90 && kind !== 0x80) return;
    for (const id of instrumentsOn(this.scene(), ch)) {
      const key = `${id}:${note}`, list = this.held.get(key) || [];
      if (kind === 0x90 && vel > 0) {
        const v = this.engine.trigger(id, note, t, Infinity, vel / 127);
        if (v) { list.push(v); this.held.set(key, list); }
        this.flash(id); this.heard(id, note, vel / 127, t);
      } else {
        const v = list.shift();
        if (v) this.engine.release(this.engine.modules.get(id), v, t);
        if (!list.length) this.held.delete(key);
      }
    }
  }

  allNotesOff() {
    if (!this.engine) return;
    for (const id of this.engine.modules.keys()) this.engine.clearVoices(id);
    this.held.clear();
  }

  /** Play one note on a module now (the editor's audition), for `seconds`. */
  audition(id, note = 60, seconds = 0.4) {
    if (!this.ensure()) return;
    const m = this.scene().modules.find(x => x.id === id);
    if (!m) return;
    const targets = isSequencer(m.kind) ? targetsOf(this.scene(), id) : [id];
    const t = this.ctx.currentTime + 0.01;
    for (const target of targets) this.engine.trigger(target, note, t, seconds, 0.8);
  }

  /** An instrument played (at the audio time `at`, or now): the canvas lights its title. */
  flash(id, at) { this.lit = this.lit || new Map(); this.lit.set(id, performance.now() + (at && this.ctx ? Math.max(0, (at - this.ctx.currentTime) * 1000) : 0)); }
  /** A note played (at the audio time `at`): pictures that read the patch get it when it sounds (`patch.onNote` in a sketch). */
  heard(id, note, velocity, at) {
    const m = this.scene().modules.find(x => x.id === id);
    (this.notesOut ||= []).push({ at: performance.now() + Math.max(0, (at - this.ctx.currentTime) * 1000), n: { note, velocity: Math.round(velocity * 100) / 100, module: m?.name || id, kind: m?.kind || '', channel: m ? settingsOf(m).channel ?? null : null } });
  }

  /**
   * The patch's sound for pictures, ~30 times a second while it is on: the first Output's level, bass, mid, treble, eight bands
   * and its wave, each sequencer's step, and the notes now due, to every sketch that reads `patch` (boardFrames.sendPatch).
   */
  pump() {
    const frames = this.app.frames;
    if (!this.engine || !frames?.wantsPatch()) { this.notesOut = []; return; }
    const now = performance.now(), due = (this.notesOut || []).filter(x => x.at <= now);
    this.notesOut = (this.notesOut || []).filter(x => x.at > now).slice(-256);
    const out = this.scene().modules.find(m => m.kind === 'Output' && !settingsOf(m).mute), sp = out && this.running ? this.engine.spectrum(out.id) : null;
    const s = { on: this.running, level: 0, bass: 0, mid: 0, treble: 0, bands: new Array(8).fill(0), spectrum: new Array(32).fill(0), wave: new Array(64).fill(0), steps: {} };
    if (sp) {
      const N = sp.spec.length, nyq = this.ctx.sampleRate / 2, bin = f => Math.min(N - 1, Math.round(f / nyq * N));
      const avg = (f0, f1) => { let t = 0, n = 0; for (let i = bin(f0); i <= bin(f1); i++) { t += sp.spec[i]; n++; } return n ? Math.max(0, Math.min(1, (t / n / 255 - 0.35) / 0.6)) : 0; };   // (the analyser's −100..−30 dB as 0..1 sits high: the bottom third is the floor)
      const edges = [30, 60, 120, 250, 500, 1000, 2000, 4000, 9000];
      s.bands = edges.slice(0, 8).map((f, i) => Math.round(avg(f, edges[i + 1]) * 1000) / 1000);
      s.spectrum = Array.from({ length: 32 }, (_, i) => Math.round(avg(40 * 300 ** (i / 32), 40 * 300 ** ((i + 1) / 32)) * 1000) / 1000);   // (32 bins, 40 Hz to 12 kHz, log-spaced)
      s.bass = Math.round(avg(30, 250) * 1000) / 1000; s.mid = Math.round(avg(250, 2000) * 1000) / 1000; s.treble = Math.round(avg(2000, 9000) * 1000) / 1000;
      let sum = 0, peak = 0; for (const x of sp.wave) { sum += x * x; peak = Math.max(peak, Math.abs(x)); }
      s.level = Math.min(1, Math.round(Math.sqrt(sum / sp.wave.length) * 8 * 1000) / 1000);   // (a mix sits around 0.02–0.1 RMS: ×8 makes it 0..1 to the eye)
      const g = 1 / Math.max(0.08, peak);   // the wave scaled to its own peak, so a quiet sound still shows its shape
      s.wave = Array.from({ length: 64 }, (_, i) => Math.round(sp.wave[i * 4] * g * 1000) / 1000);
    }
    if (this.app.player.playing) for (const m of this.scene().modules) if (isSequencer(m.kind)) { const st = this.stepNow(m.id); if (st !== null) s.steps[m.name || m.kind] = st; }
    frames.sendPatch({ s, notes: due.map(x => x.n) });
  }

  /** A setting heard while a slider is dragged (not stored: the change at its end is). */
  preview(id, prop, v) {
    const em = this.engine?.modules.get(id);
    if (em) { em.settings = { ...em.settings, [prop]: v }; this.engine.update(em, em.settings); }
  }

  // ---- sequencers on the Timeline's clock ---------------------------------------------------------------------------

  hasSequencers() { return this.scene().modules.some(m => isSequencer(m.kind)); }

  onPlayer() {
    const pl = this.app.player;
    if (pl.playing && this.hasSequencers()) {
      this.ensure();
      if (!this.timer) { this.lastBeat = null; this.timer = setInterval(() => this.tick(), TICK_MS); this.tick(); }
    } else if (this.timer) {
      clearInterval(this.timer); this.timer = null; this.lastBeat = null;
      this.allNotesOff();
    }
  }

  tick() {
    const pl = this.app.player;
    if (!pl.playing || !this.engine) return;
    const tempo = pl.settings.tempo, bps = tempo / 60, rate = pl.rate || 1;
    const now = pl.position() / 1000, beatNow = now * bps;
    // A seek, or the loop coming round: book again from the playhead.
    if (this.lastBeat === null || beatNow < this.lastBeat - AHEAD * bps * rate - 0.5 || beatNow > this.lastBeat + 4) this.lastBeat = beatNow;
    const until = beatNow + AHEAD * bps * rate;
    if (until <= this.lastBeat) return;
    this.sync();   // (a module drawn while it plays joins in)
    const p = this.scene(), base = this.ctx.currentTime;
    for (const m of p.modules) {
      if (!isSequencer(m.kind)) continue;
      const targets = targetsOf(p, m.id);
      for (const ev of stepsBetween(this.withLive(m), this.lastBeat, until)) {
        const t = base + (ev.beat - beatNow) / bps / rate, dur = ev.beats / bps / rate;
        for (const id of targets) { this.engine.trigger(id, ev.note, t, dur, ev.velocity); this.flash(id, t); this.heard(id, ev.note, ev.velocity, t); }
        this.steps.set(m.id, { step: ev.step, t });
      }
    }
    // a loop range: what comes after its end is booked when the playhead has come round
    const loop = pl.loopRange;
    this.lastBeat = loop && until * 1000 / bps > loop[1] ? loop[1] / 1000 * bps : until;
  }

  /** The step a sequencer is playing now (for drawing), or null. */
  stepNow(id) {
    const s = this.steps.get(id);
    if (!s || !this.ctx) return null;
    return this.ctx.currentTime >= s.t - 0.02 ? s.step : (s.step > 0 ? s.step - 1 : null);
  }
  /** A module's output, now (the editor's cables and meters): 256 samples, or null. */
  waveform(id) { return this.engine?.modules.has(id) ? this.engine.waveform(id) : null; }
  meter(id) { return this.engine?.meter(id) || { rms: 0, peak: 0 }; }

  /** Record the first Output for `seconds` seconds; resolves to { blob, ext }. */
  async record(seconds = 10) {
    if (!this.ensure()) throw new Error('No sound in this browser');
    const out = this.scene().modules.find(m => m.kind === 'Output' && !settingsOf(m).mute);
    if (!out) throw new Error('The patch has no Output');
    const rec = this.engine.record(out.id);
    await new Promise(r => setTimeout(r, seconds * 1000));
    return rec.stop();
  }

  stop() { this.allNotesOff(); if (this.timer) { clearInterval(this.timer); this.timer = null; } }
}

/**
 * A Sampler's sample as bytes: a Media library asset by id, else by its title (as a sketch's loadSound('edison-lost-chord.mp3')
 * finds it: the name before the extension, in lower case with dashes), else a source of that name.
 */
export async function fetchSample(app, name) {
  const store = app.assetStore;
  if (!store || !name) return null;
  const slug = t => String(t || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  let a = await store.get(name).catch(() => null);
  if (!a?.blob) {
    const base = slug(String(name).split('/').pop().replace(/\.[a-z0-9]{2,4}$/i, ''));
    a = (await store.all()).find(x => x.blob && (slug(x.title) === base || x.id === name));
  }
  return a?.blob ? a.blob.arrayBuffer() : null;
}
