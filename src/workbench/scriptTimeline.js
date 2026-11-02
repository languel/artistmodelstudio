// The timeline of a script: one segment per cue, a scrubber over them, and notes pinned to a cue and a moment. It is the review surface of a
// script, in the studio and in an exported page: step to the cue before or after, press a segment to play from it, add a note where
// something should change, and copy the notes out (as Markdown) to say what to change.
//
// This file imports nothing and every function in it stands alone: an exported page embeds it as text (with `export` taken off), so the
// bar there is this bar. The host (ScriptPlayer, or the page's player) does the playing; the bar shows where it is and asks.
//
//   estimateSpans(cues, durations)  → { spans: [{ start, dur }], total }   seconds, before the script has been played
//   timelineBar(host, { title, cues, spans, total, notes, onSeek(i), onToggle(), onStop(), onNotes(notes) }) → bar
//   bar.setPos(cue, seconds) · bar.setState('playing' | 'paused' | 'stopped') · bar.setNotes(notes) · bar.addNote() · bar.markdown()

/** m:ss */
export function fmtTime(sec) { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }

/**
 * About how long a cue lasts, in seconds. The narration starts with the cue and its actions run beside it, so a cue lasts as long as
 * the longer of the two (and its `hold`): the actions are guessed from their kind, the voice is known.
 */
export function cueSeconds(c, clipSeconds = 0) {
  let acts = 0;
  if (c.goto) acts += 1.6;
  if (c.restart) acts += 1.7;
  if (c.drag) acts += (c.drag.ms || 1600) / 1000 + 1.2;
  if (c.click) acts += 1.2;
  if (c.select) acts += c.select.pseudo ? 1.6 : 2.0;
  if (c.clear) acts += 0.1;
  if (c.draw) acts += ((c.draw.shapes || []).length * (c.draw.step ?? 500)) / 1000 + 0.7;
  if (c.formula) acts += 0.9;
  if (c.set) acts += 0.3;
  if (c.point) acts += (Array.isArray(c.point.at[0]) ? c.point.at.length : 1) * (1.0 + (c.point.dwell ?? 700) / 1000);
  if (c.key) acts += 0.5;
  if (c.wait) acts += c.wait / 1000;
  const voice = clipSeconds > 0 ? clipSeconds + 0.25 : c.say ? (700 + String(c.say).length * 45) / 1000 : 0;
  return Math.max(acts, voice, (c.hold || 0) / 1000, 0.4);
}

/** Where each cue starts and how long it lasts, from the narration lengths (seconds, or 0 for a cue without a voice). */
export function estimateSpans(cues, durations = []) {
  const spans = []; let at = 0;
  cues.forEach((c, i) => { const dur = cueSeconds(c, durations[i] || 0); spans.push({ start: at, dur }); at += dur; });
  return { spans, total: at };
}

export const TIMELINE_CSS = `
.tl [hidden]{display:none!important}
.tl{font:12px/1.2 system-ui,-apple-system,sans-serif;color:#e6e4de;position:relative}
.tl button{font:inherit;font-variant-emoji:text;color:#e6e4de;background:#262626;border:1px solid #444;border-radius:6px;min-width:28px;height:26px;padding:0 6px;cursor:pointer}
.tl button:hover{border-color:#999}.tl button.on{border-color:#e0a030;color:#e0a030}.tl button:disabled{opacity:.35;cursor:default}
.tl-row{display:flex;align-items:center;gap:5px;padding:6px 8px;background:rgba(18,18,18,.94);border:1px solid #3a3a3a;border-radius:10px}
.tl-time{flex:none;min-width:84px;text-align:center;color:#b9b6ae;font-variant-numeric:tabular-nums}
.tl-bar{position:relative;flex:1;min-width:120px;height:24px;display:flex;gap:2px;cursor:pointer;touch-action:none;user-select:none}
.tl-seg{position:relative;height:100%;background:#363636;border-radius:2px;overflow:visible}
.tl-seg.hover{background:#4d4d4d}.tl-seg.now{outline:1px solid #e0a030;outline-offset:1px}
.tl-fill{position:absolute;left:0;top:0;bottom:0;background:#e0a030;opacity:.85;border-radius:2px;pointer-events:none}
.tl-mark{position:absolute;bottom:-3px;width:9px;height:9px;margin-left:-4px;background:#7fd0ff;transform:rotate(45deg);border:1px solid #101010;pointer-events:none}
.tl-tip{position:absolute;bottom:34px;transform:translateX(-50%);max-width:340px;padding:6px 9px;border-radius:7px;background:#0d0d0d;border:1px solid #444;color:#e6e4de;pointer-events:none;white-space:normal;text-align:left;z-index:5}
.tl-tip b{color:#e0a030;font-weight:600;margin-right:6px}
.tl-panel{position:absolute;right:0;bottom:44px;width:min(420px,92vw);max-height:46vh;display:flex;flex-direction:column;gap:6px;padding:8px;background:rgba(18,18,18,.97);border:1px solid #3a3a3a;border-radius:10px;z-index:6}
.tl-list{overflow:auto;display:flex;flex-direction:column;gap:3px}
.tl-item{display:flex;align-items:flex-start;gap:6px;padding:3px 2px;border-bottom:1px solid #2a2a2a}
.tl-item .tl-go{flex:none;min-width:64px;height:22px;color:#7fd0ff}.tl-item .tl-text{flex:1;white-space:pre-wrap;word-break:break-word;padding-top:3px}.tl-item .tl-del{flex:none;height:22px;min-width:22px;padding:0}
.tl-empty{color:#8d8b85;padding:4px 2px}
.tl-add{display:flex;gap:5px}.tl-add input{flex:1;min-width:0;height:26px;background:#101010;color:#e6e4de;border:1px solid #444;border-radius:6px;padding:0 8px;font:inherit}
.tl-foot{display:flex;gap:5px;justify-content:flex-end}
`;

