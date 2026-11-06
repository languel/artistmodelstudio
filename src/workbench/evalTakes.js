/**
 * An eval run as a take: the tasks, the drawing the model made for each, and what happened, saved to Assets (Recordings) to play back and review.
 *
 *   const r = await recordEval(app, { engine: 'pratt', model: 'pratt-deepseek-flash' })
 *     → { assetId, passed, of, ms, results }
 *
 * A take per model. On its Timeline:
 *   Titles     each task as it was said ("create a red circle", with n/N and the model)
 *   Drawing    the changes made, in order (the canvas is cleared and set up as the eval does, so it plays back like a live run)
 *   Actions    the tool calls the model made
 *   Narration  the verdict: PASS, or FAIL and why (the annotation: read it while the drawing plays)
 * The chat is not part of a take (History records the drawing); the request log (ams_requests) has the phrases and calls, and they are on the Actions track here.
 */
import { createTake, readingTime, clipId } from '../process/take.js';
import { TASKS, ensureAssistant, reset, runTask } from './assistEval.js';
import { useModel } from './modelStore.js';

const clone = v => JSON.parse(JSON.stringify(v));

export async function recordEval(app, { engine, model, mode = 'model', use = 'say', only = null, note = '', onProgress = () => {} } = {}) {
  ensureAssistant(app);
  const H = app.history;
  if (!H) throw new Error('History is not available');
  if (!H.capturing) H.setCapturing(true);
  useModel(app, engine, model);
  await reset(app);
  const tasks = TASKS.filter(t => !only || only.includes(t.id));
  const take = createTake({ title: `Eval · ${model} · ${mode}`, baseline: clone(app.store.doc), clips: [] });
  take.source = 'eval';
  const t0 = performance.now(), results = [];
  let t = 0;
  const push = clip => take.clips.push({ id: clipId(), fx: {}, ...clip });
  for (const [i, task] of tasks.entries()) {
    onProgress({ i, of: tasks.length, task: task.say });
    const from = H.entries.length;
    const said = task[use] || task.say;
    push({ track: 'title', start: t, dur: 2200, text: said, sub: `${i + 1}/${tasks.length} · ${model}`, fx: { fade: 300 } });
    t += 2200;
    const r = await runTask(app, task, { mode, use });
    results.push({ id: r.id, say: r.say, pass: r.pass, why: r.why, ms: r.ms, layer: r.layer, calls: r.calls, error: r.error });
    // the drawing: every change the task caused (its reset and setup too, so playing it back starts from the same page)
    const ids = H.entries.slice(from).filter(e => !e.muted).map(e => e.id);
    const draws = H.clipsFrom(ids, t, 150).map(c => ({ ...c, id: clipId() }));
    take.clips.push(...draws);
    const drawEnd = draws.length ? Math.max(...draws.map(c => c.start + c.dur)) : t;
    // the model's calls, as actions at the moment the drawing begins
    r.calls.slice(0, 6).forEach((c, k) => push({ track: 'action', start: t + k * 250, dur: 600, name: String(c).split(' ')[0], label: String(c).slice(0, 80) }));
    t = drawEnd + 300;
    const verdict = `${r.pass ? 'PASS' : 'FAIL'}${r.pass ? '' : `: ${r.why || r.error || 'no result'}`} (${(r.ms / 1000).toFixed(1)} s, ${r.layer})`;
    push({ track: 'say', start: t, dur: readingTime(verdict), text: verdict, meta: { pass: r.pass, task: r.id } });
    t += Math.max(1500, readingTime(verdict)) + 400;
  }
  await reset(app);
  take.duration = t;
  const passed = results.filter(r => r.pass).length;
  take.meta = { kind: 'eval', engine, model, mode, use, passed, of: results.length, note };
  const a = await app.recorder.saveTake(take, { title: `Eval · ${model} · ${passed}/${results.length}` });
  app.emit?.('take', take);   // (the Timeline's list of takes refreshes)
  return { assetId: a.id, passed, of: results.length, ms: Math.round(performance.now() - t0), results };
}
