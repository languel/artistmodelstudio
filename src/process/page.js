/**
 * A drawing as a page: its boards in order, each a section with its title, its picture (switch to
 * the process view, or replay how it was made) and its text (Markdown). For lectures written as
 * boards, blog posts, and agents' reports. The page is one self-contained HTML file: the drawing
 * travels inside it (<script type="application/json" id="ams-doc">), with the studio's renderer,
 * which draws each board (so it is exact, small, and can replay), and it can be opened again.
 */
import { boardsOf, boardDoc, marksOf, MAIN } from './boards.js';
import { md } from './markdown.js';
import boardsSrc from './boards.js?raw';
import documentSrc from './document.js?raw';
import brushesSrc from './brushes.js?raw';
import notesSrc from './notes.js?raw';
import renderSrc from './render.js?raw';

const strip = src => src
  .replace(/^import[^;]*;\s*$/gm, '')
  .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
  .replace(/^export\s+(default\s+)?/gm, '');
/** The studio's renderer, as one script (no imports): the page draws every board itself. */
const runtime = () => [boardsSrc, documentSrc, brushesSrc, notesSrc, renderSrc].map(strip).join('\n;\n');

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/** Which boards go on the page: all with marks or text (the main one too, unless it is empty). */
export function pageBoards(doc) {
  return boardsOf(doc).filter(b => marksOf(doc, b.id).length || b.text || !b.main);
}

/**
 * The page. opts: { title, intro (Markdown before the boards), boards (ids, in order), byline }.
 */
