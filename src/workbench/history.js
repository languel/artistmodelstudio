/**
 * History: every change to the drawing, always logged (no record button). Entries keep what
 * changed (an element-level diff), when, who, and a label. Any entry can be previewed or restored;
 * chosen entries are dragged onto the Timeline as clips.
 */
import { diffDocs, applyDiff } from '../process/take.js';

const clone = v => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));
const MAX = 800;

export class History {
  constructor(app) {
    this.app = app;
    this.entries = [];
    this.baseline = clone(app.store.doc);
    this.last = clone(app.store.doc);
    this.listeners = new Set();
    this.seq = 0;
    try { this.capturing = localStorage.getItem('ams_history_capture') !== '0'; } catch { this.capturing = true; }
    app.store.subscribe((doc, reason) => this.onChange(reason));
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const f of this.listeners) { try { f(this); } catch (err) { console.error(err); } } }

  setCapturing(on) {
    this.capturing = on;
    try { localStorage.setItem('ams_history_capture', on ? '1' : '0'); } catch { /* ignore */ }
    if (on) {
      // Keep the chain whole: what changed while paused becomes one entry.
      const prev = this.entries.length ? this.stateAfter(this.entries.length - 1) : this.baseline;
      const gap = diffDocs(prev, this.app.store.doc);
      if (gap) { this.entries.push({ id: `h${++this.seq}`, t: Date.now(), label: '(while paused)', by: 'user', diff: gap, summary: summarize(gap) }); this._states = null; }
    }
    this.last = clone(this.app.store.doc);
    this.emit();
  }

  onChange(reason) {
    if (!this.capturing) return;
    const doc = this.app.store.doc;
    const diff = diffDocs(this.last, doc);
    this.last = clone(doc);
    if (!diff) return;
    const by = this.app.store.log?.[this.app.store.log.length - 1]?.by || 'user';
    const e = { id: `h${++this.seq}`, t: Date.now(), label: String(reason || 'change'), by, diff, summary: summarize(diff) };
    this.entries.push(e);
    if (this.entries.length > MAX) {
      // Fold the oldest change into the baseline.
      const old = this.entries.shift();
      this.baseline = applyDiff(this.baseline, old.diff);
    }
    this._states = null;
    this.emit();
  }

  clear() { this.entries = []; this.baseline = clone(this.app.store.doc); this.last = clone(this.app.store.doc); this._states = null; this.emit(); }

  /** The document right after entry i (-1: the baseline). */
  stateAfter(i) {
    if (i < 0) return this.baseline;
    if (!this._states) {
      this._states = [];
      let d = this.baseline;
      for (const e of this.entries) { d = applyDiff(d, e.diff); this._states.push(d); }
    }
    return this._states[i];
  }

  indexOf(id) { return this.entries.findIndex(e => e.id === id); }

  /** Drawing clips from entries (in order, from time t): a single stroke keeps its drawing time. */
  clipsFrom(ids, t = 0, gap = 250) {
    const out = [];
    let at = t;
    for (const e of this.entries.filter(x => ids.includes(x.id))) {
      const adds = e.diff.add || [];
      let dur = 400;
      if (adds.length === 1 && adds[0].points?.length > 1) { const p = adds[0].points; dur = Math.min(20000, Math.max(300, (p[p.length - 1][2] ?? 0) - (p[0][2] ?? 0))) || 900; }
      else if (adds.length > 1) dur = Math.min(6000, Math.max(600, adds.length * 140));
      out.push({ track: 'draw', start: Math.round(at), dur: Math.round(dur), diff: clone(e.diff), label: e.label, by: e.by, fx: {} });
      at += dur + gap;
    }
    return out;
  }
}

function summarize(d) {
  const roles = (list = []) => { const m = {}; for (const e of list) m[e.role] = (m[e.role] || 0) + 1; return Object.entries(m).map(([r, n]) => `${n} ${r}${n > 1 ? 's' : ''}`).join(', '); };
  const parts = [];
  if (d.add?.length) parts.push(`+ ${roles(d.add)}`);
  if (d.update?.length) parts.push(`~ ${roles(d.update)}`);
  if (d.remove?.length) parts.push(`− ${d.remove.length}`);
  for (const k of ['stages', 'artboard', 'title', 'brushes', 'groups']) if (k in d) parts.push(k);
  return parts.join(' · ');
}
