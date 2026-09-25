# Artist Model Studio: design note

Status: working draft for review. Branches: `main` (this direction), `apprentice` (the studio built while
reproducing train-to-paint), `v1-reference` (the state before that).

## 1. The question

Can we teach a model to draw and paint the way we teach people, through a visible, staged process
of seeing, constructing, and making marks, rather than by sampling a finished picture from latent
space?

Artist Model Studio (AMS) is a training ground for that question. It produces generative-code artefacts
and final images, but its real output is **process**: legible, editable, replayable records of how a
picture was made and why.

The motivating experiment is concrete. Give the system a folder of drawings ("here are Klee's
drawings"), let it learn how they are made, then ask for something out of distribution ("a harpy
clutching a fish"). The interesting results are not only whether a style is reproduced, but where
style and process hold, bend, dissolve, or meet other concepts.

## 2. What we learned reproducing train-to-paint

The first phase of AMS reproduced *Train to paint with code* (p5.brush watercolors, a model writes the
drawing code, rewards judge the final image). Our experiments showed its limits:

- **The library paints.** p5.brush supplies the watercolor look. The model only places filled shapes.
- **Only outcomes are rewarded.** A judge sees the final image. Construction is never represented or
  rewarded, so it cannot be learned.
- **Coordinates are expensive.** Without loops, functions, or parts, a model spends its budget spelling
  out coordinates. Frontier models produced blocking at best. Our distilled 350M model learned the
  surface statistics of Reference Fitter output (palette, shape sizes, budget), with no subject.
- **Pictures help small models more than words do.** Image-conditioned prompts beat text-only
  prompts, and seeing was not the bottleneck: models described references accurately and still could
  not turn the description into coordinates.

The infrastructure built along the way stays: the studio shell, engines and model pickers, the Agent
(MCP) engine, assets with ratings and tags, prompt modes, recording, and the p5 and SVG exports.

## 3. Principles

1. **Everything is a process, and processes stack.** A picture is a sequence of stages (analysis,
   concept, construction, blocking, structure, value, marks, accents). Each stage consumes and
   produces paths and fields.
2. **Paths and realizations are different things.** A *path* is a 2D curve with a role: a stroke, a
   region boundary, a guide, a gesture, a timeline. A *brush* realizes a path through a painting
   algorithm (flat, ink, hatching, watercolor, pixel), and can itself be a process built on paths.
   (From AutoPaint2 / Studio Artist and the underscores modifier stack.)
3. **The harness does not paint.** The harness provides perception (what is there) and honest
   brushes (paths realized with explicit, bounded parameters). Composition, emphasis, order, and
   value decisions come from the process. Test: remove the decisions, and the harness alone should
   produce nothing interesting.
4. **Decisions are the data.** Every node records its stage, role, parameters, seed, a one-line
   reason, and who decided it (user, model, perception, default). Alternatives that were considered
   are kept with the choice.
5. **Interpretable by construction.** The process document is the explanation. Artefacts carry it:
   overlays of guides and construction, a filmstrip of stages, a printable process sheet, stage-grouped
   exports with the reasons as comments.
6. **Collaborative at every level.** Any stage can be varied, locked, or regenerated below, with seeds
   pinned so the rest stays stable.
7. **Start small.** Primitives and exercises before paintings. Keep the harness light enough that
   the model, not the scaffolding, does the work.

## 4. Three layers

### 4.1 The process document (canonical)

A JSON document we own. Sketch of the shape (the code is the source of truth):

```js
{
  type: "ams-process", version: 1,
  artboard: { width, height, ground },
  stages: [{ id, name, kind, visible, locked }],   // ordered: analysis → … → accents
  elements: [{
    id, stage, role,            // role: point | line | plane | guide | gesture | note
    points: [[x, y, t, p]],     // canvas units, time (ms), pressure
    closed,
    realize: { brush, params }, // how the path becomes marks
    why, by: { kind, name }, seed, created
  }],
  decisions: [{ id, stage, question, options, chosen, why, by }]
}
```

Timing and provenance are never lost, which was the pain point with Excalidraw-as-storage in
underscores.

### 4.2 Authoring: a small JS library

A p5-flavoured vocabulary built on point, line, and plane, runnable in the browser. Running a
script **records** the process document: every call becomes a node with its stage, parameters,
seed, and reason. Code is the score; the recorded document is the performance (Verostko's
algorithm/plotter split, one level up).

- psvg's benefit (loops, functions, variables) without a new syntax.
- Models already write JS well.
- p5 export is natural, which matters for teaching.
- What we store and learn from is the recorded document, not an opaque script.

### 4.3 Editors and exports

All read and write the process document:

- **Workbench canvas**: an infinite canvas with an artboard, dockable and collapsible panels, tools
  for point, line, plane, guide, and note, capture with time and pressure, stages as layers,
  annotation, and (later) click-to-segment.
- **p5 sketch** for teaching, grouped by stage, with reasons as comments.
- **SVG** with `data-ams-*` attributes (the round trip we already built).
- **Excalidraw JSON** to move work into underscores.
- **Looom** later, for time-based pieces.

## 5. Process inference (the central research problem)

Finished images do not contain their process. To learn from a folder of pictures we need plausible,
meaningful process documents for each one:

1. **Analysis-by-synthesis in stages**: a Reference Fitter that fits process documents stage by stage
   (big planes and notan, structural lines, rhythm, texture), each checked by render-and-compare at
   the right frequency.
2. **A frontier model as art-history student**: it studies each image with perception (segmentation,
   line extraction, value masses) and writes a staged reconstruction with reasons, kept honest by
   render-and-compare.
3. **Human demonstrations**: redraws in the workbench with time and order captured. Few, but the only
   true process data.

Training then learns process conditioned on subject and style. Out-of-distribution prompts test what
transfers.

### 5.1 Decisions as the unit of learning

Free-form generation hides the process. Training on outcomes teaches surface texture: the distilled
350M model learned Klee's palette, not his subjects. So we split the work:

- **Perception** (analysis, MediaPipe, later SAM) describes the reference as compact text.
- **A decision policy** answers typed questions at each step. These are TypeSafe System One questions:
  `choice`, `score` and `noul`, with calibrated probabilities. lev (LFM2.5-350M with a LoRA and a pointer
  head) is small enough to train locally in under an hour.
- **Executors** realize each decision with brushes. They decide nothing themselves, and every mark
  carries the decisions behind it.
- **You and the agent** confirm or override. Overrides are the labels, so taste is taught one decision at
  a time, and low confidence is where the model asks.

A frontier model (or the Assistant with a local LLM) can play the policy through MCP to bootstrap labels.
A trained lev then takes over, and the rules baseline is the bar it has to clear.

## 6. The syllabus

AMS doubles as *creative coding for AI*: the same exercises for students and models, comparable at
every stage. Sources: Klee (*Pedagogical Sketchbook*), Kandinsky (*Point and Line to Plane*), the
algorists (Mohr, Verostko).

1. **Point**: one point on the basic plane, where tension depends on placement; then several points,
   balance, and clusters.
2. **Line walk**: the active line with a goal, the medial and passive lines, the line that encloses.
3. **Line to plane**: planes by hatching, by enclosure, by fields. Brushes appear here as ways of
   realizing a plane.
4. **Structural rhythm**: repetition, gradation, weight.
5. **Algorists**: a rule system produces a family of forms, and a brush realizes them.
6. **Seeing**: gesture from pose, envelope from a mask, 3-value notan from value masses.

Each exercise has a brief, constraints, checks (automatic where possible), and variations.

## 7. Build order

1. **Workbench and process document**: canvas, docks, tools, stages, provenance, exports. Keep assets
   and model pickers.
2. **Primitives and brushes**: the authoring library, flat, ink, hatch, then one painterly medium.
3. **Fundamentals exercises**: Point, Line walk, Line to plane, with process sheets.
4. **Seeing**: perception in the editor (segmentation, pose, values), reference exercises.
5. **Process inference and training**: decompile a folder of images; train; out-of-distribution
   prompts; study where style breaks down.

The previous studio remains available (`classic.html`) until its parts are moved into the workbench.

## 8. Open questions

- How far should brushes go before they start "painting" (the harness test)?
- Which checks per exercise are automatic, which need judgement?
- How should alternatives be stored so they stay small but useful as preference data?
- Perception in the browser (MediaPipe, small SAM) versus a local server (SAM 3, depth, YOLO).
- Which questions belong in a step, and when do step types need their own questions? Should
  alternatives (preference pairs) be a question type?
- How much state text can a 350M policy use before its choices stop depending on it?
