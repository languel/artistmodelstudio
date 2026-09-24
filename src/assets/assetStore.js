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

async function makeThumb(blob) {
  const img = await blobToImage(blob);
  const k = Math.min(1, THUMB / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.naturalWidth * k));
  c.height = Math.max(1, Math.round(img.naturalHeight * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return { thumb: c.toDataURL('image/webp', 0.85), width: img.naturalWidth, height: img.naturalHeight };
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
  async importFiles(files, into = '') {
    files = [...files];
    const manifests = {};
    for (const f of files.filter(f => f.name === 'sources.json')) {
      try {
        const m = JSON.parse(await f.text());
        const dir = (f.webkitRelativePath || '').split('/').slice(0, -1).join('/');
        for (const r of m.references || []) manifests[dir + '/' + r.file] = r;
      } catch { /* not a manifest */ }
    }
    let n = 0;
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const rel = f.webkitRelativePath || f.name;
      const dir = rel.split('/').slice(0, -1).join('/');
      const r = manifests[dir + '/' + f.name];
      await this.add(f, {
        title: r?.title || f.name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' '),
        kind: 'import',
        folder: [into, dir].filter(Boolean).join('/'),
        tags: r ? [String(r.year || ''), ...(r.artist ? [r.artist.split(' (')[0].split(' ').pop().toLowerCase()] : [])].filter(Boolean) : [],
        meta: r ? { artist: r.artist, year: r.year, source: r.source?.commonsPage } : null,
        created: Date.now() - n
      });
      n++;
    }
    return n;
  }
}
