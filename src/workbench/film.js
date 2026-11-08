/**
 * Films: a short film or an explainer, written as data and built into a take on the Timeline (cameras, shots, narration,
 * keyframes), then rendered frame by frame (render.js) to an MP4 and to a page that plays on its own.
 *
 * A film is { id, title, summary, camera: { w, h }, fps, voice, beats: [...] }. A beat is one thing on screen for a while:
 *   board      a board title (or id): the camera looks at it            rect  [x, y, w, h]: a region of the canvas instead
 *   pose       { z, dx, dy } the camera's pose (zoom; shifts as fractions of the board)    to  { z, dx, dy } it moves there
 *   say        narration: voiced (Kokoro) and shown as a caption, and it sets the beat's length (plus `hold` ms of silence after)
 *   caption    a caption with no voice          title / sub / titleDur   a title card over the picture (for titleDur ms)
 *   set        [{ board, name, from, to, at, over, ease }] a sketch control moved by keyframes: from → to, `at` ms into the beat,
 *              taking `over` ms (the rest of the beat by default)
 *   dur        a minimum length (ms)            overlap  ms this beat starts before the last one ends
 *   chapter    a name: it appears in the page's chapter buttons
 *   code       { board, from, to, before, after, side, note }  the board's code shown over the picture, the lines from the first that contains `from` to the first that contains `to` lit
 *   film.boards   boards the film brings of its own (a sketch written for it): [{ title, kind: 'p5' | 'three', code, width, height, ground }]
 * The film's own clock is the render's: a sketch starts when the render starts, so a film built on a time-driven sketch starts that
 * shot at 0 (see the moon film).
 */
import { boardsOf, boardById } from '../process/boards.js';
import { createTake, touch, clipId } from '../process/take.js';
import { setKey } from '../process/keyframes.js';
import { camerasOf, boardShot } from './camera.js';

const dataUrl = blob => new Promise(ok => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.readAsDataURL(blob); });
const norm = s => String(s || '').trim().toLowerCase();

/** The board a beat names: by id, or by title (a sketch or picture board before a frame or notes of the same title). */
export function findBoard(doc, ref) {
  if (!ref) return null;
  const byId = boardById(doc, ref); if (byId && byId.id === ref) return byId;
  const all = boardsOf(doc).filter(b => norm(b.title) === norm(ref));
  const rank = b => (['frame', 'markdown', 'code'].includes(b.kind) ? 1 : 0);
  return all.sort((a, b) => rank(a) - rank(b))[0] || null;
}

/** Narration for each beat: { ms, src } from the voice, or null (no voice: reading time). */
async function voiceBeats(app, film, onStatus) {
  const N = app.narrator, out = [];
  for (let i = 0; i < film.beats.length; i++) {
    const text = (film.beats[i].speak ?? film.beats[i].say ?? '').trim();
    if (!text || film.voice === false || !N) { out.push(null); continue; }
    onStatus?.(`Voicing ${i + 1} of ${film.beats.length}: ${text.slice(0, 48)}${text.length > 48 ? '…' : ''}`);
    try {
      const clip = await N.clip(text, film.voiceName ? { voice: film.voiceName } : {});
      const known = await N.known();
      out.push({ ms: Math.round(clip.duration * 1000), src: await dataUrl(clip.blob), asset: known.get(clip.hash) });
    } catch (err) { onStatus?.(`No voice for beat ${i + 1}: ${err.message}`); out.push(null); }
  }
  return out;
}

const readingMs = t => Math.max(1800, Math.round(String(t).split(/\s+/).length * 330));

