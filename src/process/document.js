/**
 * Process document: the canonical record of how a picture is made.
 *
 * Paths with a role (point, line, plane, guide, gesture, note), grouped into ordered
 * stages, each realised by a brush, each carrying its reason and provenance.
 * Decisions (question, options, chosen, why) are kept alongside.
 *
 * Coordinates are artboard units (0..width, 0..height). Points are [x, y, t, p]:
 * t = milliseconds from the start of the gesture, p = pressure 0..1.
 *
 * Pure data + a tiny observable store with undo. No DOM.
 */

export const PROCESS_VERSION = 1;

export const ROLES = Object.freeze({
  point: 'A mark at a place: tension depends on where it sits (Kandinsky).',
  line: 'A point that moved (Klee: a line going for a walk).',
  plane: 'An enclosed area: realised by fill, hatching, or a field.',
  guide: 'Construction that is not part of the picture: axes, horizons, envelopes.',
  gesture: 'The movement behind a form: often drawn first, often hidden later.',
  note: 'A written annotation: reasons, critique, questions.'
});

export const STAGE_KINDS = Object.freeze([
  'analysis', 'concept', 'construction', 'blocking', 'structure', 'value', 'marks', 'accents', 'notes'
]);

export const DEFAULT_STAGES = () => [
  { id: 'construction', name: 'Construction', kind: 'construction', visible: true, locked: false },
  { id: 'marks', name: 'Marks', kind: 'marks', visible: true, locked: false },
  { id: 'notes', name: 'Notes', kind: 'notes', visible: true, locked: false }
];

