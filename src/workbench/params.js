/**
 * Parameters by address, for automation (docs/camera-plan.md §4.2). An address is 'scope:id.property'. Each scope
 * registers a resolver; `param(address)` gives { get(), set(v), min, max, step } or null (the thing is gone or the
 * property is not automatable). `set` is transient: a live change, no undo step.
 */
import { boardById } from '../process/boards.js';
import { opacityOf } from '../process/boards.js';

const scopes = new Map();
export const registerScope = (scope, fn) => scopes.set(scope, fn);

export function parseAddress(address) {
  const m = /^([a-z]+):(.+)\.([A-Za-z0-9_]+)$/.exec(String(address || ''));
  return m ? { scope: m[1], id: m[2], prop: m[3] } : null;
}

export function param(address) {
  const a = parseAddress(address);
  return a ? scopes.get(a.scope)?.(a.id, a.prop) || null : null;
}

/** The scopes the studio has: boards, marks and a sketch's live controls. */
export function installParams(app) {
  const T = { transient: true };
  registerScope('board', (id, prop) => {
    const b = boardById(app.store.doc, id);
    if (!b) return null;
    if (prop === 'opacity') return { get: () => opacityOf(boardById(app.store.doc, id)), set: v => app.store.updateBoard(id, { opacity: v }, T), min: 0, max: 1, step: 0.01 };
    if (prop === 'x' || prop === 'y') return { get: () => boardById(app.store.doc, id)?.[prop], set: v => app.store.updateBoard(id, { [prop]: v, moveMarks: false }, T), min: -1e5, max: 1e5, step: 1 };
    return null;
  });
  registerScope('mark', (id, prop) => {
    const el = app.store.doc.elements.find(e => e.id === id);
    if (!el || prop !== 'opacity') return null;
    return {
      get: () => app.store.doc.elements.find(e => e.id === id)?.opacity ?? 1,
      set: v => app.store.change('automation', d => { const e = d.elements.find(x => x.id === id); if (e) e.opacity = v; }, T),
      min: 0, max: 1, step: 0.01
    };
  });
  registerScope('ctl', (id, prop) => {
    const f = app.frames?.frames.get(id);
    if (!f) return null;
    return { get: () => app.frames.getCtl(id, prop), set: v => app.frames.setCtl(id, prop, v), min: -Infinity, max: Infinity, step: 0.01 };
  });
}
