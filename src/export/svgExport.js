/**
 * SVG ⇄ Core DSL.
 *
 * programToSvg: draws a program as plain SVG (what the flat renderer draws),
 * with enough data-ams-* attributes to convert an edited SVG back:
 *   <svg data-ams-version data-ams-coords="normalized|grid" …>  how to map back
 *   <rect data-ams-op="background">                            background / clear
 *   <g data-ams-op="brush.bleed" data-ams-args='{…}'/>         ops SVG can't draw
 *   pixel-grid ops (pixel, hline, vline) keep their fields in data-ams-args;
 *   their geometry (x, y, width) is read back from the SVG.
 * Geometry and colors always come from the SVG itself, so edits in any SVG
 * editor carry over: moved/resized shapes, new colors, deleted or added shapes
 * (circle, ellipse, rect, line, polygon, polyline, simple M/L/Z paths).
 *
 * svgToProgram: the reverse; returns { program, warnings }. No DOM needed.
 */

const r4 = v => Math.round(v * 10000) / 10000;
const esc = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const GRID_OPS = new Set(['pixel', 'hline', 'vline']);
const PASS_OPS = new Set(['palette', 'mirrorX', 'mirrorY']);

function isGridProgram(p) {
  if (p.medium === 'pixel') return true;
  if (['flat', 'watercolor', 'ascii'].includes(p.medium)) return false;
  return (p.actions || []).some(a => GRID_OPS.has(a.op) || PASS_OPS.has(a.op));
}

/**
 * @param program  Core DSL program
 * @param opts     { width, height } for normalized programs (default 1024×1024);
 *                 { cols, rows } for pixel-grid programs (default 32×32)
 */
