/**
 * Recording a script as a movie: the tab (cropped to the stage, so the panels stay out of it) plus the narration, as one file, and the
 * subtitles as WebVTT. The picture is what the studio shows, so the cursor, keys and subtitles of a script are in it as they are on screen.
 * It runs in real time, so a script takes as long to record as to play.
 */
const pad = (n, w = 2) => String(Math.floor(n)).padStart(w, '0');
export const vttTime = sec => { const ms = Math.round(sec * 1000); return `${pad(ms / 3600000)}:${pad((ms % 3600000) / 60000)}:${pad((ms % 60000) / 1000)}.${pad(ms % 1000, 3)}`; };

/** WebVTT from [{ start, end, text }] (seconds). */
export function toVtt(entries) {
  const body = entries.filter(e => e.text && e.end > e.start).map((e, i) => `${i + 1}\n${vttTime(e.start)} --> ${vttTime(e.end)}\n${e.text}\n`).join('\n');
  return `WEBVTT\n\n${body}`;
}

const TYPES = {
  mp4: ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4'],
  webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
};
export function pickType(format = 'auto') {
  const ok = t => window.MediaRecorder?.isTypeSupported?.(t);
  const order = format === 'mp4' ? [...TYPES.mp4, ...TYPES.webm] : format === 'webm' ? [...TYPES.webm, ...TYPES.mp4] : [...TYPES.mp4, ...TYPES.webm];
  return order.find(ok) || '';
}

export class Capture {
  constructor(display, region) { this.display = display; this.region = region; this.chunks = []; this.rec = null; }

  static supported() { return Boolean(navigator.mediaDevices?.getDisplayMedia && window.MediaRecorder); }

  /**
   * Ask for this tab (the browser asks the person; this needs a click just before). `stage`: an element to crop to, when the
   * browser can (Chrome); `region` is then its rectangle, for placing the subtitles.
   */
  static async open({ stage = null } = {}) {
    if (!Capture.supported()) throw new Error('This browser cannot record the screen. Use Chrome or Edge.');
    const display = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false, preferCurrentTab: true, selfBrowserSurface: 'include', surfaceSwitching: 'exclude', systemAudio: 'exclude' });
    let region = null;
    const track = display.getVideoTracks()[0];
    try {
      if (stage && window.CropTarget && track?.cropTo) { await track.cropTo(await CropTarget.fromElement(stage)); const r = stage.getBoundingClientRect(); region = { left: r.left, top: r.top, width: r.width, height: r.height }; }
    } catch { /* the whole tab is recorded */ }
    return new Capture(display, region);
  }

  /** Start recording; `audio` is a MediaStream (the narration) or null. */
  start(audio, format = 'auto') {
    const mime = pickType(format);
    const tracks = [...this.display.getVideoTracks(), ...(audio?.getAudioTracks() || [])];
    this.rec = new MediaRecorder(new MediaStream(tracks), { ...(mime ? { mimeType: mime } : {}), videoBitsPerSecond: 8_000_000, audioBitsPerSecond: 160_000 });
    this.mime = (this.rec.mimeType || mime || 'video/webm').split(';')[0];
    this.rec.ondataavailable = e => { if (e.data.size) this.chunks.push(e.data); };
    this.stopped = new Promise(r => { this.rec.onstop = r; });
    this.rec.start(500);
    this.t0 = performance.now();
  }

  seconds() { return (performance.now() - this.t0) / 1000; }

  /** Stop and give the movie: { blob, ext }. */
  async finish() {
    if (this.rec && this.rec.state !== 'inactive') this.rec.stop();
    await this.stopped;
    this.close();
    return { blob: new Blob(this.chunks, { type: this.mime }), ext: this.mime.includes('mp4') ? 'mp4' : 'webm' };
  }

  /** Let go of the screen without a movie. */
  close() { for (const t of this.display.getTracks()) t.stop(); }
}
