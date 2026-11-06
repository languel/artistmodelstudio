/**
 * The recorder: makes a take (baseline + clips) from what happens in the studio. Document changes
 * become draw clips (a hand-drawn stroke keeps its own timing; a batch of new marks is revealed one
 * by one), narration becomes say clips, tool calls become action clips. Takes are saved to Assets.
 *
 * Walkthroughs are recorded automatically; agent activity is too (it stops after a quiet spell).
 *
 * Recording onto the transport (the Timeline's record button): the transport plays (round the loop, or
 * from In to Out) and each gesture drawn is added to the open take's drawing track where the playhead
 * was when it was drawn. Every pass plays what is there and adds to it (overdub). Stopping (the button,
 * Space, or the transport reaching Out) saves the take.
 */
import { markLive } from './liveTake.js';
import { createTake, diffDocs, readingTime, touch, clipId, duration, tracksOf, addTrack, laneOf } from '../process/take.js';
import { canvasBlob } from './ui.js';
import { renderToCanvas } from '../process/render.js';

const SETTINGS_KEY = 'ams_recorder_v1';
const clone = v => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

export class Recorder {
  constructor(app) {
    this.app = app;
    this.take = null;
    try { this.settings = { autoWalkthroughs: true, autoAgents: true, idleStop: 90000, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') }; } catch { this.settings = { autoWalkthroughs: true, autoAgents: true, idleStop: 90000 }; }
    app.store.subscribe((doc, reason) => this.onChange(reason));
    app.on('say', (text, meta) => this.onSay(text, meta));
    app.on('tool-call', (name, args, info) => this.onTool(name, args, info));
  }

  setSettings(patch) { Object.assign(this.settings, patch); try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(this.settings)); } catch { /* ignore */ } }

  get recording() { return Boolean(this.take); }
  /** Recording onto the transport (overdub). */
  get overdubbing() { return Boolean(this.od); }

