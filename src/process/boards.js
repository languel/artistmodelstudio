/**
 * Boards: a drawing can hold several artboards. The first, the main board, is the document's
 * `artboard` at the origin (so every older drawing, score and training record stays valid). More
 * boards live in `doc.boards`: { id, title, x, y, width, height, ground }, in sequence order.
 *
 * A mark belongs to a board through `e.board`:
 *   (absent)   the main board
 *   'id'       that board
 *   '_'        the blackboard: the space outside the boards, kept but in no board's picture
 *
 * `boardDoc(doc, id)` is one board as a document of its own (its marks, moved to the board's
 * origin, and its size as the artboard), so export, training and the process sheet work per board.
 * `doc.train` names the board models learn from (the main board by default).
 */
export const MAIN = 'main';
export const BLACKBOARD = '_';

/**
 * What a board holds: 'drawing' (marks, and optional studio code: the default), 'markdown' (a
 * document), 'html' (a page), 'p5' (a sketch), or 'frame': a slide, an area that holds the boards
 * whose centres lie inside it (they move with it, present together and export side by side).
 */
export const BOARD_KINDS = ['drawing', 'markdown', 'html', 'p5', 'frame', 'player'];
export const boardKind = b => (BOARD_KINDS.includes(b?.kind) ? b.kind : 'drawing');
export const isFrame = b => b?.kind === 'frame';
/** A player: controls (play, scrub, step, speed) for the source it names (board.source). */
export const isPlayer = b => b?.kind === 'player';

/** The boards a frame holds (their centres inside it), in reading order. */
export function boardsInFrame(doc, frame) {
  return boardsOf(doc).filter(b => b.id !== frame.id && !isFrame(b) && b.x + b.width / 2 >= frame.x && b.x + b.width / 2 <= frame.x + frame.width && b.y + b.height / 2 >= frame.y && b.y + b.height / 2 <= frame.y + frame.height)
    .sort((a, b) => (Math.abs(a.y - b.y) < 40 ? a.x - b.x : a.y - b.y));
}

/** The frame holding a board, or null. */
export const frameOf = (doc, b) => boardsOf(doc).find(f => isFrame(f) && boardsInFrame(doc, f).some(x => x.id === b.id)) || null;

/** What is presented, in order: the frames (reading order) when there are any, else the boards. */
export function slidesOf(doc) {
  const frames = boardsOf(doc).filter(isFrame);
  return frames.length ? frames.sort((a, b) => (Math.abs(a.y - b.y) < 40 ? a.x - b.x : a.y - b.y)) : boardsOf(doc);
}

/**
 * A board's switches: locked (its marks and the board itself stay as they are), hidden (not drawn,
 * not run), hideLabel (no title above it), perf (a performance line under it).
 */
export const BOARD_FLAGS = ['locked', 'hidden', 'hideLabel', 'perf', 'controls'];
/** Redraw rate: runs a second for a board that follows a source (none: once per new source frame). */
export const rateOf = b => { const r = Number(b?.rate); return Number.isFinite(r) && r > 0 ? Math.min(60, r) : 0; };
const flagsOf = b => ({ ...Object.fromEntries(BOARD_FLAGS.filter(k => b?.[k]).map(k => [k, true])), ...(rateOf(b) ? { rate: rateOf(b) } : {}) });

/** All boards, the main one first, each with its place: { id, title, x, y, width, height, ground, main }. */
export function boardsOf(doc) {
  const a = doc.artboard || { width: 1000, height: 1000, ground: '#f3efe6' };
  return [
    { id: MAIN, title: a.title || 'Main', x: 0, y: 0, width: a.width, height: a.height, ground: a.ground, ...(a.text ? { text: a.text } : {}), ...(a.code ? { code: a.code } : {}), ...(a.pseudo ? { pseudo: a.pseudo } : {}), ...(a.follow ? { follow: a.follow } : {}), ...(a.live ? { live: true } : {}), ...(a.paused ? { paused: true } : {}), ...(a.kind ? { kind: a.kind } : {}), ...(a.source ? { source: a.source, sourceOpacity: a.sourceOpacity, ...(a.sourceFit ? { sourceFit: a.sourceFit } : {}), ...(a.sourceBlend ? { sourceBlend: a.sourceBlend } : {}) } : {}), ...flagsOf(a), main: true },
    ...(doc.boards || []).map(b => ({ ...b, main: false }))
  ];
}

export const boardById = (doc, id) => boardsOf(doc).find(b => b.id === (id || MAIN)) || null;

/** Find a board by id or title (case-insensitive). */
export function findBoard(doc, key) {
  if (key == null) return boardById(doc, MAIN);
  const k = String(key).toLowerCase();
  return boardsOf(doc).find(b => b.id === key || String(b.title).toLowerCase() === k) || null;
}

