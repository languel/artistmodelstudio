/**
 * Scores in the studio: listens to the transport (app.player), and while it runs plays the marks
 * that carry `play` (src/score) through the built-in GM sound. It owns no clock: seeking, looping,
 * rate and pause are the transport's. Audio starts on the first play of a scene that has a score
 * (browsers need a click for that, and Play is one).
 */
import { normalizeElement } from '../process/document.js';
import { createRunner, buildEntries, hasScore, scoreSignature } from '../score/runner.js';
import { musicHelpers } from '../score/music.js';
import { triggerIdOf } from '../score/compile.js';
import { soloDoc } from '../score/solo.js';
import { timeContext } from '../time/sceneTransport.js';
import { createGmOutput } from '../score/outputs/gm.js';
import { createWebMidiOutput } from '../score/outputs/webmidi.js';
import { createRouter, strips, patchMixer } from '../score/mixer.js';

const PREFS = 'ams_sound_v1';

const TICK_MS = 25;

export class ScorePlayer {
  constructor(app) {
    this.app = app;
    let prefs = {};
    try { prefs = JSON.parse(localStorage.getItem(PREFS) || '{}'); } catch { /* ignore */ }
    /** What is heard: the built-in GM sound, a MIDI port, the GM instrument of each channel. */
    this.prefs = { gm: true, midi: 'none', programs: {}, ...prefs };
    this.gm = createGmOutput({ programs: this.prefs.programs });
    this.midi = createWebMidiOutput();
    this.midi.select(this.prefs.midi || 'none');
    /** Every message passes the scene's mixer (per-channel instrument, route, mute, solo, scale) on its way to the sound. */
    this.router = createRouter(() => this.mixer());
    this.mix = {
      id: 'mix', name: 'Mixer',
      send: (bytes, at) => {
        const r = this.router.route(bytes);
        if (!r) return;
        const gm = this.prefs.gm && r.to !== 'midi', midi = this.midi.connected && r.to !== 'gm';
        if (gm) this.gm.send(r.bytes, at);
        if (midi) this.midi.send(r.bytes, at);
      },
      clear: () => { this.router.reset(); this.gm.clear(); this.midi.clear?.(); }
    };
    this.extra = new Set();   // other outputs (a log, in tests)
    this.errors = [];
    this.sig = new WeakMap();
    this.runner = createRunner({
      getDoc: () => this.doc(),
      getSettings: () => app.player.settings,
      lookahead: 0.2,   // (sent this far ahead, on the audio clock: a busy frame does not break the sound)
      boardFilter: b => this.plays(b),
      outputs: () => this.outputs(),
      onError: msg => { this.errors.push(msg); app.log?.(`Score: ${msg}`, 'error'); },
      onEffects: (fx, board) => this.applyEffects(fx, board),
      onEvents: (evs, board) => { for (const e of evs) if (e.trigger) this.flashes.push({ board: board.id, trigger: e.trigger, t: e.t, type: e.type }); }
    });
    this.flashes = [];   // what the overlay lights up: { board, trigger, t (s), type }
    app.player.on(() => this.onPlayer());
  }

  /**
   * What a score asks of the drawing (api.effect): { type: 'mark', x, y, role?, size?, color?, life? } makes a
   * mark where it says (board coordinates) that fades and goes after `life` seconds. Live changes: no undo steps.
   */
  applyEffects(list, board) {
    const marks = list.filter(f => f.type === 'mark' && Number.isFinite(f.x) && Number.isFinite(f.y)).slice(0, 12);   // (a burst is not allowed to flood the page)
    if (!marks.length) return;
    const ids = [];
    this.app.store.change('score', d => {
      for (const f of marks) {
        const e = normalizeElement({ role: f.role || 'point', points: [[board.x + f.x, board.y + f.y, 0, 0.5]], color: f.color || null, realize: { brush: f.brush || 'dot', params: { size: f.size || 10 } }, why: 'made by a score', by: { kind: 'score', name: 'score' }, board: board.id === 'main' ? undefined : board.id, time: { out: f.life || 1.5 }, born: Date.now() }, d.stages[d.stages.length - 1].id);
        d.elements.push(e); ids.push(e.id);
      }
    }, { transient: true, by: 'score' });
    setTimeout(() => { if (!ids.length) return; this.app.store.change('score', d => { d.elements = d.elements.filter(e => !ids.includes(e.id)); }, { transient: true, by: 'score' }); }, 4000);
  }

