/**
 * LFM3-Omni in this browser (WebGPU): one small model for text, tool calls, listening and speaking.
 *
 * The runtime is Liquid AI's own WebGPU library (from their public demo Space, loaded from there at run time,
 * not copied into this repository: its licence is not stated, so check it before vendoring); the weights come from Hugging Face
 * (LiquidAI/LFM3-Omni-2B-GGUF, licence: LFM Open License v1.0) and are kept by the browser after the first download.
 *
 *   complete({ system, user, … })        text in, text out (what the quick field and the chat use today)
 *   chat({ messages, tools, signal })    native tool calls: tools are { name, description, parameters, execute(args) }
 *   speak(text, { language, gender })    → { samples (Float32, mono), rate (24000) }
 *   transcribe(samples16k, { language }) → text
 *
 * Recommended sampling (the model card): text is greedy; speech uses audio_temperature 0.4 and audio_repetition_penalty 1.2.
 */
import { Artist } from './Artist.js';

// (the Space's own static host: the huggingface.co file URLs are served as text/plain, which a browser will not run as a module. This follows the Space's latest version, not a pinned commit.)
const LIB_URL = 'https://liquidai-lfm3-omni-2b-webgpu.static.hf.space/Lfm3OmniForConditionalGeneration.js';
export const LFM3_MODEL = 'LiquidAI/LFM3-Omni-2B-GGUF';

let libPromise = null;
const library = () => (libPromise ||= import(/* @vite-ignore */ LIB_URL).then(m => m.default || m.Lfm3OmniForConditionalGeneration).catch(err => { libPromise = null; throw new Error(`Could not load the LFM3 runtime (${err.message})`); }));
const status = text => { try { window.dispatchEvent(new CustomEvent('ams-engine-status', { detail: text })); } catch { /* no window */ } };
const mb = n => (n >= 1e9 ? `${(n / 1e9).toFixed(2)} GB` : `${Math.round(n / 1e6)} MB`);

/** Text of a message whose content may be a string or parts. */
export const textOf = msg => (typeof msg?.content === 'string' ? msg.content : Array.isArray(msg?.content) ? msg.content.filter(p => p.type === 'text').map(p => p.text).join('') : '');

export class Lfm3WebGPUArtist extends Artist {
  constructor() {
    super('lfm3', 'LFM3-Omni (this browser)', 'webgpu');
    this.model = (typeof localStorage !== 'undefined' && localStorage.getItem('ams_lfm3_model')) || LFM3_MODEL;
    this.loaded = null;     // Promise of { Lib, model }
    this.progress = null;   // { text, fraction }
    this.queue = Promise.resolve();   // one generation at a time (a session is one conversation)
  }

  static supported() { return typeof navigator !== 'undefined' && Boolean(navigator.gpu); }

  getModel() { return this.model; }
  setModel(id) { this.model = id || LFM3_MODEL; this.loaded = null; }
  getAvailableModels() { return [{ id: LFM3_MODEL, name: 'LFM3-Omni 2B (GGUF, text, tools, speech)' }]; }
  /** What the maker recommends (the model card); the settings show these as the model's own. */
  async recommended() { return { temperature: 0, audio_temperature: 0.4, audio_repetition_penalty: 1.2 }; }

  /** Check the GPU, load the runtime and the weights (once). onProgress(text, fraction). */
  ensureLoaded(onProgress = () => {}) {
    if (!this.loaded) {
      this.loaded = (async () => {
        if (!Lfm3WebGPUArtist.supported()) throw new Error('This browser has no WebGPU. Use Chrome or Edge, or another engine.');
        status('Loading the LFM3 runtime…');
        const Lib = await library();
        const ok = await Lib.checkAvailability(this.model, {});
        if (!ok.ok) throw new Error(ok.reason || 'This GPU cannot run the model.');
        const report = p => {
          const text = p.kind === 'bytes' && p.total > 0 ? `Downloading the model: ${mb(p.loaded)} of ${mb(p.total)}` : p.status === 'ready' ? 'Model ready' : `${p.message || p.status || 'Preparing'}${p.fraction != null ? ` ${Math.round(p.fraction * 100)}%` : ''}`;
          this.progress = { text, fraction: p.kind === 'bytes' && p.total > 0 ? p.loaded / p.total : p.fraction ?? null };
          status(text); onProgress(text, this.progress.fraction);
        };
        const model = await Lib.from_pretrained(this.model, { onProgress: report });
        this.deviceInfo = model.deviceInfo?.();
        this.rate = model.audio_sampling_rate || 24000;
        this.progress = { text: 'Ready', fraction: 1 };
        status('LFM3 ready');
        return { Lib, model, session: model.create_session() };   // (generate() is on the session, which keeps the cache of what it has read)
      })().catch(err => { this.loaded = null; throw err; });
    }
    return this.loaded;
  }

