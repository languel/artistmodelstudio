/**
 * Scores in the studio: listens to the transport (app.player), and while it runs plays the marks
 * that carry `play` (src/score) through the built-in GM sound. It owns no clock: seeking, looping,
 * rate and pause are the transport's. Audio starts on the first play of a scene that has a score
 * (browsers need a click for that, and Play is one).
 */
import { normalizeElement } from '../process/document.js';
import { createRunner, buildEntries, hasScore, scoreSignature } from '../score/runner.js';
import { createGmOutput } from '../score/outputs/gm.js';
import { createWebMidiOutput } from '../score/outputs/webmidi.js';

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
    this.extra = new Set();   // other outputs (a log, in tests)
    this.errors = [];
    this.sig = new WeakMap();
    this.runner = createRunner({
      getDoc: () => this.doc(),
      getSettings: () => app.player.settings,
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

  outputs() { return [...(this.prefs.gm ? [this.gm] : []), ...(this.midi.connected ? [this.midi] : []), ...this.extra]; }

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
    if (patch.program) {
      const [ch, n] = patch.program;
      this.prefs.programs[ch] = n; this.gm.setProgram(ch, n);
      for (const p of this.midi.connected ? [this.midi] : []) p.send([0xc0 | (ch - 1), n]);
    }
    this.savePrefs();
  }

  /** A short chord to hear the outputs; from a click. */
  async test() {
    await this.gm.resume().catch(() => {});
    const t = performance.now() + 60;
    [60, 64, 67].forEach((n, i) => { for (const o of this.outputs()) { o.send([0x90, n, 96], t + i * 140); o.send([0x80, n, 0], t + i * 140 + 500); } });
  }

  /** Everything off, now. */
  panic() { for (const o of this.outputs()) o.clear?.(); }

  /** The drawing the transport is showing: a take's at the playhead, or the scene's own. */
  doc() { return this.app.canvas?.previewDoc || this.app.store.doc; }

  key() {
    const d = this.doc();
    let s = this.sig.get(d);
    if (s === undefined) { s = scoreSignature(d); this.sig.set(d, s); }
    return s;
  }

  /** The worlds to draw: the runner's while it plays, else ones built just to show where things are. */
  view() {
    if (this.runner.active) return this.runner.entries;
    const key = `${this.key()}|${JSON.stringify(this.app.player.settings)}`;
    if (this.viewKey !== key) { this.viewKey = key; this.viewEntries = hasScore(this.doc()) ? buildEntries(this.doc(), this.app.player.settings) : []; }
    return this.viewEntries;
  }

  onPlayer() {
    const p = this.app.player;
    if (p.playing && !this.timer && hasScore(this.doc())) {
      this.gm.resume().catch(e => this.app.log?.(`Sound: ${e.message}`, 'error'));
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
