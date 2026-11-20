# Artist Model Studio (artmost): technical overview

The front page ([README](../README.md)) says what the studio is: a creative teaching and learning environment for humans and machines. This page is for people who want to run it locally, build on it, or follow the research: setup, the parts of the system, the classic studio, engines, honest notes, and a map of the other documents.

**Live site:** <https://languel.github.io/artistmodelstudio/> (built from `main` by `.github/workflows/pages.yml`).

## Run it locally

```bash
npm install
npm run dev          # http://localhost:3000 (use --port to pick another)
npm test
```

| Command | What it does |
| --- | --- |
| `npm run dev` | The workbench with hot reload (the dev server also relays agent requests and encodes film renders with the machine's ffmpeg). |
| `npm run build` | The static site in `dist/` (what GitHub Pages serves; `BASE_PATH` sets the sub-path). |
| `npm run build:single` | The workbench as one self-contained HTML file, `dist-single/ams.html` (about 3 MB), see *One file* below. |
| `npm run build:embed` | Poliplan, the lean embeddable editor, see [EMBEDDING.md](EMBEDDING.md). |
| `npm run mcp` | The MCP server for agents, see [mcp.md](mcp.md). |
| `npm test` | The test suite (vitest). |

On GitHub Pages the dev-server-only parts (the agent relay, film encoding, local MLX models) are absent; everything else runs in the browser.

## The workbench in detail

The workbench (`/`) is an infinite canvas with dockable panels (after underscores). The full reference is [workbench.md](workbench.md); in short:

- **Drawing as a process.** Drawings are process documents: named stages, paths with roles (point, line, plane, guide, gesture, note), brushes that realize them, decisions, and a reason and author for every mark. Draw with time and pressure, edit with an outliner, transforms and a right-click menu, place images as layers.
- **Scores.** Models (and people) write scores: small JavaScript programs in a point / line / plane vocabulary whose runs record the process. A real code editor with Cmd+Enter to run.
- **Brushes are code.** Every brush, built-ins included, is a small program you can read, fork and write, with a live preview; drawings carry the brushes they use.
- **Sculpting.** Push, grab, smooth, relax, pinch, twist, jitter, simplify and thicken marks with a brush (after threegrease). Sculpt tools are code as well.
- **Parameters are controls.** Parameters declared in code become sliders that act on the selection, the active brush or the tool in use; any number in code can be scrubbed.
- **Scenes, boards and pages.** A project holds scenes; a scene holds boards (artboards, like slides) with their own live code: plain drawings, p5.js sketches or three.js sketches. Present them, or export a scene as one HTML page that carries the drawing and replays it.
- **Physics.** Rapier 2D in a worker: falls, ground, hinges, motors, springs; contacts fire score events. See [notes/physics.md](notes/physics.md).
- **Timeline and History.** Record takes as clips on editor-style tracks (drawing, narration, titles, camera, audio), annotate, transcribe speech, and export video with sound. History keeps every change. See [recording-system.md](recording-system.md) and [films.md](films.md).
- **Sound.** p5.sound and Web Audio boards, a modular synth (modules, cables, sequencers, IanniX-style scores) drawn on the canvas, and analysis (loudness, pitch, onsets, FFT) that any parameter can follow.
- **Studies, exercises and decisions.** *Study: Senecio* (study a painting, write its methods as brushes and a score, draw a new subject in its manner); exercises after Kandinsky, Klee and the algorists; the Decide panel turns drawing into typed decisions a small local model (lev) learns from.
- **Exports.** SVG with the full process record, p5.js sketches that re-run the score, Excalidraw, process sheets, playable HTML pages, MP4.
- **Agents.** Every action is an MCP tool; an agent can be the engine and answer generation requests with its own scores. See [mcp.md](mcp.md).
- **Help built in.** A command palette (Cmd+K), searchable Docs, reassignable shortcuts, walkthroughs that drive the real controls, and the Lessons.

The ideas behind it are in [design.md](design.md); the data model and drawing language in [architecture.md](architecture.md).

## Lessons in the repository

Each lesson is a scene of slides built by `examples/lessons/sampling/scene.js` from a lesson description:

| Id | Source | Lesson |
| --- | --- | --- |
| `sampling` | `examples/lessons/sampling/` | Pointillism and Expressionism, by sampling (also as barebones p5.js: `sampling-expl`) |
| `threejs` | `examples/lessons/threejs/` | Three.js for body and sound (the course itself: [threejslessons](https://github.com/languel/threejslessons)) |
| `reiniger` | `examples/lessons/reiniger/` | The silhouette film |
| `synthesis` | `examples/lessons/synthesis/` | Sound synthesis 1A, p5.sound |
| `webaudio` | `examples/lessons/webaudio/` | Sound synthesis 1B, plain Web Audio |
| `modular` | `examples/lessons/modular/lesson.js` | Sound synthesis 2, the modular synth |
| `visuals` | `examples/lessons/modular/visuals.js` | Sound synthesis 2B, pictures that listen |
| `diffusion` | `examples/lessons/diffusion/` | Diffusion models, from noise to picture |

Build one from the Docs panel (Lessons → *Build the scene*), with `/lesson <id>` in the command palette, or from code: `buildLesson(app, id)` in `src/workbench/lessons.js`. Plans and notes: [notes/synthesis-lessons.md](notes/synthesis-lessons.md), [explainer-protocol.md](explainer-protocol.md), [classroom-demo.md](classroom-demo.md).

## The classic studio

The first phase (reproducing *Train to paint with code*) is kept as the **classic studio** (`/classic.html`). Why we moved on is in [design.md](design.md#2-what-we-learned-reproducing-train-to-paint).

- **Four candidates per prompt** from a choice of engines, rendered as flat shapes, watercolor (`p5.brush`), pixel art or ASCII (character sets including braille, teletext sextants and code page 437). Programs are plain JSON / text DSL you can read and edit.
- **Reference Fitter**: approximates a reference image with a budget of shapes (12 to 800) by greedy search, with no model involved. Candidates A–D use mixed, rectangle, circle and triangle shapes. See [reference-fitter.md](reference-fitter.md).
- **Continuous mode**: the fitter as an endless painting; shapes land, live for a cycle and are replaced by new fits. Save PNG, plain-text ASCII, or record GIF/MP4.
- **Exports**: Text DSL, JSON, or a self-contained **p5.js project** (zip with `index.html`, `sketch.js`, vendored `p5.min.js` and `p5.brush`).
- **Assets**: saved variations, paintings and imported images (IndexedDB), with folders, search, tags and stars.
- **Distilled models**: small models (LFM2.5-350M, Qwen3-0.6B) trained with LoRA on Reference Fitter programs of public-domain Paul Klee paintings, served locally for the *Distilled Klee* engine. See [training/klee/README.md](../training/klee/README.md).
- **References**: bundled public-domain works with sources and rights recorded ([fixtures/README.md](../fixtures/README.md)), your own uploads, or the webcam.

Quick start: pick **Reference Fitter** as the engine, choose a reference in the **Reference** tab, and press **Generate 4**. For the endless painting, press **Play** in the Reference tab.

### Engines

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
- Measured so far: LoRA on 3,264 examples takes about 30 min (LFM2.5-350M) and 60 min (Qwen3-0.6B) on an M5 Max; results are in [training/klee/README.md](../training/klee/README.md).
- The **preference export** currently treats a viewed/selected candidate as chosen and the others as rejected; explicit Keep/Reject judgments are planned before using it for training.

## One file

`npm run build:single` makes the workbench one self-contained HTML file, `dist-single/ams.html` (about 3 MB): open it from disk, for example in a transparent browser window used as an overlay (CloudyWindow), and set `/transparent` in the command palette. In-browser models (WebGPU) and the dev server's agent relay are left out; Assets, scenes and settings live in the browser as usual.

## Map of the documents

**Using the studio**
- [workbench.md](workbench.md): the workbench, panel by panel, every tool and shortcut
- [quick-commands.md](quick-commands.md): the `/` field and Cmd+K
- [films.md](films.md): films and explainers made with the camera system
- [classroom-demo.md](classroom-demo.md): a 15–25 minute classroom sequence

**Agents and embedding**
- [mcp.md](mcp.md): driving the studio from agents (MCP / WebMCP), agent as engine
- [EMBEDDING.md](EMBEDDING.md): Poliplan, the drawing editor as a component
- [recording-system.md](recording-system.md): the recording system (takes) and how to reuse it

**Research and models**
- [design.md](design.md): the question, what we learned, principles, direction
- [architecture.md](architecture.md): system architecture and drawing language
- [reference-fitter.md](reference-fitter.md): Reference Fitter, continuous mode and p5 export
- [TRAINING.md](TRAINING.md): training scaffolding and hardware
- [experiments.md](experiments.md): experimental matrix and research questions
- [training/klee/README.md](../training/klee/README.md): the Klee distillation pipeline and results
- [fixtures/README.md](../fixtures/README.md): references and rights

**Plans and working notes**
- [HANDOFF.md](HANDOFF.md): where things stand and what is next
- [camera-plan.md](camera-plan.md), [explainer-protocol.md](explainer-protocol.md), [handoff-p5comp-timeline.md](handoff-p5comp-timeline.md)
- [notes/](notes/): physics, scores and travelers, the synthesis lessons, performance, accidental art

## Licenses

MIT © 2026 Artist Model Studio (artmost) contributors. Exported sketches vendor p5.js (LGPL-2.1) and p5.brush (MIT) unmodified; the built-in score sound is jzz and jzz-synth-tiny (MIT) with g200kg's webaudio-tinysynth (MIT); three.js is MIT; bundled reference images are public domain (see `fixtures/references/*/sources.json`).
