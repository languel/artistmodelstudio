/**
 * Scenes: a project holds several drawings (like Blender's scenes, or tldraw's pages). Each scene
 * is a whole process document with its boards, its own undo and History, and its own Timeline (the
 * take it had open). Assets, brushes, sculpt tools and settings are shared by all.
 *
 * The open scene is the workbench's document (saved as before); the others wait in IndexedDB.
 * The list (ids, titles, which is open) is small and lives in localStorage.
 */
import { normalizeDocument, createDocument } from '../process/document.js';

const LIST_KEY = 'ams_scenes_v1';
const DB = 'ams-scenes', STORE = 'scenes';

function db() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const t = d.transaction(STORE, mode), s = t.objectStore(STORE);
    const req = fn(s);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
  });
}
const put = (id, v) => tx('readwrite', s => s.put(v, id));
const get = id => tx('readonly', s => s.get(id));
const del = id => tx('readwrite', s => s.delete(id));

const newSceneId = () => `scene_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export class Scenes {
  constructor(app) {
    this.app = app;
    let list = null;
    try { list = JSON.parse(localStorage.getItem(LIST_KEY) || 'null'); } catch { /* ignore */ }
    if (!list?.scenes?.length) list = { active: 'scene_1', scenes: [{ id: 'scene_1', title: app.store.doc.title || 'Untitled' }] };
    this.list = list;
    this.listeners = new Set();
    this.busy = false;
    this.memory = new Map();   // per scene, while the app is open: its undo and its History
    // The open scene's title follows the drawing's title.
    app.store.subscribe(() => {
      const cur = this.current;
      if (cur && cur.title !== app.store.doc.title) { cur.title = app.store.doc.title; this.saveList(); this.emit(); }
    });
  }

  get current() { return this.list.scenes.find(s => s.id === this.list.active); }
  get all() { return this.list.scenes; }
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const f of this.listeners) { try { f(this); } catch (err) { console.error(err); } } }
  saveList() { try { localStorage.setItem(LIST_KEY, JSON.stringify(this.list)); } catch { /* ignore */ } }

  /** What a scene keeps besides its document: the view, the active board, the open take. */
  snapshot() {
    const app = this.app;
    return { doc: structuredClone(app.store.doc), cam: { ...app.canvas.cam }, activeBoard: app.activeBoard || 'main', takeId: app.player?.take?.assetId || null, saved: Date.now() };
  }

  async saveCurrent() {
    const app = this.app, h = app.history;
    this.memory.set(this.list.active, {
      past: [...app.store.past], future: [...app.store.future],
      history: h ? { entries: [...h.entries], baseline: h.baseline, seq: h.seq } : null
    });
    await put(this.list.active, this.snapshot());
  }

  /** Open another scene (the current one is kept as it is). */
  async switchTo(id) {
    if (this.busy || id === this.list.active || !this.list.scenes.some(s => s.id === id)) return;
    this.busy = true;
    try {
      await this.saveCurrent();
      const rec = await get(id);
      this.list.active = id;
      this.saveList();
      this.open(rec?.doc || createDocument({ title: this.current.title }), rec);
    } finally { this.busy = false; }
  }

  /** Put a document on the workbench as the open scene: fresh undo, History and Timeline. */
  open(doc, rec = null) {
    const app = this.app;
    app.player?.close?.();
    app.store.replace(normalizeDocument(doc), 'scene');
    app.history?.clear();
    // Back to a scene seen in this session: its undo and History come back too.
    const mem = this.memory.get(this.list.active);
    app.store.past = [...(mem?.past || [])]; app.store.future = [...(mem?.future || [])];
    if (mem?.history && app.history) { Object.assign(app.history, mem.history); app.history._states = null; app.history.last = structuredClone(app.store.doc); app.history.emit(); }
    app.canvas.select([]);
    app.canvas.selectBoard(null);
    app.activeBoard = rec?.activeBoard || 'main';
    app.setUpTo(Infinity);
    app.setActiveStage(app.store.doc.stages[app.store.doc.stages.length - 1]?.id);
    if (rec?.cam) { app.canvas.cam = rec.cam; app.canvas.saveCam(); app.canvas.invalidate(); } else app.canvas.fit(60, 'main');
    if (rec?.takeId) app.openTake?.(rec.takeId).catch?.(() => {});
    app.emit('board');
    app.emit('scene');
    app.renderChrome();
    this.emit();
  }

  /** A new scene: empty, a copy of a document (an opened asset, a file), and open it. */
  async create({ doc = null, title = null } = {}) {
    if (this.busy) return null;
    this.busy = true;
    try {
      await this.saveCurrent();
      const d = normalizeDocument(doc || createDocument({ title: title || `Scene ${this.list.scenes.length + 1}` }));
      if (title) d.title = title;
      const id = newSceneId();
      this.list.scenes.splice(this.list.scenes.findIndex(s => s.id === this.list.active) + 1, 0, { id, title: d.title });
      this.list.active = id;
      this.saveList();
      await put(id, { doc: d, saved: Date.now() });
      this.open(d);
      return id;
    } finally { this.busy = false; }
  }

  async duplicate() {
    const d = structuredClone(this.app.store.doc);
    d.title = `${d.title || 'Untitled'} copy`;
    return this.create({ doc: d });
  }

  /** Remove a scene (not the last). Its drawing is gone: save it to Assets first to keep it. */
  async remove(id = this.list.active) {
    if (this.list.scenes.length < 2) return false;
    const i = this.list.scenes.findIndex(s => s.id === id);
    if (i < 0) return false;
    if (id === this.list.active) {
      const next = this.list.scenes[i + 1] || this.list.scenes[i - 1];
      await this.switchTo(next.id);
    }
    this.list.scenes = this.list.scenes.filter(s => s.id !== id);
    this.memory.delete(id);
    this.saveList();
    await del(id);
    this.emit();
    return true;
  }

  move(id, delta) {
    const i = this.list.scenes.findIndex(s => s.id === id), j = i + delta;
    if (i < 0 || j < 0 || j >= this.list.scenes.length) return;
    const [s] = this.list.scenes.splice(i, 1); this.list.scenes.splice(j, 0, s);
    this.saveList();
    this.emit();
  }

  step(delta) {
    const i = this.list.scenes.findIndex(s => s.id === this.list.active);
    const next = this.list.scenes[(i + delta + this.list.scenes.length) % this.list.scenes.length];
    return this.switchTo(next.id);
  }

  /** Another scene's document (for exporting a project, or an agent reading it). */
  async docOf(id) {
    if (id === this.list.active) return this.app.store.doc;
    return (await get(id))?.doc || null;
  }
}
