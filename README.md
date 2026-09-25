# Artist Model Studio (AMS)

Can we teach a model to draw and paint the way we teach people, through a visible, staged process of seeing, constructing and making marks, rather than by sampling a finished picture from latent space?

Artist Model Studio is a training ground for that question: *creative coding for AI*. Drawings are **process documents**: named stages, paths with roles (point, line, plane, guide, gesture, note), brushes that realise them, decisions, and a reason and author for every mark. Models write **scores** (small JavaScript programs in a point / line / plane vocabulary) whose runs record that process. So what they learn, and what we can inspect, is how a picture was made, not just what it looks like. See [docs/design.md](docs/design.md) for the direction and [docs/workbench.md](docs/workbench.md) for the workbench.

- **Workbench** (`/`): an infinite canvas with dockable panels (after underscores). Draw with time and pressure, work in stages, write and run scores, study processes (filmstrip, decisions, reasons, process sheets), generate with models or agents, and keep everything in Assets.
- **Exercises** after Kandinsky, Klee and the algorists: the same briefs for students and models.
- **Exports**: SVG with the full process record, p5.js sketches that re-run the score, Excalidraw (to underscores), and process sheets.
- **Agents**: every action is an MCP tool; an agent can be the engine and answer generation requests with its own scores.

The first phase (reproducing *train to paint with code*) is kept as the **classic studio** (`/classic.html`), with the features below. The reasons for moving on are in [docs/design.md](docs/design.md#2-what-we-learned-reproducing-train-to-paint).

---

## The classic studio

- **Four candidates per prompt** from a choice of engines, rendered as flat shapes, watercolor (`p5.brush`), pixel art or ASCII (character sets including braille, teletext sextants and code page 437; a choice of fonts). Programs are plain JSON / text DSL you can read and edit.
- **Reference Fitter**: approximates a reference image with a budget of shapes (12 to 800) by greedy search, with no model involved. Candidates A–D use mixed, rectangle, circle and triangle shapes, so one round shows how the shape vocabulary changes the look. See [docs/reference-fitter.md](docs/reference-fitter.md).
- **Continuous mode**: the fitter as an endless painting. Shapes land one at a time (or fade in and out together), live for a cycle and are replaced by new fits, repainting the reference forever, in any of the four looks. Save PNG, plain-text ASCII, or record GIF/MP4.
- **Exports**: Text DSL, JSON, or a self-contained **p5.js project** (zip with `index.html`, `sketch.js`, vendored `p5.min.js` and `p5.brush`). Static exports can animate, loop, fit or fill the window and switch watercolor/flat; continuous exports run forever with live density, pacing and style controls.
- **Assets**: a browser for saved variations, paintings and imported images (IndexedDB), with folders, search, tags, stars and export; any asset can be used as the reference.
- **Distilled models**: a pipeline that trains small models (LFM2.5-350M, Qwen3-0.6B) with LoRA on Reference Fitter programs of public-domain Paul Klee paintings, served locally for the *Distilled Klee* engine. See [training/klee/README.md](training/klee/README.md).
- **References**: bundled public-domain works with sources and rights recorded ([fixtures/README.md](fixtures/README.md)), your own uploads (images, animated GIF/WebP, video), or the webcam, all kept in the browser. Live sources are sampled continuously, at an interval, or held.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000 (use --port to pick another)
npm test
```

Pick **Reference Fitter** as the engine, choose a reference in the **Reference** tab, and press **Generate 4**. For the endless painting, press **Play** in the Reference tab (**Clear** starts it over from blank).

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
- [Driving the studio from agents (MCP / WebMCP), agent as engine](docs/mcp.md)
- [Klee distillation pipeline and results](training/klee/README.md)
- [References and rights](fixtures/README.md)
- [System architecture and drawing language](docs/architecture.md)
- [Training scaffolding](docs/TRAINING.md) · [Experiments log](docs/experiments.md) · [Classroom demo](docs/classroom-demo.md)

## Licenses

MIT © 2026 Artist Model Studio contributors. Exported sketches vendor p5.js (LGPL-2.1) and p5.brush (MIT) unmodified; bundled reference images are public domain (see `fixtures/references/*/sources.json`).
