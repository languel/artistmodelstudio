// Writes the sampling lesson as one HTML page: exports/lesson-sampling/report.html.
// Needs the board pictures in exports/lesson-sampling/web/ (saved from the studio) and the p5 sketches
// (scripts/lesson-sampling-p5.mjs). Run: npx vite-node scripts/lesson-sampling-report.mjs
import fs from 'node:fs';
import path from 'node:path';
import { LESSON } from '../examples/lessons/sampling/lesson.js';

const dir = path.resolve('exports/lesson-sampling');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const img = (file, type = 'image/jpeg') => `data:${type};base64,${fs.readFileSync(path.join(dir, 'web', file)).toString('base64')}`;
// Comments in code, muted (the only highlighting: the code should read on its own).
const code = src => esc(src.trim()).replace(/(\/\/[^\n]*|\/\*.*?\*\/)/g, '<span class="c">$1</span>');

let n = 0;
const sections = LESSON.sections.map(sec => {
  // A section opens with its source (a board shown as a reference), or, without one, the source its examples read.
  const ref = sec.boards.find(b => b.reference) || { source: sec.boards[0].source };
  const examples = sec.boards.filter(b => !b.reference);
  const src = LESSON.sources[ref.source];
  const refPic = src && (src.animated ? img('walk-anim.gif', 'image/gif') : img(`${ref.id}.jpg`));
  return `
  <section class="part${src ? '' : ' plain'}">
    <header class="part-head">
      ${src ? `<figure class="ref"><img src="${refPic}" alt="${esc(src.title)}"><figcaption>${esc(src.title)} · <a href="${src.commons}">public domain</a></figcaption></figure>` : ''}
      <div>
        <h2>${esc(sec.title)}</h2>
        <p>${esc(sec.text)}</p>
        ${src ? `<p class="source-note">In the studio: <code>source('${ref.source}')</code>${sec.ml5 ? '. In p5.js: <a href="https://ml5js.org/">ml5.js</a> <code>bodyPose(\'BlazePose\')</code>, loaded by the sketch' : ''}</p>` : '<p class="source-note">Diagrams drawn by code: points, lines, planes and notes, like the rest of the lesson.</p>'}
      </div>
    </header>
    ${examples.map(b => {
      n++;
      const p5 = fs.readFileSync(path.join(dir, 'p5', b.id, 'sketch.js'), 'utf8');
      const id = `ex${n}`;
      return `
    <article class="example${b.w / b.h > 2 ? ' wide' : ''}" id="${b.id}">
      <figure class="out"><img src="${img(`${b.id}.jpg`)}" alt="${esc(b.title)}" loading="lazy">${b.follow ? '<figcaption>One frame: in the studio the board follows the walk and redraws on every frame.</figcaption>' : ''}</figure>
      <div class="text">
        <h3>${esc(b.title)}</h3>
        <p>${esc(b.idea)}</p>
        <div class="tabs" role="tablist" aria-label="${esc(b.title)}: code">
          ${b.pseudo ? `<button role="tab" id="${id}-t0" aria-controls="${id}-p0" aria-selected="true">Pseudocode</button>` : ''}
          <button role="tab" id="${id}-t1" aria-controls="${id}-p1" aria-selected="${b.pseudo ? 'false' : 'true'}">Studio</button>
          <button role="tab" id="${id}-t2" aria-controls="${id}-p2" aria-selected="false">p5.js</button>
          <button class="copy" type="button" data-for="${id}">Copy</button>
        </div>
        ${b.pseudo ? `<pre class="code pseudo" role="tabpanel" id="${id}-p0" aria-labelledby="${id}-t0">${esc(b.pseudo)}</pre>` : ''}
        <pre class="code" role="tabpanel" id="${id}-p1" aria-labelledby="${id}-t1"${b.pseudo ? ' hidden' : ''}>${code(b.code)}</pre>
        <pre class="code" role="tabpanel" id="${id}-p2" aria-labelledby="${id}-t2" hidden>${code(p5)}</pre>
      </div>
    </article>`;
    }).join('')}
  </section>`;
}).join('');

