/**
 * Speaking: the studio's voice, made by LFM3-Omni in this browser (WebGPU).
 *
 * Settings (kept in the browser): speak replies (the Assistant says its answer as well as writing it), the language and the voice.
 * The model has 19 speech languages, each with a female and a male voice; American English / female is the default.
 * Narration (the timeline, scripts) uses the same voice when its engine is LFM3.
 *
 *   app.speaker.say(text)   speak it (what was being said stops)
 *   app.speaker.stop()
 *
 * Nothing is fetched behind your back: if the model has never been loaded here, speaking says so instead of starting a 1.6 GB download.
 */
export const LANGUAGES = ['American English', 'British English', 'Arabic', 'Chinese', 'Danish', 'Dutch', 'Finnish', 'French', 'German', 'Greek', 'Hebrew', 'Italian', 'Japanese', 'Korean', 'Polish', 'Portuguese', 'Spanish', 'Swedish', 'Turkish'];
export const GENDERS = [['female', 'Female'], ['male', 'Male']];
const KEY = 'ams_voice_out';
const DEFAULTS = { speak: false, language: 'American English', gender: 'female' };

export const voiceSettings = () => { try { return { ...DEFAULTS, ...(JSON.parse(localStorage.getItem(KEY) || '{}') || {}) }; } catch { return { ...DEFAULTS }; } };
export function setVoice(patch) {
  const next = { ...voiceSettings(), ...patch };
  if (!LANGUAGES.includes(next.language)) next.language = DEFAULTS.language;
  if (!['female', 'male'].includes(next.gender)) next.gender = DEFAULTS.gender;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* private mode */ }
  try { window.dispatchEvent(new CustomEvent('ams-voice')); } catch { /* no window */ }
  return next;
}

/** What is worth saying aloud: the words, without markdown, code, JSON, ids or file paths; the first few sentences. */
export function speakable(text, max = 420) {
  let t = String(text || '')
    .replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, ' ')
    .replace(/\bel_[a-z0-9]+\b/gi, ' ').replace(/[*_#>~|]+/g, ' ')
    .replace(/\s+/g, ' ').trim();
  if (/^[{[]/.test(t)) return '';   // (a reply that is still JSON is not for speaking)
  if (t.length > max) { const cut = t.slice(0, max), at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! ')); t = at > 80 ? cut.slice(0, at + 1) : `${cut.slice(0, cut.lastIndexOf(' '))}.`; }
  return /[\p{L}\p{N}]/u.test(t) ? t : '';
}

export class Speaker {
  constructor(app) {
    this.app = app; this.seq = 0; this.ctx = null; this.src = null; this.speaking = false;
    window.addEventListener('ams-speak-stop', () => this.stop());   // (dictation starts: stop talking over it)
  }

  get available() { const a = this.app.artists.get('lfm3'); return Boolean(a && (a.ready || localStorage.getItem('ams_lfm3_loaded') === '1')); }

  async say(text, { language, gender } = {}) {
    const plain = speakable(text);
    if (!plain) return false;
    const art = this.app.artists.get('lfm3');
    if (!this.available) { this.app.log('To speak, the LFM3-Omni model has to be loaded once: Settings › Model › LFM3-Omni › Download.'); return false; }
    this.stop();
    const id = ++this.seq, v = voiceSettings();
    this.mark(true);
    try {
      const { samples, rate } = await art.speak(plain, { language: language || v.language, gender: gender || v.gender });
      if (id !== this.seq) return false;   // (something newer was asked for, or it was stopped)
      this.ctx ||= new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
      const buf = this.ctx.createBuffer(1, samples.length, rate); buf.copyToChannel(samples, 0);
      const src = this.ctx.createBufferSource(); src.buffer = buf; src.connect(this.ctx.destination);
      this.src = src;
      await new Promise(res => { src.onended = res; src.start(); });
      return id === this.seq;
    } catch (err) { this.app.log(`Speaking: ${err.message}`, 'error'); return false; }
    finally { if (id === this.seq) { this.src = null; this.mark(false); } }
  }

  stop() { this.seq++; try { this.src?.stop(); } catch { /* already over */ } this.src = null; this.mark(false); }
  mark(on) { if (this.speaking !== on) { this.speaking = on; try { window.dispatchEvent(new CustomEvent('ams-speaking', { detail: on })); } catch { /* no window */ } } }
}
