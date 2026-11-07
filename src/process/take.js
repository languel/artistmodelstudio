/**
 * Takes: recordings of how a drawing was made, as clips on a timeline.
 *
 * A take has a baseline document and clips. Clips sit on tracks:
 *   draw     a change to the document (element-level diff), revealed over its duration
 *   say      narration (text), shown as a caption
 *   title    a title card over the picture
 *   action   a tool call (label only; the effect is in the draw clips)
 *   camera   a view keyframe: { cx, cy, z } (artboard center and zoom; z = 1 shows the artboard)
 *   shot     a camera pointed at a board or a region for a time (src/workbench/camera.js); the Program shows the shot that started last
 *   media    a moment of a video or stream, by reference: { url, asset?, in, out (s of the source), speed, fit, opacity, label, credit }
 *   audio    a sound (src), later
 *   comp     a composition (as in After Effects): clips grouped into one, with a timeline of their own
 *            { comp: { tracks, clips }, rate } — its clips' times are its own (from 0); `rate` plays it
 *            faster (2) or slower (0.5); it shows what of its clips falls in its length. Compositions nest.
 * Every clip: { id, track, start, dur (ms), fx: { speed, drawOn, fade } }.
 * Playing reads flatClips(take): the compositions opened out into clips at the take's own times.
 *
 * The same code gives the document at any time t, for the app, the standalone player and video.
 */

let seq = 0;
export const clipId = () => `clip-${Date.now().toString(36)}-${(seq++).toString(36)}`;

// ---- diffs ----------------------------------------------------------------------------------
const DOC_KEYS = ['title', 'artboard', 'stages', 'decisions', 'groups', 'brushes', 'lines', 'meta', 'boards', 'train'];

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
export const TRACKS = ['comp', 'title', 'say', 'draw', 'action', 'camera', 'shot', 'media', 'audio'];
export const TRACK_NAMES = { comp: 'Comps', title: 'Titles', say: 'Narration', draw: 'Drawing', action: 'Actions', camera: 'Camera', shot: 'Shots', media: 'Media', audio: 'Audio', auto: 'Automation' };
const OLD_TRACKS = ['title', 'say', 'draw', 'action', 'camera', 'audio'];   // (the six every take had before tracks started empty)

/**
 * Every clip at the take's own time: compositions opened out (recursively), each clip placed and
 * timed by the compositions around it, and `muted` when a track it is on (at any depth) is muted.
 * A composition shows only the clips that start within its length. Cached per revision.
 */
export function flatClips(take) {
  // (a track muted or unmuted changes it as much as an edit does)
  const key = `${take.rev || 0}|${(take.tracks || []).filter(t => t.muted).map(t => t.id).join(',')}`;
  if (take._flat && take._flat.key === key) return take._flat.clips;
  const out = [];
  const walk = (clips, tracks, offset, scale, muted, end, depth) => {
    const mutedLanes = new Set((tracks || []).filter(t => t.muted).map(t => t.id));
    for (const c of clips || []) {
      if (end != null && c.start >= end) continue;   // (past the composition's end)
      const m = muted || mutedLanes.has(laneOf(c));
      if (c.track === 'comp' && c.comp) {
        if (depth > 16) continue;
        const rate = c.rate > 0 ? c.rate : 1;
        walk(c.comp.clips, c.comp.tracks, offset + c.start * scale, scale / rate, m, (c.dur || 0) * rate, depth + 1);
        continue;
      }
      out.push({ ...c, start: offset + c.start * scale, dur: (c.dur || 0) * scale, muted: m });
    }
  };
  walk(take.clips, take.tracks, 0, 1, false, null, 0);
  Object.defineProperty(take, '_flat', { value: { key, clips: out }, enumerable: false, configurable: true, writable: true });
  return out;
}

/** The length of a composition's contents (ms, in its own time). */
export const compLength = comp => Math.max(0, ...(comp?.clips || []).map(c => c.start + (c.dur || 0)));

/**
 * Group clips into a composition: they leave the take's tracks (or a composition's) and go inside a
 * new composition clip that starts where the first did and lasts until the last ends. Their tracks go
 * with them (and stay outside too, if other clips are on them). Returns the composition clip.
 */
export function precompose(holder, ids, { title = 'Composition', id = clipId() } = {}) {
  const chosen = holder.clips.filter(c => ids.includes(c.id));
  if (!chosen.length) return null;
  const t0 = Math.min(...chosen.map(c => c.start)), t1 = Math.max(...chosen.map(c => c.start + (c.dur || 0)));
  const lanes = new Set(chosen.map(laneOf));
  const tracks = tracksOf(holder).filter(t => lanes.has(t.id)).map(t => ({ ...t }));
  const comp = { tracks, clips: chosen.map(c => ({ ...c, start: c.start - t0 })) };
  holder.clips = holder.clips.filter(c => !ids.includes(c.id));
  // Tracks left with nothing on them go (they moved inside).
  holder.tracks = tracksOf(holder).filter(t => !lanes.has(t.id) || holder.clips.some(c => laneOf(c) === t.id));
  const clip = { id, track: 'comp', start: t0, dur: Math.max(1, t1 - t0), rate: 1, comp, label: title, fx: {} };
  holder.clips.push(clip);
  return clip;
}

