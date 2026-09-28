import { describe, it, expect } from 'vitest';
import { md } from '../src/workbench/docsContent.js';
import { WALKTHROUGHS } from '../src/workbench/walkthroughs.js';
import { EXERCISES } from '../src/process/exercises.js';
import { runScript } from '../src/process/script.js';

describe('docs markdown', () => {
  it('renders headings, lists, tables and code, escaping code', () => {
    const html = md('## Title\n\nSome *em* and `code` <b>.\n\n1. one\n2. two\n\n| A | B |\n|---|---|\n| x | y |\n\n```\nline(<pts>)\n```');
    expect(html).toContain('<h3>Title</h3>');
    expect(html).toContain('<em>em</em>');
    expect(html).toContain('<b>');                       // safe HTML is kept (Obsidian-flavored)
    expect(html).toMatch(/<ol>\s*<li>one<\/li>\s*<li>two<\/li>\s*<\/ol>/);
    expect(html).toContain('<th>A</th>');
    expect(html).toContain('<td>y</td>');
    expect(html).toContain('<code>line(&lt;pts&gt;)</code></pre>');   // code is escaped
  });
});

describe('walkthroughs', () => {
  it('every step narrates, and waiting steps can be skipped', () => {
    for (const w of WALKTHROUGHS) {
      expect(w.steps.length).toBeGreaterThan(2);
      for (const s of w.steps) {
        expect(typeof s.say).toBe('string');
        if (s.until) expect(typeof s.until).toBe('function');
      }
    }
  });

  it('the line-walk lesson exercise runs', () => {
    const ex = EXERCISES.find(e => e.id === 'whose-line');
    const res = runScript(ex.source);
    expect(res.error).toBeNull();
    expect(res.doc.lines.teeth).toBeTruthy();
    expect(res.doc.elements.filter(e => e.realize.brush === 'teeth')).toHaveLength(2);
  });
});
