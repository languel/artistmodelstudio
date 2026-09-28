/**
 * Parts: pieces of a drawing as files (.ams.json), and bringing them into another drawing.
 *
 * A part is an ordinary process document with meta.part saying what it holds:
 *   'scene'      the whole drawing, every board
 *   'board'      one board: its marks (from its top-left), and in artboard its size, paper, title,
 *                code, text and source
 *   'selection'  some marks (from their bounds' top-left), on no board
 * Stages, brushes and lines come along; stages are matched by name when the part comes in.
 */
import { boardsOf, boardById, boardDoc, boardAt, markBoard, newBoardId, nextBoardPlace, MAIN, BLACKBOARD } from './boards.js';
import { normalizeDocument, newId } from './document.js';

const BOARD_KEYS = ['code', 'text', 'follow', 'source', 'sourceOpacity'];

export function scenePart(doc) {
  return { ...structuredClone(doc), meta: { ...(doc.meta || {}), part: 'scene' } };
}

/** One board as a part: its marks from its top-left, its settings in artboard. */
export function boardPart(doc, id = MAIN) {
  const b = boardById(doc, id);
  if (!b) return null;
  const d = structuredClone(boardDoc(doc, b.id));
  d.title = b.title;
  d.artboard = { ...d.artboard, title: b.title, ...Object.fromEntries(BOARD_KEYS.filter(k => b[k] !== undefined).map(k => [k, b[k]])) };
  d.meta = { ...(d.meta || {}), part: 'board' };
  return d;
}

/** A selection document (see app.selectionDoc) as a part. */
export function selectionPart(selDoc) {
  return selDoc ? { ...structuredClone(selDoc), meta: { ...(selDoc.meta || {}), part: 'selection' } } : null;
}

/** What a document holds, when it does not say: several boards make a scene, else a board. */
export const partKind = part => part?.meta?.part || ((part?.boards || []).length ? 'scene' : 'board');

/** Is this (parsed JSON) a studio drawing or part? */
export const isPart = j => Boolean(j && typeof j === 'object' && (j.type === 'ams-process' || (Array.isArray(j.stages) && Array.isArray(j.elements))));

/**
 * Bring a part into `doc` (mutated; call inside store.change). at: [x, y] for a selection's top-left
 * (default: right of everything). Returns { kind, boards: [ids], elements: [ids] }.
 */
export function importPart(doc, raw, { at = null } = {}) {
  const part = normalizeDocument(structuredClone(raw));
  const kind = partKind(raw);
  const out = { kind, boards: [], elements: [] };

  // Stages by name (made when missing), brushes and lines kept where the drawing has none by that id.
  const stageOf = new Map();
  for (const s of part.stages) {
    let t = doc.stages.find(x => x.name === s.name);
    if (!t) { t = { ...structuredClone(s), id: newId('stage') }; doc.stages.push(t); }
    stageOf.set(s.id, t.id);
  }
  for (const key of ['brushes', 'lines']) {
    doc[key] = doc[key] || {};
    for (const [id, v] of Object.entries(part[key] || {})) if (!(id in doc[key])) doc[key][id] = v;
  }
  const groups = new Map();
  const bring = (e, dx, dy, board) => {
    const c = structuredClone(e);
    c.id = newId(e.role);
    c.stage = stageOf.get(e.stage) || doc.stages[0].id;
    if (c.group) { if (!groups.has(c.group)) groups.set(c.group, `group-${Math.random().toString(36).slice(2, 8)}`); c.group = groups.get(c.group); }
    c.points = c.points.map(([x, y, t, p]) => [x + dx, y + dy, t, p]);
    delete c.board;
    const on = markBoard(board);
    if (on) c.board = on;
    doc.elements.push(c);
    out.elements.push(c.id);
  };

  if (kind === 'selection') {
    const [x, y] = at || [nextBoardPlace(doc, 0, 0).x, 0];
    const w = part.artboard.width, h = part.artboard.height;
    const board = boardAt(doc, x + w / 2, y + h / 2)?.id || BLACKBOARD;
    const gid = `group-${Math.random().toString(36).slice(2, 8)}`;
    doc.groups = doc.groups || {};
    doc.groups[gid] = { name: part.title || 'imported' };
    for (const e of part.elements) { bring({ ...e, group: undefined }, x, y, board); doc.elements.at(-1).group = gid; }
    return out;
  }

  // A board, or every board of a scene: each becomes a new board, right of the others.
  const boards = kind === 'scene' ? boardsOf(part).map(b => ({ ...b, doc: boardDoc(part, b.id) })) : [{ ...part.artboard, title: part.artboard.title || part.title, doc: part }];
  for (const b of boards) {
    const place = nextBoardPlace(doc, b.width, b.height);
    const id = newBoardId(doc);
    doc.boards = doc.boards || [];
    doc.boards.push({ id, title: b.title || 'Imported', x: place.x, y: place.y, width: b.width, height: b.height, ground: b.ground || doc.artboard.ground,
      ...Object.fromEntries(BOARD_KEYS.filter(k => b[k] !== undefined).map(k => [k, b[k]])) });
    for (const e of b.doc.elements) bring(e, place.x, place.y, id);
    out.boards.push(id);
  }
  return out;
}
