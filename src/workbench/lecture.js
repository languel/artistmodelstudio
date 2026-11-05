/**
 * Lecture recording: teach inside the studio and keep the film in the studio.
 *
 * It records the stage (cropped, so the panels stay out of it; or the whole tab), your voice from the microphone, and, if you want, your
 * face as a round bubble on the stage. The bubble is a real element on the page, so the recording simply includes it: drag it where
 * you like, double-click it to make it bigger or smaller. A small bar (outside the picture, bottom left) shows the time, a level meter,
 * pause, and stop. The film is kept in Assets (Videos) and downloaded.
 *
 * It builds on the script recorder's `Capture` (getDisplayMedia, cropping, MediaRecorder) and on `inputs.js` (the shared devices).
 */
import { h, download } from './ui.js';
import { Capture } from './scriptRecorder.js';
import { inputs } from './inputs.js';

const clock = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export class Lecture {
  constructor(app) { this.app = app; this.run = null; }
  get active() { return Boolean(this.run); }

  /** options: { mic = true, camera = false, crop = true, title } */
  async start({ mic = true, camera = false, crop = true, title = '' } = {}) {
    if (this.run) { this.app.log('A lecture is already being recorded.'); return; }
    const app = this.app, held = [];
    try {
      // (the browser asks which tab to share: this needs the click that brought us here, so it goes first)
      const cap = await Capture.open({ stage: crop ? app.stageArea : null });
      let micIn = null, bubble = null, meter = null;
      try {
        if (mic) { micIn = await inputs.open('mic'); held.push(micIn); meter = inputs.level(micIn.stream); }
        if (camera) { const cam = await inputs.open('camera'); held.push(cam); bubble = this.bubble(cam.stream); }
      } catch (err) { cap.close(); held.forEach(x => x.release()); meter?.stop(); bubble?.remove(); throw err; }
      cap.start(micIn?.stream || null);
      const run = this.run = { cap, held, bubble, meter, title: title || `Lecture ${new Date().toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}`, paused: false, paused_ms: 0 };
      this.hud(run);
      // (stopping the share from the browser's own bar ends the lecture, and keeps what was recorded)
      cap.display.getVideoTracks()[0]?.addEventListener('ended', () => { if (this.run === run) this.stop(); });
      app.log('Recording the lecture. Stop it from the bar at the bottom left, or the palette.');
    } catch (err) { held.forEach(x => x.release()); this.app.log(err.message || String(err), 'error'); }
  }

  bubble(stream) {
    const video = h('video', { class: 'wb-lecture-cam', autoplay: true, muted: true, playsinline: true });
    video.srcObject = stream; video.muted = true;
    const stage = this.app.stageArea;
    const wrap = h('div', { class: 'wb-lecture-bubble', title: 'Drag to move. Double-click to resize' }, video);
    stage.append(wrap);
    let size = 1;
    wrap.addEventListener('dblclick', () => { size = size === 1 ? 1.7 : size === 1.7 ? 0.6 : 1; wrap.style.setProperty('--s', size); });
    wrap.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const r = wrap.getBoundingClientRect(), s = stage.getBoundingClientRect(), dx = e.clientX - r.left, dy = e.clientY - r.top;
      wrap.setPointerCapture(e.pointerId);
      const move = m => { wrap.style.left = `${Math.max(0, Math.min(s.width - r.width, m.clientX - s.left - dx))}px`; wrap.style.top = `${Math.max(0, Math.min(s.height - r.height, m.clientY - s.top - dy))}px`; wrap.style.right = wrap.style.bottom = 'auto'; };
      const up = () => { wrap.removeEventListener('pointermove', move); wrap.removeEventListener('pointerup', up); };
      wrap.addEventListener('pointermove', move); wrap.addEventListener('pointerup', up);
    });
    return wrap;
  }

  hud(run) {
    const bar = h('span', { class: 'wb-lecture-level' });
    const time = h('span', { class: 'wb-lecture-time' }, '0:00');
    const pause = h('button', { title: 'Pause or resume', onclick: () => this.pause() }, '⏸');
    const stop = h('button', { class: 'stop', title: 'Stop and keep the film', onclick: () => this.stop() }, '■ Stop');
    run.el = h('div', { class: 'wb-lecture-hud' }, h('span', { class: 'wb-lecture-dot' }), time, bar, pause, stop);
    document.body.append(run.el);
    run.pauseBtn = pause;
    const tick = () => {
      if (this.run !== run) return;
      time.textContent = clock(run.cap.seconds() - run.paused_ms / 1000 - (run.paused ? (performance.now() - run.pausedAt) / 1000 : 0));
      bar.style.transform = `scaleX(${Math.max(0.03, run.meter?.read() ?? 0)})`;
      requestAnimationFrame(tick);
    };
    tick();
  }

  pause() {
    const run = this.run; if (!run) return;
    const rec = run.cap.rec;
    if (!run.paused) { rec.pause(); run.paused = true; run.pausedAt = performance.now(); run.el.classList.add('paused'); run.pauseBtn.textContent = '▶'; }
    else { rec.resume(); run.paused = false; run.paused_ms += performance.now() - run.pausedAt; run.el.classList.remove('paused'); run.pauseBtn.textContent = '⏸'; }
  }

  /** Stop: the film goes to Assets (Videos) and is downloaded. → { asset, blob, ext } or null */
  async stop() {
    const run = this.run; if (!run) return null;
    this.run = null;
    const seconds = Math.round(run.cap.seconds() - run.paused_ms / 1000);
    run.meter?.stop(); run.el?.remove(); run.bubble?.remove();
    try {
      const { blob, ext } = await run.cap.finish();
      run.held.forEach(x => x.release());
      blob.kindHint = 'video';
      const asset = await this.app.assetStore.add(blob, { title: run.title, kind: 'import', folder: 'Videos', tags: ['video', 'lecture', ext], meta: { lecture: true, seconds } });
      download(blob, `${run.title.replace(/[^\w .-]+/g, '').trim() || 'lecture'}.${ext}`, blob.type);
      this.app.log(`Lecture kept: ${clock(seconds)}, ${(blob.size / 1e6).toFixed(1)} MB ${ext.toUpperCase()}. It is in Assets (Videos).`);
      return { asset: asset.id, blob, ext };
    } catch (err) { run.held.forEach(x => x.release()); this.app.log(`The lecture could not be saved: ${err.message}`, 'error'); return null; }
  }
}
