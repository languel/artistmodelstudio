# Artist–Model Studio (AMS)

A human-in-the-loop creative coding studio. Models (or procedures) write small drawing programs, the studio renders them in different media, and you judge, edit, animate and export the results. It is built for teaching and for exploring how small models can learn a visual style.

---

## What it does

- **Four candidates per prompt** from a choice of engines, rendered as flat shapes, watercolor (`p5.brush`) or pixel art. Programs are plain JSON / text DSL you can read and edit.
- **Reference Fitter**: approximates a reference image with a budget of shapes (12 to 800) by greedy search, with no model involved. Candidates A–D use mixed, rectangle, circle and triangle shapes, so one round shows how the shape vocabulary changes the look. See [docs/reference-fitter.md](docs/reference-fitter.md).
- **Continuous mode**: the fitter as an endless painting. Shapes land one at a time (or fade in and out together), live for a cycle and are replaced by new fits, repainting the reference forever, flat or in watercolor.
- **Exports**: Text DSL, JSON, or a self-contained **p5.js project** (zip with `index.html`, `sketch.js`, vendored `p5.min.js` and `p5.brush`). Static exports can animate, loop, fit or fill the window and switch watercolor/flat; continuous exports run forever with live density, pacing and style controls.
- **Distilled models**: a pipeline that trains small models (LFM2.5-350M, Qwen3-0.6B) with LoRA on Reference Fitter programs of public-domain Paul Klee paintings, served locally for the *Distilled Klee* engine. See [training/klee/README.md](training/klee/README.md).
- **References**: bundled public-domain works with sources and rights recorded ([fixtures/README.md](fixtures/README.md)), or your own uploads, which stay in the browser.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000 (use --port to pick another)
npm test
```

Pick **Reference Fitter** as the engine, choose a reference in the **Reference** tab, and press **Generate 4**. For the endless painting, use **Play continuous** in the Reference tab.

## Engines

| Engine | What it is |
| --- | --- |
| Procedural | Offline rule-based generator; instant, no model. |
| Reference Fitter | Greedy shape fitting to the reference image; the "model" menu is the shape budget. |
| Distilled Klee (local MLX) | A small model fine-tuned on fitter programs, served by `training/klee/serve.sh`. |
| Ollama / OpenAI-compatible / OpenRouter | Prompted language models writing the drawing DSL. |
| WebGPU (browser) | Small ONNX models running client-side via `@huggingface/transformers`. |
| Fine-Tuned Adapter | Teaching demo, see below. |

## Honest notes

- **Fine-Tuned Adapter / "in-browser LoRA"** is a teaching demo: it trains a small standalone matrix on hashed prompt features and replays an exemplar program with jitter. It does not fine-tune a language model. Real LoRA training lives in `training/klee/` (mlx-lm on Apple Silicon).
- **Hardware estimator** figures in the Help panel are estimates from hardware presets, not measurements.
- Measured so far: LoRA on 3,264 examples takes about 30 min (LFM2.5-350M) and 60 min (Qwen3-0.6B) on an M5 Max; results are in [training/klee/README.md](training/klee/README.md).
- The **preference export** currently treats a viewed/selected candidate as chosen and the others as rejected; explicit Keep/Reject judgments are planned before using it for training.

## Documentation

- [Reference Fitter, continuous mode and p5 export](docs/reference-fitter.md)
- [Klee distillation pipeline and results](training/klee/README.md)
- [References and rights](fixtures/README.md)
- [System architecture and drawing language](docs/architecture.md)
- [Training scaffolding](docs/TRAINING.md) · [Experiments log](docs/experiments.md) · [Classroom demo](docs/classroom-demo.md)

## Licenses

MIT © 2026 Artist–Model Studio contributors. Exported sketches vendor p5.js (LGPL-2.1) and p5.brush (MIT) unmodified; bundled reference images are public domain (see `fixtures/references/*/sources.json`).
