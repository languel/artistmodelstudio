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
    this.listen();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const f of this.listeners) { try { f(this); } catch (err) { console.error(err); } } }
  setCapturing(on) { this.capturing = Boolean(on); try { localStorage.setItem(KEY, on ? '1' : '0'); } catch { /* ignore */ } this.emit(); }
  clear() { this.entries = []; this.emit(); }

  listen() {
    const downs = new Map();
    const ignored = t => !t?.closest || t.closest('[data-user-actions], .wb-guide-layer, .wb-guide-card, .wb-tl-bar, .wb-tl-hist, .wb-tl-ints');   // (its own switches, the overlays)
    window.addEventListener('pointerdown', e => { if (this.capturing) downs.set(e.pointerId, { x: e.clientX, y: e.clientY, target: e.target }); }, true);
    window.addEventListener('pointerup', e => {
      const d = downs.get(e.pointerId); downs.delete(e.pointerId);
      if (!this.capturing || !d || ignored(d.target) || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
      const canvas = this.app.canvas?.canvas;
      if (canvas && (d.target === canvas || canvas.contains?.(d.target))) return;   // (marks drawn are in History)
      this.record(d.target, e.clientX, e.clientY);
    }, true);
    window.addEventListener('pointercancel', e => downs.delete(e.pointerId), true);
  }

  /** A click on `el`: remember the control. */
  record(el, x, y) {
    const g = el.closest?.('[data-guide]');
    const target = g?.getAttribute('data-guide') || null;
    const label = this.app.userActions?.targetName?.(el) || (target || '').replace(/^[a-z]+:/, '') || 'click';
    const where = this.app.userActions?.where?.(el) || '';
    this.entries.push({ id: `i${++this.seq}`, t: Date.now(), target, label, where, x: Math.round(x), y: Math.round(y) });
    if (this.entries.length > MAX) this.entries.shift();
    this.emit();
  }

  /** Clips for the Timeline's Actions kind: real spacing (gaps over 1.5 s shortened), each lasting long enough to read. */
  clips(entries = this.entries, { gap = 1500, dur = 800 } = {}) {
    const out = [];
    let at = 0, prev = null;
    for (const e of entries) {
      if (prev) at += Math.min(gap, Math.max(300, e.t - prev.t));
      out.push({ track: 'action', start: Math.round(at), dur, name: 'ui', label: e.label || e.target || 'click', ui: { target: e.target, x: e.x, y: e.y, where: e.where }, fx: {} });
      prev = e;
    }
    return out;
  }
}
