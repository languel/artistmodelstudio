/**
 * A take as text: each track's clips in time order, as Markdown (to read, or to hand to a person or an agent) or JSON (to process).
 * It is what a track says in words: titles and narration as written, drawing changes as what they added or changed, the agent's calls and your
 * interactions as their own lines, compositions (History is one) opened out under their clip.
 */
import { tracksOf, laneOf } from '../process/take.js';

const t2 = ms => { const s = Math.max(0, ms) / 1000, m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(1).padStart(4, '0')}`; };
const roles = (list = []) => { const m = {}; for (const e of list) m[e.role || 'mark'] = (m[e.role || 'mark'] || 0) + 1; return Object.entries(m).map(([r, n]) => `${n} ${r}${n > 1 ? 's' : ''}`).join(', '); };

/** What a drawing change did, in words. */
export function diffWords(d) {
  if (!d) return '';
  const parts = [];
  if (d.add?.length) parts.push(`added ${roles(d.add)}`);
  if (d.update?.length) parts.push(`changed ${roles(d.update)}`);
  if (d.remove?.length) parts.push(`removed ${d.remove.length}`);
  for (const k of ['stages', 'artboard', 'title', 'brushes', 'groups', 'boards']) if (k in (d || {})) parts.push(`${k} changed`);
  return parts.join('; ');
}

const clipText = c => {
  switch (c.track) {
    case 'title': return `Title “${c.text || ''}”${c.sub ? ` (${c.sub})` : ''}`;
    case 'say': return `Narration: ${c.text || ''}`;
    case 'draw': return `Draw: ${c.label || ''}${c.diff ? ` — ${diffWords(c.diff)}` : ''}${c.by === 'agent' ? ' (agent)' : ''}`;
    case 'action': return c.label || c.name || 'action';
    case 'camera': return `Camera${c.label ? `: ${c.label}` : ''}`;
    case 'audio': return `Audio: ${c.label || c.name || ''}`;
    case 'comp': return `Composition “${c.label || ''}” (${(c.comp?.clips || []).length} clips)`;
    default: return c.label || c.text || c.track;
  }
};

const rows = (clips, depth = 0) => [...clips].sort((a, b) => a.start - b.start).flatMap(c => [
  { depth, start: c.start, end: c.start + (c.dur || 0), kind: c.track, text: clipText(c), ...(c.ui?.changes?.length ? { changes: c.ui.changes } : {}) },
  ...(c.track === 'comp' && c.comp ? rows(c.comp.clips, depth + 1) : [])
]);

/** → { text, tracks } for the whole take, or one track (by id). format 'markdown' | 'json'. */
export function transcriptOf(take, { track = null, format = 'markdown' } = {}) {
  const tracks = tracksOf(take).filter(t => !track || t.id === track);
  const data = tracks.map(t => ({ id: t.id, name: t.name || t.id, kind: t.kind, muted: Boolean(t.muted), lines: rows((take.clips || []).filter(c => laneOf(c) === t.id)) }));
  if (format === 'json') return { text: JSON.stringify({ take: take.title, tracks: data.map(t => ({ ...t, lines: t.lines.map(({ depth, ...l }) => ({ ...l, depth })) })) }, null, 2), tracks: data };
  const md = [`# ${take.title || 'Take'}`, ''];
  for (const t of data) {
    md.push(`## ${t.name}${t.muted ? ' (muted)' : ''}`, '');
    if (!t.lines.length) md.push('_nothing_', '');
    else { for (const l of t.lines) md.push(`${'  '.repeat(l.depth)}- ${t2(l.start)}${l.end > l.start ? `–${t2(l.end)}` : ''} ${l.text}`); md.push(''); }
  }
  return { text: md.join('\n'), tracks: data };
}
