/**
 * Distillation format: the exact prompt and program text used to train small
 * models on Reference Fitter outputs, and to run them afterwards. Keep training
 * data generation and inference on this one module so they cannot drift.
 *
 * Program text is a strict subset of the AMS text DSL:
 *   background #rrggbb
 *   fill #rrggbb
 *   rect x y w h          (center, size; canvas spans -1..1)
 *   circle x y d
 *   polygon x1,y1 x2,y2 x3,y3
 */

export const DISTILL_SYSTEM = [
  'You paint pictures with code. Reply with drawing commands only, one per line:',
  'background #rrggbb',
  'fill #rrggbb',
  'rect x y w h',
  'circle x y d',
  'polygon x1,y1 x2,y2 x3,y3',
  'The canvas runs from -1 to 1 on both axes (y grows downward). rect and circle take a center point; w, h and d are sizes on the same scale.',
  'Start with background, then put a fill before every shape. Paint large shapes first and details last.'
].join('\n');

export function distillUserPrompt({ description, shapes }) {
  return `${description.trim()}\nShapes: ${shapes}`;
}

const num = v => {
  const s = (Math.round(v * 100) / 100).toFixed(2).replace(/\.?0+$/, '');
  return s === '-0' ? '0' : s;
};

/** Core DSL program -> distillation text (2-decimal coordinates). */
export function programToDistillText(program) {
  const lines = [];
  for (const a of program.actions || []) {
    if (a.op === 'background') lines.push(`background ${a.color}`);
    else if (a.op === 'fill') lines.push(`fill ${a.color}`);
    else if (a.op === 'rect') lines.push(`rect ${num(a.x)} ${num(a.y)} ${num(a.width)} ${num(a.height)}`);
    else if (a.op === 'circle') lines.push(`circle ${num(a.x)} ${num(a.y)} ${num(a.diameter)}`);
    else if (a.op === 'polygon') lines.push(`polygon ${a.points.map(([x, y]) => `${num(x)},${num(y)}`).join(' ')}`);
  }
  return lines.join('\n');
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const isNum = s => /^-?\d*\.?\d+$/.test(s);

/**
 * Strictly parse model output. Invalid lines are skipped and counted rather
 * than guessed at, so validity can be measured.
 * @returns {{ program: Object, stats: { lines: number, valid: number, invalid: number, shapes: number, outOfRange: number, invalidExamples: string[] } }}
 */
export function parseDistillText(text) {
  const actions = [];
  const stats = { lines: 0, valid: 0, invalid: 0, shapes: 0, outOfRange: 0, invalidExamples: [] };
  let sawBackground = false;
  const bad = line => {
    stats.invalid++;
    if (stats.invalidExamples.length < 5) stats.invalidExamples.push(line.slice(0, 80));
  };
  const inRange = vals => {
    if (vals.some(v => Math.abs(v) > 2)) stats.outOfRange++;
  };

  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    stats.lines++;
    const t = line.split(/\s+/);
    const op = t[0];
    if (op === 'background' && t.length === 2 && HEX.test(t[1])) {
      actions.push({ op: 'background', color: t[1] }, { op: 'noStroke' });
      sawBackground = true;
    } else if (op === 'fill' && t.length === 2 && HEX.test(t[1])) {
      actions.push({ op: 'fill', color: t[1], opacity: 1 });
    } else if (op === 'rect' && t.length === 5 && t.slice(1).every(isNum)) {
      const [x, y, w, h] = t.slice(1).map(Number);
      inRange([x, y, w, h]);
      actions.push({ op: 'rect', x, y, width: w, height: h });
      stats.shapes++;
    } else if (op === 'circle' && t.length === 4 && t.slice(1).every(isNum)) {
      const [x, y, d] = t.slice(1).map(Number);
      inRange([x, y, d]);
      actions.push({ op: 'circle', x, y, diameter: d });
      stats.shapes++;
    } else if (op === 'polygon' && t.length >= 4 && t.slice(1).every(p => /^-?\d*\.?\d+,-?\d*\.?\d+$/.test(p))) {
      const points = t.slice(1).map(p => p.split(',').map(Number));
      inRange(points.flat());
      actions.push({ op: 'polygon', points });
      stats.shapes++;
    } else {
      bad(line);
      continue;
    }
    stats.valid++;
  }
  if (!sawBackground) actions.unshift({ op: 'noStroke' });
  return { program: { version: 1, actions }, stats };
}
