/**
 * How the modular synth looks on the canvas (pure canvas drawing, no DOM: the 'module' and 'cable' brushes, so a patch
 * draws the same in the studio, in exports and in renders). A module is a small device: a title bar in its group's
 * colour, a face that shows what its settings are (a Euclid's rings, a Grid's cells, an oscillator's wave, a filter's
 * curve…), and its ports. What moves while it plays (playheads, meters, the sound on the cables) is drawn over it
 * by the studio (src/modular/overlay.js).
 */
import { KINDS, settingsOf, parseRings, parseGrid, parseBits, parseDrumRows, parseSteps, isInstrument, LFO_SYNC } from '../audio/modular/patch.js';
import { boxOf, portsOf, HEADER, PORT, GROUP_COLORS, groupOf, cableType, CABLE_COLORS } from './model.js';

const FONT = 'Inter, system-ui, sans-serif';
export const FACE = Object.freeze({ body: '#1d1f24', screen: '#121317', line: '#3a3d45', text: '#e9e6df', dim: '#8d8f96', off: '#2c2f36' });

function rrect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
const text = (ctx, s, x, y, size, color, align = 'left', weight = '') => {
  ctx.font = `${weight}${size}px ${FONT}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
};
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
export const noteName = n => `${NAMES[((Math.round(n) % 12) + 12) % 12]}${Math.floor(Math.round(n) / 12) - 1}`;
const fmtHz = f => (f >= 1000 ? `${(f / 1000).toFixed(f >= 10000 ? 0 : 1)} kHz` : f >= 10 ? `${Math.round(f)} Hz` : `${Number(f.toFixed(2))} Hz`);
const wave = (shape, t) => {   // one cycle, t in 0..1 → -1..1
  if (shape === 'square') return t < 0.5 ? 1 : -1;
  if (shape === 'sawtooth') return 1 - 2 * t;
  if (shape === 'triangle') return t < 0.25 ? 4 * t : t < 0.75 ? 2 - 4 * t : 4 * t - 4;
  return Math.sin(2 * Math.PI * t);
};
function plot(ctx, x0, x1, ym, amp, f, color, width) {
  ctx.beginPath();
  const n = Math.max(24, Math.round(x1 - x0));
  for (let i = 0; i <= n; i++) { const u = i / n, x = x0 + u * (x1 - x0), y = ym - amp * f(u); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round'; ctx.stroke();
}

/** The face's working area (inside the ports), for the overlay too. */
export function faceArea(e) {
  const b = boxOf(e), mods = (KINDS[e.play.mod.kind]?.mods || []).length;
  return { x0: b.x0 + 9, x1: b.x1 - 9, y0: b.y0 + HEADER + 4, y1: b.y1 - (mods ? 13 : 5) };
}

/** Where a sequencer's steps are drawn (the overlay lights the one playing): a function step → [x, y, w, h] or for rings [cx, cy, r]. */
export function seqLayout(e) {
  const kind = e.play.mod.kind, s = settingsOf(e.play.mod), a = faceArea(e), w = a.x1 - a.x0, h = a.y1 - a.y0;
  if (kind === 'Euclid') {
    const rings = parseRings(s.rings), cx = (a.x0 + a.x1) / 2, cy = (a.y0 + a.y1) / 2, R = Math.max(6, Math.min(w, h) / 2 - 3);
    const gap = Math.min(14, (R * 0.7) / Math.max(1, rings.length));
    return { kind: 'rings', cx, cy, rings: rings.map((r, i) => ({ ...r, r: R - i * gap })) };
  }
  let rows, cols, labels = 0;
  if (kind === 'Grid') { rows = parseGrid(s.cells); cols = Math.max(1, ...rows.map(r => r.length)); }
  else if (kind === 'Bits') { rows = parseBits(s.bits); cols = Math.max(1, ...rows.map(r => r.length)); }
  else if (kind === 'Drums') { const d = parseDrumRows(s.rows); rows = d.map(r => r.steps); cols = Math.max(1, ...rows.map(r => r.length)); labels = Math.min(34, w * 0.18); }
  else if (kind === 'Steps') { const n = parseSteps(s.notes); return { kind: 'steps', notes: n, x0: a.x0, y0: a.y0, w, h, cell: w / Math.max(1, n.length) }; }
  else return null;
  const n = Math.max(1, rows.length);
  const cw = (w - labels) / cols, ch = h / n;
  return { kind: kind === 'Bits' ? 'bits' : 'cells', rows, cols, x0: a.x0 + labels, y0: a.y0, cw, ch, labels };
}

function drawSequencer(ctx, e, s, k, accent) {
  const L = seqLayout(e), kind = e.play.mod.kind;
  if (!L) return;
  if (L.kind === 'rings') {
    for (const ring of L.rings) {
      const n = ring.pattern.length, pts = [];
      ctx.beginPath(); ctx.arc(L.cx, L.cy, ring.r, 0, Math.PI * 2); ctx.strokeStyle = FACE.line; ctx.lineWidth = 0.8; ctx.stroke();
      ring.pattern.forEach((on, j) => {
        const ang = -Math.PI / 2 + (2 * Math.PI * j) / n, x = L.cx + ring.r * Math.cos(ang), y = L.cy + ring.r * Math.sin(ang);
        if (on) pts.push([x, y]);
        ctx.beginPath(); ctx.arc(x, y, on ? 2.6 : 1.3, 0, Math.PI * 2); ctx.fillStyle = on ? accent : FACE.dim; ctx.fill();
      });
      if (pts.length > 1) {   // the rhythm's polygon
        ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
        ctx.globalAlpha *= 0.35; ctx.strokeStyle = accent; ctx.lineWidth = 0.9; ctx.stroke(); ctx.globalAlpha /= 0.35;
      }
    }
    return;
  }
  if (L.kind === 'steps') {
    const notes = L.notes.filter(n => n !== null), lo = Math.min(...notes, 60), hi = Math.max(...notes, lo + 12);
    L.notes.forEach((n, i) => {
      const x = L.x0 + i * L.cell;
      ctx.fillStyle = i % 4 ? 'rgba(255,255,255,0.025)' : 'rgba(255,255,255,0.06)'; ctx.fillRect(x + 0.4, L.y0, L.cell - 0.8, L.h);
      if (n === null) return;
      const y = L.y0 + L.h - 4 - ((n + s.transpose - lo) / Math.max(1, hi - lo)) * (L.h - 8);
      ctx.fillStyle = accent; ctx.fillRect(x + 0.8, y - 1.6, Math.max(1, L.cell - 1.6), 3.2);
    });
    return;
  }
  const r = Math.min(L.cw, L.ch), gap = r > 6 ? 0.9 : r > 3 ? 0.4 : 0;
  L.rows.forEach((row, i) => {
    for (let j = 0; j < L.cols; j++) {
      const v = row[j] || 0, x = L.x0 + j * L.cw, y = L.y0 + i * L.ch;
      ctx.fillStyle = v ? (v > 1 ? '#fff1c9' : accent) : j % 4 === 0 && L.kind !== 'bits' ? '#363a43' : FACE.off;
      if (L.kind === 'bits' && !v) continue;
      ctx.fillRect(x + gap, y + gap, Math.max(0.5, L.cw - 2 * gap), Math.max(0.5, L.ch - 2 * gap));
    }
  });
  if (kind === 'Drums') {
    const names = parseDrumRows(s.rows).map(d => d.name);
    names.forEach((nm, i) => text(ctx, nm.slice(0, 5), L.x0 - L.labels + 1, L.y0 + (i + 0.5) * L.ch, Math.min(8, L.ch * 0.8), FACE.dim));
  }
}

function drawBody(ctx, e, s, k, accent) {
  const kind = e.play.mod.kind, a = faceArea(e), w = a.x1 - a.x0, h = a.y1 - a.y0, ym = (a.y0 + a.y1) / 2;
  const caption = (str, y = a.y1 - 4) => text(ctx, str, a.x1, y, 7.5, FACE.dim, 'right');
  if (KINDS[kind].group === 'sequencer') { drawSequencer(ctx, e, s, k, accent); return; }
  if (kind === 'Osc' || kind === 'LFO') {
    const cycles = kind === 'LFO' ? 1.5 : 2;
    plot(ctx, a.x0, a.x1, ym - 3, (h / 2 - 6) * (kind === 'LFO' ? Math.max(0.15, s.depth) : Math.max(0.2, Math.min(1, s.level * 2.5))), u => wave(s.wave, (u * cycles) % 1), accent, 1.6);
    caption(kind === 'LFO' ? (s.sync !== 'free' && LFO_SYNC[s.sync] ? `${s.sync} · ${s.wave}` : `${fmtHz(s.rate)} · ${s.wave}`) : `${fmtHz(s.freq)} · ${s.wave}`);
    return;
  }
  if (kind === 'Noise') {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
    let last = 0;
    plot(ctx, a.x0, a.x1, ym - 3, (h / 2 - 6) * Math.max(0.3, Math.min(1, s.level * 4)), () => (s.color === 'brown' ? (last = Math.max(-1, Math.min(1, last + rnd() * 0.35))) : s.color === 'pink' ? (last = last * 0.6 + rnd() * 0.5) : rnd()), accent, 0.9);
    caption(s.color);
    return;
  }
  if (kind === 'Filter') {
    const lx = f => (Math.log(f / 20) / Math.log(900)), cut = Math.max(0.02, Math.min(0.98, lx(s.cutoff))), q = Math.min(1, s.resonance / 12);
    const resp = u => {
      const d = (u - cut) * 6;
      if (s.mode === 'highpass') return u < cut ? Math.max(-1, d) : 0.0 + q * Math.exp(-d * d * 4);
      if (s.mode === 'bandpass') return Math.max(-1, -Math.abs(d)) + 0.2 + q * 0.6;
      if (s.mode === 'notch') return -Math.max(0, 1 - Math.abs(d) * 1.5);
      return u > cut ? Math.max(-1, -d) : q * Math.exp(-d * d * 4);
    };
    plot(ctx, a.x0, a.x1, a.y0 + h * 0.4, h * 0.4, resp, accent, 1.6);
    caption(`${s.mode} ${fmtHz(s.cutoff)}`);
    return;
  }
  if (kind === 'Synth') {
    const t = s.attack + s.decay + 0.4 + s.release, X = v => a.x0 + (v / t) * w, top = a.y0 + 3, bot = a.y1 - 12;
    ctx.beginPath(); ctx.moveTo(X(0), bot); ctx.lineTo(X(s.attack), top); ctx.lineTo(X(s.attack + s.decay), bot - (bot - top) * s.sustain);
    ctx.lineTo(X(s.attack + s.decay + 0.4), bot - (bot - top) * s.sustain); ctx.lineTo(X(t), bot);
    ctx.strokeStyle = accent; ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.stroke();
    caption(`${s.voice}${s.wave !== 'auto' ? ` · ${s.wave}` : ''}`);
    return;
  }
  if (kind === 'Karplus' || kind === 'Granular') {
    if (kind === 'Karplus') plot(ctx, a.x0, a.x1, ym - 4, h / 2 - 6, u => Math.sin(u * 40) * Math.exp(-u * (5 - s.decay)), accent, 1.1);
    else { let seed = 3; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 28; i++) { ctx.beginPath(); ctx.arc(a.x0 + rnd() * w, a.y0 + 3 + rnd() * (h - 16), 0.8 + rnd() * 2 * s.grain_size * 8, 0, Math.PI * 2); ctx.fillStyle = accent; ctx.globalAlpha *= 0.7; ctx.fill(); ctx.globalAlpha /= 0.7; } }
    caption(kind === 'Karplus' ? `string · ${s.decay}s` : `grains ${Math.round(s.density)}`);
    return;
  }
  if (kind === 'Sampler') {
    let seed = [...String(s.sample)].reduce((h0, c) => (h0 * 31 + c.charCodeAt(0)) % 2147483647, 11) || 11;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, n = Math.max(8, Math.round(w / 3));
    ctx.fillStyle = s.sample ? accent : FACE.off;
    for (let i = 0; i < n; i++) { const v = (0.2 + 0.8 * rnd()) * Math.sin(Math.PI * (0.15 + 0.85 * i / n)) * (h / 2 - 8); ctx.fillRect(a.x0 + (i / n) * w, ym - 4 - v, Math.max(0.6, w / n - 1), 2 * v); }
    if (s.start > 0) { ctx.fillStyle = '#fff'; ctx.fillRect(a.x0 + s.start * w, a.y0, 1, h - 10); }
    caption(`${s.sample ? String(s.sample).slice(0, 18) : 'no sample'} · ${noteName(s.root)}${s.loop ? ' · loop' : ''}`);
    return;
  }
  if (kind === 'DrumKit' || kind === 'DrumSynth') {
    const cw = w / 4, ch = (h - 10) / 2;
    for (let i = 0; i < 8; i++) { rrect(ctx, a.x0 + (i % 4) * cw + 1, a.y0 + Math.floor(i / 4) * ch + 1, cw - 2, ch - 2, 2); ctx.fillStyle = i === 0 ? accent : FACE.off; ctx.fill(); }
    caption(kind === 'DrumKit' ? 'GM drums' : 'synth drums');
    return;
  }
  if (kind === 'Delay') {
    for (let i = 0; i < 6; i++) { const v = Math.pow(Math.max(0.05, s.feedback), i) * (h - 14), x = a.x0 + 2 + i * (w / 6); ctx.fillStyle = accent; ctx.globalAlpha *= i ? s.mix + 0.3 : 1; ctx.fillRect(x, a.y1 - 10 - v, 3, v); ctx.globalAlpha /= i ? s.mix + 0.3 : 1; }
    caption(`${Math.round(s.seconds * 1000)} ms`);
    return;
  }
  if (kind === 'Reverb') {
    let seed = 5; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, n = Math.round(w / 2);
    ctx.fillStyle = accent;
    for (let i = 0; i < n; i++) { const env = Math.pow(1 - i / n, 6 / Math.max(0.3, s.decay)), v = rnd() * env * (h - 14); ctx.fillRect(a.x0 + (i / n) * w, a.y1 - 10 - v, 1, v); }
    caption(`${s.decay}s · ${Math.round(s.mix * 100)}%`);
    return;
  }
  if (kind === 'Distortion') {
    const d = Math.max(0.01, s.drive);
    plot(ctx, a.x0, a.x1, ym - 3, h / 2 - 7, u => Math.tanh((u * 2 - 1) * (1 + d)) / Math.tanh(1 + d), accent, 1.6);
    caption(`drive ${s.drive}`);
    return;
  }
  if (kind === 'Gain' || kind === 'Output') {
    ctx.fillStyle = FACE.off; ctx.fillRect(a.x0, ym - 4, w, 6);
    ctx.fillStyle = s.mute ? FACE.dim : accent; ctx.fillRect(a.x0, ym - 4, w * Math.min(1, s.level / (kind === 'Gain' ? 2 : 1)), 6);
    if (kind === 'Gain') { ctx.beginPath(); ctx.arc(a.x0 + (s.pan + 1) / 2 * w, ym + 9, 2.2, 0, Math.PI * 2); ctx.fillStyle = FACE.text; ctx.fill(); }
    caption(s.mute ? 'muted' : `${Math.round(s.level * 100)}%`, a.y0 + 4);
    return;
  }
  if (kind === 'Mixer') {
    const n = 8, cw = w / n;
    for (let i = 1; i <= n; i++) {
      const x = a.x0 + (i - 1) * cw + cw / 2, lv = Math.min(1, s[`level_${i}`] / 2);
      ctx.fillStyle = FACE.off; ctx.fillRect(x - 1.5, a.y0 + 2, 3, h - 14);
      ctx.fillStyle = s[`mute_${i}`] ? FACE.dim : accent; ctx.fillRect(x - 3, a.y0 + 2 + (1 - lv) * (h - 18), 6, 3);
    }
    caption(`master ${Math.round(s.master * 100)}%`);
    return;
  }
  if (kind === 'Scope') { ctx.fillStyle = FACE.screen; ctx.fillRect(a.x0, a.y0, w, h); ctx.strokeStyle = FACE.line; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.moveTo(a.x0, ym); ctx.lineTo(a.x1, ym); ctx.stroke(); return; }
  if (kind === 'Merge') { ctx.strokeStyle = accent; ctx.lineWidth = 1.2; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(a.x0, a.y0 + (i + 0.5) * h / 4); ctx.quadraticCurveTo(a.x0 + w * 0.6, a.y0 + (i + 0.5) * h / 4, a.x1, ym); ctx.stroke(); } }
}

/** The 'module' brush: the whole device (box, title, face, ports). */
export function drawModule(ctx, e, p) {
  const kind = e.play?.mod?.kind;
  if (!KINDS[kind]) return;
  const s = settingsOf(e.play.mod), b = boxOf(e), group = groupOf(kind), accent = GROUP_COLORS[group];
  ctx.save();
  ctx.globalAlpha *= p.opacity ?? 1;
  // the box
  rrect(ctx, b.x0, b.y0, b.w, b.h, 5); ctx.fillStyle = e.fill || FACE.body; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = FACE.line; ctx.stroke();
  // the title bar
  ctx.save(); rrect(ctx, b.x0, b.y0, b.w, b.h, 5); ctx.clip();
  ctx.fillStyle = accent; ctx.fillRect(b.x0, b.y0, b.w, HEADER);
  ctx.restore();
  text(ctx, e.label || kind, b.x0 + 7, b.y0 + HEADER / 2 + 0.5, 9.5, '#15161a', 'left', '600 ');
  if (isInstrument(kind)) text(ctx, `ch ${s.channel}`, b.x1 - 6, b.y0 + HEADER / 2 + 0.5, 8, '#15161a', 'right');
  else if (KINDS[kind].group === 'sequencer') text(ctx, `1/${s.division * 4}`, b.x1 - 6, b.y0 + HEADER / 2 + 0.5, 8, '#15161a', 'right');
  drawBody(ctx, e, s, null, accent);
  // ports
  const P = portsOf(e);
  for (const q of P.ins) {
    ctx.beginPath(); ctx.arc(q.x, q.y, PORT, 0, Math.PI * 2); ctx.fillStyle = FACE.screen; ctx.fill();
    ctx.lineWidth = 1.4; ctx.strokeStyle = CABLE_COLORS[cableType(q.slot)]; ctx.stroke();
    if (P.ins.length > 1) text(ctx, q.slot === 'notes' ? '♪' : q.slot.replace(/^(input|in)_/, ''), q.x + PORT + 2, q.y, 6.5, FACE.dim);
  }
  for (const q of P.mods) {
    ctx.beginPath(); ctx.arc(q.x, q.y, PORT * 0.8, 0, Math.PI * 2); ctx.fillStyle = FACE.screen; ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = CABLE_COLORS.mod; ctx.stroke();
    text(ctx, q.slot.slice(4, 8), q.x, q.y - PORT - 3.5, 6, FACE.dim, 'center');
  }
  if (P.out) { ctx.beginPath(); ctx.arc(P.out.x, P.out.y, PORT, 0, Math.PI * 2); ctx.fillStyle = CABLE_COLORS[P.out.type]; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = FACE.screen; ctx.stroke(); }
  ctx.restore();
}

/** The smooth curve through a cable's points (quadratic through the midpoints). */
export function cablePath(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  if (pts.length === 2) { ctx.lineTo(pts[1][0], pts[1][1]); return; }
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i], [nx, ny] = pts[i + 1], last = i === pts.length - 2;
    ctx.quadraticCurveTo(x, y, last ? nx : (x + nx) / 2, last ? ny : (y + ny) / 2);
  }
}

/** The 'cable' brush: a patch cord in the colour of what it carries (notes, sound, modulation), plugs at its ends. */
export function drawCable(ctx, e, p) {
  const pts = e.points || [];
  if (pts.length < 2) return;
  const c = e.play?.cable, col = c ? CABLE_COLORS[cableType(c.slot)] : (e.color || '#888'), w = p.width ?? 2.4;
  ctx.save();
  ctx.globalAlpha *= p.opacity ?? 1;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  cablePath(ctx, pts); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = w + 2; ctx.stroke();
  cablePath(ctx, pts); ctx.strokeStyle = col; ctx.lineWidth = w;
  if (c?.slot && cableType(c.slot) === 'mod') ctx.setLineDash([w * 2.2, w * 1.4]);
  ctx.stroke(); ctx.setLineDash([]);
  for (const q of [pts[0], pts.at(-1)]) { ctx.beginPath(); ctx.arc(q[0], q[1], w * 0.9, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill(); }
  ctx.restore();
}
