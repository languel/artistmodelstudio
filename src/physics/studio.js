/**
 * Physics in the studio: each board with physics on has a world (in the worker, src/physics/host.js) built from
 * its marks, kept up to date as you draw, and a clock that says what time the world is at:
 *
 *   'transport'  the Timeline's playhead (play, pause, scrub, the loop region, In/Out: all of them)
 *   'free'       its own: play, pause, step a frame, reset (for when there is no transport)
 *
 * (board.physics.speed scales either.) While a world is past its start, its bodies are drawn where they are
 * (canvas.posed: the marks moved and turned, the drawing itself unchanged); at time 0 the drawing is as drawn.
 * Reset goes back to the start; Apply pose makes where things are now the drawing (one undo step).
 * Contacts of a mark that is also an event (play.trigger) fire it: its sound, with how hard and where.
 */
import { createPhysicsHost } from './host.js';
import { physicsScene, physicsOf, placeAt, jointKind } from './model.js';
import { boardById, MAIN } from '../process/boards.js';

export const STEP = 1 / 60;
const BLIP = 0.5;   // seconds a contact's blip lasts

export class PhysicsStudio {
  constructor(app) {
    this.app = app;
    this.boards = new Map();   // board id → { scene, key, moving, poses: Map id → { x, y, a }, n, t, clock }
    this.free = new Map();     // board id → { running, t } (the free clock)
    this.blips = [];
    this.listeners = new Set();
    this.host = createPhysicsHost({
      onFrame: (board, f) => this.frame(board, f),
      onLoaded: board => { const st = this.boards.get(board); if (st) { st.loaded = true; this.request(board, true); } },
      onError: m => app.log?.(`Physics: ${m}`, 'error')
    });
    this.raf = 0;
    const later = () => {
      if (!app.store || !app.player || !app.canvas) return setTimeout(later, 50);
      app.store.subscribe(() => this.queueSync());
      app.player.on(() => this.onTransport());
      // The canvas draws posed marks, and the contact blips and the debug view over them.
      app.canvas.posed = doc => this.posed(doc);
      const prev = app.canvas.onDrawn;
      app.canvas.onDrawn = () => { prev?.(); this.drawOver(); };
      this.sync();
    };
    later();
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const f of this.listeners) f(this); }

  // ---- the worlds -------------------------------------------------------------------------------
  queueSync() { if (this.syncTimer) return; this.syncTimer = setTimeout(() => { this.syncTimer = 0; this.sync(); }, 40); }

  /** Worlds for the boards with physics on, rebuilt when what they are made of changes. */
  sync() {
    const doc = this.app.store.doc;
    if (this.syncRev === this.app.store.rev && this.syncDoc === doc) return;
    this.syncRev = this.app.store.rev; this.syncDoc = doc;
    const scenes = physicsScene(doc), seen = new Set();
    for (const scene of scenes) {
      const id = scene.board.id; seen.add(id);
      this.follow(scene);
      const st = this.boards.get(id);
      if (st && st.key === scene.key) continue;
      const next = { scene, key: scene.key, moving: [], poses: new Map(), n: st?.n || 0, t: st?.t || 0, loaded: false };
      this.boards.set(id, next);
      this.host.load(id, scene);
    }
    for (const id of [...this.boards.keys()]) if (!seen.has(id)) { this.host.drop(id); this.boards.delete(id); this.app.canvas.invalidate(); }
    this.emit();
    this.loop();
  }

  /**
   * Travelers made physical follow their path as the score times them: the path (sampled, board pixels) and the
   * timing (start, dur, rate, loop) from the score's world, so the engine can place them at any step.
   */
  follow(scene) {
    const tbs = scene.bodies.filter(b => b.traveler);
    if (!tbs.length) return;
    const entry = this.app.score?.view?.().find(en => en.board.id === scene.board.id);
    for (const b of tbs) {
      const tr = entry?.world.travelers().find(x => x.id === b.id);
      if (!tr?.spec || !tr.atProgress) continue;
      const bx = entry.board.x || 0, by = entry.board.y || 0, pts = [];
      for (let i = 0; i <= 160; i++) { const q = tr.atProgress(i / 160); pts.push([bx + q.x, by + q.y]); }
      b.follow = { pts, spec: { start: tr.spec.start, dur: tr.spec.dur, rate: tr.spec.rate ?? 1, loop: tr.spec.loop || 'once' } };
    }
    scene.key = JSON.stringify({ ...scene, key: undefined });
  }

  /** What a score asks of a world (api.effect): { type: 'impulse', id, v: [x, y] } or { type: 'motor', id, speed }. */
  effect(f, boardId) {
    const doc = this.app.store.doc, el = doc.elements.find(e => e.id === f.id || e.label === f.id);
    const id = el?.id || f.id, board = el ? el.board || MAIN : boardId;
    if (!this.boards.has(board)) return false;
    if (f.type === 'impulse') this.host.impulse(board, id, f.v || [0, 0]);
    else if (f.type === 'motor') this.host.motor(board, id, f.speed, f.torque);
    this.request(board, true);
    return true;
  }

  /** The world's settings for a board (null: no physics). */
  settings(board = this.app.activeBoard || MAIN) { return physicsOf(boardById(this.app.store.doc, board)); }

  /** What time a board's world should be at (seconds of simulation). */
  timeOf(id) {
    const w = this.boards.get(id)?.scene.world;
    if (!w) return 0;
    const t = w.clock === 'free' ? this.freeClock(id).t : this.app.player.position() / 1000;
    return Math.max(0, t * (w.speed ?? 1));
  }

  freeClock(id) { if (!this.free.has(id)) this.free.set(id, { running: false, t: 0, at: 0 }); return this.free.get(id); }

  /** A world is running: its clock moves. */
  running(id) {
    const w = this.boards.get(id)?.scene.world;
    return Boolean(w && (w.clock === 'free' ? this.freeClock(id).running : this.app.player.playing));
  }

  request(id, force = false) {
    const st = this.boards.get(id);
    if (!st?.loaded) return;
    const t = this.timeOf(id);
    if (!force && Math.abs(t - st.asked) < STEP / 4) return;
    st.asked = t;
    this.host.to(id, t);
  }

  onTransport() { for (const [id, st] of this.boards) if (st.scene.world.clock !== 'free') this.request(id); this.loop(); this.emit(); }

  /** One loop while anything runs: advance the free clocks, ask the worlds for the time. */
  loop() {
    if (this.raf) return;
    const tick = now => {
      this.raf = 0;
      let any = false;
      for (const [id, st] of this.boards) {
        if (st.scene.world.clock === 'free') {
          const c = this.freeClock(id);
          if (c.running) { c.t += Math.min(0.1, (now - (c.at || now)) / 1000); c.at = now; any = true; }
        } else if (this.app.player.playing) any = true;
        this.request(id);
      }
      if (this.blips.length) this.app.canvas.invalidate();   // (the blips fade)
      if (any || this.blips.length) this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  frame(id, f) {
    const st = this.boards.get(id);
    if (!st || f.key !== st.key) return;   // (a world rebuilt since it was asked)
    st.n = f.n; st.t = f.t;
    const ids = st.scene.bodies.filter(b => b.type !== 'static').map(b => b.id);
    st.poses = new Map(ids.map((bid, i) => [bid, { x: f.poses[i * 3], y: f.poses[i * 3 + 1], a: f.poses[i * 3 + 2] }]));
    for (const e of f.events) this.contact(id, e);
    this.posedCache = null;
    this.app.canvas.invalidate();
    this.emit();
  }

  // ---- contacts: an event mark that is touched sounds; a blip where -----------------------------
  contact(board, e) {
    if (e.type !== 'collide') return;
    const st = this.boards.get(board), byId = new Map(st.scene.bodies.map(b => [b.id, b]));
    for (const [me, other] of [[e.a, e.b], [e.b, e.a]]) {
      if (!byId.get(me)?.trigger) continue;
      const b = st.scene.board;
      this.app.score?.physicsHit?.(me, { speed: e.speed, x: e.x - b.x, y: e.y - b.y, other, t: e.t });
      this.blips.push({ x: e.x, y: e.y, at: performance.now(), k: Math.min(1, e.speed / 600) });
    }
    if (this.blips.length > 60) this.blips.splice(0, this.blips.length - 60);
    this.loop();
  }

  // ---- controls ---------------------------------------------------------------------------------
  /** Play or pause a board's world (its free clock; with the transport, the transport). */
  toggle(id = this.app.activeBoard || MAIN) {
    const st = this.boards.get(id); if (!st) return;
    if (st.scene.world.clock === 'free') { const c = this.freeClock(id); c.running = !c.running; c.at = performance.now(); this.loop(); this.emit(); }
    else this.app.player.toggle();
  }
  /** One frame on (pausing first). */
  step(id = this.app.activeBoard || MAIN, frames = 1) {
    const st = this.boards.get(id); if (!st) return;
    if (st.scene.world.clock === 'free') { const c = this.freeClock(id); c.running = false; c.t += frames * STEP / (st.scene.world.speed || 1); this.request(id, true); this.emit(); }
    else { const p = this.app.player; p.pause(); p.seek(p.t + (frames * STEP * 1000) / (st.scene.world.speed || 1)); }
  }
  /** Back to the start: the drawing as drawn. */
  reset(id = this.app.activeBoard || MAIN) {
    const st = this.boards.get(id); if (!st) return;
    if (st.scene.world.clock === 'free') { const c = this.freeClock(id); c.running = false; c.t = 0; this.request(id, true); this.emit(); }
    else this.app.player.stop();
  }
  /** Where things are now becomes the drawing (one undo step), and the world starts again from there. */
  applyPose(id = this.app.activeBoard || MAIN) {
    const st = this.boards.get(id); if (!st || !st.n) return false;
    const moved = this.movedElements(st, this.app.store.doc.elements.filter(e => (e.board || MAIN) === id));
    if (!moved.size) return false;
    this.app.store.change('apply pose', d => { for (const e of d.elements) if (moved.has(e.id)) e.points = moved.get(e.id); });
    this.reset(id);
    return true;
  }
  /** Turn a board's physics on or off, or change its world ({ gravity, speed, clock, walls, … }). */
  setWorld(id, patch) {
    const b = boardById(this.app.store.doc, id); if (!b) return;
    if (patch === null) this.app.store.updateBoard(id, { physics: null });
    else this.app.store.updateBoard(id, { physics: { on: true, ...(b.physics || {}), ...patch } });
  }

  // ---- drawing ----------------------------------------------------------------------------------
  /** The marks of moving bodies (and the joints on them) where they are now: id → points. */
  movedElements(st, elements) {
    const out = new Map(), rest = new Map(st.scene.bodies.map(b => [b.id, b.c]));
    const at = (bid, x, y) => { const p = bid && st.poses.get(bid); return p ? placeAt(p, rest.get(bid), x, y) : [x, y]; };
    const travelers = new Set(st.scene.bodies.filter(b => b.traveler).map(b => b.id));   // (travelers are drawn by the score)
    for (const e of elements) {
      if (travelers.has(e.id)) continue;
      if (st.poses.has(e.id)) { out.set(e.id, e.points.map(q => [...at(e.id, q[0], q[1]), ...q.slice(2)])); continue; }
      const kind = jointKind(e), j = kind && st.scene.joints.find(x => x.id === e.id);
      if (!j) continue;
      if (kind === 'spring') {
        const pa = at(j.a, j.pa[0], j.pa[1]), pb = at(j.b, j.pb[0], j.pb[1]), n = e.points.length;
        out.set(e.id, e.points.map((q, i) => { const k = n > 1 ? i / (n - 1) : 0; return [pa[0] + (pb[0] - pa[0]) * k, pa[1] + (pb[1] - pa[1]) * k, ...q.slice(2)]; }));
      } else {
        const on = j.a && st.poses.has(j.a) ? j.a : j.b && st.poses.has(j.b) ? j.b : null;
        if (on) out.set(e.id, e.points.map(q => [...at(on, q[0], q[1]), ...q.slice(2)]));
      }
    }
    return out;
  }

  /** The drawing with the moving marks where they are (null: nothing has moved, draw it as it is). */
  posed(doc) {
    if (doc !== this.app.store.doc || !this.boards.size) return null;
    const live = [...this.boards.values()].filter(st => st.n > 0 && st.poses.size);
    if (!live.length) return null;
    if (this.posedCache?.doc === doc) return this.posedCache.out;
    const moved = new Map();
    for (const st of live) for (const [k, v] of this.movedElements(st, doc.elements.filter(e => (e.board || MAIN) === st.scene.board.id))) moved.set(k, v);
    const out = { ...doc, elements: doc.elements.map(e => (moved.has(e.id) ? { ...e, points: moved.get(e.id) } : e)) };
    this.posedCache = { doc, out };
    return out;
  }

  /** Over the canvas: contact blips, and (debug) the colliders and joints. */
  drawOver() {
    const cv = this.app.canvas, ctx = cv.ctx;
    if (!ctx || (!this.blips.length && !this.debug)) return;
    const now = performance.now();
    this.blips = this.blips.filter(b => now - b.at < BLIP * 1000);
    const accent = this.app.scoreView?.color || getComputedStyle(document.documentElement).getPropertyValue('--wb-accent-2').trim() || '#c8664f';
    ctx.save();
    ctx.setTransform(cv.dpr, 0, 0, cv.dpr, 0, 0);
    for (const b of this.blips) {
      const k = (now - b.at) / (BLIP * 1000), [x, y] = cv.toScreen(b.x, b.y), r = 5 + 4 * b.k;
      ctx.globalAlpha = 0.9 * (1 - k); ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x, y, r * (1 - 0.5 * k), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.7 * (1 - k); ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r * (1.3 + 2.5 * k), 0, Math.PI * 2); ctx.stroke();
    }
    if (this.debug) this.drawDebug(ctx, cv, accent);
    ctx.restore();
    if (this.blips.length) this.loop();
  }

  drawDebug(ctx, cv, accent) {
    const z = cv.cam.z;
    ctx.globalAlpha = 0.8; ctx.lineWidth = 1;
    for (const st of this.boards.values()) {
      for (const b of st.scene.bodies) {
        const p = st.poses.get(b.id) || { x: b.c[0], y: b.c[1], a: 0 };
        const P = (lx, ly) => cv.toScreen(...placeAt(p, [0, 0], lx, ly));
        ctx.strokeStyle = b.type === 'static' ? '#8a8a8a' : b.sensor ? '#5aa0c8' : accent;
        for (const s of b.shapes) {
          ctx.beginPath();
          if (s.kind === 'ball') { const [x, y] = P(s.at[0], s.at[1]); ctx.arc(x, y, s.r * z, 0, Math.PI * 2); }
          else if (s.kind === 'capsule') { const [ax, ay] = P(...s.a), [bx, by] = P(...s.b); ctx.lineWidth = Math.max(1, s.r * 2 * z); ctx.globalAlpha = 0.25; ctx.lineCap = 'round'; ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.globalAlpha = 0.8; ctx.lineWidth = 1; continue; }
          else s.pts.forEach((q, i) => { const [x, y] = P(q[0], q[1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
          ctx.closePath(); ctx.stroke();
        }
      }
      ctx.fillStyle = '#e8b04a';
      for (const j of st.scene.joints) {
        const on = j.a && st.poses.has(j.a) ? j.a : j.b && st.poses.has(j.b) ? j.b : null;
        const body = on && st.scene.bodies.find(b => b.id === on);
        const pt = j.anchor ? (body ? placeAt(st.poses.get(on), body.c, ...j.anchor) : j.anchor) : null;
        if (pt) { const [x, y] = cv.toScreen(pt[0], pt[1]); ctx.fillRect(x - 3, y - 3, 6, 6); }
      }
    }
  }

  /** Board ids that have physics (they are live boards). */
  has(id) { return this.boards.has(id); }
}