  outputs() { return [this.mix, ...this.extra]; }

  /** The scene's mixer. */
  mixer() { return this.app.player.settings.mixer; }

  /** Change the mixer ({ channel: { 3: { program: 40 } }, scale, transpose }): one undo step, and what it sets up is sent now. */
  setMixer(patch) {
    const before = this.mixer(), next = patchMixer(before, patch);
    this.app.player.setSettings({ mixer: next });
    this.applyMixer(patch.channel ? Object.keys(patch.channel).map(Number) : []);
  }

  /** Send the instrument, volume and pan of channels (all, when none are named) to the sound. */
  applyMixer(channels = []) {
    const m = this.mixer();
    for (const ch of channels.length ? channels : Array.from({ length: 16 }, (_, i) => i + 1)) {
      for (const b of strips(m, ch)) {
        if (b[0] >> 4 === 0xc) this.gm.setProgram(ch, b[1]);
        else if (this.prefs.gm) this.gm.send(b);
        if (this.midi.connected) this.midi.send(b);
      }
    }
  }

  savePrefs() { try { localStorage.setItem(PREFS, JSON.stringify({ ...this.prefs, midi: this.midi.selected })); } catch { /* ignore */ } }

  /** From a click: ask for MIDI, and use the first port. */
  async connectMidi() {
    const ports = await this.midi.connect();
    this.prefs.midi = this.midi.selected; this.savePrefs();
    return ports;
  }

  /** Settings: the MIDI port ('none', 'all' or an id), the built-in sound on or off, a channel's instrument. */
  setSound(patch = {}) {
    if ('gm' in patch) { this.prefs.gm = Boolean(patch.gm); if (!patch.gm) this.gm.clear(); }
    if ('midi' in patch) { this.midi.clear(); this.midi.select(patch.midi); }
    if (patch.program) this.setMixer({ channel: { [patch.program[0]]: { program: patch.program[1] } } });   // (instruments are the mixer's)
    this.savePrefs();
  }

  /** A short chord to hear the outputs; from a click. */
  async test() {
    await this.gm.resume().catch(() => {});
    const t = performance.now() + 60;
    [60, 64, 67].forEach((n, i) => { for (const o of this.outputs()) { o.send([0x90, n, 96], t + i * 140); o.send([0x80, n, 0], t + i * 140 + 500); } });
  }

  /** What a trigger sounds like, now: it is touched once (from a click). Nothing needs to be playing. */
  async audition(id) {
    const doc = this.rawDoc(), mark = doc.elements.find(e => e.id === id);
    if (!mark?.play?.trigger && !mark?.play?.node) return false;
    this.gm.resume().catch(() => {});
    const settings = this.app.player.settings, ctx = timeContext(settings), msgs = [];
    const entries = buildEntries(doc, settings, { helpers: (event, api) => musicHelpers({ out: m => msgs.push(m), ctx, event, api }), onError: m => this.app.log?.(`Score: ${m}`, 'error') });
    const key = triggerIdOf(mark);
    const entry = entries.find(e => e.world.triggers().some(t => t.id === key));
    if (!entry) return false;
    entry.world.arrive(key, {}, 0);
    entry.world.step(3);   // (what it sends on arrives a little later: it is heard too)
    this.play(msgs.filter(m => m.t <= 3), 0, 3);
    return msgs.length > 0;
  }

  /** Send messages (times in seconds from `from`) to the outputs, from now, squeezed into at most `span` seconds. */
  play(msgs, from, span = 1.2) {
    const now = performance.now();
    for (const m of msgs) {
      const at = now + 20 + Math.min(span, Math.max(0, m.t - from)) * 1000;
      for (const o of this.outputs()) o.send(m.bytes, at);
    }
  }

