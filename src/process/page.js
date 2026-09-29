/**
 * A drawing as a page: one self-contained HTML file for lectures, lessons and reports, in the
 * studio's dark, quiet look. The drawing travels inside it (<script type="application/json"
 * id="ams-doc">) with the studio's renderer, so boards are drawn exactly, replay, and run.
 *
 * Each board by its kind:
 *   drawing   its picture (drawn by the renderer), Picture / Process / Replay, its sliders (the
 *             ranges in its code) up front, Run for a board that follows a moving source, its text
 *             and notes, and its code folded away
 *   markdown  the document itself (math, Mermaid, callouts; [[links]] jump to boards on the page).
 *             A Markdown board titled "<Board> · notes" joins that board's section.
 *   html      the page, in a sandboxed frame
 *   p5        Run starts the sketch in a sandboxed frame
 * Sources the code reads travel as pictures (images, GIFs, videos) and are sampled on the page.
 * The page can be opened in the studio again.
 */
import { boardsOf, boardKind, boardDoc, marksOf, findBoard, isFrame, boardsInFrame, MAIN } from './boards.js';
import { renderMarkdown, md } from './markdown.js';
import boardsSrc from './boards.js?raw';
import documentSrc from './document.js?raw';
import brushesSrc from './brushes.js?raw';
import notesSrc from './notes.js?raw';
import renderSrc from './render.js?raw';
import scriptSrc from './script.js?raw';
import controlsSrc from './controls.js?raw';
import streamsSrc from './streams.js?raw';
import fitSrc from './fit.js?raw';
import fitterSrc from '../fitting/fitReference.js?raw';
import fitCoreSrc from '../fitting/fitCore.js?raw';

const strip = src => src
  .replace(/^import[^;]*;\s*$/gm, '')
  .replace(/^export\s+\{[^}]*\}\s+from[^;]*;\s*$/gm, '')
  .replace(/^export\s+\{[^}]*\};?\s*$/gm, '')
  .replace(/^export\s+(default\s+)?/gm, '');
/** The studio's renderer and score runner, as one script (no imports). The fitter keeps to itself. */
export const pageRuntime = () => [
  ...[streamsSrc, boardsSrc, documentSrc, brushesSrc, notesSrc, renderSrc].map(strip),
  // The page fits on the spot (no worker: it is one file).
  `const fitSource = (() => {\n${strip(fitterSrc)}\n;\n${strip(fitCoreSrc)}\n;\n${strip(fitSrc).replace(/new Worker\(new URL\([^)]*\)[^)]*\)/, 'false')}\nreturn fitSource;\n})();`,
  ...[scriptSrc, controlsSrc].map(strip)
].join('\n;\n');

// Play and pause as glyphs (the page's run control: small, in the corner, shown on hover).
const PLAY_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>';
const COPY_ICON = '<svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true"><rect x="8" y="8" width="11" height="12" rx="2" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5 15V6a2 2 0 0 1 2-2h8" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>';

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

/**
 * Which boards go on the page, in reading order (as laid out on the canvas: rows top to bottom,
 * each row left to right): every document and program board, and drawings with marks, text or code.
 */
export function pageBoards(doc) {
  const list = boardsOf(doc).filter(b => !b.hidden).filter(b => boardKind(b) !== 'drawing' || marksOf(doc, b.id).length || b.text || b.code || b.source || !b.main);
  return list.sort((a, b) => (Math.abs(a.y - b.y) < 40 ? a.x - b.x : a.y - b.y));
}

