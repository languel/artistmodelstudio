import { describe, it, expect } from 'vitest';
import { ProcessStore } from './document.js';

const mark = (store, x) => store.addElement({ role: 'point', points: [[x, 0]] });

describe('one undo step for many changes', () => {
  it('undoes everything between beginStep and endStep at once, and leaves earlier steps alone', () => {
    const s = new ProcessStore();
    mark(s, 1);
    s.beginStep();
    mark(s, 2); mark(s, 3); mark(s, 4);
    s.endStep();
    expect(s.doc.elements.length).toBe(4);
    s.undo();
    expect(s.doc.elements.length).toBe(1);
    s.redo();
    expect(s.doc.elements.length).toBe(4);
    s.undo(); s.undo();
    expect(s.doc.elements.length).toBe(0);
  });
  it('adds no step when nothing changed', () => {
    const s = new ProcessStore();
    mark(s, 1);
    const n = s.past.length;
    s.beginStep(); s.endStep();
    expect(s.past.length).toBe(n);
  });
  it('holds when the undo history is trimmed during the step', () => {
    const s = new ProcessStore();
    for (let i = 0; i < 200; i++) mark(s, i);
    s.beginStep();
    for (let i = 0; i < 5; i++) mark(s, 1000 + i);
    s.endStep();
    expect(s.doc.elements.length).toBe(205);
    s.undo();
    expect(s.doc.elements.length).toBe(200);
    s.undo();
    expect(s.doc.elements.length).toBe(199);
  });
});

describe('a plane is a stroke, a fill and a way of painting it', () => {
  const plane = (store, extra = {}) => store.addElement({ role: 'plane', points: [[0, 0], [10, 0], [10, 10]], ...extra });
  it('choosing how to paint the fill gives a plane with none a fill, so the choice shows', () => {
    const s = new ProcessStore();
    const e = plane(s, { color: '#c8322d' });
    expect(e.fill).toBeUndefined();
    const got = s.updateElement(e.id, { realize: { brush: 'hatch' } });
    expect(got.realize.brush).toBe('hatch');
    expect(got.fill).toBe('#c8322d');
  });
  it('keeps a fill it already has, and an outline stays one when only a setting moves', () => {
    const s = new ProcessStore();
    const a = plane(s, { fill: '#123456' });
    expect(s.updateElement(a.id, { realize: { brush: 'stipple' } }).fill).toBe('#123456');
    const b = plane(s, { color: '#c8322d' });
    expect(s.updateElement(b.id, { realize: { params: { opacity: 0.5 } } }).fill).toBeUndefined();
  });
  it('keeps the stroke width through a reload', () => {
    const s = new ProcessStore();
    const e = plane(s, { strokeWidth: 6 });
    expect(new ProcessStore(JSON.parse(JSON.stringify(s.doc))).doc.elements.find(x => x.id === e.id).strokeWidth).toBe(6);
  });
});