  startOverdub() {
    if (this.take || this.od) return;
    const app = this.app, p = app.player;
    if (!p.take) p.load(markLive(app, createTake({ title: `Recording ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, baseline: clone(app.store.doc) }), Date.now(), { record: true, at: p.t }));   // (it carries the live History and Interactions tracks too)
    // Not looping, with In and Out marked: start at In (from outside them), stop at Out.
    const io = p.inOut;
    if (!p.loop && io && (p.t < io[0] || p.t >= io[1])) p.seek(io[0]);
    this.od = { last: clone(app.store.doc), added: 0 };
    p.recording = true;
    app.canvas.overdub = true;   // (the canvas takes strokes over the take it shows)
    this.offPlayer = p.on(() => { if (this.od && !p.playing) this.stopOverdub(); });
    app.emit('recording', true);
    app.log(`Recording onto the Timeline${p.loop ? ' (looping: each pass adds to the last)' : p.inOut ? ' (In to Out)' : ''}: draw; Space or the record button stops.`);
    if (!p.playing) p.play();
  }

  async stopOverdub() {
    const od = this.od; if (!od) return;
    this.od = null; this.offPlayer?.(); this.offPlayer = null;
    const app = this.app, p = app.player, take = p.take;
    p.recording = false; app.canvas.overdub = false;
    if (p.playing) p.pause();
    app.emit('recording', false);
    if (!take || !od.added) { app.log('Recording stopped (nothing drawn).'); return; }
    take.duration = duration(take);
    if (take.assetId) await app.assetStore.update(take.assetId, { program: JSON.parse(JSON.stringify(take)), title: take.title, meta: { clips: take.clips.length, duration: take.duration } });
    else await this.saveTake(take);
    app.log(`Recorded ${od.added} gesture${od.added === 1 ? '' : 's'} into “${take.title}” (saved in Assets; ⌘Z over the Timeline takes them back).`);
    app.emit('take', take);
  }

  /** A change while recording onto the transport: a clip on the take where the playhead is. */
  onOverdub(reason) {
    const app = this.app, p = app.player, doc = app.store.doc;
    const diff = diffDocs(this.od.last, doc);
    this.od.last = clone(doc);
    if (!diff || !p.take) return;
    const now = p.position(), wrap = p.wrapRange();
    const by = app.store.log?.[app.store.log.length - 1]?.by || 'user';
    const adds = diff.add || [];
    let start = now, dur = 300;
    if (adds.length === 1 && adds[0].points?.length > 1) {
      // A stroke ends now and lasts as long as it took to draw.
      const pts = adds[0].points, span = (pts[pts.length - 1][2] ?? 0) - (pts[0][2] ?? 0);
      dur = span > 0 && span < 60000 ? Math.max(200, span) : 900;
      start = now - dur;
    } else if (adds.length > 1) dur = Math.min(6000, Math.max(600, adds.length * 140));
    // Begun before the loop came round: it starts with the loop (drawn on a little faster).
    if (wrap && start < wrap[0]) { start = wrap[0]; dur = Math.max(200, now - wrap[0]); }
    // Polyphonic (the default): on the first Drawing track, overlapping what is there (shown as voices).
    // A track per pass: on the first Drawing track free at that time, else a new one.
    const take = p.take, s0 = Math.max(0, Math.round(start)), e0 = s0 + Math.round(dur);
    const draws = tracksOf(take).filter(t => t.kind === 'draw');
    const free = this.settings.overdubLanes === 'tracks' ? draws.find(tr => !take.clips.some(c => laneOf(c) === tr.id && c.start < e0 && c.start + c.dur > s0)) : draws[0];
    const lane = (free || addTrack(take, 'draw')).id;
    take.clips.push({ id: clipId(), track: 'draw', lane, start: s0, dur: Math.round(dur), diff, label: String(reason || 'change'), by, fx: {} });
    this.od.added++;
    if (app.timelineEdited) app.timelineEdited(); else p.changed();   // (the lanes, the canvas at the playhead, and a step of the Timeline's undo)
  }
  now() { return Math.round(performance.now() - this.t0); }

  start({ title = `Recording ${new Date().toLocaleString()}`, source = 'manual' } = {}) {
    if (this.take) return this.take;
    this.t0 = performance.now();
    this.last = clone(this.app.store.doc);
    this.take = createTake({ title, baseline: clone(this.app.store.doc) });
    this.take.source = source;
    this.app.log(`Recording: ${title}`);
    this.app.emit('recording', true);
    this.poke();
    return this.take;
  }

  /** Stop; the take is saved to Assets (unless nothing happened). Returns the take. */
  async stop({ save = true } = {}) {
    const take = this.take;
    if (!take) return null;
    clearTimeout(this.idleTimer);
    this.take = null;
    this.app.emit('recording', false);
    // Narration ends where the next begins (or after its reading time).
    const says = take.clips.filter(c => c.track === 'say');
    says.forEach((c, i) => { const next = says[i + 1]; if (next && next.start < c.start + c.dur) c.dur = Math.max(800, next.start - c.start); });
    touch(take);
    take.duration = Math.max(0, ...take.clips.map(c => c.start + c.dur));
    if (!take.clips.length) { this.app.log('Recording stopped (nothing happened).'); return null; }
    this.app.log(`Recording stopped: ${take.clips.length} clips, ${(take.duration / 1000).toFixed(1)} s.`);
    if (save) await this.saveTake(take);
    this.app.emit('take', take);
    return take;
  }

  async saveTake(take, { title = take.title } = {}) {
    const final = this.app.store.doc;
    const blob = canvasBlob(renderToCanvas(final, { scale: Math.min(1, 480 / Math.max(final.artboard.width, final.artboard.height)), mode: 'process' }));
    const a = await this.app.assetStore.add(blob, {
      title, kind: 'take', folder: 'Recordings', tags: ['take', take.source || 'manual'],
      program: JSON.parse(JSON.stringify(take)), meta: { clips: take.clips.length, duration: take.duration }
    });
    take.assetId = a.id;
    this.app.log(`Saved the take “${title}” to Assets (Recordings).`);
    return a;
  }

  /** Keep an agent recording alive while things happen; stop after a quiet spell. */
  poke() {
    clearTimeout(this.idleTimer);
    if (this.take?.source === 'agent') this.idleTimer = setTimeout(() => this.stop(), this.settings.idleStop);
  }

  push(clip) { const c = { id: clipId(), fx: {}, seq: this.take.clips.length, ...clip }; this.take.clips.push(c); touch(this.take); this.poke(); this.app.emit('recording-update', c); return c; }

  onChange(reason) {
    if (this.od) return this.onOverdub(reason);
    if (!this.take) return;
    const doc = this.app.store.doc;
    const diff = diffDocs(this.last, doc);
    this.last = clone(doc);
    if (!diff) return;
    const t = this.now();
    const by = this.app.store.log?.[this.app.store.log.length - 1]?.by || 'user';
    const adds = diff.add || [];
    let start = t, dur = 300;
    if (adds.length === 1 && adds[0].points?.length > 1) {
      // A single stroke keeps the time it took to draw.
      const pts = adds[0].points, span = (pts[pts.length - 1][2] ?? 0) - (pts[0][2] ?? 0);
      if (by !== 'agent' && span > 0 && span < 60000) { dur = Math.max(200, span); start = Math.max(0, t - dur); }
      else dur = 900;
    } else if (adds.length > 1) dur = Math.min(6000, Math.max(600, adds.length * 140));
    this.push({ track: 'draw', start, dur, diff, label: String(reason || 'change'), by });
  }

  onSay(text, meta) {
    if (!this.take || !text || this.app.sayAuto) return;
    this.push({ track: 'say', start: this.now(), dur: readingTime(text), text, meta });
  }

  onTool(name, args, { replay = false, summary = '', quiet = false } = {}) {
    // (quiet: the quick command field. An edit you asked for in passing is not an agent's run to keep: no take of its own.)
    if (!this.take && this.settings.autoAgents && !replay && !quiet && !/^ams_(record|timeline|wb_state|vocabulary|get|snapshot|candidates|pending|sessions|show|decision_pending|decision_labels|layout|score)$/.test(name)) {
      this.start({ title: `Agent run ${new Date().toLocaleString()}`, source: 'agent' });
    }
    if (!this.take) return;
    this.push({ track: 'action', start: this.now(), dur: 600, name, label: summary || name.replace(/^ams_/, '').replace(/_/g, ' '), args: brief(args) });
  }
}

/** Tool arguments, shortened for the timeline (long code and point lists summarized). */
function brief(args = {}) {
  const out = {};
  for (const [k, v] of Object.entries(args || {})) {
    if (typeof v === 'string') out[k] = v.length > 160 ? `${v.slice(0, 157)}…` : v;
    else if (Array.isArray(v)) out[k] = v.length > 8 ? `[${v.length} items]` : v;
    else out[k] = v;
  }
  return out;
}
