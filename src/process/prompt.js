/**
 * Asking a model for a score.
 *
 * Models write scores (JS in the point / line / plane vocabulary), not marks. The
 * prompt states the principles, the vocabulary, the brushes with their ranges, and
 * one worked example. Replies are parsed for a code block and run; on a script
 * error the model gets one chance to repair its score.
 */
import { SCRIPT_REFERENCE, runScript } from './script.js';
import { BRUSHES } from './brushes.js';
import { EXERCISES } from './exercises.js';

export const PRINCIPLES = `You are an artist learning to draw by process, in the Bauhaus tradition (Klee, Kandinsky) and the algorists (Mohr, Verostko).
Write a SCORE: a short JavaScript program in the vocabulary below. Running it records your process.
- Work in named stages, in order: analysis → concept → construction → structure → value → marks → notes (use the ones you need).
- Record real choices with decide(question, options, chosen, why).
- Give every mark a short reason (why). Keep construction (guide, gesture) separate from marks.
- Use loops, functions and walk() instead of listing coordinates; small rules make rich drawings.
- The brushes only realize your paths; composition, emphasis, order and value are your decisions.
- Coordinates are FRACTIONS of the artboard: x 0..1 across, y 0..1 down (width and height give its size in units). Call artboard(w, h, ground) first.
- Brushes are code. Use the built-ins, or define your own when a technique needs it: brush({ id, label, roles, doc, params: { key: [min, max, default, doc] }, draw(ctx, e, p, k) { … } }), then plane(pts, { brush: id }). In draw, e.points are [x, y, t, p] in artboard units and k is the kit (k.frames, k.spans, k.segment, k.beginInk … ctx.restore(), k.rng, k.noise).`;

const FRACTION_EXAMPLE = `artboard(800, 800, '#f2ede3')

// A technique as code: short strokes across a plane, like a dry brush
brush({
  id: 'drybrush', label: 'Dry brush', roles: ['plane'], doc: 'Short strokes inside a plane, leaving paper between them',
  params: { length: [2, 40, 12, 'Stroke length'], gap: [2, 20, 6, 'Distance between rows'] },
  draw(ctx, e, p, k) {
    k.beginInk(ctx, e, { width: 2, opacity: 0.8 })
    const ys = e.points.map(q => q[1])
    for (let y = Math.min(...ys); y < Math.max(...ys); y += p.gap) {
      const xs = k.spans(e.points, y)
      for (let i = 0; i + 1 < xs.length; i += 2) for (let x = xs[i]; x < xs[i + 1] - p.length; x += p.length * (1 + k.rng())) k.segment(ctx, x, y, x + p.length, y + (k.rng() - 0.5) * 3)
    }
    ctx.restore()
  }
})

stage('Analysis', 'analysis')
guide([[0.5, 0], [0.5, 1]], { why: 'the axis' })
const where = decide('Where does the weight sit?', ['high', 'low'], 'low', 'a low mass feels settled')

stage('Value', 'value')
plane(circle(0.5, where === 'low' ? 0.62 : 0.38, 0.22), { brush: 'drybrush', color: '#3f3a34', why: 'the one mass, dry-brushed' })

stage('Marks', 'marks')
point(0.72, 0.28, { size: 18, color: '#b83a22', why: 'a small warm accent against the mass' })`;

export function brushSummary() {
  return Object.entries(BRUSHES).filter(([id]) => id !== 'none').map(([id, b]) =>
    `${id} (${b.roles.join('/')}): ${b.doc} Params: ${b.params.map(p => `${p.key} ${p.min}–${p.max} (default ${p.default})`).join(', ') || 'none'}`).join('\n');
}

/** { system, user } for a drawing request. exercise: optional id whose brief frames the task. */
export function scorePrompt({ prompt, exercise = null, width = 1000, height = 1000, withImage = false }) {
  const ex = EXERCISES.find(e => e.id === exercise);
  const example = EXERCISES.find(e => e.id === 'medial-line');
  const system = `${PRINCIPLES}

VOCABULARY
${SCRIPT_REFERENCE}

BRUSHES
${brushSummary()}

EXAMPLE SCORE (fractions, a brush written as code)
\`\`\`js
${FRACTION_EXAMPLE}
\`\`\`

Reply with ONE score in a \`\`\`js code block. No other text is needed; reasons belong in why and note().`;
  const user = [
    ex ? `Exercise: ${ex.title}\n${ex.brief}` : null,
    `Draw: ${prompt}`,
    `Artboard: ${width} × ${height}.`,
    withImage ? 'A reference image is attached: study its composition, masses and rhythm, and let your stages show how you read it.' : null
  ].filter(Boolean).join('\n\n');
  return { system, user };
}

/** Pull a score out of a reply: the first js/javascript block, else any block, else the text. */
export function extractScore(text) {
  const t = String(text || '');
  const m = t.match(/```(?:js|javascript)\s*\n([\s\S]*?)```/i) || t.match(/```\s*\n([\s\S]*?)```/);
  return (m ? m[1] : t).trim();
}

/**
 * Ask an engine for a score and run it, repairing once on error.
 * complete: ({ system, user, image, temperature }) => Promise<text>
 * Returns { doc, source, error, attempts, raw }.
 */
export async function generateScore({ complete, prompt, exercise, width, height, image = null, temperature = 0.8, seed = 1, by, onStatus }) {
  const { system, user } = scorePrompt({ prompt, exercise, width, height, withImage: Boolean(image) });
  onStatus?.('asking');
  let raw = await complete({ system, user, image, temperature });
  let source = extractScore(raw);
  let res = runScript(source, { seed, by });
  let attempts = 1;
  if (res.error) {
    onStatus?.(`repairing: ${res.error}`);
    raw = await complete({ system, user: `${user}\n\nYour previous score:\n\`\`\`js\n${source}\n\`\`\`\nIt failed with: ${res.error}\nReply with the corrected score only.`, image, temperature: Math.max(0.2, temperature - 0.3) });
    source = extractScore(raw);
    res = runScript(source, { seed, by });
    attempts = 2;
  }
  if (res.doc) {
    res.doc.title = prompt.slice(0, 80);
    res.doc.meta = { ...res.doc.meta, prompt, exercise: exercise || null, engine: by };
  }
  return { doc: res.doc, source, error: res.error, attempts, raw, logs: res.logs };
}
