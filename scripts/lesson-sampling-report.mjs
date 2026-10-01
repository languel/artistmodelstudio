// Writes the sampling lesson as HTML pages in exports/lesson-sampling/: report.html (studio and p5.js side by side, in
// tabs), report-studio.html (pseudocode and the studio's code only) and report-p5.html (pseudocode and p5.js only, its
// sketches runnable on the page).
// Needs the board pictures in exports/lesson-sampling/web/ (saved from the studio) and the p5 sketches
// (scripts/lesson-sampling-p5.mjs).
// Run: npx vite-node scripts/lesson-sampling-report.mjs [both] [studio] [p5]   (no argument: all three)
import fs from 'node:fs';
import path from 'node:path';
import { LESSON } from '../examples/lessons/sampling/lesson.js';

const dir = path.resolve('exports/lesson-sampling');
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const img = (file, type = 'image/jpeg') => `data:${type};base64,${fs.readFileSync(path.join(dir, 'web', file)).toString('base64')}`;
// Comments in code, muted (the only highlighting: the code should read on its own).
const code = src => esc(src.trim()).replace(/(\/\/[^\n]*|\/\*.*?\*\/)/g, '<span class="c">$1</span>');

// The page's own script for running sketches (kept in its own file: it is copied in as it is).
const RUNTIME = fs.readFileSync(path.resolve('scripts/lesson-report-run.js'), 'utf8');
const variants = process.argv.slice(2).filter(a => ['both', 'studio', 'p5'].includes(a));

