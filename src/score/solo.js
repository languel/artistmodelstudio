/**
 * Solo: only some marks sound. The marks asked for, and what they need to make sense: a traveler's path,
 * the travelers on a selected path, what a trigger sends to and what it starts, and what starts a traveler.
 */
export function soloDoc(doc, ids) {
  const want = new Set(ids);
  const els = doc.elements;
  const byRef = new Map();
  for (const e of els) { byRef.set(e.id, e); if (e.label && !byRef.has(e.label)) byRef.set(e.label, e); }
  const add = e => { if (e && !want.has(e.id)) { want.add(e.id); return true; } return false; };
  for (let pass = 0; pass < 6; pass++) {
    let grew = false;
    for (const e of els) {
      const keep = want.has(e.id);
      const tr = e.play?.travel, tg = e.play?.trigger;
      if (keep && tr) { grew = add(byRef.get(tr.on)) || grew; if (tr.cue) grew = add(byRef.get(tr.cue)) || grew; }
      if (keep && tg) for (const r of [].concat(tg.to || [])) grew = add(byRef.get(typeof r === 'string' ? r : r.to)) || grew;
      // A path asked for brings its travelers; a trigger asked for brings the travelers it starts.
      if (!keep && tr && (want.has(byRef.get(tr.on)?.id) || (tr.cue && want.has(byRef.get(tr.cue)?.id)))) grew = add(e) || grew;
    }
    if (!grew) break;
  }
  return { ...doc, elements: els.filter(e => !e.play || want.has(e.id)) };
}
