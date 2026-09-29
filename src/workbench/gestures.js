/**
 * Gestures in the studio: the gesture script (process/gestures.js) run on a source's person, and
 * what the gestures do. Kept in the browser, like the sources: { code, examples, source, on }.
 *
 * Actions:
 *   color next | color prev [palette]    the stroke color: the next color of a palette
 *   color sample <point>                 the stroke color: the source's color at a point (hold up a
 *                                        colored thing and pinch at it)
 *   undo | redo | run (play/pause the board) | board next | board prev | slot <n>
 *   !<console command>                   any studio tool, as in the Assistant (!board list …)
 *   a function (app, body) => …          anything
 * Code reads them too: source('cam').fired('pick color') is true for half a second after it fires.
 */
import { Recognizer, readGestures, classifier, features, learnedLabels } from '../process/gestures.js';
import { allPalettes } from './palettes.js';
import { boardsOf, MAIN } from '../process/boards.js';
import { parseCommand } from './console.js';

const KEY = 'ams_gestures_v1';
export const DEFAULT_GESTURES = `// gesture(name, steps, action, { within, cooldown }): the steps, in order, each held a moment.
// Points: nose, mouth, left.pinky, right.index, left.palm, right.wrist… (the person's own left and right)
gesture('pick color', [{ touch: ['left.pinky', 'nose'], hold: 300 }], 'color next')
gesture('sample color', [{ pinch: 'right', hold: 500 }], 'color sample right.index')
gesture('undo', [{ fist: 'left' }, { open: 'left' }, { fist: 'left' }], 'undo', { within: 900 })
`;

