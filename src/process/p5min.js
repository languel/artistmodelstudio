/**
 * A drawing (a board, or a selection) as a minimal p5.js 2.x sketch: plain p5 calls, no studio runtime,
 * for teaching. Lines are beginShape() with splineVertex (smooth paths) or vertex (straight), planes are
 * filled shapes, points are circles, notes are text. Brush textures (hatching, stipple, restated
 * passes…) are not reproduced: each mark says which brush it had, in a comment.
 */
import { rdp } from './sculpt.js';

const r1 = v => Math.round(v * 10) / 10;
const DEFAULT_INK = '#1d1b19';

/** version: '2' (p5.js 2.x: splineVertex, the default) or '1' (p5.js 1.x: curveVertex). */
export function toP5Min(doc, { title = doc.title || 'drawing', version = '2' } = {}) {
  const v1 = String(version) === '1';
  const { width, height, ground } = doc.artboard;
  const rank = new Map(doc.stages.map((s, i) => [s.id, i]));
  const marks = doc.elements
    .filter(e => !e.hidden && e.points?.length && !['guide', 'gesture', 'image'].includes(e.role) && e.realize?.brush !== 'guide')
    .map((e, i) => [e, i]).sort((a, b) => (rank.get(a[0].stage) ?? 0) - (rank.get(b[0].stage) ?? 0) || a[1] - b[1]).map(([e]) => e);

  // Each mark as plain data first; then short runs are written as calls, long runs of the same
  // kind as one array and a loop (a list of objects reads better than hundreds of vertex() calls).
  const items = marks.map(e => {
    const brush = e.realize?.brush || 'ink', p = e.realize?.params || {};
    const color = e.color && e.color !== 'none' ? e.color : DEFAULT_INK;
    const w = r1(Number(p.width ?? p.size ?? 3));
    const comment = `${e.label || e.role}${brush !== 'ink' && brush !== 'pen' && brush !== 'dot' && brush !== 'flat' ? ` (drawn with the ${brush} brush)` : ''}${e.why ? `: ${e.why}` : ''}`;
    if (e.role === 'point') return { kind: 'dot', comment, fill: color, size: w, pts: e.points.map(([x, y]) => [r1(x), r1(y)]) };
    if (e.role === 'note') return { kind: 'note', comment, fill: color, size: r1(Number(e.note?.size ?? 18)), text: String(e.text || ''), pts: [[r1(e.points[0][0]), r1(e.points[0][1])]] };
    const plane = e.role === 'plane', closed = Boolean(plane || e.closed);
    const fill = plane ? (e.fill || (e.color === 'none' ? null : color)) : e.fill || null;
    const stroke = plane ? (e.fill && e.color && e.color !== 'none' ? e.color : null) : e.color === 'none' ? null : color;
    // Hand-drawn marks carry many points: keep only those that shape the line (within 1 unit).
    const kept = e.points.length > 12 ? rdp(e.points, 1) : e.points;
    return { kind: plane ? 'plane' : 'line', comment, fill, stroke, weight: stroke ? (plane ? 2 : w) : 0, smooth: !(e.path === 'straight' || kept.length < 3), closed, pts: kept.map(([x, y]) => [r1(x), r1(y)]) };
  });

  const out = [], data = [], helpers = new Set();
  let st = {};
  // Only the state that changes is written (fewer lines to read).
  const set = (key, call) => { if (st[key] !== call) { st[key] = call; return call; } return null; };
  const say = (...lines) => { for (const l of lines) if (l) out.push(`  ${l};`); };
  const style = it => {
    if (it.kind === 'line' || it.kind === 'plane') {
      say(it.fill ? set('fill', `fill('${it.fill}')`) : set('fill', 'noFill()'));
      say(it.stroke ? set('stroke', `stroke('${it.stroke}')`) : set('stroke', 'noStroke()'));
      if (it.stroke) say(set('weight', `strokeWeight(${it.weight})`));
    } else say(set('stroke', 'noStroke()'), set('fill', `fill('${it.fill}')`), it.kind === 'note' ? set('size', `textSize(${it.size})`) : null);
  };
  const vertexCalls = it => {
    const pts = it.pts.map(([x, y]) => `${x}, ${y}`);
    say('beginShape()');
    if (!it.smooth) for (const v of pts) say(`vertex(${v})`);
    else if (!v1) for (const v of pts) say(`splineVertex(${v})`);   // p5 2.x: through every point, ends included
    else {
      // p5 1.x: curveVertex needs a control point before the first and after the last (closed: wrap around).
      const seq = it.closed ? [pts.at(-1), ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts.at(-1)];
      for (const v of seq) say(`curveVertex(${v})`);
    }
    say(it.closed && (!it.smooth || !v1) ? 'endShape(CLOSE)' : 'endShape()');
  };

  // Runs: consecutive marks of one kind. Long ones (or many points) become data.
  const runs = [];
  for (const it of items) { const last = runs.at(-1); if (last && last.kind === it.kind) last.items.push(it); else runs.push({ kind: it.kind, items: [it] }); }
  const counts = {};
  for (const run of runs) {
    const n = run.items.length, pointsIn = run.items.reduce((a, it) => a + it.pts.length, 0);
    const asData = run.kind !== 'note' && (n >= 5 || pointsIn > 40);
    if (!asData) {
      for (const it of run.items) {
        out.push('', `  // ${it.comment}`);
        style(it);
        if (it.kind === 'dot') for (const [x, y] of it.pts) say(`circle(${x}, ${y}, ${it.size})`);
        else if (it.kind === 'note') say(`text(${JSON.stringify(it.text)}, ${it.pts[0][0]}, ${it.pts[0][1]})`);
        else vertexCalls(it);
      }
      continue;
    }
    // Fields that are the same for the whole run are set once; the rest go with each mark.
    const same = k => run.items.every(it => JSON.stringify(it[k]) === JSON.stringify(run.items[0][k]));
    const name = { dot: 'dots', line: 'lines', plane: 'planes' }[run.kind];
    counts[name] = (counts[name] || 0) + 1;
    const id = counts[name] > 1 ? `${name}${counts[name]}` : name;
    const why = [...new Set(run.items.map(it => it.comment))];
    const noun = { dot: 'points', line: 'lines', plane: 'planes' }[run.kind];
    out.push('', `  // ${n} ${noun}${why.length === 1 && !['point', 'line', 'plane'].includes(why[0]) ? `: ${why[0]}` : ''} (the list ${id}, above)`);
    if (run.kind === 'dot') {
      const flat = run.items.flatMap(it => it.pts.map(([x, y]) => ({ x, y, size: it.size, fill: it.fill })));
      const keys = ['size', 'fill'].filter(k => !flat.every(d => d[k] === flat[0][k]));
      data.push(`// ${flat.length} points: x, y${keys.length ? `, ${keys.map(k => (k === 'size' ? 'size' : 'color')).join(', ')}` : ''}`, `const ${id} = [\n${chunk(flat.map(d => `[${[d.x, d.y, ...keys.map(k => k === 'fill' ? `'${d.fill}'` : d[k])].join(', ')}]`))}\n];`, '');
      say(set('stroke', 'noStroke()'));
      if (!keys.includes('fill')) say(set('fill', `fill('${flat[0].fill}')`));
      // (named d and c in the loop: size and fill are also p5 functions)
      const args = ['x', 'y', ...keys.map(k => (k === 'size' ? 'd' : 'c'))].join(', ');
      out.push(`  for (const [${args}] of ${id}) {`);
      if (keys.includes('fill')) out.push('    fill(c);');
      out.push(`    circle(x, y, ${keys.includes('size') ? 'd' : flat[0].size});`, '  }');
      if (keys.includes('fill')) delete st.fill;
      continue;
    }
    const vary = ['fill', 'stroke', 'weight', 'smooth', 'closed'].filter(k => !same(k));
    const fixed = run.items[0];
    const ptsText = it => JSON.stringify(it.pts).replace(/,/g, ', ');
    // Only the points differ: a list of point lists. Otherwise one object per mark.
    if (!vary.length) data.push(`// ${n} ${{ line: 'lines', plane: 'planes' }[run.kind]}, each a list of points`, `const ${id} = [\n${run.items.map(it => `  ${ptsText(it)}`).join(',\n')}\n];`, '');
    else data.push(`// ${n} ${{ line: 'lines', plane: 'planes' }[run.kind]}: ${[...vary, 'pts'].join(', ')}`, `const ${id} = [\n${run.items.map(it => `  { ${[...vary.map(k => `${k}: ${typeof it[k] === 'string' ? `'${it[k]}'` : JSON.stringify(it[k])}`), `pts: ${ptsText(it)}`].join(', ')} }`).join(',\n')}\n];`, '');
    if (!vary.includes('fill')) say(fixed.fill ? set('fill', `fill('${fixed.fill}')`) : set('fill', 'noFill()'));
    if (!vary.includes('stroke')) say(fixed.stroke ? set('stroke', `stroke('${fixed.stroke}')`) : set('stroke', 'noStroke()'));
    if (!vary.includes('weight') && fixed.stroke) say(set('weight', `strokeWeight(${fixed.weight})`));
    out.push(vary.length ? `  for (const m of ${id}) {` : `  for (const pts of ${id}) {`);
    if (vary.includes('fill')) out.push("    if (m.fill) fill(m.fill); else noFill();");
    if (vary.includes('stroke')) out.push("    if (m.stroke) stroke(m.stroke); else noStroke();");
    if (vary.includes('weight')) out.push('    strokeWeight(m.weight);');
    for (const k of vary) if (['fill', 'stroke', 'weight'].includes(k)) delete st[k];
    const sm = vary.includes('smooth') ? 'm.smooth' : String(fixed.smooth), cl = vary.includes('closed') ? 'm.closed' : String(fixed.closed);
    out.push(`    shape(${vary.length ? 'm.pts' : 'pts'}, ${sm}, ${cl});`, '  }');
    helpers.add('shape');
  }

  const shapeHelper = v1
    ? `// A list of points as one shape: smooth (curveVertex, with an extra point at each end) or straight.
function shape(pts, smooth, closed) {
  beginShape();
  if (!smooth) for (const [x, y] of pts) vertex(x, y);
  else {
    const seq = closed ? [pts.at(-1), ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts.at(-1)];
    for (const [x, y] of seq) curveVertex(x, y);
  }
  if (closed && !smooth) endShape(CLOSE); else endShape();
}`
    : `// A list of points as one shape: smooth (a spline through every point) or straight.
function shape(pts, smooth, closed) {
  beginShape();
  for (const [x, y] of pts) {
    if (smooth) splineVertex(x, y);
    else vertex(x, y);
  }
  if (closed) endShape(CLOSE); else endShape();
}`;

  return `// ${title}: drawn in Artist Model Studio
// ${marks.length} mark${marks.length === 1 ? '' : 's'}, as plain p5.js ${v1 ? '1.x' : '2.x'} calls.
${data.length ? `\n${data.join('\n')}` : ''}
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
${helpers.has('shape') ? `\n${shapeHelper}\n` : ''}`;
}

/** Items of a long list, a few to a line. */
function chunk(items, per = 6) {
  const lines = [];
  for (let i = 0; i < items.length; i += per) lines.push(`  ${items.slice(i, i + per).join(', ')}`);
  return lines.join(',\n');
}
