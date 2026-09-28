/**
 * Markdown, Obsidian-flavored, to HTML (after underscores' livecode renderer).
 *
 *   GFM            tables, task lists, strikethrough, autolinks
 *   math           $inline$, $$display$$, \(inline\), \[display\] (KaTeX, rendered here)
 *   ```mermaid     left as <pre class="mermaid"> for the page to render (Mermaid loads on demand)
 *   callouts       > [!note] Title   (> [!tip]- folded)   note, tip, info, warning, danger, quote…
 *   ==highlight==  #tags
 *   [[Board]]  [[Board|shown]]  [[Board#Heading]]  [[scene:Title]]   links into the drawing
 *   ![[Board]]  ![[asset:Title]]                                     embeds (filled in by the page)
 *   --- front matter ---  (at the top) is read as properties and not shown
 *
 * Raw HTML is kept but sanitized: no scripts, frames, forms or event handlers, and only ordinary
 * link protocols. The result is a string: the canvas, page export and tests all use it.
 */
import { Marked } from 'marked';
import katex from 'katex';

export const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Strip what could run or escape: scripts, frames, forms, event handlers, javascript: links. */
export const sanitizeHtml = html => String(html || '')
  .replace(/<(script|style|iframe|object|embed|form|button|textarea|select|link|meta|base)\b[\s\S]*?(?:<\/\1\s*>|\/?>)/gi, '')
  .replace(/<input\b(?![^>]*type="checkbox")[^>]*>/gi, '')   // task-list checkboxes only
  .replace(/<\/?(script|style|iframe|object|embed|form|button|textarea|select|link|meta|base)\b[^>]*>/gi, '')
  .replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  .replace(/\s(href|src|xlink:href)\s*=\s*(["'])\s*(?:javascript|vbscript|data:text\/html)[^"']*\2/gi, '');

const CALLOUT_ICONS = { note: '✎', abstract: '≡', summary: '≡', info: 'i', todo: '☐', tip: '✦', hint: '✦', success: '✓', check: '✓', question: '?', help: '?', warning: '!', caution: '!', attention: '!', failure: '✗', fail: '✗', missing: '✗', danger: '⚡', error: '⚡', bug: '⚠', example: '▸', quote: '❝', cite: '❝' };

/** Front matter (YAML-ish key: value lines) at the top: { props, body }. */
export function frontMatter(src) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(src);
  if (!m) return { props: {}, body: src };
  const props = {};
  for (const line of m[1].split(/\r?\n/)) { const kv = /^\s*([\w-]+)\s*:\s*(.*)$/.exec(line); if (kv) props[kv[1]] = kv[2].replace(/^["']|["']$/g, ''); }
  return { props, body: src.slice(m[0].length) };
}

/** The link targets a document names ([[…]] and ![[…]]), for backlinks and checks. */
export function linksOf(src) {
  return [...String(src || '').matchAll(/(!?)\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)].map(m => ({ target: m[2].trim(), embed: m[1] === '!' }));
}

const math = (expr, displayMode) => {
  try { return katex.renderToString(expr, { displayMode, throwOnError: false, strict: 'ignore', output: 'html' }); }
  catch { return `<code class="md-math-error">${esc(expr)}</code>`; }
};

/**
 * Render Markdown to HTML. opts.resolve(target) → { href, title, missing } for [[links]] (optional:
 * without it links keep their target in data-link for the page to wire).
 */
export function renderMarkdown(source, { resolve = null } = {}) {
  const { body } = frontMatter(String(source ?? ''));
  // Math and fenced code first, so nothing inside them is read as Markdown.
  const stash = [];
  const keep = html => `\uE000${stash.push(html) - 1}\uE000`;
  let text = body;
  const fences = [];
  text = text.replace(/^([ \t]*)(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)\n\1\2[ \t]*$/gm, all => `\uE001${fences.push(all) - 1}\uE001`);
  text = text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, e) => keep(math(e.trim(), true)))
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, e) => keep(math(e.trim(), true)))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, e) => keep(math(e, false)))
    .replace(/(?<![\\$\w])\$(?!\s)([^$\n]+?)(?<!\s)\$(?![\w$])/g, (_, e) => keep(math(e, false)));
  text = text.replace(/\uE001(\d+)\uE001/g, (_, i) => fences[Number(i)]);

  const md = new Marked({ gfm: true, breaks: false });
  md.use({
    extensions: [
      { // ![[embed]]
        name: 'embed', level: 'inline',
        start: s => s.indexOf('![['),
        tokenizer(s) { const m = /^!\[\[([^\]|]+?)(?:\|([^\]]*))?\]\]/.exec(s); if (m) return { type: 'embed', raw: m[0], target: m[1].trim(), size: (m[2] || '').trim() }; },
        renderer: t => `<span class="md-embed" data-embed="${esc(t.target)}"${t.size ? ` data-size="${esc(t.size)}"` : ''}></span>`
      },
      { // [[link]]
        name: 'wikilink', level: 'inline',
        start: s => s.indexOf('[['),
        tokenizer(s) { const m = /^\[\[([^\]|#]+)(?:#([^\]|]*))?(?:\|([^\]]*))?\]\]/.exec(s); if (m) return { type: 'wikilink', raw: m[0], target: m[1].trim(), heading: (m[2] || '').trim(), label: (m[3] || '').trim() }; },
        renderer: t => {
          const r = resolve?.(t.target, t.heading) || {};
          const label = t.label || (t.heading ? `${t.target} › ${t.heading}` : t.target.replace(/^(scene|asset):/, ''));
          return `<a class="md-link${r.missing ? ' missing' : ''}" data-link="${esc(t.target)}"${t.heading ? ` data-heading="${esc(t.heading)}"` : ''} href="${esc(r.href || '#')}"${r.title ? ` title="${esc(r.title)}"` : ''}>${esc(label)}</a>`;
        }
      },
      { // ==highlight==
        name: 'highlight', level: 'inline',
        start: s => s.indexOf('=='),
        tokenizer(s) { const m = /^==(?!\s)([^=\n]+?)==/.exec(s); if (m) return { type: 'highlight', raw: m[0], tokens: this.lexer.inlineTokens(m[1]) }; },
        renderer(t) { return `<mark>${this.parser.parseInline(t.tokens)}</mark>`; }
      },
      { // #tag
        name: 'tag', level: 'inline',
        start: s => { const m = /(^|\s)#[\p{L}\d_/-]*\p{L}/u.exec(s); return m ? m.index + m[1].length : undefined; },
        tokenizer(s) { const m = /^#([\p{L}\d_/-]*\p{L}[\p{L}\d_/-]*)/u.exec(s); if (m) return { type: 'tag', raw: m[0], tag: m[1] }; },
        renderer: t => `<span class="md-tag">#${esc(t.tag)}</span>`
      }
    ],
    renderer: {
      code({ text, lang }) {
        const l = String(lang || '').trim().split(/\s/)[0].toLowerCase();
        if (l === 'mermaid') return `<pre class="mermaid">${esc(text)}</pre>`;
        if (l === 'math' || l === 'latex') return math(text, true);
        return `<pre class="md-code"><code${l ? ` class="language-${esc(l)}"` : ''}>${esc(text)}</code></pre>`;
      },
      blockquote({ tokens }) {
        // > [!type]± Title  → a callout (read from the rendered quote, so links and math inside still work).
        const inner = this.parser.parse(tokens).trim();
        const m = /^<p>\[!([\w-]+)\]([+-]?)[ \t]*([^\n<]*)(\n|<\/p>)/.exec(inner);
        if (!m) return `<blockquote>${inner}</blockquote>`;
        const kind = m[1].toLowerCase(), fold = m[2], title = m[3].trim() || kind[0].toUpperCase() + kind.slice(1);
        const rest = (m[4] === '\n' ? '<p>' : '') + inner.slice(m[0].length);
        const head = `<span class="md-callout-icon">${CALLOUT_ICONS[kind] || '▪'}</span><span class="md-callout-title">${esc(title)}</span>`;
        return fold
          ? `<details class="md-callout md-callout-${esc(kind)}"${fold === '+' ? ' open' : ''}><summary>${head}</summary><div class="md-callout-body">${rest}</div></details>`
          : `<div class="md-callout md-callout-${esc(kind)}"><div class="md-callout-head">${head}</div><div class="md-callout-body">${rest}</div></div>`;
      }
    }
  });
  let html = md.parse(text);
  html = html.replace(/\uE000(\d+)\uE000/g, (_, i) => stash[Number(i)]);
  return sanitizeHtml(html);
}

/**
 * The Docs panel's and exported pages' Markdown (the full renderer, headings one level down: a
 * page's ## is a section inside it).
 */
export const md = src => renderMarkdown(src).replace(/<(\/?)h([1-5])(\s|>)/g, (_, slash, n, rest) => `<${slash}h${Number(n) + 1}${rest}`);
