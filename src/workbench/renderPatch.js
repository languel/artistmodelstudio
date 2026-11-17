/**
 * The scene's modular synth in a render (renderAudio.mixTake): the same engine (src/audio/modular/engine.js) on the
 * render's OfflineAudioContext, so a film sounds the way the patch played. For the range [t0, t1] (ms):
 *   - every sequencer step, on the Timeline's tempo (loops of the transport are not followed: a render is one pass)
 *   - every score note a mixer channel sends out to the Patch (renderScore, from the scene's start; boards paused or
 *     hidden are left out, as when playing)
 *   - automation lanes on 'patch:<module>.<setting>', applied as the render runs (the context is suspended every
 *     ~53 ms to set them)
 * Returns how many notes it booked (0: the patch adds nothing).
 */
import { AudioPatch } from '../audio/modular/engine.js';
import { toDefs, instrumentsOn, targetsOf, isSequencer, stepsBetween, settingsOf } from '../audio/modular/patch.js';
import { renderScore } from '../score/runner.js';
import { createRouter } from '../score/mixer.js';
import { lanesOf, laneValue } from '../process/keyframes.js';

/** Does the scene's patch make sound (an Output that is on)? */
export const patchSounds = patch => patch.modules.some(m => m.kind === 'Output' && !settingsOf(m).mute);

/** The scene as it plays: marks on paused or hidden boards left out. */
function playingDoc(doc) {
  const off = new Set((doc.boards || []).filter(b => b.paused || b.hidden).map(b => b.id));
  if (doc.artboard?.paused || doc.artboard?.hidden) off.add('main');
  return off.size ? { ...doc, elements: doc.elements.filter(e => !off.has(e.board || 'main')) } : doc;
}

export async function renderPatch(app, ctx, [t0, t1], take = null) {
  const settings = app.player.settings, patch = settings.patch;
  if (!patchSounds(patch)) return 0;
  const s0 = t0 / 1000, s1 = t1 / 1000, bps = settings.tempo / 60;
  const lanes = (take ? lanesOf(take) : []).filter(l => l.address.startsWith('patch:'));
  const laneAt = (lane, s) => laneValue(lane, s * 1000 - lane.start, lane.meta);
  const engine = new AudioPatch(ctx);
  const { defs, outputs } = toDefs(patch);
  const apply = (s, target) => {   // automation: the value of each lane at s (seconds, scene time)
    for (const lane of lanes) {
      const [id, prop] = lane.address.slice(6).split('.'), v = laneAt(lane, s);
      if (v == null) continue;
      if (target) { if (target.has(id)) target.get(id).settings[prop] = v; continue; }
      const m = engine.modules.get(id);
      if (m) { m.settings = { ...m.settings, [prop]: v }; engine.update(m, m.settings); }
    }
  };
  apply(s0, defs);
  engine.sync(defs, outputs);
  let booked = 0;

  // Sequencers, on the tempo.
  for (const m of patch.modules) {
    if (!isSequencer(m.kind)) continue;
    const targets = targetsOf(patch, m.id);
    if (!targets.length) continue;
    for (const ev of stepsBetween(m, s0 * bps, s1 * bps)) {
      for (const id of targets) { engine.trigger(id, ev.note, ev.beat / bps - s0, ev.beats / bps, ev.velocity); booked++; }
    }
  }

  // Scores whose channels go out to the Patch.
  const out = renderScore(playingDoc(app.store.doc), settings, s1);
  const router = createRouter(() => settings.mixer), held = new Map();
  for (const msg of out.messages) {
    const r = router.route(msg.bytes, msg.t * 1000);
    if (!r || r.to !== 'patch') continue;
    const [st, note, vel] = r.bytes, kind = st & 0xf0, ch = (st & 0x0f) + 1, t = msg.t - s0;
    for (const id of instrumentsOn(patch, ch)) {
      const key = `${id}:${note}`, list = held.get(key) || [];
      if (kind === 0x90 && vel > 0) {
        if (t < 0) continue;   // (before the range: not heard)
        const v = engine.trigger(id, note, t, Infinity, vel / 127);
        if (v) { list.push(v); held.set(key, list); booked++; }
      } else if (kind === 0x80 || kind === 0x90) {
        const v = list.shift();
        if (v) engine.release(engine.modules.get(id), v, Math.max(0, t));
      }
    }
  }
  // (notes still held at the end ring out as the render stops)

  // Automation as the render runs: suspend, set, resume (on render-quantum boundaries).
  if (lanes.length && booked) {
    const step = 128 * 20 / ctx.sampleRate;
    for (let t = step; t < s1 - s0; t += step) ctx.suspend(t).then(() => { apply(s0 + t); ctx.resume(); }).catch(() => {});
  }
  return booked;
}