/** The board id a mark belongs to (MAIN, a board id, or BLACKBOARD). */
export const boardOfMark = e => e.board || MAIN;

/** The value to store on a mark for a board id (the main board is the absent field). */
export const markBoard = id => (!id || id === MAIN ? undefined : id);

/** The topmost board containing a world point (later boards sit above earlier ones), or null. */
export function boardAt(doc, x, y) {
  // Boards before frames: a mark drawn on a board inside a frame belongs to the board.
  const bs = [...boardsOf(doc).filter(isFrame), ...boardsOf(doc).filter(b => !isFrame(b))];
  for (let i = bs.length - 1; i >= 0; i--) {
    const b = bs[i];
    if (x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height) return b;
  }
  return null;
}

/** The board a set of points falls in: the board holding their center, else the blackboard. */
export function boardForPoints(doc, points) {
  if (!points?.length) return BLACKBOARD;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const b = boardAt(doc, (x0 + x1) / 2, (y0 + y1) / 2);
  return b ? b.id : BLACKBOARD;
}

/** Marks of one board. */
export const marksOf = (doc, id) => doc.elements.filter(e => boardOfMark(e) === (id || MAIN));

/**
 * One board as a document of its own: its marks at the board's origin, its size as the artboard.
 * The main board of a drawing without other boards is the drawing itself (minus the blackboard).
 */
export function boardDoc(doc, id = MAIN) {
  const b = boardById(doc, id) || boardById(doc, MAIN);
  const els = marksOf(doc, b.id);
  const moved = b.x || b.y ? els.map(e => ({ ...e, points: e.points.map(([x, y, t, p]) => [x - b.x, y - b.y, t, p]), board: undefined })) : els.map(e => (e.board ? { ...e, board: undefined } : e));
  const { boards, train, ...rest } = doc;
  return { ...rest, title: b.main ? doc.title : `${doc.title} · ${b.title}`, artboard: { width: b.width, height: b.height, ground: b.ground }, elements: moved };
}

/** The board models learn from. */
export const trainBoard = doc => boardById(doc, doc.train)?.id || MAIN;

/** A fresh id for a new board. */
export function newBoardId(doc) {
  const used = new Set(boardsOf(doc).map(b => b.id));
  let n = used.size + 1;
  while (used.has(`board${n}`)) n++;
  return `board${n}`;
}

/** Where a new board goes: right of every board and every mark (so it never lands on the blackboard's scratch), top-aligned with the main one. */
export function nextBoardPlace(doc, width, height, gap = 80) {
  let right = Math.max(...boardsOf(doc).map(b => b.x + b.width));
  for (const e of doc.elements || []) for (const q of e.points) if (q[0] > right) right = q[0];
  return { x: Math.round(right + gap), y: 0, width, height };
}

/**
 * Older drawings have no boards: their marks lying wholly outside the artboard were scratch, so
 * they go to the blackboard. Runs once (the document then has a `boards` list).
 */
export function migrateBoards(d) {
  if (Array.isArray(d.boards)) {
    d.boards = d.boards.filter(b => b && b.id && b.id !== MAIN && b.id !== BLACKBOARD).map(b => ({
      id: String(b.id), title: String(b.title || b.id), x: Number(b.x) || 0, y: Number(b.y) || 0,
      width: Math.max(10, Number(b.width) || 1000), height: Math.max(10, Number(b.height) || 1000), ground: b.ground || d.artboard.ground,
      ...(b.text ? { text: String(b.text) } : {}), ...(b.code ? { code: String(b.code) } : {}), ...(b.pseudo ? { pseudo: String(b.pseudo) } : {}),
      ...(b.follow ? { follow: true } : {}), ...(b.live ? { live: true } : {}), ...(b.paused ? { paused: true } : {}), ...(b.kind ? { kind: String(b.kind) } : {}), ...(b.source ? { source: String(b.source), sourceOpacity: Number(b.sourceOpacity ?? 0.5), ...(b.sourceFit ? { sourceFit: String(b.sourceFit) } : {}), ...(b.sourceBlend ? { sourceBlend: String(b.sourceBlend) } : {}) } : {}), ...flagsOf(b)
    }));
    const ids = new Set([MAIN, BLACKBOARD, ...d.boards.map(b => b.id)]);
    for (const e of d.elements) if (e.board && !ids.has(e.board)) e.board = BLACKBOARD;
    return d;
  }
  d.boards = [];
  const { width, height } = d.artboard;
  for (const e of d.elements) {
    if (e.board || !e.points?.length) continue;
    const outside = e.points.every(([x, y]) => x < 0 || y < 0 || x > width || y > height);
    if (outside) e.board = BLACKBOARD;
  }
  return d;
}
