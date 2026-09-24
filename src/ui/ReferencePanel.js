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
  constructor({ onReferenceChange, onLiveToggle, onLiveParams, onExportContinuous } = {}) {
    this.onReferenceChange = onReferenceChange;
    this.onLiveToggle = onLiveToggle;
    this.onLiveParams = onLiveParams;
    this.onExportContinuous = onExportContinuous;
    this.live = { render: 'flat', mode: 'strokes', density: 150, lifetime: 10, fadeIn: 0.05, fadeOut: 0.15, shapes: 'mixed' };
    this.liveRunning = false;
    this.references = bundledReferences();
    this.current = null; // { id, name, image, displayUrl, source, rights, uploaded }
  }

  render(container) {
    this.container = container;
    const options = this.references.map(r => `<option value="${escapeHtml(r.id)}">${escapeHtml(r.title)}, ${r.year}</option>`).join('');
    container.innerHTML = `
      <div class="reference-panel" title="Used by the Reference Fitter engine. The model menu sets the shape budget; candidates A–D use mixed, rectangle, circle and triangle shapes.">
        <div class="reference-controls">
          <select id="reference-select" title="Bundled public-domain references">
            <option value="">No reference</option>
            ${options}
            <option value="__upload">Upload an image…</option>
          </select>
          <input type="file" id="reference-upload" accept="image/*" hidden />
        </div>
        <div id="reference-view" class="reference-view"></div>
        <div class="live-controls" title="Continuous mode: shapes fade in, live for a while, fade out, and are replaced by new fits, repainting the reference forever.">
          <div class="live-row">
            <button id="live-toggle" class="btn-primary live-toggle">Play continuous</button>
            <button id="live-export" class="btn-micro" title="Export an endless p5.js sketch (zip) with these settings">Export p5</button>
          </div>
          <label class="live-slider" title="Watercolor paints each stroke with p5.brush as it lands; old paint fades under washes (Fade out sets how slowly)">
            <span>Render</span>
            <select id="live-render">
              <option value="flat">Flat</option>
              <option value="watercolor">Watercolor</option>
            </select>
          </label>
          <label class="live-slider" title="Strokes: one shape at a time, the oldest leaves as the newest arrives. Fade: many shapes fading at once.">
            <span>Style</span>
            <select id="live-mode">
              <option value="strokes">Strokes</option>
              <option value="fade">Fade</option>
            </select>
          </label>
          <label class="live-slider" title="Shapes alive at once: more shapes, more detail">
            <span>Density</span>
            <input type="range" id="live-density" min="10" max="800" step="10" value="${this.live.density}" />
            <output id="live-density-out">${this.live.density}</output>
          </label>
          <label class="live-slider" title="Seconds for the whole painting to turn over: sets the pacing">
            <span>Cycle</span>
            <input type="range" id="live-lifetime" min="1" max="60" step="0.5" value="${this.live.lifetime}" />
            <output id="live-lifetime-out">${this.live.lifetime} s</output>
          </label>
          <label class="live-slider" title="How gradually each shape appears">
            <span>Fade in</span>
            <input type="range" id="live-fadein" min="0" max="0.5" step="0.05" value="${this.live.fadeIn}" />
            <output id="live-fadein-out">${this.live.fadeIn}</output>
          </label>
          <label class="live-slider" title="How gradually each shape disappears">
            <span>Fade out</span>
            <input type="range" id="live-fadeout" min="0" max="0.5" step="0.05" value="${this.live.fadeOut}" />
            <output id="live-fadeout-out">${this.live.fadeOut}</output>
          </label>
          <label class="live-slider" title="Shape vocabulary for new shapes">
            <span>Shapes</span>
            <select id="live-shapes">
              <option value="mixed">Mixed</option>
              <option value="rect">Rectangles</option>
              <option value="circle">Circles</option>
              <option value="triangle">Triangles</option>
            </select>
          </label>
        </div>
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

    const liveParams = () => ({
      render: this.live.render,
      mode: this.live.mode,
      density: this.live.density,
      lifetime: this.live.lifetime,
      fadeIn: this.live.fadeIn,
      fadeOut: this.live.fadeOut,
      shapes: this.live.shapes === 'mixed' ? ['rect', 'triangle', 'circle'] : [this.live.shapes]
    });
    this.liveParams = liveParams;
    const bindSlider = (id, key, fmt) => {
      const input = container.querySelector(`#live-${id}`);
      const out = container.querySelector(`#live-${id}-out`);
      input?.addEventListener('input', () => {
        this.live[key] = Number(input.value);
        if (out) out.textContent = fmt(this.live[key]);
        this.onLiveParams?.(liveParams());
      });
    };
    bindSlider('density', 'density', v => String(v));
    bindSlider('lifetime', 'lifetime', v => `${v} s`);
    bindSlider('fadein', 'fadeIn', v => String(v));
    bindSlider('fadeout', 'fadeOut', v => String(v));
    container.querySelector('#live-render')?.addEventListener('change', (e) => {
      this.live.render = e.target.value;
      this.onLiveParams?.(liveParams());
    });
    container.querySelector('#live-mode')?.addEventListener('change', (e) => {
      this.live.mode = e.target.value;
      this.onLiveParams?.(liveParams());
    });
    container.querySelector('#live-shapes')?.addEventListener('change', (e) => {
      this.live.shapes = e.target.value;
      this.onLiveParams?.(liveParams());
    });
    container.querySelector('#live-toggle')?.addEventListener('click', () => {
      if (!this.current?.image && !this.liveRunning) return;
      this.onLiveToggle?.(!this.liveRunning, liveParams());
    });
    container.querySelector('#live-export')?.addEventListener('click', () => this.onExportContinuous?.(liveParams()));

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

  setLiveRunning(on) {
    this.liveRunning = on;
    const btn = this.container?.querySelector('#live-toggle');
    if (btn) btn.textContent = on ? 'Stop' : 'Play continuous';
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
