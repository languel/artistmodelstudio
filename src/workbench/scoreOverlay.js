/**
 * What a score does, drawn over the canvas: each traveler where it is at the playhead (with a short
 * tail), and the triggers it touches lighting up as the sound is due. It reads the playhead and the
 * same worlds the sound uses (ScorePlayer.view), so what is seen and what is heard are one thing.
 * Redrawn every frame while the transport runs, and when it moves or the drawing changes.
 */
import { centerOf } from '../score/geometry.js';
import { laserOutline, fillLaserOutline } from './laser.js';
import { formatDuration } from '../time/sceneTransport.js';

const FLASH = 0.55;   // seconds a trigger's blip lasts

export class ScoreOverlay {
  constructor(app) {
    this.app = app;
    this.cv = null;
    app.player.on(() => { const live = Boolean(app.player.playing && app.score && app.canvas); if (live !== Boolean(app.canvas.travelersLive)) { app.canvas.travelersLive = live; app.canvas.invalidate(); } this.poke(); });
    app.store.subscribe(() => this.poke());
    // Drawn with the canvas, so it follows every pan and zoom.
    const prev = app.canvas.onDrawn;
    app.canvas.onDrawn = () => { prev?.(); this.draw(); };
  }

  poke() {
    if (this.raf || this.dead) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
    // (animation frames stop where the page is hidden; there is nothing to see then)
  }

