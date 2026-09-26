/**
 * Asset store: saved variations, live paintings and imported images, kept in
 * IndexedDB so images survive reloads.
 *
 * Asset: { id, title, tags: string[], rating 0-5, kind: 'variation' | 'painting' |
 *          'import' | 'klee', folder: 'a/b' ('' = top), blob, thumb (data URL),
 *          width, height, program?, meta?, created }
 * Folders are paths; empty folders are kept in a separate list.
 */

const DB = 'ams-assets';
const STORE = 'assets';
const FOLDERS_KEY = 'ams_asset_folders';
const THUMB = 320;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const out = fn(store);
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error);
  });
}

export async function blobToImage(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/** Kinds of file the asset browser keeps (besides images). */
export function fileKind(f) {
  const t = f.type || '', n = (f.name || '').toLowerCase();
  if (t.startsWith('image/') || n.endsWith('.svg')) return 'image';
  if (t.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/.test(n)) return 'audio';
  if (t === 'application/json' || n.endsWith('.json')) return 'json';
  if (t.startsWith('text/') || /\.(txt|md|markdown|csv|js|py)$/.test(n)) return 'text';
  return null;
}

/** A small card for things that are not pictures: a waveform for sound, the first lines for text. */
async function cardThumb(blob, kind) {
  const c = document.createElement('canvas'); c.width = 240; c.height = 150;
  const x = c.getContext('2d');
  x.fillStyle = '#f3efe6'; x.fillRect(0, 0, 240, 150);
  x.fillStyle = '#2b2620';
  if (kind === 'audio') {
    let peaks = null;
    try {
      const ac = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 44100, 44100);
      const buf = await ac.decodeAudioData(await blob.arrayBuffer());
      const d = buf.getChannelData(0), n = 120, step = Math.floor(d.length / n);
      peaks = Array.from({ length: n }, (_, i) => { let m = 0; for (let j = i * step; j < (i + 1) * step; j += 16) m = Math.max(m, Math.abs(d[j] || 0)); return m; });
      blob.durationMs = Math.round(buf.duration * 1000);
    } catch { /* not decodable here */ }
    x.globalAlpha = 0.8;
    (peaks || Array.from({ length: 120 }, (_, i) => 0.3 + 0.25 * Math.sin(i / 5))).forEach((p, i) => { const hgt = Math.max(1, p * 110); x.fillRect(i * 2, 75 - hgt / 2, 1.4, hgt); });
    blob.peaks = peaks;
  } else {
    const txt = (await blob.text()).slice(0, 600).split('\n').slice(0, 9);
    x.font = '11px ui-monospace, Menlo, monospace';
    txt.forEach((l, i) => x.fillText(l.slice(0, 38), 10, 18 + i * 15));
  }
  return { thumb: c.toDataURL('image/webp', 0.85), width: 0, height: 0 };
}

