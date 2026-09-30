import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Composer } from './masks.js';
import { ProcessStore } from '../process/document.js';
import { runScript } from '../process/script.js';

// Canvases that only record what is asked of them.
const log = { draws: 0, sets: [], reads: 0 };
class FakeCanvas {
  constructor() { this.width = 300; this.height = 150; }
  getContext() {
    if (this.ctx) return this.ctx;
    const t = { filter: 'none', canvas: this };
    return (this.ctx = new Proxy(t, {
      get: (o, k) => {
        if (k in o) return o[k];
        if (k === 'drawImage') return () => { log.draws++; };
        if (k === 'getImageData') return (x, y, w, h) => { log.reads++; return { data: new Uint8ClampedArray(w * h * 4).fill(200) }; };
        return () => {};
      },
      set: (o, k, v) => { o[k] = v; log.sets.push([k, v]); return true; }
    }));
  }
}

describe('the composer: masks and effects on boards', () => {
  beforeEach(() => { globalThis.document = { createElement: () => new FakeCanvas() }; log.draws = 0; log.sets = []; log.reads = 0; });
  afterEach(() => { delete globalThis.document; });
  const app = { sources: { view: name => (name === 'cam' ? { width: 100, height: 100 } : null), stamp: name => `${name}.1` } };
  const setup = () => {
    const store = new ProcessStore();
    store.runBoardCode('main', "point(0.5, 0.5, { size: 30 })", runScript, { transient: true });
    const cp = new Composer(app);
    return { store, cp, opts: (scale = 1) => ({ doc: store.doc, scale, now: 1000, mode: 'picture', chain: [] }) };
  };
  const main = store => ({ ...store.doc.artboard, id: 'main', x: 0, y: 0 });

  it('is opt-in: a board with no mask and no effects, or effects all off, needs nothing', () => {
    const { cp } = setup();
    expect(cp.needs({})).toBe(false);
    expect(cp.needs({ fx: [] })).toBe(false);
    expect(cp.needs({ fx: [{ type: 'invert', off: true }] })).toBe(false);
    expect(cp.needs({ fx: ['invert'] })).toBe(true);
    expect(cp.needs({ maskWith: { source: 'cam' } })).toBe(true);
  });

  it('composes once, then keeps the picture while nothing it depends on changes', () => {
    const { store, cp, opts } = setup();
    const b = { ...main(store), fx: ['invert'] };
    cp.begin(store.doc, 1000);
    const a = cp.compose(b, opts());
    const drawsAfterFirst = log.draws;
    cp.begin(store.doc, 1100);
    expect(cp.compose(b, opts())).toBe(a);
    expect(log.draws).toBe(drawsAfterFirst);          // nothing drawn again
    expect(cp.stats.composed).toBe(1);
    store.runBoardCode('main', "point(0.2, 0.2, { size: 30 })", runScript, { transient: true });   // its marks changed
    cp.begin(store.doc, 1200);
    cp.compose(b, opts());
    expect(cp.stats.composed).toBe(2);
  });

  it('a moving mask over a still board recomposes only the mask', () => {
    const { store, cp, opts } = setup();
    let stamp = 1;
    const moving = new Composer({ sources: { view: () => ({ width: 100, height: 100 }), stamp: () => `cam.${stamp}` } });
    const b = { ...main(store), maskWith: { source: 'cam', mode: 'luma' } };
    moving.begin(store.doc, 1000);
    moving.compose(b, opts());
    expect(moving.stats.composed).toBe(1);
    const masks = moving.stats.masked;
    stamp = 2; moving.begin(store.doc, 1033);
    moving.compose(b, opts());
    expect(moving.stats.composed).toBe(1);   // the board's own picture was not made again
    expect(moving.stats.masked).toBe(masks + 1);
  });

  it('a mask puts the source through the board (destination-in); a missing source lets everything show', () => {
    const { store, cp, opts } = setup();
    cp.begin(store.doc, 1000);
    cp.compose({ ...main(store), maskWith: { source: 'cam', mode: 'luma' } }, opts());
    expect(log.sets.some(([k, v]) => k === 'globalCompositeOperation' && v === 'destination-in')).toBe(true);
    log.sets = [];
    cp.pictures.clear();
    cp.compose({ ...main(store), maskWith: { source: 'gone', mode: 'luma' } }, opts());
    expect(log.sets.some(([k, v]) => v === 'destination-in')).toBe(false);
  });

  it('a mask of marks is another board, and boards that mask each other do not run away', () => {
    const { store, cp, opts } = setup();
    const a = store.addBoard({ title: 'A', width: 100, height: 100 }), m = store.addBoard({ title: 'M', width: 100, height: 100 });
    store.updateBoard(a.id, { maskWith: { board: m.id, mode: 'alpha' } });
    store.updateBoard(m.id, { maskWith: { board: a.id, mode: 'alpha' } });
    const boards = store.doc.boards;
    cp.begin(store.doc, 1000);
    expect(() => cp.compose(boards.find(x => x.id === a.id), opts())).not.toThrow();
    expect(cp.stats.composed).toBeLessThan(10);
  });

  it('effects on a run of pixels are read and written once; a canvas effect splits them', () => {
    const { store, cp, opts } = setup();
    cp.begin(store.doc, 1000);
    log.reads = 0;
    cp.compose({ ...main(store), fx: [{ type: 'threshold' }, 'invert', { type: 'levels', gamma: 2 }] }, opts());
    expect(log.reads).toBe(1);
    cp.pictures.clear(); log.reads = 0;
    cp.compose({ ...main(store), fx: ['invert', { type: 'pixelate', size: 4 }, 'invert'] }, opts());
    expect(log.reads).toBe(2);
  });

  it('what is kept is given back for boards that are no longer masked', () => {
    const { store, cp, opts } = setup();
    cp.begin(store.doc, 1000);
    cp.compose({ ...main(store), fx: ['invert'] }, opts());
    expect(cp.pictures.size).toBe(1);
    cp.sweep(store.doc);   // the document's board has no effects
    expect(cp.pictures.size).toBe(0);
  });
});
