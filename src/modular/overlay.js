/**
 * The modular synth, live, drawn over the canvas (its own layer, like the score's): each sequencer's playhead (the
 * Euclid's step on every ring, the Grid's and Drums' column, the Bits' cell, the Steps' note), an instrument's title
 * lighting as it plays, the Scope's trace, the Output's and Mixer's meters, the sound itself riding along audio cables,
 * and modulation cables breathing with their LFO. Redrawn every frame while the sound is on and there are modules.
 */
import { settingsOf } from '../audio/modular/patch.js';
import { isModule, isCable, boxOf, HEADER, GROUP_COLORS, groupOf, CABLE_COLORS, cableType } from './model.js';
import { faceArea, seqLayout } from './face.js';

/** Points along a cable as the brush draws it (quadratic through the midpoints), n of them. */
export function cableCurve(pts, n = 48) {
  if (pts.length < 3) return Array.from({ length: n }, (_, i) => { const u = i / (n - 1); return [pts[0][0] + (pts[1][0] - pts[0][0]) * u, pts[0][1] + (pts[1][1] - pts[0][1]) * u]; });
  const segs = [];
  let p0 = pts[0];
  for (let i = 1; i < pts.length - 1; i++) {
    const last = i === pts.length - 2, c = pts[i], p1 = last ? pts[i + 1] : [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2];
    segs.push([p0, c, p1]); p0 = p1;
  }
  const out = [];
  for (let k = 0; k < n; k++) {
    const t = (k / (n - 1)) * segs.length, j = Math.min(segs.length - 1, Math.floor(t)), u = t - j, [a, c, b] = segs[j];
    out.push([(1 - u) ** 2 * a[0] + 2 * (1 - u) * u * c[0] + u * u * b[0], (1 - u) ** 2 * a[1] + 2 * (1 - u) * u * c[1] + u * u * b[1]]);
  }
  return out;
}

export class ModularOverlay {
  constructor(app) {
    this.app = app;
    this.cv = null;
    const prev = app.canvas.onDrawn;
    app.canvas.onDrawn = () => { prev?.(); this.draw(); };
    app.store.subscribe(() => this.poke());
    app.player.on(() => this.poke());
    const wait = () => { if (!app.patch) return setTimeout(wait, 50); app.patch.on(() => this.poke()); };
    wait();
  }

  poke() {
    if (this.raf) return;
    this.raf = requestAnimationFrame(() => { this.raf = 0; this.draw(); });
  }

