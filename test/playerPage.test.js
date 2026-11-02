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
  expect(html).toContain('<span class="t"><span class="k">const</span> a = <span class="n">1</span>;</span>');   // (coloured)
  expect(html).toContain('class="play"');
  const script = /<script>(function scriptDraw[\s\S]*?)\n\((function playerRuntime[\s\S]*)\)\((\{.*\})\);<\/script>\s*<\/body>/.exec(html);
  expect(script).toBeTruthy();
  expect(() => new Function(`${script[1]}\nreturn (${script[2]})`)).not.toThrow();
  const data = JSON.parse(script[3].replace(/\\u003c/g, '<'));
  expect(data).toMatchObject({ id: 't', slides: [{ w: 1000, h: 600 }] });
  expect(data.where).toEqual({ 'Slide': 0, 'Slide · notes': 0, 'Slide · code': 0 });
  expect(data.cues).toHaveLength(4);
  // the timeline: a segment's worth of length for each cue, running one after another
  expect(data.spans).toHaveLength(4);
  expect(data.spans[1].start).toBeCloseTo(data.spans[0].dur);
  expect(data.total).toBeCloseTo(data.spans.reduce((a, x) => a + x.dur, 0));
  expect(html).toContain('class="tlhost"');
  expect(html).toContain('class="mp4"');   // the render button (shown when the page is served by the dev server)
  expect(data.fade).toBe(1500);
  expect(html).toContain('class="fade"');
  expect(html).toContain('function timelineBar');
});

it('refuses a script whose slide is not in the scene, or that names boards outside it', async () => {
  const app = appWith();
  await expect(playerPageHtml(app, { ...SCRIPT, cues: [{ goto: 'Nowhere' }] })).rejects.toThrow(/not a slide/);
  await expect(playerPageHtml(app, { ...SCRIPT, cues: [{ goto: 'Slide' }, { drag: { on: 'Elsewhere', path: [] } }] })).rejects.toThrow(/outside its slide/);
});

it('keeps the sliders of the code: a control in the code gets a widget slot, and the code goes with its values for the page', async () => {
  const app = appWith();
  const sk = app.store.doc.boards.find(b => b.kind === 'html');
  app.store.updateBoard(sk.id, { code: "let fps = 8 /* 3..24 */;\nlet clip = 'Walk' /* Survey|Walk|Run */;\nconst b = 2;" });
  const html = await playerPageHtml(app, SCRIPT, [], { loadThreeFile: async () => '', p5Text: async () => '' });
  expect(html).toContain('<i class="w" data-name="fps" data-kind="range"></i>');
  expect(html).toContain('<span class="cv" data-name="clip">');
  const m = /data-sketch="Slide" data-controls="([^"]*)"/.exec(html);
  const specs = JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  expect(specs.map(c => c.name).sort()).toEqual(['clip', 'fps']);
  expect(specs.find(c => c.name === 'fps')).toMatchObject({ kind: 'range', min: 3, max: 24, value: 8 });
  expect(html).toContain('.ln .cv');   // (the styles)
});

it('runs: the page plays a script, a `set` moves the widget in the code, and playing again starts clean', async () => {
  const app = appWith();
  const sk = app.store.doc.boards.find(b => b.kind === 'html');
  app.store.updateBoard(sk.id, { code: 'let fps = 8 /* 3..24 */;\nconst b = 2;' });
  const script = { id: 'run', title: 'Run', fade: 0, cues: [{ goto: 'Slide', hold: 50 }, { set: { on: 'Slide', name: 'fps', value: 20 }, hold: 50 }] };
  const html = await playerPageHtml(app, script, [], { loadThreeFile: async () => '', p5Text: async () => '' });
  document.body.className = '';
  document.body.innerHTML = /<body>([\s\S]*?)<script>/.exec(html)[1];
  const code = /<script>([\s\S]*?)<\/script>\s*<\/body>/.exec(html)[1];
  new Function(code)();
  const input = document.querySelector('.pane.code input[type=range]'), cv = document.querySelector('.pane.code .cv');
  expect(input).toBeTruthy();
  expect(cv.textContent).toBe('8');
  await window.__ams.play();
  expect(cv.textContent).toBe('20');   // the script moved the widget, and its value in the code
  expect(input.value).toBe('20');
  await window.__ams.play();           // again: reset, then the same
  expect(cv.textContent).toBe('20');
}, 20000);
