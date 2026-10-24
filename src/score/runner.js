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
  for (const b of boardsOf(doc)) if (b.paused || b.hidden) out.push(`muted:${b.id}`);   // (a paused or hidden board does not play)
  for (const e of doc?.elements || []) if (e.play) out.push(e.id, e.board || '', JSON.stringify(e.play), JSON.stringify(e.points));
  return out.join('|');
}

export const hasScore = doc => (doc?.elements || []).some(e => e.play);

/**
 * The worlds of a document, one per board that has a score: [{ board, world }]. `helpers(event, api)`
 * makes the music helpers handlers use (none are needed just to look at positions).
 */
export function buildEntries(doc, settings, { helpers = () => ({}), onError = () => {}, boardFilter = () => true } = {}) {
  const ctx = timeContext(settings);
  const boards = new Set((doc?.elements || []).filter(e => e.play).map(e => e.board || MAIN));
  const out = [];
  for (const b of boardsOf(doc)) {
    if (!boards.has(b.id) || !boardFilter(b)) continue;
    try {
      const { def, info } = compileDoc(doc, { board: b.id, ctx, helpers, beatUnits: settings.beatUnits, quant: settings.quant });
      for (const s of info.skipped) onError(`${b.title || b.id}: ${s}`);
      // idle: nothing in it starts by itself (no traveler running, no body, no trigger set to start)
      out.push({ board: b, world: createWorld(def), idle: !(def.travelers.length || def.bodies.length || def.starts.length), paths: info.paths });
    } catch (e) { onError(`${b.title || b.id}: ${e.message}`); }
  }
  return out;
}

export function createRunner({ getDoc, getSettings, outputs, now = () => performance.now(), lookahead = 0.12, step = 1 / 240, onError = () => {}, onEvents = () => {}, onEffects = () => {}, boardFilter = () => true }) {
  let entries = [], queue = [], stepped = 0, active = false, builtKey = '', lastT = 0, lastNow = 0;
  const tracker = createVoiceTracker();
  const failed = new Set();

  const push = m => {
    let lo = 0, hi = queue.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (queue[mid].t <= m.t) lo = mid + 1; else hi = mid; }
    queue.splice(lo, 0, m);
  };

  const silence = () => { queue = []; tracker.reset(); for (const o of outputs()) o.clear?.(); };
  /** An edit or a loop: what is sounding is let ring (its note-offs stay queued), nothing is cut off. */
  const isOff = b => (b[0] & 0xf0) === 0x80 || ((b[0] & 0xf0) === 0x90 && b[2] === 0);
  const soften = t => {
    queue = queue.filter(m => isOff(m.bytes));
    // A note held open (a gate) has no note-off queued: the new score cannot end it, so it ends here.
    const ends = new Set(queue.map(m => ((m.bytes[0] & 0x0f) << 8) | m.bytes[1]));
    for (const [c, n] of tracker.sounding()) if (!ends.has((c << 8) | n)) push({ t, bytes: [0x80 | c, n, 0] });
  };

  function build(t, settings, from0) {
    const ctx = timeContext(settings);
    entries = buildEntries(getDoc(), settings, { helpers: (event, api) => musicHelpers({ out: push, ctx, event, api }), onError, boardFilter });
    // Playing from the very start begins at 0, so what is due at 0 (a start node, a traveler leaving) is not missed.
    const from = from0 ?? (t < 0.1 ? 0 : t);
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
      const fullKey = `${key}|${settings.tempo}|${settings.signature.numerator}/${settings.signature.denominator}|${settings.fps}|${settings.beatUnits}|${settings.quant}`;
      const expected = lastT + ((nowMs - lastNow) / 1000) * rate;
      const jumped = Math.abs(t - expected) > 0.3 + lookahead * rate;
      const wrapped = active && jumped && limit !== Infinity && t < lastT;   // (a loop range came round)
      if (!active || fullKey !== builtKey || jumped) {
        // A start, a seek: silence. An edit while playing: rebuilt from where the sound has been sent up to (no note twice, none cut).
        // A loop coming round: from its start, letting what sounds ring out.
        const edit = active && !jumped && fullKey !== builtKey;
        if (edit || wrapped) soften(t); else silence();
        builtKey = fullKey; active = true; failed.clear();
        build(t, settings, edit ? Math.max(t, stepped) : undefined);
      }
      lastT = t; lastNow = nowMs;
      const horizon = Math.min(t + lookahead * rate, limit);
      while (stepped < horizon - 1e-9) {
        stepped = Math.min(horizon, stepped + step);
        for (const { board, world: w } of entries) {
          try { w.step(stepped); } catch (e) { if (!failed.has(w)) { failed.add(w); onError(e.message); } }
          const evs = w.take();
          if (evs.length) onEvents(evs, board);
          const fx = w.takeEffects();
          if (fx.length) onEffects(fx, board);
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

/**
 * A whole score ahead of time, with no sound: what its worlds do over `seconds`. For tests, for agents
 * (who cannot hear), and as the first step of exporting. Returns { events, messages } in time order;
 * messages are { t, bytes } (what an output would be sent, before the voice tracker).
 */
export function renderScore(doc, settings, seconds, { step = 1 / 240 } = {}) {
  const ctx = timeContext(settings);
  const messages = [], events = [], errors = [];
  const entries = buildEntries(doc, settings, { helpers: (event, api) => musicHelpers({ out: m => messages.push(m), ctx, event, api }), onError: m => errors.push(m) });
  for (const { board, world } of entries) {
    try {
      for (let t = step; t < seconds + step; t += step) {
        world.step(Math.min(t, seconds));
        for (const e of world.take()) events.push({ ...e, board: board.id });
      }
    } catch (e) { errors.push(`${board.title || board.id}: ${e.message}`); }
  }
  events.sort((a, b) => a.t - b.t);
  messages.sort((a, b) => a.t - b.t);
  return { events, messages: messages.filter(m => m.t <= seconds + 1), errors };
}