/** The bar. `host` is the element it goes in; the host plays, the bar shows and asks. */
export function timelineBar(host, o) {
  const cues = o.cues || [], spans = o.spans || [], total = o.total || 0;
  let notes = [...(o.notes || [])], cur = -1, curSec = 0, hover = -1;
  const el = (tag, cls, text, attrs) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; if (attrs) for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  const btn = (text, title, fn, cls = '') => { const b = el('button', cls, text, { title, type: 'button' }); b.addEventListener('click', e => { e.stopPropagation(); fn(e); }); return b; };
  const fmt = sec => { const s = Math.max(0, Math.round(sec)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const clamp = (i) => Math.max(0, Math.min(cues.length - 1, i));

  const root = el('div', 'tl'); root.dataset.state = 'stopped';
  const row = el('div', 'tl-row');
  const prev = btn('⏮', 'Previous cue (←)', () => o.onSeek && o.onSeek(clamp((cur < 0 ? 0 : cur) - 1)));
  const play = btn('▶', 'Play · pause (Space)', () => o.onToggle && o.onToggle());
  const next = btn('⏭', 'Next cue (→)', () => o.onSeek && o.onSeek(clamp(cur + 1)));
  const stop = btn('■', 'Stop (Esc)', () => o.onStop && o.onStop());
  const time = el('span', 'tl-time', `0:00 / ${fmt(total)}`);
  const bar = el('div', 'tl-bar', null, { role: 'slider', 'aria-label': 'Cues' });
  const segs = spans.map((s, i) => { const seg = el('div', 'tl-seg'); seg.style.flex = `${Math.max(s.dur, 0.4)} 1 0`; const fill = el('div', 'tl-fill'); fill.style.width = '0%'; seg.append(fill); seg._fill = fill; bar.append(seg); return seg; });
  const tip = el('div', 'tl-tip'); tip.hidden = true; bar.append(tip);
  const addBtn = btn('✎', 'Add a note here (N)', () => { openPanel(true); input.focus(); });
  const listBtn = btn('☰', 'Notes', () => openPanel(panel.hidden));
  row.append(prev, play, next, stop, time, bar, addBtn, listBtn);

  const panel = el('div', 'tl-panel'); panel.hidden = true;
  const list = el('div', 'tl-list');
  const add = el('div', 'tl-add'), input = el('input', '', null, { placeholder: 'A note at this moment…', type: 'text' });
  const ok = btn('✓', 'Add the note (Enter)', () => commit());
  add.append(input, ok);
  const foot = el('div', 'tl-foot');
  const flash = (b, t) => { const o0 = b.textContent; b.textContent = t; setTimeout(() => { b.textContent = o0; }, 900); };
  const copy = btn('⧉', 'Copy the notes as Markdown', async () => { try { await navigator.clipboard.writeText(markdown()); flash(copy, '✓'); } catch { save(); } });
  const save = () => { const a = el('a', '', null, { download: `${(o.title || 'script').replace(/[^\w-]+/g, '-').toLowerCase()}-notes.md`, href: URL.createObjectURL(new Blob([markdown()], { type: 'text/markdown' })) }); document.body.append(a); a.click(); a.remove(); };
  const dl = btn('⤓', 'Download the notes (.md)', save);
  foot.append(copy, dl);
  panel.append(list, add, foot);
  root.append(row, panel);
  host.append(root);
  input.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') commit(); else if (e.key === 'Escape') { input.blur(); openPanel(false); } });

  function openPanel(on) { panel.hidden = !on; listBtn.classList.toggle('on', on); if (on) renderNotes(); }
  function commit() {
    const text = input.value.trim(); if (!text) return;
    const at = Math.max(0, cur);
    notes.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), cue: at, t: Math.round(curSec * 10) / 10, text, at: new Date().toISOString() });
    input.value = ''; changed();
  }
  function changed() { renderNotes(); o.onNotes && o.onNotes(notes.map(n => ({ ...n }))); }

  function renderNotes() {
    for (const m of bar.querySelectorAll('.tl-mark')) m.remove();
    notes.forEach(n => {
      const seg = segs[n.cue]; if (!seg) return;
      const m = el('div', 'tl-mark'); m.style.left = `${Math.min(100, (n.t / Math.max(spans[n.cue].dur, 0.001)) * 100)}%`; seg.append(m);
    });
    listBtn.textContent = notes.length ? `☰ ${notes.length}` : '☰';
    if (panel.hidden) return;
    list.replaceChildren();
    const sorted = [...notes].sort((a, b) => a.cue - b.cue || a.t - b.t);
    if (!sorted.length) list.append(el('div', 'tl-empty', 'No notes yet.'));
    for (const n of sorted) {
      const item = el('div', 'tl-item');
      item.append(btn(`${fmt(spans[n.cue].start + n.t)} · ${n.cue + 1}`, 'Play from this cue', () => o.onSeek && o.onSeek(n.cue), 'tl-go'), el('span', 'tl-text', n.text),
        btn('✕', 'Delete the note', () => { notes = notes.filter(x => x.id !== n.id); changed(); }, 'tl-del'));
      list.append(item);
    }
  }

  function markdown() {
    const lines = [`# Notes: ${o.title || 'script'}`, ''];
    for (const n of [...notes].sort((a, b) => a.cue - b.cue || a.t - b.t)) {
      const c = cues[n.cue], say = c && c.say ? ` (“${c.say.length > 48 ? c.say.slice(0, 48) + '…' : c.say}”)` : '';
      lines.push(`- ${fmt(spans[n.cue].start + n.t)} · cue ${n.cue + 1}${say}: ${n.text}`);
    }
    return lines.join('\n') + '\n';
  }

  // hovering and pressing: the segment under the pointer, and a line saying what it is
  const segAt = x => { for (let i = 0; i < segs.length; i++) { const r = segs[i].getBoundingClientRect(); if (x >= r.left - 1 && x <= r.right + 1) return i; } return -1; };
  const show = (i, x) => {
    segs.forEach((s, k) => s.classList.toggle('hover', k === i));
    if (i < 0) { tip.hidden = true; return; }
    const c = cues[i], r = bar.getBoundingClientRect();
    tip.replaceChildren(el('b', '', `${i + 1} · ${fmt(spans[i].start)}`), document.createTextNode(c.say || c.goto || ''));
    tip.style.left = `${Math.max(60, Math.min(r.width - 60, x - r.left))}px`; tip.hidden = false;
  };
  let pressing = false;
  bar.addEventListener('pointermove', e => { hover = segAt(e.clientX); show(hover, e.clientX); });
  bar.addEventListener('pointerleave', () => { if (!pressing) { hover = -1; show(-1, 0); } });
  bar.addEventListener('pointerdown', e => { pressing = true; try { bar.setPointerCapture(e.pointerId); } catch { /* not capturable */ } hover = segAt(e.clientX); show(hover, e.clientX); });
  bar.addEventListener('pointerup', e => { pressing = false; const i = segAt(e.clientX); show(-1, 0); if (i >= 0 && o.onSeek) o.onSeek(i); });
  bar.addEventListener('pointercancel', () => { pressing = false; show(-1, 0); });

  const api = {
    el: root, markdown,
    setPos(i, sec = 0) {
      cur = i; curSec = sec;
      segs.forEach((s, k) => { s._fill.style.width = k < i ? '100%' : k === i ? `${Math.min(100, (sec / Math.max(spans[k].dur, 0.001)) * 100)}%` : '0%'; s.classList.toggle('now', k === i); });
      time.textContent = `${fmt(i < 0 ? 0 : i >= spans.length ? total : spans[i].start + Math.min(sec, spans[i].dur))} / ${fmt(total)}`;
    },
    setState(s) { root.dataset.state = s; play.textContent = s === 'playing' ? '❚❚' : '▶'; stop.disabled = s === 'stopped'; },
    setNotes(n) { notes = [...n]; renderNotes(); },
    /** Open the notes with the cursor in the box (the host's key for it). */
    addNote() { openPanel(true); input.focus(); },
    seekable(on) { for (const b of [prev, next]) b.disabled = !on; bar.style.pointerEvents = on ? '' : 'none'; },
    destroy() { root.remove(); }
  };
  api.setState('stopped'); api.setPos(-1, 0); renderNotes();
  return api;
}
