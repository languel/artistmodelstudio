/**
 * Dictation: a microphone button for any text field.
 *
 *   attachMic(field, { host, app })   → { button, stop() }     (the button goes into `host`; the words go into `field`)
 *
 * Two engines, chosen with a right-click on the button (the choice is kept):
 *   browser  the browser's own speech recognition (Chrome, Edge, Safari): words appear as you speak. Chrome sends the audio to its
 *            speech service; Safari may do it on the device.
 *   local    Whisper (a small model, about 40 MB, runs here in a worker, nothing leaves the machine). You record, and the words appear
 *            when you stop. After the first download the browser keeps the model.
 * The microphone comes from `inputs.js` (shared, and let go the moment dictation ends).
 */
import { h } from './ui.js';
import { showMenu } from './menu.js';
import { inputs } from './inputs.js';

const MODEL = 'onnx-community/whisper-tiny.en';
const MIC = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21"/></svg>';
const STOP = '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2.5"/></svg>';
const Recognition = () => window.SpeechRecognition || window.webkitSpeechRecognition;
const get = k => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

export const engines = () => [
  ...(Recognition() ? [{ id: 'browser', name: 'Browser speech', hint: 'Words appear as you speak. Chrome sends the audio to its speech service.' }] : []),
  { id: 'local', name: 'Whisper, on this machine', hint: 'Private: runs here. About 40 MB the first time; words appear when you stop.' }
];
export const engine = () => { const e = engines(), want = get('ams_voice_engine'); return (e.find(x => x.id === want) || e[0]).id; };

