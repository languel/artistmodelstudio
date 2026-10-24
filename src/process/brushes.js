/**
 * Brushes: how a path becomes marks.
 *
 * Every brush is an honest, small algorithm with explicit, bounded parameters.
 * They realize decisions; they do not make them (no composition, no color choices
 * beyond what the element asks for). Each parameter carries a range and a one-line
 * meaning, so the same schema drives UI controls, MCP tools and model outputs.
 *
 * draw(ctx, element, params, env): ctx is in artboard units.
 * env: { rng, scale (screen px per artboard unit), overlay (drawing construction), board (the mark's board rect) }
 */
import { getSource } from './streams.js';
import { smoothPath, walkFrames } from './walk.js';
import { txPaint, txDabs, txHairs, txWash, txBounds, txHash, txLayer, txGrain } from './texture.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const INK = '#1d1b19';
const param = (key, label, min, max, step, def, doc) => ({ key, label, min, max, step, default: def, doc });

function tracePath(ctx, pts, closed) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  if (closed) ctx.closePath();
}

/** Scanline intersections of a polygon with horizontal line y (for hatching and stippling). */
function spans(poly, y) {
  const xs = [];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y)) xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi));
  }
  return xs.sort((a, b) => a - b);
}

function rotatePts(pts, a, cx, cy) {
  const c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}


