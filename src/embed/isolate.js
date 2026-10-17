/**
 * Keeps the embedded editor out of its host's storage. Imported first by embed/main.js (before any module reads
 * localStorage): every `localStorage` key and IndexedDB database is prefixed with the host's namespace (the `ns`
 * URL parameter), so two hosts, or two editors, on one origin never share settings, palettes or scenes.
 */
const params = new URLSearchParams(location.search);
export const NS = (params.get('ns') || 'ams-embed').replace(/[^a-zA-Z0-9_.-]/g, '');

const real = (() => { try { const s = window.localStorage; s.getItem('x'); return s; } catch { return null; } })();
const memory = new Map();
const key = k => `${NS}:${k}`;
const shim = {
  getItem: k => { try { return real ? real.getItem(key(k)) : (memory.get(key(k)) ?? null); } catch { return null; } },
  setItem: (k, v) => { try { if (real) real.setItem(key(k), String(v)); else memory.set(key(k), String(v)); } catch { /* quota: the editor copes */ } },
  removeItem: k => { try { if (real) real.removeItem(key(k)); else memory.delete(key(k)); } catch { /* ignore */ } },
  key: i => { const ks = names(); return ks[i] ?? null; },
  clear: () => { for (const k of names()) shim.removeItem(k); },
  get length() { return names().length; }
};
function names() {
  const all = real ? Array.from({ length: real.length }, (_, i) => real.key(i)) : [...memory.keys()];
  return all.filter(k => k?.startsWith(`${NS}:`)).map(k => k.slice(NS.length + 1));
}
Object.defineProperty(window, 'localStorage', { configurable: true, get: () => shim });

if (typeof IDBFactory !== 'undefined') {
  const open = IDBFactory.prototype.open, del = IDBFactory.prototype.deleteDatabase;
  IDBFactory.prototype.open = function (name, ...rest) { return open.call(this, `${NS}:${name}`, ...rest); };
  IDBFactory.prototype.deleteDatabase = function (name, ...rest) { return del.call(this, `${NS}:${name}`, ...rest); };
}
