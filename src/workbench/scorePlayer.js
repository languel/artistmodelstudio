/**
 * Scores in the studio: listens to the transport (app.player), and while it runs plays the marks
 * that carry `play` (src/score) through the built-in GM sound. It owns no clock: seeking, looping,
 * rate and pause are the transport's. Audio starts on the first play of a scene that has a score
 * (browsers need a click for that, and Play is one).
 */
import { createRunner, hasScore, scoreSignature } from '../score/runner.js';
import { createGmOutput } from '../score/outputs/gm.js';

const TICK_MS = 25;

export class ScorePlayer {
  constructor(app) {
    this.app = app;
    this.gm = createGmOutput();
    this.extra = new Set();   // other outputs (Web MIDI, a log)
    this.errors = [];
    this.sig = new WeakMap();
    this.runner = createRunner({
      getDoc: () => this.doc(),
      getSettings: () => app.player.settings,
      outputs: () => [this.gm, ...this.extra],
      onError: msg => { this.errors.push(msg); app.log?.(`Score: ${msg}`, 'error'); }
    });
    app.player.on(() => this.onPlayer());
  }

  /** The drawing the transport is showing: a take's at the playhead, or the scene's own. */
  doc() { return this.app.canvas?.previewDoc || this.app.store.doc; }

  key() {
    const d = this.doc();
    let s = this.sig.get(d);
    if (s === undefined) { s = scoreSignature(d); this.sig.set(d, s); }
    return s;
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
