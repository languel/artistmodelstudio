/**
 * What a score does, drawn over the canvas: each traveler where it is at the playhead (with a short
 * tail), and the triggers it touches lighting up as the sound is due. It reads the playhead and the
 * same worlds the sound uses (ScorePlayer.view), so what is seen and what is heard are one thing.
 * Redrawn every frame while the transport runs, and when it moves or the drawing changes.
 */
const FLASH = 0.4;   // seconds a trigger stays lit

export class ScoreOverlay {
  constructor(app) {
    this.app = app;
    this.cv = null;
    app.player.on(() => this.poke());
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
    const notes = app.scoreView?.names || app.canvas.pick || (app.canvas.selected?.size && app.store.doc.elements.some(e => e.play?.travel));
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
      // Triggers that were just touched.
      for (const trig of world.triggers()) {
        const age = pos - Math.max(...score.flashes.filter(f => f.board === board.id && f.trigger === trig.id && f.t <= pos).map(f => f.t), -Infinity);
        if (!(age >= 0 && age < FLASH)) continue;
        const a = 1 - age / FLASH;
        ctx.globalAlpha = 0.5 * a; ctx.fillStyle = accent; ctx.strokeStyle = accent; ctx.lineWidth = 2;
        const d = trig.regionDef;
        ctx.beginPath();
        if (d.kind === 'circle') { const [x, y] = at(d.x, d.y); ctx.arc(x, y, d.r * cvw.cam.z, 0, Math.PI * 2); ctx.fill(); }
        else if (d.kind === 'polygon') { d.pts.forEach(([x, y], i) => { const [sx, sy] = at(x, y); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }); ctx.closePath(); ctx.fill(); }
        else if (d.kind === 'line') { d.pts.forEach(([x, y], i) => { const [sx, sy] = at(x, y); if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy); }); ctx.stroke(); }
        moving = true;
      }
      // Travelers: a dot, and a short tail behind it.
      ctx.globalAlpha = 1;
      const now = world.positions(pos).filter(q => p.playing || !q.r), before = new Map(world.positions(Math.max(0, pos - 0.15)).map(q => [q.id, q]));
      for (const q of now) {
        const [x, y] = at(q.x, q.y);
        const b = before.get(q.id);
        if (b && p.playing && !q.r) { const [bx, by] = at(b.x, b.y); ctx.strokeStyle = accent; ctx.globalAlpha = 0.45; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(x, y); ctx.stroke(); }
        const rad = q.r ? Math.max(2.5, q.r * cvw.cam.z) : 5;   // (a body is as big as it is; a traveler is a dot)
        ctx.globalAlpha = q.r ? 0.85 : 1; ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    if (moving) this.poke();
  }
}
