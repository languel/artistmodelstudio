/**
 * Assets: a browser for saved variations, live paintings and imported images.
 * Folders, search (words match title, tags, kind, folder, artist; #tag matches a
 * tag exactly), star ratings, double-click to rename or retag, export, and
 * "use as reference".
 */
import { icon } from './icons.js';
import { matches } from '../assets/assetStore.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const KINDS = { all: 'All', variation: 'Variations', painting: 'Paintings', import: 'Imports', klee: 'Klee' };

export class AssetPanel {
  constructor({ store, onUseAsReference, onExport }) {
    this.store = store;
    this.onUseAsReference = onUseAsReference;
    this.onExport = onExport;
    this.folder = '';
    this.query = '';
    this.kind = 'all';
    this.assets = [];
    this.folderList = [];
    store.onChange(() => this.refresh());
  }

  render(container) {
    this.container = container;
    container.innerHTML = `
      <div class="assets-panel">
        <div class="assets-toolbar">
          <label class="assets-search" title="Words match title, tags, kind, folder and artist; #tag matches a tag exactly">
            ${icon('search', 'icon-sm')}<input id="assets-q" type="search" placeholder="Search" spellcheck="false" />
          </label>
          <select id="assets-kind" title="Kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select>
          <button id="assets-new-folder" class="btn-micro btn-icon-only" title="New folder here">${icon('folderPlus', 'icon-sm')}</button>
          <button id="assets-import" class="btn-micro btn-icon-only" title="Import a folder of images (subfolders are kept; a sources.json supplies titles)">${icon('arrowUpTray', 'icon-sm')}</button>
          <input id="assets-import-input" type="file" webkitdirectory multiple hidden />
        </div>
        <div class="assets-crumbs" id="assets-crumbs"></div>
        <div class="assets-grid" id="assets-grid"></div>
      </div>`;
    const q = container.querySelector('#assets-q');
    q.addEventListener('input', () => { this.query = q.value; this.draw(); });
    container.querySelector('#assets-kind').addEventListener('change', e => { this.kind = e.target.value; this.draw(); });
    container.querySelector('#assets-new-folder').addEventListener('click', () => this.newFolder());
    const input = container.querySelector('#assets-import-input');
    container.querySelector('#assets-import').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      if (input.files.length) await this.store.importFiles(input.files, this.folder);
      input.value = '';
    });
    // Drop images or folders' files onto the panel.
    container.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault(); });
    container.addEventListener('drop', async e => {
      if (!e.dataTransfer?.files.length) return;
      e.preventDefault();
      await this.store.importFiles(e.dataTransfer.files, this.folder);
    });
    this.refresh();
  }

  async refresh() {
    if (!this.container) return;
    [this.assets, this.folderList] = await Promise.all([this.store.all(), this.store.folders()]);
    this.draw();
  }

  /** Assets in the current folder, or anywhere below it while searching. */
  visible() {
    const f = this.folder;
    const inFolder = a => (this.query ? (a.folder === f || !f || a.folder.startsWith(f + '/')) : a.folder === f);
    return this.assets.filter(a => inFolder(a) && (this.kind === 'all' || a.kind === this.kind) && matches(a, this.query));
  }

  draw() {
    if (!this.container) return;
    const crumbs = this.container.querySelector('#assets-crumbs');
    const parts = this.folder ? this.folder.split('/') : [];
    const subs = this.folderList
      .filter(p => (this.folder ? p.startsWith(this.folder + '/') : true) && p.split('/').length === parts.length + 1);
    const count = p => this.assets.filter(a => a.folder === p || a.folder.startsWith(p + '/')).length;
    crumbs.innerHTML = `
      <span class="crumb ${parts.length ? '' : 'current'}" data-path="">Assets</span>
      ${parts.map((p, i) => `<span class="crumb-sep">/</span><span class="crumb ${i === parts.length - 1 ? 'current' : ''}" data-path="${esc(parts.slice(0, i + 1).join('/'))}" title="Double-click to rename">${esc(p)}</span>`).join('')}
      <span class="crumb-subs">${subs.map(p => `<button class="folder-chip" data-path="${esc(p)}" title="Open · drop a card here to move it">${icon('folder', 'icon-sm')}${esc(p.split('/').pop())}<span class="folder-count">${count(p)}</span></button>`).join('')}</span>`;
    crumbs.querySelectorAll('[data-path]').forEach(el => {
      el.addEventListener('click', () => { this.folder = el.dataset.path; this.draw(); });
      el.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('text/asset-id')) { e.preventDefault(); el.classList.add('drop'); } });
      el.addEventListener('dragleave', () => el.classList.remove('drop'));
      el.addEventListener('drop', e => {
        const id = e.dataTransfer.getData('text/asset-id');
        el.classList.remove('drop');
        if (id) { e.preventDefault(); e.stopPropagation(); this.store.update(id, { folder: el.dataset.path }); }
      });
    });
    crumbs.querySelectorAll('.crumb[data-path]:not([data-path=""])').forEach(el => {
      el.addEventListener('dblclick', () => this.editInline(el, el.textContent, name => {
        const path = el.dataset.path.split('/').slice(0, -1).concat(name.replace(/\//g, '-')).join('/');
        this.store.renameFolder(el.dataset.path, path).then(() => { this.folder = path; this.refresh(); });
      }));
    });

    const grid = this.container.querySelector('#assets-grid');
    const list = this.visible();
    grid.innerHTML = list.length ? list.map(a => `
      <div class="variant-card asset-card" data-id="${esc(a.id)}" draggable="true">
        <div class="variant-card-header">
          <span class="asset-title" title="Double-click to rename">${esc(a.title)}</span>
          <span class="variant-ops">${esc(a.kind)}</span>
        </div>
        <div class="variant-thumb-wrap" title="Double-click to use as reference">
          <img class="variant-thumb" src="${a.thumb}" alt="${esc(a.title)}" draggable="false" />
        </div>
        <div class="asset-tags" title="Double-click to edit tags (comma separated)">${a.tags?.length ? a.tags.map(t => `<span class="asset-tag">#${esc(t)}</span>`).join('') : '<span class="asset-tag muted">#</span>'}${this.query && a.folder !== this.folder ? `<span class="asset-folder">${esc(a.folder || '/')}</span>` : ''}</div>
        <div class="variant-card-footer">
          <div class="asset-actions">
            <button class="btn-micro btn-icon-only" data-act="ref" title="Use as reference">${icon('photo', 'icon-sm')}</button>
            <button class="btn-micro btn-icon-only" data-act="export" title="Export">${icon('arrowDownTray', 'icon-sm')}</button>
            <button class="btn-micro btn-icon-only" data-act="delete" title="Delete">${icon('trash', 'icon-sm')}</button>
          </div>
          <div class="rating-stars">${[1, 2, 3, 4, 5].map(s => `<span class="star ${(a.rating || 0) >= s ? 'filled' : ''}" data-star="${s}">★</span>`).join('')}</div>
        </div>
      </div>`).join('') : '<p class="assets-empty">—</p>';

    grid.querySelectorAll('.asset-card').forEach(card => {
      const id = card.dataset.id;
      const asset = this.assets.find(a => a.id === id);
      card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/asset-id', id); e.dataTransfer.effectAllowed = 'move'; });
      card.querySelectorAll('.star').forEach(st => st.addEventListener('click', () => {
        const r = Number(st.dataset.star);
        this.store.update(id, { rating: asset.rating === r ? 0 : r });
      }));
      card.querySelector('.variant-thumb-wrap').addEventListener('dblclick', () => this.onUseAsReference?.(asset));
      card.querySelector('[data-act="ref"]').addEventListener('click', () => this.onUseAsReference?.(asset));
      card.querySelector('[data-act="export"]').addEventListener('click', () => this.onExport?.(asset));
      card.querySelector('[data-act="delete"]').addEventListener('click', () => {
        if (confirm(`Delete "${asset.title}" from assets?`)) this.store.remove(id);
      });
      const title = card.querySelector('.asset-title');
      title.addEventListener('dblclick', () => this.editInline(title, asset.title, v => this.store.update(id, { title: v || asset.title })));
      const tags = card.querySelector('.asset-tags');
      tags.addEventListener('dblclick', () => this.editInline(tags, (asset.tags || []).join(', '), v =>
        this.store.update(id, { tags: v.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean) })));
    });
  }

  /** Replace `el`'s text with a field; Enter saves, Esc cancels. */
  editInline(el, value, save, cancel) {
    const input = document.createElement('input');
    input.className = 'asset-edit';
    input.value = value;
    const restore = el.innerHTML;
    el.innerHTML = '';
    el.appendChild(input);
    input.focus();
    input.select();
    let done = false;
    const finish = ok => {
      if (done) return;
      done = true;
      if (ok && input.value.trim() !== value) save(input.value.trim());
      else { el.innerHTML = restore; cancel?.(); }
    };
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') finish(true);
      else if (e.key === 'Escape') finish(false);
      e.stopPropagation();
    });
    input.addEventListener('blur', () => finish(true));
  }

  newFolder() {
    const crumbs = this.container.querySelector('#assets-crumbs .crumb-subs');
    const chip = document.createElement('span');
    chip.className = 'folder-chip editing';
    crumbs.appendChild(chip);
    this.editInline(chip, '', name => {
      const clean = name.replace(/\//g, '-');
      if (clean) this.store.addFolder(this.folder ? this.folder + '/' + clean : clean);
      else this.draw();
    }, () => this.draw());
    chip.querySelector('input').placeholder = 'Folder name';
  }
}
