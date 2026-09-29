/**
 * Playlists: what plays on a playlist board (its code: see process/playlist.js), and where it goes.
 * Media items are routed to the target board (the source under it, with its controls); a board that
 * is a source (Use as a source) can then be read by other boards, so a sequence of clips feeds drawings.
 * A board item runs that board alone and takes the view there.
 */
import { readPlaylist, writePlaylist } from '../process/playlist.js';
import { boardsOf, findBoard } from '../process/boards.js';

const slug = t => String(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'clip';

export class Playlists {
  constructor(app) {
    this.app = app;
    this.state = new Map();     // playlist board id → { index, playing, since, source, forMs, error }
    this.titles = new Map();    // a stream / asset id → its title (looked up once)
    this.listeners = new Set();
    this.parsed = new Map();    // board id → { code, pl, error }
    app.sources.onEnded = name => this.ended(name);
    this.timer = setInterval(() => this.tick(), 250);
  }

  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { for (const f of this.listeners) { try { f(); } catch (err) { console.error(err); } } }
  st(id) { if (!this.state.has(id)) this.state.set(id, { index: -1, playing: false, since: 0, source: null }); return this.state.get(id); }

  /** { pl, error } for a playlist board (read again when its code changes). */
  spec(b) {
    const cached = this.parsed.get(b.id);
    if (cached && cached.code === (b.code || '')) return cached;
    let pl = null, error = null;
    try { pl = readPlaylist(b.code || ''); } catch (err) { error = err.message; }
    const out = { code: b.code || '', pl, error };
    this.parsed.set(b.id, out);
    if (pl) this.lookupTitles(pl);
    return out;
  }

  async lookupTitles(pl) {
    let changed = false;
    for (const it of pl.items) {
      if ((it.kind !== 'stream' && it.kind !== 'asset') || this.titles.has(it.ref)) continue;
      const a = await this.app.assetStore.get(it.ref).catch(() => null);
      this.titles.set(it.ref, a?.title || '');
      changed = true;
    }
    if (changed) this.emit();
  }

  titleOf(it) { return it.title || this.titles.get(it.ref) || (it.kind === 'url' ? it.ref.split('/').pop().replace(/\.[a-z0-9]+$/i, '') : it.ref); }

  /** Edit the list from the board's own controls: the playlist is rewritten as code. */
  edit(id, fn) {
    const b = boardsOf(this.app.store.doc).find(x => x.id === id);
    if (!b) return;
    const { pl } = this.spec(b);
    const next = structuredClone(pl || { target: '', loop: true, items: [] });
    fn(next);
    this.app.store.updateBoard(id, { code: writePlaylist(next) });
    this.emit();
  }

  addItem(id, item) { this.edit(id, pl => { pl.items.push(item); }); }

  /** The item the playlist as a whole should show after a code edit that removed the current one. */
  clamp(id, pl) { const s = this.st(id); if (s.index >= pl.items.length) s.index = pl.items.length - 1; }

  // ---- playing -------------------------------------------------------------------------------

  /** A source for a media item (made when there is none, a stream lazily). */
  async sourceFor(it) {
    const app = this.app, S = app.sources;
    if (it.kind === 'source') { if (!S.def(it.ref)) throw new Error(`No source “${it.ref}”`); return it.ref; }
    if (it.kind === 'stream') {
      const a = await app.assetStore.get(it.ref);
      if (!a?.meta?.stream) throw new Error(`No stream asset “${it.ref}”`);
      const s = a.meta.stream;
      let d = S.list.find(x => x.meta?.assetId === a.id);
      if (!d) {
        const name = await app.addSourceUrl(s.page, { quality: it.quality || s.quality || '480', start: it.start ?? s.start, end: it.end ?? s.end, title: s.note, lazy: true, place: false, asset: false, assetId: a.id });
        app.applyAssetDefaults(name, null, a);
        d = S.def(name);
      } else if (it.start != null || it.end != null) this.setRange(d, it.start ?? s.start, it.end ?? s.end);
      return d.name;
    }
    if (it.kind === 'asset') {
      const a = await app.assetStore.get(it.ref);
      if (!a) throw new Error(`No asset “${it.ref}”`);
      if (a.kind === 'stream') return this.sourceFor({ ...it, kind: 'stream' });
      let d = S.list.find(x => x.kind === 'asset' && x.assetId === a.id);
      if (!d) { const name = await S.add({ kind: 'asset', assetId: a.id }); d = S.def(name); }
      return d.name;
    }
    if (it.kind === 'url') {
      let d = S.list.find(x => x.kind === 'url' && (x.meta?.source === it.ref || x.url === it.ref));
      if (!d) { const name = await app.addSourceUrl(it.ref, { quality: it.quality || '480', start: it.start, end: it.end, lazy: true, place: false, asset: false }); d = S.def(name); }
      else if (it.start != null || it.end != null) this.setRange(d, it.start, it.end);
      return d.name;
    }
    throw new Error(`Cannot play a ${it.kind}`);
  }

  setRange(d, start, end) {
    const dur = this.app.sources.entries.get(d.name)?.live?.video?.duration || d.meta?.duration;
    if (dur) this.app.sources.update(d.name, { in: Math.max(0, (start ?? 0) / dur), out: Math.min(1, (end ?? dur) / dur) });
  }

  async play(id, index = 0) {
    const app = this.app, b = boardsOf(app.store.doc).find(x => x.id === id);
    if (!b) return;
    const s = this.st(id), { pl, error } = this.spec(b);
    s.error = error || null;
    if (!pl || !pl.items.length) { s.playing = false; this.emit(); return; }
    index = ((index % pl.items.length) + pl.items.length) % pl.items.length;
    const it = pl.items[index];
    try {
      if (it.kind === 'board') {
        const target = findBoard(app.store.doc, it.ref);
        if (!target) throw new Error(`No board “${it.ref}”`);
        app.soloOnly(target.id);
        if (!it.stay) app.goToBoard(target.id, { animate: true });
        Object.assign(s, { index, playing: true, since: performance.now(), source: null, forMs: (it.for ?? 8) * 1000, error: null });
      } else {
        const target = findBoard(app.store.doc, pl.target);
        if (!target || target.kind === 'playlist') throw new Error(pl.target ? `No board “${pl.target}” to show it on` : 'Set the target board (target: “Board title”)');
        const name = await this.sourceFor(it);
        if (target.source !== name) app.setBoardSource(target.id, name, target.source ? target.sourceOpacity : 1);
        if (app.playableSource(boardsOf(app.store.doc).find(x => x.id === target.id))) app.store.updateBoard(target.id, { controls: true });
        // Plays from its in point at its speed; stops at its end (or after `for` seconds), and the next begins.
        app.sources.update(name, { loop: it.loop === true, speed: it.speed ?? 1 });
        const live = app.sources.entries.get(name)?.live;
        live?.seek?.(app.sources.def(name)?.in ?? 0);
        const still = !live && app.sources.entries.get(name)?.still;
        Object.assign(s, { index, playing: true, since: performance.now(), source: name, forMs: it.for != null ? it.for * 1000 : still ? 6000 : 0, error: null });
      }
    } catch (err) {
      Object.assign(s, { index, playing: false, error: err.message });
      app.log(`Playlist: ${err.message}`, 'error');
    }
    this.emit();
  }

  next(id, by = 1) {
    const b = boardsOf(this.app.store.doc).find(x => x.id === id), s = this.st(id);
    const { pl } = b ? this.spec(b) : {};
    if (!pl?.items.length) return;
    const to = s.index + by;
    if (to >= pl.items.length && !pl.loop) { s.playing = false; this.emit(); return; }
    return this.play(id, to);
  }

  toggle(id) {
    const s = this.st(id);
    if (s.index < 0) return this.play(id, 0);
    s.playing = !s.playing;
    // The clip follows: playing when the playlist plays, paused when it does not.
    if (s.source) { const paused = (this.app.sources.def(s.source)?.speed ?? 1) === 0; if (s.playing === paused) this.app.mediaAct(s.source, 'play'); }
    s.since = performance.now();
    this.emit();
  }

  /** The clip a playlist item is on ended (a range's end, with loop off). */
  ended(name) {
    for (const [id, s] of this.state) if (s.playing && s.source === name) this.next(id);
  }

  /** Items with a time (`for`, a still, a board): when it is up, the next. */
  tick() {
    const now = performance.now();
    for (const [id, s] of this.state) if (s.playing && s.forMs && now - s.since >= s.forMs) { s.since = now; this.next(id); }
  }
}
