import { icon } from './icons.js';
import { LiveSource } from '../fitting/referenceSource.js';

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
  constructor({ onFitChange, onLiveClear, onReferenceChange, onLiveToggle, onLiveParams, onExportContinuous, onOverlayChange } = {}) {
    this.onReferenceChange = onReferenceChange;
    this.onLiveClear = onLiveClear;
    this.onFitChange = onFitChange;
    this.onOverlayChange = onOverlayChange;
    this.overlay = { mode: 'off', opacity: 0.5 };
    this.fit = 'cover'; // how the reference is placed when its aspect differs from the canvas
    this.onLiveToggle = onLiveToggle;
    this.onLivePause = arguments[0]?.onLivePause;
    this.onLiveSave = arguments[0]?.onLiveSave;
    this.onShowReference = arguments[0]?.onShowReference;
    this.onSourceFrame = arguments[0]?.onSourceFrame;
    this.onSaveAsset = arguments[0]?.onSaveAsset;
    this.onLiveRecord = arguments[0]?.onLiveRecord;
    this.onRenderChange = arguments[0]?.onRenderChange;
    this.onOpenRenderOptions = arguments[0]?.onOpenRenderOptions;
    this.getStyle = arguments[0]?.getStyle;
    this.onLiveParams = onLiveParams;
    this.onExportContinuous = onExportContinuous;
    this.sourceCfg = { sampling: 'continuous', interval: 2, rate: 1 };
    this.live = { ground: 'transparent', groundTime: 5, render: 'flat', mode: 'strokes', density: 150, lifetime: 10, fadeIn: 0.05, fadeOut: 0.15, opacity: 1, pigment: 0.6, shapes: 'mixed' };
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
            <option value="__webcam">Webcam</option>
            <option value="__upload">Upload image, animation or video…</option>
          </select>
          <input type="file" id="reference-upload" accept="image/*,video/*" hidden />
        </div>
        <div id="reference-view" class="reference-view" title="Double-click to show the reference in the main preview"></div>
        <div class="live-controls source-controls" id="source-controls" hidden title="How continuous mode follows a moving reference">
          <label class="live-slider" title="Continuous: refit to every frame. Interval: take a new frame every few seconds. Hold: keep the last frame.">
            <span>Sampling</span>
            <select id="src-sampling">
              <option value="continuous">Continuous</option>
              <option value="interval">Interval</option>
              <option value="hold">Hold</option>
            </select>
          </label>
          <label class="live-slider" title="Seconds between samples (Interval)">
            <span>Interval s</span>
            <input type="range" id="src-interval" min="0.2" max="20" step="0.2" value="${this.sourceCfg.interval}" />
            <input class="num-field" id="src-interval-num" inputmode="decimal" value="${this.sourceCfg.interval}" title="Type any value" />
          </label>
          <label class="live-slider" id="src-rate-row" title="Playback speed of the video or animation, independent of sampling (0 pauses)">
            <span>Rate</span>
            <input type="range" id="src-rate" min="0" max="4" step="0.05" value="${this.sourceCfg.rate}" />
            <input class="num-field" id="src-rate-num" inputmode="decimal" value="${this.sourceCfg.rate}" title="Type any value; 0 pauses" />
          </label>
          <div class="live-slider" id="src-scrub-row" title="Timeline: drag to pick a frame (pauses playback)">
            <span>Frame</span>
            <input type="range" id="src-scrub" min="0" max="1000" step="1" value="0" />
            <span class="num-wrap scrub-tools">
              <button class="btn-micro scrub-btn" id="src-prev" title="Previous frame (pauses)">‹</button>
              <button class="btn-micro scrub-btn" id="src-playpause" title="Pause or play (sets Rate to 0 or back)">❚❚</button>
              <button class="btn-micro scrub-btn" id="src-next" title="Next frame (pauses)">›</button>
            </span>
          </div>
          <div class="scrub-pos" id="src-pos"></div>
        </div>
        <div class="live-controls overlay-controls">
          <label class="live-slider" title="When the reference and canvas aspects differ. Cover: crop to fill (nothing outside the reference is sampled). Contain: show all of it; the padding is ignored by the fitter and left unpainted. Stretch: distort to fill.">
            <span>Fit</span>
            <select id="ref-fit">
              <option value="cover">Cover</option>
              <option value="contain">Contain</option>
              <option value="stretch">Stretch</option>
            </select>
          </label>
          <label class="live-slider" title="Show the reference on the canvas: under the painting as its ground, over it for comparing, or on its own">
            <span>Overlay</span>
            <select id="overlay-mode">
              <option value="off">Off</option>
              <option value="under">Under</option>
              <option value="over">Over</option>
              <option value="solo">Solo</option>
            </select>
          </label>
          <label class="live-slider" title="Reference opacity for Under and Over">
            <span>Opacity</span>
            <input type="range" id="overlay-opacity" min="0" max="1" step="0.05" value="${this.overlay.opacity}" />
            <input class="num-field" id="overlay-opacity-num" inputmode="decimal" value="${this.overlay.opacity}" title="Type any value from 0 to 1" />
          </label>
        </div>
        <div class="live-controls" title="Continuous mode: shapes fade in, live for a while, fade out, and are replaced by new fits, repainting the reference forever.">
          <div class="live-row">
            <button id="live-toggle" class="btn-primary live-toggle" title="Play or stop continuous mode">Play</button>
            <button id="live-pause" class="btn-micro" title="Freeze the painting without clearing it; press again to resume" disabled>Pause</button>
            <button id="live-clear" class="btn-micro" title="Clear the canvas and repaint from blank">Clear</button>
            <button id="live-export" class="btn-micro" title="Export an endless p5.js sketch (zip) with these settings">Export p5</button>
          </div>
          <div class="live-row">
            <button id="live-png" class="btn-micro" title="Save the current picture as PNG">PNG</button>
            <button id="live-txt" class="btn-micro" title="Save the current ASCII frame as plain text (Render: ASCII)">TXT</button>
            <select id="live-rec-format" title="Recording format (MP4 falls back to WebM where the browser can't record MP4)">
              <option value="video">MP4</option>
              <option value="gif">GIF</option>
            </select>
            <button id="live-rec" class="btn-micro" title="Record the canvas; press again to stop and save">Rec</button>
            <button id="live-asset" class="btn-micro btn-icon-only" title="Add the painting to Assets">${icon('bookmark', 'icon-sm')}</button>
          </div>
          <label class="live-slider" title="Watercolor: each stroke is a p5.brush painting that fades in and out on its own. Layered: strokes pile up on one sheet and fade together under washes (Fade out sets how slowly). Pixel and ASCII use the options next to the Medium menu.">
            <span>Render</span>
            <span class="select-with-btn"><select id="live-render">
              <option value="flat">Flat</option>
              <option value="watercolor">Watercolor</option>
              <option value="pixel">Pixel</option>
              <option value="ascii">ASCII</option>
            </select>
            <button id="live-render-opts" class="btn-micro btn-icon-only" title="Render options">${icon('adjustments', 'icon-sm')}</button></span>
          </label>
          <label class="live-slider" title="Transparent: no ground, strokes fill the picture in. Fixed: the reference's average color, taken at Play and on every Clear. Follow: the average of each sampled frame (can shift with live sources). Drift: eases toward that average over Ground s seconds.">
            <span>Ground</span>
            <select id="live-ground">
              <option value="transparent">Transparent</option>
              <option value="fixed">Fixed</option>
              <option value="follow">Follow</option>
              <option value="drift">Drift</option>
            </select>
          </label>
          <label class="live-slider" id="ground-time-row" hidden title="Drift: seconds for the ground to ease toward the source's average color">
            <span>Ground s</span>
            <input type="range" id="live-groundtime" min="0.5" max="60" step="0.5" value="${this.live.groundTime}" />
            <input class="num-field" id="live-groundtime-num" inputmode="decimal" value="${this.live.groundTime}" title="Type any value" />
          </label>
          <label class="live-slider" title="Strokes: one shape at a time, the oldest leaves as the newest arrives. Fade: many shapes fading at once.">
            <span>Style</span>
            <select id="live-mode">
              <option value="strokes">Strokes</option>
              <option value="fade">Fade</option>
            </select>
          </label>
          <label class="live-slider" title="Shapes alive at once: more shapes, more detail. While playing, the muted number is how many are on screen now (watercolor can paint about 30 new strokes a second, so longer cycles allow more).">
            <span>Density</span>
            <input type="range" id="live-density" min="10" max="800" step="10" value="${this.live.density}" />
            <span class="num-wrap"><span class="live-count" id="live-count"></span><input class="num-field" id="live-density-num" inputmode="decimal" value="${this.live.density}" title="Type any value; the slider covers 10–800" /></span>
          </label>
          <label class="live-slider" title="Seconds for the whole painting to turn over: sets the pacing">
            <span>Cycle s</span>
            <input type="range" id="live-lifetime" min="1" max="60" step="0.5" value="${this.live.lifetime}" />
            <input class="num-field" id="live-lifetime-num" inputmode="decimal" value="${this.live.lifetime}" title="Seconds; type any value" />
          </label>
          <label class="live-slider" title="How gradually each shape appears">
            <span>Fade in</span>
            <input type="range" id="live-fadein" min="0" max="0.5" step="0.05" value="${this.live.fadeIn}" />
            <input class="num-field" id="live-fadein-num" inputmode="decimal" value="${this.live.fadeIn}" title="Type any value from 0 to 1" />
          </label>
          <label class="live-slider" title="How gradually each shape disappears">
            <span>Fade out</span>
            <input type="range" id="live-fadeout" min="0" max="0.5" step="0.05" value="${this.live.fadeOut}" />
            <input class="num-field" id="live-fadeout-num" inputmode="decimal" value="${this.live.fadeOut}" title="Type any value from 0 to 1" />
          </label>
          <label class="live-slider" title="How strong each stroke is at full life">
            <span>Opacity</span>
            <input type="range" id="live-opacity" min="0.1" max="1" step="0.05" value="${this.live.opacity}" />
            <input class="num-field" id="live-opacity-num" inputmode="decimal" value="${this.live.opacity}" title="Type any value from 0 to 1" />
          </label>
          <label class="live-slider" title="Watercolor only: 0 keeps p5.brush's pale wash color, 1 uses each stroke's fitted color (texture is kept either way)">
            <span>Pigment</span>
            <input type="range" id="live-pigment" min="0" max="1" step="0.05" value="${this.live.pigment}" />
            <input class="num-field" id="live-pigment-num" inputmode="decimal" value="${this.live.pigment}" title="Type any value from 0 to 1" />
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
        select.value = this.current?.id || '';
        return;
      }
      if (select.value === '__webcam') {
        this.selectWebcam().catch(err => {
          window.alert(`Webcam unavailable: ${err.message}`);
          select.value = '';
          this.selectBundled('');
        });
        return;
      }
      if (select.value.startsWith('upload:') && this.current?.id === select.value) return;
      this.selectBundled(select.value);
    });
    upload.addEventListener('change', () => {
      const file = upload.files?.[0];
      if (file) this.selectUpload(file);
      upload.value = '';
    });

    const liveParams = () => ({
      fit: this.fit,
      sampling: this.sourceCfg.sampling,
      interval: this.sourceCfg.interval,
      rate: this.sourceCfg.rate,
      render: this.live.render === 'watercolor' && this.getStyle?.()?.wcMode === 'layered' ? 'layered' : this.live.render,
      ground: this.live.ground,
      groundTime: this.live.groundTime,
      mode: this.live.mode,
      density: this.live.density,
      lifetime: this.live.lifetime,
      fadeIn: this.live.fadeIn,
      fadeOut: this.live.fadeOut,
      overlay: this.overlay.mode,
      refOpacity: this.overlay.opacity,
      opacity: this.live.opacity,
      pigment: this.live.pigment,
      shapes: this.live.shapes === 'mixed' ? ['rect', 'triangle', 'circle'] : [this.live.shapes]
    });
    this.liveParams = liveParams;
    // Dragging stays within the slider's range; typed values may go past it.
    const bindSlider = (id, key, { min = 0, max = Infinity } = {}) => {
      const range = container.querySelector(`#live-${id}`);
      const field = container.querySelector(`#live-${id}-num`);
      const commit = (value) => {
        this.live[key] = value;
        this.onLiveParams?.(liveParams());
      };
      range?.addEventListener('input', () => {
        field.value = range.value;
        commit(Number(range.value));
      });
      const fromField = () => {
        const v = Number(field.value);
        if (!Number.isFinite(v)) { field.value = this.live[key]; return; }
        const value = Math.min(max, Math.max(min, v));
        field.value = value;
        range.value = value; // the browser clamps the thumb to the slider's own range
        commit(value);
      };
      field?.addEventListener('change', fromField);
      field?.addEventListener('keydown', (e) => { if (e.key === 'Enter') field.blur(); });
    };
    bindSlider('density', 'density', { min: 1 });
    bindSlider('lifetime', 'lifetime', { min: 0.1 });
    bindSlider('fadein', 'fadeIn', { min: 0, max: 1 });
    bindSlider('fadeout', 'fadeOut', { min: 0, max: 1 });
    bindSlider('opacity', 'opacity', { min: 0, max: 1 });
    bindSlider('groundtime', 'groundTime', { min: 0.05 });
    const bindSource = (id, key, { min = 0, max = Infinity } = {}) => {
      const range = container.querySelector(`#src-${id}`);
      const field = container.querySelector(`#src-${id}-num`);
      const commit = (v) => {
        this.sourceCfg[key] = v;
        if (key === 'rate') this.current?.live?.setRate(v);
        this.onLiveParams?.(liveParams());
      };
      range?.addEventListener('input', () => { field.value = range.value; commit(Number(range.value)); });
      field?.addEventListener('change', () => {
        const v = Number(field.value);
        if (!Number.isFinite(v)) { field.value = this.sourceCfg[key]; return; }
        const value = Math.min(max, Math.max(min, v));
        field.value = value;
        range.value = value;
        commit(value);
      });
    };
    bindSource('interval', 'interval', { min: 0.05 });
    bindSource('rate', 'rate', { min: 0, max: 16 });
    // Timeline: scrubbing and stepping pause playback (Rate 0); ❚❚/▶ toggles it back.
    const liveSrc = () => (this.current?.live && this.current.kind !== 'webcam' ? this.current.live : null);
    const setRate = (rate) => {
      this.sourceCfg.rate = rate;
      const r = container.querySelector('#src-rate'), n = container.querySelector('#src-rate-num');
      if (r) r.value = String(Math.min(4, rate));
      if (n) n.value = String(rate);
      liveSrc()?.setRate(rate);
      this.onLiveParams?.(liveParams());
    };
    const pause = () => { if (this.sourceCfg.rate > 0) { this.lastRate = this.sourceCfg.rate; setRate(0); } };
    this.scrubbing = false;
    const scrub = container.querySelector('#src-scrub');
    scrub?.addEventListener('pointerdown', () => { this.scrubbing = true; pause(); });
    scrub?.addEventListener('pointerup', () => { this.scrubbing = false; });
    scrub?.addEventListener('input', () => { pause(); liveSrc()?.seek(Number(scrub.value) / 1000); });
    container.querySelector('#src-prev')?.addEventListener('click', () => { pause(); liveSrc()?.step(-1); });
    container.querySelector('#src-next')?.addEventListener('click', () => { pause(); liveSrc()?.step(1); });
    container.querySelector('#src-playpause')?.addEventListener('click', () => {
      if (this.sourceCfg.rate > 0) pause(); else setRate(this.lastRate || 1);
    });

    container.querySelector('#src-sampling')?.addEventListener('change', (e) => {
      this.sourceCfg.sampling = e.target.value;
      this.onLiveParams?.(liveParams());
    });
    const overlayChanged = () => {
      this.onOverlayChange?.({ ...this.overlay });
      this.onLiveParams?.(liveParams());
    };
    container.querySelector('#ref-fit')?.addEventListener('change', (e) => {
      this.fit = e.target.value;
      this.onFitChange?.(this.fit);
    });
    container.querySelector('#overlay-mode')?.addEventListener('change', (e) => {
      this.overlay.mode = e.target.value;
      overlayChanged();
    });
    const ovRange = container.querySelector('#overlay-opacity');
    const ovField = container.querySelector('#overlay-opacity-num');
    ovRange?.addEventListener('input', () => {
      this.overlay.opacity = Number(ovRange.value);
      ovField.value = ovRange.value;
      overlayChanged();
    });
    ovField?.addEventListener('change', () => {
      const v = Number(ovField.value);
      if (!Number.isFinite(v)) { ovField.value = this.overlay.opacity; return; }
      this.overlay.opacity = Math.min(1, Math.max(0, v));
      ovField.value = this.overlay.opacity;
      ovRange.value = this.overlay.opacity;
      overlayChanged();
    });
    bindSlider('pigment', 'pigment', { min: 0, max: 1 });
    container.querySelector('#live-ground')?.addEventListener('change', (e) => {
      this.live.ground = e.target.value;
      container.querySelector('#ground-time-row').hidden = e.target.value !== 'drift';
      this.onLiveParams?.(liveParams());
    });
    container.querySelector('#live-render')?.addEventListener('change', (e) => {
      this.setRender(e.target.value);
      this.onRenderChange?.(e.target.value);
      this.onLiveParams?.(liveParams());
    });
    container.querySelector('#reference-view')?.addEventListener('dblclick', () => this.onShowReference?.());
    container.querySelector('#live-render-opts')?.addEventListener('click', (e) => this.onOpenRenderOptions?.(e.currentTarget));
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
    container.querySelector('#live-clear')?.addEventListener('click', () => this.onLiveClear?.());
    container.querySelector('#live-export')?.addEventListener('click', () => this.onExportContinuous?.(liveParams()));
    container.querySelector('#live-pause')?.addEventListener('click', (e) => {
      const paused = this.onLivePause?.();
      e.currentTarget.textContent = paused ? 'Resume' : 'Pause';
    });
    container.querySelector('#live-asset')?.addEventListener('click', (e) => this.onSaveAsset?.(e.currentTarget));
    container.querySelector('#live-png')?.addEventListener('click', () => this.onLiveSave?.('png'));
    container.querySelector('#live-txt')?.addEventListener('click', () => this.onLiveSave?.('txt'));
    const recBtn = container.querySelector('#live-rec');
    recBtn?.addEventListener('click', async () => {
      const on = await this.onLiveRecord?.(container.querySelector('#live-rec-format').value);
      recBtn.textContent = on ? 'Stop' : 'Rec';
      recBtn.classList.toggle('recording', !!on);
    });

    let saved = '';
    try { saved = localStorage.getItem(STORAGE_KEY) || ''; } catch { /* storage unavailable */ }
    const initial = this.references.find(r => r.id === saved) ? saved : (this.references[0]?.id || '');
    select.value = initial;
    this.selectBundled(initial);
  }

  /** Stop and forget the current live source, if any. */
  releaseLive() {
    this.current?.live?.stop();
    cancelAnimationFrame(this.liveRaf);
    this.liveRaf = null;
  }

  /** Timeline slider, play/pause icon and position readout for video / animation sources. */
  updateTimeline(src) {
    const c = this.container;
    const pos = src.position?.();
    const row = c?.querySelector('#src-scrub-row'), out = c?.querySelector('#src-pos');
    if (row) row.hidden = !pos;
    if (out) out.hidden = !pos;
    if (!pos) return;
    const scrub = c.querySelector('#src-scrub');
    if (scrub && !this.scrubbing && document.activeElement !== scrub) scrub.value = String(Math.round(pos.fraction * 1000));
    const pp = c.querySelector('#src-playpause');
    const label = this.sourceCfg.rate > 0 ? '❚❚' : '▶';
    if (pp && pp.textContent !== label) pp.textContent = label;
    const text = pos.duration !== undefined
      ? `${pos.time.toFixed(2)} / ${pos.duration.toFixed(2)} s · ${pos.frame} / ${pos.frames}`
      : `${pos.frame + 1} / ${pos.frames}`;
    if (out && out.textContent !== text) out.textContent = text;
  }

  /** Keep a live source's frame canvas current and mirrored into the preview. */
  runLive(src) {
    let last = performance.now();
    const tick = () => {
      if (this.current?.live !== src) return;
      const now = performance.now();
      src.tick(Math.min(0.1, (now - last) / 1000));
      last = now;
      const view = this.container?.querySelector('#reference-live-view');
      if (view && src.canvas.width) {
        if (view.width !== src.canvas.width || view.height !== src.canvas.height) {
          view.width = src.canvas.width;
          view.height = src.canvas.height;
        }
        view.getContext('2d').drawImage(src.canvas, 0, 0);
      }
      this.updateTimeline(src);
      if (src.version !== this.lastSourceVersion) { this.lastSourceVersion = src.version; this.onSourceFrame?.(src); }
      this.liveRaf = requestAnimationFrame(tick);
    };
    this.liveRaf = requestAnimationFrame(tick);
  }

  async selectWebcam() {
    const src = await LiveSource.webcam();
    src.tick(0);
    this.releaseLive();
    this.setCurrent({ id: '__webcam', name: 'Webcam', image: src.canvas, live: src, kind: 'webcam', rights: 'live camera, stays in this browser' });
    this.runLive(src);
  }

  async selectBundled(id) {
    this.releaseLive();
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
    const id = `upload:${file.name}`;
    let live = null;
    if (file.type.startsWith('video/')) {
      live = await LiveSource.video(URL.createObjectURL(file));
    } else if (/^image\/(gif|webp|png|apng|avif)$/.test(file.type)) {
      live = await LiveSource.animated(file).catch(() => null); // null for stills
    }
    this.releaseLive();
    if (live) {
      live.setRate(this.sourceCfg.rate);
      live.tick(0);
      this.setCurrent({ id, name: file.name, image: live.canvas, live, kind: live.kind, file, rights: 'your upload (kept in this browser)', uploaded: true });
      this.runLive(live);
    } else {
      const url = URL.createObjectURL(file);
      const img = await loadImage(url);
      this.setCurrent({ id, name: file.name, image: img, displayUrl: url, source: null, rights: 'your upload (kept in this browser)', uploaded: true });
    }
    const select = this.container?.querySelector('#reference-select');
    if (select) {
      let opt = select.querySelector('option[data-upload]');
      if (!opt) {
        opt = document.createElement('option');
        opt.dataset.upload = '1';
        select.insertBefore(opt, select.querySelector('option[value="__webcam"]'));
      }
      opt.value = id;
      opt.textContent = `Uploaded: ${file.name}`;
      select.value = id;
    }
  }

  /** Show "visible /" before the density value while playing. */
  setLiveCount(n) {
    const el = this.container?.querySelector('#live-count');
    if (el) el.textContent = n === null ? '' : `${n} /`;
  }

  /** Follow the studio medium (the two menus are one setting). */
  setRender(id) {
    this.live.render = id;
    const sel = this.container?.querySelector('#live-render');
    if (sel) sel.value = id;
    const txt = this.container?.querySelector('#live-txt');
    if (txt) txt.disabled = id !== 'ascii';
  }

  setLiveRunning(on) {
    this.liveRunning = on;
    const btn = this.container?.querySelector('#live-toggle');
    if (btn) btn.textContent = on ? 'Stop' : 'Play';
    const pause = this.container?.querySelector('#live-pause');
    if (pause) { pause.disabled = !on; pause.textContent = 'Pause'; }
  }

  setCurrent(ref) {
    this.current = ref;
    const view = this.container?.querySelector('#reference-view');
    if (view) {
      if (!ref) {
        view.innerHTML = '<p class="reference-empty">No reference selected.</p>';
      } else {
        const src = ref.live ? '' : (ref.image instanceof HTMLCanvasElement ? ref.image.toDataURL('image/jpeg', 0.9) : ref.displayUrl);
        view.innerHTML = `
          ${ref.live ? '<canvas id="reference-live-view" class="reference-live-view"></canvas>' : `<img src="${src}" alt="${escapeHtml(ref.name)}" />`}
          <div class="reference-meta">
            <strong>${escapeHtml(ref.name)}</strong>
            <span class="reference-info" title="${escapeHtml([ref.rights, ref.crop ? 'cropped to the painted sheet' : '', ref.source ? 'Wikimedia Commons' : ''].filter(Boolean).join(' · '))}">${icon('questionMarkCircle', 'icon-xs')}</span>
            ${ref.source ? `<a href="${escapeHtml(ref.source)}" target="_blank" rel="noopener">source</a>` : ''}
          </div>`;
      }
    }
    const controls = this.container?.querySelector('#source-controls');
    if (controls) {
      controls.hidden = !ref?.live;
      const rateRow = controls.querySelector('#src-rate-row');
      if (rateRow) rateRow.hidden = ref?.kind === 'webcam';
    }
    this.onReferenceChange?.(ref);
  }
}
