/**
 * Reference Panel
 *
 * Shows the active reference image and lets the user pick a bundled
 * public-domain reference (fixtures/references/<set>/sources.json) or upload
 * a local image. Uploaded images stay in the browser; nothing is sent anywhere.
 */

const manifests = import.meta.glob('/fixtures/references/*/sources.json', { eager: true, import: 'default' });
const imageUrls = import.meta.glob('/fixtures/references/*/*.{jpg,jpeg,png,webp}', { eager: true, query: '?url', import: 'default' });

export function bundledReferences() {
  const out = [];
  for (const [path, manifest] of Object.entries(manifests)) {
    const dir = path.replace(/sources\.json$/, '');
    for (const ref of manifest.references || []) {
      const url = imageUrls[dir + ref.file];
      if (!url) continue;
      out.push({ ...ref, url, collection: manifest.collection });
    }
  }
  return out;
}

const STORAGE_KEY = 'ams_reference_id';

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load image ${src}`));
    img.src = src;
  });
}

/** Apply a fractional crop box by drawing into a canvas. */
function cropImage(img, crop) {
  if (!crop) return img;
  const c = document.createElement('canvas');
  const sw = img.naturalWidth * crop.w, sh = img.naturalHeight * crop.h;
  c.width = Math.round(sw);
  c.height = Math.round(sh);
  c.getContext('2d').drawImage(img, img.naturalWidth * crop.x, img.naturalHeight * crop.y, sw, sh, 0, 0, c.width, c.height);
  return c;
}

const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

export class ReferencePanel {
  constructor({ onReferenceChange } = {}) {
    this.onReferenceChange = onReferenceChange;
    this.references = bundledReferences();
    this.current = null; // { id, name, image, displayUrl, source, rights, uploaded }
  }

  render(container) {
    this.container = container;
    const options = this.references.map(r => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.title)}, ${r.year}</option>`).join('');
    container.innerHTML = `
      <div class="reference-panel">
        <div class="reference-controls">
          <select id="reference-select" title="Bundled public-domain references">
            <option value="">No reference</option>
            ${options}
            <option value="__upload">Upload an image…</option>
          </select>
          <input type="file" id="reference-upload" accept="image/*" hidden />
        </div>
        <div id="reference-view" class="reference-view"></div>
        <p class="reference-hint">Used by the <strong>Reference Fitter</strong> engine. Choose its shape budget in the model menu; candidates A–D use mixed, rectangle, circle and triangle shapes.</p>
      </div>`;

    const select = container.querySelector('#reference-select');
    const upload = container.querySelector('#reference-upload');
    select.addEventListener('change', () => {
      if (select.value === '__upload') {
        upload.click();
        select.value = this.current?.uploaded ? '__upload' : (this.current?.id || '');
        return;
      }
      this.selectBundled(select.value);
    });
    upload.addEventListener('change', () => {
      const file = upload.files?.[0];
      if (file) this.selectUpload(file);
      upload.value = '';
    });

    let saved = '';
    try { saved = localStorage.getItem(STORAGE_KEY) || ''; } catch { /* storage unavailable */ }
    const initial = this.references.find(r => r.id === saved) ? saved : (this.references[0]?.id || '');
    select.value = initial;
    this.selectBundled(initial);
  }

  async selectBundled(id) {
    const ref = this.references.find(r => r.id === id);
    try { localStorage.setItem(STORAGE_KEY, id || ''); } catch { /* storage unavailable */ }
    if (!ref) return this.setCurrent(null);
    const img = await loadImage(ref.url);
    this.setCurrent({
      id: ref.id,
      name: `${ref.title} (${ref.artist.split(' (')[0]}, ${ref.year})`,
      image: cropImage(img, ref.crop),
      displayUrl: ref.url,
      crop: ref.crop || null,
      source: ref.source?.commonsPage,
      rights: ref.rights?.commonsLicense,
      uploaded: false
    });
  }

  async selectUpload(file) {
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    this.setCurrent({ id: `upload:${file.name}`, name: file.name, image: img, displayUrl: url, source: null, rights: 'your upload (kept in this browser)', uploaded: true });
    const select = this.container?.querySelector('#reference-select');
    if (select) {
      let opt = select.querySelector('option[data-upload]');
      if (!opt) {
        opt = document.createElement('option');
        opt.dataset.upload = '1';
        select.insertBefore(opt, select.querySelector('option[value="__upload"]'));
      }
      opt.value = `upload:${file.name}`;
      opt.textContent = `Uploaded: ${file.name}`;
      select.value = opt.value;
    }
  }

  setCurrent(ref) {
    this.current = ref;
    const view = this.container?.querySelector('#reference-view');
    if (view) {
      if (!ref) {
        view.innerHTML = '<p class="reference-empty">No reference selected.</p>';
      } else {
        const src = ref.image instanceof HTMLCanvasElement ? ref.image.toDataURL('image/jpeg', 0.9) : ref.displayUrl;
        view.innerHTML = `
          <img src="${src}" alt="${escapeHtml(ref.name)}" />
          <div class="reference-meta">
            <strong>${escapeHtml(ref.name)}</strong>
            <span>${escapeHtml(ref.rights || '')}${ref.crop ? ' · cropped to the painted sheet' : ''}</span>
            ${ref.source ? `<a href="${escapeHtml(ref.source)}" target="_blank" rel="noopener">Source on Wikimedia Commons</a>` : ''}
          </div>`;
      }
    }
    this.onReferenceChange?.(ref);
  }
}
