/**
 * Mediathèque: a public archive of teaching media (github.com/languel/mediatheque), read as a catalog.
 * It is independent of AMS and only available while reachable: nothing here is cached across sessions, and
 * an unreachable archive just hides its tab. Items and clips arrive in Assets as references (a stream asset
 * of about 100 bytes: the address, in and out, rights) or, on request, as copies (the file itself).
 *
 * The base address can be another server (a local checkout served with `python3 -m http.server`):
 *   localStorage.ams_mediatheque_base = 'http://localhost:8000/'
 * Catalog fields and URL patterns: <base>/llms.txt
 */
export const DEFAULT_BASE = 'https://languel.github.io/mediatheque/';
const KINDS_USED = new Set(['video', 'animation', 'image']);   // what AMS can show as a source (models, splats and SDFs are not yet)

export const mediathequeBase = () => {
  let b = null;
  try { b = localStorage.getItem('ams_mediatheque_base'); } catch { /* default */ }
  return (b || DEFAULT_BASE).replace(/\/?$/, '/');
};

let cache = null;          // { base, records, at }
let pending = null;
const listeners = new Set();
export const state = { status: 'unknown', error: null };   // 'unknown' | 'loading' | 'ok' | 'offline'
export const onMediathequeChange = fn => { listeners.add(fn); return () => listeners.delete(fn); };
const set = (status, error = null) => { state.status = status; state.error = error; for (const fn of listeners) fn(state); };

/** Fetch the catalog (once per session and base; `force` asks again). Resolves to the records, or [] if unreachable. */
export async function loadCatalog({ force = false, timeout = 8000 } = {}) {
  const base = mediathequeBase();
  if (!force && cache?.base === base) return cache.records;
  if (pending) return pending;
  set('loading');
  pending = (async () => {
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(`${base}catalog.json`, { signal: ctl.signal, cache: 'no-cache' });
      if (!r.ok) throw new Error(`The archive answered ${r.status}`);
      const all = await r.json();
      if (!Array.isArray(all)) throw new Error('Not a catalog');
      const records = all.filter(x => x.status !== 'draft' && KINDS_USED.has(x.kind)).map(x => ({ ...x, abs: resolve(base, x) }));
      cache = { base, records, at: Date.now() };
      set('ok');
      return records;
    } catch (err) {
      cache = null;
      set('offline', err.name === 'AbortError' ? 'The archive did not answer in time' : err.message);
      return [];
    } finally { clearTimeout(timer); pending = null; }
  })();
  return pending;
}

const abs = (base, p) => (p ? (/^https?:/.test(p) ? p : base + p) : null);
/** Absolute addresses of a record's files. */
function resolve(base, x) {
  // `url` is the stable primary (media.<ext>, original.gif or clips/<nn>.webm); a base override swaps its origin.
  // A GIF is also published as video (media.mp4): that plays on a timeline and knows its length.
  const rel = (x.kind === 'animation' && x.video_media) || x.media || '';
  return { url: abs(base, rel.split('#')[0]), thumb: abs(base, x.thumb), poster: abs(base, x.poster), proxy: abs(base, x.proxy), original: abs(base, x.original), page: `${base}site/index.html#/${x.id}` };
}

/** Distinct values of a facet, most common first: ['tags' | 'collections' | 'demos'] → [[value, count]]. */
export function facet(records, key, limit = 40) {
  const n = new Map();
  for (const r of records) for (const v of r[key] || []) n.set(v, (n.get(v) || 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}

const words = s => String(s || '').toLowerCase();
/**
 * Filter records. `query`: words match title, summary, keywords, creators, tags, collections and demos;
 * `#tag` matches a tag exactly. `filters`: { kind, clips: bool|null, pd: bool, tags: [], collection }.
 */
export function search(records, query = '', filters = {}) {
  const terms = words(query).split(/\s+/).filter(Boolean);
  return records.filter(r => {
    if (filters.kind && filters.kind !== 'all' && r.kind !== filters.kind) return false;
    if (filters.clips === true && r.type !== 'clip') return false;
    if (filters.clips === false && r.type === 'clip') return false;
    if (filters.pd && r.rights?.status !== 'public-domain') return false;
    if (filters.collection && !(r.collections || []).includes(filters.collection)) return false;
    if (filters.tags?.length && !filters.tags.every(t => (r.tags || []).includes(t))) return false;
    if (!terms.length) return true;
    const hay = words([r.title, r.parent_title, r.summary, r.date, ...(r.keywords || []), ...(r.creators || []), ...(r.tags || []), ...(r.collections || []), ...(r.demos || [])].join(' '));
    return terms.every(t => (t.startsWith('#') ? (r.tags || []).includes(t.slice(1)) : hay.includes(t)));
  });
}

/** The asset id a record has in Assets (the same record added twice is one asset). */
export const assetId = r => `mediatheque:${r.id}`;
export const isPublicDomain = r => r.rights?.status === 'public-domain';
/** "Title: credit" line for captions and exports. */
export const creditLine = r => r.credit || [r.creators?.join(', '), r.date, r.rights?.license].filter(Boolean).join(', ');

/**
 * Add a record to Assets. By default a reference (a stream asset: the address, rights and credit, no media);
 * `copy: true` fetches the file and keeps it (it then works offline and is yours to edit).
 * Returns the asset.
 */
export async function addToAssets(store, r, { copy = false } = {}) {
  const id = assetId(r), folder = `Mediatheque/${(r.collections && r.collections[0]) || r.kind}`;
  const meta = { mediatheque: { id: r.id, type: r.type, parent: r.parent || null, page: r.abs.page, credit: creditLine(r), rights: r.rights || null, source_url: r.source_url || null, in: r.in ?? null, out: r.out ?? null, copy }, note: r.summary, license: r.rights?.license, artist: (r.creators || []).join(', ') };
  const tags = [...new Set([...(r.tags || []), 'mediatheque', ...(isPublicDomain(r) ? ['public-domain'] : [])])];
  const had = await store.get(id).catch(() => null);
  let asset;
  if (copy) {
    const blob = await (await fetch(r.abs.url)).blob();
    if (had) await store.remove(id);
    asset = await store.add(blob, { id, title: r.title, kind: r.kind === 'image' ? 'import' : 'video', folder, tags, meta: { ...meta, file: r.abs.url.split('/').pop(), type: blob.type } });
  } else {
    if (had && !had.meta?.mediatheque?.copy && had.meta?.stream?.page === r.abs.url) return had;
    if (had) await store.remove(id);
    asset = await store.addStream({ id, title: r.title, page: r.abs.url, quality: null, start: null, end: null, note: r.summary || '', license: r.rights?.license, artist: (r.creators || []).join(', '), folder });
    await store.update(id, { tags, meta: { ...asset.meta, ...meta } });
  }
  // The archive's own thumbnail is a better card than a frame grabbed from the stream.
  try {
    const t = await (await fetch(r.abs.thumb)).blob();
    const url = await new Promise((ok, no) => { const fr = new FileReader(); fr.onload = () => ok(fr.result); fr.onerror = no; fr.readAsDataURL(t); });
    await store.update(id, { thumb: url });
  } catch { /* the card keeps the one it made */ }
  return store.get(id);
}