  canvas() {
    const cvw = this.app.canvas;
    if (!this.cv) {
      this.cv = document.createElement('canvas');
      this.cv.className = 'wb-score-overlay';
      Object.assign(this.cv.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none', zIndex: '55' });
      cvw.host.appendChild(this.cv);
    }
    const W = cvw.canvas.width, H = cvw.canvas.height;
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    this.cv.style.width = cvw.canvas.style.width; this.cv.style.height = cvw.canvas.style.height;
    return this.cv;
  }

  /** Names, the links between travelers and their paths, and the mark an eyedropper is over. */
  annotate(ctx, cvw, doc, accent) {
    const app = this.app, names = Boolean(app.scoreView?.names), sel = cvw.selected || new Set();
    const byId = new Map(doc.elements.map(e => [e.id, e]));
    const find = ref => byId.get(ref) || doc.elements.find(x => x.label === ref) || null;
    const anchor = e => {
      if (e.role === 'plane' && e.points.length > 2) return [e.points.reduce((a, q) => a + q[0], 0) / e.points.length, e.points.reduce((a, q) => a + q[1], 0) / e.points.length];
      return e.points[0];
    };
    ctx.save();
    ctx.font = '11px Inter, system-ui, sans-serif'; ctx.textBaseline = 'middle';
    for (const e of doc.elements) {
      if (e.hidden || !e.points?.length) continue;
      const travel = e.play?.travel;
      if (travel && (names || sel.has(e.id))) {
        const path = find(travel.on);
        const [x, y] = cvw.toScreen(e.points[0][0], e.points[0][1]);
        if (!path) { ctx.fillStyle = '#c0563f'; ctx.textAlign = 'center'; ctx.fillText('?', x + 12, y - 12); }
        else if (names || sel.has(path.id)) {
          const [px, py] = cvw.toScreen(path.points[0][0], path.points[0][1]);
          if (Math.hypot(px - x, py - y) > 6) { ctx.strokeStyle = accent; ctx.globalAlpha = 0.6; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(px, py); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1; }
        }
      }
      if (names && (e.play || e.label)) {
        const [ax, ay] = anchor(e), [x, y] = cvw.toScreen(ax, ay);
        const text = e.label || e.id, w = ctx.measureText(text).width + 10;
        ctx.globalAlpha = 0.78; ctx.fillStyle = '#17181b';
        ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(x + 8, y - 20, w, 16, 8) : ctx.rect(x + 8, y - 20, w, 16)); ctx.fill();
        ctx.globalAlpha = e.label ? 1 : 0.65; ctx.fillStyle = '#f3efe6'; ctx.textAlign = 'left'; ctx.fillText(text, x + 13, y - 12);
        ctx.globalAlpha = 1;
      }
    }
    // Routes (a trigger sends to another) and cues (a trigger starts a traveler): arrows between them.
    const showLinks = names || app.tool === 'play';
    const arrow = (a, b, dashed) => {
      const [x0, y0] = cvw.toScreen(a[0], a[1]), [x1, y1] = cvw.toScreen(b[0], b[1]);
      const ang = Math.atan2(y1 - y0, x1 - x0), mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      ctx.strokeStyle = accent; ctx.fillStyle = accent; ctx.globalAlpha = 0.7; ctx.lineWidth = 1.4;
      ctx.setLineDash(dashed ? [3, 3] : []); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(mx + Math.cos(ang) * 6, my + Math.sin(ang) * 6); ctx.lineTo(mx - Math.cos(ang) * 5 + Math.sin(ang) * 4, my - Math.sin(ang) * 5 - Math.cos(ang) * 4); ctx.lineTo(mx - Math.cos(ang) * 5 - Math.sin(ang) * 4, my - Math.sin(ang) * 5 + Math.cos(ang) * 4); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    };
    for (const e of doc.elements) {
      if (e.hidden || !e.points?.length) continue;
      const tg = e.play?.trigger;
      if (tg?.to && (showLinks || sel.has(e.id))) for (const r of [].concat(tg.to)) { const t = find(typeof r === 'string' ? r : r.to); if (t?.points?.length) arrow(centerOf(e), centerOf(t), false); }
      for (const ref of [].concat(e.play?.node?.inputs || [])) if (showLinks || sel.has(e.id)) { const t = find(ref); if (t?.points?.length) arrow(centerOf(t), centerOf(e), true); }
      const cue = e.play?.travel?.cue;
      if (cue && (showLinks || sel.has(e.id))) { const t = find(cue); if (t?.points?.length) arrow(centerOf(t), centerOf(e), true); }
    }
    // The Play tool's gesture in progress: the band between two marks (and what it would make), a bar, a throw; a snap.
    const pt = app.canvas.playTool, dr = pt?.drag;
    if (dr) {
      const [x0, y0] = cvw.toScreen(dr.x0, dr.y0), [x1, y1] = cvw.toScreen(dr.x1, dr.y1);
      ctx.strokeStyle = accent; ctx.fillStyle = accent; ctx.lineCap = 'round';
      ctx.globalAlpha = 0.85; ctx.lineWidth = dr.kind === 'bar' ? 3 : 1.6; ctx.setLineDash(dr.kind === 'band' ? [4, 3] : []);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]);
      if (dr.kind === 'throw') { const a = Math.atan2(y1 - y0, x1 - x0); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - Math.cos(a) * 9 + Math.sin(a) * 5, y1 - Math.sin(a) * 9 - Math.cos(a) * 5); ctx.lineTo(x1 - Math.cos(a) * 9 - Math.sin(a) * 5, y1 - Math.sin(a) * 9 + Math.cos(a) * 5); ctx.closePath(); ctx.fill(); }
      const label = dr.kind === 'band' ? (dr.rel?.label || (dr.target ? 'nothing to make here' : '')) : dr.kind === 'bar' ? 'a bar across a path' : 'throw';
      if (label) {
        const w = ctx.measureText(label).width + 12;
        ctx.globalAlpha = 0.85; ctx.fillStyle = '#17181b'; ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(x1 + 10, y1 - 22, w, 17, 8) : ctx.rect(x1 + 10, y1 - 22, w, 17)); ctx.fill();
        ctx.globalAlpha = 1; ctx.fillStyle = dr.rel || dr.kind !== 'band' ? '#f3efe6' : '#c9a5a0'; ctx.textAlign = 'left'; ctx.fillText(label, x1 + 16, y1 - 13);
      }
      ctx.globalAlpha = 1;
    }
    if (pt?.snap) {
      const [sx, sy] = cvw.toScreen(pt.snap.x, pt.snap.y);
      ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(sx, sy, 8, 0, Math.PI * 2); ctx.stroke();
    }
    // How long each path takes (at its end), for marks shown by name or selected.
    if (names || sel.size) {
      const st = app.player.settings;
      for (const { paths } of app.score.view()) for (const pi of paths || []) {
        if (!names && !sel.has(pi.id)) continue;
        const m = byId.get(pi.id);
        if (!m?.points?.length) continue;
        const end = m.points.at(-1), [x, y] = cvw.toScreen(end[0], end[1]);
        const text = formatDuration(pi.seconds, st);
        const w = ctx.measureText(text).width + 8;
        ctx.globalAlpha = 0.7; ctx.fillStyle = '#17181b'; ctx.beginPath(); (ctx.roundRect ? ctx.roundRect(x - w / 2, y + 7, w, 15, 7) : ctx.rect(x - w / 2, y + 7, w, 15)); ctx.fill();
        ctx.globalAlpha = 0.9; ctx.fillStyle = '#f3efe6'; ctx.textAlign = 'center'; ctx.fillText(text, x, y + 15); ctx.globalAlpha = 1;
      }
    }
    const hov = cvw.pickHover && byId.get(cvw.pickHover);
    if (hov) {
      ctx.strokeStyle = accent; ctx.lineWidth = 3; ctx.globalAlpha = 0.85; ctx.lineJoin = 'round'; ctx.beginPath();
      if (hov.points.length === 1) { const [x, y] = cvw.toScreen(hov.points[0][0], hov.points[0][1]); ctx.arc(x, y, 14, 0, Math.PI * 2); }
      else hov.points.forEach(([px, py], i) => { const [x, y] = cvw.toScreen(px, py); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    }
    ctx.restore();
  }

  draw() {
    const app = this.app, p = app.player, score = app.score;
    const entries = score.view();
    const notes = app.scoreView?.names || app.canvas.pick || app.tool === 'play' || (app.canvas.selected?.size && app.store.doc.elements.some(e => e.play?.travel || e.play?.trigger?.to));
    if (!entries.length && !notes) { if (this.cv) { this.cv.getContext('2d').clearRect(0, 0, this.cv.width, this.cv.height); } this.lit = false; return; }
    const cvw = app.canvas, cv = this.canvas(), ctx = cv.getContext('2d');
    const pos = p.position() / 1000;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(cvw.dpr, 0, 0, cvw.dpr, 0, 0);
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--wb-accent-2').trim() || '#c8664f';
    score.flashes = score.flashes.filter(f => pos - f.t < FLASH + 0.5 && f.t - pos < 5);
    let moving = p.playing;
    this.annotate(ctx, cvw, score.doc(), accent);

    for (const { board, world } of entries) {
      const at = (x, y) => cvw.toScreen(board.x + x, board.y + y);
      // Triggers that were just touched: a blip with an envelope (quick attack, exponential decay), a ring that opens as it fades.
      const lastHit = new Map();   // trigger → the latest time it went off, up to now (one pass over the flashes, not one per trigger)
      for (const f of score.flashes) if (f.board === board.id && f.t <= pos && !(lastHit.get(f.trigger) >= f.t)) lastHit.set(f.trigger, f.t);
      for (const trig of world.triggers()) {
        const age = pos - (lastHit.get(trig.id) ?? -Infinity);
        if (!(age >= 0 && age < FLASH)) continue;
        const k = age / FLASH, env = Math.min(1, age / 0.025) * Math.exp(-4 * k);   // 0..1
        ctx.fillStyle = accent; ctx.strokeStyle = accent; ctx.lineJoin = 'round';
        const d = trig.regionDef, z = cvw.cam.z;
        const path = () => { ctx.beginPath(); d.pts.forEach(([x, y], i) => { const [sx, sy] = at(x, y); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }); };
        // The object itself swells and settles with the envelope (about its centre).
        const swell = 1 + 0.3 * env, c0 = d.kind === 'circle' ? at(d.x, d.y) : at(d.pts.reduce((m, q) => m + q[0], 0) / d.pts.length, d.pts.reduce((m, q) => m + q[1], 0) / d.pts.length);
        ctx.save(); ctx.translate(c0[0], c0[1]); ctx.scale(swell, swell); ctx.translate(-c0[0], -c0[1]);
        if (d.kind === 'circle') {
          const [x, y] = at(d.x, d.y), r = d.r * z;
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
          g.addColorStop(0, accent); g.addColorStop(0.55, accent); g.addColorStop(1, 'transparent');
          ctx.globalAlpha = 0.55 * env; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 1.8, 0, Math.PI * 2); ctx.fill();
          ctx.globalAlpha = 0.8 * (1 - k); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, r * (1 + 1.2 * k), 0, Math.PI * 2); ctx.stroke();
        } else if (d.kind === 'polygon') {
          path(); ctx.closePath(); ctx.globalAlpha = 0.5 * env; ctx.fill();
          ctx.globalAlpha = 0.7 * env; ctx.lineWidth = 2; ctx.stroke();
        } else if (d.kind === 'line') {
          path(); ctx.globalAlpha = 0.25 * env; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.stroke();
          path(); ctx.globalAlpha = 0.9 * env; ctx.lineWidth = 2.5; ctx.stroke();
        }
        ctx.restore();
        moving = true;
      }
      // Nodes: lit (a glow, and a clock hand going round while it sounds), a switch or LED that is on, a counter's count, a gate's last word.
      for (const trig of world.triggers()) {
        const m = trig.meta;
        if (!m?.node || trig.regionDef.kind !== 'circle') continue;
        const st = trig.state || {}, d = trig.regionDef, [x, y] = at(d.x, d.y), r = Math.max(5, d.r * cvw.cam.z);
        const lit = (st.litFrom ?? Infinity) <= pos && pos < (st.litUntil ?? -Infinity);
        const on = (m.node === 'switch' || (m.node === 'led' && m.hold === 'toggle')) && Boolean(st.on ?? m.on);
        if (lit || on) {
          const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.4);
          g.addColorStop(0, accent); g.addColorStop(1, 'transparent');
          ctx.globalAlpha = on && !lit ? 0.3 : 0.55; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r * 2.4, 0, Math.PI * 2); ctx.fill();
          if (lit && st.litUntil > st.litFrom) {
            const k = (pos - st.litFrom) / (st.litUntil - st.litFrom);
            ctx.globalAlpha = 0.7; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r * 0.8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.closePath(); ctx.fill();
          }
          moving = moving || lit;
        }
        if (m.node === 'counter' && st.hits) { ctx.globalAlpha = 0.9; ctx.fillStyle = accent; ctx.font = '10px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`${st.n || 0}/${m.count}`, x, y + r + 11); }
        if (m.node === 'gate' && st.at !== undefined && pos - st.at < 1) { ctx.globalAlpha = 0.9 * (1 - (pos - st.at)); ctx.strokeStyle = st.open ? accent : '#8a8a8a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r * 1.5, 0, Math.PI * 2); ctx.stroke(); moving = true; }
        ctx.globalAlpha = 1;
      }
      // Travelers: a soft glow, a trail that thins and fades, and a bar as a line that fades at its ends.
      ctx.globalAlpha = 1;
      const now = world.positions(pos).filter(q => p.playing || !q.r), widths = new Map(world.travelers().filter(t => t.width > 0).map(t => [t.id, t.width]));
      const TRAIL = 0.6, steps = now.length > 40 ? 3 : 7;   // (seconds of trail; fewer looks when there are many)
      const past = [];
      if (p.playing) for (let i = 1; i <= steps; i++) past.push(new Map(world.positions(Math.max(0, pos - (TRAIL * i) / steps)).map(q => [q.id, q])));
      for (const q of now) {
        const [x, y] = at(q.x, q.y);
        const bw = widths.get(q.id);
        if (p.playing && !q.r) {   // the trail: the laser pointer's ribbon, one filled shape that tapers to nothing
          const pts = [];
          for (let i = past.length - 1; i >= 0; i--) {   // oldest first
            const b = past[i].get(q.id);
            if (!b || (b.u !== undefined && q.u !== undefined && Math.abs(b.u - q.u) > 0.5)) { pts.length = 0; continue; }   // (a wrap is a jump: the trail starts again after it)
            const [bx, by] = at(b.x, b.y);
            pts.push({ x: bx, y: by, t: (pos - (TRAIL * (i + 1)) / steps) * 1000 });
          }
          if (pts.length) { ctx.globalAlpha = 0.55; fillLaserOutline(ctx, laserOutline(pts, pos * 1000, TRAIL * 1000, { head: { x, y } }), accent); }
        }
        if (bw && q.tx !== undefined) {   // a bar across its path: a fine line, strongest in the middle
          const half = (bw / 2) * cvw.cam.z, ax = x + q.ty * half, ay = y - q.tx * half, bx = x - q.ty * half, by = y + q.tx * half;
          const g = ctx.createLinearGradient(ax, ay, bx, by);
          g.addColorStop(0, 'transparent'); g.addColorStop(0.5, accent); g.addColorStop(1, 'transparent');
          ctx.strokeStyle = g; ctx.lineCap = 'round';
          ctx.globalAlpha = 0.25; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
          ctx.globalAlpha = 0.95; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.globalAlpha = 1;
        }
        const rad = q.r ? Math.max(2.5, q.r * cvw.cam.z) : 4.5;   // (a body is as big as it is; a traveler is a small dot)
        if (!q.r) {   // glow
          const gr = rad * 3.2, g = ctx.createRadialGradient(x, y, 0, x, y, gr);
          g.addColorStop(0, accent); g.addColorStop(1, 'transparent');
          ctx.globalAlpha = 0.4; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, gr, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = q.r ? 0.85 : 1; ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (moving) this.poke();
  }
}
