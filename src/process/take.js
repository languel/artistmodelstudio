/**
 * Takes: recordings of how a drawing was made, as clips on a timeline.
 *
 * A take has a baseline document and clips. Clips sit on tracks:
 *   draw     a change to the document (element-level diff), revealed over its duration
 *   say      narration (text), shown as a caption
 *   title    a title card over the picture
 *   action   a tool call (label only; the effect is in the draw clips)
 *   camera   a view keyframe: { cx, cy, z } (artboard center and zoom; z = 1 shows the artboard)
 *   audio    a sound (src), later
 * Every clip: { id, track, start, dur (ms), fx: { speed, drawOn, fade } }.
 *
 * The same code gives the document at any time t, for the app, the standalone player and video.
 */

let seq = 0;
export const clipId = () => `clip-${Date.now().toString(36)}-${(seq++).toString(36)}`;

// ---- diffs ----------------------------------------------------------------------------------
const DOC_KEYS = ['title', 'artboard', 'stages', 'decisions', 'groups', 'brushes', 'lines', 'meta'];

/** What changed between two documents, element by element (unchanged parts are not repeated). */
export function diffDocs(prev, next) {
  const d = {};
  const before = new Map(prev.elements.map(e => [e.id, e]));
  const after = new Map(next.elements.map(e => [e.id, e]));
  const add = [], update = [], remove = [];
  for (const e of next.elements) {
    const p = before.get(e.id);
    if (!p) add.push(e);
    else if (p !== e && JSON.stringify(p) !== JSON.stringify(e)) update.push(e);
  }
  for (const e of prev.elements) if (!after.has(e.id)) remove.push(e.id);
  if (add.length) d.add = add;
  if (update.length) d.update = update;
  if (remove.length) d.remove = remove;
  const order = next.elements.map(e => e.id);
  const kept = prev.elements.map(e => e.id).filter(id => after.has(id));
  if (kept.join() !== order.filter(id => before.has(id)).join()) d.order = order;
  for (const k of DOC_KEYS) if (JSON.stringify(prev[k] ?? null) !== JSON.stringify(next[k] ?? null)) d[k] = next[k];
  return Object.keys(d).length ? structuredCloneSafe(d) : null;
}

const structuredCloneSafe = v => (typeof structuredClone === 'function' ? structuredClone(v) : JSON.parse(JSON.stringify(v)));

/** Apply a diff (new objects for what changed, the rest shared). */
export function applyDiff(doc, d, { reveal = 1 } = {}) {
  if (!d) return doc;
  const out = { ...doc };
  for (const k of DOC_KEYS) if (k in d) out[k] = d[k];
  let els = doc.elements;
  if (d.remove || d.update) {
    const rm = new Set(d.remove || []), up = new Map((d.update || []).map(e => [e.id, e]));
    els = els.filter(e => !rm.has(e.id)).map(e => up.get(e.id) || e);
  }
  if (d.add) {
    const n = d.add.length;
    if (reveal >= 1) els = [...els, ...d.add];
    else {
      // Reveal the added elements in order, each drawn along its own points.
      const x = reveal * n, shown = [];
      for (let i = 0; i < n && i < x; i++) shown.push(partial(d.add[i], Math.min(1, x - i)));
      els = [...els, ...shown];
    }
  }
  if (d.order) { const byId = new Map(els.map(e => [e.id, e])); els = [...d.order.map(id => byId.get(id)).filter(Boolean), ...els.filter(e => !d.order.includes(e.id))]; }
  out.elements = els;
  return out;
}

/** An element partly drawn: its points up to fraction f of its drawing time (or count). */
export function partial(e, f) {
  if (f >= 1) return e;
  if (['point', 'note', 'image'].includes(e.role) || e.points.length < 2) return { ...e, opacity: (e.opacity ?? 1) * Math.max(0.05, f) };
  if (e.role === 'plane') return { ...e, opacity: (e.opacity ?? 1) * Math.max(0.05, f) };
  const t0 = e.points[0][2] ?? 0, t1 = e.points[e.points.length - 1][2] ?? 0;
  const byTime = t1 > t0;
  const cut = byTime ? t0 + (t1 - t0) * f : f * (e.points.length - 1);
  const pts = byTime ? e.points.filter(p => p[2] <= cut) : e.points.slice(0, Math.max(2, Math.ceil(cut) + 1));
  return { ...e, points: pts.length > 1 ? pts : e.points.slice(0, 2), partial: f };
}

