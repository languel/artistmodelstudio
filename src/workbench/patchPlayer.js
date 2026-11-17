/**
 * The scene's modular synth, playing (data: `doc.transport.patch`, src/audio/modular/patch.js; engine: src/audio/modular/engine.js).
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
    app.store?.subscribe?.(() => this.sync());   // (undo, redo, another scene: the sound follows)
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const f of this.listeners) f(this); }

  /** The scene's patch (normalized). */
  patch() { return this.app.player.settings.patch; }
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
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    this.sync();
    return true;
  }
  get running() { return Boolean(this.ctx && this.ctx.state === 'running'); }

  sync() {
    if (!this.engine) return;
    const p = this.patch();
    if (p === this.synced) return;
    this.synced = p;
    const { defs, outputs } = toDefs(p);
    for (const [key, v] of this.live) { const [id, prop] = key.split('.'); if (defs.has(id)) defs.get(id).settings[prop] = v; }   // (what lanes set holds)
    try { this.engine.sync(defs, outputs); }
    catch (err) { this.app.log?.(`Patch: ${err.message}`, 'error'); }
  }

  /** A setting as it sounds now: what automation set, else the patch's. */
  liveValue(id, prop) {
    const key = `${id}.${prop}`;
    if (this.live.has(key)) return this.live.get(key);
    const m = this.patch().modules.find(x => x.id === id);
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
    for (const id of instrumentsOn(this.patch(), ch)) {
      const key = `${id}:${note}`, list = this.held.get(key) || [];
      if (kind === 0x90 && vel > 0) {
        const v = this.engine.trigger(id, note, t, Infinity, vel / 127);
        if (v) { list.push(v); this.held.set(key, list); }
        this.flash(id);
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
    const m = this.patch().modules.find(x => x.id === id);
    if (!m) return;
    const targets = isSequencer(m.kind) ? targetsOf(this.patch(), id) : [id];
    const t = this.ctx.currentTime + 0.01;
    for (const target of targets) this.engine.trigger(target, note, t, seconds, 0.8);
  }

  flash(id) { this.lit = this.lit || new Map(); this.lit.set(id, performance.now()); }

  // ---- sequencers on the Timeline's clock ---------------------------------------------------------------------------

  hasSequencers() { return this.patch().modules.some(m => isSequencer(m.kind)); }

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
    const p = this.patch(), base = this.ctx.currentTime;
    for (const m of p.modules) {
      if (!isSequencer(m.kind)) continue;
      const targets = targetsOf(p, m.id);
      for (const ev of stepsBetween(this.withLive(m), this.lastBeat, until)) {
        const t = base + (ev.beat - beatNow) / bps / rate, dur = ev.beats / bps / rate;
        for (const id of targets) this.engine.trigger(id, ev.note, t, dur, ev.velocity);
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
    const out = this.patch().modules.find(m => m.kind === 'Output' && !settingsOf(m).mute);
    if (!out) throw new Error('The patch has no Output');
    const rec = this.engine.record(out.id);
    await new Promise(r => setTimeout(r, seconds * 1000));
    return rec.stop();
  }

  stop() { this.allNotesOff(); if (this.timer) { clearInterval(this.timer); this.timer = null; } }
}
