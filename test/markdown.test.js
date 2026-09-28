import { describe, it, expect } from 'vitest';
import { renderMarkdown, linksOf, frontMatter, sanitizeHtml } from '../src/process/markdown.js';

describe('markdown, Obsidian-flavored', () => {
  it('tables, tasks, math, mermaid', () => {
    const h = renderMarkdown(`| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\nInline $E = mc^2$ and\n\n$$\\int_0^1 x\\,dx$$\n\n\`\`\`mermaid\ngraph LR; A-->B\n\`\`\`\n\n\`\`\`js\nconst a = '$5 and $6'\n\`\`\``);
    expect(h).toContain('<table>');
    expect(h).toContain('type="checkbox"');
    expect(h).toContain('class="katex"');
    expect(h).toContain('katex-display');
    expect(h).toContain('<pre class="mermaid">graph LR; A--&gt;B</pre>');
    expect(h).toContain('$5 and $6');   // no math inside code
  });
  it('wikilinks, embeds, callouts, highlights, tags', () => {
    const h = renderMarkdown(`See [[Seurat: the painting|the painting]] and [[0.2 · The retina#Fovea]].\n\n![[1 · Sample]]\n\n> [!tip] Try it\n> Change **n** in [[3 · Scattered dots]].\n\n> [!note]- Folded\n> hidden\n\n==bright== #pointillism`, { resolve: t => ({ href: '#board', missing: t === 'nowhere' }) });
    expect(h).toContain('data-link="Seurat: the painting"');
    expect(h).toContain('>the painting</a>');
    expect(h).toContain('data-heading="Fovea"');
    expect(h).toContain('<span class="md-embed" data-embed="1 · Sample">');
    expect(h).toContain('md-callout md-callout-tip');
    expect(h).toContain('<strong>n</strong>');
    expect(h).toContain('data-link="3 · Scattered dots"');
    expect(h).toContain('<details class="md-callout md-callout-note">');
    expect(h).toContain('<mark>bright</mark>');
    expect(h).toContain('<span class="md-tag">#pointillism</span>');
  });
  it('front matter, links, sanitizing', () => {
    expect(frontMatter('---\ntitle: Eye\ntags: a\n---\n# Hi').props).toEqual({ title: 'Eye', tags: 'a' });
    expect(renderMarkdown('---\ntitle: Eye\n---\n# Hi')).not.toContain('title: Eye');
    expect(linksOf('[[A]] ![[B|200]] [[C#h|c]]')).toEqual([{ target: 'A', embed: false }, { target: 'B', embed: true }, { target: 'C', embed: false }]);
    const bad = renderMarkdown('<img src=x onerror="alert(1)"><script>alert(2)</script><a href="javascript:alert(3)">x</a><b>ok</b>');
    expect(bad).not.toMatch(/onerror|<script|javascript:/);
    expect(bad).toContain('<b>ok</b>');
    expect(sanitizeHtml('<iframe src="x"></iframe>ok')).toBe('ok');
  });
});
