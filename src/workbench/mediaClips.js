/**
 * Media clips: moments of a video or stream, as clips of a take (the `media` track) or as assets of their own.
 *
 * A media clip is a reference, not a copy: { track: 'media', start, dur (ms), url, asset?, in, out (s of the
 * source), speed, fit, opacity, label, credit }. `url` is the file to stream (for a copy kept in Assets it is
 * left out and the player reads the asset's blob). The take stays small and carries its credit with it.
 */
import { clipId } from '../process/take.js';
import { resolveMediaUrl } from './mediaUrl.js';

/** The media clip for an asset (a stream or a video kept in Assets), over [in, out] seconds of it (default: its range, else all). */
export async function mediaClipFromAsset(app, a, { start = 0, in: t0 = null, out: t1 = null } = {}) {
  const s = a.meta?.stream, mt = a.meta?.mediatheque;
  let url = null, duration = a.meta?.duration || null;
  if (s) { const m = await resolveMediaUrl(s.page, { quality: s.quality || '480' }); url = m.url; duration = m.duration || duration; t0 ??= s.start ?? null; t1 ??= s.end ?? null; }
  else if (a.blob) duration = duration || await probeDuration(a.blob);
  else throw new Error('This asset has no video');
  t0 = Math.max(0, t0 ?? 0);
  t1 = t1 ?? duration ?? t0 + 5;
  if (!(t1 > t0)) t1 = t0 + 5;
  return {
    id: clipId(), track: 'media', start, dur: Math.round((t1 - t0) * 1000), url, asset: a.id, in: t0, out: t1, speed: 1, fit: 'contain', opacity: 1,
    label: a.title, credit: mt?.credit || [a.meta?.artist, a.meta?.license].filter(Boolean).join(', ') || null, fx: {}
  };
}

const probeDuration = blob => new Promise(res => {
  const v = document.createElement('video'), u = URL.createObjectURL(blob);
  v.preload = 'metadata'; v.onloadedmetadata = () => { res(v.duration || null); URL.revokeObjectURL(u); }; v.onerror = () => res(null); v.src = u;
});

/**
 * What a board's source shows now: { asset, def, name, in, out (seconds), duration } or null when the board has no
 * clip. `in` and `out` are the source's range (the player's in and out points).
 */
export function boardClip(app, board) {
  const name = app.playableSource?.(board);
  if (!name) return null;
  const def = app.sources.def(name), live = app.sources.entries.get(name)?.live, pos = live?.position?.();
  const duration = pos?.duration || def?.meta?.duration || live?.video?.duration || null;
  if (!duration) return null;
  return { name, def, asset: def?.meta?.assetId || null, in: (def.in ?? 0) * duration, out: (def.out ?? 1) * duration, duration, at: pos?.time ?? null };
}

/** Add a board's clip to the timeline at the playhead (on the media track), as a reference. */
export async function boardToTimeline(app, board) {
  const c = boardClip(app, board);
  if (!c) throw new Error('This board has no clip');
  const a = c.asset ? await app.assetStore.get(c.asset).catch(() => null) : null;
  const url = c.def.url;
  let clip;
  if (a) clip = await mediaClipFromAsset(app, a, { in: c.in, out: c.out });
  else if (url) clip = { id: clipId(), track: 'media', start: 0, dur: Math.round((c.out - c.in) * 1000), url, in: c.in, out: c.out, speed: 1, fit: 'contain', opacity: 1, label: board.title, credit: [c.def.meta?.artist, c.def.meta?.license].filter(Boolean).join(', ') || null, fx: {} };
  else throw new Error('Only a clip streamed or kept in Assets can go to the timeline');
  clip.url = clip.url || url || null;
  clip.speed = c.def.speed > 0 ? c.def.speed : 1;
  clip.dur = Math.round((c.out - c.in) / clip.speed * 1000);
  clip.label = board.title || clip.label;
  await app.addMediaClip(clip);
  return clip;
}

/**
 * Keep a board's range as a new stream asset (a reference with its own in and out, in the folder Clips). The credit
 * and rights come along from the parent asset, so a clip cut from the Mediathèque still says where it is from.
 */
export async function boardToAssets(app, board, title = null) {
  const c = boardClip(app, board);
  if (!c) throw new Error('This board has no clip');
  const parent = c.asset ? await app.assetStore.get(c.asset).catch(() => null) : null;
  const page = parent?.meta?.stream?.page || c.def.meta?.source || c.def.url;
  if (!page || !/^https?:/i.test(page)) throw new Error('Only a streamed clip can be kept as a clip (a file in Assets is already one: put it on the timeline)');
  const r = x => Math.round(x * 100) / 100, s = r(c.in), e = r(c.out);
  const ps = parent?.meta?.stream, whole = ps?.start != null ? Math.abs(s - ps.start) < 0.05 && Math.abs(e - ps.end) < 0.05 : s < 0.05 && e > c.duration - 0.05;
  if (whole && parent) { app.log(`“${parent.title}” is already this clip: move the in and out points first.`); return parent; }
  const id = `stream:${page}#${s}-${e}`;
  const have = await app.assetStore.get(id).catch(() => null);
  if (have) { app.log(`“${have.title}” is already in Assets.`); return have; }
  title = title || `${parent?.title || board.title || 'Clip'} · ${s.toFixed(1)}–${e.toFixed(1)} s`;
  const folder = parent?.folder?.startsWith('Mediatheque') ? 'Mediatheque/Clips' : 'Clips';
  const asset = await app.assetStore.addStream({ id, title, page, quality: parent?.meta?.stream?.quality || null, start: s, end: e, note: parent?.meta?.note || '', license: parent?.meta?.license, artist: parent?.meta?.artist, folder });
  const meta = parent?.meta?.mediatheque ? { ...asset.meta, mediatheque: { ...parent.meta.mediatheque, in: s, out: e, clipOf: parent.id } } : { ...asset.meta, clipOf: parent?.id || null };
  await app.assetStore.update(id, { tags: [...new Set([...(parent?.tags || []), 'clip'])], meta, thumb: parent?.thumb || asset.thumb });
  app.log(`Kept “${title}” in Assets (a reference: ${s.toFixed(1)}–${e.toFixed(1)} s).`);
  return asset;
}
