/**
 * Worked examples for a model that writes board code: the lessons' own boards (examples/lessons) are short programs, each with a
 * comment saying what it does, so for a request the two most alike are put in front of the model.
 *
 *   await examplesFor('a grid of dots colored from a painting', { k: 2, exclude: ['sampling/1'] }) → [{ id, title, code }]
 *
 * `exclude` leaves a board out (when measuring, the board being reproduced must not be handed back as its own example).
 */
const LESSONS = {
  sampling: () => import('../../examples/lessons/sampling/lesson.js'),
  diffusion: () => import('../../examples/lessons/diffusion/lesson.js'),
  threejs: () => import('../../examples/lessons/threejs/lesson.js')
};
let cache = null;

/** Every drawing-code board of every lesson: { id, lesson, title, code, text (what to match against) }. */
export async function library() {
  if (cache) return cache;
  const out = [];
  for (const [lesson, load] of Object.entries(LESSONS)) {
    let L; try { L = (await load()).LESSON; } catch { continue; }
    for (const sec of L?.sections || []) for (const b of sec.boards || []) {
      if (!b.code || b.p5 || b.three) continue;   // (the studio's own drawing language)
      const lines = b.code.split('\n');
      if (lines.length > 32 || lines.length < 3) continue;   // (short ones: they are read, not skimmed)
      const comments = lines.filter(l => /^\s*\/\//.test(l)).join(' ');
      out.push({ id: `${lesson}/${b.id ?? b.title}`, lesson, title: b.title, code: b.code.trim(), text: `${b.title} ${comments} ${[...b.code.matchAll(/\b[a-z]+\(/gi)].map(m => m[0]).join(' ')}` });
    }
  }
  return (cache = out);
}

const STOP = new Set('the a an and of to in on at for with from by is are as it its this that each every make draw put use using then than into over under how many much more less there their where which'.split(' '));
const SYN = { painting: 'source', picture: 'source', image: 'source', photo: 'source', sample: 'source', sampled: 'source', sampling: 'source', color: 'color', colour: 'color', colored: 'color', dots: 'point', dot: 'point', points: 'point', point: 'point', circles: 'circle', circle: 'circle', random: 'random', randomly: 'random', scatter: 'random', scattered: 'random', grid: 'grid', rows: 'grid', columns: 'grid', lighter: 'value', brighter: 'value', darker: 'value', brightness: 'value', bright: 'value', dark: 'value', light: 'value', lines: 'line', line: 'line', stripes: 'line', rays: 'line' };
export function tokens(text) {
  const out = new Set();
  for (const w of String(text || '').toLowerCase().match(/[a-z]+/g) || []) { if (w.length < 3 || STOP.has(w)) continue; out.add(SYN[w] || w.replace(/s$/, '')); }
  return out;
}

export async function examplesFor(request, { k = 2, exclude = [] } = {}) {
  const want = tokens(request), lib = (await library()).filter(b => !exclude.includes(b.id));
  const scored = lib.map(b => { const have = tokens(b.text); let hit = 0; for (const t of want) if (have.has(t)) hit++; return { b, s: hit / Math.sqrt(have.size + 4) }; })
    .filter(x => x.s > 0).sort((a, b) => b.s - a.s);
  return scored.slice(0, k).map(x => ({ id: x.b.id, title: x.b.title, code: x.b.code }));
}
