/**
 * Playing with a module's face on the canvas: double-click a sequencer's cell to turn it on or off (a Grid's, a
 * Drums row's, a Bits grid's), a Euclid's ring to add a hit (Shift: take one away; Alt: turn it a step). One undo step.
 */
import { settingsOf, parseGrid, gridText, parseDrumRows, parseBits, parseRings } from '../audio/modular/patch.js';
import { isModule, inBox } from './model.js';
import { seqLayout } from './face.js';
import { setModSettings } from './properties.js';

/** What a double-click at x, y does to a module, as new settings, or null (nothing there). Pure. */
export function faceEdit(e, x, y, { shift = false, alt = false } = {}) {
  const kind = e.play.mod.kind, s = settingsOf(e.play.mod), L = seqLayout(e);
  if (!L) return null;
  if (L.kind === 'rings') {
    const d = Math.hypot(x - L.cx, y - L.cy);
    let best = null;
    for (const [i, r] of L.rings.entries()) if (!best || Math.abs(r.r - d) < Math.abs(best.r - d)) best = { ...r, i };
    if (!best || Math.abs(best.r - d) > 10) return null;
    const rings = parseRings(s.rings);
    const r = rings[best.i];
    if (alt) r.rotation = (r.rotation + 1) % r.steps;
    else r.hits = shift ? Math.max(0, r.hits - 1) : r.hits >= r.steps ? 0 : r.hits + 1;
    return { rings: rings.map(q => `${q.steps} ${q.hits} ${q.rotation} ${q.note}`).join('\n') };
  }
  const c = Math.floor((x - L.x0) / L.cw), r = Math.floor((y - L.y0) / L.ch);
  if (L.kind === 'steps' || c < 0 || r < 0 || r >= L.rows.length || c >= L.cols) return null;
  if (kind === 'Grid') { const g = parseGrid(s.cells).map(q => { while (q.length < L.cols) q.push(0); return q; }); g[r][c] = g[r][c] ? 0 : 1; return { cells: gridText(g) }; }
  if (kind === 'Drums') {
    const rows = parseDrumRows(s.rows);
    const st = rows[r].steps; while (st.length < L.cols) st.push(0);
    st[c] = st[c] ? 0 : shift ? 1.4 : 1;
    return { rows: rows.map(q => `${q.name} ${q.note} ${q.steps.map(v => (v > 1 ? 'X' : v ? 'x' : '.')).join('')}`).join('\n') };
  }
  if (kind === 'Bits') { const g = parseBits(s.bits); if (!g[r] || c >= g[r].length) return null; g[r][c] = g[r][c] ? 0 : 1; return { bits: g.map(q => q.join('')).join('\n') }; }
  return null;
}

/** The canvas's double-click: true when a module's face took it. */
export function onDoubleClick(app, x, y, ev) {
  const els = app.store.doc.elements;
  for (let i = els.length - 1; i >= 0; i--) {
    const e = els[i];
    if (!isModule(e) || e.hidden || e.locked || !inBox(e, x, y, 0)) continue;
    const next = faceEdit(e, x, y, { shift: ev?.shiftKey, alt: ev?.altKey });
    if (!next) return false;
    setModSettings(app, e.id, next, `${e.play.mod.kind} cells`);
    return true;
  }
  return false;
}