/** Open a composition back out: its clips go onto the holder's tracks at the holder's times (its rate applied). */
export function decompose(holder, compClip) {
  const c = compClip, rate = c.rate > 0 ? c.rate : 1, end = (c.dur || 0) * rate;
  const inner = (c.comp?.clips || []).filter(x => x.start < end);
  holder.clips = holder.clips.filter(x => x !== c);
  const have = new Set(tracksOf(holder).map(t => t.id));
  for (const t of c.comp?.tracks || []) if (!have.has(t.id)) { holder.tracks.push({ ...t }); have.add(t.id); }
  const out = inner.map(x => ({ ...x, start: c.start + x.start / rate, dur: (x.dur || 0) / rate }));
  holder.clips.push(...out);
  tracksOf(holder);   // (a kind with no track gets one)
  return out;
}

/**
 * Tracks (as in an editor): any number of each kind, in order, each with a name and mute.
 * A clip's kind is c.track; the track it sits on is c.lane (or, without one, the track whose id is
 * its kind, else the kind's first track). A take starts with no tracks: a track is made when you add
 * one, or when a clip of a kind with no track arrives (recorded, dropped, inserted).
 */
export function tracksOf(take) {
  if (!Array.isArray(take.tracks)) take.tracks = [];
  // Takes saved before tracks started empty have all six, untouched: keep only those with clips.
  if (take.tracks.length === OLD_TRACKS.length && take.tracks.every((t, i) => t.id === OLD_TRACKS[i] && t.kind === OLD_TRACKS[i] && t.name === TRACK_NAMES[t.kind] && !t.muted)) {
    take.tracks = take.tracks.filter(t => (take.clips || []).some(c => laneOf(c) === t.id));
  }
  const ids = new Set(take.tracks.map(t => t.id));
  for (const c of take.clips || []) {
    if (c.lane && !ids.has(c.lane)) delete c.lane;   // (its track was deleted: the kind's first track)
    if (ids.has(laneOf(c))) continue;
    const first = take.tracks.find(t => t.kind === c.track);
    const t = first || placeTrack(take.tracks, c.track);
    ids.add(t.id);
    if (t.id !== c.track) c.lane = t.id;
  }
  return take.tracks;
}
export const laneOf = c => c.lane || c.track;
/** A clip plays unless its track is muted. */
export function on(take, c) {
  const tr = (take.tracks || []).find(t => t.id === laneOf(c));
  return !tr?.muted;
}

/** A new track of a kind, after the others of its kind (the kinds in the order of TRACKS). */
function placeTrack(tracks, kind, name) {
  const n = tracks.filter(t => t.kind === kind).length + 1;
  // The first track of a kind has the kind as its id (so clips without a lane sit on it).
  let id = tracks.some(t => t.id === kind) ? `${kind}-${n}` : kind;
  for (let i = n; tracks.some(t => t.id === id); i++) id = `${kind}-${i + 1}`;
  const t = { id, kind, name: name || (n === 1 ? TRACK_NAMES[kind] || kind : `${TRACK_NAMES[kind] || kind} ${n}`) };
  const last = tracks.map(x => x.kind).lastIndexOf(kind);
  const order = k => { const i = TRACKS.indexOf(k); return i < 0 ? TRACKS.length : i; };
  const at = last >= 0 ? last + 1 : (i => (i < 0 ? tracks.length : i))(tracks.findIndex(x => order(x.kind) > order(kind)));
  tracks.splice(at, 0, t);
  return t;
}
export function addTrack(take, kind, name) { return placeTrack(tracksOf(take), kind, name); }

/** How long a line of narration needs to be read (ms). */
export const readingTime = text => Math.max(1600, String(text || '').split(/\s+/).length * 320);

/** Draw clips in time order, with the document before each (cached per take revision). */
function drawIndex(take) {
  const key = `${take.rev || 0}|${(take.tracks || []).filter(t => t.muted).map(t => t.id).join(',')}`;
  if (take._index && take._index.key === key) return take._index;
  const draws = flatClips(take).filter(c => c.track === 'draw' && c.diff && !c.muted).sort((a, b) => a.start - b.start || (a.seq ?? 0) - (b.seq ?? 0));
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
export const activeAt = (take, track, t) => flatClips(take).filter(c => c.track === track && !c.muted && t >= c.start && t < c.start + Math.max(c.dur, 1));

/** Camera at t: holds each keyframe, then eases to the next during that keyframe's dur (null without keyframes). */
export function cameraAt(take, t) {
  const keys = flatClips(take).filter(c => c.track === 'camera' && !c.muted).sort((a, b) => a.start - b.start);
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
  // (compositions opened out: a summary is one flat cut)
  const src = flatClips(take).filter(c => !c.muted && (keepActions || c.track !== 'action')).map(({ muted, ...c }) => c).sort((a, b) => a.start - b.start);
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