// ---- takes ----------------------------------------------------------------------------------
export function createTake({ title = 'Take', baseline, clips = [] } = {}) {
  return { type: 'ams-take', version: 1, title, created: new Date().toISOString(), baseline, clips };
}

export const duration = take => Math.max(0, ...take.clips.map(c => c.start + c.dur));
export const TRACKS = ['title', 'say', 'draw', 'action', 'camera', 'audio'];
export const TRACK_NAMES = { title: 'Titles', say: 'Narration', draw: 'Drawing', action: 'Actions', camera: 'Camera', audio: 'Audio' };

/**
 * Tracks (as in an editor): any number of each kind, in order, each with a name and mute.
 * A clip's kind is c.track; the track it sits on is c.lane (older takes: the kind's first track).
 */
export function tracksOf(take) {
  if (!Array.isArray(take.tracks) || !take.tracks.length) {
    take.tracks = TRACKS.map(k => ({ id: k, kind: k, name: TRACK_NAMES[k] }));
    Object.defineProperty(take, '_derived', { value: true, enumerable: false, configurable: true, writable: true });
  }
  // Clips on tracks that no longer exist fall back to the first track of their kind.
  const ids = new Set(take.tracks.map(t => t.id));
  for (const c of take.clips) if (c.lane && !ids.has(c.lane)) delete c.lane;
  return take.tracks;
}
export const laneOf = c => c.lane || c.track;
/** A clip plays unless its track is muted. */
export function on(take, c) {
  const tr = (take.tracks || []).find(t => t.id === laneOf(c));
  return !tr?.muted;
}

/** Add a track of a kind (after the last track of that kind); returns it. */
export function addTrack(take, kind, name) {
  const tracks = tracksOf(take);
  const n = tracks.filter(t => t.kind === kind).length + 1;
  let id = `${kind}-${n}`; for (let i = n; tracks.some(t => t.id === id); i++) id = `${kind}-${i + 1}`;
  const t = { id, kind, name: name || `${TRACK_NAMES[kind] || kind} ${n}` };
  const last = tracks.map(x => x.kind).lastIndexOf(kind);
  tracks.splice(last < 0 ? tracks.length : last + 1, 0, t);
  return t;
}

/** How long a line of narration needs to be read (ms). */
export const readingTime = text => Math.max(1600, String(text || '').split(/\s+/).length * 320);

/** Draw clips in time order, with the document before each (cached per take revision). */
function drawIndex(take) {
  const key = take.rev || 0;
  if (take._index && take._index.key === key) return take._index;
  const draws = take.clips.filter(c => c.track === 'draw' && c.diff && on(take, c)).sort((a, b) => a.start - b.start || (a.seq ?? 0) - (b.seq ?? 0));
  const before = [];
  let doc = take.baseline;
  for (const c of draws) { before.push(doc); doc = applyDiff(doc, c.diff); }
  const idx = { key, draws, before, final: doc };
  Object.defineProperty(take, '_index', { value: idx, enumerable: false, configurable: true, writable: true });
  return idx;
}

/** Mark a take as edited (so cached states are rebuilt). */
export function touch(take) { take.rev = (take.rev || 0) + 1; return take; }

/** The document at time t (ms): finished changes applied, changes in progress revealed. */
export function docAt(take, t) {
  const { draws, before, final } = drawIndex(take);
  if (!draws.length) return take.baseline;
  let i = draws.findIndex(c => c.start > t);
  if (i < 0) i = draws.length;
  // Everything that started before t: the last one may still be revealing; earlier ones in progress too.
  let doc = i === draws.length ? final : before[i];
  const live = [];
  for (let j = 0; j < i; j++) {
    const c = draws[j], end = c.start + c.dur;
    if (t < end && c.fx?.drawOn !== false && c.dur > 0) live.push(c);
  }
  if (!live.length) return doc;
  // Rebuild from the first live clip: completed ones in full, live ones partially.
  const first = draws.indexOf(live[0]);
  doc = before[first];
  for (let j = first; j < i; j++) {
    const c = draws[j];
    const f = live.includes(c) ? Math.min(1, Math.max(0, (t - c.start) / c.dur)) : 1;
    doc = applyDiff(doc, c.diff, { reveal: f });
  }
  return doc;
}

