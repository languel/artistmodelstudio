/** A clip, and what a drawing change did, in a line of words (for the transcript, the Code panel's clip header, and the Timeline's tips). */
const roles = (list = []) => { const m = {}; for (const e of list) m[e.role || 'mark'] = (m[e.role || 'mark'] || 0) + 1; return Object.entries(m).map(([r, n]) => `${n} ${r}${n > 1 ? 's' : ''}`).join(', '); };

export function diffWords(d) {
  if (!d) return '';
  const parts = [];
  if (d.add?.length) parts.push(`added ${roles(d.add)}`);
  if (d.update?.length) parts.push(`changed ${roles(d.update)}`);
  if (d.remove?.length) parts.push(`removed ${d.remove.length}`);
  for (const k of ['stages', 'artboard', 'title', 'brushes', 'groups', 'boards']) if (k in (d || {})) parts.push(`${k} changed`);
  return parts.join('; ');
}

export function clipWords(c) {
  switch (c.track) {
    case 'title': return `Title “${c.text || ''}”${c.sub ? ` (${c.sub})` : ''}`;
    case 'say': return `Narration: ${c.text || ''}`;
    case 'draw': return `Draw: ${c.label || ''}${c.diff ? ` — ${diffWords(c.diff)}` : ''}${c.by === 'agent' ? ' (agent)' : ''}`;
    case 'action': return c.label || c.name || 'action';
    case 'camera': return `Camera${c.label ? `: ${c.label}` : ''}`;
    case 'media': if (c.board) return `Board “${c.label || ''}” (${((c.dur || 0) / 1000).toFixed(1)} s)`; return `Media: ${c.label || ''} (${(+c.in || 0).toFixed(1)}–${(+c.out || 0).toFixed(1)} s)`;
    case 'audio': return `Audio: ${c.label || c.name || ''}`;
    case 'comp': return `Composition “${c.label || ''}” (${(c.comp?.clips || []).length} clips)`;
    default: return c.label || c.text || c.track;
  }
}
