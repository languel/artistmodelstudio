/**
 * Brushes: how a path becomes marks.
 *
 * Every brush is an honest, small algorithm with explicit, bounded parameters.
 * They realise decisions; they do not make them (no composition, no colour choices
 * beyond what the element asks for). Each parameter carries a range and a one-line
 * meaning, so the same schema drives UI controls, MCP tools and model outputs.
 *
 * draw(ctx, element, params, env): ctx is in artboard units.
 * env: { rng, scale (screen px per artboard unit), overlay (drawing construction) }
 */

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

/** Catmull-Rom resampling so hand-drawn and scripted paths render smoothly. */
function smoothPath(points, closed, samplesPerSeg = 6) {
  if (points.length < 3) return points.map(p => p.slice());
  const out = [];
  const n = points.length;
  const get = i => (closed ? points[(i + n) % n] : points[Math.max(0, Math.min(n - 1, i))]);
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    for (let s = 0; s < samplesPerSeg; s++) {
      const t = s / samplesPerSeg, t2 = t * t, t3 = t2 * t;
      const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1]), p1[2] + (p2[2] - p1[2]) * t, p1[3] + (p2[3] - p1[3]) * t]);
    }
  }
  if (!closed) out.push(points[n - 1].slice());
  return out;
}

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


/**
 * The walk of a line (after William Ngan's "Taking a line for a walk"): resampled points with
 * the unit normal and the hand's speed at each, from the recorded time (units per 16 ms frame),
 * smoothed so a line's character follows its motion rather than its jitter.
 */
function walkFrames(e, samples = 4, smoothing = 0.5) {
  const pts = smoothPath(e.points, e.closed, samples);
  let v = 0;
  return pts.map((q, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
    const prev = pts[Math.max(0, i - 1)];
    const step = Math.hypot(q[0] - prev[0], q[1] - prev[1]);
    const dt = (q[2] ?? 0) - (prev[2] ?? 0);
    const raw = i === 0 ? 0 : dt > 0.5 ? (step / dt) * 16 : step;
    v = i === 0 ? raw : v * smoothing + raw * (1 - smoothing);
    return { x: q[0], y: q[1], nx: -dy, ny: dx, speed: v, pressure: q[3] ?? 0.5 };
  });
}

function strokeSegment(ctx, x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }

const lineParams = (width, opacity = 1) => [param('width', 'Width', 0.25, 20, 0.25, width, 'Stroke width.'), param('opacity', 'Opacity', 0, 1, 0.05, opacity, 'Paint opacity.')];
const speedParams = (gain, max) => [param('gain', 'Speed gain', 0, 6, 0.05, gain, 'How much the hand\'s speed changes the mark.'), param('max', 'Max', 1, 200, 1, max, 'The largest mark, in artboard units.')];
const beginInk = (ctx, e, p) => { ctx.save(); ctx.globalAlpha *= p.opacity; ctx.strokeStyle = e.color || INK; ctx.fillStyle = e.color || INK; ctx.lineWidth = p.width; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; };