export function programToSvg(program, opts = {}) {
  const actions = program?.actions || [];
  const grid = isGridProgram(program);
  const out = [];

  if (grid) {
    const cols = opts.cols || program.cols || 32, rows = opts.rows || program.rows || 32;
    let palette = [];
    const col = c => (typeof c === 'number' ? palette[c] || '#000000' : c || '#000000');
    out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${cols * 16}" height="${rows * 16}" viewBox="0 0 ${cols} ${rows}" shape-rendering="crispEdges" data-ams-version="1" data-ams-coords="grid" data-ams-cols="${cols}" data-ams-rows="${rows}"${program.medium ? ` data-ams-medium="${esc(program.medium)}"` : ''}>`);
    for (const a of actions) {
      const extra = { ...a }; delete extra.op;
      if (a.op === 'palette') palette = a.colors || [];
      if (a.op === 'background' || a.op === 'clear') {
        out.push(`  <rect data-ams-op="${a.op}" x="0" y="0" width="${cols}" height="${rows}" fill="${esc(col(a.color ?? 0))}"/>`);
      } else if (a.op === 'pixel') {
        delete extra.x; delete extra.y;
        out.push(`  <rect data-ams-op="pixel" data-ams-args='${esc(JSON.stringify(extra))}' x="${a.x}" y="${a.y}" width="1" height="1" fill="${esc(col(a.color))}"/>`);
      } else if (a.op === 'hline') {
        const x0 = Math.min(a.x1, a.x2), x1 = Math.max(a.x1, a.x2);
        delete extra.x1; delete extra.x2; delete extra.y;
        out.push(`  <rect data-ams-op="hline" data-ams-args='${esc(JSON.stringify(extra))}' x="${x0}" y="${a.y}" width="${x1 - x0 + 1}" height="1" fill="${esc(col(a.color))}"/>`);
      } else if (a.op === 'vline') {
        const y0 = Math.min(a.y1, a.y2), y1 = Math.max(a.y1, a.y2);
        delete extra.y1; delete extra.y2; delete extra.x;
        out.push(`  <rect data-ams-op="vline" data-ams-args='${esc(JSON.stringify(extra))}' x="${a.x}" y="${y0}" width="1" height="${y1 - y0 + 1}" fill="${esc(col(a.color))}"/>`);
      } else {
        out.push(`  <g data-ams-op="${esc(a.op)}" data-ams-args='${esc(JSON.stringify(extra))}'/>`);
      }
    }
    out.push('</svg>');
    return out.join('\n');
  }

  const W = opts.width || 1024, H = opts.height || 1024;
  const sx = x => r4((x + 1) * 0.5 * W), sy = y => r4((y + 1) * 0.5 * H), ss = s => r4(s * 0.5 * Math.min(W, H));
  const strokeScale = W / 400;
  let fill = { on: true, color: '#333333', opacity: 1 };
  let stroke = { on: false, color: '#111111', width: 1, opacity: 1 };
  const fillAttr = (override) => (fill.on || override ? `fill="${esc(override || fill.color)}"${fill.opacity !== 1 ? ` fill-opacity="${fill.opacity}"` : ''}` : 'fill="none"');
  const strokeAttr = (force, color) => (stroke.on || force
    ? `stroke="${esc(color || stroke.color)}" stroke-width="${r4(stroke.width * strokeScale)}"${stroke.opacity !== 1 ? ` stroke-opacity="${stroke.opacity}"` : ''} stroke-linecap="round" stroke-linejoin="round"`
    : 'stroke="none"');
  const pts = p => p.map(q => `${sx(q[0])},${sy(q[1])}`).join(' ');

  const note = a => (a.note ? ` data-ams-note="${esc(a.note)}"` : '');
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" data-ams-version="1" data-ams-coords="normalized" data-ams-stroke-scale="${r4(strokeScale)}"${program.medium ? ` data-ams-medium="${esc(program.medium)}"` : ''}>`);
  for (const a of actions) {
    switch (a.op) {
      case 'background': case 'clear':
        out.push(`  <rect data-ams-op="${a.op}" x="0" y="0" width="${W}" height="${H}" fill="${esc(a.color || '#ffffff')}"/>`); break;
      case 'fill': fill = { on: true, color: a.color || '#000000', opacity: a.opacity ?? fill.opacity }; break;
      case 'noFill': fill = { ...fill, on: false }; break;
      case 'stroke': stroke = { on: true, color: a.color || '#000000', width: a.width ?? stroke.width, opacity: a.opacity ?? stroke.opacity }; break;
      case 'noStroke': stroke = { ...stroke, on: false }; break;
      case 'strokeWidth': stroke = { ...stroke, width: a.width ?? 1 }; break;
      case 'circle':
        out.push(`  <circle cx="${sx(a.x)}" cy="${sy(a.y)}" r="${ss(a.diameter / 2)}" ${fillAttr()} ${strokeAttr()}${note(a)}/>`); break;
      case 'rect': {
        const w = ss(a.width), h = ss(a.height);
        out.push(`  <rect x="${r4(sx(a.x) - w / 2)}" y="${r4(sy(a.y) - h / 2)}" width="${w}" height="${h}" ${fillAttr(a.color)} ${strokeAttr()}${a.color ? ' data-ams-color="own"' : ''}${note(a)}/>`);
        break;
      }
      case 'line':
        out.push(`  <line x1="${sx(a.x1)}" y1="${sy(a.y1)}" x2="${sx(a.x2)}" y2="${sy(a.y2)}" ${strokeAttr(true, a.color)}${a.color ? ' data-ams-color="own"' : ''}${note(a)}/>`); break;
      case 'polygon':
        if (a.points?.length >= 2) out.push(`  <polygon points="${pts(a.points)}" ${fillAttr()} ${strokeAttr()}${note(a)}/>`); break;
      case 'polyline':
        if (a.points?.length >= 2) out.push(`  <polyline points="${pts(a.points)}" fill="none" ${strokeAttr(true, a.color)}${a.color ? ' data-ams-color="own"' : ''}${note(a)}/>`); break;
      default: {
        const extra = { ...a }; delete extra.op;
        out.push(`  <g data-ams-op="${esc(a.op)}" data-ams-args='${esc(JSON.stringify(extra))}'/>`);
      }
    }
  }
  out.push('</svg>');
  return out.join('\n');
}

// ---- parsing -----------------------------------------------------------------

const unesc = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