// ---- Whisper in a worker (one for the page) ----------------------------------------------------------------------------
let worker = null, nextId = 1, loading = null;
const pending = new Map();
function call(msg, onProgress) {
  if (!worker) {
    worker = new Worker(new URL('./whisperWorker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const p = pending.get(data.requestId); if (!p) return;
      if (data.type === 'progress') { p.progress?.(data.progress); return; }
      pending.delete(data.requestId);
      if (data.type === 'reject') p.reject(new Error(data.error)); else p.resolve(data);
    };
    worker.onerror = e => { for (const p of pending.values()) p.reject(new Error(e.message || 'The speech model failed.')); pending.clear(); worker?.terminate(); worker = null; loading = null; };
  }
  return new Promise((resolve, reject) => { const requestId = nextId++; pending.set(requestId, { resolve, reject, progress: onProgress }); worker.postMessage({ ...msg, requestId }); });
}
const loadWhisper = onProgress => (loading ||= call({ type: 'load', model: MODEL }, onProgress).catch(err => { loading = null; throw err; }));

/** A recorded blob → 16 kHz mono samples */
export async function toSamples(blob) {
  const AC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const buf = await new AC(1, 16000, 16000).decodeAudioData(await blob.arrayBuffer());
  const n = Math.ceil(buf.duration * 16000), off = new AC(1, n, 16000), src = off.createBufferSource();
  src.buffer = buf; src.connect(off.destination); src.start();
  return (await off.startRendering()).getChannelData(0);
}
export async function transcribe(blob, onProgress) {
  await loadWhisper(onProgress);
  const samples = await toSamples(blob);
  if (samples.length < 16000 * 0.3) return '';
  let sq = 0; for (let i = 0; i < samples.length; i += 8) sq += samples[i] * samples[i];
  if (Math.sqrt(sq / (samples.length / 8)) < 0.004) return '';   // (silence: Whisper would make words up)
  const text = (await call({ type: 'transcribe', samples }, null)).text;
  return /^[\[(].*[\])]$/.test(text.trim()) ? '' : text;   // ([BLANK_AUDIO], (music)…)
}

// ---- putting words in a field ----------------------------------------------------------------------------------------------
/** Insert at the caret (replacing a selection), with a space where words would run together. */
function insert(field, text) {
  text = text.trim(); if (!text) return;
  const v = field.value, a = field.selectionStart ?? v.length, b = field.selectionEnd ?? v.length;
  const pre = v.slice(0, a), post = v.slice(b);
  const lead = pre && !/\s$/.test(pre) ? ' ' : '', tail = post && !/^\s/.test(post) ? ' ' : '';
  field.value = pre + lead + text + tail + post;
  const at = (pre + lead + text).length;
  field.setSelectionRange(at, at);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/** A mic button for `field`, placed in `host`. */
export function attachMic(field, { host, onState = () => {}, title = 'Dictate (click to start, click to stop). Right-click for the engine and the microphone' } = {}) {
  const button = h('button', { class: 'wb-mic', type: 'button', title, html: MIC, 'aria-pressed': 'false' });
  host?.append(button);
  const bar = h('span', { class: 'wb-mic-level' });
  button.append(bar);
  let state = 'idle', stop = null;   // idle | listening | working
  const paint = (s, note = '') => {
    state = s;
    button.classList.toggle('on', s === 'listening'); button.classList.toggle('busy', s === 'working');
    button.setAttribute('aria-pressed', String(s === 'listening'));
    button.innerHTML = s === 'listening' ? STOP : MIC; button.append(bar);
    button.title = s === 'listening' ? 'Stop' : s === 'working' ? note || 'Working…' : title;
    if (s !== 'listening') bar.style.transform = 'scaleY(0)';
    onState(s, note);
  };
  const fail = err => { paint('idle'); button.classList.add('error'); button.title = err.message || String(err); setTimeout(() => { button.classList.remove('error'); if (state === 'idle') button.title = title; }, 6000); };

  async function startBrowser() {
    const R = new (Recognition())();
    R.continuous = true; R.interimResults = true; R.lang = navigator.language || 'en-US';
    let anchor = [field.selectionStart ?? field.value.length, field.selectionEnd ?? field.value.length], interim = '', base = field.value, died = null;
    const show = text => {
      const [a, b] = anchor, pre = base.slice(0, a), post = base.slice(b);
      const lead = pre && !/\s$/.test(pre) ? ' ' : '';
      field.value = pre + (text ? lead + text : '') + post;
      const at = (pre + (text ? lead + text : '')).length; field.setSelectionRange(at, at);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    };
    let finals = '';
    R.onresult = e => { interim = ''; for (let i = e.resultIndex; i < e.results.length; i++) { const t = e.results[i][0].transcript; if (e.results[i].isFinal) finals += t; else interim += t; } show((finals + interim).trim()); };
    R.onerror = e => { if (e.error !== 'no-speech' && e.error !== 'aborted') died = new Error(e.error === 'not-allowed' ? 'The microphone is blocked. Allow it in the address bar.' : `Speech recognition: ${e.error}`); };
    // (the level meter, from the shared microphone: the recogniser opens its own, this one only draws)
    let mic = null, meter = null, raf = 0;
    try { mic = await inputs.open('mic'); meter = inputs.level(mic.stream); const tick = () => { bar.style.transform = `scaleY(${Math.max(0.08, meter.read())})`; raf = requestAnimationFrame(tick); }; tick(); } catch { /* the recogniser asks by itself */ }
    const ended = new Promise(r => { R.onend = r; });
    R.start(); paint('listening');
    stop = async () => { R.stop(); await ended; cancelAnimationFrame(raf); meter?.stop(); mic?.release(); stop = null; died ? fail(died) : paint('idle'); };
    ended.then(() => { if (stop) stop(); });
  }

  async function startLocal() {
    const mic = await inputs.open('mic');
    const rec = new MediaRecorder(mic.stream), chunks = [], meter = inputs.level(mic.stream);
    let raf = 0; const tick = () => { bar.style.transform = `scaleY(${Math.max(0.08, meter.read())})`; raf = requestAnimationFrame(tick); }; tick();
    rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const done = new Promise(r => { rec.onstop = r; });
    rec.start(); paint('listening');
    // (start loading the model while they speak)
    loadWhisper(p => { if (state === 'listening') button.title = `Stop (speech model ${Math.round(p)}%)`; }).catch(() => {});
    stop = async () => {
      rec.stop(); await done; cancelAnimationFrame(raf); meter.stop(); mic.release(); stop = null;
      paint('working', 'Turning speech into words…');
      try { insert(field, await transcribe(new Blob(chunks, { type: rec.mimeType }), p => paint('working', `Loading the speech model… ${Math.round(p)}%`))); paint('idle'); }
      catch (err) { fail(err); }
    };
  }

  async function toggle() {
    if (state === 'working') return;
    if (state === 'listening') { await stop?.(); field.focus(); return; }
    try { paint('working', 'Opening the microphone…'); await (engine() === 'browser' ? startBrowser() : startLocal()); }
    catch (err) { fail(err); }
  }
  button.addEventListener('mousedown', e => e.preventDefault());   // (the field keeps its caret)
  button.addEventListener('click', toggle);
  button.addEventListener('contextmenu', async e => {
    e.preventDefault();
    const mics = await inputs.devices('audioinput').catch(() => []), cur = engine(), curMic = inputs.preferred('mic');
    showMenu([
      ...engines().map(x => ({ label: `${x.id === cur ? '✓ ' : ''}${x.name}`, hint: x.hint, run: () => set('ams_voice_engine', x.id) })),
      ...(mics.length ? ['-', ...mics.map(m => ({ label: `${(curMic ? m.id === curMic : m === mics[0]) ? '✓ ' : ''}${m.label}`, run: () => inputs.prefer('mic', m.id) }))] : [])
    ], e.clientX, e.clientY);
  });
  return { button, toggle, get active() { return state === 'listening'; }, stop: async () => { if (state === 'listening') await stop?.(); } };
}
