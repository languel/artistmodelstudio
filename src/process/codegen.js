/**
 * Everything as code: marks and timeline clips written as the code that makes them, and that code
 * applied back. A mark's code is the score line that would create it (in artboard units, so
 * applying it changes nothing until you edit it); a clip's code is a clip({ … }) object.
 */
import { runScript } from './script.js';
import { DEFAULT_REALIZE } from './document.js';

const r = (v, d = 1) => { const k = 10 ** d; return Math.round(v * k) / k; };
const q = v => JSON.stringify(v);
const KEEP_SRC = 'embedded';   // images: the picture stays as it is unless you give a new src

function fmtPoints(points, perLine = 4) {
  const items = points.map(([x, y, t = 0, p = 0.5]) => `[${r(x)}, ${r(y)}, ${Math.round(t)}, ${r(p, 2)}]`);
  if (items.length <= perLine) return `[${items.join(', ')}]`;
  const lines = [];
  for (let i = 0; i < items.length; i += perLine) lines.push(`  ${items.slice(i, i + perLine).join(', ')}`);
  return `[\n${lines.join(',\n')}\n]`;
}

function optsOf(e, doc) {
  const o = {};
  const def = DEFAULT_REALIZE[e.role]?.brush;
  if (e.realize?.brush && e.realize.brush !== def) o.brush = e.realize.brush;
  Object.assign(o, e.realize?.params || {});
  if (e.color) o.color = e.color;
  if (e.fill) o.fill = e.fill;
  if (e.role === 'line' && e.closed) o.closed = true;
  const st = doc.stages.find(s => s.id === e.stage);
  if (st) o.stage = st.name;
  for (const k of ['label', 'opacity', 'blend', 'hidden', 'locked', 'path']) if (e[k] !== undefined) o[k] = e[k];
  if (e.play) o.play = e.play;
  if (e.note) o.note = e.note;
  if (e.role === 'image') o.src = KEEP_SRC;
  if (e.why) o.why = e.why;
  return o;
}

const fmtOpts = o => {
  const parts = Object.entries(o).map(([k, v]) => `${k}: ${q(v)}`);
  return parts.join(', ').length > 90 ? `{\n  ${parts.join(',\n  ')}\n}` : `{ ${parts.join(', ')} }`;
};

/** One mark as the score line that makes it. */
export function elementCode(e, doc) {
  const o = optsOf(e, doc);
  const head = `// ${e.role}${e.label ? ` “${e.label}”` : ''} · ${e.points.length} point${e.points.length === 1 ? '' : 's'} · by ${e.by?.name || e.by?.kind || 'you'}`;
  if (e.role === 'point' && e.points.length === 1) return `${head}\npoint(${r(e.points[0][0])}, ${r(e.points[0][1])}, ${fmtOpts(o)})`;
  if (e.role === 'point') return `${head}\npoints(${fmtPoints(e.points)}, ${fmtOpts(o)})`;
  if (e.role === 'note') { const { ...rest } = o; return `${head}\nnote(${r(e.points[0][0])}, ${r(e.points[0][1])}, ${q(e.text || '')}, ${fmtOpts(rest)})`; }
  return `${head}\n${e.role}(${fmtPoints(e.points)}, ${fmtOpts(o)})`;
}

/** Selected marks as a small score (artboard units). */
export function selectionCode(elements, doc) {
  return `// ${elements.length} mark${elements.length === 1 ? '' : 's'}\nunits('artboard')\n\n${elements.map(e => elementCode(e, doc)).join('\n\n')}\n`;
}

/**
 * Apply edited selection code: the marks it makes replace the selected ones, in place. The first
 * marks keep the old ids (and groups), so the Outliner and recordings follow them. Returns
 * { elements, stages } to write into the document, or { error, line }.
 */
export function applySelectionCode(doc, ids, source) {
  const base = { ...doc, elements: [], decisions: [] };
  const res = runScript(source, { base, by: { kind: 'user', name: 'you (code)' } });
  if (res.error) return { error: res.error, line: res.errorLine };
  const old = doc.elements.filter(e => ids.includes(e.id));
  const made = res.doc.elements.map((e, i) => {
    const o = old[i];
    const out = { ...e };
    if (o) { out.id = o.id; if (o.group && !e.group) out.group = o.group; out.seed = e.seed ?? o.seed; out.created = o.created; }
    if (out.role === 'image' && (!out.src || out.src === KEEP_SRC)) out.src = (o?.role === 'image' ? o.src : old.find(x => x.role === 'image')?.src) || '';
    return out;
  });
  // New stages the code introduced (stage('…') or stage: 'a new name').
  const known = new Set(doc.stages.map(s => s.id));
  const stages = [...doc.stages, ...res.doc.stages.filter(s => !known.has(s.id) && made.some(e => e.stage === s.id))];
  return { elements: made, stages, logs: res.logs };
}

/** Put applied marks into the document where the old ones were. */
export function replaceElements(d, ids, made, stages) {
  const first = d.elements.findIndex(e => ids.includes(e.id));
  const rest = d.elements.filter(e => !ids.includes(e.id));
  const at = first < 0 ? rest.length : d.elements.slice(0, first).filter(e => !ids.includes(e.id)).length;
  rest.splice(at, 0, ...made);
  d.elements = rest;
  if (stages) d.stages = stages;
}

// ---- clips -------------------------------------------------------------------------------------
const CLIP_ORDER = ['track', 'start', 'dur', 'text', 'sub', 'label', 'name', 'by', 'cx', 'cy', 'z', 'fx', 'args', 'diff', 'src'];

export function clipCode(c) {
  const o = {};
  for (const k of [...CLIP_ORDER, ...Object.keys(c)]) if (k in c && !(k in o) && !['id', 'seq'].includes(k)) o[k] = c[k];
  if (o.src && String(o.src).length > 200) o.src = KEEP_SRC;
  // A drawing change can be large: summarize it; it is kept unless you write a new one.
  if (o.diff && JSON.stringify(o.diff).length > 2000) {
    const d = o.diff;
    o.diff = `kept: ${[d.add?.length && `${d.add.length} added`, d.update?.length && `${d.update.length} changed`, d.remove?.length && `${d.remove.length} removed`].filter(Boolean).join(', ') || 'document settings'}`;
  }
  const head = `// ${c.track} clip · ${(c.start / 1000).toFixed(1)}–${((c.start + c.dur) / 1000).toFixed(1)} s (times in ms)`;
  return `${head}\nclip(${JSON.stringify(o, null, 2)})\n`;
}

/** Evaluate clip code; returns the fields to write into the clip, or { error }. */
export function applyClipCode(clip, source) {
  let out = null;
  try {
    // eslint-disable-next-line no-new-func
    new Function('clip', `"use strict";\n${source}`)(o => { out = o; });
  } catch (err) { return { error: err.message }; }
  if (!out || typeof out !== 'object') return { error: 'The code must call clip({ … })' };
  if (out.src === KEEP_SRC) out.src = clip.src;
  if (typeof out.diff === 'string' && out.diff.startsWith('kept')) out.diff = clip.diff;
  if (!Number.isFinite(Number(out.start)) || !Number.isFinite(Number(out.dur))) return { error: 'start and dur must be numbers (ms)' };
  return { fields: { ...out, start: Math.max(0, Math.round(out.start)), dur: Math.max(0, Math.round(out.dur)) } };
}