export const BRUSHES = {
  none: {
    label: 'None', roles: ['note'], doc: 'Not drawn in the picture.',
    params: [],
    draw() {}
  },

  guide: {
    label: 'Guide', roles: ['guide', 'gesture', 'line', 'plane'], doc: 'Construction line: shown as an overlay, left out of the finished picture.',
    construction: true,
    params: [param('dash', 'Dash', 0, 40, 1, 8, 'Dash length in artboard units (0 = solid).')],
    draw(ctx, e, p, env) {
      const pts = smoothPath(e.points, e.closed);
      ctx.save();
      ctx.strokeStyle = e.color || (e.role === 'gesture' ? '#d9480f' : '#2f6fdd');
      ctx.globalAlpha *= 0.7;
      ctx.lineWidth = 1.25 / env.scale;
      if (p.dash > 0) ctx.setLineDash([p.dash, p.dash * 0.7]);
      tracePath(ctx, pts, e.closed);
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
    draw(ctx, e, p) {
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      ctx.fillStyle = e.color || INK;
      for (const [x, y] of e.points) { ctx.beginPath(); ctx.arc(x, y, p.size / 2, 0, Math.PI * 2); ctx.fill(); }
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
    draw(ctx, e, p, env) {
      const pts = smoothPath(e.points, e.closed);
      if (pts.length < 2) return BRUSHES.dot.draw(ctx, e, { size: p.width, opacity: p.opacity });
      // Arc length for taper.
      const len = [0];
      for (let i = 1; i < pts.length; i++) len.push(len[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      const total = len[len.length - 1] || 1;
      const half = pts.map((q, i) => {
        const u = len[i] / total;
        const taper = p.taper > 0 && !e.closed ? Math.min(1, Math.min(u, 1 - u) / (p.taper / 2)) : 1;
        const pressure = 1 - p.pressure + p.pressure * (q[3] ?? 0.5) * 2;
        return Math.max(0.15, p.width * 0.5 * pressure * (0.35 + 0.65 * taper));
      });
      const L = [], R = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let dx = b[0] - a[0], dy = b[1] - a[1];
        const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
        const w = half[i] + (p.wobble ? (env.rng() - 0.5) * p.wobble * p.width : 0);
        L.push([pts[i][0] - dy * w, pts[i][1] + dx * w]);
        R.push([pts[i][0] + dy * w, pts[i][1] - dx * w]);
      }
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      ctx.fillStyle = e.color || INK;
      ctx.beginPath();
      L.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
      ctx.closePath();
      ctx.fill();
      // Round caps.
      for (const i of e.closed ? [] : [0, pts.length - 1]) { ctx.beginPath(); ctx.arc(pts[i][0], pts[i][1], half[i], 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  },


  speed: {
    label: 'Speed lines', roles: ['line', 'gesture'], doc: 'After Ngan: short lines across the walk, as long as the hand was fast. Slow passages stay thin and dense.',
    params: [...speedParams(1.2, 60), param('every', 'Every', 1, 12, 1, 1, 'Draw one mark every n samples.'), ...lineParams(0.75)],
    draw(ctx, e, p) {
      beginInk(ctx, e, p);
      walkFrames(e).forEach((f, i) => {
        if (i % p.every) return;
        const L = Math.min(p.max, 0.5 + f.speed * p.gain) / 2;
        strokeSegment(ctx, f.x - f.nx * L, f.y - f.ny * L, f.x + f.nx * L, f.y + f.ny * L);
      });
      ctx.restore();
    }
  },
  restate: {
    label: 'Restated line', roles: ['line', 'gesture'], doc: 'After Ngan and the life-drawing habit of restating: the walk drawn several times, the passes drifting apart where the hand was fast.',
    params: [param('times', 'Times', 1, 12, 1, 4, 'How many passes.'), param('spread', 'Spread', 0, 40, 0.5, 6, 'How far the passes drift, per unit of speed.'), ...lineParams(0.8, 0.6)],
    draw(ctx, e, p, env) {
      beginInk(ctx, e, p);
      const fr = walkFrames(e);
      for (let k = 0; k < p.times; k++) {
        const phase = env.rng() * Math.PI * 2, freq = 0.02 + env.rng() * 0.05;
        ctx.beginPath();
        fr.forEach((f, i) => {
          const o = Math.sin(phase + i * freq * 6) * p.spread * (0.3 + Math.min(3, f.speed / 8)) * (k ? 1 : 0.2);
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
    draw(ctx, e, p) {
      beginInk(ctx, e, p);
      ctx.beginPath();
      let n = 0;
      walkFrames(e).forEach((f, i) => {
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
    draw(ctx, e, p) {
      beginInk(ctx, e, p);
      const fr = walkFrames(e, 4, 0.8);
      for (let k = 0; k < p.lines; k++) {
        const u = p.lines === 1 ? 0 : k / (p.lines - 1) - 0.5;
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
    draw(ctx, e, p) {
      ctx.save(); ctx.globalAlpha *= p.opacity; ctx.fillStyle = e.color || INK;
      let acc = p.spacing, px = null, py = null;
      for (const f of walkFrames(e)) {
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
    draw(ctx, e, p) {
      beginInk(ctx, e, p);
      walkFrames(e).forEach((f, i) => {
        if (i % p.every) return;
        const r = Math.min(p.max, 1 + f.speed * p.gain), a0 = Math.atan2(f.ny, f.nx), sweep = (p.sweep * Math.PI) / 180;
        ctx.beginPath();
        for (let k = 0; k <= 16; k++) {
          const a = a0 - sweep / 2 + (sweep * k) / 16;
          const x = f.x + Math.cos(a) * r, y = f.y + Math.sin(a) * r;
          k ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
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
    draw(ctx, e, p) {
      if (e.points.length < 3) return;
      const pts = smoothPath(e.points, true, 4);
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      ctx.fillStyle = e.color || '#8a8175';
      tracePath(ctx, pts, true);
      ctx.fill();
      if (p.edge > 0) { ctx.strokeStyle = INK; ctx.lineWidth = p.edge; ctx.stroke(); }
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
    draw(ctx, e, p, env) {
      if (e.points.length < 3) return;
      const poly = smoothPath(e.points, true, 3);
      const cx = poly.reduce((a, q) => a + q[0], 0) / poly.length, cy = poly.reduce((a, q) => a + q[1], 0) / poly.length;
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      ctx.strokeStyle = e.color || INK;
      ctx.lineWidth = p.width;
      ctx.lineCap = 'round';
      const sets = p.cross >= 1 ? [p.angle, p.angle + 90] : [p.angle];
      for (const deg of sets) {
        const a = (deg * Math.PI) / 180;
        const rp = rotatePts(poly, -a, cx, cy); // rotate so hatching is horizontal
        const ys = rp.map(q => q[1]);
        const y0 = Math.min(...ys), y1 = Math.max(...ys);
        ctx.beginPath();
        for (let y = y0 + p.spacing / 2; y < y1; y += p.spacing * (1 + (env.rng() - 0.5) * p.jitter)) {
          const xs = spans(rp, y);
          for (let k = 0; k + 1 < xs.length; k += 2) {
            const j = p.jitter * p.spacing;
            const a1 = rotatePts([[xs[k] + (env.rng() - 0.5) * j, y]], a, cx, cy)[0];
            const b1 = rotatePts([[xs[k + 1] + (env.rng() - 0.5) * j, y]], a, cx, cy)[0];
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
    draw(ctx, e, p, env) {
      if (e.points.length < 3) return;
      const poly = smoothPath(e.points, true, 3);
      const xs = poly.map(q => q[0]), ys = poly.map(q => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const n = Math.min(40000, Math.round((x1 - x0) * (y1 - y0) * p.density));
      ctx.save();
      ctx.globalAlpha *= p.opacity;
      ctx.fillStyle = e.color || INK;
      for (let i = 0; i < n; i++) {
        const x = x0 + env.rng() * (x1 - x0), y = y0 + env.rng() * (y1 - y0);
        const sp = spans(poly, y);
        let inside = false;
        for (let k = 0; k + 1 < sp.length; k += 2) if (x >= sp[k] && x <= sp[k + 1]) inside = true;
        if (!inside) continue;
        ctx.beginPath(); ctx.arc(x, y, p.size / 2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
};

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
  return Object.entries(BRUSHES).filter(([id, b]) => b.roles.includes(role) && (!b.custom || doc?.lines?.[id])).map(([id, b]) => ({ id, label: b.label }));
}

/**
 * Lines a document defines itself (defineLine in a score): { name: { source, doc, params: { key: [min, max, default] } } }.
 * "Create your own lines before you draw them" (Ngan). The source is compiled once and registered
 * beside the built-in brushes, so it renders, exports to SVG, and appears in Properties.
 * draw(ctx, frames, p, env): frames = [{ x, y, nx, ny, speed, pressure }], env = { color, rng, closed, points }.
 */
const compiled = new Map();
export function installLines(doc) {
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