/** Sources a board reads (source('name') in its code, or shown under it). */
export const sourcesOf = b => [...new Set([...(b.code || '').matchAll(/source\(\s*['"`]([^'"`]+)['"`]/g)].map(m => m[1]).concat(b.source ? [b.source] : []))];

/**
 * The page. opts: { title, intro (Markdown), boards (ids, in order), byline,
 *   media: { name: { url (data: URL), type: 'image' | 'animated' | 'video' } }   the sources
 *   codes: { boardId: { pseudo, studio, p5 } }   a board's code, shown as tabs of one box
 *   pictures: { boardId: data URL }   board pictures for ![[embeds]]
 *   p5Source: p5.js itself (when there are p5 boards) }
 */
export function sceneHtml(doc, { title = doc.title || 'Untitled', intro = doc.meta?.intro || '', boards = null, byline = '', media = {}, pictures = {}, p5Source = '', codes = {} } = {}) {
  let list = boards ? boards.map(id => boardsOf(doc).find(b => b.id === id)).filter(Boolean) : pageBoards(doc);
  // Boards inside a frame are shown in it, not on their own.
  const framed = new Set(list.filter(isFrame).flatMap(f => boardsInFrame(doc, f).map(x => x.id)));
  list = list.filter(b => !framed.has(b.id));
  // Notes boards ("<Board> · notes") join their board.
  const notes = new Map();
  for (const b of list) {
    const m = /^(.*) · notes$/.exec(b.title);
    const owner = m && boardKind(b) === 'markdown' && list.find(x => x.title === m[1]);
    if (owner) notes.set(owner.id, b);
  }
  const noted = new Set([...notes.values()].map(b => b.id));
  list = list.filter(b => !noted.has(b.id));

  const resolve = t => { const b = findBoard(doc, t); return b ? { href: `#${noted.has(b.id) ? [...notes.entries()].find(([, n]) => n.id === b.id)[0] : b.id}` } : { missing: true }; };
  const mdHtml = src => renderMarkdown(src, { resolve })
    .replace(/<span class="md-embed" data-embed="([^"]*)"[^>]*><\/span>/g, (all, t) => {
      const b = findBoard(doc, t.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"'));
      return b && pictures[b.id] ? `<a class="md-embed" href="#${esc(b.id)}"><img src="${pictures[b.id]}" alt="${esc(b.title)}"></a>` : `<span class="md-missing">${t}</span>`;
    });
  const needsP5 = boardsOf(doc).some(b => boardKind(b) === 'p5' && (list.includes(b) || framed.has(b.id)));
  // A page that opens with a document uses it as its header (its own title, its contents); the
  // drawing's intro is left out when a document already says the same.
  const opensWithDoc = b => b && ((boardKind(b) === 'markdown' && /^#\s/m.test(b.code || '')) || (isFrame(b) && boardsInFrame(doc, b).some(x => boardKind(x) === 'markdown' && /^#\s/m.test(x.code || ''))));
  const lead = opensWithDoc(list[0]) ? list[0] : null;
  if (intro && list.some(b => boardKind(b) === 'markdown' && (b.code || '').trim() === intro.trim())) intro = '';

  let n = 0;
  const fit = b => `aspect-ratio: ${b.width} / ${b.height}; max-width: min(100%, calc(78vh * ${(b.width / b.height).toFixed(4)}))`;   // never taller than the screen
  // A board's code: one box, a tab per way of writing it (pseudocode, studio, p5.js), and Copy.
  const codeBox = b => {
    const c = codes[b.id] || (boardKind(b) === 'p5' ? { p5: b.code } : { studio: b.code });
    const tabs = [['pseudo', 'Pseudocode'], ['studio', 'Studio'], ['p5', 'p5.js']].filter(([k]) => c[k]);
    if (!tabs.length) return '';
    const first = boardKind(b) === 'p5' && !c.pseudo ? 'p5' : tabs[0][0];
    return `<div class="codebox">
    <div class="tabs" role="tablist">${tabs.map(([k, t]) => `<button role="tab" data-tab="${k}" aria-selected="${k === first}">${t}</button>`).join('')}<button class="copy" type="button" aria-label="Copy" title="Copy">${COPY_ICON}</button></div>
    ${tabs.map(([k]) => `<pre data-pane="${k}"${k === first ? '' : ' hidden'}><code${k === 'studio' && boardKind(b) === 'drawing' ? ` data-code-for="${esc(b.id)}"` : ''}>${esc(c[k])}</code></pre>`).join('\n    ')}
  </div>`;
  };
  // Notes' folded code callouts (pseudocode, the other language) are the code box's tabs on the page.
  const withoutCode = src => src.replace(/(^|\n)> \[!(abstract|example)\]-[^\n]*(\n>[^\n]*)*/g, '');
  // One board's content (its heading given), by kind.
  const boardHtml = (b, head, own = true) => {
    const kind = boardKind(b), note = own ? notes.get(b.id) : null;
    if (kind === 'markdown') return `<div class="md" id="${esc(b.id)}">${mdHtml(/ · notes$/.test(b.title) ? withoutCode(b.code || '') : b.code || '')}</div>`;
    // Notes say it all when there are some (their heading repeats the board's title: left out).
    const noteSrc = note ? withoutCode(note.code || '').replace(new RegExp(`^#{1,3}\\s+${b.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\n`), '') : '';
    const after = note ? `<div class="notes md" id="${esc(note.id)}">${mdHtml(noteSrc)}</div>` : own && b.text ? `<div class="idea md">${md(b.text)}</div>` : '';
    if (kind === 'html') return `${head}<div class="stage" style="${fit(b)}"><iframe sandbox="allow-scripts" title="${esc(b.title)}" data-html="${esc(b.id)}"></iframe></div>${after}
  <details class="code"><summary>HTML</summary><pre><code>${esc(b.code || '')}</code></pre></details>`;
    if (kind === 'p5') return `${head}<div class="stage p5" data-p5="${esc(b.id)}" style="${fit(b)}"></div>
  <div class="bar"><button class="run" type="button" aria-label="Run" data-p5-run="${esc(b.id)}">${PLAY_ICON}</button><span class="meta">p5.js sketch · ${b.width}×${b.height}</span></div>${after}
  ${codeBox(b)}`;
    const one = boardDoc(doc, b.id), marks = one.elements.length;
    const stages = new Set(one.elements.map(e => e.stage)).size;
    const landmarks = /\.(pose|hands)\b|\.mask\s*\(/.test(b.code || '');
    const runs = b.follow && !landmarks && sourcesOf(b).some(s => media[s] && media[s].type !== 'image');
    return `${head}
  <figure class="fig" data-board="${esc(b.id)}" style="${fit(b)}"><canvas role="img" aria-label="${esc(b.title)}"></canvas></figure>
  <div class="bar" data-for="${esc(b.id)}">
    ${runs ? `<button class="run" type="button" aria-label="Run" title="Run: follow the source">${PLAY_ICON}</button>` : ''}<button data-act="picture" class="on">Picture</button>${marks ? '<button data-act="process">Process</button><button data-act="replay">Replay</button>' : ''}
    <span class="meta">${marks ? `${marks} marks · ${stages} stage${stages === 1 ? '' : 's'} · ` : ''}${b.width}×${b.height}${landmarks ? ' · follows a pose: run it in the studio' : ''}</span>
  </div>
  ${b.code ? `<div class="live" data-for="${esc(b.id)}"></div>` : ''}
  ${after}
  ${b.code ? codeBox(b) : ''}`;
  };
  const numbered = b => { n++; return `<h2>${/^[\d§]/.test(b.title) ? '' : `<span class="n">${n}</span>`}${esc(b.title)}</h2>`; };   // titles that carry their own number keep it alone
  const sections = list.map(b => {
    const kind = boardKind(b);
    if (kind === 'frame') {
      // A frame (a slide): its boards side by side, in rows as on the canvas, sized as they are there.
      const inside = boardsInFrame(doc, b);
      // Rows: boards that overlap vertically sit side by side (left to right), as on the canvas.
      const rows = [];
      for (const x of [...inside].sort((a, c) => a.y - c.y)) {
        const r = rows.find(r => r.some(o => x.y < o.y + o.height && o.y < x.y + x.height));
        if (r) r.push(x); else rows.push([x]);
      }
      for (const r of rows) r.sort((a, c) => a.x - c.x);
      const lone = inside.length === 1;
      // Inside a frame, what repeats the frame's title (a board's heading, a document's first heading) is left out.
      const same = t => t.replace(/ · notes$/, '').trim() === b.title.trim();
      const cell = x => {
        if (boardKind(x) !== 'markdown') return boardHtml(x, same(x.title) ? '' : `<h3>${esc(x.title)}</h3>`, lone);
        const src = (/ · notes$/.test(x.title) ? withoutCode(x.code || '') : x.code || '').replace(/^\s*#{1,3}\s+(.+)\n/, (all, t) => (same(t) ? '' : all));
        return `<div class="md" id="${esc(x.id)}">${mdHtml(src)}</div>`;
      };
      return `<section class="frame" id="${esc(b.id)}">${/^\s*$/.test(b.title) || inside.some(x => boardKind(x) === 'markdown' && /^#\s/m.test(x.code || '')) ? '' : numbered(b)}
  ${rows.map(r => `<div class="row" style="grid-template-columns: ${r.map(x => `${x.width}fr`).join(' ')}">${r.map(x => `<div class="cell" id="${esc(x.id)}">${cell(x)}</div>`).join('')}</div>`).join('\n  ')}
</section>`;
    }
    if (kind === 'markdown') return `<section class="doc" id="${esc(b.id)}"><div class="md">${mdHtml(b.code || '')}</div></section>`;
    return `<section class="board" id="${esc(b.id)}">${boardHtml(b, numbered(b))}</section>`;
  });

  const html = sections.join('\n');
  const usesMath = /class="katex/.test(html) || /class="katex/.test(intro ? md(intro) : '');
  const usesMermaid = /<pre class="mermaid">/.test(html);
  // A table of contents only when no document links the boards already.
  const linked = boardsOf(doc).some(b => boardKind(b) === 'markdown' && /\[\[/.test(b.code || ''));
  const toc = linked ? [] : list.filter(b => boardKind(b) !== 'markdown' || /^#\s/m.test(b.code || ''));
  const headerParts = [
    lead ? '' : `<h1>${esc(title)}</h1>`,
    byline ? `<div class="by">${esc(byline)}</div>` : '',
    intro ? `<div class="md">${mdHtml(intro)}</div>` : '',
    toc.length > 2 ? `<nav class="toc">${toc.map(b => `<a href="#${esc(b.id)}">${esc(b.title)}</a>`).join('')}</nav>` : ''
  ].filter(Boolean);
  const headerHtml = headerParts.length ? `<header>\n  ${headerParts.join('\n  ')}\n</header>` : '';
  const payload = JSON.stringify(doc).replace(/</g, '\\u003c');
  const mediaPayload = JSON.stringify(media).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="generator" content="Artist Model Studio">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap">
${usesMath ? '<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.18.9/dist/katex.min.css">' : ''}
<style>
/* Artist Model Studio's dark theme: near-greyscale, quiet, one warm accent. */
:root { color-scheme: dark; --bg: #1b1b1b; --panel: #222; --line: #353535; --text: #dadada; --soft: #bdbdbd; --muted: #8c8c8c; --accent: #c9c7c2; --warm: #c8664f; --code: #141414;
  --sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; --mono: 'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace; }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.6 var(--sans); }
main { max-width: 980px; margin: 0 auto; padding: 56px 20px 96px; }
header { display: grid; gap: 12px; padding-bottom: 28px; border-bottom: 1px solid var(--line); }
header h1 { font-size: clamp(1.7rem, 4vw, 2.3rem); line-height: 1.2; font-weight: 600; letter-spacing: -0.015em; margin: 0; text-wrap: balance; }
header .by { color: var(--muted); font-size: 0.9rem; }
nav.toc { display: flex; flex-wrap: wrap; gap: 4px 14px; font: 0.8rem var(--mono); color: var(--muted); }
nav.toc a { color: inherit; text-decoration: none; }
nav.toc a:hover { color: var(--text); }
section { padding-block: 40px; border-bottom: 1px solid var(--line); display: grid; gap: 14px; }
section.doc { padding-block: 36px; }
section.frame .row { display: grid; gap: 28px; align-items: start; }
section.frame .row + .row { margin-top: 20px; }
section.frame .cell { display: grid; gap: 12px; min-width: 0; align-content: start; }
section.frame h3 { font-size: 1rem; font-weight: 500; margin: 0; }
@media (max-width: 760px) { section.frame .row { grid-template-columns: 1fr !important; } }
h2 { font-size: 1.15rem; font-weight: 500; margin: 0; }
h2 .n { color: var(--muted); font: 0.8rem var(--mono); margin-right: 10px; }
figure.fig, .stage { position: relative; margin: 0; width: 100%; justify-self: start; border: 1px solid var(--line); border-radius: 4px; overflow: hidden; background: var(--code); }
figure.fig canvas, .stage iframe { display: block; width: 100%; height: 100%; border: 0; }
.bar .run { display: inline-grid; place-items: center; width: 28px; padding: 5px 0; color: var(--text); }
.bar .run:hover { color: var(--accent); }
.stage.p5:empty { background: var(--code) repeating-linear-gradient(45deg, transparent 0 10px, rgba(255, 255, 255, 0.015) 10px 20px); }
.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 2px; font: 0.78rem var(--sans); border-bottom: 1px solid var(--line); }
.bar button { font: inherit; border: 0; border-bottom: 2px solid transparent; background: transparent; color: var(--muted); padding: 5px 10px; margin-bottom: -1px; cursor: pointer; }
.bar button.on { color: var(--text); border-bottom-color: var(--accent); }
.bar .meta { margin-left: auto; color: var(--muted); font-family: var(--mono); font-size: 0.72rem; }
.live { display: grid; grid-template-columns: max-content 1fr 4.5em; gap: 6px 12px; align-items: center; font: 0.78rem var(--mono); color: var(--muted); }
.live:empty { display: none; }
.live input[type=range] { width: 100%; accent-color: var(--accent); }
.live output { text-align: right; color: var(--text); font-variant-numeric: tabular-nums; }
.md { max-width: 72ch; }
.md > :first-child { margin-top: 0; } .md > :last-child { margin-bottom: 0; }
.md h1 { font-size: 1.7rem; line-height: 1.2; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 0.6em; }
.md h2 { font-size: 1.2rem; margin: 1.2em 0 0.5em; } .md h3, .md h4 { font-size: 1rem; margin: 1.1em 0 0.4em; }
.md p, .md li { color: var(--soft); }
.idea { color: var(--soft); }
.md a { color: var(--accent); text-underline-offset: 3px; }
.md a.md-link { text-decoration-style: dotted; }
.md a.missing { color: var(--muted); }
.md code { font: 0.86em var(--mono); color: var(--accent); }
.md pre, pre { background: var(--code); border: 1px solid var(--line); border-radius: 4px; padding: 14px 16px; overflow: auto; }
.md pre code, pre code { color: #d4d4d4; font: 12.5px/1.6 var(--mono); font-variant-ligatures: none; }
.md table { border-collapse: collapse; font-size: 0.92em; }
.md th, .md td { border-bottom: 1px solid var(--line); padding: 6px 14px 6px 0; text-align: left; }
.md blockquote { border-left: 2px solid var(--line); margin: 0; padding-left: 16px; color: var(--soft); }
.md mark { background: rgba(200, 102, 79, 0.3); color: inherit; padding: 0 0.15em; border-radius: 2px; }
.md .md-tag { color: var(--muted); font-size: 0.85em; }
.md img { max-width: 100%; border-radius: 3px; border: 1px solid var(--line); display: block; }
.md .md-callout { border-left: 3px solid #555; background: rgba(255, 255, 255, 0.04); border-radius: 3px; padding: 10px 14px; margin: 0 0 1em; }
.md .md-callout-head, .md .md-callout summary { font-weight: 500; display: flex; gap: 8px; align-items: baseline; color: var(--text); cursor: pointer; }
.md .md-callout-body { margin-top: 6px; } .md .md-callout-body > :last-child { margin-bottom: 0; }
.md .md-callout-tip, .md .md-callout-success { border-left-color: #7fb069; }
.md .md-callout-warning, .md .md-callout-danger, .md .md-callout-error { border-left-color: var(--warm); }
.md .md-callout-info, .md .md-callout-note, .md .md-callout-abstract, .md .md-callout-example { border-left-color: #5b7fd1; }
.md .md-callout-quote { border-left-color: var(--accent); }
.md pre.mermaid { background: none; border: 0; text-align: center; }
.notes { padding-top: 4px; }
.codebox { border: 1px solid var(--line); border-radius: 6px; overflow: hidden; }
.codebox .tabs { display: flex; gap: 2px; padding: 4px 6px 0; border-bottom: 1px solid var(--line); }
.codebox .tabs button { background: none; border: 0; border-bottom: 2px solid transparent; color: var(--muted); font: 0.78rem var(--mono); padding: 6px 10px; cursor: pointer; }
.codebox .tabs button[aria-selected="true"] { color: var(--text); border-bottom-color: var(--accent); }
.codebox .tabs .copy { margin-left: auto; display: grid; place-items: center; }
.codebox .tabs .copy:hover, .codebox .tabs .copy.done { color: var(--text); }
.codebox pre { margin: 0; border: 0; border-radius: 0; max-height: 420px; overflow: auto; }
details.code summary { cursor: pointer; color: var(--muted); font: 0.78rem var(--mono); }
details.code pre { margin-top: 10px; }
footer { color: var(--muted); font-size: 0.82rem; margin-top: 48px; }
@media (max-width: 640px) { .live { grid-template-columns: max-content 1fr 3.5em; } }
</style>
</head>
<body>
<main>
${headerHtml}
${html}
<footer>Made in Artist Model Studio. The drawing is inside this page: open it in the studio to keep working on it.</footer>
</main>
<script type="application/json" id="ams-doc">${payload}</script>
<script type="application/json" id="ams-media">${mediaPayload}</script>
${needsP5 && p5Source ? `<script type="text/plain" id="ams-p5">${p5Source.replace(/<\/script/gi, '<\\/script')}</script>` : ''}
<noscript><p>The drawings on this page are drawn by a script: allow scripts to see them.</p></noscript>
<script>
${pageRuntime().replace(/<\/script/gi, '<\\/script')}
;
${PAGE_UI}
</script>
${usesMermaid ? `<script type="module">import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs'; mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' }); mermaid.run({ querySelector: 'pre.mermaid' });</script>` : ''}
</body>
</html>
`;
}

const PAGE_UI = String.raw`
// ---- the page: boards drawn by the studio's renderer; sources sampled here; sketches in frames ----
(function () {
  const doc = normalizeDocument(JSON.parse(document.getElementById('ams-doc').textContent));
  const MEDIA = JSON.parse(document.getElementById('ams-media').textContent);
  installLines(doc);

  // Sources: pictures, GIFs (frame by frame) and videos, sampled small, fitted like the studio (cover).
  const SRC = {};
  const SIDE = 256;
  const sample = s => {
    const el = s.canvas || s.el;
    const w0 = s.canvas ? s.canvas.width : (el.videoWidth || el.naturalWidth), h0 = s.canvas ? s.canvas.height : (el.videoHeight || el.naturalHeight);
    if (!w0 || !h0) return;
    const k = Math.min(1, SIDE / Math.max(w0, h0)), w = Math.max(1, Math.round(w0 * k)), h = Math.max(1, Math.round(h0 * k));
    if (s.frame.width !== w || s.frame.height !== h) { s.frame.width = w; s.frame.height = h; }
    const c = s.frame.getContext('2d', { willReadFrequently: true });
    c.drawImage(el, 0, 0, w, h);
    s.data = c.getImageData(0, 0, w, h).data; s.version++;
  };
  const toBytes = url => { const b = atob(url.slice(url.indexOf(',') + 1)); const a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; };
  const ready = [];
  for (const [name, m] of Object.entries(MEDIA)) {
    const s = SRC[name] = { frame: document.createElement('canvas'), data: null, version: 0, type: m.type };
    if (m.type === 'video') {
      const v = s.el = document.createElement('video'); v.muted = true; v.loop = true; v.playsInline = true; v.src = m.url;
      ready.push(new Promise(ok => { v.addEventListener('loadeddata', () => { sample(s); ok(); }, { once: true }); v.load(); }));
    } else if (m.type === 'animated' && typeof ImageDecoder !== 'undefined') {
      s.canvas = document.createElement('canvas');
      const dec = new ImageDecoder({ data: toBytes(m.url), type: m.url.slice(5, m.url.indexOf(';')) });
      s.index = 0; s.count = 1; s.dec = dec;
      s.show = async i => { const { image } = await dec.decode({ frameIndex: i }); s.canvas.width = image.displayWidth; s.canvas.height = image.displayHeight; s.canvas.getContext('2d').drawImage(image, 0, 0); s.duration = (image.duration || 100000) / 1000; image.close(); sample(s); };
      ready.push(dec.tracks.ready.then(() => dec.completed).then(() => { s.count = dec.tracks.selectedTrack.frameCount; return s.show(0); }).catch(err => console.warn('source ' + name + ':', err)));
    } else {
      const img = s.el = new Image(); img.src = m.url;
      ready.push(img.decode().then(() => sample(s)).catch(() => {}));
    }
  }
  // The next frame of every moving source.
  let busy = false;
  const advance = async () => {
    if (busy) return; busy = true;
    try {
      for (const s of Object.values(SRC)) {
        if (s.el && s.type === 'video') { if (s.el.paused) s.el.play().catch(() => {}); sample(s); }
        else if (s.dec && s.count > 1) { s.index = (s.index + 1) % s.count; await s.show(s.index); }
      }
    } finally { busy = false; }
  };
  setSourceProvider((name, rect, fit) => {
    const s = SRC[name];
    if (!s || !s.data) return null;
    const sw = s.frame.width, sh = s.frame.height, data = s.data, ra = rect.width / rect.height, sa = sw / sh;
    const wide = fit === 'contain' ? sa < ra : sa > ra;
    const toSrc = (fx, fy) => (wide ? [0.5 + (fx - 0.5) * (ra / sa), fy] : [fx, 0.5 + (fy - 0.5) * (sa / ra)]);
    const rgb = (fx, fy) => { const [u, v] = toSrc(fx, fy); if (u < 0 || u > 1 || v < 0 || v > 1) return [0, 0, 0]; const x = Math.max(0, Math.min(sw - 1, Math.floor(u * sw))), y = Math.max(0, Math.min(sh - 1, Math.floor(v * sh))); const i = (y * sw + x) * 4; return [data[i], data[i + 1], data[i + 2]]; };
    const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
    const lum = c => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
    const world = (x, y) => [(x - rect.x) / rect.width, (y - rect.y) / rect.height];
    return { ready: true, name, frame: s.version, width: sw, height: sh, rect, rgb, color: (x, y) => hex(rgb(x, y)), value: (x, y) => lum(rgb(x, y)),
      colorAt: (x, y) => hex(rgb(...world(x, y))), valueAt: (x, y) => lum(rgb(...world(x, y))), pose: [], hands: [], mask: () => 0,
      pixels: (w, h) => { const o = new Float32Array(w * h * 3); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = rgb((x + 0.5) / w, (y + 0.5) / h), i = (y * w + x) * 3; o[i] = c[0]; o[i + 1] = c[1]; o[i + 2] = c[2]; } return o; } };
  });

  // The run control: ▶ to run, ‖ to pause (a glyph, with its name for screen readers).
  const GLYPH = { play: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5l11 7-11 7z" fill="currentColor"/></svg>', pause: '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" fill="currentColor"/></svg>' };
  const setRun = (btn, running) => { btn.innerHTML = running ? GLYPH.pause : GLYPH.play; btn.setAttribute('aria-label', running ? 'Pause' : 'Run'); };

  const views = [];
  for (const fig of document.querySelectorAll('figure.fig')) {
    const id = fig.dataset.board, one = boardDoc(doc, id), b = boardById(doc, id);
    const bar = document.querySelector('.bar[data-for="' + CSS.escape(id) + '"]');
    const order = [];
    const reorder = () => { order.length = 0; const rk = new Map(one.stages.map((s, i) => [s.id, i])); one.elements.map((e, i) => [e, i]).sort((a, c) => (rk.get(a[0].stage) ?? 0) - (rk.get(c[0].stage) ?? 0) || a[1] - c[1]).forEach(x => order.push(x[0])); };
    reorder();
    const v = { mode: 'picture', shown: Infinity, timer: 0 };
    const cv = fig.querySelector('canvas'), ctx = cv.getContext('2d');
    v.draw = () => {
      const w = fig.clientWidth, h = fig.clientHeight, dpr = window.devicePixelRatio || 1;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = one.artboard.ground || '#f3efe6'; ctx.fillRect(0, 0, cv.width, cv.height);
      // A source shown under the board (a reference, as in the studio).
      const under = b.source && SRC[b.source];
      const img = under && (under.canvas || under.el);
      if (img && (img.width || img.videoWidth)) {
        const iw = img.videoWidth || img.naturalWidth || img.width, ih = img.videoHeight || img.naturalHeight || img.height;
        const k = (b.sourceFit === 'contain' ? Math.min : Math.max)(cv.width / iw, cv.height / ih);
        ctx.save(); ctx.globalAlpha = b.sourceOpacity ?? 0.5; ctx.drawImage(img, (cv.width - iw * k) / 2, (cv.height - ih * k) / 2, iw * k, ih * k); ctx.restore();
      }
      const d = v.shown < order.length ? { ...one, elements: order.slice(0, v.shown) } : one;
      renderDocument(ctx, d, { mode: v.mode, ground: false, transform: { x: 0, y: 0, scale: (w / one.artboard.width) * dpr } });
    };
    bar && bar.addEventListener('click', e => {
      const btn = e.target.closest('button'); if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'picture' || act === 'process') {
        v.mode = act;
        for (const x of bar.querySelectorAll('button[data-act="picture"], button[data-act="process"]')) x.classList.toggle('on', x.dataset.act === act);
        v.draw(); return;
      }
      clearInterval(v.timer); v.shown = 0;
      const step = Math.max(20, Math.min(400, 6000 / Math.max(1, order.length)));
      v.timer = setInterval(() => { v.shown += Math.max(1, Math.round(order.length / 300)); v.draw(); if (v.shown >= order.length) { clearInterval(v.timer); v.shown = Infinity; v.draw(); } }, step);
      v.draw();
    });
    // The board's code: its ranges are sliders; moving one reruns the code here and redraws the board.
    let code = b && b.code;
    const codeEl = document.querySelector('code[data-code-for="' + CSS.escape(id) + '"]');
    const rerun = () => {
      if (!code) return;
      const res = runScript(code, { base: { ...createDocument({ width: one.artboard.width, height: one.artboard.height, ground: one.artboard.ground }), stages: [] }, by: { kind: 'code', name: id } });
      if (res.error) return;
      Object.assign(doc.brushes, res.doc.brushes || {}); installLines(doc);
      const made = res.doc.elements.map(e => ({ ...e, by: { kind: 'code', name: id } }));
      const stageOf = new Map(res.doc.stages.map(s => [s.id, (one.stages.find(t => t.name === s.name) || one.stages[0]).id]));
      for (const e of made) e.stage = stageOf.get(e.stage) || one.stages[0].id;
      one.elements = [...one.elements.filter(e => !(e.by && e.by.kind === 'code' && e.by.name === id)), ...made];
      reorder(); v.draw();
    };
    const live = document.querySelector('.live[data-for="' + CSS.escape(id) + '"]');
    if (live && code) {
      for (const c of findControls(code)) {
        const step = c.step || stepFor(c.min, c.max);
        const label = document.createElement('span');
        label.textContent = c.kind === 'param' ? c.key : c.name || 'line ' + (code.slice(0, c.from).split('\n').length);
        const input = document.createElement('input');
        input.type = 'range'; input.min = c.min; input.max = c.max; input.step = step; input.value = c.value;
        const out = document.createElement('output'); out.textContent = fmt(c.value, step);
        let t = 0;
        input.addEventListener('input', () => {
          const cur = findControls(code).find(x => x.id === c.id); if (!cur) return;
          const val = fmt(Number(input.value), step);
          code = code.slice(0, cur.from) + val + code.slice(cur.to);
          out.textContent = val;
          if (codeEl) codeEl.textContent = code;
          clearTimeout(t); t = setTimeout(rerun, 60);
        });
        live.append(label, input, out);
      }
    }
    // Run: a board that follows a moving source redraws from each new frame, while it is on screen.
    const run = bar && bar.querySelector('.run');
    if (run) {
      let timer = 0, seen = true;
      new IntersectionObserver(es => { seen = es[0].isIntersecting; }).observe(fig);
      const tick = async () => { if (!seen) return; await advance(); rerun(); };
      run.addEventListener('click', () => {
        if (timer) { clearInterval(timer); timer = 0; setRun(run, false); return; }
        timer = setInterval(tick, 110); setRun(run, true);
      });
    }
    views.push(v);
  }

  // HTML boards: their page, sandboxed. p5 boards: Run starts the sketch (p5.js travels in this page).
  const board = id => boardById(doc, id);
  const bridge = b => '<script>window.ams = Object.freeze({ board: ' + JSON.stringify(b.title) + ', width: ' + b.width + ', height: ' + b.height + ', call: () => Promise.reject(new Error("the studio is not here: open this page in the studio")), mark: () => Promise.reject(new Error("the studio is not here")), frame: () => Promise.reject(new Error("the studio is not here")) });<\/script>';
  for (const f of document.querySelectorAll('iframe[data-html]')) { const b = board(f.dataset.html); if (b) f.srcdoc = '<!doctype html><meta charset="utf-8">' + bridge(b) + (b.code || ''); }
  const p5 = document.getElementById('ams-p5');
  for (const st of document.querySelectorAll('.stage[data-p5]')) {
    const b = board(st.dataset.p5), btn = document.querySelector('.run[data-p5-run="' + CSS.escape(st.dataset.p5) + '"]');
    btn.addEventListener('click', () => {
      const old = st.querySelector('iframe');
      if (old) { old.remove(); setRun(btn, false); return; }
      const f = document.createElement('iframe'); f.setAttribute('sandbox', 'allow-scripts'); f.title = b.title;
      // Files the sketch loads by name (loadImage("seurat.jpg")) come from the pictures in this page.
      const files = {};
      for (const m of (b.code || '').matchAll(/(?:loadImage|createVideo|loadJSON|loadStrings)\(\s*["'\x60]([^"'\x60]+)["'\x60]/g)) { const k = m[1].split('/').pop().replace(/\.[^.]+$/, ''); if (MEDIA[k]) files[m[1]] = MEDIA[k].url; }
      const loader = '(() => { const F = ' + JSON.stringify(files).replace(/</g, '\\u003c') + '; for (const k of ["loadImage", "createVideo", "loadJSON", "loadStrings"]) { const f = p5.prototype[k]; if (typeof f === "function") p5.prototype[k] = function (p, ...r) { return f.call(this, F[p] || p, ...r); }; } })();';
      f.srcdoc = '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;height:100%;overflow:hidden;background:transparent}canvas{display:block;width:100%!important;height:100%!important;object-fit:contain}</style>' + bridge(b) + '<script>' + (p5 ? p5.textContent : '') + '<\/script><script>' + loader + '<\/script><script>' + (b.code || '').replace(/<\/script/gi, '<\\/script') + '<\/script>';
      st.prepend(f); setRun(btn, true);
    });
  }

  // Code boxes: a tab per way of writing the code; Copy copies the tab showing.
  for (const box of document.querySelectorAll('.codebox')) {
    const tabs = box.querySelectorAll('[data-tab]');
    for (const t of tabs) t.addEventListener('click', () => {
      for (const x of tabs) x.setAttribute('aria-selected', String(x === t));
      for (const p of box.querySelectorAll('[data-pane]')) p.hidden = p.dataset.pane !== t.dataset.tab;
    });
    const copy = box.querySelector('.copy');
    copy.addEventListener('click', () => {
      const pane = box.querySelector('[data-pane]:not([hidden])');
      navigator.clipboard?.writeText(pane.textContent).then(() => { copy.classList.add('done'); setTimeout(() => copy.classList.remove('done'), 900); });
    });
  }

  const all = () => views.forEach(v => v.draw());
  KIT.onImageLoad = () => requestAnimationFrame(all);
  window.addEventListener('resize', () => requestAnimationFrame(all));
  all();
  Promise.all(ready).then(all);
})();
`;

/** The drawing inside an exported page (or null). */
export function docFromPage(html) {
  const m = String(html).match(/<script type="application\/json" id="ams-doc">([\s\S]*?)<\/script>/);
  if (!m) return null;
  try { return JSON.parse(m[1]); } catch { return null; }
}

export { MAIN };
