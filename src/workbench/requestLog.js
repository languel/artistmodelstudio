/**
 * The request log: every phrase typed or said into the quick field, which layer answered it, what it did, and whether it was undone.
 * It is how the assistant gets better: a phrase that was undone soon after was probably wrong; a phrase that went to the model and
 * worked is a candidate for the instant grammar; a phrase the model got wrong becomes an example in its prompt.
 *
 *   layer: 'phrase' (instant grammar) | 'command' (a ranked command) | 'model' (the assistant, flow mode)
 * Kept in the browser (the last 300), read with ams_requests, and exported as JSON lines.
 */
const KEY = 'ams_request_log';
const UNDO_WITHIN = 30000;

export class RequestLog {
  constructor(app) {
    this.app = app;
    this.list = [];
    try { this.list = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { /* none yet */ }
    // An undo soon after a request marks it (the last request that changed something).
    app.store.subscribe((_, reason) => {
      if (reason !== 'undo') return;
      const last = [...this.list].reverse().find(r => r.changed);
      if (last && Date.now() - last.t < UNDO_WITHIN && !last.undone) { last.undone = true; this.save(); }
    });
  }

  save() { try { localStorage.setItem(KEY, JSON.stringify(this.list.slice(-300))); } catch { /* quota */ } }

  /** Begin a request. Returns the entry; call done(entry, …) when it ends. */
  start(text, layer, extra = {}) {
    const e = { t: Date.now(), text: String(text).slice(0, 400), layer, model: layer === 'model' ? this.model?.() : undefined, rev: this.app.store.rev || 0, ...extra };
    this.list.push(e); if (this.list.length > 300) this.list.shift();
    return e;
  }

  done(e, { calls, ok = true, error, said } = {}) {
    e.ms = Date.now() - e.t; e.ok = ok && !error;
    if (calls) e.calls = calls.slice(0, 8).map(c => ({ tool: c.tool, args: JSON.stringify(c.args).slice(0, 300), ...(c.error ? { error: c.error } : {}) }));
    if (error) e.error = String(error).slice(0, 300);
    if (said) e.said = String(said).slice(0, 200);
    e.changed = (this.app.store.rev || 0) !== e.rev;
    this.save();
    return e;
  }

  clear() { this.list = []; this.save(); }
  /** For tests and tools: counts by layer and how often each was undone */
  summary() {
    const out = {};
    for (const r of this.list) { const o = (out[r.layer] ||= { n: 0, failed: 0, undone: 0 }); o.n++; if (r.ok === false) o.failed++; if (r.undone) o.undone++; }
    return out;
  }
  jsonl() { return this.list.map(r => JSON.stringify(r)).join('\n'); }
}
