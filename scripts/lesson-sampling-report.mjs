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
  const [ref, ...examples] = sec.boards;
  const src = LESSON.sources[ref.source];
  const refPic = src.animated ? img('walk-anim.gif', 'image/gif') : img(`${ref.id}.jpg`);
  return `
  <section class="part">
    <header class="part-head">
      <figure class="ref"><img src="${refPic}" alt="${esc(src.title)}"><figcaption>${esc(src.title)} · <a href="${src.commons}">public domain</a></figcaption></figure>
      <div>
        <h2>${esc(sec.title)}</h2>
        <p>${esc(sec.text)}</p>
        <p class="source-note">In the studio: <code>source('${ref.source}')</code></p>
      </div>
    </header>
    ${examples.map(b => {
      n++;
      const p5 = fs.readFileSync(path.join(dir, 'p5', b.id, 'sketch.js'), 'utf8');
      const id = `ex${n}`;
      return `
    <article class="example" id="${b.id}">
      <figure class="out"><img src="${img(`${b.id}.jpg`)}" alt="${esc(b.title)}" loading="lazy">${b.follow ? '<figcaption>One frame: in the studio the board follows the walk and redraws on every frame.</figcaption>' : ''}</figure>
      <div class="text">
        <h3>${esc(b.title)}</h3>
        <p>${esc(b.idea)}</p>
        <div class="tabs" role="tablist" aria-label="${esc(b.title)}: code">
          <button role="tab" id="${id}-t0" aria-controls="${id}-p0" aria-selected="true">Pseudocode</button>
          <button role="tab" id="${id}-t1" aria-controls="${id}-p1" aria-selected="false">Studio</button>
          <button role="tab" id="${id}-t2" aria-controls="${id}-p2" aria-selected="false">p5.js</button>
          <button class="copy" type="button" data-for="${id}">Copy</button>
        </div>
        <pre class="code pseudo" role="tabpanel" id="${id}-p0" aria-labelledby="${id}-t0">${esc(b.pseudo)}</pre>
        <pre class="code" role="tabpanel" id="${id}-p1" aria-labelledby="${id}-t1" hidden>${code(b.code)}</pre>
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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&family=JetBrains+Mono:wght@400;500&display=swap">
<style>
:root {
  --paper: #f5f5f1; --ink: #1d2233; --muted: #5d6272; --line: #d9dae0; --panel: #ebecef;
  --blue: #2f5fa7; --orange: #c8561f; --code-bg: #1d2233; --code-ink: #e9e7df; --code-muted: #8c93a8;
  --display: 'Bricolage Grotesque', 'Helvetica Neue', Arial, sans-serif;
  --body: 'Source Serif 4', Georgia, 'Times New Roman', serif;
  --mono: 'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) { color-scheme: dark; --paper: #14161d; --ink: #e8e6df; --muted: #a0a4b2; --line: #2b2f3b; --panel: #1d2029; --blue: #7ea6e6; --orange: #ec8a52; --code-bg: #0d0f14; --code-ink: #e9e7df; --code-muted: #7d8498; }
}
:root[data-theme="dark"] { color-scheme: dark; --paper: #14161d; --ink: #e8e6df; --muted: #a0a4b2; --line: #2b2f3b; --panel: #1d2029; --blue: #7ea6e6; --orange: #ec8a52; --code-bg: #0d0f14; --code-ink: #e9e7df; --code-muted: #7d8498; }
body { background: var(--paper); color: var(--ink); font: 17px/1.55 var(--body); }
.page { max-width: 1120px; margin: 0 auto; padding-inline: 20px; padding-block: 40px 80px; }
h1, h2, h3 { font-family: var(--display); line-height: 1.12; text-wrap: balance; margin: 0; }
h1 { font-size: clamp(2.1rem, 5vw, 3.4rem); font-weight: 700; letter-spacing: -0.01em; }
h2 { font-size: 1.75rem; font-weight: 700; }
h3 { font-size: 1.2rem; font-weight: 500; }
p { margin: 0; max-width: 65ch; }
a { color: var(--blue); }
code { font-family: var(--mono); font-size: 0.86em; }
.intro { display: grid; gap: 14px; padding-bottom: 28px; border-bottom: 1px solid var(--line); }
.intro .sub { font-size: 1.2rem; color: var(--muted); font-style: italic; }
.idea { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px; margin-top: 10px; }
.idea div { display: grid; gap: 4px; }
.idea b { font-family: var(--display); font-weight: 500; font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
.part { display: grid; gap: 36px; padding-block: 44px; border-bottom: 1px solid var(--line); }
.part-head { display: grid; grid-template-columns: minmax(0, 300px) minmax(0, 1fr); gap: 28px; align-items: start; }
.part-head > div { display: grid; gap: 12px; }
.source-note { color: var(--muted); font-size: 0.95rem; }
figure { margin: 0; display: grid; gap: 6px; }
figure img { width: 100%; height: auto; display: block; border-radius: 2px; }
figcaption { font-size: 0.82rem; color: var(--muted); line-height: 1.4; }
.ref img { max-height: 380px; object-fit: contain; object-position: left top; width: auto; max-width: 100%; }
.example { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 6fr); gap: 28px; align-items: start; }
.example .text { display: grid; gap: 12px; min-width: 0; }
.example .out img { box-shadow: 0 1px 0 var(--line), 0 10px 30px -18px rgba(20, 24, 40, 0.45); }
.tabs { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; margin-top: 4px; }
.tabs button { font: 500 0.8rem var(--display); letter-spacing: 0.04em; border: 1px solid var(--line); background: transparent; color: var(--muted); padding: 5px 11px; border-radius: 999px; cursor: pointer; }
.tabs button[aria-selected="true"] { background: var(--ink); color: var(--paper); border-color: var(--ink); }
.tabs button:focus-visible { outline: 2px solid var(--blue); outline-offset: 2px; }
.tabs .copy { margin-left: auto; border-style: dashed; }
.code { margin: 0; background: var(--code-bg); color: var(--code-ink); font: 13px/1.55 var(--mono); padding: 16px 18px; border-radius: 6px; overflow-x: auto; max-height: 460px; white-space: pre; tab-size: 2; font-variant-ligatures: none; }
.code .c { color: var(--code-muted); }
.code.pseudo { font-family: var(--mono); background: var(--panel); color: var(--ink); border-left: 3px solid var(--orange); }
.foot { padding-top: 30px; display: grid; gap: 10px; color: var(--muted); font-size: 0.95rem; }
@media (max-width: 760px) {
  .part-head, .example { grid-template-columns: 1fr; }
  .ref img { max-height: 300px; }
}
@media (prefers-reduced-motion: no-preference) { .tabs button { transition: background 0.15s, color 0.15s; } }
</style>
<div class="page">
  <header class="intro">
    <h1>${esc(LESSON.title)}</h1>
    <p class="sub">${esc(LESSON.subtitle)}</p>
    <div class="idea">
      <div><b>The one idea</b><p>A picture is a function from a place to a color. Ask it, then decide what to draw there.</p></div>
      <div><b>Three answers</b><p>Seurat: a dot of pure color. Munch: a stroke that follows the form, in the color of the feeling. Muybridge: the same questions, asked of a moving picture.</p></div>
      <div><b>Three ways to read it</b><p>Each example has pseudocode, the studio's code (fractions of the board), and a p5.js sketch made from that code.</p></div>
    </div>
  </header>
  ${sections}
  <footer class="foot">
    <p>Made in Artist Model Studio as the scene “Lesson: ${esc(LESSON.title)}”: one board per example, each running its own code. The boards of the walk follow their source and redraw as it plays.</p>
    <p>The p5.js sketches are for p5 2.x: images load with <code>await loadImage()</code> in an async <code>setup()</code>, and the studio words they use (<code>drawPoint</code>, <code>drawLine</code>, <code>source</code>) are defined at the end of each sketch. Put the picture next to the sketch and open it through a local server.</p>
    <p>Pictures: Georges Seurat, Edvard Munch and Eadweard Muybridge, all public domain, from Wikimedia Commons.</p>
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
