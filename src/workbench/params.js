/**
 * Parameters by address, for automation (docs/camera-plan.md §4.2). An address is 'scope:id.property'. Each scope
 * registers a resolver; `param(address)` gives { get(), set(v), min, max, step } or null (the thing is gone or the
 * property is not automatable). `set` is transient: a live change, no undo step.
 */
import { boardById, MAIN } from '../process/boards.js';
import { opacityOf } from '../process/boards.js';
import { resolveParams } from '../process/brushes.js';
import { findControls } from '../process/controls.js';

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

// Any property by its path ('fx.0.amount', 'note.size', 'play.speed'): numbers, colours, choices, anything a field holds.
const segs = prop => prop.split('.').map(s => (/^\d+$/.test(s) ? Number(s) : s));
const getPath = (o, p) => p.reduce((x, k) => (x == null ? undefined : x[k]), o);
const setPath = (o, p, v) => { let x = o; for (let i = 0; i < p.length - 1; i++) { if (x[p[i]] == null) x[p[i]] = typeof p[i + 1] === 'number' ? [] : {}; x = x[p[i]]; } x[p[p.length - 1]] = v; };

const NAMES = { color: 'Color', fill: 'Fill', blend: 'Blend', ground: 'Paper', opacity: 'Opacity', x: 'X', y: 'Y', width: 'Width', height: 'Height', strokeWidth: 'Stroke width', sourceOpacity: 'Source opacity' };
const pretty = prop => NAMES[prop] || (/^(fx|sourceFx)\.\d+\./.test(prop) ? prop.replace(/^(fx|sourceFx)\.(\d+)\./, (m, k, i) => `${k === 'fx' ? 'Effect' : 'Source effect'} ${+i + 1} · `) : null) || (prop.startsWith('brush.') ? prop.slice(6).replace(/^./, c => c.toUpperCase()) : prop);

/** The scopes the studio has: boards, marks and a sketch's live controls. Each parameter: { get, set, min, max, step, label }. */
export function installParams(app) {
  app.param = param;   // (for tools and tests: the app's own registry)
  const T = { transient: true };
  const boardNum = (id, prop, min, max, step) => ({
    get: () => { const b = boardById(app.store.doc, id); return prop === 'opacity' ? opacityOf(b) : b?.[prop]; },
    set: v => app.store.updateBoard(id, { [prop]: v }, T),   // (a board's marks move with it)
    min, max, step, label: `${boardById(app.store.doc, id)?.title || id} · ${pretty(prop)}`
  });
  registerScope('board', (id, prop) => {
    const b = boardById(app.store.doc, id);
    if (!b) return null;
    if (prop === 'opacity') return boardNum(id, prop, 0, 1, 0.01);
    if (prop === 'x' || prop === 'y') return boardNum(id, prop, -1e5, 1e5, 1);
    if (prop === 'width' || prop === 'height') return boardNum(id, prop, 40, 10000, 1);
    if (prop === 'sourceOpacity') return { get: () => boardById(app.store.doc, id)?.sourceOpacity ?? 0.5, set: v => app.setBoardSourceLook(id, { opacity: v }), min: 0, max: 1, step: 0.01, label: `${b.title} · ${pretty(prop)}` };
    // The rest by path on the board (its paper, blend, effects: 'fx.0.amount', mask feather: 'maskWith.feather').
    const path = segs(prop), raw = d => (id === MAIN ? d.artboard : d.boards.find(x => x.id === id));
    return {
      get: () => getPath(raw(app.store.doc), path),
      set: v => app.store.change('automation', d => { const o = raw(d); if (o) setPath(o, path, v); }, T),
      min: -Infinity, max: Infinity, step: 0.01, label: `${b.title} · ${pretty(prop)}`
    };
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
    // The rest by path on the mark (colour, fill, blend, note.size, play.speed…).
    const path = segs(prop);
    return {
      get: () => getPath(find(), path),
      set: v => edit(e => setPath(e, path, v)),
      min: -Infinity, max: Infinity, step: 0.01, label
    };
  });
  // A shot's pose: zoom and shifts (so a camera move can be keyframed, with the same dot as anything else).
  registerScope('shot', (id, prop) => {
    const clip = () => app.player?.take?.clips.find(c => c.id === id);
    const c = clip();
    if (!c || !['z', 'dx', 'dy', 'focus', 'blur'].includes(prop)) return null;
    const def = prop === 'z' ? 1 : 0, dof = prop === 'focus' || prop === 'blur';
    const names = { z: 'Zoom', dx: 'Shift x', dy: 'Shift y', focus: 'Focus', blur: 'Blur' };
    return { get: () => clip()?.[prop] ?? def, set: v => { const k = clip(); if (k) k[prop] = prop === 'z' ? Math.max(0.05, v) : prop === 'blur' ? Math.max(0, v) : v; }, min: prop === 'z' ? 0.05 : prop === 'blur' ? 0 : dof ? -0.9 : -10, max: prop === 'z' ? 40 : dof ? (prop === 'blur' ? 5 : 20) : 10, step: dof ? 0.05 : 0.01, label: `${c.label || 'Shot'} · ${names[prop]}` };
  });
  registerScope('ctl', (id, prop) => {
    const f = app.frames?.frames.get(id);
    if (!f) return null;
    // What kind of control it is (a choice has options to step through), from the sketch's code.
    const c = findControls(boardById(app.store.doc, id)?.code || '').find(x => x.name === prop || x.key === prop);
    return { get: () => app.frames.getCtl(id, prop), set: v => app.frames.setCtl(id, prop, v), min: c?.min ?? -Infinity, max: c?.max ?? Infinity, step: c?.step || 0.01, label: `${boardById(app.store.doc, id)?.title || id} · ${prop}`, kind: c?.kind, ...(c?.options ? { options: c.options } : {}) };
  });
}