/** Opening tags in document order: [{ tag, attrs }]. Enough for SVG from editors. */
function tags(svg) {
  const text = svg.replace(/<!--[\s\S]*?-->/g, '').replace(/<\?[\s\S]*?\?>/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const out = [];
  const tagRe = /<([a-zA-Z][\w:.-]*)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*\/?>/g;
  const attrRe = /([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = tagRe.exec(text))) {
    const attrs = {};
    let a;
    while ((a = attrRe.exec(m[2]))) attrs[a[1]] = unesc(a[2] ?? a[3]);
    if (attrs.style) {
      for (const decl of attrs.style.split(';')) {
        const i = decl.indexOf(':');
        if (i > 0) { const k = decl.slice(0, i).trim(); if (!(k in attrs)) attrs[k] = decl.slice(i + 1).trim(); }
      }
    }
    out.push({ tag: m[1].replace(/^svg:/, '').toLowerCase(), attrs });
  }
  return out;
}

const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const pointList = s => { const n = String(s || '').trim().split(/[\s,]+/).map(Number).filter(Number.isFinite); const p = []; for (let i = 0; i + 1 < n.length; i += 2) p.push([n[i], n[i + 1]]); return p; };

/** Absolute or relative M/L/H/V/Z paths → points (curves are flattened to their end points). */
function pathPoints(d) {
  const toks = String(d || '').match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
  const pts = [];
  let cmd = 'M', x = 0, y = 0, closed = false, curved = false, i = 0;
  const n = () => parseFloat(toks[i++]);
  while (i < toks.length) {
    if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    if (C === 'Z') { closed = true; continue; }
    if (C === 'M' || C === 'L' || C === 'T') { const a = n(), b = n(); x = rel ? x + a : a; y = rel ? y + b : b; if (C === 'M') cmd = rel ? 'l' : 'L'; }
    else if (C === 'H') { const a = n(); x = rel ? x + a : a; }
    else if (C === 'V') { const b = n(); y = rel ? y + b : b; }
    else if (C === 'C') { i += 4; const a = n(), b = n(); x = rel ? x + a : a; y = rel ? y + b : b; curved = true; }
    else if (C === 'S' || C === 'Q') { i += 2; const a = n(), b = n(); x = rel ? x + a : a; y = rel ? y + b : b; curved = true; }
    else if (C === 'A') { i += 5; const a = n(), b = n(); x = rel ? x + a : a; y = rel ? y + b : b; curved = true; }
    else { i++; continue; }
    if (Number.isFinite(x) && Number.isFinite(y)) pts.push([x, y]);
  }
  return { pts, closed, curved };
}

function opacity(v) { const o = num(v, 1); return Math.max(0, Math.min(1, o)); }

export function svgToProgram(svg) {
  const warnings = [];
  const list = tags(svg);
  const root = list.find(t => t.tag === 'svg');
  if (!root) return { program: { version: 1, actions: [] }, warnings: ['No <svg> element found'] };
  const vb = (root.attrs.viewBox || root.attrs.viewbox || '').split(/[\s,]+/).map(Number);
  const W = vb.length === 4 && vb[2] > 0 ? vb[2] : num(root.attrs.width, 1024);
  const H = vb.length === 4 && vb[3] > 0 ? vb[3] : num(root.attrs.height, 1024);
  const ox = vb.length === 4 ? vb[0] || 0 : 0, oy = vb.length === 4 ? vb[1] || 0 : 0;
  const program = { version: 1, actions: [] };
  if (root.attrs['data-ams-medium']) program.medium = root.attrs['data-ams-medium'];
  const push = a => program.actions.push(a);
  const args = t => { try { return JSON.parse(t.attrs['data-ams-args'] || '{}'); } catch { warnings.push(`Bad data-ams-args on ${t.attrs['data-ams-op']}`); return {}; } };
  if (!root.attrs['data-ams-version']) warnings.push('Not an AMS export: shapes are converted, but brush and grid settings are unknown.');
  if (list.some(t => t.attrs.transform)) warnings.push('Transforms are ignored; flatten them in your editor before importing.');

  if (root.attrs['data-ams-coords'] === 'grid') {
    for (const t of list) {
      const op = t.attrs['data-ams-op'];
      if (!op) continue;
      const x = Math.round(num(t.attrs.x)), y = Math.round(num(t.attrs.y));
      if (op === 'background' || op === 'clear') push({ op, color: t.attrs.fill });
      else if (op === 'pixel') push({ op, x, y, ...args(t) });
      else if (op === 'hline') push({ op, y, x1: x, x2: x + Math.round(num(t.attrs.width, 1)) - 1, ...args(t) });
      else if (op === 'vline') push({ op, x, y1: y, y2: y + Math.round(num(t.attrs.height, 1)) - 1, ...args(t) });
      else push({ op, ...args(t) });
    }
    return { program, warnings };
  }

  const nx = px => r4(((px - ox) / W) * 2 - 1), ny = py => r4(((py - oy) / H) * 2 - 1), ns = s => r4(s / (0.5 * Math.min(W, H)));
  const strokeScale = num(root.attrs['data-ams-stroke-scale'], W / 400);
  let fill = null, stroke = null; // last emitted state, as JSON strings
  const setFill = (t) => {
    const f = t.attrs.fill;
    const next = !f || f === 'none' || f === 'transparent' ? JSON.stringify({ op: 'noFill' })
      : JSON.stringify({ op: 'fill', color: f, opacity: r4(opacity(t.attrs['fill-opacity']) * opacity(t.attrs.opacity)) });
    if (next !== fill) { push(JSON.parse(next)); fill = next; }
  };
  const setStroke = (t, force) => {
    const s = t.attrs.stroke;
    const next = !s || s === 'none' ? (force ? null : JSON.stringify({ op: 'noStroke' }))
      : JSON.stringify({ op: 'stroke', color: s, width: r4(num(t.attrs['stroke-width'], 1) / strokeScale), opacity: r4(opacity(t.attrs['stroke-opacity']) * opacity(t.attrs.opacity)) });
    if (next && next !== stroke) { push(JSON.parse(next)); stroke = next; }
  };

  for (const t of list) {
    const op = t.attrs['data-ams-op'];
    const A = t.attrs;
    const n0 = program.actions.length;
    const withNote = () => { if (A['data-ams-note'] && program.actions.length > n0) program.actions[program.actions.length - 1].note = A['data-ams-note']; };
    if (op === 'background' || op === 'clear') { push({ op, color: A.fill || '#ffffff' }); continue; }
    if (op) { push({ op, ...args(t) }); continue; }
    switch (t.tag) {
      case 'circle':
        setFill(t); setStroke(t);
        push({ op: 'circle', x: nx(num(A.cx)), y: ny(num(A.cy)), diameter: ns(num(A.r) * 2) });
        break;
      case 'ellipse':
        setFill(t); setStroke(t);
        if (Math.abs(num(A.rx) - num(A.ry)) > 0.5) warnings.push('Ellipse drawn as a circle (the DSL has no ellipse)');
        push({ op: 'circle', x: nx(num(A.cx)), y: ny(num(A.cy)), diameter: ns(num(A.rx) + num(A.ry)) });
        break;
      case 'rect': {
        const w = num(A.width), h = num(A.height);
        if (A.rx || A.ry) warnings.push('Rounded rect corners dropped');
        setFill(t); setStroke(t);
        push({ op: 'rect', x: nx(num(A.x) + w / 2), y: ny(num(A.y) + h / 2), width: ns(w), height: ns(h) });
        break;
      }
      case 'line':
        setStroke(t, true);
        push({ op: 'line', x1: nx(num(A.x1)), y1: ny(num(A.y1)), x2: nx(num(A.x2)), y2: ny(num(A.y2)) });
        break;
      case 'polygon': case 'polyline': {
        const p = pointList(A.points).map(([x, y]) => [nx(x), ny(y)]);
        if (p.length < 2) break;
        if (t.tag === 'polygon') { setFill(t); setStroke(t); push({ op: 'polygon', points: p }); }
        else { setStroke(t, true); push({ op: 'polyline', points: p }); }
        break;
      }
      case 'path': {
        const { pts, closed, curved } = pathPoints(A.d);
        if (curved) warnings.push('Path curves flattened to straight segments');
        const p = pts.map(([x, y]) => [nx(x), ny(y)]);
        if (p.length < 2) break;
        const filled = A.fill && A.fill !== 'none';
        if (closed || filled) { setFill(t); setStroke(t); push({ op: 'polygon', points: p }); }
        else { setStroke(t, true); push({ op: 'polyline', points: p }); }
        break;
      }
      case 'text': warnings.push('Text is not part of the DSL; skipped'); break;
      case 'image': warnings.push('Embedded images are not part of the DSL; skipped'); break;
      default: break;
    }
    withNote();
  }
  return { program, warnings };
}
