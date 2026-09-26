/**
 * Process document: the canonical record of how a picture is made.
 *
 * Paths with a role (point, line, plane, guide, gesture, note), grouped into ordered
 * stages, each realized by a brush, each carrying its reason and provenance.
 * Decisions (question, options, chosen, why) are kept alongside.
 *
 * Coordinates are artboard units (0..width, 0..height). Points are [x, y, t, p]:
 * t = milliseconds from the start of the gesture, p = pressure 0..1.
 *
 * Pure data + a tiny observable store with undo. No DOM.
 */
import { installLines, embedBrushes } from './brushes.js';
import { migrateBoards, boardsOf, newBoardId, nextBoardPlace, boardForPoints, MAIN, BLACKBOARD } from './boards.js';

export const PROCESS_VERSION = 1;

/** Blend modes (canvas globalCompositeOperation / CSS mix-blend-mode names). */
export const BLENDS = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-burn', 'color-dodge', 'soft-light', 'hard-light', 'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'];

export const ROLES = Object.freeze({
  point: 'A mark at a place: tension depends on where it sits (Kandinsky).',
  line: 'A point that moved (Klee: a line going for a walk).',
  plane: 'An enclosed area: realized by fill, hatching, or a field.',
  guide: 'Construction that is not part of the picture: axes, horizons, envelopes.',
  gesture: 'The movement behind a form: often drawn first, often hidden later.',
  note: 'A written annotation: reasons, critique, questions.',
  image: 'A picture placed on the page: a collage layer, a study, a quotation.'
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
  note: { brush: 'none', params: {} },
  image: { brush: 'image', params: {} }
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
  d.lines = d.lines && typeof d.lines === 'object' ? d.lines : {};
  d.groups = d.groups && typeof d.groups === 'object' ? d.groups : {};
  d.brushes = d.brushes && typeof d.brushes === 'object' ? d.brushes : {};
  migrateBoards(d);
  if (d.train && !boardsOf(d).some(b => b.id === d.train)) delete d.train;
  installLines(d);
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
    ...(e.fill ? { fill: e.fill } : {}),
    text: role === 'note' ? String(e.text || '') : e.text,
    why: e.why || '',
    by: e.by || { kind: 'user', name: 'you' },
    seed: e.seed ?? Math.floor(Math.random() * 1e9),
    created: e.created || Date.now(),
    ...(e.label ? { label: String(e.label) } : {}),
    ...(e.group ? { group: String(e.group) } : {}),
    ...(e.board && e.board !== MAIN ? { board: String(e.board) } : {}),
    ...(e.hidden ? { hidden: true } : {}),
    ...(e.locked ? { locked: true } : {}),
    ...(e.note && typeof e.note === 'object' ? { note: { ...e.note } } : {}),
    ...(e.src ? { src: String(e.src) } : {}),
    ...(e.asset ? { asset: String(e.asset) } : {}),
    ...(Number.isFinite(Number(e.opacity)) && Number(e.opacity) < 1 ? { opacity: Math.max(0, Number(e.opacity)) } : {}),
    ...(e.blend && e.blend !== 'normal' ? { blend: String(e.blend) } : {}),
    ...(e.path === 'straight' ? { path: 'straight' } : {})
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
    embedBrushes(this.doc);
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
      // A mark goes to the board it lands on (the blackboard outside them), unless told.
      if (!('board' in el)) { const b = boardForPoints(d, e.points); if (b !== MAIN) e.board = b; }
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

  /** Set fields (label, hidden, locked, group, stage…) on several elements at once; null removes a field. */
  patchElements(ids, patch, label = 'edit', opts) {
    const set = new Set(ids);
    return this.change(label, d => {
      for (const e of d.elements) if (set.has(e.id)) for (const [k, v] of Object.entries(patch)) { if (v === null || v === false) delete e[k]; else e[k] = v; }
    }, opts);
  }

  /** Group elements under a new group (named); returns the group id. */
  group(ids, name = null, opts) {
    return this.change('group', d => {
      const id = newId('group');
      d.groups = d.groups || {};
      d.groups[id] = { name: name || `Group ${Object.keys(d.groups).length + 1}` };
      const set = new Set(ids);
      for (const e of d.elements) if (set.has(e.id)) e.group = id;
      return id;
    }, opts);
  }

  ungroup(ids, opts) {
    const set = new Set(ids);
    return this.change('ungroup', d => {
      for (const e of d.elements) if (set.has(e.id)) delete e.group;
      const used = new Set(d.elements.map(e => e.group).filter(Boolean));
      for (const g of Object.keys(d.groups || {})) if (!used.has(g)) delete d.groups[g];
    }, opts);
  }

  renameGroup(id, name, opts) { return this.change('rename group', d => { if (d.groups?.[id]) d.groups[id].name = name; }, opts); }

  /**
   * Move elements before another element (or to the end of a stage), optionally into its group.
   * Order in the elements array is the drawing order within a stage.
   */
  reorder(ids, { before = null, stage = null, group } = {}, opts) {
    return this.change('reorder', d => {
      const set = new Set(ids);
      const moving = d.elements.filter(e => set.has(e.id));
      d.elements = d.elements.filter(e => !set.has(e.id));
      const target = before ? d.elements.find(e => e.id === before) : null;
      for (const e of moving) {
        if (target) e.stage = target.stage; else if (stage) e.stage = stage;
        if (group !== undefined) { if (group) e.group = group; else delete e.group; }
      }
      let at = target ? d.elements.indexOf(target) : -1;
      if (at < 0) { const st = moving[0]?.stage; const last = d.elements.map(e => e.stage).lastIndexOf(st); at = last + 1; }
      d.elements.splice(at, 0, ...moving);
    }, opts);
  }

  /** Drawing order within each stage: 'front' | 'back' | 'forward' | 'backward'. */
  arrange(ids, how, opts) {
    const set = new Set(ids);
    return this.change(`arrange ${how}`, d => {
      for (const st of d.stages) {
        const inStage = d.elements.filter(e => e.stage === st.id);
        if (!inStage.some(e => set.has(e.id))) continue;
        let order = inStage.slice();
        if (how === 'front') order = [...order.filter(e => !set.has(e.id)), ...order.filter(e => set.has(e.id))];
        else if (how === 'back') order = [...order.filter(e => set.has(e.id)), ...order.filter(e => !set.has(e.id))];
        else if (how === 'forward') { for (let i = order.length - 2; i >= 0; i--) if (set.has(order[i].id) && !set.has(order[i + 1].id)) [order[i], order[i + 1]] = [order[i + 1], order[i]]; }
        else if (how === 'backward') { for (let i = 1; i < order.length; i++) if (set.has(order[i].id) && !set.has(order[i - 1].id)) [order[i], order[i - 1]] = [order[i - 1], order[i]]; }
        // Put the stage's elements back into their original slots in the array.
        const slots = d.elements.map((e, i) => (e.stage === st.id ? i : -1)).filter(i => i >= 0);
        slots.forEach((slot, j) => { d.elements[slot] = order[j]; });
      }
    }, opts);
  }

  /** Copies of elements, offset; returns the new ids. Groups are copied as new groups. */
  duplicate(ids, dx = 20, dy = 20, opts) {
    return this.change('duplicate', d => {
      const set = new Set(ids), groupMap = {}, out = [];
      for (const e of d.elements.filter(x => set.has(x.id))) {
        const c = structuredClone(e);
        c.id = newId(e.role); c.points = c.points.map(([x, y, ...r]) => [x + dx, y + dy, ...r]);
        if (e.group) { groupMap[e.group] ||= newId('group'); c.group = groupMap[e.group]; d.groups = d.groups || {}; d.groups[c.group] = { name: `${d.groups[e.group]?.name || 'Group'} copy` }; }
        d.elements.push(c); out.push(c.id);
      }
      return out;
    }, opts);
  }

  /** Fewer points, same shape (Ramer–Douglas–Peucker; tolerance in artboard units). Time and pressure are kept. */
  simplify(ids, tolerance, opts) {
    const set = new Set(ids);
    return this.change('simplify', d => {
      let before = 0, after = 0;
      for (const e of d.elements) {
        if (!set.has(e.id) || e.points.length < 4 || ['point', 'note', 'image'].includes(e.role)) continue;
        before += e.points.length;
        e.points = rdp(e.points, tolerance);
        after += e.points.length;
      }
      return { before, after };
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

  // ---- boards ---------------------------------------------------------------------------
  /** Add a board ({ title, width, height, x, y, ground }); placed right of the others unless x, y given. Returns it. */
  addBoard(b = {}, opts) {
    return this.change('add board', d => {
      const width = Number(b.width) || d.artboard.width, height = Number(b.height) || d.artboard.height;
      const place = Number.isFinite(b.x) && Number.isFinite(b.y) ? { x: b.x, y: b.y, width, height } : nextBoardPlace(d, width, height);
      const board = { id: b.id && !boardsOf(d).some(x => x.id === b.id) ? String(b.id) : newBoardId(d), title: b.title || `Board ${boardsOf(d).length + 1}`, ...place, ground: b.ground || d.artboard.ground };
      d.boards.push(board);
      // Marks already lying inside it (from the blackboard) join it, when it was placed on purpose.
      if (b.adopt ?? (Number.isFinite(b.x) && Number.isFinite(b.y))) for (const e of d.elements) if (e.board === BLACKBOARD && boardForPoints(d, e.points) === board.id) e.board = board.id;
      return board;
    }, opts);
  }

  /** Change a board: title, ground, size, place. The main board changes the artboard (it cannot move). */
  updateBoard(id, patch, opts) {
    return this.change('board', d => {
      if (id === MAIN) {
        if ('title' in patch) d.artboard.title = patch.title;
        for (const k of ['width', 'height', 'ground', 'text', 'code']) if (k in patch) { if (patch[k] === '' || patch[k] == null) delete d.artboard[k]; else d.artboard[k] = patch[k]; }
        return;
      }
      const b = d.boards.find(x => x.id === id);
      if (!b) return;
      if (('x' in patch || 'y' in patch) && patch.moveMarks !== false) {
        const dx = (patch.x ?? b.x) - b.x, dy = (patch.y ?? b.y) - b.y;
        for (const e of d.elements) if (e.board === id) e.points = e.points.map(([x, y, t, p]) => [x + dx, y + dy, t, p]);
      }
      for (const k of ['title', 'ground', 'width', 'height', 'x', 'y']) if (k in patch) b[k] = patch[k];
      for (const k of ['text', 'code']) if (k in patch) { if (patch[k] === '' || patch[k] == null) delete b[k]; else b[k] = String(patch[k]); }
    }, opts);
  }

  /** Remove a board: its marks go to the blackboard, or are deleted with it. */
  removeBoard(id, { deleteMarks = false } = {}, opts) {
    if (id === MAIN) return;
    return this.change('remove board', d => {
      d.boards = d.boards.filter(b => b.id !== id);
      if (deleteMarks) d.elements = d.elements.filter(e => e.board !== id);
      else for (const e of d.elements) if (e.board === id) e.board = BLACKBOARD;
      if (d.train === id) delete d.train;
    }, opts);
  }

  /** Move a board in the sequence (the main board stays first). */
  moveBoard(id, delta, opts) {
    return this.change('reorder boards', d => {
      const i = d.boards.findIndex(b => b.id === id), j = i + delta;
      if (i < 0 || j < 0 || j >= d.boards.length) return;
      const [b] = d.boards.splice(i, 1); d.boards.splice(j, 0, b);
    }, opts);
  }

  /** Put a board at a place in the sequence (0 = right after the main board). */
  placeBoard(id, index, opts) {
    return this.change('reorder boards', d => {
      const i = d.boards.findIndex(b => b.id === id);
      if (i < 0) return;
      const [b] = d.boards.splice(i, 1);
      d.boards.splice(Math.max(0, Math.min(d.boards.length, index)), 0, b);
    }, opts);
  }

  /** Put marks on a board (MAIN, an id, or BLACKBOARD). */
  assignBoard(ids, id, opts) {
    return this.change('move to board', d => { for (const e of d.elements) if (ids.includes(e.id)) { if (!id || id === MAIN) delete e.board; else e.board = id; } }, opts);
  }

  /**
   * Run a board's own code: its score runs with the board as its artboard (fractions of the board),
   * and the marks it makes replace the ones its last run made. The code is kept on the board.
   * One undo step. Returns { error, line, logs, marks }.
   */
  runBoardCode(id, source, run, opts) {
    const b = boardsOf(this.doc).find(x => x.id === id);
    if (!b) return { error: 'No such board' };
    const res = run(source, { base: { ...createDocument({ width: b.width, height: b.height, ground: b.ground }), stages: [] }, by: { kind: 'code', name: b.id } });
    if (res.error) return { error: res.error, line: res.errorLine, logs: res.logs };
    this.change('board code', d => {
      const mine = e => e.by?.kind === 'code' && e.by?.name === id;
      d.elements = d.elements.filter(e => !mine(e));
      d.decisions = d.decisions.filter(x => !(x.by?.kind === 'code' && x.by?.name === id));
      Object.assign(d.brushes, res.doc.brushes || {});
      Object.assign(d.lines, res.doc.lines || {});
      const stageId = new Map();
      for (const s of res.doc.stages) {
        let t = d.stages.find(x => x.name === s.name);
        if (!t) { t = { ...s, id: newId('stage') }; d.stages.push(t); }
        stageId.set(s.id, t.id);
      }
      const onBoard = id === MAIN ? undefined : id;
      for (const e of res.doc.elements) d.elements.push({ ...e, id: newId(e.role), stage: stageId.get(e.stage) || d.stages[0].id, by: { kind: 'code', name: id }, ...(onBoard ? { board: onBoard } : {}), points: e.points.map(([x, y, t, p]) => [x + b.x, y + b.y, t, p]) });
      for (const x of res.doc.decisions) d.decisions.push({ ...x, id: newId('dec'), stage: stageId.get(x.stage) || d.stages[0].id, by: { kind: 'code', name: id } });
      if (id === MAIN) d.artboard.code = source; else d.boards.find(x => x.id === id).code = source;
    }, opts);
    return { error: null, logs: res.logs, marks: res.doc.elements.length };
  }

  setTrainBoard(id, opts) { return this.change('training board', d => { if (!id || id === MAIN) delete d.train; else d.train = id; }, opts); }

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

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const L = Math.hypot(bx - ax, by - ay) || 1;
  let far = 0, at = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((by - ay) * pts[i][0] - (bx - ax) * pts[i][1] + bx * ay - by * ax) / L;
    if (d > far) { far = d; at = i; }
  }
  if (far <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, at + 1), eps).slice(0, -1), ...rdp(pts.slice(at), eps)];
}
