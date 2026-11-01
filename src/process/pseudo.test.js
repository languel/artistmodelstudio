import { describe, it, expect } from 'vitest';
import { renderPseudo } from './pseudo.js';
import { renderMarkdown } from './markdown.js';

describe('pseudocode set like a paper', () => {
  it('numbers lines, indents blocks, bolds keywords and sets symbols', () => {
    const html = renderPseudo('for i = 1 ... n do\n  if a <= b then x <- 1\nreturn x');
    expect(html).toContain('<b class="kw">for</b>');
    expect(html).toContain('<b class="kw">do</b>');
    expect(html).toContain('--d:1');
    expect(html).toContain('≤');
    expect(html).toContain('←');
    expect(html).toContain('…');
    expect((html.match(/<li /g) || []).length).toBe(3);
  });
  it('renders $…$ as KaTeX and keeps # and // inside math', () => {
    const html = renderMarkdown('```pseudo\n$x \\leftarrow a # b$ # real comment\n```');
    expect(html).toContain('class="katex');
    expect(html).toContain('<span class="cm">');
    expect(html).toContain('real comment');
  });
  it('takes an Algorithm caption and blank lines', () => {
    const html = renderPseudo('Algorithm 2: Training\nrepeat\n\nuntil done');
    expect(html).toContain('<b>Algorithm 2</b> Training');
    expect(html).toContain('class="gap"');
  });
  it('escapes markup', () => {
    expect(renderPseudo('<script>')).not.toContain('<script>');
  });
});
