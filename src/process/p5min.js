/**
 * A drawing (a board, or a selection) as a minimal p5.js sketch: plain p5 calls, no studio runtime,
 * for teaching. Lines are beginShape() with curveVertex (smooth paths) or vertex (straight), planes are
 * filled shapes, points are circles, notes are text. Brush textures (hatching, stipple, restated
 * passes…) are not reproduced: each mark says which brush it had, in a comment.
 */
import { rdp } from './sculpt.js';

const r1 = v => Math.round(v * 10) / 10;
const DEFAULT_INK = '#1d1b19';

export function toP5Min(doc, { title = doc.title || 'drawing' } = {}) {
  const { width, height, ground } = doc.artboard;
  const rank = new Map(doc.stages.map((s, i) => [s.id, i]));
  const marks = doc.elements
    .filter(e => !e.hidden && e.points?.length && !['guide', 'gesture', 'image'].includes(e.role) && e.realize?.brush !== 'guide')
    .map((e, i) => [e, i]).sort((a, b) => (rank.get(a[0].stage) ?? 0) - (rank.get(b[0].stage) ?? 0) || a[1] - b[1]).map(([e]) => e);

  const out = [];
  let st = {};
  // Only the state that changes is written (fewer lines to read).
  const set = (key, call) => { if (st[key] !== call) { st[key] = call; return call; } return null; };
  const say = (...lines) => { for (const l of lines) if (l) out.push(`  ${l};`); };

  for (const e of marks) {
    const brush = e.realize?.brush || 'ink', p = e.realize?.params || {};
    const color = e.color && e.color !== 'none' ? e.color : DEFAULT_INK;
    const w = r1(Number(p.width ?? p.size ?? 3));
    out.push('');
    out.push(`  // ${e.label || e.role}${brush !== 'ink' && brush !== 'pen' && brush !== 'dot' && brush !== 'flat' ? ` (drawn with the ${brush} brush)` : ''}${e.why ? `: ${e.why}` : ''}`);
    if (e.role === 'point') {
      say(set('stroke', 'noStroke()'), set('fill', `fill('${color}')`));
      for (const [x, y] of e.points) say(`circle(${r1(x)}, ${r1(y)}, ${w})`);
      continue;
    }
    if (e.role === 'note') {
      say(set('stroke', 'noStroke()'), set('fill', `fill('${color}')`), set('size', `textSize(${r1(Number(e.note?.size ?? 18))})`));
      say(`text(${JSON.stringify(String(e.text || ''))}, ${r1(e.points[0][0])}, ${r1(e.points[0][1])})`);
      continue;
    }
    const plane = e.role === 'plane', closed = plane || e.closed;
    const fillColor = plane ? (e.fill || (e.color === 'none' ? null : color)) : e.fill || null;
    const outline = plane ? (e.fill && e.color && e.color !== 'none' ? e.color : null) : e.color === 'none' ? null : color;
    say(fillColor ? set('fill', `fill('${fillColor}')`) : set('fill', 'noFill()'));
    say(outline ? set('stroke', `stroke('${outline}')`) : set('stroke', 'noStroke()'));
    if (outline) say(set('weight', `strokeWeight(${plane ? 2 : w})`));
    // Hand-drawn marks carry many points: keep only those that shape the line (within 1 unit).
    const kept = e.points.length > 12 ? rdp(e.points, 1) : e.points;
    const pts = kept.map(([x, y]) => `${r1(x)}, ${r1(y)}`);
    const straight = e.path === 'straight' || kept.length < 3;
    say('beginShape()');
    if (straight) for (const v of pts) say(`vertex(${v})`);
    else {
      // curveVertex needs a control point before the first and after the last (closed: wrap around).
      const seq = closed ? [pts.at(-1), ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts.at(-1)];
      for (const v of seq) say(`curveVertex(${v})`);
    }
    say(closed && straight ? 'endShape(CLOSE)' : 'endShape()');
  }

  return `// ${title}: drawn in Artist Model Studio
// ${marks.length} mark${marks.length === 1 ? '' : 's'}, as plain p5 calls.

function setup() {
  createCanvas(${Math.round(width)}, ${Math.round(height)});
  noLoop();
}

function draw() {
  background('${ground && ground !== 'transparent' ? ground : '#ffffff'}');
  strokeCap(ROUND);
  strokeJoin(ROUND);
${out.join('\n')}
}
`;
}
