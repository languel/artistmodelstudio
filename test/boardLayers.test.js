// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { ProcessStore, createDocument, normalizeDocument } from '../src/process/document.js';
import { boardsOf, opacityOf, blendOf, isLayered, canvasBlend, cssBlend } from '../src/process/boards.js';
import { Outputs } from '../src/workbench/outputs.js';

const store = () => new ProcessStore(normalizeDocument(createDocument()));

describe('boards as layers', () => {
  it('opacity and blend are stored only when they are not the plain values', () => {
    const s = store(), b = s.addBoard({ title: 'Over' });
    expect(isLayered(b)).toBe(false);
    s.updateBoard(b.id, { opacity: 0.4, blend: 'multiply' });
    let now = boardsOf(s.doc).find(x => x.id === b.id);
    expect([now.opacity, now.blend, isLayered(now)]).toEqual([0.4, 'multiply', true]);
    s.updateBoard(b.id, { opacity: 1, blend: 'normal' });
    now = boardsOf(s.doc).find(x => x.id === b.id);
    expect('opacity' in now || 'blend' in now).toBe(false);
  });
  it('clamps opacity, ignores a blend it does not know, and the main board can be a layer too', () => {
    const s = store(), b = s.addBoard({});
    s.updateBoard(b.id, { opacity: 3, blend: 'nonsense' });
    expect(boardsOf(s.doc).find(x => x.id === b.id).opacity).toBeUndefined();
    s.updateBoard(b.id, { opacity: -1 });
    expect(opacityOf(boardsOf(s.doc).find(x => x.id === b.id))).toBe(0);
    s.updateBoard('main', { opacity: 0.5, blend: 'screen' });
    const main = boardsOf(s.doc)[0];
    expect([main.opacity, main.blend]).toEqual([0.5, 'screen']);
  });
  it('a document with layered boards survives normalizing', () => {
    const s = store(), b = s.addBoard({ title: 'L' });
    s.updateBoard(b.id, { opacity: 0.25, blend: 'add' });
    const back = normalizeDocument(JSON.parse(JSON.stringify(s.doc)));
    const l = boardsOf(back).find(x => x.title === 'L');
    expect([l.opacity, blendOf(l)]).toEqual([0.25, 'add']);
  });
  it('names the blends the canvas and CSS know', () => {
    expect([canvasBlend('add'), cssBlend('add'), canvasBlend('multiply'), canvasBlend('normal'), cssBlend('normal')]).toEqual(['lighter', 'plus-lighter', 'multiply', 'source-over', 'normal']);
  });
});

describe('outputs', () => {
  const fakeApp = () => { const s = store(); s.addBoard({ title: 'A' }); return { store: s, on: () => {}, canvas: { invalidate() {} }, frames: { pipe() {}, unpipe() {} }, log() {} }; };
  it('a board with an output keeps wanting to run; stopping it lets go', () => {
    const app = fakeApp(), id = app.store.doc.boards[0].id, out = new Outputs(app);
    expect(out.wants(id)).toBe(false);
    out.pin(id);
    expect(out.wants(id)).toBe(true);
    expect(out.list()).toEqual([{ key: `pin:${id}`, board: id, kind: 'pin' }]);
    out.pin(id);   // pinning a pinned board unpins it
    expect(out.wants(id)).toBe(false);
    expect(document.querySelectorAll('.wb-pin').length).toBe(0);
  });
  it('closeAll removes every pin', () => {
    const app = fakeApp(), id = app.store.doc.boards[0].id, out = new Outputs(app);
    out.pin(id); out.pin('main');
    expect(document.querySelectorAll('.wb-pin').length).toBe(2);
    out.closeAll();
    expect(document.querySelectorAll('.wb-pin').length).toBe(0);
    expect(out.list()).toEqual([]);
  });
  it('a window output that the browser blocks says so and leaves nothing behind', async () => {
    const app = fakeApp(), id = app.store.doc.boards[0].id, logs = [], out = new Outputs({ ...app, log: m => logs.push(m) });
    const open = window.open; window.open = () => null;
    expect(await out.openWindow(id)).toBe(null);
    window.open = open;
    expect(logs[0]).toMatch(/blocked/);
    expect(out.list()).toEqual([]);
  });
  it('a window output is closed with its window, and its board stops being wanted', async () => {
    const app = fakeApp(), id = app.store.doc.boards[0].id, out = new Outputs(app);
    let closed = false;
    const doc = document.implementation.createHTMLDocument('w');
    const win = { document: doc, closed: false, close() { closed = true; this.closed = true; }, addEventListener() {}, focus() {}, devicePixelRatio: 1 };
    const open = window.open; window.open = () => win;
    const o = await out.openWindow(id);
    window.open = open;
    expect(o.kind).toBe('window');
    expect(doc.body.querySelector('canvas')).toBeTruthy();
    expect(out.wants(id)).toBe(true);
    out.close(`window:${id}`);
    expect(closed).toBe(true);
    expect(out.wants(id)).toBe(false);
  });
  it('sending a board to an output plays it once, as its play button would; a board paused on purpose stays paused; closing changes nothing', () => {
    const live = new Set();
    const mk = () => { const app = fakeApp(); app.isBoardLive = id => live.has(id); app.setBoardLive = (id, on) => { on ? live.add(id) : live.delete(id); }; return app; };
    let app = mk(), id = app.store.doc.boards[0].id, out = new Outputs(app);
    out.pin(id);
    expect(live.has(id)).toBe(true);
    out.close(`pin:${id}`);
    expect(live.has(id)).toBe(true);            // (closing the output does not pause it again)
    live.clear();
    app = mk(); id = app.store.doc.boards[0].id; out = new Outputs(app);
    app.store.change('pause', d => { d.boards.find(x => x.id === id).paused = true; });
    out.pin(id);
    expect(live.has(id)).toBe(false);           // (paused by hand: left alone)
  });
});
