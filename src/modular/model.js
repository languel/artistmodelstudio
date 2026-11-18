/**
 * The modular synth on the canvas (pure: no Web Audio, no DOM). A module is a mark: a box (a plane) with
 * `play.mod = { kind, settings }`, drawn by the 'module' brush (face.js). A cable is a path, any path, with
 * `play.cable = { from, to, slot, amount? }` (mark ids), drawn by the 'cable' brush. The cable's ends follow the ports
 * they are plugged into (syncCables, after every edit, like a score's edges follow their nodes); a cable drawn by hand
 * keeps its middle. So a patch is drawn, moved, scaled, grouped, undone, saved and shared like any other drawing.
 *
 * The drawing compiles into the same patch the engine plays (src/audio/modular/patch.js): patchOfDoc(doc), merged with
 * the Patch panel's own (`doc.transport.patch`) by scenePatch.
 *
 * Ports, on a module's box: inputs down the left edge (notes first, on an instrument), modulation along the bottom (the
 * settings an LFO can move), the output on the right (notes from a sequencer, sound, or modulation from an LFO).
 */
import { KINDS, normalizePatch, outputOf, inputsOf, modSlotsOf, isInstrument, isModSlot, cableAllowed } from '../audio/modular/patch.js';
import { normalizeElement } from '../process/document.js';
import { boardsOf } from '../process/boards.js';

export const isModule = e => Boolean(e?.play?.mod && KINDS[e.play.mod.kind]);
export const isCable = e => Boolean(e?.play?.cable);
export const HEADER = 16;   // the title bar of a module's box (artboard units)
export const PORT = 4.5;    // a port's radius

/** How big a module's box starts, by kind. */
export const SIZES = Object.freeze({
  Euclid: [150, 170], Grid: [210, 150], Bits: [190, 150], Drums: [220, 112], Steps: [220, 92],
  Synth: [140, 84], Karplus: [130, 70], Granular: [130, 70], Sampler: [150, 76], DrumKit: [130, 76], DrumSynth: [130, 76],
  Osc: [120, 70], Noise: [110, 62], LFO: [120, 70],
  Filter: [130, 74], Delay: [120, 70], Reverb: [120, 70], Distortion: [120, 70], Gain: [100, 64], Mixer: [150, 132], Merge: [100, 80],
  Scope: [170, 100], Output: [100, 70]
});

/** Colours by group (the title bar, the ports): sequencers amber, sources teal, modulators violet, instruments blue, effects green. */
export const GROUP_COLORS = Object.freeze({ sequencer: '#e0a43a', source: '#3fb3a6', modulator: '#a07ae0', instrument: '#5a8de0', effect: '#6fb85a', output: '#e0644f' });
export const groupOf = kind => (kind === 'Output' ? 'output' : KINDS[kind]?.group || 'effect');
/** What a cable carries, by the slot it goes into: notes, modulation or sound. */
export const cableType = slot => (slot === 'notes' ? 'notes' : isModSlot(slot) ? 'mod' : 'audio');
export const CABLE_COLORS = Object.freeze({ notes: '#e0a43a', mod: '#a07ae0', audio: '#3fb3a6' });

/** A mark's box: { x0, y0, x1, y1, w, h }. */
export function boxOf(e) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of e.points || []) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

const spread = (n, a, b) => Array.from({ length: n }, (_, i) => a + ((i + 0.5) * (b - a)) / n);

/** Where a module's ports are (artboard units): { ins: [{ slot, x, y }], mods: [{ slot, x, y }], out: { x, y, type } | null }. */
export function portsOf(e) {
  const kind = e.play.mod.kind, b = boxOf(e);
  const inSlots = [...(isInstrument(kind) ? ['notes'] : []), ...inputsOf(kind)];
  const ys = spread(inSlots.length, b.y0 + HEADER, b.y1);
  const modSlots = modSlotsOf(kind), xs = spread(modSlots.length, b.x0, b.x1);
  const type = outputOf(kind);
  return {
    ins: inSlots.map((slot, i) => ({ slot, x: b.x0, y: ys[i] })),
    mods: modSlots.map((slot, i) => ({ slot, x: xs[i], y: b.y1 })),
    out: type ? { x: b.x1, y: b.y0 + HEADER + (b.h - HEADER) / 2, type } : null
  };
}

