/**
 * The Mediathèque view of Assets: browse the public archive (search, kind, clips, public domain, tags),
 * then add what you want to Assets as a reference, or as a copy. Shown only while the archive is reachable.
 * Cards drag like asset cards: the record is added as a reference when the drag starts.
 */
import { icon } from './icons.js';
import { loadCatalog, search, facet, addToAssets, assetId, isPublicDomain, creditLine, mediathequeBase } from '../assets/mediatheque.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const fmt = s => (s == null ? '' : s < 60 ? `${s.toFixed(s < 10 ? 1 : 0)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);

export class MediathequePanel {
  /** onOpen(asset): what to do with an item once added (the app's openAsset). */
  constructor({ store, onOpen, log }) {
    this.store = store; this.onOpen = onOpen; this.log = log || (() => {});
    this.records = []; this.query = ''; this.kind = 'all'; this.clips = null; this.pd = false; this.tags = []; this.sel = null;
    this.have = new Set();
    this.picked = new Set();   // ⌘/Ctrl-click picks several
  }

  render(el) {
    this.el = el;
    el.innerHTML = `
      <div class="mt-bar">
        <label class="assets-search" title="Words match title, summary, keywords, creators, tags and demos; #tag matches a tag exactly">${icon('search', 'icon-sm')}<input class="mt-q" type="search" placeholder="Search the archive" spellcheck="false" /></label>
        <select class="mt-kind" title="Kind"><option value="all">All</option><option value="video">Video</option><option value="animation">GIFs</option><option value="image">Images</option></select>
        <button class="btn-micro mt-clips" title="Only clips: short moments already cut from longer films">Clips</button>
        <button class="btn-micro mt-pd" title="Only public domain">PD</button>
      </div>
      <div class="mt-tags"></div>
      <div class="assets-grid mt-grid"></div>
      <div class="mt-foot"></div>`;
    const q = el.querySelector('.mt-q');
    q.addEventListener('input', () => { this.query = q.value; this.draw(); });
    el.querySelector('.mt-kind').addEventListener('change', e => { this.kind = e.target.value; this.draw(); });
    const toggle = (sel, key) => el.querySelector(sel).addEventListener('click', ev => { this[key] = this[key] ? (key === 'clips' ? null : false) : true; ev.currentTarget.classList.toggle('on', Boolean(this[key])); this.draw(); });
    toggle('.mt-clips', 'clips'); toggle('.mt-pd', 'pd');
    this.store.onChange(() => this.syncHave());
    this.load();
  }

  async load(force = false) {
    this.records = await loadCatalog({ force });
    await this.syncHave();
    this.drawTags(); this.draw();
  }

  async syncHave() {
    const ids = new Set((await this.store.all()).filter(a => a.meta?.mediatheque).map(a => a.id));
    this.have = ids;
    this.el?.querySelectorAll('.mt-card').forEach(c => c.classList.toggle('have', ids.has(assetId({ id: c.dataset.id }))));
  }

  drawTags() {
    const box = this.el.querySelector('.mt-tags');
    const top = facet(this.records, 'tags', 24);
    box.innerHTML = top.map(([t, n]) => `<button class="mt-tag${this.tags.includes(t) ? ' on' : ''}" data-t="${esc(t)}" title="${n} in the archive">#${esc(t)}</button>`).join('');
    box.querySelectorAll('.mt-tag').forEach(b => b.addEventListener('click', () => {
      const t = b.dataset.t; this.tags = this.tags.includes(t) ? this.tags.filter(x => x !== t) : [...this.tags, t];
      b.classList.toggle('on'); this.draw();
    }));
  }

  visible() { return search(this.records, this.query, { kind: this.kind, clips: this.clips, pd: this.pd, tags: this.tags }); }

