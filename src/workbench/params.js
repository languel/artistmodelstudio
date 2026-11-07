/**
 * Parameters by address, for automation (docs/camera-plan.md §4.2). An address is 'scope:id.property'. Each scope
 * registers a resolver; `param(address)` gives { get(), set(v), min, max, step } or null (the thing is gone or the
 * property is not automatable). `set` is transient: a live change, no undo step.
 */
import { boardById } from '../process/boards.js';
import { opacityOf } from '../process/boards.js';
import { resolveParams } from '../process/brushes.js';

const scopes = new Map();
export const registerScope = (scope, fn) => scopes.set(scope, fn);

export function parseAddress(address) {
  const m = /^([a-z]+):([^.]+)\.(.+)$/.exec(String(address || ''));
  return m ? { scope: m[1], id: m[2], prop: m[3] } : null;
}

export function param(address) {
  const a = parseAddress(address);
  return a ? scopes.get(a.scope)?.(a.id, a.prop) || null : null;
}

const NAMES = { opacity: 'Opacity', x: 'X', y: 'Y', width: 'Width', height: 'Height', strokeWidth: 'Stroke width', sourceOpacity: 'Source opacity' };
const pretty = prop => NAMES[prop] || (prop.startsWith('brush.') ? prop.slice(6).replace(/^./, c => c.toUpperCase()) : prop);

/** The scopes the studio has: boards, marks and a sketch's live controls. Each parameter: { get, set, min, max, step, label }. */
export function installParams(app) {
  app.param = param;   // (for tools and tests: the app's own registry)
  const T = { transient: true };
  const boardNum = (id, prop, min, max, step) => ({
    get: () => { const b = boardById(app.store.doc, id); return prop === 'opacity' ? opacityOf(b) : b?.[prop]; },
    set: v => app.store.updateBoard(id, prop === 'x' || prop === 'y' ? { [prop]: v, moveMarks: false } : { [prop]: v }, T),
    min, max, step, label: `${boardById(app.store.doc, id)?.title || id} · ${pretty(prop)}`
  });
  registerScope('board', (id, prop) => {
    const b = boardById(app.store.doc, id);
    if (!b) return null;
    if (prop === 'opacity') return boardNum(id, prop, 0, 1, 0.01);
    if (prop === 'x' || prop === 'y') return boardNum(id, prop, -1e5, 1e5, 1);
    if (prop === 'width' || prop === 'height') return boardNum(id, prop, 40, 10000, 1);
    if (prop === 'sourceOpacity') return { get: () => boardById(app.store.doc, id)?.sourceOpacity ?? 0.5, set: v => app.setBoardSourceLook(id, { opacity: v }), min: 0, max: 1, step: 0.01, label: `${b.title} · ${pretty(prop)}` };
    return null;
  });
  registerScope('mark', (id, prop) => {
    const find = () => app.store.doc.elements.find(e => e.id === id);
    const el = find();
    if (!el) return null;
    const label = `${el.name || el.role} · ${pretty(prop)}`;
    const edit = fn => app.store.change('automation', d => { const e = d.elements.find(x => x.id === id); if (e) fn(e); }, T);
    if (prop === 'opacity') return { get: () => find()?.opacity ?? 1, set: v => edit(e => { e.opacity = v; }), min: 0, max: 1, step: 0.01, label };
    if (prop === 'strokeWidth') return { get: () => find()?.strokeWidth ?? 2, set: v => edit(e => { e.strokeWidth = v; }), min: 0.25, max: 60, step: 0.25, label };
    if (prop.startsWith('brush.')) {
      const key = prop.slice(6);
      return {
        get: () => resolveParams(find()?.realize?.brush, find()?.realize?.params)[key],
        set: v => edit(e => { e.realize = { ...(e.realize || {}), params: { ...(e.realize?.params || {}), [key]: v } }; }),
        min: -Infinity, max: Infinity, step: 0.01, label
      };
    }
    return null;
  });
  registerScope('ctl', (id, prop) => {
    const f = app.frames?.frames.get(id);
    if (!f) return null;
    return { get: () => app.frames.getCtl(id, prop), set: v => app.frames.setCtl(id, prop, v), min: -Infinity, max: Infinity, step: 0.01, label: `${boardById(app.store.doc, id)?.title || id} · ${prop}` };
  });
}