  get ready() { return this.progress?.text === 'Ready'; }

  /** Serialize generations. */
  async #run(fn) {
    const turn = this.queue.then(fn, fn);
    this.queue = turn.catch(() => {});
    return turn;
  }

  /** One text completion: { system, user, temperature?, signal, maxTokens } → text. (json is a request only: the model is asked, not forced.) */
  async complete({ system, user, temperature = null, signal, json = false, maxTokens = 1200 } = {}) {
    const { session: model } = await this.ensureLoaded();
    return this.#run(async () => {
      const messages = [...(system ? [{ role: 'system', content: `${system}${json ? '\nReply with one JSON object and nothing else.' : ''}` }] : []), { role: 'user', content: typeof user === 'string' ? user : String(user ?? '') }];
      const g = model.generate(messages, { signal, max_new_tokens: maxTokens, generation_mode: 'text' });   // (always greedy: the runtime refuses do_sample, because the speech decoder shares the sampling settings; a temperature passed in is ignored)
      for await (const _ of g) { /* drained: the result carries it all */ }
      const res = await g.result;
      return textOf(res.message).replace(/^<think>\s*<\/think>\s*/, '').trim();
    });
  }

  /**
   * Native tool calling. tools: [{ name, description, parameters (JSON schema), execute(args) → string | object }].
   * Runs rounds until the model stops calling tools. → { text, calls: [{ name, args, result, error? }], rounds, finish }
   */
  async chat({ messages, tools = [], signal, maxRounds = 4, maxTokens = 800, onCall = null } = {}) {
    const { session: model } = await this.ensureLoaded();
    return this.#run(async () => {
      const specs = tools.map(t => ({ type: 'function', function: { name: t.name, ...(t.description ? { description: t.description } : {}), parameters: t.parameters || { type: 'object', properties: {} } } }));
      const byName = new Map(tools.map(t => [t.name, t]));
      const convo = [...messages], calls = [];
      let text = '', finish = 'stop', round = 0;
      for (; round < maxRounds; round++) {
        const g = model.generate(convo, { signal, max_new_tokens: maxTokens, generation_mode: 'text', ...(specs.length ? { tools: specs } : {}) });
        for await (const _ of g) { /* drained */ }
        const res = await g.result;
        finish = res.finish_reason;
        convo.push(res.message); text = textOf(res.message) || text;
        if (res.finish_reason !== 'tool_calls') break;
        for (const call of res.message.tool_calls || []) {
          const name = call.function?.name, tool = byName.get(name);
          let out, error = null;
          if (call.errors?.length) error = call.errors.join('; ');
          else if (!tool) error = `No tool named "${name}" was offered.`;
          else { try { out = await tool.execute(call.function.arguments || {}); } catch (err) { error = err.message || String(err); } }
          const rec = { name, args: call.function?.arguments, ...(error ? { error } : { result: out }) };
          calls.push(rec); onCall?.(rec);
          convo.push({ role: 'tool', tool_call_id: call.id, name, content: error ? `Error: ${error}` : typeof out === 'string' ? out : JSON.stringify(out ?? { ok: true }) });
        }
      }
      return { text: text.replace(/^<think>\s*<\/think>\s*/, '').trim(), calls, rounds: round + 1, finish };
    });
  }

  /** Speech from text: { samples: Float32Array (mono), rate }. language: an English name ("American English", "British English", "French"…). */
  async speak(text, { language = 'American English', gender = 'female', signal } = {}) {
    const { session: model } = await this.ensureLoaded();
    return this.#run(async () => {
      const messages = [{ role: 'system', content: `Perform TTS in ${language} using a ${gender} voice.` }, { role: 'user', content: String(text) }];
      const g = model.generate(messages, { signal, generation_mode: 'audio', max_new_tokens: 2000, audio_temperature: 0.4, audio_repetition_penalty: 1.2 });
      for await (const _ of g) { /* drained */ }
      const res = await g.result;
      const part = Array.isArray(res.message.content) ? res.message.content.find(p => p.type === 'audio_out') : null;
      if (!part?.audio?.length) throw new Error('The model made no speech for that text.');
      return { samples: part.audio instanceof Float32Array ? part.audio : Float32Array.from(part.audio), rate: this.rate || 24000 };
    });
  }

  /** Words from speech: samples are 16 kHz mono floats. */
  async transcribe(samples, { language = 'English', signal } = {}) {
    const { session: model } = await this.ensureLoaded();
    return this.#run(async () => {
      const messages = [{ role: 'system', content: `Perform ASR in ${language}.` }, { role: 'user', content: [{ type: 'audio', audio: samples }] }];
      const g = model.generate(messages, { signal, generation_mode: 'text', max_new_tokens: 600 });
      for await (const _ of g) { /* drained */ }
      return textOf((await g.result).message).replace(/^<think>\s*<\/think>\s*/, '').trim();
    });
  }
}
