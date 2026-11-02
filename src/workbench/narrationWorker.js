/**
 * Kokoro (82M, ONNX, in the browser) in a worker: load once, then turn text into samples. After underscores' ttsWorker.
 * The small q8 model on wasm: about 90 MB the first time (the browser keeps it), and fast enough to prepare a script's lines before it plays.
 */
let engine = null;

// A line may say how a word is pronounced: `[Reiniger](/ɹˈaɪnɪɡɚ/)`. The words around it are phonemized as usual, and the marked word's sounds go in as they are.
const MARK = /(\[[^\]]+\]\(\/[^/]+\/\))/;
const post = e => e.replace(/kəkˈoːɹoʊ/g, 'kˈoʊkəɹoʊ').replace(/kəkˈɔːɹəʊ/g, 'kˈəʊkəɹəʊ').replace(/ʲ/g, 'j').replace(/r/g, 'ɹ').replace(/x/g, 'k').replace(/ɬ/g, 'l')
  .replace(/(?<=[a-zɹː])(?=hˈʌndɹɪd)/g, ' ').replace(/ z(?=[;:,.!?¡¿—…"«»“” ]|$)/g, 'z').replace(/(?<=nˈaɪn)ti(?!ː)/g, 'di');
async function generateMarked(text, options) {
  const { phonemize } = await import('phonemizer');
  const bits = [];
  for (const part of text.split(MARK)) {
    const m = /^\[([^\]]+)\]\(\/([^/]+)\/\)$/.exec(part);
    if (m) bits.push(m[2]);
    else if (part.trim()) bits.push(post((await phonemize(part, 'en-us')).join(' ')));
  }
  const { input_ids } = engine.tokenizer(bits.join(' '), { truncation: true });
  return engine.generate_from_ids(input_ids, options);
}

const voiceList = voices => Object.entries(voices || {}).map(([id, v]) => ({ id, label: `${v?.name || id}${v?.language ? ` · ${String(v.language).toUpperCase()}` : ''}`, language: v?.language || 'en-us', gender: v?.gender || '' }));
const percent = p => (typeof p === 'number' ? p : Number(p?.progress ?? (p?.loaded != null && p?.total ? (p.loaded / p.total) * 100 : 0)));

self.onmessage = async ({ data }) => {
  const { type, requestId } = data;
  try {
    if (type === 'load') {
      if (!engine) {
        const { KokoroTTS } = await import('kokoro-js');
        engine = await KokoroTTS.from_pretrained(data.model, { dtype: 'q8', device: 'wasm', progress_callback: p => postMessage({ type: 'progress', requestId, progress: percent(p) }) });
      }
      postMessage({ type: 'resolve', requestId, voices: voiceList(engine.voices) });
      return;
    }
    if (type === 'generate') {
      if (!engine) throw new Error('The voice is not loaded.');
      const audio = MARK.test(data.text) ? await generateMarked(data.text, data.options || {}) : await engine.generate(data.text, data.options || {});
      const samples = audio.audio instanceof Float32Array ? audio.audio : Float32Array.from(audio.audio || []);
      postMessage({ type: 'resolve', requestId, audio: samples, samplingRate: audio.sampling_rate || 24000 }, [samples.buffer]);
    }
  } catch (error) {
    postMessage({ type: 'reject', requestId, error: error?.message || String(error) });
  }
};
