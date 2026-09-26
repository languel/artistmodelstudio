/**
 * Assets: a browser for saved variations, live paintings and imported images.
 * Folders, search (words match title, tags, kind, folder, artist; #tag matches a
 * tag exactly), star ratings, double-click to rename or retag, export, and
 * "use as reference".
 */
import { askConfirm, askText } from '../workbench/dialog.js';
import { icon } from './icons.js';
import { matches } from '../assets/assetStore.js';

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const KIND_ICONS = { audio: 'play', text: 'script', take: 'play', walkthrough: 'play', dataset: 'database', process: 'paintBrush', variation: 'squaresPlus', painting: 'paintBrush', import: 'arrowUpTray', klee: 'photo' };
const KIND_TIPS = { process: 'Process document (workbench)', variation: 'Variation (generated candidate)', painting: 'Painting (continuous mode)', import: 'Imported image', klee: 'Bundled Klee reference' };
const KINDS = { all: 'All', process: 'Processes', take: 'Takes', audio: 'Audio', text: 'Text', walkthrough: 'Walkthroughs', dataset: 'Datasets', variation: 'Variations', painting: 'Paintings', import: 'Imports', klee: 'Klee' };

export class AssetPanel {
  constructor({ store, onUseAsReference, onExport, onOpen }) {
    this.onOpen = onOpen;
    this.store = store;
    this.onUseAsReference = onUseAsReference;
    this.onExport = onExport;
    this.folder = '';
    this.sel = new Set();
    this.anchor = null;
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
          <button id="assets-import-files" class="btn-micro btn-icon-only" title="Import files: images, SVG, audio, text, JSON (drawings and takes come back as themselves). Or drop files here.">${icon('arrowUpTray', 'icon-sm')}</button>
          <button id="assets-import" class="btn-micro btn-icon-only" title="Import a folder (subfolders are kept; a sources.json supplies titles)">${icon('folder', 'icon-sm')}</button>
          <input id="assets-import-input" type="file" webkitdirectory multiple hidden />
          <input id="assets-import-files-input" type="file" multiple hidden accept="image/*,.svg,audio/*,.mp3,.wav,.ogg,.m4a,text/*,.txt,.md,.json" />
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
    const filesInput = container.querySelector('#assets-import-files-input');
    container.querySelector('#assets-import-files').addEventListener('click', () => filesInput.click());
    filesInput.addEventListener('change', async () => {
      if (filesInput.files.length) await this.store.importFiles(filesInput.files, this.folder);
      filesInput.value = '';
    });
    // Selection keys: Esc clears, Delete removes, Cmd+A selects all shown.
    const grid = container.querySelector('#assets-grid');
    grid.tabIndex = 0;
    grid.addEventListener('keydown', e => {
      if (e.target !== grid) return;
      if (e.key === 'Escape' && this.sel.size) { this.sel.clear(); this.markSelection(); e.stopPropagation(); }
      else if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel.size) { e.preventDefault(); e.stopPropagation(); this.deleteAssets([...this.sel]); }
      else if (e.key === 'a' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopPropagation(); this.sel = new Set(this.visible().map(a => a.id)); this.markSelection(); }
    });
    grid.addEventListener('click', e => { if (!e.target.closest('.asset-card')) { this.sel.clear(); this.markSelection(); } grid.focus({ preventScroll: true }); });
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
      ${parts.length ? `<button class="folder-chip folder-up" data-path="${esc(parts.slice(0, -1).join('/'))}" title="Up to ${esc(parts.slice(0, -1).join('/') || 'Assets')} · drop a card here to move it up">↑</button>` : ''}
      <span class="crumb-subs">${subs.map(p => `<button class="folder-chip" data-path="${esc(p)}" title="Open · drop a card here to move it">${icon('folder', 'icon-sm')}${esc(p.split('/').pop())}<span class="folder-count">${count(p)}</span></button>`).join('')}</span>`;
    crumbs.querySelectorAll('[data-path]').forEach(el => {
      el.addEventListener('click', () => { this.folder = el.dataset.path; this.draw(); });
      el.addEventListener('dragover', e => { if (e.dataTransfer?.types.includes('text/asset-id')) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('drop'); } });
      el.addEventListener('dragleave', () => el.classList.remove('drop'));
      el.addEventListener('drop', e => {
        const ids = e.dataTransfer.getData('text/asset-id').split('\n').filter(Boolean);
        el.classList.remove('drop');
        if (ids.length) { e.preventDefault(); e.stopPropagation(); Promise.all(ids.map(id => this.store.update(id, { folder: el.dataset.path }))).then(() => this.refresh()); }
      });
    });
    // Right-click a folder (chip or crumb) to remove it.
    crumbs.querySelectorAll('.folder-chip:not(.folder-up)[data-path], .crumb[data-path]:not([data-path=""])').forEach(el => {
      el.addEventListener('contextmenu', ev => { ev.preventDefault(); this.folderMenu(el.dataset.path, ev); });
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
      <div class="variant-card asset-card${this.sel.has(a.id) ? ' selected' : ''}" data-id="${esc(a.id)}" draggable="true">
        <div class="variant-card-header">
          <span class="asset-title" title="${esc(a.title)}">${esc(a.title)}</span>
          <span class="asset-kind" title="${esc(KIND_TIPS[a.kind] || a.kind)}">${icon(KIND_ICONS[a.kind] || 'photo', 'icon-sm')}</span>
        </div>
        <div class="variant-thumb-wrap" title="Double-click to show in the main preview">
          <img class="variant-thumb" src="${a.thumb}" alt="${esc(a.title)}" draggable="false" />
        </div>
        <div class="asset-tags" title="Double-click to edit tags (comma separated)">${a.tags?.length ? a.tags.map(t => `<span class="asset-tag">#${esc(t)}</span>`).join('') : '<span class="asset-tag muted">#</span>'}${this.query && a.folder !== this.folder ? `<span class="asset-folder">${esc(a.folder || '/')}</span>` : ''}</div>
        <div class="variant-card-footer">
          <div class="asset-actions">
            <button class="btn-micro btn-icon-only" data-act="open" title="Show in the main preview">${icon('expand', 'icon-sm')}</button>
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
      card.addEventListener('click', e => {
        if (e.target.closest('button, .star, input, textarea')) return;
        const ids = list.map(a => a.id);
        if (e.shiftKey && this.anchor && ids.includes(this.anchor)) {
          const [a, b] = [ids.indexOf(this.anchor), ids.indexOf(id)].sort((x, y) => x - y);
          if (!(e.metaKey || e.ctrlKey)) this.sel.clear();
          for (const x of ids.slice(a, b + 1)) this.sel.add(x);
        } else if (e.metaKey || e.ctrlKey) { this.sel.has(id) ? this.sel.delete(id) : this.sel.add(id); this.anchor = id; }
        else { this.sel = new Set([id]); this.anchor = id; }
        this.markSelection();
      });
      card.addEventListener('dragstart', e => {
        if (!this.sel.has(id)) { this.sel = new Set([id]); this.anchor = id; this.markSelection(); }
        e.dataTransfer.setData('text/asset-id', [...this.sel].join('\n')); e.dataTransfer.effectAllowed = 'copyMove'; });
      card.querySelectorAll('.star').forEach(st => st.addEventListener('click', () => {
        const r = Number(st.dataset.star);
        this.store.update(id, { rating: asset.rating === r ? 0 : r });
      }));
      card.querySelector('.variant-thumb-wrap').addEventListener('dblclick', () => this.onOpen?.(asset));
      card.querySelector('[data-act="open"]').addEventListener('click', () => this.onOpen?.(asset));
      card.querySelector('[data-act="ref"]').addEventListener('click', () => this.onUseAsReference?.(asset));
      card.querySelector('[data-act="export"]').addEventListener('click', () => this.onExport?.(asset));
      card.querySelector('[data-act="delete"]').addEventListener('click', () => this.deleteAssets(this.sel.has(id) ? [...this.sel] : [id]));
      const title = card.querySelector('.asset-title');
      title.addEventListener('dblclick', () => this.editInline(title, asset.title, v => this.store.update(id, { title: v || asset.title })));
      const tags = card.querySelector('.asset-tags');
      tags.addEventListener('dblclick', () => this.editInline(tags, (asset.tags || []).join(', '), v =>
        this.store.update(id, { tags: v.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean) })));
    });
  }

  markSelection() {
    this.container.querySelectorAll('.asset-card').forEach(c => c.classList.toggle('selected', this.sel.has(c.dataset.id)));
  }

  async deleteAssets(ids) {
    const one = this.assets.find(a => a.id === ids[0]);
    const msg = ids.length === 1 ? `Delete "${one?.title}" from assets?` : `Delete ${ids.length} assets?`;
    if (!(await askConfirm(msg, { ok: 'Delete', danger: true }))) return;
    for (const id of ids) { await this.store.remove(id); this.sel.delete(id); }
    this.refresh();
  }

  /** Replace `el`'s text with a field; Enter saves, Esc cancels. */
  async folderMenu(path, ev) {
    const n = (await this.store.all()).filter(a => a.folder === path || a.folder.startsWith(path + '/')).length;
    const name = path.split('/').pop();
    const parent = path.split('/').slice(0, -1).join('/');
    const done = () => { if (this.folder === path || this.folder.startsWith(path + '/')) this.folder = parent; this.refresh(); };
    const { showMenu } = await import('../workbench/menu.js');
    showMenu([
      { label: `“${name}”` },
      { label: n ? `Remove folder (move ${n} asset${n === 1 ? '' : 's'} up)` : 'Remove folder', run: async () => { await this.store.removeFolder(path); done(); } },
      n ? { label: `Delete folder and its ${n} asset${n === 1 ? '' : 's'}…`, run: async () => { if (await askConfirm(`Delete “${name}” and the ${n} asset${n === 1 ? '' : 's'} in it? This cannot be undone.`)) { await this.store.removeFolder(path, { deleteAssets: true }); done(); } } } : null
    ], ev.clientX, ev.clientY);
  }

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