  draw() {
    const grid = this.el.querySelector('.mt-grid'), list = this.visible();
    const n = this.picked.size, todo = n ? list.filter(r => this.picked.has(r.id)) : list;
    this.el.querySelector('.mt-foot').innerHTML = `${list.length} of ${this.records.length} · <button class="btn-micro mt-all" title="Add ${n ? 'the picked' : 'everything shown'} to Assets as references (nothing is stored; ⌘/Ctrl-click cards to pick)">+ ${n ? `${n} picked` : `all ${list.length} shown`}</button> · <a href="${esc(mediathequeBase())}site/index.html" target="_blank" rel="noopener" title="Open the archive in a browser tab">Mediathèque</a>`;
    grid.innerHTML = list.length ? list.map(r => `
      <div class="variant-card asset-card mt-card${this.have.has(assetId(r)) ? ' have' : ''}${this.picked.has(r.id) ? ' picked' : ''}${this.sel === r.id ? ' selected' : ''}" data-id="${esc(r.id)}" draggable="true">
        <div class="variant-card-header">
          <span class="asset-title" title="${esc(r.title)}">${esc(r.title)}</span>
          <span class="asset-kind" title="${r.type === 'clip' ? 'A clip, cut from ' + esc(r.parent_title || r.parent) : esc(r.kind)}">${r.type === 'clip' ? '✂' : ''}${r.kind === 'video' || r.type === 'clip' ? icon('play', 'icon-sm') : icon('photo', 'icon-sm')}</span>
        </div>
        <div class="variant-thumb-wrap" title="${esc(r.summary || '')}\n\nDouble-click: add and place on the canvas">
          <img class="variant-thumb" src="${esc(r.abs.thumb)}" alt="" draggable="false" loading="lazy" />
          ${r.duration ? `<span class="mt-dur">${fmt(r.duration)}</span>` : ''}
          <span class="mt-rights ${isPublicDomain(r) ? 'pd' : ''}" title="${esc(creditLine(r))}">${isPublicDomain(r) ? 'PD' : esc(r.rights?.license || 'CC')}</span>
        </div>
        <div class="variant-card-footer">
          <div class="asset-actions">
            <button class="btn-micro btn-icon-only" data-act="add" title="Add to Assets as a reference (the address only; nothing is stored)">${icon('plus', 'icon-sm')}</button>
            <button class="btn-micro btn-icon-only" data-act="copy" title="Add a copy to Assets (the file is kept; works offline)">${icon('arrowDownTray', 'icon-sm')}</button>
            <button class="btn-micro btn-icon-only" data-act="page" title="Open its page in the archive">${icon('arrowRight', 'icon-sm')}</button>
          </div>
          <span class="mt-have" title="Already in Assets">✓</span>
        </div>
      </div>`).join('') : `<p class="assets-empty">${this.records.length ? '—' : 'The archive could not be reached.'}</p>`;
    this.el.querySelector('.mt-all')?.addEventListener('click', async ev => {
      const b = ev.currentTarget; b.disabled = true;
      let done = 0;
      for (const r of todo) { try { await addToAssets(this.store, r); done++; } catch (err) { this.log(`Mediathèque: ${r.title}: ${err.message}`, 'error'); } }
      this.picked.clear(); b.disabled = false; await this.syncHave(); this.draw();
      this.log(`${done} item${done === 1 ? '' : 's'} from the Mediathèque added to Assets (references).`);
    });
    grid.querySelectorAll('.mt-card').forEach(card => {
      const r = list.find(x => x.id === card.dataset.id);
      const run = (fn, msg) => async ev => {
        ev?.stopPropagation?.(); card.classList.add('busy');
        try { const a = await fn(); await this.syncHave(); if (msg) this.log(msg(a)); return a; }
        catch (err) { this.log(`Mediathèque: ${err.message}`, 'error'); }
        finally { card.classList.remove('busy'); }
      };
      card.querySelector('[data-act="add"]').addEventListener('click', run(() => addToAssets(this.store, r), a => `“${a.title}” is in Assets (a reference to the archive).`));
      card.querySelector('[data-act="copy"]').addEventListener('click', run(() => addToAssets(this.store, r, { copy: true }), a => `“${a.title}” is in Assets (a copy).`));
      card.querySelector('[data-act="page"]').addEventListener('click', ev => { ev.stopPropagation(); window.open(r.abs.page, '_blank', 'noopener'); });
      card.addEventListener('click', ev => {
        if (ev.target.closest('button')) return;
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey) { this.picked.has(r.id) ? this.picked.delete(r.id) : this.picked.add(r.id); card.classList.toggle('picked', this.picked.has(r.id)); this.draw(); return; }
        this.sel = r.id; grid.querySelectorAll('.mt-card').forEach(c => c.classList.toggle('selected', c === card));
      });
      card.querySelector('.variant-thumb-wrap').addEventListener('dblclick', async ev => { const a = await run(() => addToAssets(this.store, r))(ev); if (a) this.onOpen?.(a); });
      card.addEventListener('dragstart', e => {
        // The asset is made as the drag starts (a reference, quick), so the drop finds it.
        const done = addToAssets(this.store, r).catch(err => this.log(`Mediathèque: ${err.message}`, 'error'));
        MediathequePanel.pending = done;
        e.dataTransfer.setData('text/asset-id', assetId(r)); e.dataTransfer.effectAllowed = 'copyMove';
      });
    });
  }
}
/** The add begun by the latest drag (a drop handler can await it). */
MediathequePanel.pending = null;
