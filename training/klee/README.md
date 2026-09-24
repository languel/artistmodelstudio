# Klee distillation: teaching a small model to paint from text

This folder trains small language models to write AMS drawing programs in a Paul Klee–like style from a text prompt. No painting is written by hand: the **Reference Fitter** turns public-domain Klee paintings into short programs, a local vision model captions each painting, and a small model is fine-tuned (LoRA) to map caption → program.

```
Commons (PD Klee, 1912–1930) ─► fetch_corpus.py ─► images/ + manifest.json
                                     │
                    caption.py (gemma4 via Ollama) ─► captions.json
                                     │
     distill.html (Reference Fitter, 4 seeds × 12/24/48 shapes) ─► data/fits.jsonl
                                     │
                          build_sft.py ─► data/sft/{train,valid}.jsonl, data/eval_prompts.jsonl
                                     │
                     train.sh (mlx-lm LoRA) ─► runs/<run>/adapter
                                     │
   generate_eval.py ─► runs/eval/<name>.jsonl ─► eval.html ─► reports/<tag>.json + sheet
                                     │
                     serve.sh ─► AMS engine "Distilled Klee (local MLX)"
```

## Rights

Every image is public domain in the US and in life+70/80 countries: Klee died in 1940 and every work is dated 1912–1930. `fetch_corpus.py` keeps only files that Commons marks "Public domain" with a PD-Art or PD-scan tag, and drops visitor photos ("Own work"), book scans and near-greyscale images. `manifest.json` records per image the Commons page, upstream museum URL, licence tags, and a SHA-256 of the local file. Images themselves are git-ignored (`images/`); re-run the fetcher to restore them.

Captions are machine-written by `gemma4:12b-mlx` and **not yet reviewed** (`captions.json` marks each one `reviewed: false`). Current use is internal research; re-check `manifest.json` before publishing any image or derived output.

## Splits

Whole artworks are assigned to `train` or `test` (≈15%, deterministic hash of the id). Near-duplicate photos of one artwork are grouped (`group` in the manifest) so a painting never appears on both sides. Validation (≈8% of training groups) is used only for the loss curve. The 52 test artworks are never seen in training and are what `eval.html` scores.

## Reproduce

```bash
uv venv training/.venv --python 3.12 && uv pip install --python training/.venv/bin/python mlx-lm pillow numpy
training/.venv/bin/python training/klee/fetch_corpus.py      # ~5 min, polite to Wikimedia
training/.venv/bin/python training/klee/clean_manifest.py    # titles + duplicate groups
training/.venv/bin/python training/klee/caption.py           # needs Ollama with gemma4:12b-mlx
npx vite --port 3017                                         # then open:
#   http://localhost:3017/distill.html?seeds=4&save=1        (writes data/fits.jsonl, ~2.5 min)
(cd training/klee && ../.venv/bin/python build_sft.py)
training/klee/train.sh mlx-community/LFM2.5-350M-bf16 lfm25-350m 1200
training/klee/train.sh Qwen/Qwen3-0.6B qwen3-0.6b 1200 --batch-size 2 --grad-accumulation-steps 2
(cd training/klee && ../.venv/bin/python generate_eval.py --model Qwen/Qwen3-0.6B --adapter runs/qwen3-0.6b/adapter --name qwen3-lora)
#   http://localhost:3017/eval.html?models=qwen3-base,qwen3-lora,...&save=1&tag=eval-v1
```

## Using a trained model in AMS

```bash
training/klee/serve.sh qwen3-0.6b Qwen/Qwen3-0.6B 8090
```

Then choose the **Distilled Klee (local MLX)** engine; the model menu is the shape budget (12/24/48). The endpoint defaults to `http://localhost:8090/v1` (override with `localStorage.ams_distilled_endpoint`). Prompts should describe subject, layout and palette, like the captions it was trained on.

## Results: eval-v1 (24 September 2026)

52 held-out artworks × budgets 12/24/48 × 2 samples. Full numbers are in `reports/eval-v1.json`, and the visual comparison is `reports/eval-v1-sheet.png`. Metrics are medians over usable outputs. Lower is better, except usable and top-5.

| system (text prompt only unless noted) | usable | pixel RMSE | layout RMSE | palette dist | true-painting rank (of 52) | top-5 |
| --- | --- | --- | --- | --- | --- | --- |
| oracle: fitter sees the painting | 1.00 | 21.8 | 6.9 | 0.25 | 1 | 0.99 |
| **LFM2.5-350M + LoRA** | 0.99 | 64.8 | 50.2 | 0.82 | 22 | 0.14 |
| **Qwen3-0.6B + LoRA** | 1.00 | 60.1 | 47.4 | 0.82 | 21 | 0.15 |
| gemma4-12B, prompted only (budget 24) | 0.58 | 89.5 | 76.7 | 0.86 | 20 | 0.20 |
| Qwen3-0.6B base | 0.08 | 110.0 | 101.6 | 1.00 | 23 | 0.08 |
| LFM2.5-350M base | 0.00 | – | – | – | – | 0 |
| random training program, same budget | 1.00 | 69.7 | 56.0 | 0.82 | 27 | 0.10 |
| procedural (MockArtist) | 1.00 | 102.6 | 90.9 | 0.92 | 25 | 0.08 |

What this shows:

- **LoRA teaches format, budget and look, even at 350M.** Usable output went from 0% (LFM) and 8% (Qwen) to about 100%. Shape counts match the requested budget exactly. The outputs look like the fitter's muted Klee-like shape mosaics. LFM2.5-350M is about as good as Qwen3-0.6B at roughly half the size, which matters for running in the browser.
- **The text only weakly steers the picture.** The fine-tuned models beat a random training program on layout (47–50 vs 56) and on true-painting rank (21–22 vs 27, where chance is about 26). That's a real but small effect. They mostly pick up overall tone and palette from the prompt, not composition. Palette distance is no better than random, and colours come out muted.
- **A 12B model prompted without training** follows the format only 58% of the time. It steers slightly better (rank 20, top-5 0.20) but doesn't look like Klee, and at around 90 s per image it is about 50× slower.

Likely reasons for the weak steering, and what to try next:

1. **Targets aren't a consistent function of the text.** Each caption is paired with 4 different random-seed fits, and greedy shape order carries no structure, so the model learns an average. Try one canonical fit per caption, with shapes sorted by size and position.
2. **Captions describe subject, not layout.** Add explicit layout phrases, such as "dark band along the top, orange disc upper right", which the programs can actually follow.
3. **296 paintings is small.** Augment with mirrored or cropped fits, with captions adjusted to match.
4. **Mounts and letterboxing** add large pale regions to many targets. Crop to the painted area.

## Notes

- **Qwen3.5-0.8B could not be trained here.** mlx-lm 0.31.3 runs Qwen3.5's gated-delta (linear attention) layers with a fast kernel only at inference; in training it loops over tokens in Python, and at ~1,800 tokens that exceeded Metal's buffer limit (`Resource limit (499000) exceeded`). Qwen3-0.6B (standard attention) is used instead.
- Programs use 2-decimal coordinates; a 48-shape program is ~1,450 Qwen tokens or ~1,200 LFM tokens, because digits tokenize one by one. A more compact number encoding would cut sequence length substantially.
- The format (system prompt, user prompt, program text) lives in `src/training/distillFormat.js`; `build_sft.py` checks its Python copy of the system prompt against it.