function strokeSegment(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

const lineParams = (width, opacity = 1) => [param('width', 'Width', 0.25, 20, 0.25, width, 'Stroke width.'), param('opacity', 'Opacity', 0, 1, 0.05, opacity, 'Paint opacity.')];
const speedParams = (gain, max) => [param('gain', 'Speed gain', 0, 6, 0.05, gain, 'How much the hand\'s speed changes the mark.'), param('max', 'Max', 1, 200, 1, max, 'The largest mark, in artboard units.')];
const beginInk = (ctx, e, p) => { ctx.save(); ctx.globalAlpha *= p.opacity; ctx.strokeStyle = e.color || INK; ctx.fillStyle = e.color || INK; ctx.lineWidth = p.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; };

export const BRUSHES = {
  image: {
    label: 'Image', roles: ['image'], doc: 'A placed picture, drawn through its four corners (so it moves, scales and rotates like any mark).',
    params: [param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Opacity of the picture.')],
    draw(ctx, e, p, k) {
      const [a, b, , d] = e.points;
      if (!a || !b || !d) return;
      const im = k.image(e.src);
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      // The unit square mapped onto the corners: top-left a, top-right b, bottom-left d.
      ctx.transform(b[0] - a[0], b[1] - a[1], d[0] - a[0], d[1] - a[1], a[0], a[1]);
      if (im) ctx.drawImage(im, 0, 0, 1, 1);
      else { ctx.fillStyle = 'rgba(128,128,128,0.15)'; ctx.fillRect(0, 0, 1, 1); }
      ctx.restore();
    }
  },

  none: {
    label: 'None', roles: ['note'], doc: 'Not drawn in the picture.',
    params: [],
    draw() {}
  },

  guide: {
    label: 'Guide', roles: ['guide', 'gesture', 'line', 'plane'], doc: 'Construction line: shown as an overlay, left out of the finished picture.',
    construction: true,
    params: [param('dash', 'Dash', 0, 40, 1, 8, 'Dash length in artboard units (0 = solid).')],
    draw(ctx, e, p, k) {
      const pts = k.smoothPath(e.points, e.closed);
      ctx.save();
      ctx.strokeStyle = e.color || (e.role === 'gesture' ? '#d9480f' : '#2f6fdd');
      ctx.globalAlpha *= 0.7;
      ctx.lineWidth = 1.25 / k.scale;
      if (p.dash > 0) ctx.setLineDash([p.dash, p.dash * 0.7]);
      k.tracePath(ctx, pts, e.closed);
      ctx.stroke();
      ctx.restore();
    }
  },

  dot: {
    label: 'Dot', roles: ['point'], doc: 'A round mark; its weight is its size.',
    params: [
      param('size', 'Size', 1, 200, 1, 12, 'Diameter in artboard units.'),
      param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Paint opacity.')
    ],
    draw(ctx, e, p, k) {
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      ctx.fillStyle = e.color || k.INK;
      for (const [x, y] of e.points) { ctx.beginPath(); ctx.arc(x, y, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  },

  // ---- score markers: how a mark that plays looks (see src/score). Plain brushes: change them, or give a mark any other. ----
  traveler: {
    label: 'Traveler', roles: ['point'], doc: 'The marker of a point that travels a path: a ring, a dot, and a faint outer ring.',
    params: [
      param('size', 'Size', 4, 80, 1, 16, 'Diameter in artboard units.'),
      param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Paint opacity.')
    ],
    draw(ctx, e, p, k) {
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      const c = e.color || '#c8664f', w = 1.5 / k.scale;
      const bar = e.play?.travel?.width > 0 ? e.play.travel.width : 0, ang = ((e.play?.travel?.angle ?? 90) * Math.PI) / 180;   // a traveler that is a bar across its path is drawn as one
      for (const [x, y] of e.points) {
        ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = w;
        if (bar) { ctx.globalAlpha = p.opacity * 0.8; ctx.lineWidth = 2.5 / k.scale; ctx.beginPath(); ctx.moveTo(x - Math.cos(ang) * bar / 2, y - Math.sin(ang) * bar / 2); ctx.lineTo(x + Math.cos(ang) * bar / 2, y + Math.sin(ang) * bar / 2); ctx.stroke(); ctx.lineWidth = w; }
        ctx.globalAlpha = p.opacity * 0.35; ctx.setLineDash([2 / k.scale, 3 / k.scale]);
        ctx.beginPath(); ctx.arc(x, y, p.size * 0.8, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
        ctx.globalAlpha = p.opacity;
        ctx.beginPath(); ctx.arc(x, y, p.size / 2, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(x, y, p.size * 0.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  },

  path: {
    label: 'Path', roles: ['line'], doc: 'A line that can be travelled: thin, with a small ring where it starts and an arrowhead where it ends.',
    params: [
      param('width', 'Width', 0.25, 12, 0.25, 1.5, 'Stroke width.'),
      param('opacity', 'Opacity', 0, 1, 0.05, 0.9, 'Paint opacity.'),
      param('arrow', 'Arrow', 0, 30, 1, 9, 'Size of the arrowhead (0 = none).')
    ],
    draw(ctx, e, p, k) {
      const pts = k.smoothPath(e.points, e.closed);
      if (pts.length < 2) return;
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      const c = e.color || k.INK;
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = p.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      k.tracePath(ctx, pts, e.closed); ctx.stroke();
      if (!e.closed) {
        const [sx, sy] = pts[0];
        if (!e.play?.path?.edge) { ctx.beginPath(); ctx.arc(sx, sy, 2.5 + p.width, 0, Math.PI * 2); ctx.stroke(); }   // (an edge starts at a node, which says so)
        if (p.arrow > 0) {
          const b = pts[pts.length - 1];
          let a = pts[pts.length - 2], i = pts.length - 2;
          while (i > 0 && Math.hypot(b[0] - a[0], b[1] - a[1]) < p.arrow * 0.6) a = pts[--i];
          const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = p.arrow, W = p.arrow * 0.45;
          ctx.beginPath();
          ctx.moveTo(b[0], b[1]);
          ctx.lineTo(b[0] - Math.cos(ang) * L + Math.sin(ang) * W, b[1] - Math.sin(ang) * L - Math.cos(ang) * W);
          ctx.lineTo(b[0] - Math.cos(ang) * L - Math.sin(ang) * W, b[1] - Math.sin(ang) * L + Math.cos(ang) * W);
          ctx.closePath(); ctx.fill();
        }
      }
      ctx.restore();
    }
  },

  trigger: {
    label: 'Trigger', roles: ['plane', 'point', 'line'], doc: 'The look of what sounds when touched: a plane is a soft area with a dashed edge, a point is a square (travelers are round), a line is a dashed gate with end ticks.',
    params: [
      param('size', 'Size', 4, 80, 1, 16, 'A point: the width of its square.'),
      param('shape', 'Shape', 0, 2, 1, 0, 'A point: 0 a square, 1 a diamond, 2 rings like a ripple.'),
      param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Paint opacity.'),
      param('fill', 'Fill', 0, 1, 0.02, 0.16, 'A plane: how strongly it is filled.'),
      param('dash', 'Dash', 0, 30, 1, 6, 'Dash length of the edge (0 = solid).')
    ],
    draw(ctx, e, p, k) {
      const c = e.color || '#3b8fa3', w = 1.5 / k.scale;
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = w; ctx.lineJoin = 'round';
      if (e.role === 'point') {
        const shape = Math.round(p.shape ?? 0);
        for (const [x, y] of e.points) {
          if (shape === 2) {
            [[0.5, 0.9], [0.85, 0.5], [1.2, 0.25]].forEach(([r, a]) => { ctx.globalAlpha = p.opacity * a; ctx.beginPath(); ctx.arc(x, y, p.size * r, 0, Math.PI * 2); ctx.stroke(); });
            ctx.globalAlpha = p.opacity; ctx.beginPath(); ctx.arc(x, y, p.size * 0.12, 0, Math.PI * 2); ctx.fill();
            continue;
          }
          // A square (or a diamond): a soft fill, an edge, a faint outer edge and a small centre.
          const sq = (h, rot) => { ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(Math.PI / 4); ctx.beginPath(); ctx.rect(-h, -h, 2 * h, 2 * h); ctx.restore(); };
          const rot = shape === 1, h = (p.size / 2) * (rot ? 0.85 : 1);
          sq(h, rot); ctx.globalAlpha = p.opacity * 0.18; ctx.fill(); ctx.globalAlpha = p.opacity; ctx.stroke();
          ctx.globalAlpha = p.opacity * 0.3; ctx.setLineDash([2 / k.scale, 3 / k.scale]); sq(h * 1.55, rot); ctx.stroke(); ctx.setLineDash([]);
          ctx.globalAlpha = p.opacity; sq(Math.max(0.8, h * 0.18), rot); ctx.fill();
        }
      } else if (e.role === 'line') {
        const pts = k.smoothPath(e.points, false);
        if (p.dash > 0) ctx.setLineDash([p.dash, p.dash * 0.7]);
        ctx.lineWidth = 2 / k.scale; k.tracePath(ctx, pts, false); ctx.stroke(); ctx.setLineDash([]);
        for (const [a, b] of [[pts[0], pts[1]], [pts[pts.length - 1], pts[pts.length - 2]]]) {
          if (!a || !b) continue;
          const ang = Math.atan2(a[1] - b[1], a[0] - b[0]) + Math.PI / 2, t = 6;
          ctx.beginPath(); ctx.moveTo(a[0] - Math.cos(ang) * t, a[1] - Math.sin(ang) * t); ctx.lineTo(a[0] + Math.cos(ang) * t, a[1] + Math.sin(ang) * t); ctx.stroke();
        }
      } else {
        if (e.points.length >= 3) {
          const pts = k.smoothPath(e.points, true);
          k.tracePath(ctx, pts, true);
          ctx.globalAlpha = p.opacity * p.fill; ctx.fill();
          ctx.globalAlpha = p.opacity; if (p.dash > 0) ctx.setLineDash([p.dash, p.dash * 0.7]); ctx.stroke();
        }
      }
      ctx.restore();
    }
  },

  node: {
    label: 'Node', roles: ['point'], doc: 'The marker of a node (Midinous): its shape says its kind (a note is a square, a controller a circle, a logic gate a D, an LED a diamond, a counter a hexagon, a switch an octagon with a bar, a terminator an X, an anchor a dot); a start has a diamond around it, a muted one is dotted, a pass is hollow; the lines inside show how it sends on.',
    params: [
      param('size', 'Size', 4, 80, 1, 14, 'Width in artboard units.'),
      param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Paint opacity.')
    ],
    draw(ctx, e, p, k) {
      const n = e.play?.node || {}, kind = n.kind || 'note', c = e.color || k.INK, w = 1.4 / k.scale;
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      ctx.strokeStyle = c; ctx.fillStyle = c; ctx.lineWidth = w; ctx.lineJoin = 'round';
      for (const [x, y] of e.points) {
        const r = p.size / 2;
        const shape = () => {
          ctx.beginPath();
          if (kind === 'cc') ctx.arc(x, y, r, 0, Math.PI * 2);
          else if (kind === 'gate') { ctx.moveTo(x - r, y - r); ctx.lineTo(x, y - r); ctx.arc(x, y, r, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x - r, y + r); ctx.closePath(); }
          else if (kind === 'led') { ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); }
          else if (kind === 'counter') { for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 2; ctx[i ? 'lineTo' : 'moveTo'](x + r * Math.cos(a), y + r * Math.sin(a)); } ctx.closePath(); }
          else if (kind === 'switch') { for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 - Math.PI / 8; ctx[i ? 'lineTo' : 'moveTo'](x + r * Math.cos(a), y + r * Math.sin(a)); } ctx.closePath(); }
          else if (kind === 'terminator') { const t = r / 3; ctx.moveTo(x - r, y - r + t); ctx.lineTo(x - t, y); ctx.lineTo(x - r, y + r - t); ctx.lineTo(x - r + t, y + r); ctx.lineTo(x, y + t); ctx.lineTo(x + r - t, y + r); ctx.lineTo(x + r, y + r - t); ctx.lineTo(x + t, y); ctx.lineTo(x + r, y - r + t); ctx.lineTo(x + r - t, y - r); ctx.lineTo(x, y - t); ctx.lineTo(x - r + t, y - r); ctx.closePath(); }
          else if (kind === 'anchor') ctx.arc(x, y, Math.max(1.5, r * 0.3), 0, Math.PI * 2);
          else { const q = r * 0.25; ctx.moveTo(x - r + q, y - r); ctx.arcTo(x + r, y - r, x + r, y + r, q); ctx.arcTo(x + r, y + r, x - r, y + r, q); ctx.arcTo(x - r, y + r, x - r, y - r, q); ctx.arcTo(x - r, y - r, x + r, y - r, q); ctx.closePath(); }
        };
        shape();
        if (!n.pass && kind !== 'anchor') { ctx.globalAlpha = p.opacity * (kind === 'terminator' ? 0.85 : 0.22); ctx.fill(); }
        ctx.globalAlpha = p.opacity;
        if (n.mute) ctx.setLineDash([1.2 / k.scale, 2.4 / k.scale]);
        if (kind === 'anchor') ctx.fill(); else ctx.stroke();
        ctx.setLineDash([]);
        if (kind === 'switch') { ctx.beginPath(); ctx.moveTo(x - r * 0.9, y); ctx.lineTo(x + r * 0.9, y); ctx.stroke(); }
        // How it sends on: two lines (split), two with one dashed (robin), a ring (portal), two squares (random).
        const mode = n.mode || 'robin', s = r * 0.55;
        if (kind !== 'terminator' && kind !== 'anchor' && kind !== 'switch') {
          ctx.lineWidth = w * 0.8; ctx.globalAlpha = p.opacity * 0.85;
          if (mode === 'split' || mode === 'robin') {
            ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s * 0.7, y - s * 0.8); ctx.stroke();
            if (mode === 'robin') ctx.setLineDash([1 / k.scale, 1.5 / k.scale]);
            ctx.beginPath(); ctx.moveTo(x - s, y); ctx.lineTo(x + s * 0.7, y + s * 0.8); ctx.stroke(); ctx.setLineDash([]);
          } else if (mode === 'portal') { ctx.beginPath(); ctx.arc(x, y, s * 0.7, 0, Math.PI * 2); ctx.stroke(); }
          else if (mode === 'random') { ctx.beginPath(); ctx.rect(x - s * 0.8, y - s * 0.1, s * 0.75, s * 0.75); ctx.rect(x - s * 0.1, y - s * 0.8, s * 0.75, s * 0.75); ctx.stroke(); }
        }
        // A start: a diamond around it. Repeats: two small arrows.
        ctx.lineWidth = w; ctx.globalAlpha = p.opacity;
        if (n.start) { const d = r * 1.55; ctx.beginPath(); ctx.moveTo(x, y - d); ctx.lineTo(x + d, y); ctx.lineTo(x, y + d); ctx.lineTo(x - d, y); ctx.closePath(); ctx.stroke(); }
        if (n.repeat > 0) { const a = r * 1.3; for (const sg of [-1, 1]) { ctx.beginPath(); ctx.moveTo(x + sg * a, y - sg * r * 0.2); ctx.lineTo(x + sg * (a + r * 0.45), y - sg * r * 0.6); ctx.lineTo(x + sg * (a + r * 0.45), y + sg * r * 0.2); ctx.closePath(); ctx.fill(); } }
      }
      ctx.restore();
    }
  },

  body: {
    label: 'Body', roles: ['point'], doc: 'A point that moves by itself and collides: a soft ball with a highlight.',
    params: [
      param('size', 'Size', 2, 80, 1, 12, 'Diameter in artboard units (also its size in collisions).'),
      param('opacity', 'Opacity', 0, 1, 0.05, 0.95, 'Paint opacity.')
    ],
    draw(ctx, e, p, k) {
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      const c = e.color || '#d4a72c';
      for (const [x, y] of e.points) {
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, p.size / 2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = p.opacity * 0.55; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x - p.size * 0.12, y - p.size * 0.14, p.size * 0.14, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = p.opacity; ctx.strokeStyle = k.INK; ctx.lineWidth = 0.8 / k.scale; ctx.globalAlpha = p.opacity * 0.4; ctx.beginPath(); ctx.arc(x, y, p.size / 2, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = p.opacity;
      }
      ctx.restore();
    }
  },

  ink: {
    label: 'Ink', roles: ['line', 'gesture', 'plane', 'guide'], doc: 'A pen line whose width follows pressure and tapers at the ends.',
    params: [
      param('width', 'Width', 0.5, 60, 0.5, 4, 'Base width in artboard units.'),
      param('pressure', 'Pressure', 0, 1, 0.05, 0.7, 'How much pressure changes the width (0 = constant).'),
      param('taper', 'Taper', 0, 1, 0.05, 0.3, 'Fraction of the length over which the ends thin out.'),
      param('wobble', 'Wobble', 0, 1, 0.05, 0, 'Seeded hand tremor, in widths.'),
      param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Paint opacity.')
    ],
    draw(ctx, e, p, k) {
      const pts = k.smoothPath(e.points, e.closed);
      if (pts.length < 2) return k.draw('dot', ctx, e, { size: p.width, opacity: p.opacity });
      // Arc length for taper.
      const len = [0];
      for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const total = len[len.length - 1] || 1;
      // Pressure sets the width, averaged along the line over about 1.5 widths: a mouse's jittery
      // pressure (it comes from speed) swells gently instead of beading like a sausage. The taper at
      // the ends is applied after, so ends stay sharp.
      const press = pts.map(q => 1 - p.pressure + p.pressure * (q[3] ?? 0.5) * 2);
      const reach = Math.max(1, p.width * 1.5), sm = new Array(pts.length);
      for (let i = 0, a = 0, b = 0, sum = 0; i < pts.length; i++) {
        while (b < pts.length && len[b] <= len[i] + reach) sum += press[b++];
        while (len[a] < len[i] - reach) sum -= press[a++];
        sm[i] = sum / (b - a);
      }
      const half = pts.map((q, i) => {
        const u = len[i] / total;
        const taper = p.taper > 0 && !e.closed ? Math.min(1, Math.min(u, 1 - u) / (p.taper / 2)) : 1;
        return Math.max(0.15, p.width * 0.5 * sm[i] * (0.35 + 0.65 * taper));
      });
      // Round joins: every segment is its own quad (its own direction), every point a disc; one
      // fill of all of them (same winding), so thick turns stay round and nothing overlaps darker.
      const r = pts.map((q, i) => Math.max(0.1, half[i] + (p.wobble ? (k.rng() - 0.5) * p.wobble * p.width : 0)));
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      ctx.fillStyle = e.color || k.INK;
      ctx.beginPath();
      if (!e.closed && pts.length >= 3 && !p.wobble) {   // (wobble makes each radius jump: the old union of quads and discs keeps its edge smooth, an outline through them spikes)
        // One outline (left offsets forward, right offsets back), the round caps, and a disc every 4th point (these keep
        // tight bends filled and cancel winding artifacts inside loops): far cheaper than a quad and a disc per point.
        const N = pts.length, R = new Array(N), P = [];   // P: the outline's vertices, for the sign of its winding
        for (let f = 0; f < N; f++) {
          const a = pts[f > 0 ? f - 1 : 0], b = pts[f < N - 1 ? f + 1 : N - 1];   // the tangent, from the neighbours
          let dx = b[0] - a[0], dy = b[1] - a[1];
          const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
          const q = pts[f], rf = r[f], lx = q[0] - dy * rf, ly = q[1] + dx * rf;
          f ? ctx.lineTo(lx, ly) : ctx.moveTo(lx, ly); P.push(lx, ly);
          R[f] = [q[0] + dy * rf, q[1] - dx * rf];
        }
        for (let f = N - 1; f >= 0; f--) { ctx.lineTo(R[f][0], R[f][1]); P.push(R[f][0], R[f][1]); }
        ctx.closePath();
        let area = 0;
        for (let f = 0, q = P.length - 2; f < P.length; q = f, f += 2) area += P[q] * P[f + 1] - P[f] * P[q + 1];
        for (let f = 0; f < N; f++) {
          if (f % 4 && f !== N - 1) continue;
          ctx.moveTo(pts[f][0] + r[f], pts[f][1]);
          ctx.arc(pts[f][0], pts[f][1], r[f], 0, Math.PI * 2, area < 0);   // the outline's winding, or 'nonzero' cancels the overlap
        }
      } else {
      const segs = e.closed ? pts.length : pts.length - 1;
      for (let i = 0; i < segs; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length], ra = r[i], rb = r[(i + 1) % pts.length];
        let dx = b[0] - a[0], dy = b[1] - a[1];
        const d = Math.hypot(dx, dy);
        if (d < 1e-6) continue;
        dx /= d; dy /= d;
        const quad = [[a[0] - dy * ra, a[1] + dx * ra], [b[0] - dy * rb, b[1] + dx * rb], [b[0] + dy * rb, b[1] - dx * rb], [a[0] + dy * ra, a[1] - dx * ra]];
        let area = 0;
        for (let j = 0; j < 4; j++) { const [x1, y1] = quad[j], [x2, y2] = quad[(j + 1) % 4]; area += x1 * y2 - x2 * y1; }
        if (area < 0) quad.reverse();
        quad.forEach(([x, y], j) => (j ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
        ctx.closePath();
      }
      for (let i = 0; i < pts.length; i++) { ctx.moveTo(pts[i][0] + r[i], pts[i][1]); ctx.arc(pts[i][0], pts[i][1], r[i], 0, Math.PI * 2); }
      }
      ctx.fill('nonzero');
      ctx.restore();
    }
  },


  pen: {
    label: 'Pen', roles: ['line', 'gesture', 'plane', 'guide'], doc: 'A line of one width everywhere, with round ends and joins: pressure and speed do not change it.',
    params: [
      param('width', 'Width', 0.25, 60, 0.25, 3, 'Stroke width in artboard units.'),
      param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Paint opacity.')
    ],
    draw(ctx, e, p, k) {
      const pts = k.smoothPath(e.points, e.closed);
      if (pts.length < 2) return k.draw('dot', ctx, e, { size: p.width, opacity: p.opacity });
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      ctx.strokeStyle = e.color || k.INK;
      ctx.lineWidth = p.width;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      k.tracePath(ctx, pts, e.closed);
      ctx.stroke();
      ctx.restore();
    }
  },

  speed: {
    label: 'Speed lines', roles: ['line', 'gesture'], doc: 'After Ngan: short lines across the walk, as long as the hand was fast. Slow passages stay thin and dense.',
    params: [...speedParams(1.2, 60), param('every', 'Every', 1, 12, 1, 1, 'Draw one mark every n samples.'), ...lineParams(0.75)],
    draw(ctx, e, p, k) {
      k.beginInk(ctx, e, p);
      k.frames(e).forEach((f, i) => {
        if (i % p.every) return;
        const L = Math.min(p.max, 0.5 + f.speed * p.gain) / 2;
        k.segment(ctx, f.x - f.nx * L, f.y - f.ny * L, f.x + f.nx * L, f.y + f.ny * L);
      });
      ctx.restore();
    }
  },
  restate: {
    label: 'Restated line', roles: ['line', 'gesture'], doc: 'After Ngan and the life-drawing habit of restating: the walk drawn several times, the passes drifting apart where the hand was fast.',
    params: [param('times', 'Times', 1, 12, 1, 4, 'How many passes.'), param('spread', 'Spread', 0, 40, 0.5, 6, 'How far the passes drift, per unit of speed.'), ...lineParams(0.8, 0.6)],
    draw(ctx, e, p, k) {
      k.beginInk(ctx, e, p);
      const fr = k.frames(e);
      for (let kk = 0; kk < p.times; kk++) {
        const phase = k.rng() * Math.PI * 2, freq = 0.02 + k.rng() * 0.05;
        ctx.beginPath();
        fr.forEach((f, i) => {
          const o = Math.sin(phase + i * freq * 6) * p.spread * (0.3 + Math.min(3, f.speed / 8)) * (kk ? 1 : 0.2);
          const x = f.x + f.nx * o, y = f.y + f.ny * o;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
      ctx.restore();
    }
  },
  zigzag: {
    label: 'Zigzag', roles: ['line', 'gesture'], doc: 'After Ngan: the walk as a zigzag whose amplitude follows the speed. The rhythm of the hand made visible.',
    params: [...speedParams(1, 50), param('every', 'Every', 1, 12, 1, 2, 'Samples per zig.'), ...lineParams(1)],
    draw(ctx, e, p, k) {
      k.beginInk(ctx, e, p);
      ctx.beginPath();
      let n = 0;
      k.frames(e).forEach((f, i) => {
        if (i % p.every) return;
        const L = Math.min(p.max, 1 + f.speed * p.gain) / 2 * (n++ % 2 ? 1 : -1);
        n === 1 ? ctx.moveTo(f.x + f.nx * L, f.y + f.ny * L) : ctx.lineTo(f.x + f.nx * L, f.y + f.ny * L);
      });
      ctx.stroke();
      ctx.restore();
    }
  },
  inner: {
    label: 'Inner lines', roles: ['line', 'gesture'], doc: 'After Ngan: parallel lines inside the walk that open where the hand speeds up and close where it slows. A line becoming a plane.',
    params: [param('lines', 'Lines', 2, 16, 1, 5, 'How many parallel lines.'), ...speedParams(1.5, 80), ...lineParams(0.6)],
    draw(ctx, e, p, k) {
      k.beginInk(ctx, e, p);
      const fr = k.frames(e, 4, 0.8);
      for (let kk = 0; kk < p.lines; kk++) {
        const u = p.lines === 1 ? 0 : kk / (p.lines - 1) - 0.5;
        ctx.beginPath();
        fr.forEach((f, i) => {
          const o = u * Math.min(p.max, 1 + f.speed * p.gain);
          const x = f.x + f.nx * o, y = f.y + f.ny * o;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        });
        ctx.stroke();
      }
      ctx.restore();
    }
  },
  dotted: {
    label: 'Dotted walk', roles: ['line', 'gesture'], doc: 'After Ngan: a line of points. Where the hand lingered the dots swell, like ink pooling; fast passages leave specks.',
    params: [param('spacing', 'Spacing', 2, 60, 1, 10, 'Distance between dots.'), param('size', 'Size', 0.5, 30, 0.5, 6, 'Largest dot.'), param('gain', 'Speed gain', 0, 3, 0.05, 0.6, 'How strongly speed shrinks the dots.'), param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Paint opacity.')],
    draw(ctx, e, p, k) {
      ctx.save(); ctx.globalAlpha *= p.opacity; ctx.fillStyle = e.color || k.INK;
      let acc = p.spacing, px = null, py = null;
      for (const f of k.frames(e)) {
        if (px !== null) acc += Math.hypot(f.x - px, f.y - py);
        px = f.x; py = f.y;
        if (acc < p.spacing) continue;
        acc = 0;
        const r = Math.max(0.3, p.size / (1 + f.speed * p.gain * 0.2)) / 2;
        ctx.beginPath(); ctx.arc(f.x, f.y, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  },
  arcs: {
    label: 'Arcs', roles: ['line', 'gesture'], doc: 'After Ngan: small arcs swung from the walk, their radius from the speed. The line as a sequence of gestures.',
    params: [...speedParams(0.8, 60), param('every', 'Every', 1, 24, 1, 4, 'One arc every n samples.'), param('sweep', 'Sweep', 10, 360, 5, 140, 'Arc angle in degrees.'), ...lineParams(0.6)],
    draw(ctx, e, p, k) {
      k.beginInk(ctx, e, p);
      k.frames(e).forEach((f, i) => {
        if (i % p.every) return;
        const r = Math.min(p.max, 1 + f.speed * p.gain), a0 = Math.atan2(f.ny, f.nx), sweep = (p.sweep * Math.PI) / 180;
        ctx.beginPath();
        for (let kk = 0; kk <= 16; kk++) {
          const a = a0 - sweep / 2 + (sweep * kk) / 16;
          const x = f.x + Math.cos(a) * r, y = f.y + Math.sin(a) * r;
          kk ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        ctx.stroke();
      });
      ctx.restore();
    }
  },
  flat: {
    label: 'Flat', roles: ['plane'], doc: 'A flat, even fill of the plane: the simplest way to state a mass.',
    params: [
      param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Paint opacity.'),
      param('edge', 'Edge', 0, 20, 0.5, 0, 'Outline width (0 = no outline).')
    ],
    draw(ctx, e, p, k) {
      if (e.points.length < 3) return;
      const pts = k.smoothPath(e.points, true);   // the outline's own path (smooth, or straight), so the fill meets its stroke
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      ctx.fillStyle = e.color || '#8a8175';
      k.tracePath(ctx, pts, true);
      ctx.fill();
      if (p.edge > 0) { ctx.strokeStyle = k.INK; ctx.lineWidth = p.edge; ctx.stroke(); }
      ctx.restore();
    }
  },

  hatch: {
    label: 'Hatch', roles: ['plane'], doc: 'Parallel lines inside the plane: value from spacing, direction from angle.',
    params: [
      param('angle', 'Angle', -90, 90, 1, 45, 'Line direction in degrees.'),
      param('spacing', 'Spacing', 2, 80, 0.5, 10, 'Distance between lines (smaller = darker).'),
      param('width', 'Width', 0.25, 12, 0.25, 1.5, 'Line width.'),
      param('cross', 'Cross', 0, 1, 1, 0, '1 = add a second set at right angles.'),
      param('jitter', 'Jitter', 0, 1, 0.05, 0.15, 'Seeded irregularity of spacing and ends.'),
      param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Paint opacity.')
    ],
    draw(ctx, e, p, k) {
      if (e.points.length < 3) return;
      const poly = k.smoothPath(e.points, true);   // the outline's own path (smooth, or straight), so the fill meets its stroke
      const cx = poly.reduce((a, q) => a + q[0], 0) / poly.length, cy = poly.reduce((a, q) => a + q[1], 0) / poly.length;
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      ctx.strokeStyle = e.color || k.INK;
      ctx.lineWidth = p.width;
      ctx.lineCap = 'round';
      const sets = p.cross >= 1 ? [p.angle, p.angle + 90] : [p.angle];
      for (const deg of sets) {
        const a = (deg * Math.PI) / 180;
        const rp = k.rotatePts(poly, -a, cx, cy); // rotate so hatching is horizontal
        const ys = rp.map(q => q[1]);
        const y0 = Math.min(...ys), y1 = Math.max(...ys);
        ctx.beginPath();
        for (let y = y0 + p.spacing / 2; y < y1; y += p.spacing * (1 + (k.rng() - 0.5) * p.jitter)) {
          const xs = k.spans(rp, y);
          for (let kk = 0; kk + 1 < xs.length; kk += 2) {
            const j = p.jitter * p.spacing;
            const a1 = k.rotatePts([[xs[kk] + (k.rng() - 0.5) * j, y]], a, cx, cy)[0];
            const b1 = k.rotatePts([[xs[kk + 1] + (k.rng() - 0.5) * j, y]], a, cx, cy)[0];
            ctx.moveTo(a1[0], a1[1]);
            ctx.lineTo(b1[0], b1[1]);
          }
        }
        ctx.stroke();
      }
      ctx.restore();
    }
  },

  stipple: {
    label: 'Stipple', roles: ['plane'], doc: 'Seeded dots inside the plane: value from density.',
    params: [
      param('density', 'Density', 0.0005, 0.05, 0.0005, 0.006, 'Dots per square unit.'),
      param('size', 'Size', 0.5, 12, 0.25, 2, 'Dot diameter.'),
      param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Paint opacity.')
    ],
    draw(ctx, e, p, k) {
      if (e.points.length < 3) return;
      const poly = k.smoothPath(e.points, true);   // the outline's own path (smooth, or straight), so the fill meets its stroke
      const xs = poly.map(q => q[0]), ys = poly.map(q => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const n = Math.min(40000, Math.round((x1 - x0) * (y1 - y0) * p.density));
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      ctx.fillStyle = e.color || k.INK;
      for (let i = 0; i < n; i++) {
        const x = x0 + k.rng() * (x1 - x0), y = y0 + k.rng() * (y1 - y0);
        const sp = k.spans(poly, y);
        let inside = false;
        for (let kk = 0; kk + 1 < sp.length; kk += 2) if (x >= sp[kk] && x <= sp[kk + 1]) inside = true;
        if (!inside) continue;
        ctx.beginPath(); ctx.arc(x, y, p.size / 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  },

  // ---- textured brushes: grain, hairs, washes (see texture.js) --------------------------------------------
  charcoal: {
    texture: true, label: 'Charcoal', roles: ['line', 'gesture'], doc: 'Soft, smudgy dabs that catch on the paper\'s tooth: the more pressure, the wider and blacker; strong grain breaks the edge.',
    params: [
      param('width', 'Width', 2, 80, 0.5, 14, 'Stick width in artboard units.'),
      param('pressure', 'Pressure', 0, 1, 0.05, 0.6, 'How much pressure widens the mark and strengthens it (0 = even).'),
      param('dry', 'Dry', 0, 1, 0.05, 0.7, 'How much the paper\'s tooth holds the charcoal back (0 = smooth, 1 = only the peaks).'),
      param('grain', 'Grain size', 0.2, 4, 0.1, 0.7, 'Size of the paper\'s tooth.'),
      param('flow', 'Flow', 0.05, 1, 0.05, 0.35, 'How much each dab lays down: dabs overlap and build up.'),
      param('scatter', 'Scatter', 0, 1.5, 0.05, 0.35, 'How far dabs drift across the line, in widths.'),
      param('hardness', 'Hardness', 0, 1, 0.05, 0.3, 'Softness of the dab\'s edge.'),
      param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Paint opacity.')
    ],
    draw(ctx, e, p, k) {
      const fr = k.frames(e, 3, 0.5);
      if (!fr.length) return;
      k.paint(ctx, {
        key: k.hash('charcoal', e.points, p, e.seed), bounds: k.bounds(fr, p.width * (1 + p.scatter)),
        color: e.color || k.INK, alpha: p.opacity, grain: { kind: 'paper', scale: p.grain, strength: p.dry, seed: 3 },
        draw: l => k.dabs(l, fr, { tip: 'soft', hardness: p.hardness, size: f => p.width * (0.45 + 0.55 * (1 + p.pressure * (f.pressure - 0.5) * 2)), flow: f => p.flow * (0.6 + 0.8 * p.pressure * f.pressure), spacing: 0.08, scatter: p.scatter, rng: k.rng })
      });
    }
  },
  chalk: {
    texture: true, label: 'Chalk', roles: ['line', 'gesture'], doc: 'A flat stick of pastel dragged across canvas: broad, dry, broken by the weave.',
    params: [
      param('width', 'Width', 2, 80, 0.5, 18, 'Stick width in artboard units.'),
      param('aspect', 'Thickness', 0.1, 1, 0.05, 0.35, 'Thickness of the stick relative to its width.'),
      param('dry', 'Dry', 0, 1, 0.05, 0.8, 'How much the weave holds the chalk back.'),
      param('grain', 'Grain size', 0.2, 4, 0.1, 0.9, 'Size of the weave.'),
      param('flow', 'Flow', 0.05, 1, 0.05, 0.55, 'How much each dab lays down.'),
      param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Paint opacity.')
    ],
    draw(ctx, e, p, k) {
      const fr = k.frames(e, 3, 0.6);
      if (!fr.length) return;
      k.paint(ctx, {
        key: k.hash('chalk', e.points, p, e.seed), bounds: k.bounds(fr, p.width),
        color: e.color || k.INK, alpha: p.opacity, grain: { kind: 'canvas', scale: p.grain, strength: p.dry, seed: 5 },
        draw: l => k.dabs(l, fr, { tip: 'flat', aspect: p.aspect, angle: 'follow', size: f => p.width * (0.7 + 0.6 * f.pressure), flow: p.flow, spacing: 0.06, scatter: 0.1, rng: k.rng })
      });
    }
  },
  pencil: {
    texture: true, label: 'Pencil', roles: ['line', 'gesture'], doc: 'A hard graphite point: thin, and it builds up where you go over it; light pressure leaves only the paper\'s peaks.',
    params: [
      param('width', 'Width', 0.5, 12, 0.25, 2.5, 'Point width in artboard units.'),
      param('pressure', 'Pressure', 0, 1, 0.05, 0.7, 'How much pressure darkens the line.'),
      param('dry', 'Dry', 0, 1, 0.05, 0.55, 'How much the paper\'s tooth shows through.'),
      param('grain', 'Grain size', 0.1, 3, 0.1, 0.45, 'Size of the paper\'s tooth.'),
      param('flow', 'Flow', 0.05, 1, 0.05, 0.3, 'How much each dab lays down: passes build up.'),
      param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Paint opacity.')
    ],
    draw(ctx, e, p, k) {
      const fr = k.frames(e, 4, 0.5);
      if (!fr.length) return;
      k.paint(ctx, {
        key: k.hash('pencil', e.points, p, e.seed), bounds: k.bounds(fr, p.width * 2),
        color: e.color || k.INK, alpha: p.opacity, grain: { kind: 'paper', scale: p.grain, strength: p.dry, seed: 11 },
        draw: l => k.dabs(l, fr, { tip: 'soft', hardness: 0.85, size: p.width, flow: f => p.flow * (1 - p.pressure + p.pressure * 1.6 * f.pressure), spacing: 0.18, scatter: 0.25, rng: k.rng })
      });
    }
  },
  bristles: {
    texture: true, label: 'Bristles', roles: ['line', 'gesture'], doc: 'A dry brush: many hairs side by side, each lifting off where the paint runs out (sooner when the hand is fast).',
    params: [
      param('width', 'Width', 4, 120, 0.5, 34, 'Brush width in artboard units.'),
      param('hairs', 'Hairs', 3, 80, 1, 28, 'How many bristles.'),
      param('thickness', 'Hair', 0.3, 6, 0.1, 1.5, 'Thickness of a bristle.'),
      param('dry', 'Dry', 0, 1, 0.05, 0.4, 'How soon the paint runs out (0 = loaded, 1 = nearly dry).'),
      param('body', 'Body', 0, 1, 0.05, 0.12, 'A faint even stroke under the hairs.'),
      param('grain', 'Grain size', 0.2, 4, 0.1, 1, 'Size of the paper\'s tooth.'),
      param('tooth', 'Tooth', 0, 1, 0.05, 0.25, 'How much the paper\'s tooth breaks the hairs up further.'),
      param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Paint opacity.')
    ],
    draw(ctx, e, p, k) {
      const fr = k.frames(e, 3, 0.7);
      if (fr.length < 2) return k.draw('dot', ctx, e, { size: p.width * 0.5, opacity: p.opacity });
      k.paint(ctx, {
        key: k.hash('bristles', e.points, p, e.seed), bounds: k.bounds(fr, p.width * 0.8),
        color: e.color || k.INK, alpha: p.opacity, grain: { kind: 'paper', scale: p.grain, strength: p.tooth, seed: 7 },
        draw: l => {
          if (p.body > 0) k.dabs(l, fr, { tip: 'soft', hardness: 0.6, size: p.width * 0.9, flow: p.body, spacing: 0.15, rng: k.rng });
          k.hairs(l, fr, { count: p.hairs, width: f => p.width * (0.6 + 0.6 * f.pressure), thickness: p.thickness, dry: p.dry, rng: k.rng });
        }
      });
    }
  },
  oil: {
    texture: true, label: 'Oil', roles: ['line', 'gesture'], doc: 'A loaded flat brush: many hairs packed side by side into one body of paint with streaks in it, a tapered stroke and ragged ends; the painterly stroke.',
    params: [
      param('width', 'Width', 4, 160, 0.5, 40, 'Brush width in artboard units.'),
      param('hair', 'Hair', 0.5, 6, 0.1, 1.6, 'Thickness of a bristle: coarse hairs leave visible streaks.'),
      param('flow', 'Load', 0.2, 1, 0.05, 0.9, 'How much paint each hair carries (less: more streaks).'),
      param('dry', 'Dry', 0, 1, 0.05, 0.1, 'How soon the paint runs out along the stroke.'),
      param('trim', 'Ragged ends', 0, 0.8, 0.05, 0.3, 'How far hairs may start late and end early.'),
      param('streaks', 'Streaks', 0, 1, 0.05, 0.35, 'How much the hairs differ in the paint they carry (0: an even body of paint).'),
      param('taper', 'Taper', 0, 1, 0.05, 0.4, 'How much the stroke narrows at its ends.'),
      param('grain', 'Grain size', 0.2, 4, 0.1, 0.5, 'Size of the canvas weave.'),
      param('tooth', 'Tooth', 0, 1, 0.05, 0.2, 'How much the canvas weave shows in the paint.'),
      param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Paint opacity.')
    ],
    draw(ctx, e, p, k) {
      const fr = k.frames(e, 3, 0.7);
      if (fr.length < 2) return k.draw('dot', ctx, e, { size: p.width * 0.5, opacity: p.opacity });
      k.paint(ctx, {
        key: k.hash('oil', e.points, p, e.seed), bounds: k.bounds(fr, p.width * 0.8),
        color: e.color || k.INK, alpha: p.opacity, grain: { kind: 'canvas', scale: p.grain, strength: p.tooth, seed: 17 },
        draw: l => k.hairs(l, fr, {
          count: Math.max(6, Math.min(160, Math.round(p.width / (p.hair * 0.5)))),
          width: (f, u) => p.width * (0.5 + 0.7 * f.pressure) * (1 - p.taper * (1 - Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0, u))), 0.5))),
          thickness: p.hair, flow: p.flow, dry: p.dry, trim: p.trim, streaks: p.streaks, rng: k.rng
        })
      });
    }
  },
  marker: {
    texture: true, label: 'Marker', roles: ['line', 'gesture'], doc: 'A broad felt tip: even and slightly see-through, so crossing strokes show through each other, and a stroke does not darken where it overlaps itself.',
    params: [
      param('width', 'Width', 2, 80, 0.5, 16, 'Tip width in artboard units.'),
      param('aspect', 'Chisel', 0.1, 1, 0.05, 0.4, 'How flat the tip is (1 = round-ish).'),
      param('grain', 'Grain size', 0.2, 4, 0.1, 0.6, 'Size of the paper\'s tooth.'),
      param('tooth', 'Tooth', 0, 1, 0.05, 0.15, 'How much the paper shows through.'),
      param('opacity', 'Opacity', 0, 1, 0.05, 0.6, 'Paint opacity (the whole stroke at once).')
    ],
    draw(ctx, e, p, k) {
      const fr = k.frames(e, 3, 0.7);
      if (!fr.length) return;
      k.paint(ctx, {
        key: k.hash('marker', e.points, p, e.seed), bounds: k.bounds(fr, p.width),
        color: e.color || k.INK, alpha: p.opacity, grain: { kind: 'paper', scale: p.grain, strength: p.tooth, seed: 2 },
        draw: l => k.dabs(l, fr, { tip: 'flat', aspect: p.aspect, angle: Math.PI / 4, size: p.width, flow: 1, spacing: 0.05 })
      });
    }
  },
  wash: {
    texture: true, label: 'Wash', roles: ['plane'], doc: 'Watercolor: a thin, transparent fill whose pigment gathers at the edge and settles into the paper\'s grain.',
    params: [
      param('body', 'Body', 0.05, 1, 0.05, 0.55, 'How strong the wash is inside.'),
      param('edge', 'Edge', 0, 1, 0.05, 0.6, 'How much darker the rim is.'),
      param('rim', 'Rim width', 0.5, 30, 0.5, 5, 'Width of the darker rim, in artboard units.'),
      param('rough', 'Wander', 0, 12, 0.25, 1.5, 'How much the edge wanders.'),
      param('granulation', 'Granulation', 0, 1, 0.05, 0.4, 'How much pigment settles into the paper\'s grain.'),
      param('grain', 'Grain size', 0.2, 4, 0.1, 0.8, 'Size of the paper\'s grain.'),
      param('opacity', 'Opacity', 0, 1, 0.05, 1, 'Paint opacity.')
    ],
    draw(ctx, e, p, k) {
      if (e.points.length < 3) return;
      const poly = k.smoothPath(e.points, true);   // the outline's own path (smooth, or straight), so the fill meets its stroke
      const xs = poly.map(q => q[0]), ys = poly.map(q => q[1]), pad = p.rough * 2 + p.rim * 2 + 4;
      k.paint(ctx, {
        key: k.hash('wash', e.points, p, e.seed), bounds: [Math.floor(Math.min(...xs) - pad), Math.floor(Math.min(...ys) - pad), Math.ceil(Math.max(...xs) + pad), Math.ceil(Math.max(...ys) + pad)],
        color: e.color || '#8a8175', alpha: p.opacity, grain: { kind: 'paper', scale: p.grain, strength: p.granulation, seed: 13 },
        draw: (l, layer) => k.wash(layer, poly, { edge: p.edge, rimWidth: p.rim, rough: p.rough, base: p.body, seed: e.seed || 1 })
      });
    }
  }
};

/**
 * The brush kit: what a brush's draw(ctx, e, p, k) can use. Brushes are code: the built-ins are
 * written against this kit only, so their source can be shown, forked and edited.
 *   k.smoothPath(points, closed, samples)   Catmull-Rom resampling
 *   k.frames(e, samples, smoothing)         the walk: [{ x, y, nx, ny, speed, pressure }]
 *   k.tracePath(ctx, pts, closed)           begin a path through pts
 *   k.spans(poly, y)                        scanline crossings of a polygon (hatching, stipple)
 *   k.rotatePts(pts, angle, cx, cy)         rotate points
 *   k.segment(ctx, x1, y1, x2, y2)          one stroked segment
 *   k.beginInk(ctx, e, p)                   save + color, width (p.width), opacity (p.opacity), round caps
 *   k.draw(id, ctx, e, params)              draw with another brush
 *   k.rng()                                 seeded random 0..1 (per element)
 *   k.noise(x, y)                           smooth value noise, about -1..1
 *   k.scale                                 screen scale (for hairlines)
 *   k.INK                                   the default ink color
 *   k.paint(ctx, { key, bounds, draw(lctx, layer), grain, color, alpha })   paint a mark through a layer (cached by key)
 *   k.dabs(lctx, frames, { tip, size, flow, spacing, scatter, hardness, aspect, angle, rng })   stamp a tip along a walk
 *   k.hairs(lctx, frames, { count, width, thickness, dry, flow, rng })    bristles that lift off where the paint runs dry
 *   k.wash(layer, poly, { edge, rimWidth, rough, base, seed })            a wash: pigment gathers at the edge
 *   k.bounds(frames, pad)  k.hash(...parts)  k.grain(layer, { kind, scale, strength, seed })
 *   k.age                                   seconds since the mark was born (its time envelope: see envelope.js)
 *   k.source(name)                          a source (camera, image…) fitted to the mark's board: .colorAt(x, y),
 *                                           .valueAt(x, y) in world units; .color(fx, fy), .pose, .mask(fx, fy) in fractions
 */
function valueNoise(x, y) {
  const h = (i, j) => { const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return n - Math.floor(n); };
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
  return (a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v) * 2 - 1;
}
const images = new Map();
/** A loaded image for a src (data URL or URL), or null while it loads (the canvas redraws when it arrives). */
function getImage(src) {
  if (!src || typeof Image === 'undefined') return null;
  let im = images.get(src);
  if (!im) { im = new Image(); im.onload = () => KIT.onImageLoad?.(); im.src = src; images.set(src, im); }
  return im.complete && im.naturalWidth ? im : null;
}
export const KIT = {
  image: getImage,
  smoothPath, tracePath, spans, rotatePts, frames: walkFrames, segment: strokeSegment, beginInk, INK, noise: valueNoise,
  // Textured painting (texture.js): a mark is painted white into a layer, the paper's grain is multiplied in, and it is tinted
  paint(ctx, spec) { return txPaint(ctx, { scale: this.scale, ...spec }); },
  dabs: txDabs, hairs: txHairs, wash: txWash, bounds: txBounds, hash: txHash, layer: txLayer, grain: txGrain,
  draw(id, ctx, e, params = {}) { const b = BRUSHES[id]; if (b) b.draw(ctx, e, resolveParams(id, params), this); },
  source(name, rect) { return getSource(name, rect || this.board, { peek: Boolean(this.frozen) }); }
};
export function kitFor(env = {}) {
  if (env && env.smoothPath) return env;
  const k = Object.create(KIT); k.rng = env?.rng || Math.random; k.scale = env?.scale || 1; k.board = env?.board; k.frozen = env?.frozen; k.age = env?.age || 0; k.now = env?.now ?? null;
  // A mark with path: 'straight' is drawn through its points as straight segments.
  if (env?.straight) k.smoothPath = points => points.map(p => p.slice());
  return k;
}

// Every brush's draw gets a kit, whatever the caller passes; the raw function is its source.
for (const b of Object.values(BRUSHES)) wrapDraw(b);
function wrapDraw(b) {
  if (b.rawDraw) return b;
  b.rawDraw = b.draw;
  b.draw = function (ctx, e, p, env) {
    if (!b.custom) return b.rawDraw(ctx, e, p, kitFor(env));
    // Code from people and models can fail: fall back to a plain brush for this element, warn once.
    ctx.save();
    try { b.rawDraw(ctx, e, p, kitFor(env)); ctx.restore(); }
    catch (err) {
      ctx.restore();
      if (!b.warned) { b.warned = true; b.lastError = err.message; console.warn(`brush "${b.id || b.label}" failed (drawn plainly instead): ${err.message}`); }
      const fb = e.role === 'plane' ? 'flat' : e.role === 'point' ? 'dot' : 'ink';
      BRUSHES[fb].draw(ctx, e, resolveParams(fb, {}), env);
    }
  };
  return b;
}

const q = v => JSON.stringify(v);
/** A brush as code: the snippet that defines it (built-ins included). */
export function brushSource(id) {
  const b = BRUSHES[id];
  if (!b) return null;
  if (b.source) return b.source;
  const params = b.params.map(p => `    ${p.key}: [${p.min}, ${p.max}, ${p.default}${p.doc ? `, ${q(p.doc)}` : ''}]`).join(',\n');
  let fn = b.rawDraw.toString();
  if (!/^draw\s*\(/.test(fn)) fn = `draw${fn.replace(/^function\s*\w*\s*/, '')}`;
  // Re-indent the method body to sit inside brush({ … }).
  const lines = fn.split('\n');
  const base = lines.length > 1 ? lines[lines.length - 1].match(/^ */)[0].length : 0;   // the closing brace
  fn = [lines[0], ...lines.slice(1).map(l => `  ${l.slice(Math.min(base, l.match(/^ */)[0].length))}`)].join('\n');
  return `brush({
  id: ${q(id)},
  label: ${q(b.label)},
  roles: ${q(b.roles)},
  doc: ${q(b.doc || '')},${b.construction ? '\n  construction: true,' : ''}
  params: {
${params}
  },
  ${fn}
})
`;
}

/** Code for a brush definition given as an object (brush({...}) in a score). */
export function defSource(def) {
  const params = Object.entries(def.params || {}).map(([key, v]) => `    ${key}: ${q(Array.isArray(v) ? v : [v.min, v.max, v.default, v.doc].filter(x => x !== undefined))}`).join(',\n');
  let fn = def.draw.toString();
  const method = /^draw\s*\(/.test(fn) ? fn : /^(async\s+)?function\b/.test(fn) ? `draw${fn.replace(/^function\s*\w*\s*/, '')}` : `draw: ${fn}`;
  return `brush({
  id: ${q(def.id)},
  label: ${q(def.label || def.id)},
  roles: ${q(def.roles || ['line', 'gesture', 'plane'])},
  doc: ${q(def.doc || '')},${def.construction ? '\n  construction: true,' : ''}
  params: {
${params}
  },
  ${method}
})
`;
}

/**
 * Compile brush code: brush({ id, label, roles, doc, params: { key: [min, max, default, doc] }, draw(ctx, e, p, k) { … } }).
 * Returns the definition (not yet registered). Throws with a readable message.
 */
export function compileBrush(source) {
  let def = null;
  // eslint-disable-next-line no-new-func
  new Function('brush', `"use strict";\n${source}`)(d => { def = d; });
  if (!def) throw new Error('The code must call brush({ id, draw(ctx, e, p, k) { … } })');
  if (!/^[a-z][\w-]*$/i.test(def.id || '')) throw new Error('brush id must be a word like "teeth"');
  if (typeof def.draw !== 'function') throw new Error('brush needs draw(ctx, e, p, k) { … }');
  const params = Object.entries(def.params || {}).map(([key, v]) => {
    const [min, max, dflt, doc] = Array.isArray(v) ? v : [v.min ?? 0, v.max ?? 1, v.default ?? 0, v.doc];
    return param(key, key, Number(min), Number(max), Math.abs(Number(max) - Number(min)) / 100 || 0.01, Number(dflt), doc || '');
  });
  return wrapDraw({
    label: def.label || def.id, roles: def.roles || ['line', 'gesture', 'plane'], doc: def.doc || '', construction: Boolean(def.construction),
    params, draw: def.draw, source, custom: true, id: def.id
  });
}

// ---- where brushes live: built-in, your library (browser), or a drawing ----------------------
const LIB_KEY = 'ams_brushes_v1';
const BUILTIN_IDS = new Set(Object.keys(BRUSHES));
export const isBuiltin = id => BUILTIN_IDS.has(id);
export function libraryBrushes() { try { return JSON.parse(globalThis.localStorage?.getItem(LIB_KEY) || '{}'); } catch { return {}; } }
function saveLibrary(lib) { try { globalThis.localStorage?.setItem(LIB_KEY, JSON.stringify(lib)); } catch { /* ignore */ } }

/** Register compiled brush code under its id (built-ins cannot be replaced: fork them under a new id). */
export function registerBrush(source, scope = 'library') {
  const def = compileBrush(source);
  if (isBuiltin(def.id)) throw new Error(`"${def.id}" is a built-in brush: give your version its own id`);
  def.scope = scope;
  BRUSHES[def.id] = def;
  return def;
}

/** Save brush code to your library (and register it). Returns the definition. */
export function saveLibraryBrush(source) {
  const def = registerBrush(source, 'library');
  const lib = libraryBrushes(); lib[def.id] = source; saveLibrary(lib);
  return def;
}

export function deleteLibraryBrush(id) {
  const lib = libraryBrushes(); const had = id in lib; delete lib[id]; saveLibrary(lib);
  if (BRUSHES[id]?.scope === 'library') delete BRUSHES[id];
  return had;
}

/** Load your library once (browser). */
export function loadLibrary() {
  for (const src of Object.values(libraryBrushes())) { try { registerBrush(src, 'library'); } catch (err) { console.warn('brush library:', err.message); } }
}

/** A drawing carries every non-built-in brush it uses, so it renders anywhere. */
export function embedBrushes(doc) {
  if (!doc?.elements) return doc;
  doc.brushes = doc.brushes || {};
  for (const e of doc.elements) {
    const id = e.realize?.brush;
    const b = BRUSHES[id];
    if (b?.custom && b.source && !doc.brushes[id] && !doc.lines?.[id]) doc.brushes[id] = b.source;
  }
  return doc;
}

/** Full parameter set for an element: brush defaults overlaid with the element's params. */
export function resolveParams(brushId, params = {}) {
  const b = BRUSHES[brushId] || BRUSHES.ink;
  const out = {};
  for (const s of b.params) {
    const v = params[s.key];
    out[s.key] = Number.isFinite(Number(v)) ? Math.min(s.max, Math.max(s.min, Number(v))) : s.default;
  }
  return out;
}

/** Brushes for a role; lines a document defined itself are listed only for that document. */
export function brushesForRole(role, doc = null) {
  // Picture brushes first (Ink, Pen, …), construction ones (Guide) last.
  return Object.entries(BRUSHES).filter(([id, b]) => b.roles.includes(role) && (!b.custom || b.scope === 'library' || doc?.lines?.[id] || doc?.brushes?.[id])).sort((a, b) => Number(Boolean(a[1].construction)) - Number(Boolean(b[1].construction))).map(([id, b]) => ({ id, label: b.label }));
}

/**
 * Lines a document defines itself (defineLine in a score): { name: { source, doc, params: { key: [min, max, default] } } }.
 * "Create your own lines before you draw them" (Ngan). The source is compiled once and registered
 * beside the built-in brushes, so it renders, exports to SVG, and appears in Properties.
 * draw(ctx, frames, p, env): frames = [{ x, y, nx, ny, speed, pressure }], env = { color, rng, closed, points }.
 */
const compiled = new Map();
export function installLines(doc) {
  for (const [id, src] of Object.entries(doc?.brushes || {})) {
    if (isBuiltin(id) || compiled.get(id) === src) continue;
    try { registerBrush(src, 'doc'); compiled.set(id, src); } catch (err) { console.warn(`brush "${id}":`, err.message); }
  }
  for (const [name, spec] of Object.entries(doc?.lines || {})) {
    if (!spec?.source || (BRUSHES[name] && !BRUSHES[name].custom)) continue;
    const key = `${name}\n${spec.source}\n${JSON.stringify(spec.params || {})}`;
    if (compiled.get(name) === key) continue;
    let fn;
    try {
      // eslint-disable-next-line no-new-func
      fn = new Function(`return (${spec.source});`)();
    } catch (err) { fn = () => { throw err; }; }
    const params = Object.entries(spec.params || {}).map(([k, [min, max, def]]) => param(k, k, min, max, (max - min) / 100, def, `${name}: ${k}`));
    BRUSHES[name] = {
      label: name, roles: ['line', 'gesture', 'plane'], doc: spec.doc || 'A line defined in this drawing\'s score.', custom: true, params,
      draw(ctx, e, p, env) {
        const color = e.color || INK;
        ctx.save();
        ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 1; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        try { fn(ctx, walkFrames(e), p, { color, rng: env.rng, closed: e.closed, points: e.points, scale: env.scale }); }
        catch (err) { ctx.restore(); ctx.save(); BRUSHES.ink.draw(ctx, e, resolveParams('ink', {}), env); console.warn(`line "${name}" failed: ${err.message}`); }
        ctx.restore();
      }
    };
    compiled.set(name, key);
  }
}

export { smoothPath };