  canvas() {
    const cvw = this.app.canvas;
    if (!this.cv) {
      this.cv = document.createElement('canvas');
      this.cv.className = 'wb-modular-overlay';
      Object.assign(this.cv.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none', zIndex: '54' });
      cvw.host.appendChild(this.cv);
    }
    const W = cvw.canvas.width, H = cvw.canvas.height;
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    this.cv.style.width = cvw.canvas.style.width; this.cv.style.height = cvw.canvas.style.height;
    return this.cv;
  }

  draw() {
    const app = this.app, cvw = app.canvas, pp = app.patch, doc = cvw.previewDoc || app.store.doc;
    const mods = (doc.elements || []).filter(e => isModule(e) && !e.hidden);
    const cv = this.canvas(), ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    if (!mods.length || !pp?.engine || !pp.running) return;
    const dpr = cvw.dpr || 1, z = cvw.cam.z;
    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * cvw.cam.x, dpr * cvw.cam.y);
    const playing = app.player.playing, now = performance.now();
    const [vx0, vy0, vx1, vy1] = cvw.viewRect(60);
    const onScreen = b => b.x1 > vx0 && b.x0 < vx1 && b.y1 > vy0 && b.y0 < vy1;

    // cables: the sound along them, modulation breathing
    for (const e of doc.elements) {
      if (!isCable(e) || e.hidden || e.points.length < 2) continue;
      const type = cableType(e.play.cable.slot), w = pp.waveform(e.play.cable.from);
      if (!w || type === 'notes') continue;
      const pts = cableCurve(e.points, 64);
      let peak = 0; for (let i = 0; i < w.length; i += 4) peak = Math.max(peak, Math.abs(w[i]));
      if (peak < 0.002) continue;
      if (type === 'mod') {
        ctx.globalAlpha = 0.25 + 0.6 * Math.min(1, Math.abs(w[0]));
        ctx.strokeStyle = CABLE_COLORS.mod; ctx.lineWidth = 5; ctx.lineCap = 'round';
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
        continue;
      }
      ctx.globalAlpha = 0.9; ctx.strokeStyle = '#d8fff8'; ctx.lineWidth = 1.1; ctx.lineJoin = 'round';
      ctx.beginPath();
      const amp = 9 / Math.max(0.15, peak) * Math.min(1, peak * 4);
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i], [nx, ny] = pts[Math.min(pts.length - 1, i + 1)], [px, py] = pts[Math.max(0, i - 1)];
        const dx = nx - px, dy = ny - py, L = Math.hypot(dx, dy) || 1, v = w[Math.floor((i / pts.length) * w.length)] * amp;
        const qx = x - (dy / L) * v, qy = y + (dx / L) * v;
        if (i) ctx.lineTo(qx, qy); else ctx.moveTo(qx, qy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    for (const e of mods) {
      const b = boxOf(e);
      if (!onScreen(b)) continue;
      const kind = e.play.mod.kind, s = settingsOf(e.play.mod), a = faceArea(e), accent = GROUP_COLORS[groupOf(kind)];
      // an instrument lights as it plays
      const lit = pp.lit?.get(e.id);
      if (lit && now >= lit && now - lit < 180) {
        ctx.globalAlpha = 0.55 * (1 - (now - lit) / 180); ctx.fillStyle = '#fff';
        ctx.fillRect(b.x0, b.y0, b.w, HEADER); ctx.globalAlpha = 1;
      }
      // playheads
      const step = playing ? pp.stepNow(e.id) : null;
      if (step !== null && step !== undefined) {
        const L = seqLayout(e);
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.strokeStyle = '#fff';
        if (L?.kind === 'rings') for (const r of L.rings) {
          const n = r.pattern.length, j = step % n, ang = -Math.PI / 2 + (2 * Math.PI * j) / n;
          const x = L.cx + r.r * Math.cos(ang), y = L.cy + r.r * Math.sin(ang);
          ctx.beginPath(); ctx.arc(x, y, r.pattern[j] ? 4.4 : 2.4, 0, Math.PI * 2);
          if (r.pattern[j]) { ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(x, y, 8, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.fill(); ctx.globalAlpha = 1; }
          else { ctx.lineWidth = 1; ctx.stroke(); }
          if (r === L.rings[0]) { ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(L.cx, L.cy); ctx.lineTo(x, y); ctx.stroke(); ctx.globalAlpha = 1; }
        }
        else if (L?.kind === 'cells') {
          const c = step % L.cols;
          ctx.globalAlpha = 0.22; ctx.fillStyle = '#fff'; ctx.fillRect(L.x0 + c * L.cw, L.y0, L.cw, L.ch * L.rows.length); ctx.globalAlpha = 1;
          L.rows.forEach((r, i) => { if (r[c]) { ctx.fillStyle = '#fff'; ctx.fillRect(L.x0 + c * L.cw + 0.5, L.y0 + i * L.ch + 0.5, L.cw - 1, L.ch - 1); } });
        } else if (L?.kind === 'bits') {
          const W = L.cols, k = step % (L.rows.length * W), r = Math.floor(k / W), c = k % W;
          ctx.globalAlpha = 0.18; ctx.fillStyle = '#fff'; ctx.fillRect(L.x0, L.y0 + r * L.ch, L.cw * W, L.ch); ctx.globalAlpha = 1;
          ctx.fillStyle = L.rows[r]?.[c] ? '#fff' : 'rgba(255,255,255,0.5)'; ctx.fillRect(L.x0 + c * L.cw - 0.5, L.y0 + r * L.ch - 0.5, L.cw + 1, L.ch + 1);
        } else if (L?.kind === 'steps') {
          const j = step % Math.max(1, L.notes.length);
          ctx.globalAlpha = 0.25; ctx.fillStyle = '#fff'; ctx.fillRect(L.x0 + j * L.cell, L.y0, L.cell, L.h); ctx.globalAlpha = 1;
        }
      }
      if (kind === 'Scope') {
        const w = pp.waveform(e.id);
        if (w) {
          const n = Math.max(16, Math.floor(w.length / Math.max(0.25, s.zoom))), ym = (a.y0 + a.y1) / 2, hh = (a.y1 - a.y0) / 2 - 2;
          ctx.strokeStyle = accent; ctx.lineWidth = 1.3; ctx.beginPath();
          for (let i = 0; i < n; i++) { const x = a.x0 + (i / (n - 1)) * (a.x1 - a.x0), y = ym - Math.max(-1, Math.min(1, w[i] * 2)) * hh; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
          ctx.stroke();
        }
      } else if (kind === 'Output') {
        const m = pp.meter(e.id), ym = (a.y0 + a.y1) / 2;
        ctx.fillStyle = m.peak > 0.95 ? '#ff5a4a' : '#ffffff'; ctx.globalAlpha = 0.8;
        ctx.fillRect(a.x0, ym + 6, (a.x1 - a.x0) * Math.min(1, m.peak), 3);
        ctx.globalAlpha = 1;
      } else if (kind === 'Mixer') {
        const lv = pp.engine.levels(e.id);
        if (lv) { const n = 8, cw = (a.x1 - a.x0) / n; lv.strips.forEach((p, i) => { const hh = (a.y1 - a.y0 - 14) * Math.min(1, p); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(a.x0 + i * cw + cw / 2 + 3, a.y1 - 12 - hh, 2, hh); }); }
      }
    }
    // keep drawing while it sounds
    this.poke();
  }
}