export function sceneHtml(doc, { title = doc.title || 'Untitled', intro = doc.meta?.intro || '', boards = null, byline = '' } = {}) {
  const list = boards ? boards.map(id => boardsOf(doc).find(b => b.id === id)).filter(Boolean) : pageBoards(doc);
  const sections = list.map((b, i) => {
    const one = boardDoc(doc, b.id);
    const n = one.elements.length;
    const stages = new Set(one.elements.map(e => e.stage)).size;
    return `<section class="board" id="${esc(b.id)}">
  <h2><span class="n">${i + 1}</span>${esc(b.title)}</h2>
  ${n ? `<figure class="fig" data-board="${esc(b.id)}" data-view="picture" style="aspect-ratio: ${b.width} / ${b.height}">
    <canvas role="img" aria-label="${esc(b.title)}"></canvas>
  </figure>
  <div class="bar" data-for="${esc(b.id)}">
    <button data-act="picture" class="on">Picture</button><button data-act="process">Process</button><button data-act="replay">Replay</button>
    <span class="meta">${n} marks · ${stages} stage${stages === 1 ? '' : 's'} · ${b.width}×${b.height}</span>
  </div>` : ''}
  ${b.text ? `<div class="text">${md(b.text)}</div>` : ''}
  ${b.code ? `<details class="code"><summary>The score</summary><pre><code>${esc(b.code)}</code></pre></details>` : ''}
</section>`;
  });
  const payload = JSON.stringify(doc).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="generator" content="Artist Model Studio">
<style>
:root { --bg: #f7f5f0; --ink: #1d1b19; --muted: #7a746b; --line: #ddd6ca; --card: #fff; --accent: #c8664f; }
@media (prefers-color-scheme: dark) { :root { --bg: #1b1b1c; --ink: #e8e4dc; --muted: #9a948a; --line: #34322f; --card: #232322; --accent: #d9805f; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 17px/1.6 ui-serif, Georgia, 'Iowan Old Style', serif; }
main { max-width: 860px; margin: 0 auto; padding: 48px 20px 96px; }
header h1 { font: 600 34px/1.2 ui-sans-serif, system-ui, sans-serif; margin: 0 0 6px; letter-spacing: -0.01em; }
header .by { color: var(--muted); font: 14px ui-sans-serif, system-ui, sans-serif; margin-bottom: 18px; }
nav.toc { font: 14px ui-sans-serif, system-ui, sans-serif; color: var(--muted); margin: 18px 0 8px; display: flex; flex-wrap: wrap; gap: 6px 14px; }
nav.toc a { color: inherit; text-decoration: none; border-bottom: 1px solid var(--line); }
section.board { margin: 56px 0; }
h2 { font: 600 22px/1.3 ui-sans-serif, system-ui, sans-serif; margin: 0 0 14px; }
h2 .n { color: var(--muted); font-weight: 400; margin-right: 10px; }
h3, h4 { font-family: ui-sans-serif, system-ui, sans-serif; }
figure.fig { margin: 0; border: 1px solid var(--line); border-radius: 10px 10px 0 0; overflow: hidden; background: var(--card); }
figure.fig canvas { display: block; width: 100%; height: 100%; }
.bar { display: flex; align-items: center; gap: 6px; padding: 8px 10px; margin-bottom: 18px; border: 1px solid var(--line); border-top: 0; border-radius: 0 0 10px 10px; font: 13px ui-sans-serif, system-ui, sans-serif; }
.bar button { font: inherit; padding: 3px 10px; border-radius: 6px; border: 1px solid var(--line); background: transparent; color: var(--muted); cursor: pointer; }
.bar button.on { color: var(--ink); border-color: var(--muted); }
.bar .meta { margin-left: auto; color: var(--muted); }
.text p, .text li { max-width: 68ch; }
.text table { border-collapse: collapse; font: 14px ui-sans-serif, system-ui, sans-serif; margin: 12px 0; }
.text th, .text td { border-bottom: 1px solid var(--line); padding: 5px 10px; text-align: left; }
code { font: 0.88em ui-monospace, 'SF Mono', Menlo, monospace; }
pre { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 12px 14px; overflow: auto; font-size: 13px; line-height: 1.5; }
details.code summary { cursor: pointer; color: var(--muted); font: 14px ui-sans-serif, system-ui, sans-serif; }
a { color: var(--accent); }
footer { color: var(--muted); font: 13px ui-sans-serif, system-ui, sans-serif; margin-top: 64px; border-top: 1px solid var(--line); padding-top: 14px; }
</style>
</head>
<body>
<main>
<header>
  <h1>${esc(title)}</h1>
  ${byline ? `<div class="by">${esc(byline)}</div>` : ''}
  ${intro ? `<div class="text">${md(intro)}</div>` : ''}
  ${list.length > 2 ? `<nav class="toc">${list.map((b, i) => `<a href="#${esc(b.id)}">${i + 1}. ${esc(b.title)}</a>`).join('')}</nav>` : ''}
</header>
${sections.join('\n')}
<footer>Made in Artist Model Studio. The drawing is inside this page: open it in the studio to keep working on it.</footer>
</main>
<script type="application/json" id="ams-doc">${payload}</script>
<noscript><p>The drawings on this page are drawn by a script: allow scripts to see them.</p></noscript>
<script>
${runtime().replace(/<\/script/gi, '<\\/script')}
;
${PAGE_UI}
</script>
</body>
</html>
`;
}

const PAGE_UI = String.raw`
// ---- the page: each board drawn by the studio's renderer; picture, process, replay ----------------
(function () {
  const doc = normalizeDocument(JSON.parse(document.getElementById('ams-doc').textContent));
  installLines(doc);
  const views = [];
  for (const fig of document.querySelectorAll('figure.fig')) {
    const id = fig.dataset.board, one = boardDoc(doc, id);
    const bar = document.querySelector('.bar[data-for="' + CSS.escape(id) + '"]');
    // The marks in the order the renderer draws them (stage, then when made): replay shows them one by one.
    const rank = new Map(one.stages.map((s, i) => [s.id, i]));
    const order = one.elements.map((e, i) => [e, i]).sort((a, b) => (rank.get(a[0].stage) ?? 0) - (rank.get(b[0].stage) ?? 0) || a[1] - b[1]).map(x => x[0]);
    const v = { mode: 'picture', shown: Infinity, timer: 0 };
    const cv = fig.querySelector('canvas'), ctx = cv.getContext('2d');
    v.draw = () => {
      const w = fig.clientWidth, h = fig.clientHeight, dpr = window.devicePixelRatio || 1;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      const d = v.shown < order.length ? { ...one, elements: order.slice(0, v.shown) } : one;
      renderDocument(ctx, d, { mode: v.mode, transform: { x: 0, y: 0, scale: (w / one.artboard.width) * dpr } });
    };
    bar && bar.addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      const act = b.dataset.act;
      if (act === 'picture' || act === 'process') {
        v.mode = act;
        for (const x of bar.querySelectorAll('button[data-act="picture"], button[data-act="process"]')) x.classList.toggle('on', x.dataset.act === act);
        v.draw();
        return;
      }
      clearInterval(v.timer);
      v.shown = 0;
      const step = Math.max(30, Math.min(400, 6000 / Math.max(1, order.length)));
      v.timer = setInterval(() => { v.shown++; v.draw(); if (v.shown >= order.length) { clearInterval(v.timer); v.shown = Infinity; } }, step);
      v.draw();
    });
    views.push(v);
  }
  const all = () => views.forEach(v => v.draw());
  KIT.onImageLoad = () => requestAnimationFrame(all);
  window.addEventListener('resize', () => requestAnimationFrame(all));
  all();
})();
`;

/** The drawing inside an exported page (or null). */
export function docFromPage(html) {
  const m = String(html).match(/<script type="application\/json" id="ams-doc">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

export { MAIN };
