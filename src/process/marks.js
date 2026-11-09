/**
 * Annotations: markers with notes, kept on a clip.
 *
 * A mark is { id, at, text, kind }: `at` is ms from the start of its clip, so it moves, copies and splits with the clip.
 * kind says what the note is for:
 *   note         a plain note
 *   feedback     something to change or to praise, for whoever works on it next
 *   instruction  what to generate or do here (read by an agent, or put to a model)
 * A mark can also carry `by` (who wrote it: a name, 'whisper' for speech turned to text) and `end` (ms from the clip start, a
 * stretch rather than a moment; speech-to-text makes these).
 */
import { flatClips, clipId } from './take.js';

export const MARK_KINDS = ['note', 'feedback', 'instruction'];
export const MARK_LABEL = { note: 'Note', feedback: 'Feedback', instruction: 'Instruction' };

let seq = 0;
const markId = () => `mark-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const kindOf = k => (MARK_KINDS.includes(k) ? k : 'note');

/** Put a mark on a clip, `at` ms after its start (clamped to the clip). Returns the mark. */
export function addMark(clip, at, text = '', kind = 'note', extra = {}) {
  const dur = clip.dur || 0;
  const m = { id: markId(), at: Math.round(Math.max(0, Math.min(dur, at || 0))), text: String(text ?? ''), kind: kindOf(kind), ...extra };
  if (m.end != null) m.end = Math.round(Math.max(m.at, Math.min(dur, m.end)));
  (clip.marks ||= []).push(m);
  clip.marks.sort((a, b) => a.at - b.at);
  return m;
}

/** Change a mark: text, kind, or where it is. */
export function setMark(clip, id, patch = {}) {
  const m = (clip.marks || []).find(x => x.id === id);
  if (!m) return null;
  if (patch.text != null) m.text = String(patch.text);
  if (patch.kind != null) m.kind = kindOf(patch.kind);
  if (patch.at != null) {
    const len = m.end != null ? m.end - m.at : 0;
    m.at = Math.round(Math.max(0, Math.min(clip.dur || 0, patch.at)));
    if (m.end != null) m.end = Math.min(clip.dur || 0, m.at + len);
    clip.marks.sort((a, b) => a.at - b.at);
  }
  return m;
}

export function removeMark(clip, id) {
  const n = (clip.marks || []).length;
  clip.marks = (clip.marks || []).filter(m => m.id !== id);
  if (!clip.marks.length) delete clip.marks;
  return n !== (clip.marks || []).length;
}

/**
 * A clip cut `first` ms from its start: its marks from there on go to the second half (and are renumbered from its start).
 * Returns the marks for the new clip; the first clip keeps the earlier ones.
 */
export function splitMarks(clip, first) {
  const all = clip.marks || [];
  const keep = all.filter(m => m.at < first), move = all.filter(m => m.at >= first).map(m => ({ ...m, id: markId(), at: m.at - first, ...(m.end != null ? { end: m.end - first } : {}) }));
  if (keep.length) clip.marks = keep; else delete clip.marks;
  return move;
}

/** A stretch of a clip's marks, shifted (a clip trimmed at the start). */
export function shiftMarks(clip, by) {
  if (!clip.marks) return;
  clip.marks = clip.marks.map(m => ({ ...m, at: m.at - by, ...(m.end != null ? { end: m.end - by } : {}) })).filter(m => (m.end ?? m.at) >= 0 && m.at <= (clip.dur || 0)).map(m => ({ ...m, at: Math.max(0, m.at) }));
  if (!clip.marks.length) delete clip.marks;
}

/**
 * Every mark in a take, in time order, with the take time it falls at and the clip it is on.
 * opts: { kind, track, text (a word in the note) }
 */
export function marksOf(take, { kind = null, track = null, text = null } = {}) {
  const out = [], q = text ? String(text).toLowerCase() : null;
  for (const c of flatClips(take || { clips: [] })) {
    if (track && c.track !== track) continue;
    for (const m of c.marks || []) {
      if (kind && m.kind !== kind) continue;
      if (q && !String(m.text).toLowerCase().includes(q)) continue;
      out.push({ ...m, clip: c.id, track: c.track, label: c.label || c.text || '', t: c.start + m.at });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Find a clip by id, in the take or inside its compositions. */
export function findClip(take, id) {
  const walk = clips => { for (const c of clips || []) { if (c.id === id) return c; if (c.comp) { const k = walk(c.comp.clips); if (k) return k; } } return null; };
  return walk(take?.clips);
}

/** The notes as plain text, one line each (for an agent or a model): “0:12.5 [instruction] on Audio: make the drums louder”. */
export function marksText(take, opts) {
  const f = t => { const s = Math.max(0, t) / 1000, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
  return marksOf(take, opts).map(m => `${f(m.t)} [${m.kind}]${m.label ? ` on ${m.label}` : ''}: ${m.text}`).join('\n');
}

export { clipId };