function build(lang) {
// Sketches that can run on the page: every example except those that need ml5.js (its models load
// from elsewhere, which the page may not fetch). Their pictures are published next to the page, in media/.
// (The studio page runs nothing: its pictures are the boards'.)
const runnable = {};
let n = 0;
const sections = LESSON.sections.map(sec => {
  // A section opens with its source (a board shown as a reference), or, without one, the source its examples read.
  const ref = sec.boards.find(b => b.reference) || { source: sec.boards[0].source };
  const examples = sec.boards.filter(b => !b.reference);
  const src = LESSON.sources[ref.source];
  // The source itself, uncropped (its board shows it fitted to 4:3).
  const refPic = src && (src.animated ? img('walk-anim.gif', 'image/gif') : `data:image/jpeg;base64,${fs.readFileSync(path.resolve('examples/lessons/sampling/media', src.file)).toString('base64')}`);
  return `
  <section class="part${src ? '' : ' plain'}">
    <header class="part-head">
      ${src ? `<figure class="ref"><img src="${refPic}" alt="${esc(src.title)}"><figcaption>${esc(src.title)} · <a href="${src.commons}">public domain</a></figcaption></figure>` : ''}
      <div>
        <h2>${esc(sec.title)}</h2>
        <p>${esc(sec.text)}</p>
        ${src ? `<p class="source-note">${lang !== 'p5' ? `In the studio: <code>source('${ref.source}')</code>` : `In p5.js: <code>loadImage("${src.file}")</code>, the picture beside the sketch`}${sec.ml5 && lang !== 'studio' ? `${lang === 'both' ? '. In p5.js' : '. Here'}: <a href="https://ml5js.org/">ml5.js</a> <code>bodyPose('BlazePose')</code>, loaded by the sketch` : ''}</p>` : '<p class="source-note">Diagrams drawn by code: points, lines, planes and notes, like the rest of the lesson.</p>'}
      </div>
    </header>
    ${examples.map(b => {
      n++;
      const p5 = fs.readFileSync(path.join(dir, 'p5', b.id, 'sketch.js'), 'utf8');
      const runs = lang !== 'studio' && !/\bml5\./.test(p5);
      if (runs) runnable[b.id] = { w: b.w, h: b.h, code: p5.replace(/loadImage\("([^"]+)"\)/g, 'loadImage("media/$1")') };
      const id = `ex${n}`;
      // Its code, in tabs: pseudocode, the studio's, p5.js (as the page's language allows). The diagrams (how we see) are
      // minimized to the bar of tabs; every other example opens on its pseudocode.
      const min = Boolean(sec.diagram);
      const panes = [
        ...(b.pseudo ? [['Pseudocode', `<pre class="code pseudo">${esc(b.pseudo)}</pre>`, 'pseudo']] : []),
        ...(lang !== 'p5' ? [['Studio', `<pre class="code">${code(b.code)}</pre>`, 'studio']] : []),
        ...(lang !== 'studio' ? [['p5.js', `<pre class="code">${code(p5)}</pre>`, 'p5']] : [])
      ];
      const open = min ? -1 : b.pseudo ? 0 : panes.findIndex(x => x[2] !== 'pseudo');
      return `
    <article class="example${b.w / b.h > 2 ? ' wide' : ''}" id="${b.id}">
      <figure class="out"${runs ? ` data-run="${b.id}"` : ''}>
        <div class="stage" style="aspect-ratio: ${b.w} / ${b.h}"><img src="${img(`${b.id}.jpg`)}" alt="${esc(b.title)}" loading="lazy"></div>
        ${runs ? '<div class="under"><button class="run" type="button" aria-label="Run"></button><div class="controls"></div></div>' : ''}
        ${lang === 'studio' ? '' : !runs ? '<figcaption>Needs ml5.js: run the exported sketch (with ml5) or the board in the studio.</figcaption>' : b.follow ? '<figcaption>Run it to see it follow the walk, frame after frame.</figcaption>' : ''}
      </figure>
      <div class="text">
        <h3>${esc(b.title)}</h3>
        <p>${esc(b.idea)}</p>
        <div class="codebox${min ? ' min' : ''}">
        <div class="tabs" role="tablist" aria-label="${esc(b.title)}: code">
          ${panes.map(([label], k) => `<button role="tab" id="${id}-t${k}" aria-controls="${id}-p${k}" aria-selected="${k === open}">${label}</button>`).join('\n          ')}
          <button class="copy" type="button" data-for="${id}">Copy</button>
        </div>
        ${panes.map(([, html, kind], k) => html.replace('<pre class="code', `<pre role="tabpanel" id="${id}-p${k}" aria-labelledby="${id}-t${k}"${k === open ? '' : ' hidden'} class="code`)).join('\n        ')}
        </div>
      </div>
    </article>`;
    }).join('')}
  </section>`;
}).join('');

const html = `<meta charset="utf-8">
<title>Sampling Seurat and Munch${lang === 'studio' ? ' · Studio' : lang === 'p5' ? ' · p5.js' : ''}</title>
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
figure.out { gap: 10px; }
.stage { position: relative; width: 100%; max-width: 100%; }
.stage img, .stage iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 1px solid var(--line); border-radius: 4px; display: block; background: var(--code); }
.stage img { object-fit: cover; }
.under { display: grid; grid-template-columns: 28px 1fr; gap: 10px; align-items: start; }
.run { width: 28px; height: 28px; display: grid; place-items: center; padding: 0; color: var(--muted); background: none; border: 1px solid var(--line); border-radius: 50%; cursor: pointer; }
.run:hover { color: var(--text); border-color: var(--muted); }
.run:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }
.controls { display: grid; gap: 6px; }
.controls:empty { display: none; }
.ctl { display: grid; grid-template-columns: minmax(70px, auto) 1fr 64px; gap: 10px; align-items: center; font: 0.78rem var(--mono); color: var(--muted); }
.ctl output { text-align: right; color: var(--text); font-variant-numeric: tabular-nums; }
.ctl input[type=range] { width: 100%; accent-color: var(--accent); }
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
.codebox.min .tabs { border-bottom: 0; }
.codebox.min .tabs .copy { visibility: hidden; }
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
      <div><b>${lang === 'both' ? 'Three ways' : 'Two ways'} to read it</b><p>${lang === 'studio' ? 'Each example has pseudocode and the studio\'s code (fractions of the board). The scene is in exports/scenes/lesson-sampling-studio.ams.json.' : lang === 'p5' ? 'Each example has pseudocode and a p5.js sketch made from the studio\'s code. The scene is in exports/scenes/lesson-sampling-p5.ams.json.' : 'Each example has pseudocode, the studio\'s code (fractions of the board), and a p5.js sketch made from that code.'}</p></div>
    </div>
  </header>
  ${sections}
  <footer class="foot">
    <p>Made in Artist Model Studio as the scene “Lesson: ${esc(LESSON.title)}”: one board per example, each running its own code. The boards of the walk follow their source and redraw as it plays.</p>
    ${lang === 'studio' ? '' : `    <p>Run starts an example's p5.js sketch on the page; its sliders come from the ranges written in the code, and move it live. The sketches are for p5 2.x: images load with <code>await loadImage()</code> in an async <code>setup()</code>, and the studio words they use (<code>drawPoint</code>, <code>drawLine</code>, <code>source</code>) are defined at the end of each sketch. Put the picture next to the sketch and open it through a local server.</p>
    <p>The body examples load ml5.js (<code>await ml5.bodyPose('BlazePose')</code>, the same 33 points as the studio) and ask it about each frame of the walk. The custom brush in example 10 runs unchanged in p5: <code>brush()</code> keeps it, and a small kit (<code>frames</code>, <code>smoothPath</code>, <code>source</code>…) lets it draw on p5's <code>drawingContext</code>. On this old photograph ml5's BlazePose finds the walker more reliably than the studio's MediaPipe model, which misses some frames.</p>`}
    <p>Pictures: Georges Seurat, Edvard Munch and Eadweard Muybridge, all public domain, from Wikimedia Commons. The diagrams of the eye are stylized: the cone curves are simplified, and the mosaic shows proportions, not real counts.</p>
  </footer>
</div>
${lang === 'studio' ? '' : `<script type="application/json" id="sketches">${JSON.stringify(runnable).replace(/</g, '\\u003c')}</script>`}
<script>
${lang === 'studio' ? '' : RUNTIME}
for (const list of document.querySelectorAll('.tabs')) {
  const tabs = [...list.querySelectorAll('[role="tab"]')];
  // A click opens a tab; a click on the open one minimizes the box to its bar of tabs.
  const show = t => { list.parentNode.classList.toggle('min', !t); for (const x of tabs) { const on = x === t; x.setAttribute('aria-selected', String(on)); document.getElementById(x.getAttribute('aria-controls')).hidden = !on; } };
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(t.getAttribute('aria-selected') === 'true' ? null : t));
    t.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; show(n); n.focus(); } });
  });
  const copy = list.querySelector('.copy');
  copy.addEventListener('click', async () => {
    const t = tabs.find(x => x.getAttribute('aria-selected') === 'true');
    if (!t) return;
    const pre = document.getElementById(t.getAttribute('aria-controls'));
    try { await navigator.clipboard.writeText(pre.textContent); copy.textContent = 'Copied'; }
    catch { const r = document.createRange(); r.selectNodeContents(pre); const s = getSelection(); s.removeAllRanges(); s.addRange(r); copy.textContent = 'Selected'; }
    setTimeout(() => { copy.textContent = 'Copy'; }, 1500);
  });
}
</script>
`;
const file = lang === 'both' ? 'report.html' : `report-${lang}.html`;
fs.writeFileSync(path.join(dir, file), html);
console.log(file, Math.round(html.length / 1024), 'KB');
}

for (const lang of variants.length ? variants : ['both', 'studio', 'p5']) build(lang);