export class Gestures {
  constructor(app) {
    this.app = app;
    this.listeners = new Set();
    this.fired = new Map();   // name → when it last fired
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { /* none */ }
    this.code = saved.code ?? DEFAULT_GESTURES;
    this.examples = saved.examples || [];
    this.source = saved.source || null;
    this.on_ = Boolean(saved.on);
    this.palette = saved.palette || 'Kandinsky';
    this.colorIndex = 0;
    this.compile();
    app.sources.on(name => { if (name && name === this.source) this.step(); });
    if (this.on_) this.enable(true);
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(what) { for (const f of this.listeners) { try { f(what); } catch (err) { console.error(err); } } }
  save() { try { localStorage.setItem(KEY, JSON.stringify({ code: this.code, examples: this.examples, source: this.source, on: this.on_, palette: this.palette })); } catch { /* full */ } }
  get enabled() { return this.on_; }

  /** Read the gesture script; an error keeps the last working one. */
  compile(code = this.code) {
    try {
      const list = readGestures(code);
      this.code = code; this.error = null; this.list = list;
      this.recognizer = new Recognizer(list, { classify: classifier(this.examples) });
    } catch (err) { this.code = code; this.error = err.message; }
    this.save(); this.emit('code');
    return this.error;
  }

  /** Watch a source (the camera, a video) for gestures, or stop. */
  enable(on = !this.on_, source = this.source) {
    const S = this.app.sources;
    if (this.source && this.source !== source) S.keep.delete(this.source);
    this.source = source || S.list.find(d => d.kind === 'camera')?.name || S.list[0]?.name || null;
    this.on_ = Boolean(on && this.source);
    if (this.source) { if (this.on_) S.keep.set(this.source, new Set(['pose', 'hands'])); else S.keep.delete(this.source); }
    this.save(); this.emit('state');
  }

  /** A new detection on the watched source. */
  step() {
    const body = this.app.sources.body(this.source);
    if (!body || body.t === this.lastT) return;
    this.lastT = body.t;
    this.body = body;
    if (this.recording) this.take(body);
    if (!this.on_ || !this.recognizer) { this.emit('body'); return; }
    for (const name of this.recognizer.feed(body)) this.fire(name, body);
    this.emit('body');
  }

  fire(name, body) {
    this.fired.set(name, performance.now());
    const g = this.list.find(x => x.name === name);
    this.app.log?.(`Gesture: ${name}${typeof g?.action === 'string' ? ` → ${g.action}` : ''}`);
    try { this.act(g?.action, body); } catch (err) { this.app.log?.(`Gesture “${name}”: ${err.message}`, 'error'); }
    this.emit('fired');
  }

  /** Whether a gesture fired in the last `ms` milliseconds (for code). */
  recent(name, ms = 500) { return performance.now() - (this.fired.get(name) || -Infinity) < ms; }

  act(action, body) {
    const app = this.app;
    if (!action) return;
    if (typeof action === 'function') return action(app, body);
    const text = String(action).trim();
    if (text.startsWith('!')) { const { tool, args } = parseCommand(text); return window.ams?.callTool?.(tool, args); }
    const [verb, ...rest] = text.split(/\s+/);
    const arg = rest.join(' ');
    if (verb === 'color') {
      const [how, ...more] = rest;
      if (how === 'sample') return app.setPaint('stroke', this.sampleColor(body, more[0] || 'right.index'));
      const pal = allPalettes()[more.join(' ') || this.palette] || Object.values(allPalettes())[0];
      this.colorIndex = (this.colorIndex + (how === 'prev' ? -1 : 1) + pal.length) % pal.length;
      return app.setPaint('stroke', pal[this.colorIndex].hex);
    }
    if (verb === 'undo') return app.store.undo();
    if (verb === 'redo') return app.store.redo();
    if (verb === 'run') return app.toggleBoardRun(app.activeBoard || MAIN);
    if (verb === 'slot') return app.useSlot(Number(arg));
    if (verb === 'board') {
      const list = boardsOf(app.store.doc), i = list.findIndex(b => b.id === (app.activeBoard || MAIN));
      const next = list[(i + (arg === 'prev' ? -1 : 1) + list.length) % list.length];
      return app.goToBoard(next.id, { animate: true });
    }
    throw new Error(`Unknown action “${text}”`);
  }

  /** The source's color around a point of the body (a small average). */
  sampleColor(body, point) {
    const p = body?.point(point), view = this.app.sources.view(this.source);
    if (!p || !view) throw new Error(`No ${point} in view`);
    const c = document.createElement('canvas'); c.width = c.height = 1;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const r = Math.max(2, body.unit * 0.03);
    ctx.drawImage(view, p.x - r, p.y - r, 2 * r, 2 * r, 0, 0, 1, 1);
    const [R, G, B] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[R, G, B].map(v => v.toString(16).padStart(2, '0')).join('')}`;
  }

  // ---- learned poses --------------------------------------------------------------------

  /** The labels the script asks for, with how many examples each has. */
  labels() {
    const counts = {};
    for (const e of this.examples) counts[e.label] = (counts[e.label] || 0) + 1;
    for (const l of learnedLabels(this.list || [])) counts[l] ??= 0;
    return counts;
  }

  /** Record examples of a pose for `seconds` (the person holds it, moving a little). */
  record(label, seconds = 2) {
    if (!this.source) throw new Error('Pick a source to watch first');
    this.app.sources.keep.set(this.source, new Set(['pose', 'hands']));
    this.recording = { label, until: performance.now() + seconds * 1000, took: 0 };
    this.emit('state');
    return new Promise(done => { this.recordDone = done; });
  }

  take(body) {
    const r = this.recording;
    if (performance.now() > r.until) {
      this.recording = null;
      if (!this.on_) this.app.sources.keep.delete(this.source);
      this.compile();
      this.recordDone?.(r.took);
      this.emit('state');
      return;
    }
    this.examples.push({ label: r.label, features: features(body).map(v => (v === null ? null : Math.round(v * 1000) / 1000)) });
    r.took++;
  }

  forget(label) { this.examples = this.examples.filter(e => e.label !== label); this.compile(); }
}