/** Lay the film out on a take (replacing what the Timeline holds). Returns { take, beats: [{ start, dur }], total }. */
export async function buildFilm(app, film, { onStatus = null } = {}) {
  const doc = app.store.doc;
  const voices = await voiceBeats(app, film, onStatus);
  const take = app._tlEnsureTake();
  take.clips = []; delete take.tracks; delete take.cameras; take.title = film.title;
  const cam = camerasOf(take)[0]; cam.w = film.camera?.w || 1280; cam.h = film.camera?.h || 720; cam.fps = film.fps || 25;
  const lead = film.lead ?? 250, laid = [], chapters = [];
  let cursor = 0;
  film.beats.forEach((b, i) => {
    const v = voices[i], say = b.say ? (v ? v.ms : readingMs(b.say)) : 0;
    const dur = Math.max(b.dur || 0, b.say ? lead + say + (b.hold ?? 700) : 0, 600);
    const start = Math.max(0, cursor - (b.overlap || 0));
    laid.push({ start, dur }); cursor = start + dur;
    if (b.chapter) chapters.push({ t: start, title: b.chapter });
    const clips = take.clips;
    // the picture
    if (b.board || b.rect) {
      const board = b.board ? findBoard(doc, b.board) : null;
      if (b.board && !board) throw new Error(`Beat ${i + 1}: there is no board “${b.board}”`);
      const shot = board ? boardShot(board, cam, { start, dur }) : { track: 'shot', camera: cam.id, start, dur, target: { rect: b.rect }, dx: 0, dy: 0, z: 1, label: 'View', fx: {} };
      Object.assign(shot, { id: clipId(), ...(b.pose || {}), ...(b.to ? { to: { ...b.to } } : {}), ...(b.focus != null ? { focus: b.focus } : {}), ...(b.blur != null ? { blur: b.blur } : {}), label: b.label || shot.label });
      clips.push(shot);
    }
    // the words
    if (b.say || b.caption) {
      const text = b.say || b.caption, id = clipId();
      clips.push({ id, track: 'say', start: start + (b.say ? lead : 0), dur: b.say ? say : Math.max(1200, dur - 200), text, fx: {} });
      if (v) clips.push({ id: clipId(), track: 'audio', start: start + lead, dur: v.ms, src: v.src, label: text.slice(0, 40), ...(v.asset ? { asset: v.asset } : {}), fx: {}, narrates: id });
    }
    if (b.code) {
      const cb = findBoard(doc, b.code.board || b.board), src = String(cb?.code || '').split('\n');
      if (!cb) throw new Error(`Beat ${i + 1}: there is no board “${b.code.board || b.board}” to show code from`);
      const at = (text, from = 0) => { if (text == null) return -1; const i = src.slice(from).findIndex(l => l.includes(text)); return i < 0 ? -1 : i + from; }, a = Math.max(0, at(b.code.from)), z = b.code.to == null ? a : Math.max(a, at(b.code.to, a));
      if (at(b.code.from) < 0) throw new Error(`Beat ${i + 1}: “${b.code.from}” is not in the code of “${cb.title}”`);
      const lo = Math.max(0, a - (b.code.before ?? 3)), hi = Math.min(src.length, z + (b.code.after ?? 6) + 1);
      clips.push({ id: clipId(), track: 'title', start: start + 150, dur: Math.max(600, dur - 300), text: '', code: { lines: src.slice(lo, hi), mark: [a - lo, z - lo], side: b.code.side || 'left', ...(b.code.note ? { note: b.code.note } : {}) }, fx: { fade: 300 } });
    }
    if (b.title) clips.push({ id: clipId(), track: 'title', start, dur: Math.min(dur, b.titleDur || dur), text: b.title, sub: b.sub || '', fx: { fade: 500 } });
  });
  take._filmBeats = film.beats;
  // keyframes for the controls the beats move
  film.beats.forEach((b, i) => {
    for (const s of b.set || []) {
      const board = findBoard(doc, s.board); if (!board) throw new Error(`Beat ${i + 1}: there is no board “${s.board}” to set ${s.name} on`);
      const t0 = laid[i].start + (s.at || 0), t1 = s.over != null ? t0 + s.over : laid[i].start + laid[i].dur;
      const address = `ctl:${board.id}.${s.name}`;
      if (s.from !== undefined) setKey(take, address, t0, s.from, s.ease || 'ease', `${board.title} · ${s.name}`);
      setKey(take, address, t1, s.to, s.ease || 'ease', `${board.title} · ${s.name}`);
    }
  });
  touch(take); app._tlKeysEdited?.(); app.player.seek?.(0);
  return { take, beats: laid, total: cursor, chapters };
}

/** Every problem with a film that can be found without rendering it: boards and code anchors that are not there. → [string] */
export function checkFilm(app, film) {
  const doc = app.store.doc, errs = [];
  film.beats.forEach((b, i) => {
    const at = `beat ${i + 1}${b.say ? ` (“${b.say.slice(0, 30)}…”)` : ''}`;
    if (b.board && !findBoard(doc, b.board)) errs.push(`${at}: no board “${b.board}”`);
    for (const s of b.set || []) if (!findBoard(doc, s.board)) errs.push(`${at}: no board “${s.board}” to set ${s.name} on`);
    if (b.code) {
      const cb = findBoard(doc, b.code.board || b.board);
      if (!cb) errs.push(`${at}: no board “${b.code.board || b.board}” for the code`);
      else { const src = String(cb.code || ''); const lines = src.split('\n'), first = lines.findIndex(l => b.code.from && l.includes(b.code.from)); for (const k of ['from', 'to']) if (b.code[k] && lines.slice(k === 'to' ? Math.max(0, first) : 0).findIndex(l => l.includes(b.code[k])) < 0) errs.push(`${at}: “${b.code[k]}” is not in the code of “${cb.title}”`); }
    }
  });
  return errs;
}