const html = `<meta charset="utf-8">
<title>Sampling Seurat and Munch</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
/* Artist Model Studio's dark theme: near-greyscale, quiet, one warm accent. */
:root {
  color-scheme: dark;
  --bg: #1b1b1b; --panel: #222222; --panel-2: #2a2a2a; --line: #353535;
  --text: #dadada; --muted: #8c8c8c; --accent: #c9c7c2; --warm: #c8664f; --code: #141414;
  --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --mono: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace;
}
body { background: var(--bg); color: var(--text); font: 15px/1.6 var(--sans); }
.page { max-width: 1120px; margin: 0 auto; padding-inline: 20px; padding-block: 48px 88px; }
h1, h2, h3 { margin: 0; line-height: 1.2; text-wrap: balance; font-weight: 600; }
h1 { font-size: clamp(1.7rem, 4vw, 2.4rem); letter-spacing: -0.015em; }
h2 { font-size: 1.3rem; letter-spacing: -0.01em; }
h3 { font-size: 1rem; font-weight: 500; }
p { margin: 0; max-width: 66ch; }
a { color: var(--accent); text-underline-offset: 3px; }
code { font-family: var(--mono); font-size: 0.85em; color: var(--accent); }
.intro { display: grid; gap: 14px; padding-bottom: 32px; border-bottom: 1px solid var(--line); }
.intro .sub { color: var(--muted); font-size: 1.05rem; }
.idea { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 24px; margin-top: 14px; }
.idea div { display: grid; gap: 6px; align-content: start; }
.idea b, .eyebrow { font: 500 0.7rem var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.part { display: grid; gap: 44px; padding-block: 52px; border-bottom: 1px solid var(--line); }
.part-head { display: grid; grid-template-columns: minmax(0, 280px) minmax(0, 1fr); gap: 32px; align-items: start; }
.part.plain .part-head { grid-template-columns: minmax(0, 1fr); }
.part-head > div { display: grid; gap: 12px; }
.source-note { color: var(--muted); font-size: 0.9rem; }
figure { margin: 0; display: grid; gap: 8px; }
figure img { width: 100%; height: auto; display: block; border-radius: 4px; border: 1px solid var(--line); }
figcaption { font-size: 0.8rem; color: var(--muted); line-height: 1.45; }
.ref img { max-height: 360px; object-fit: contain; object-position: left top; width: auto; max-width: 100%; }
.example { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 32px; align-items: start; }
.example.wide { grid-template-columns: minmax(0, 1fr); }
.example .text { display: grid; gap: 12px; min-width: 0; }
.example p { color: #bdbdbd; }
.tabs { display: flex; flex-wrap: wrap; gap: 2px; align-items: center; margin-top: 6px; border-bottom: 1px solid var(--line); }
.tabs button { font: 500 0.78rem var(--sans); border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--muted); padding: 6px 10px; margin-bottom: -1px; cursor: pointer; }
.tabs button[aria-selected="true"] { color: var(--text); border-bottom-color: var(--accent); }
.tabs button:hover { color: var(--text); }
.tabs button:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }
.tabs .copy { margin-left: auto; font-family: var(--mono); font-size: 0.72rem; }
.code { margin: 0; background: var(--code); color: #d4d4d4; font: 12.5px/1.6 var(--mono); padding: 16px 18px; border: 1px solid var(--line); border-radius: 4px; overflow-x: auto; max-height: 460px; white-space: pre; tab-size: 2; font-variant-ligatures: none; }
.code .c { color: #767676; }
.code.pseudo { color: var(--accent); }
.foot { padding-top: 34px; display: grid; gap: 10px; color: var(--muted); font-size: 0.9rem; }
@media (max-width: 760px) {
  .part-head, .example { grid-template-columns: 1fr; }
  .ref img { max-height: 280px; }
}
@media (prefers-reduced-motion: no-preference) { .tabs button { transition: color 0.12s, border-color 0.12s; } }
</style>
<div class="page">
  <header class="intro">
    <h1>${esc(LESSON.title)}</h1>
    <p class="sub">${esc(LESSON.subtitle)}</p>
    <div class="idea">
      <div><b>The one idea</b><p>A picture is a function from a place to a color. Ask it, then decide what to draw there.</p></div>
      <div><b>First, the eye</b><p>The retina samples too: a mosaic of rods and cones, three kinds of cones, three numbers for a color. Seurat worked with the optics of his day; much of this was found later.</p></div>
      <div><b>Four answers</b><p>Seurat: a dot of pure color. Munch: a stroke that follows the form, in the color of the feeling. Muybridge: the same questions, asked of a moving picture. And a model's answer: where the body is.</p></div>
      <div><b>Three ways to read it</b><p>Each example has pseudocode, the studio's code (fractions of the board), and a p5.js sketch made from that code.</p></div>
    </div>
  </header>
  ${sections}
  <footer class="foot">
    <p>Made in Artist Model Studio as the scene “Lesson: ${esc(LESSON.title)}”: one board per example, each running its own code. The boards of the walk follow their source and redraw as it plays.</p>
    <p>The p5.js sketches are for p5 2.x: images load with <code>await loadImage()</code> in an async <code>setup()</code>, and the studio words they use (<code>drawPoint</code>, <code>drawLine</code>, <code>source</code>) are defined at the end of each sketch. Put the picture next to the sketch and open it through a local server.</p>
    <p>The body examples load ml5.js (<code>await ml5.bodyPose('BlazePose')</code>, the same 33 points as the studio) and ask it about each frame of the walk. The custom brush in example 10 runs unchanged in p5: <code>brush()</code> keeps it, and a small kit (<code>frames</code>, <code>smoothPath</code>, <code>source</code>…) lets it draw on p5's <code>drawingContext</code>. On this old photograph ml5's BlazePose finds the walker more reliably than the studio's MediaPipe model, which misses some frames.</p>
    <p>Pictures: Georges Seurat, Edvard Munch and Eadweard Muybridge, all public domain, from Wikimedia Commons. The diagrams of the eye are stylized: the cone curves are simplified, and the mosaic shows proportions, not real counts.</p>
  </footer>
</div>
<script>
for (const list of document.querySelectorAll('.tabs')) {
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  const show = t => { for (const x of tabs) { const on = x === t; x.setAttribute('aria-selected', String(on)); document.getElementById(x.getAttribute('aria-controls')).hidden = !on; } };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t));
    t.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; show(n); n.focus(); } });
  });
  const copy = list.querySelector('.copy');
  copy.addEventListener('click', async () => {
    const t = tabs.find(x => x.getAttribute('aria-selected') === 'true');
    const pre = document.getElementById(t.getAttribute('aria-controls'));
    try { await navigator.clipboard.writeText(pre.textContent); copy.textContent = 'Copied'; }
    catch { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); copy.textContent = 'Selected'; }
    setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
  });
}
</script>
`;
fs.writeFileSync(path.join(dir, 'report.html'), html);
console.log('report.html', Math.round(html.length / 1024), 'KB');
