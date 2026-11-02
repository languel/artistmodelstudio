// @vitest-environment happy-dom
import { it, expect } from 'vitest';
import { playerPageHtml, titlesOf } from '../src/workbench/playerPage.js';
import { ProcessStore, createDocument, normalizeDocument } from '../src/process/document.js';

const SCRIPT = {
  id: 't', title: 'A test', cues: [
    { goto: 'Slide', say: 'Hello.' },
    { click: { summary: 'Slide · notes' } },
    { select: { pseudo: 'Slide · notes', line: 1 } },
    { select: { code: 'Slide · code', from: 'const a', to: 'const b' } }
  ]
};

const appWith = () => {
  const store = new ProcessStore(normalizeDocument(createDocument()));
  const f = store.addBoard({ title: 'Slide', x: 0, y: 0, width: 1000, height: 600, adopt: false });
  store.updateBoard(f.id, { kind: 'frame' });
  const sk = store.addBoard({ title: 'Slide', x: 20, y: 20, width: 300, height: 200, adopt: false });
  store.updateBoard(sk.id, { kind: 'html', code: '<p>sketch</p>' });
  const n = store.addBoard({ title: 'Slide · notes', x: 340, y: 20, width: 400, height: 200, adopt: false });
  store.updateBoard(n.id, { kind: 'markdown', code: '> [!abstract]- Pseudocode\n> ```pseudo\n> a = b\n> ```\n' });
  const c = store.addBoard({ title: 'Slide · code', x: 340, y: 240, width: 400, height: 300, adopt: false });
  store.updateBoard(c.id, { kind: 'code', of: sk.id });
  store.updateBoard(sk.id, { code: 'const a = 1;\nconst b = 2;' });
  return { store };
};

it('lists the boards a script names', () => {
  expect(titlesOf(SCRIPT).sort()).toEqual(['Slide', 'Slide · code', 'Slide · notes']);
});

it('makes a page with the slide, the script and a runtime that parses', async () => {
  const html = await playerPageHtml(appWith(), SCRIPT, [], { loadThreeFile: async () => '', p5Text: async () => '' });
  expect(html).toContain('data-board="Slide · notes"');
  expect(html).toContain('data-board="Slide · code"');
  expect(html).toContain('<span class="t">const a = 1;</span>');
  expect(html).toContain('class="play"');
  const script = /<script>(function scriptDraw[\s\S]*?)\n\((function playerRuntime[\s\S]*)\)\((\{.*\})\);<\/script>\s*<\/body>/.exec(html);
  expect(script).toBeTruthy();
  expect(() => new Function(`${script[1]}\nreturn (${script[2]})`)).not.toThrow();
  const data = JSON.parse(script[3].replace(/\\u003c/g, '<'));
  expect(data).toMatchObject({ id: 't', slides: [{ w: 1000, h: 600 }] });
  expect(data.where).toEqual({ 'Slide': 0, 'Slide · notes': 0, 'Slide · code': 0 });
  expect(data.cues).toHaveLength(4);
});

it('refuses a script whose slide is not in the scene, or that names boards outside it', async () => {
  const app = appWith();
  await expect(playerPageHtml(app, { ...SCRIPT, cues: [{ goto: 'Nowhere' }] })).rejects.toThrow(/not a slide/);
  await expect(playerPageHtml(app, { ...SCRIPT, cues: [{ goto: 'Slide' }, { drag: { on: 'Elsewhere', path: [] } }] })).rejects.toThrow(/outside its slide/);
});
