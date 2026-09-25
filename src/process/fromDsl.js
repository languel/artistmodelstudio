/**
 * Convert a Core DSL program (the first-phase drawing language: normalized -1..1
 * coordinates, fill/stroke state, circle/rect/line/polygon/polyline) into a process
 * document, so earlier generations and assets open in the workbench.
 * Part-label comments become stages; notes become reasons.
 */
import { createDocument, newId, normalizeDocument } from './document.js';
import { normalizeProgram } from '../language/normalize.js';

export function dslToProcess(program, { width = 1000, height = 1000, title = 'Converted drawing' } = {}) {
  const prog = normalizeProgram(program);
  const doc = createDocument({ width, height, title });
  doc.stages = [];
  const X = x => (x + 1) * 0.5 * width, Y = y => (y + 1) * 0.5 * height, S = s => s * 0.5 * Math.min(width, height);
  let stage = null;
  const useStage = name => {
    let s = doc.stages.find(x => x.name === name);
    if (!s) { s = { id: newId('stage'), name, kind: 'marks', visible: true, locked: false }; doc.stages.push(s); }
    stage = s;
  };
  let fill = { on: true, color: '#333333', opacity: 1 }, stroke = { on: false, color: '#111111', width: 1, opacity: 1 };
  const circlePts = (cx, cy, r) => Array.from({ length: 40 }, (_, i) => [cx + Math.cos(i / 40 * Math.PI * 2) * r, cy + Math.sin(i / 40 * Math.PI * 2) * r]);
  const add = (role, points, extra) => {
    if (!stage) useStage('Marks');
    doc.elements.push({ id: newId(role), stage: stage.id, role, points: points.map(([x, y], i) => [x, y, i * 16, 0.5]), by: { kind: 'model', name: 'converted' }, ...extra });
  };
  const plane = (points, a) => {
    if (fill.on || a.color) add('plane', points, { color: a.color || fill.color, realize: { brush: 'flat', params: { opacity: fill.opacity } }, why: a.note || '' });
    if (stroke.on) add('line', [...points, points[0]], { color: stroke.color, realize: { brush: 'ink', params: { width: stroke.width * width / 400, pressure: 0, taper: 0, opacity: stroke.opacity } }, why: a.note || '' });
  };
  for (const a of prog.actions) {
    switch (a.op) {
      case 'comment': useStage(a.text || 'Part'); break;
      case 'background': case 'clear': doc.artboard.ground = typeof a.color === 'string' ? a.color : doc.artboard.ground; break;
      case 'fill': fill = { on: true, color: a.color || '#000', opacity: a.opacity ?? fill.opacity }; break;
      case 'noFill': fill = { ...fill, on: false }; break;
      case 'stroke': stroke = { on: true, color: a.color || '#000', width: a.width ?? stroke.width, opacity: a.opacity ?? stroke.opacity }; break;
      case 'noStroke': stroke = { ...stroke, on: false }; break;
      case 'strokeWidth': stroke = { ...stroke, width: a.width ?? 1 }; break;
      case 'circle': plane(circlePts(X(a.x), Y(a.y), S(a.diameter) / 2), a); break;
      case 'rect': { const w = S(a.width), h = S(a.height), x = X(a.x) - w / 2, y = Y(a.y) - h / 2; plane([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], a); break; }
      case 'polygon': if (a.points?.length >= 3) plane(a.points.map(([x, y]) => [X(x), Y(y)]), a); break;
      case 'line': add('line', [[X(a.x1), Y(a.y1)], [X(a.x2), Y(a.y2)]], { color: a.color || stroke.color, realize: { brush: 'ink', params: { width: stroke.width * width / 400, pressure: 0, taper: 0 } }, why: a.note || '' }); break;
      case 'polyline': if (a.points?.length >= 2) add('line', a.points.map(([x, y]) => [X(x), Y(y)]), { color: a.color || stroke.color, realize: { brush: 'ink', params: { width: stroke.width * width / 400, pressure: 0, taper: 0 } }, why: a.note || '' }); break;
      default: break;
    }
  }
  if (!doc.stages.length) useStage('Marks');
  return normalizeDocument(doc);
}
