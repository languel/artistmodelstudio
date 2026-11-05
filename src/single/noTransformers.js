// The single-file build leaves out in-browser models (WebGPU): use a served build, a local server
// (Ollama), OpenRouter, or an agent instead.
const unavailable = () => { throw new Error('In-browser models are not in the single-file build: use the served app, Ollama, OpenRouter or an agent.'); };
export const pipeline = unavailable, AutoProcessor = { from_pretrained: unavailable }, AutoModelForImageTextToText = { from_pretrained: unavailable }, RawImage = { fromURL: unavailable }, env = {};
// kokoro-js imports these even when narration is never activated. Keep the
// stripped build linkable while rejecting model use explicitly at runtime.
export const StyleTextToSpeech2Model = { from_pretrained: unavailable }, AutoTokenizer = { from_pretrained: unavailable };
export class Tensor { constructor() { unavailable(); } }
export class RawAudio { constructor() { unavailable(); } static read() { unavailable(); } }