let idCounter = 0;
export const newId = (prefix = 'el') => `${prefix}_${Date.now().toString(36)}${(idCounter++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Default brush for each role. */
export const DEFAULT_REALIZE = Object.freeze({
  point: { brush: 'dot', params: {} },
  line: { brush: 'ink', params: {} },
  plane: { brush: 'flat', params: {} },
  guide: { brush: 'guide', params: {} },
  gesture: { brush: 'guide', params: {} },
  note: { brush: 'none', params: {} }
});

export function createDocument({ width = 1000, height = 1000, ground = '#f3efe6', title = 'Untitled' } = {}) {
  return {
    type: 'ams-process',
    version: PROCESS_VERSION,
    title,
    artboard: { width, height, ground },
    stages: DEFAULT_STAGES(),
    elements: [],
    decisions: [],
    meta: { created: new Date().toISOString() }
  };
}

/** Fill in missing fields so older or hand-written documents load. */
export function normalizeDocument(doc) {
  const d = doc && typeof doc === 'object' ? structuredClone(doc) : createDocument();
  d.type = 'ams-process';
  d.version = PROCESS_VERSION;
  d.artboard = { width: 1000, height: 1000, ground: '#f3efe6', ...(d.artboard || {}) };
  d.stages = Array.isArray(d.stages) && d.stages.length ? d.stages : DEFAULT_STAGES();
  for (const s of d.stages) {
    s.id ||= newId('stage');
    s.name ||= s.id;
    s.kind ||= 'marks';
    s.visible = s.visible !== false;
    s.locked = Boolean(s.locked);
  }
  const stageIds = new Set(d.stages.map(s => s.id));
  d.elements = (d.elements || []).map(e => normalizeElement(e, stageIds.has(e.stage) ? e.stage : d.stages[0].id));
  d.decisions = d.decisions || [];
  return d;
}

export function normalizeElement(e, stage) {
  const role = ROLES[e.role] ? e.role : 'line';
  return {
    id: e.id || newId(),
    stage: e.stage || stage,
    role,
    points: (e.points || []).map(p => [Number(p[0]) || 0, Number(p[1]) || 0, Number(p[2]) || 0, p[3] === undefined ? 0.5 : Number(p[3])]),
    closed: role === 'plane' ? true : Boolean(e.closed),
    realize: { ...(DEFAULT_REALIZE[role] || DEFAULT_REALIZE.line), ...(e.realize || {}), params: { ...(e.realize?.params || {}) } },
    color: e.color || null,
    text: role === 'note' ? String(e.text || '') : e.text,
    why: e.why || '',
    by: e.by || { kind: 'user', name: 'you' },
    seed: e.seed ?? Math.floor(Math.random() * 1e9),
    created: e.created || Date.now()
  };
}

/** Bounding box of an element's points. */
export function bounds(e) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of e.points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return { x0, y0, x1, y1 };
}

/**
 * Observable store with snapshot undo. Mutations go through `change(label, fn)` so every
 * edit is one undo step and one recorded action.
 */
export class ProcessStore {
  constructor(doc) {
    this.doc = normalizeDocument(doc || createDocument());
    this.past = [];
    this.future = [];
    this.listeners = new Set();
    this.log = []; // [{ t, label, by }] — the recorded editing session
  }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit(reason) { for (const fn of this.listeners) fn(this.doc, reason); }

  /** Apply a mutation as one undoable step. */
  change(label, fn, { by = 'user', record = true } = {}) {
    this.past.push(JSON.stringify(this.doc));
    if (this.past.length > 200) this.past.shift();
    this.future = [];
    const result = fn(this.doc);
    if (record) this.log.push({ t: Date.now(), label, by });
    this.emit(label);
    return result;
  }

  /** Record an edit made directly on `doc` (e.g. a drag): `before` is the JSON snapshot taken first. */
  commitFrom(before, label, { by = 'user' } = {}) {
    if (before === JSON.stringify(this.doc)) return;
    this.past.push(before);
    if (this.past.length > 200) this.past.shift();
    this.future = [];
    this.log.push({ t: Date.now(), label, by });
    this.emit(label);
  }

  replace(doc, label = 'load') {
    this.change(label, () => { this.doc = normalizeDocument(doc); });
  }

  undo() {
    if (!this.past.length) return false;
    this.future.push(JSON.stringify(this.doc));
    this.doc = JSON.parse(this.past.pop());
    this.emit('undo');
    return true;
  }

  redo() {
    if (!this.future.length) return false;
    this.past.push(JSON.stringify(this.doc));
    this.doc = JSON.parse(this.future.pop());
    this.emit('redo');
    return true;
  }

  // ---- convenience mutations ----
  addElement(el, opts) {
    return this.change(`add ${el.role || 'element'}`, d => {
      const e = normalizeElement(el, el.stage || d.stages[0].id);
      d.elements.push(e);
      return e;
    }, opts);
  }

  updateElement(id, patch, label = 'edit', opts) {
    return this.change(label, d => {
      const e = d.elements.find(x => x.id === id);
      if (!e) return null;
      Object.assign(e, patch);
      if (patch.realize) e.realize = { ...e.realize, ...patch.realize, params: { ...e.realize.params, ...(patch.realize.params || {}) } };
      return e;
    }, opts);
  }

  removeElements(ids, opts) {
    const set = new Set(ids);
    return this.change('delete', d => { d.elements = d.elements.filter(e => !set.has(e.id)); }, opts);
  }

  addStage(stage, index = null, opts) {
    return this.change('add stage', d => {
      const s = { id: newId('stage'), name: 'Stage', kind: 'marks', visible: true, locked: false, ...stage };
      if (index === null) d.stages.push(s); else d.stages.splice(index, 0, s);
      return s;
    }, opts);
  }

  updateStage(id, patch, opts) {
    return this.change('edit stage', d => { const s = d.stages.find(x => x.id === id); if (s) Object.assign(s, patch); return s; }, opts);
  }

  moveStage(id, delta) {
    return this.change('reorder stages', d => {
      const i = d.stages.findIndex(s => s.id === id), j = i + delta;
      if (i < 0 || j < 0 || j >= d.stages.length) return;
      const [s] = d.stages.splice(i, 1);
      d.stages.splice(j, 0, s);
    });
  }

  removeStage(id) {
    return this.change('delete stage', d => {
      if (d.stages.length <= 1) return;
      const fallback = d.stages.find(s => s.id !== id).id;
      d.stages = d.stages.filter(s => s.id !== id);
      for (const e of d.elements) if (e.stage === id) e.stage = fallback;
    });
  }

  addDecision(dec, opts) {
    return this.change('decision', d => { const x = { id: newId('dec'), t: Date.now(), ...dec }; d.decisions.push(x); return x; }, opts);
  }

  /** Elements in drawing order: stage order, then creation order within a stage. */
  ordered() {
    const rank = new Map(this.doc.stages.map((s, i) => [s.id, i]));
    return this.doc.elements
      .map((e, i) => [e, i])
      .sort((a, b) => (rank.get(a[0].stage) ?? 0) - (rank.get(b[0].stage) ?? 0) || a[1] - b[1])
      .map(([e]) => e);
  }
}
