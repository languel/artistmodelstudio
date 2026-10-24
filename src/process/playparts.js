/**
 * What a mark's `play` says it is, and how it should look. Pure: used by the Properties editor and tests.
 * A mark that plays gets the marker brush for what it is (a traveler's ring, a trigger's ripple…), unless
 * it already has a brush of its own choosing; take the play away and it goes back to its role's brush.
 */
import { BRUSHES } from './brushes.js';
import { DEFAULT_REALIZE } from './document.js';

export const PARTS = ['path', 'travel', 'trigger', 'body', 'node'];
export const MARKER = { path: 'path', travel: 'traveler', trigger: 'trigger', body: 'body', node: 'node' };
const SCORE_BRUSHES = new Set(Object.values(MARKER));
/** Which marker wins when a mark is several things. */
const PRIORITY = ['node', 'trigger', 'body', 'travel', 'path'];

/** Which parts a mark plays. */
export const partsOf = play => PARTS.filter(k => play?.[k]);

/** The marker brush for a mark's parts and role, or null. */
export function markerFor(role, play) {
  for (const k of PRIORITY) if (play?.[k] && BRUSHES[MARKER[k]]?.roles.includes(role)) return MARKER[k];
  return null;
}

/** The realize a mark should have after its play changed: markers follow the play, other brushes stay. */
export function realizeAfter(el, play) {
  const cur = el.realize?.brush;
  const mine = SCORE_BRUSHES.has(cur) || cur === DEFAULT_REALIZE[el.role]?.brush;
  if (!mine) return el.realize;
  const marker = markerFor(el.role, play);
  if (marker === cur) return el.realize;
  if (marker) return { brush: marker, params: {} };
  return SCORE_BRUSHES.has(cur) ? { ...(DEFAULT_REALIZE[el.role] || { brush: 'ink' }), params: {} } : el.realize;
}

/** The starting `play` of a part. */
export function newPart(kind, { path = '' } = {}) {
  if (kind === 'path') return true;
  if (kind === 'travel') return { on: path };   // (how long it takes: its path's time, unless it says)
  if (kind === 'trigger') return {};
  if (kind === 'body') return { speed: [60, 200] };
  if (kind === 'node') return { kind: 'note', note: 60 };
  return null;
}

/** A line, or anything with a curve, can be travelled. */
export const canBePath = e => e.points?.length >= 2 && e.role !== 'note' && e.role !== 'image';
