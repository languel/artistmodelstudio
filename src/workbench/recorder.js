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
 *
 * The live drawing follows the take while you record onto it (`frame`): at each frame it shows what the take shows at the
 * playhead. A gesture that works on marks already drawn (grab, push, smooth, a drag) is sampled while it lasts, a frame at a
 * time, so it plays back as motion; when it ends, the later frames of those marks (from earlier passes) are shifted by what
 * it moved, so each pass lays its moves over the last: a frame-by-frame morph. With `settings.advance` the playhead does
 * not run: it steps a frame at the start or end of an action, or when the board changes (stop motion).
 */
import { markLive } from './liveTake.js';
import { createTake, diffDocs, docAt, readingTime, touch, clipId, duration, tracksOf, addTrack, laneOf } from '../process/take.js';
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

  /** Which triggers step the playhead a frame (the clock does not run), or null when it plays with the clock. */
  stepping() { const a = this.settings.advance; return a && (a.start || a.end || a.board) ? a : null; }

  /** The state of a recording onto the take (what `frame`, `follow` and the gestures keep). */
  newOd(extra = {}) {
    const app = this.app, p = app.player;
    return { last: clone(app.store.doc), added: 0, fresh: false, saved: null, inst: new Map(), stEls: null, touched: new Set(), prevT: p.t, sampT: -Infinity, gesture: null, edit: 0, step: null, ...extra };
  }

  startOverdub() {
    if (this.take || this.od) return;
    const app = this.app, p = app.player, fresh = !p.take;
    if (fresh) p.load(markLive(app, createTake({ title: `Recording ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`, baseline: clone(app.store.doc) }), Date.now(), { record: true, at: p.t }));   // (it carries the live History and Interactions tracks too)
    // Not looping, with In and Out marked: start at In (from outside them), stop at Out.
    const io = p.inOut, adv = this.stepping();
    if (!p.loop && io && (p.t < io[0] || p.t >= io[1])) p.seek(io[0]);
    // (a take opened to look at is not the drawing: the drawing is put back when the recording stops)
    this.od = this.newOd({ fresh, saved: fresh ? null : clone(app.store.doc.elements), step: adv });
    p.recording = true;
    app.canvas.overdub = true;
    this.follow(p.t, true);
    if (adv) {
      p.pause();   // (the playhead moves when something happens, not with the clock)
      const od = this.od;
      od.poll = setInterval(() => this.stepPoll(), 16);
      od.onBoard = () => { if (adv.board) this.stepFrame(); };
      app.on('board', od.onBoard);
    } else this.offPlayer = p.on(() => { const od = this.od; if (!od) return; if (p.playing) od.held = false; else if (!od.held) this.stopOverdub(); });   // (a pause held with Alt+End keeps recording armed)
    app.emit('recording', true);
    const how = adv ? `stepping a frame ${[adv.end && 'at the end of an action', adv.start && 'at the start of an action', adv.board && 'when the board changes'].filter(Boolean).join(', ')}` : p.loop ? 'looping: each pass adds to the last' : p.inOut ? 'In to Out' : 'from the playhead';
    app.log(`Recording onto the Timeline (${how}): grab, push, smooth or draw; Space or the record button stops.`);
    p.render();
    if (!adv && !p.playing) p.play();
  }

  /** Alt+R: start recording onto the Timeline, or stop (and save). */
  toggleRecord() { if (this.take) return this.stop(); if (this.od) return this.stopOverdub(); return this.startOverdub(); }

  /** Alt+End: pause or resume the transport while recording stays on (stepping: a frame on). Not recording: play / pause. */
  togglePlay() {
    const od = this.od, p = this.app.player;
    if (!od) return p.toggle();
    if (od.step) return this.stepFrame();
    if (p.playing) { od.held = true; p.pause(); } else { od.held = false; p.play(); }
  }

  async stopOverdub() {
    const od = this.od; if (!od) return;
    const app = this.app, p = app.player, take = p.take;
    if (od.gesture) this.endGesture();
    this.od = null; this.offPlayer?.(); this.offPlayer = null;
    clearInterval(od.poll); if (od.onBoard) app.off('board', od.onBoard);
    p.recording = false; app.canvas.overdub = false;
    if (p.playing) p.pause();
    // The drawing: what it was before (a take opened to look at), or where the recording left it (a take begun here).
    if (take) { app.store.doc.elements = od.fresh ? clone(docAt(take, Infinity, { settled: true }).elements) : od.saved || app.store.doc.elements; app.store.derive?.(app.store.doc); }
    app.canvas.invalidate?.();
    app.emit('recording', false);
    p.render();
    if (!take || !od.added) { app.log('Recording stopped (nothing drawn).'); return; }
    take.duration = duration(take);
    if (take.assetId) await app.assetStore.update(take.assetId, { program: JSON.parse(JSON.stringify(take)), title: take.title, meta: { clips: take.clips.length, duration: take.duration } });
    else await this.saveTake(take);
    app.log(`Recorded ${od.added} gesture${od.added === 1 ? '' : 's'} into “${take.title}” (saved in Assets; ⌘Z over the Timeline takes them back).`);
    app.emit('take', take);
  }

  // ---- the live drawing, in step with the take ----------------------------------------------------------------------

  /** The take's document at t, with the marks drawn in this recording whole (they are not drawn on again). */
  stateAt(t) {
    const take = this.app.player.take, od = this.od;
    const doc = docAt(take, t);
    if (!od?.touched.size) return doc;
    const settled = docAt(take, t, { settled: true });
    if (settled === doc) return doc;
    const whole = new Map(settled.elements.map(e => [e.id, e]));
    return { ...doc, elements: doc.elements.map(e => (od.touched.has(e.id) ? whole.get(e.id) || e : e)) };
  }

  /** Every frame of the transport while recording: the drawing follows the take; a gesture in progress is sampled. */
  frame(t) {
    const od = this.od; if (!od) return;
    const down = Boolean(this.app.canvas.pointer), step = 1000 / (this.app.player.settings.fps || 25);
    if (t + 100 < od.prevT) { od.inst.clear(); od.stEls = null; od.sampT = t - step; if (od.gesture) od.gesture.t0 = t; else if (!down) this.follow(t, true); }   // (the loop came round)
    od.prevT = t;
    if (down) {
      if (od.step) return;
      if (!od.gesture) this.beginGesture(t);
      this.recordFrame(t);
    } else if (od.gesture) this.endGesture();
    else if (performance.now() - od.edit > 60) this.follow(t);
  }

  /** The drawing becomes the take's picture at t (marks it already holds are not copied again). */
  follow(t, force = false) {
    const od = this.od, app = this.app, doc = app.store.doc;
    const st = this.stateAt(t), els = st.elements, prev = od.stEls;
    if (!force && prev && prev.length === els.length && els.every((e, i) => e === prev[i])) return;
    od.stEls = els;
    doc.elements = els.map(src => { const c = od.inst.get(src.id); if (c && c.src === src) return c.el; const el = clone(src); od.inst.set(src.id, { src, el }); return el; });
    app.store.derive?.(doc);
    const rest = { ...doc }; delete rest.elements;
    od.last = { ...clone(rest), elements: els };   // (what the drawing was, for the next change to be measured against)
    app.canvas.invalidate?.();
  }

  beginGesture(t) {
    const od = this.od, step = 1000 / (this.app.player.settings.fps || 25);
    // (the marks as the drawing was set to show them, before the first move of the gesture: the frame that notices it may be a move late)
    od.gesture = { t0: t, lastT: t, start: new Map((od.stEls || this.app.store.doc.elements).filter(e => e.points).map(e => [e.id, e.points.map(q => q.slice())])) };
    od.sampT = t - step;
  }

  /** The marks that differ from the take at t, as a clip of their own a frame long (earlier frames of them in the span give way). */
  recordFrame(t, force = false) {
    const od = this.od, p = this.app.player, take = p.take, g = od.gesture;
    const step = 1000 / (p.settings.fps || 25);
    if (!force && t - od.sampT < step) return;
    const prev = od.sampT; od.sampT = t; if (g) g.lastT = t;
    const diff = diffDocs({ elements: this.stateAt(t).elements }, { elements: this.app.store.doc.elements });
    const upd = diff?.update; if (!upd?.length) return;
    const ids = new Set(upd.map(u => u.id));
    for (const c of take.clips) if (c.sample && c.start > prev && c.start <= t && c.diff?.update) c.diff.update = c.diff.update.filter(u => !ids.has(u.id));
    for (let i = take.clips.length - 1; i >= 0; i--) { const c = take.clips[i]; if (c.sample && !(c.diff?.update || []).length) take.clips.splice(i, 1); }
    const draws = tracksOf(take).filter(x => x.kind === 'draw'), lane = (draws[0] || addTrack(take, 'draw')).id;
    take.clips.push({ id: clipId(), track: 'draw', lane, start: Math.round(t), dur: Math.round(step), diff: { update: upd }, label: 'morph', by: 'user', sample: true, fx: { drawOn: false } });
    touch(take);
  }

  /** The gesture is over: its last state is recorded, and what it moved stays moved in the later frames of those marks. */
  endGesture() {
    const od = this.od, g = od?.gesture; if (!g) return;
    od.gesture = null;
    const app = this.app, p = app.player, take = p.take, doc = app.store.doc;
    const t = Math.max(p.position(), g.lastT + 1);
    this.recordFrame(t, true);
    const moved = new Map();
    for (const el of doc.elements) {
      const s = g.start.get(el.id); if (!s || !el.points || s.length !== el.points.length) continue;
      let any = false; const d = el.points.map((q, i) => { const dx = q[0] - s[i][0], dy = q[1] - s[i][1]; if (dx || dy) any = true; return [dx, dy]; });
      if (any) moved.set(el.id, d);
    }
    if (moved.size && t >= g.t0) {
      for (const c of take.clips) {
        if (c.track !== 'draw' || !c.diff?.update || c.start <= t) continue;
        c.diff.update = c.diff.update.map(u => { const d = moved.get(u.id); return d && u.points?.length === d.length ? { ...u, points: u.points.map((q, i) => [q[0] + d[i][0], q[1] + d[i][1], ...q.slice(2)]) } : u; });
      }
    }
    touch(take);
    od.added++; od.inst.clear(); od.stEls = null; od.edit = performance.now();
    od.last = clone(doc);
    if (app.timelineEdited) app.timelineEdited(); else p.changed();
  }

  // ---- stepping: the playhead moves when something happens ----------------------------------------------------------

  stepPoll() {
    const od = this.od, adv = od?.step; if (!od || !adv) return;
    const down = Boolean(this.app.canvas.pointer);
    if (down && !od.sdown) { od.sdown = true; if (adv.start) this.stepFrame(); }
    else if (!down && od.sdown) { od.sdown = false; if (adv.end) this.stepFrame(); }
  }

  /** The playhead a frame on (round the loop); the drawing carries on from where it is. */
  stepFrame() {
    const od = this.od; if (!od) return;
    const p = this.app.player, step = 1000 / (p.settings.fps || 25), w = p.wrapRange();
    let t = p.t + step;
    if (w && t >= w[1]) t = w[0];
    p.seek(t);
    this.follow(t, true);
  }

  /** A change while recording onto the transport: a clip on the take where the playhead is. */
  onOverdub(reason) {
    const app = this.app, p = app.player, doc = app.store.doc, od = this.od;
    const diff = diffDocs(od.last, doc);
    od.last = clone(doc);
    if (!diff || !p.take) { if (od.gesture) this.endGesture(); return; }
    // A gesture on marks that were already there (grab, push, smooth): sampled as it went; it ends here.
    if (od.gesture && Object.keys(diff).every(k => k === 'update')) { this.endGesture(); return; }
    od.gesture = null;
    od.edit = performance.now();
    for (const e of diff.add || []) od.touched.add(e.id);
    const now = p.position(), wrap = p.wrapRange();
    const by = app.store.log?.[app.store.log.length - 1]?.by || 'user';
    const adds = diff.add || [];
    let start = now, dur = 300;
    if (od.step) { start = p.t; dur = Math.round(1000 / (p.settings.fps || 25)); }
    else if (adds.length === 1 && adds[0].points?.length > 1) {
      // A stroke ends now and lasts as long as it took to draw.
      const pts = adds[0].points, span = (pts[pts.length - 1][2] ?? 0) - (pts[0][2] ?? 0);
      dur = span > 0 && span < 60000 ? Math.max(200, span) : 900;
      start = now - dur;
    } else if (adds.length > 1) dur = Math.min(6000, Math.max(600, adds.length * 140));
    // Begun before the loop came round: it starts with the loop (drawn on a little faster).
    if (!od.step && wrap && start < wrap[0]) { start = wrap[0]; dur = Math.max(200, now - wrap[0]); }
    // Polyphonic (the default): on the first Drawing track, overlapping what is there (shown as voices).
    // A track per pass: on the first Drawing track free at that time, else a new one.
    const take = p.take, s0 = Math.max(0, Math.round(start)), e0 = s0 + Math.round(dur);
    const draws = tracksOf(take).filter(t => t.kind === 'draw');
    const free = this.settings.overdubLanes === 'tracks' ? draws.find(tr => !take.clips.some(c => laneOf(c) === tr.id && c.start < e0 && c.start + c.dur > s0)) : draws[0];
    const lane = (free || addTrack(take, 'draw')).id;
    take.clips.push({ id: clipId(), track: 'draw', lane, start: s0, dur: Math.round(dur), diff, label: String(reason || 'change'), by, fx: od.step ? { drawOn: false } : {} });
    od.added++;
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
