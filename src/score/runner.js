/**
 * The runner plays scores on a transport: each tick it looks a little ahead of the playhead, steps
 * the worlds there (their handlers make MIDI messages), and hands the messages to the outputs
 * with the time they are due. It has no clock of its own: the caller says where the playhead is and
 * whether it is running (app.player), so seeking, looping, rate and pausing are the transport's.
 *
 *   const r = createRunner({ getDoc, getKey, getSettings, outputs })
 *   r.tick({ t, playing, rate, limit })    t seconds; limit: where a loop ends (don't play past it)
 *
 * A jump of the playhead (a seek, a loop wrap), a change to the marks that play, or to the tempo,
 * rebuilds the worlds at the playhead and stops the sound, so nothing hangs and nothing repeats.
 */
import { boardsOf, MAIN } from '../process/boards.js';
import { compileDoc } from './compile.js';
import { createWorld } from './world.js';
import { musicHelpers, createVoiceTracker } from './music.js';
import { timeContext } from '../time/sceneTransport.js';

/** What decides whether the worlds need rebuilding: the marks that play, as text. */
export function scoreSignature(doc) {
  const out = [];
  for (const e of doc?.elements || []) if (e.play) out.push(e.id, e.board || '', JSON.stringify(e.play), JSON.stringify(e.points));
  return out.join('|');
}

export const hasScore = doc => (doc?.elements || []).some(e => e.play);

/**
 * The worlds of a document, one per board that has a score: [{ board, world }]. `helpers(event, api)`
 * makes the music helpers handlers use (none are needed just to look at positions).
 */
export function buildEntries(doc, settings, { helpers = () => ({}), onError = () => {} } = {}) {
  const ctx = timeContext(settings);
  const boards = new Set((doc?.elements || []).filter(e => e.play).map(e => e.board || MAIN));
  const out = [];
  for (const b of boardsOf(doc)) {
    if (!boards.has(b.id)) continue;
    try {
      const { def, info } = compileDoc(doc, { board: b.id, ctx, helpers });
      for (const s of info.skipped) onError(`${b.title || b.id}: ${s}`);
      out.push({ board: b, world: createWorld(def) });
    } catch (e) { onError(`${b.title || b.id}: ${e.message}`); }
  }
  return out;
}

export function createRunner({ getDoc, getSettings, outputs, now = () => performance.now(), lookahead = 0.12, step = 1 / 240, onError = () => {}, onEvents = () => {} }) {
  let entries = [], queue = [], stepped = 0, active = false, builtKey = '', lastT = 0, lastNow = 0;
  const tracker = createVoiceTracker();
  const failed = new Set();

  const push = m => {
    let lo = 0, hi = queue.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (queue[mid].t <= m.t) lo = mid + 1; else hi = mid; }
    queue.splice(lo, 0, m);
  };

  const silence = () => { queue = []; tracker.reset(); for (const o of outputs()) o.clear?.(); };

  function build(t, settings) {
    const ctx = timeContext(settings);
    entries = buildEntries(getDoc(), settings, { helpers: (event, api) => musicHelpers({ out: push, ctx, event, api }), onError });
    // Playing from the very start begins at 0, so what is due at 0 (a start node, a traveler leaving) is not missed.
    const from = t < 0.1 ? 0 : t;
    for (const e of entries) e.world.seek(from);
    stepped = from;
  }

  return {
    get entries() { return entries; },
    get active() { return active; },
    get queued() { return queue.length; },
    stop() { if (active) { active = false; silence(); } },
    tick({ t, playing, rate = 1, limit = Infinity, key = '' }) {
      if (!playing || rate <= 0) { this.stop(); return; }
      const settings = getSettings();
      const nowMs = now();
      const fullKey = `${key}|${settings.tempo}|${settings.signature.numerator}/${settings.signature.denominator}|${settings.fps}`;
      const expected = lastT + ((nowMs - lastNow) / 1000) * rate;
      if (!active || fullKey !== builtKey || Math.abs(t - expected) > 0.3 + lookahead * rate) {
        silence();
        builtKey = fullKey; active = true; failed.clear();
        build(t, settings);
      }
      lastT = t; lastNow = nowMs;
      const horizon = Math.min(t + lookahead * rate, limit);
      while (stepped < horizon - 1e-9) {
        stepped = Math.min(horizon, stepped + step);
        for (const { board, world: w } of entries) {
          try { w.step(stepped); } catch (e) { if (!failed.has(w)) { failed.add(w); onError(e.message); } }
          const evs = w.take();
          if (evs.length) onEvents(evs, board);
        }
      }
      while (queue.length && queue[0].t <= horizon) {
        const m = queue.shift();
        if (!tracker.pass(m.bytes)) continue;
        const at = nowMs + ((m.t - t) / rate) * 1000;
        for (const o of outputs()) o.send(m.bytes, at);
      }
    }
  };
}