/** WebVTT for the say clips of a take. */
export function vttOf(take) {
  const ts = ms => { const s = ms / 1000, h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${(s % 60).toFixed(3).padStart(6, '0')}`; };
  const says = take.clips.filter(c => c.track === 'say').sort((a, b) => a.start - b.start);
  return `WEBVTT\n\n${says.map((c, i) => `${i + 1}\n${ts(c.start)} --> ${ts(c.start + c.dur)}\n${c.text}\n`).join('\n')}`;
}

/**
 * Build, render and package a film: MP4 (exports/film/<id>.mp4), captions (.vtt) and a page that plays on its own (<id>.html).
 * opts: { width, height, fps, crf, onStatus, onProgress, signal, page: true }.
 */
/** Boards the film brings of its own (film.boards: [{ title, kind, code, width, height, ground }]), added beside the scene when they are not there yet. */
export async function ensureBoards(app, film) {
  const st = app.store; let added = false;
  for (const spec of film.boards || []) {
    if (findBoard(st.doc, spec.title)?.kind === spec.kind) { st.updateBoard(findBoard(st.doc, spec.title).id, { code: spec.code }); continue; }
    const all = boardsOf(st.doc), x = Math.max(...all.map(b => b.x + b.width)) + 240, y = Math.min(...all.map(b => b.y));
    const b = st.addBoard({ title: spec.title, x, y, width: spec.width || 800, height: spec.height || 600, ground: spec.ground || '#f3efe6', adopt: false });
    st.updateBoard(b.id, { kind: spec.kind, code: spec.code, hideLabel: true }); added = true;
  }
  if (added) await new Promise(r => setTimeout(r, 1500));
}

/** Build the film's lesson as a scene unless its first board is already there (film.lesson: 'reiniger' | 'threejs' | 'sampling'; film.language: 'p5' for the sampling lesson's p5.js sketches). */
export async function ensureLesson(app, film, onStatus = null) {
  if (!film.lesson) return;
  const first = film.beats.map(b => b.board).find(Boolean);
  if (first && findBoard(app.store.doc, first)?.kind !== undefined && findBoard(app.store.doc, first)?.kind !== 'frame') { const b = findBoard(app.store.doc, first); if (!film.language || b.kind === film.language) return; }
  onStatus?.(`Building the ${film.lesson} lesson…`);
  const { buildLesson } = await import('./lessons.js');
  await buildLesson(app, film.lesson, film.language ? { language: film.language } : {});
  await new Promise(r => setTimeout(r, 3500));
}

export async function makeFilm(app, film, { width = 1920, height = 1080, crf = 20, page = true, onStatus = null, onProgress = null, signal = null } = {}) {
  await ensureLesson(app, film, onStatus);
  await ensureBoards(app, film);
  const built = await buildFilm(app, film, { onStatus });
  const { renderTake } = await import('./render.js');
  const out = await renderTake(app, { range: [0, built.total], fps: film.fps || 25, width, height, format: 'mp4', sound: true, name: film.id, server: true, crf, onStatus, onProgress, signal });
  const vtt = vttOf(built.take);
  await fetch(`/__film/save?file=${film.id}.vtt`, { method: 'POST', body: vtt });
  let pageInfo = null;
  if (page) {
    onStatus?.('Making the page…');
    const r = await fetch(`/__film/page?name=${film.id}`, { method: 'POST', body: JSON.stringify({ title: film.title, summary: film.summary, credit: film.credit || '', vtt, chapters: built.chapters }) });
    pageInfo = await r.json();
    if (!r.ok) throw new Error(pageInfo.error || 'The page could not be made');
  }
  return { mp4: out.url, size: out.size, vtt: `/exports/film/${film.id}.vtt`, page: pageInfo?.url, pageSize: pageInfo?.size, seconds: built.total / 1000, chapters: built.chapters };
}
