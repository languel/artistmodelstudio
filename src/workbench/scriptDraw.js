// The blackboard of a script: lines, arcs, dots, labels and formulas drawn over a board, one after another, in the way a
// diagram is built in a video (strokes draw themselves on, labels and formulas fade in). One function, nothing outside it: the studio
// imports it and an exported page embeds this file as text, so the same drawing is on both.
//
//   scriptDraw(host, { layer?, space?: { frame }, step?, dur?, shapes: [shape…] }, { html?, pace?, fast? }) → Promise (when the last has appeared)
//   scriptDraw(host, { clear: true | layer })                                                               remove them
//
//   space.frame: points are in the units of an orthographic camera that sees `frame` units top to bottom (y up), as for a drag;
//                without it a point is [fraction of the width, fraction of the height].
//   shape: { t: 'dot', p, color } · { t: 'line', a, b, color, w, dash, arrow } · { t: 'arc', c, r, from, to, color, w, arrow } (degrees,
//          counter-clockwise from the right) · { t: 'label', p, tex | text, color, dx, dy } · { t: 'formula', at: [fx, fy], align, tex }
//   `html(tex)` turns TeX into HTML (the studio's KaTeX; an exported page has them made already).
function scriptDraw(host, spec, opts = {}) {
  let over = host.querySelector(':scope > .sc-over');
  if (spec.clear) {
    if (over) for (const el of [...over.children]) if (spec.clear === true || el.dataset.layer === spec.clear) el.remove();
    return Promise.resolve();
  }
  if (!over) { over = document.createElement('div'); over.className = 'sc-over'; host.append(over); }
  const NS = 'http://www.w3.org/2000/svg';
  const W = host.offsetWidth || 1, H = host.offsetHeight || 1, aspect = W / H;
  const frac = ([x, y]) => (spec.space && spec.space.frame ? [0.5 + x / (spec.space.frame * aspect), 0.5 - y / spec.space.frame] : [x, y]);
  const px = p => { const [fx, fy] = frac(p); return [fx * W, fy * H]; };
  const COLORS = { amber: '#c97a00', blue: '#1f6fd1', green: '#1f9d55', red: '#d6362f', ink: '#1f1f1f', white: '#ffffff' };
  const color = c => COLORS[c] || c || COLORS.amber;
  const fast = Boolean(opts.fast), k = fast ? 0 : opts.pace ?? 1;
  const step = (spec.step ?? 500) * k, dur = (spec.dur ?? 700) * k;
  const layer = document.createElement('div');
  layer.className = 'sc-layer'; layer.dataset.layer = spec.layer || 'draw';
  layer.style.cssText = 'position:absolute;inset:0';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible';
  layer.append(svg); over.append(layer);
  const label = (html, x, y, css) => { const d = document.createElement('div'); d.className = 'sc-label'; d.innerHTML = html; Object.assign(d.style, { left: `${x}px`, top: `${y}px`, ...css }); layer.append(d); return d; };
  const tex = (s, t) => (t != null && opts.html ? opts.html(t) : String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])));
  const arrowHead = (a, b) => { const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), L = 14; return ` M${b[0] + L * Math.cos(ang + 2.7)} ${b[1] + L * Math.sin(ang + 2.7)} L${b[0]} ${b[1]} L${b[0] + L * Math.cos(ang - 2.7)} ${b[1] + L * Math.sin(ang - 2.7)}`; };
  let delay = 0;
  const reveal = (el, how) => {
    if (how === 'draw') {
      el.setAttribute('pathLength', '1'); Object.assign(el.style, { strokeDasharray: '1', strokeDashoffset: '1', transition: `stroke-dashoffset ${dur}ms ease-in-out ${delay}ms` });
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.strokeDashoffset = '0'; }));
    } else {
      el.style.opacity = '0'; el.style.transition = `opacity ${dur * 0.6}ms ease ${delay}ms`;
      requestAnimationFrame(() => requestAnimationFrame(() => { el.style.opacity = '1'; }));
    }
  };
  for (const s of spec.shapes || []) {
    const c = color(s.color);
    if (s.t === 'dot') {
      const [x, y] = px(s.p), d = document.createElementNS(NS, 'circle');
      d.setAttribute('cx', x); d.setAttribute('cy', y); d.setAttribute('r', s.r || 6); d.setAttribute('fill', c); d.setAttribute('stroke', '#fff'); d.setAttribute('stroke-width', 2);
      svg.append(d); reveal(d, 'fade');
    } else if (s.t === 'line' || s.t === 'arc') {
      let pts;
      if (s.t === 'line') pts = [px(s.a), px(s.b)];
      else { const n = 48; pts = Array.from({ length: n + 1 }, (_, i) => { const a = ((s.from + ((s.to - s.from) * i) / n) * Math.PI) / 180; return px([s.c[0] + s.r * Math.cos(a), s.c[1] + s.r * Math.sin(a)]); }); }
      const p = document.createElementNS(NS, 'path');
      p.setAttribute('d', `M${pts.map(q => `${q[0]} ${q[1]}`).join(' L')}${s.arrow ? arrowHead(pts[pts.length - 2], pts[pts.length - 1]) : ''}`);
      p.setAttribute('fill', 'none'); p.setAttribute('stroke', c); p.setAttribute('stroke-width', s.w || 3); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
      svg.append(p);
      if (s.dash) { p.setAttribute('stroke-dasharray', '7 7'); reveal(p, 'fade'); } else reveal(p, 'draw');
    } else if (s.t === 'label') {
      const [x, y] = px(s.p), d = label(tex(s.text, s.tex), x + (s.dx || 0), y + (s.dy || 0), { color: c, fontSize: `${s.size || 22}px` });
      d.classList.add('sc-tag'); reveal(d, 'fade');
    } else if (s.t === 'formula') {
      const d = label(tex(s.text, s.tex), (s.at ? s.at[0] : 0.5) * W, (s.at ? s.at[1] : 0.1) * H, { fontSize: `${s.size || 24}px`, transform: `translate(${s.align === 'right' ? '-100%' : s.align === 'center' ? '-50%' : '0'}, 0)` });
      d.classList.add('sc-formula'); reveal(d, 'fade');
    }
    delay += step;
  }
  return new Promise(res => setTimeout(res, Math.max(0, delay - step + dur)));
}
export { scriptDraw };
