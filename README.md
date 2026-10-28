# Artist Model Studio (AMS)

Can we teach a model to draw and paint the way we teach people, through a visible, staged process of seeing, constructing and making marks, rather than by sampling a finished picture from latent space?

Artist Model Studio is a training ground for that question: *creative coding for AI*. Drawings are **process documents**: named stages, paths with roles (point, line, plane, guide, gesture, note), brushes that realize them, decisions, and a reason and author for every mark. Models write **scores** (small JavaScript programs in a point / line / plane vocabulary) whose runs record that process. So what they learn, and what we can inspect, is how a picture was made, not just what it looks like. See [docs/design.md](docs/design.md) for the direction and [docs/workbench.md](docs/workbench.md) for the workbench.

- **Workbench** (`/`): an infinite canvas with dockable panels (after underscores). Draw with time and pressure, work in stages, edit with an outliner, transforms and a right-click menu, place images as layers, write and run scores in a real code editor, study processes (filmstrip, decisions, reasons, process sheets), generate with models or agents, and keep everything in Assets. A command palette (Cmd+K), searchable docs, reassignable shortcuts and walkthroughs come with it.
- **Brushes are code**: every brush, the built-ins included, is a small program you (or a model, or an agent) can read, fork and write, with a live preview; drawings carry the brushes they use.
- **Sculpting**: push, grab, smooth, relax, pinch, twist, jitter, simplify (or resample) and thicken marks with a brush (after threegrease), from a Sculpt tool or Shift+drag. Sculpt tools are code as well.
- **Parameters are controls**: parameters declared in code become sliders that act on the selection, the active brush or the tool in use. They also appear in the preview and on Opt+right-click, and any number in code can be scrubbed.
- **Scenes, boards and pages**: a project holds scenes (drawings), a scene holds boards (artboards, like slides) with their own live code. Present them, or export a scene as one HTML page (a lecture, a blog post, an agent's report) that carries the drawing and replays it.
- **Timeline and History**: record takes as clips on editor-style tracks (drawing, narration, titles, camera, audio) and export video with sound. History keeps every change, to preview, restore or drag onto the Timeline.
- **Studies**: *Study: Senecio* walks through studying a painting, writing its methods as brushes and a score, reproducing it, and drawing a new subject in its manner.
- **Decisions**: the Decide panel turns drawing into typed decisions a small local model (lev) can learn from your choices.
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

## One file

`npm run build:single` makes the workbench one self-contained HTML file, `dist-single/ams.html` (about 3 MB): open it from disk, for example in a transparent browser window used as an overlay (CloudyWindow), and set `/transparent` in the command palette. In-browser models (WebGPU) and the dev server's agent relay are left out; Assets, scenes and settings live in the browser as usual.

## Documentation

- [Reference Fitter, continuous mode and p5 export](docs/reference-fitter.md)
- [Driving the studio from agents (MCP / WebMCP), agent as engine](docs/mcp.md)
- [Klee distillation pipeline and results](training/klee/README.md)
- [References and rights](fixtures/README.md)
- [Handoff: where things stand, what is next](docs/HANDOFF.md)
- [System architecture and drawing language](docs/architecture.md)
- [Training scaffolding](docs/TRAINING.md) · [Experiments log](docs/experiments.md) · [Classroom demo](docs/classroom-demo.md)

## Licenses

MIT © 2026 Artist Model Studio contributors. Exported sketches vendor p5.js (LGPL-2.1) and p5.brush (MIT) unmodified; the built-in score sound is jzz and jzz-synth-tiny (MIT) with g200kg's webaudio-tinysynth (MIT); bundled reference images are public domain (see `fixtures/references/*/sources.json`).

## three.js boards and the body-and-sound lessons

A board can hold a three.js sketch (Code panel → kind → *three.js*, or `/lesson threejs`): an ES module importing `three` and common addons, run live in a sandboxed frame like a p5 board. three.js is bundled, so no network is needed.

The ten-lesson course that goes with it (a spinning cube up to MediaPipe body tracking, depth, a laser harp, a body drum, Schlemmer costumes, Picasso one-line drawings and Ghostcatching-style paint marks) lives in its own repository, `threejs-body-sound`.