async function makeThumb(blob) {
  const kind = blob.kindHint;
  if (kind === 'audio' || kind === 'text' || kind === 'json') return cardThumb(blob, kind);
  // createImageBitmap works in background tabs too (img.decode() can wait until the tab is shown).
  const img = typeof createImageBitmap === 'function' ? await createImageBitmap(blob).catch(() => blobToImage(blob)) : await blobToImage(blob);
  if (img.naturalWidth === undefined) { img.naturalWidth = img.width; img.naturalHeight = img.height; }
  const k = Math.min(1, THUMB / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { thumb: c.toDataURL('image/webp', 0.85), width: img.naturalWidth, height: img.naturalHeight };
}

/** Where a folder's contents go when the folder is removed: one level up, subfolders kept. */
export function liftFolder(folder, removed) {
  const parent = removed.split('/').slice(0, -1).join('/');
  const rest = folder === removed ? '' : folder.slice(removed.length + 1);
  return [parent, rest].filter(Boolean).join('/');
}

export function normFolder(path) {
  return String(path || '').split('/').map(s => s.trim()).filter(Boolean).join('/');
}

/** Does `asset` match every word of `query` (title, tags, kind, folder, artist)? */
export function matches(asset, query) {
  const words = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [asset.title, asset.kind, asset.folder, ...(asset.tags || []), asset.meta?.artist, asset.meta?.year]
    .filter(Boolean).join(' ').toLowerCase();
  return words.every(w => (w.startsWith('#') ? (asset.tags || []).some(t => t.toLowerCase() === w.slice(1)) : hay.includes(w)));
}

export class AssetStore {
  constructor() {
    this.db = null;
    this.listeners = new Set();
  }

  async ready() {
    this.db ||= await open();
    return this;
  }

  onChange(fn) { this.listeners.add(fn); }
  emit() { for (const fn of this.listeners) fn(); }

  async all() {
    await this.ready();
    const list = await tx(this.db, 'readonly', s => s.getAll());
    return list.sort((a, b) => b.created - a.created);
  }

  async get(id) {
    await this.ready();
    return tx(this.db, 'readonly', s => s.get(id));
  }

  /** Add an image blob with metadata; returns the stored asset. */
  async add(blob, fields = {}) {
    await this.ready();
    const { thumb, width, height } = await makeThumb(blob);
    if (blob.peaks || blob.durationMs) fields = { ...fields, meta: { ...(fields.meta || {}), peaks: blob.peaks, duration: blob.durationMs } };
    const asset = {
      id: fields.id || (crypto.randomUUID?.() || String(Date.now() + Math.random())),
      title: fields.title || 'Untitled',
      tags: fields.tags || [],
      rating: fields.rating || 0,
      kind: fields.kind || 'import',
      folder: normFolder(fields.folder),
      program: fields.program || null,
      meta: fields.meta || null,
      created: fields.created || Date.now(),
      blob, thumb, width, height
    };
    await tx(this.db, 'readwrite', s => s.put(asset));
    this.emit();
    return asset;
  }

  async update(id, patch) {
    const a = await this.get(id);
    if (!a) return null;
    if ('folder' in patch) patch.folder = normFolder(patch.folder);
    Object.assign(a, patch);
    await tx(this.db, 'readwrite', s => s.put(a));
    this.emit();
    return a;
  }

  async remove(id) {
    await this.ready();
    await tx(this.db, 'readwrite', s => s.delete(id));
    this.emit();
  }

  /** Folder paths: those holding assets plus empty ones the user made. */
  async folders() {
    const set = new Set(this.savedFolders());
    for (const a of await this.all()) {
      const parts = (a.folder || '').split('/').filter(Boolean);
      for (let i = 1; i <= parts.length; i++) set.add(parts.slice(0, i).join('/'));
    }
    return [...set].sort();
  }

  savedFolders() {
    try { return JSON.parse(localStorage.getItem(FOLDERS_KEY) || '[]'); } catch { return []; }
  }

  /**
   * Remove a folder (and its subfolders). Its assets move up to the parent folder, or with
   * deleteAssets are deleted. Returns how many assets were moved or deleted.
   */
  async removeFolder(path, { deleteAssets = false } = {}) {
    const p = normFolder(path);
    if (!p) return 0;
    const parent = p.split('/').slice(0, -1).join('/');
    const inside = a => a.folder === p || a.folder.startsWith(p + '/');
    const hit = (await this.all()).filter(inside);
    for (const a of hit) {
      if (deleteAssets) await this.remove(a.id);
      else await this.update(a.id, { folder: liftFolder(a.folder, p) });
    }
    const keep = this.savedFolders().filter(f => !(f === p || f.startsWith(p + '/')));
    try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(keep)); } catch { /* storage unavailable */ }
    this.emit();
    return hit.length;
  }

  addFolder(path) {
    const p = normFolder(path);
    if (!p) return;
    const list = new Set(this.savedFolders());
    list.add(p);
    try { localStorage.setItem(FOLDERS_KEY, JSON.stringify([...list])); } catch { /* storage unavailable */ }
    this.emit();
  }

  /** Rename a folder (and everything under it). */
  async renameFolder(from, to) {
    from = normFolder(from); to = normFolder(to);
    if (!from || !to || from === to) return;
    const under = p => p === from || p.startsWith(from + '/');
    const move = p => to + p.slice(from.length);
    for (const a of await this.all()) {
      if (under(a.folder || '')) { a.folder = move(a.folder); await tx(this.db, 'readwrite', s => s.put(a)); }
    }
    const saved = this.savedFolders().map(p => (under(p) ? move(p) : p));
    try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(saved)); } catch { /* storage unavailable */ }
    this.emit();
  }

  /** Seed the bundled Klee references once. */
  async seed(refs) {
    const key = 'ams_assets_seeded_v1';
    try { if (localStorage.getItem(key)) return; } catch { /* storage unavailable */ }
    for (const r of refs) {
      try {
        const blob = await (await fetch(r.url)).blob();
        await this.add(blob, {
          id: 'klee:' + r.id, title: r.title, kind: 'klee', folder: 'Klee',
          tags: ['klee', String(r.year || '')].filter(Boolean),
          meta: { artist: r.artist, year: r.year, source: r.source?.commonsPage, rights: r.rights?.commonsLicense }
        });
      } catch (err) { console.warn('Could not seed', r.id, err); }
    }
    try { localStorage.setItem(key, '1'); } catch { /* storage unavailable */ }
  }

  /**
   * Import files picked from a folder (webkitdirectory) or a plain multi-select.
   * Subfolders are kept under `into`; a sources.json manifest supplies titles.
   */
  /** A process document or take from JSON, as an asset of its kind (thumbnail drawn when shown). */
  async importStudioJSON(j, name, into = '') {
    const blob = new Blob([JSON.stringify(j)], { type: 'application/json' });
    blob.kindHint = 'json';
    const kind = j.type === 'ams-take' ? 'take' : 'process';
    return this.add(blob, { title: j.title || name.replace(/\.[a-z.]+$/i, ''), kind, folder: into, program: j, tags: [kind, 'imported'], meta: kind === 'take' ? { clips: j.clips?.length, duration: j.duration } : { elements: j.elements?.length } });
  }

  async importFiles(files, into = '') {
    files = [...files];
    const manifests = {};
    for (const f of files.filter(f => f.name === 'sources.json')) {
      try {
        const m = JSON.parse(await f.text());
        const dir = (f.relPath || f.webkitRelativePath || '').split('/').slice(0, -1).join('/');
        for (const r of m.references || []) manifests[dir + '/' + r.file] = r;
      } catch { /* not a manifest */ }
    }
    let n = 0;
    for (const f of files) {
      const kind = fileKind(f);
      if (!kind || f.name === 'sources.json') continue;
      const rel = f.relPath || f.webkitRelativePath || f.name;
      const dir = rel.split('/').slice(0, -1).join('/');
      const folder = [into, dir].filter(Boolean).join('/');
      // Drawings and takes exported from the studio come back as themselves.
      if (kind === 'json') {
        try {
          const j = JSON.parse(await f.text());
          if (j?.type === 'ams-process' || j?.type === 'ams-take') { await this.importStudioJSON(j, f.name, folder); n++; continue; }
        } catch { /* plain JSON: kept as text */ }
      }
      if (kind !== 'image') {
        f.kindHint = kind;
        await this.add(f, { title: f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '), kind: kind === 'audio' ? 'audio' : 'text', folder, tags: [kind], meta: { file: f.name, type: f.type } });
        n++;
        continue;
      }
      const r = manifests[dir + '/' + f.name];
      await this.add(f, {
        title: r?.title || f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '),
        kind: 'import',
        folder,
        tags: r ? [String(r.year || ''), ...(r.artist ? [r.artist.split(' (')[0].split(' ').pop().toLowerCase()] : [])].filter(Boolean) : [],
        meta: r ? { artist: r.artist, year: r.year, source: r.source?.commonsPage } : null,
        created: Date.now() - n
      });
      n++;
    }
    return n;
  }
}