  /**
   * Dragging a traveler's marker along its path: what it passes sounds. `u0` to `u1` are places along the
   * path (0..1); the traveler is taken from its start (no offset, no loop) for this.
   */
  scrub(id, u0, u1) {
    if (Math.abs(u1 - u0) < 1e-4) return;
    this.gm.resume().catch(() => {});
    const raw = this.rawDoc(), mark = raw.elements.find(e => e.id === id);
    if (!mark?.play?.travel) return;
    const settings = this.app.player.settings, ctx = timeContext(settings);
    let c = this.scrubCache;
    if (!c || c.id !== id || c.rev !== this.app.store.rev) {
      const msgs = [];
      const elements = raw.elements.map(e => (e.id === id ? { ...e, play: { ...e.play, travel: { ...e.play.travel, at: undefined, start: undefined, loop: 'once', cue: undefined } } } : e));
      const entries = buildEntries({ ...raw, elements }, settings, { helpers: (event, api) => musicHelpers({ out: m => msgs.push(m), ctx, event, api }) });
      const entry = entries.find(x => x.world.travelers().some(t => t.id === id));
      const tr = entry?.world.travelers().find(t => t.id === id);
      c = this.scrubCache = { id, rev: this.app.store.rev, msgs, world: entry?.world, dur: tr?.spec.dur || 1 };
    }
    if (!c.world) return;
    const [a, b] = u0 < u1 ? [u0, u1] : [u1, u0];
    c.msgs.length = 0;
    c.world.seek(a * c.dur);
    c.world.step(b * c.dur);
    c.world.take();
    if (c.msgs.length) this.play(c.msgs, a * c.dur);
  }

  /** The drag is over. */
  endScrub() { this.scrubCache = null; }

  /** Everything off, now. */
  panic() { for (const o of this.outputs()) o.clear?.(); }

  /** The drawing the transport is showing: a take's at the playhead, or the scene's own. */
  rawDoc() { return this.app.canvas?.previewDoc || this.app.store.doc; }

  /** What plays: that drawing, or (with a solo) only the soloed marks and what they need. */
  doc() {
    const base = this.rawDoc();
    if (!this.solo) return base;
    const c = this.soloCache;
    if (c && c.base === base && c.rev === this.app.store.rev && c.token === this.soloToken) return c.doc;
    this.soloCache = { base, rev: this.app.store.rev, token: this.soloToken, doc: soloDoc(base, [...this.solo]) };
    return this.soloCache.doc;
  }

  /** Solo some marks (their ids), or everything again (null). */
  setSolo(ids) {
    this.solo = ids?.length ? new Set(ids) : null;
    this.soloToken = (this.soloToken || 0) + 1;
    this.app.canvas.invalidate();
    this.app.store.emit('solo');
  }

  /** A board's score plays unless the board is paused (the Boards panel's play button; Opt+click solos) or hidden. */
  plays(b) { return !b.paused && !b.hidden; }

  /** What the worlds are built from, as text: changes when a mark that plays does, or a board is paused. */
  key() {
    const d = this.rawDoc();
    const solo = this.solo ? `|solo:${[...this.solo].sort().join(',')}` : '';
    if (d !== this.app.store.doc) {   // (a take's drawing at the playhead: a new object when it changes)
      let s = this.sig.get(d);
      if (s === undefined) { s = scoreSignature(d); this.sig.set(d, s); }
      return s + solo;
    }
    // The live drawing is edited in place: look again whenever it has changed (a count of changes), rebuild only if the text differs.
    if (this.keyVal === undefined || this.keyRev !== this.app.store.rev) { this.keyRev = this.app.store.rev; this.keyVal = scoreSignature(d); }
    return this.keyVal + solo;
  }

  /** The worlds to draw: the runner's while it plays, else ones built just to show where things are. */
  view() {
    if (this.runner.active) return this.runner.entries;
    const key = `${this.key()}|${JSON.stringify({ ...this.app.player.settings, mixer: 0 })}`;
    if (this.viewKey !== key) { this.viewKey = key; this.viewEntries = hasScore(this.doc()) ? buildEntries(this.doc(), this.app.player.settings, { boardFilter: b => this.plays(b) }) : []; }
    return this.viewEntries;
  }

  onPlayer() {
    const p = this.app.player;
    if (p.playing && !this.timer && hasScore(this.doc())) {
      this.gm.resume().then(() => this.applyMixer()).catch(e => this.app.log?.(`Sound: ${e.message}`, 'error'));
      const v = this.view();
      if (v.length && v.every(e => e.idle)) this.app.canvas.flash('Nothing starts this score: give a trigger a Start, or a traveler a path');
      this.timer = setInterval(() => this.tick(), TICK_MS);
      this.tick();
    } else if (!p.playing && this.timer) {
      clearInterval(this.timer); this.timer = 0;
      this.runner.stop();
    }
  }

  tick() {
    const p = this.app.player;
    const wrap = p.wrapRange();
    this.runner.tick({ t: p.position() / 1000, playing: p.playing, rate: p.rate, limit: wrap ? wrap[1] / 1000 : Infinity, key: this.key() });
  }
}