/** Clips on a track that are showing at time t. */
export const activeAt = (take, track, t) => take.clips.filter(c => c.track === track && on(take, c) && t >= c.start && t < c.start + Math.max(c.dur, 1));

/** Camera at t: holds each keyframe, then eases to the next during that keyframe's dur (null without keyframes). */
export function cameraAt(take, t) {
  const keys = take.clips.filter(c => c.track === 'camera' && on(take, c)).sort((a, b) => a.start - b.start);
  if (!keys.length) return null;
  let cur = { cx: keys[0].cx, cy: keys[0].cy, z: keys[0].z };
  for (const k of keys) {
    const trans = Math.max(1, k.dur || 800), s0 = k.start - trans;
    if (t < s0) break;
    const u = Math.min(1, (t - s0) / trans), e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
    cur = { cx: cur.cx + (k.cx - cur.cx) * e, cy: cur.cy + (k.cy - cur.cy) * e, z: cur.z + (k.z - cur.z) * e };
    if (u < 1) break;
  }
  return cur;
}

/**
 * A short-form summary of a take: narration kept at reading pace, the drawing appearing briskly,
 * analysis and waiting sped through, tool chatter dropped, and a hold on the result at the end.
 */
export function summarize(take, { maxGap = 350, drawMax = 2200, analysisSpeed = 4, hold = 2500, keepActions = false } = {}) {
  const analysisStages = new Set((take.baseline.stages || []).filter(s => ['analysis', 'construction'].includes(s.kind)).map(s => s.id));
  const isAnalysis = c => c.track === 'draw' && (c.diff?.add || []).length > 0 && c.diff.add.every(e => ['guide', 'gesture'].includes(e.role) || analysisStages.has(e.stage));
  const src = take.clips.filter(c => keepActions || c.track !== 'action').slice().sort((a, b) => a.start - b.start);
  const out = [];
  let t = 0, prevStart = null, prevEnd = 0;
  for (const c of src) {
    if (prevStart !== null) {
      const gap = Math.max(0, c.start - prevStart);
      // Clips that happened together stay together; waiting is capped.
      t += gap < 40 ? 0 : Math.min(gap, maxGap);
      t = Math.max(t, c.track === 'say' ? prevEnd - 200 : t);
    }
    let dur = c.dur;
    if (c.track === 'say') dur = Math.min(c.dur, readingTime(c.text));
    if (c.track === 'draw') dur = isAnalysis(c) ? Math.min(c.dur / analysisSpeed, 600) : Math.min(c.dur, drawMax);
    if (c.track === 'action') dur = Math.min(c.dur, 400);
    const n = { ...c, id: clipId(), start: Math.round(t), dur: Math.round(dur) };
    out.push(n);
    prevStart = c.start;
    prevEnd = Math.max(prevEnd, n.start + (c.track === 'say' ? n.dur : Math.min(n.dur, 600)));
    if (c.track === 'draw' || c.track === 'say') t = Math.max(t, n.start + Math.min(n.dur, c.track === 'say' ? n.dur * 0.7 : n.dur));
  }
  // A summary is never longer than half its source (at least 10 s): compress evenly if needed.
  const srcEnd = Math.max(0, ...take.clips.map(c => c.start + c.dur));
  let end = Math.max(0, ...out.map(c => c.start + c.dur));
  const target = Math.max(10000, srcEnd * 0.5);
  if (end > target) { const k = target / end; for (const c of out) { c.start = Math.round(c.start * k); c.dur = Math.max(200, Math.round(c.dur * k)); } end = target; }
  out.push({ id: clipId(), track: 'title', start: end + 200, dur: hold, text: take.title, sub: 'Summary', fx: { fade: 400 } });
  const base = String(take.title).replace(/(\s*\(summary\))+$/, '');
  return { ...createTake({ title: `${base} (summary)`, baseline: take.baseline, clips: out }), tracks: take.tracks ? JSON.parse(JSON.stringify(take.tracks)) : undefined, source: take.title, summaryOf: take.assetId || take.summaryOf || null };
}

/** Clips for a take made from live steps: a helper for recorders (time-ordered, ids assigned). */
export function addClip(take, clip) { const c = { id: clipId(), fx: {}, ...clip }; take.clips.push(c); touch(take); return c; }