/** The port a slot is at. */
export function portAt(e, slot) {
  const p = portsOf(e);
  return [...p.ins, ...p.mods].find(q => q.slot === slot) || null;
}

/** Is a point on (or near) a module's box? */
export function inBox(e, x, y, pad = 6) {
  const b = boxOf(e);
  return x >= b.x0 - pad && x <= b.x1 + pad && y >= b.y0 - pad && y <= b.y1 + pad;
}

/** The module under a point (the topmost), or null. */
export function moduleAt(doc, x, y, pad = 6) {
  const els = doc.elements || [];
  for (let i = els.length - 1; i >= 0; i--) if (isModule(els[i]) && !els[i].hidden && inBox(els[i], x, y, pad)) return els[i];
  return null;
}

/** The patch the drawing makes, as the engine's patch.js has it: the modules and cables on boards that show. */
export function patchOfDoc(doc) {
  const off = new Set(boardsOf(doc).filter(b => b.hidden).map(b => b.id));
  const shown = e => !e.hidden && !off.has(e.board || 'main');
  const modules = [], cables = [];
  for (const e of doc.elements || []) {
    if (isModule(e) && shown(e)) { const b = boxOf(e); modules.push({ id: e.id, kind: e.play.mod.kind, x: b.x0, y: b.y0, ...(e.label ? { name: e.label } : {}), settings: e.play.mod.settings || {} }); }
    else if (isCable(e) && shown(e)) { const c = e.play.cable; cables.push({ from: c.from, to: c.to, slot: c.slot, ...(c.amount !== undefined ? { amount: c.amount } : {}) }); }
  }
  return normalizePatch({ modules, cables });
}

/** The scene's whole patch: the Patch panel's (`doc.transport.patch`) and the drawing's together. */
export function scenePatch(doc, panelPatch) {
  const drawn = patchOfDoc(doc);
  if (!drawn.modules.length) return panelPatch || normalizePatch(null);
  if (!panelPatch?.modules?.length) return drawn;
  return normalizePatch({ modules: [...panelPatch.modules, ...drawn.modules], cables: [...panelPatch.cables, ...drawn.cables] });
}

/** The slot of `to` nearest a point that a cable from `from` may take (or the first free one), or null. */
export function slotNear(doc, from, to, x, y) {
  const patch = patchOfDoc(doc), a = from.play.mod.kind;
  const free = slot => cableAllowed(patch.modules, patch.cables.filter(c => !(c.from === from.id && c.to === to.id && c.slot === slot)), { from: from.id, to: to.id, slot });
  const p = portsOf(to);
  const all = [...p.ins, ...p.mods].filter(q => (outputOf(a) === 'notes' ? q.slot === 'notes' : outputOf(a) === 'mod' ? isModSlot(q.slot) : q.slot !== 'notes'));
  const ok = all.filter(q => free(q.slot));
  if (!ok.length) return null;
  if (x === undefined) return ok[0].slot;
  // (a click inside the box, not by a port: the first input, then modulation)
  ok.sort((m, n) => Math.hypot(m.x - x, m.y - y) - Math.hypot(n.x - x, n.y - y));
  const near = ok[0], b = boxOf(to);
  if (Math.hypot(near.x - x, near.y - y) > Math.max(24, b.h / 3) && ok.some(q => !isModSlot(q.slot))) return ok.find(q => !isModSlot(q.slot)).slot;
  return near.slot;
}

/** A new module's mark (to add with store.addElement or canvas.commitNew): a box at x, y (its top left). */
export function moduleMark(kind, x, y, settings = {}, { size, ...extra } = {}) {
  const [w, h] = size || SIZES[kind] || [120, 70];
  return {
    role: 'plane', path: 'straight',
    points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(([a, b]) => [Math.round(a), Math.round(b), 0, 0.5]),
    realize: { brush: 'module', params: {} },
    play: { mod: { kind, settings: { ...settings } } },
    ...extra
  };
}

const sag = (a, b) => { const d = Math.hypot(b[0] - a[0], b[1] - a[1]); return Math.min(60, d * 0.18); };
/** A cable's points from port a to port b: the middle droops a little, as a patch cord does. */
export function cablePoints(a, b) {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2 + sag(a, b);
  return [[a[0], a[1]], [mx, my], [b[0], b[1]]];
}

