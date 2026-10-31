import { describe, it, expect } from 'vitest';
import { scorePrompt, generateScore } from '../src/process/prompt.js';
import { runScript } from '../src/process/script.js';
import { createDocument } from '../src/process/document.js';

describe('plain and process prompts', () => {
  it('the process brief asks for stages, decisions and reasons; the plain one for just the marks', () => {
    const p = scorePrompt({ prompt: 'a circle' }).system, q = scorePrompt({ prompt: 'a circle', plain: true }).system;
    expect(p).toContain('analysis → concept');
    expect(p).toContain('decide(');
    expect(q).not.toContain('analysis → concept');
    expect(q).toContain('Do NOT use stage(), decide(), note()');
    expect(q).toContain('VOCABULARY');                      // (the vocabulary and brushes are still there)
  });
  it('the plain example is a score that runs and makes marks in one stage', () => {
    const src = scorePrompt({ prompt: 'x', plain: true }).system.match(/```js\n([\s\S]*?)```/)[1];
    const r = runScript(src, { seed: 1 });
    expect(r.error).toBeFalsy();
    expect(r.doc.elements.length).toBeGreaterThan(3);
    expect(r.doc.stages.map(s => s.name)).toEqual(['Marks']);
  });
  it('generateScore passes plain on and records it', async () => {
    let seen = null;
    const res = await generateScore({ prompt: 'a circle', plain: true, width: 800, height: 800, complete: async a => { seen = a.system; return "```js\nartboard(800, 800, '#111')\nplane(circle(0.5, 0.5, 0.3), { color: '#fff' })\n```"; } });
    expect(seen).toContain('Do NOT use stage()');
    expect(res.doc.meta.plain).toBe(true);
    expect(res.doc.elements.length).toBe(1);
  });
});

describe('a new drawing', () => {
  it('starts with one stage: Marks', () => {
    expect(createDocument().stages.map(s => s.name)).toEqual(['Marks']);
  });
});
