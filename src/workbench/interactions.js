/**
 * Interactions: the controls you use, recorded for walkthroughs (what History does not keep: it records the drawing, not the interface).
 *
 * Each entry is a click on a control: which one (its Guide name, `tool:play`, `panel:history`…, else where it was on screen), what it is called,
 * and when. Strokes on the canvas are not here (History has them); neither are pointer moves. Off until switched on (the Timeline's pointer
 * button). Shown as a track of the open take, and played back by the Guide's cursor travelling to each control (it shows, it does not redo).
 */
const KEY = 'ams_interactions_capture';
const MAX = 500;

export class Interactions {
  constructor(app) {
    this.app = app;
    this.entries = [];
    this.listeners = new Set();
    this.seq = 0;
    try { this.capturing = localStorage.getItem(KEY) === '1'; } catch { this.capturing = false; }
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const f of this.listeners) { try { f(this); } catch (err) { console.error(err); } } }
  setCapturing(on) { this.capturing = Boolean(on); try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ } this.emit(); }
  clear() { this.entries = []; this.emit(); }

  /**
   * A finished cue from Show user actions (keys, clicks, drags, scrolls, with what each did): kept as a step.
   * Two readers in mind. A student watching needs every step in words (the input, what it was on, the tool, what it did). Something playing the
   * sequence back faster needs each step to be checkable: `changes` are the History entries made by the step (their ids and summaries: before is the
   * drawing without them, after is with), `effects` the interface's own account.
   */
  addCue(c) {
    if (!this.capturing || !c || c.ui?.bar) return;
    const H = this.app.history, ui = c.ui || {};
    const changes = (H?.entries || []).filter(e => e.t >= c.t - 60 && e.t <= c.t + 700).map(e => ({ id: e.id, label: e.label, summary: e.summary }));
    const entry = { id: `i${++this.seq}`, t: c.t, kind: c.kind, input: c.input, button: c.button || '', where: c.where || '', target: ui.target || null, name: ui.name || '', tool: ui.tool || '', command: ui.command || null,
      drag: Boolean(ui.drag), since: ui.since || c.t, from: ui.from || null, to: ui.to || null, world: ui.world || null, effects: (c.effects || []).map(f => f.text), changes };
    this.entries.push(entry);
    if (this.entries.length > MAX) this.entries.shift();
    this.emit();
  }

  /** A step in words: "left drag on the canvas (Line) from 120,300 to 480,310 → add line". */
  describe(e) {
    const on = e.target ? e.name || e.target : e.where === 'Canvas' ? `the canvas${e.tool ? ` (${e.tool})` : ''}` : e.name || e.where || '';
    const path = e.drag && e.world ? ` from ${e.world[0].join(',')} to ${e.world[1].join(',')}` : '';
    const did = e.effects.length ? e.effects.join(' · ') : e.changes.map(c => c.summary || c.label).join(' · ');
    return `${e.input}${on ? ` on ${on}` : e.name ? ` · ${e.name}` : ''}${path}${did ? ` → ${did}` : ''}`;
  }

  /** The sequence as steps for an agent or a handout: numbered, in words, with what changed. */
  steps() { return this.entries.map((e, i) => ({ n: i + 1, at: e.t, say: this.describe(e), input: e.input, on: e.target || e.where, tool: e.tool, from: e.world?.[0] || null, to: e.world?.[1] || null, command: e.command, effects: e.effects, changes: e.changes })); }

  /** Clips for the Timeline's Actions kind, placed on the shared clock (liveClock.js). */
  clips(clock, entries = this.entries) {
    // (on the shared clock, from when a press began to when it was released: a drag lasts as long as it did)
    return entries.map(e => {
      const start = clock.at(e.since ?? e.t), end = clock.at(e.t);
      return { track: 'action', start: Math.round(start), dur: Math.max(500, Math.round(end - start)), name: 'ui', label: this.describe(e), ui: { kind: e.kind, target: e.target, drag: e.drag, from: e.from, to: e.to, where: e.where, command: e.command, changes: e.changes.map(c => c.id) }, fx: {} };
    });
  }
}
