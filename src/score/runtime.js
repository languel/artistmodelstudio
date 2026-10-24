/**
 * The score runtime: plays a score's marks in any page, with no editor. The host gives it the exported score
 * (`scoreExport(doc)`) and a clock; it answers the same signals as the editor's `__.score`.
 *
 *   import { createScoreRuntime, scoreExport } from './runtime.js'
 *   const rt = createScoreRuntime(json)           // json: scoreExport(doc) or its parsed text
 *   rt.features(t)                                 // { t, features, ports } at score time t (seconds), moving forward
 *   rt.seek(t)                                     // jump (rebuilds the worlds at t)
 *   rt.recent(since, name)                         // events since a sequence number
 *   rt.setInput(name, value)                       // a designated input (play.in)
 *   rt.messages                                    // what the score would send to MIDI (if any), with its times
 */
import { buildEntries } from './runner.js';
import { musicHelpers } from './music.js';
import { createBus, sampleFeatures } from './bus.js';
import { normalizeTransport } from '../time/sceneTransport.js';
import { triggerIdOf } from './compile.js';
import * as signals from './signals.js';

export const FORMAT = 'ams-score/1';

/** The exported score: the marks that play, with the settings they play by. Plain JSON. */
export function scoreExport(doc, settings = {}) {
  const elements = (doc?.elements || []).filter(e => e.play || e.role === 'line' || e.role === 'plane' || e.role === 'point' || e.role === 'guide' || e.role === 'gesture');
  return { format: FORMAT, settings: normalizeTransport(settings), boards: doc?.boards || [], artboard: doc?.artboard, elements };
}

export function createScoreRuntime(input, { onMessage = null } = {}) {
  const json = typeof input === 'string' ? JSON.parse(input) : input;
  if (json?.format !== FORMAT) throw new Error(`Not a score export (${json?.format || 'no format'})`);
  const doc = { artboard: json.artboard, boards: json.boards || [], elements: json.elements || [], stages: [{ id: 'stage', name: 'Score', visible: true }] };
  const settings = normalizeTransport(json.settings);
  const messages = [];
  const bus = createBus({ now: () => 0 });
  let entries = [], at = 0;
  const build = t => {
    signals.clear();
    entries = buildEntries(doc, settings, { helpers: (event, api) => musicHelpers({ out: m => { messages.push(m); onMessage?.(m); }, ctx: { tempo: settings.tempo, signature: settings.signature, fps: settings.fps }, event, api }) });
    for (const { world } of entries) world.seek(t);
    at = t;
  };
  const advance = t => {
    if (t < at - 1e-9) build(t);
    for (const { board, world } of entries) {
      for (let s = at + 1 / 120; s <= t + 1e-9; s += 1 / 120) world.step(s);
      world.step(t);
      bus.record(world.take(), board, doc);
    }
    at = t;
    messages.sort((a, b) => a.t - b.t);
  };
  build(0);
  return {
    get settings() { return settings; },
    messages,
    features(t = at) { advance(t); const f = sampleFeatures(entries, t, doc); return { t, ...f }; },
    seek(t) { build(Math.max(0, t)); },
    recent: (since = 0, name = null) => bus.recent(since, name),
    /** A designated input: an element with play.in = name. Traveler: sets its place (0..1 of a lap). Event: fires it. */
    setInput(name, value) {
      const el = doc.elements.find(e => e.play?.in === name);
      if (!el) return false;
      signals.publish(name, value, at);
      for (const { world } of entries) {
        if (el.play.travel) {
          const tr = world.travelers().find(x => x.id === el.id);
          if (tr?.spec) { const dur = Math.max(1e-6, tr.spec.dur); tr.spec.start = at - (Number(value) || 0) * dur / Math.max(1e-6, tr.spec.rate ?? 1); }
        } else if (el.play.trigger && Number(value) > 0) world.arrive(triggerIdOf(el), { input: value }, at);
      }
      return true;
    }
  };
}
