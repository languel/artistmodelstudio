/**
 * Whisper (a small speech-to-text model, ONNX, in the browser) in a worker: load once, then turn 16 kHz samples into words.
 * The same pattern as narrationWorker.js: the model comes from Hugging Face the first time and the browser keeps it.
 */
let asr = null;
const percent = p => (typeof p === 'number' ? p : Number(p?.progress ?? 0));

self.onmessage = async ({ data }) => {
  const { type, requestId } = data;
  try {
    if (type === 'load') {
      if (!asr) {
        const { pipeline } = await import('@huggingface/transformers');
        asr = await pipeline('automatic-speech-recognition', data.model, { dtype: 'q8', device: 'wasm', progress_callback: p => { if (p?.status === 'progress' || p?.progress != null) postMessage({ type: 'progress', requestId, progress: percent(p) }); } });
      }
      postMessage({ type: 'resolve', requestId });
      return;
    }
    if (type === 'transcribe') {
      if (!asr) throw new Error('The speech model is not loaded.');
      const out = await asr(data.samples, { chunk_length_s: 30, stride_length_s: 5, ...(data.language ? { language: data.language, task: 'transcribe' } : {}) });
      postMessage({ type: 'resolve', requestId, text: String(out?.text || '').trim() });
    }
  } catch (err) {
    postMessage({ type: 'reject', requestId, error: err?.message || String(err) });
  }
};
