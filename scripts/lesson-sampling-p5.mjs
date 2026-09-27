// Writes the sampling lesson's p5.js sketches: exports/lesson-sampling/p5/<example>/{index.html, sketch.js, media}.
// Run: npx vite-node scripts/lesson-sampling-p5.mjs
import fs from 'node:fs';
import path from 'node:path';
import { LESSON } from '../examples/lessons/sampling/lesson.js';
import { toP5Code, p5SketchHtml } from '../src/process/p5code.js';

const out = path.resolve('exports/lesson-sampling/p5');
const media = path.resolve('examples/lessons/sampling/media');
for (const sec of LESSON.sections) for (const b of sec.boards) {
  if (!b.code) continue;
  const src = LESSON.sources[b.source];
  const sources = { [b.source]: { file: src.file, kind: src.animated ? 'animated' : 'image' } };
  const code = toP5Code(b.code, { board: { title: b.title, width: b.w, height: b.h, ground: b.ground || '#f3efe6' }, sources, loop: Boolean(b.follow) });
  const dir = path.join(out, b.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'sketch.js'), code);
  fs.writeFileSync(path.join(dir, 'index.html'), p5SketchHtml(b.title));
  fs.copyFileSync(path.join(media, src.file), path.join(dir, src.file));
  console.log(b.id, code.split('\n').length, 'lines');
}