/** Plug a cable in (in place, in a draft document): from a module's output to a slot of another. `via`: the path it is drawn as (its middle is kept). Returns the cable mark, or null. */
export function plug(d, fromId, toId, slot, via = null) {
  const a = d.elements.find(e => e.id === fromId), b = d.elements.find(e => e.id === toId);
  if (!isModule(a) || !isModule(b) || a.id === b.id || !slot) return null;
  const pa = portsOf(a).out, pb = portAt(b, slot);
  if (!pa || !pb) return null;
  const mid = via && via.length > 2 ? via.slice(1, -1).map(q => [q[0], q[1]]) : null;
  const pts = mid ? [[pa.x, pa.y], ...mid, [pb.x, pb.y]] : cablePoints([pa.x, pa.y], [pb.x, pb.y]);
  const line = normalizeElement({ role: 'line', points: pts.map(q => [q[0], q[1], 0, 0.5]), realize: { brush: 'cable', params: {} }, play: { cable: { from: a.id, to: b.id, slot } } }, a.stage);
  if (a.board) line.board = a.board;
  d.elements.push(line);
  return line;
}

/** A path made a cable: by what is under its two ends (the start: a module's output; the end: the slot nearest). In place; true when it is one. */
export function makeCable(d, id) {
  const e = d.elements.find(x => x.id === id);
  if (!e || !(e.points?.length >= 2) || isModule(e)) return false;
  const [sx, sy] = e.points[0], [ex, ey] = e.points.at(-1);
  let a = moduleAt(d, sx, sy, 10), b = moduleAt(d, ex, ey, 10);
  if (a && b && !outputOf(a.play.mod.kind) && outputOf(b.play.mod.kind)) [a, b] = [b, a];   // (drawn backwards: from the Output)
  if (!a || !b || a.id === b.id || !outputOf(a.play.mod.kind)) return false;
  const slot = slotNear(d, a, b, ex, ey);
  if (!slot) return false;
  e.play = { ...(e.play || {}), cable: { from: a.id, to: b.id, slot, drawn: true } };   // (drawn: its middle is the user's)
  if (e.realize?.brush !== 'cable') e.realize = { brush: 'cable', params: { ...(e.realize?.params?.width ? { width: e.realize.params.width } : {}) } };
  return true;
}

/**
 * After an edit (store.derive): cables follow their ports (a cable of three points, as plugged, droops again; one drawn
 * by hand keeps its middle), and a cable whose module is gone goes too. In place; returns how many changed.
 */
export function syncCables(d) {
  let changed = 0;
  const byId = new Map();
  for (const e of d.elements) if (isModule(e)) byId.set(e.id, e);
  if (!byId.size && !d.elements.some(isCable)) return 0;
  const gone = new Set();
  for (const e of d.elements) {
    if (!isCable(e)) continue;
    const c = e.play.cable, a = byId.get(c.from), b = byId.get(c.to);
    if (!a || !b) { gone.add(e.id); continue; }
    const pa = portsOf(a).out, pb = portAt(b, c.slot);
    if (!pa || !pb) continue;
    const pts = e.points.length === 3 && !c.drawn ? cablePoints([pa.x, pa.y], [pb.x, pb.y]) : [[pa.x, pa.y], ...e.points.slice(1, -1), [pb.x, pb.y]];
    if (pts.length === e.points.length && pts.every((q, i) => Math.abs(q[0] - e.points[i][0]) < 1e-6 && Math.abs(q[1] - e.points[i][1]) < 1e-6)) continue;
    e.points = pts.map((q, i) => [q[0], q[1], e.points[i]?.[2] ?? 0, e.points[i]?.[3] ?? 0.5]);
    changed++;
  }
  if (gone.size) { d.elements = d.elements.filter(e => !gone.has(e.id)); changed += gone.size; }
  return changed;
}

/** Ids pasted or duplicated as new ones: cables plugged between copied modules follow them to their copies (in place). */
export function remapCables(elements, newIds) {
  for (const e of elements) {
    if (!isCable(e)) continue;
    const c = e.play.cable;
    e.play = { ...e.play, cable: { ...c, from: newIds.get(c.from) || c.from, to: newIds.get(c.to) || c.to } };
  }
}
