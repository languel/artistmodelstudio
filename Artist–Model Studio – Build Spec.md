# Artist–Model Studio

A small local-first creative-coding laboratory for exploring machine-generated drawing, artistic media, human preference, fine-tuning, and reinforcement learning.

The name is intentionally ambiguous:

- artist ↔ model
- artist's model
- model as artist
- studio as creative workspace
- studio as experimental environment

The project is designed primarily as a classroom demonstration for students already familiar with p5.js.

The core idea is:

```text
prompt / state
      ↓
    Artist
      ↓
 drawing actions
      ↓
    Medium
      ↓
 rendered image
      ↓
 human / critic / reward
      ↓
 next action or learning
```

The important architectural rule is:

> The model, renderer, evaluator, and learning method must remain independent and swappable.

Watercolor with `p5.brush` is the initial motivating example, but it must not become hard-wired into the system.

---

# 1. Teaching goals

The application should make several distinctions visible rather than hiding them behind an AI interface.

Students should be able to see the difference between:

1. a model generating code;
2. a renderer turning that code into an image;
3. the renderer's own aesthetic contribution;
4. human selection;
5. iterative prompting;
6. visual self-critique;
7. supervised fine-tuning;
8. preference learning;
9. reinforcement learning;
10. optimizing a reward versus making something humans consider good.

The application should remain small enough that students can inspect its source.

Do not build a general AI framework.

Do not reproduce Underscores.

Aim for something conceptually closer to a p5 sketch with a laboratory wrapped around it.

---

# 2. Primary classroom loop

The minimum useful interaction is:

```text
Prompt
  ↓
Generate four candidate programs
  ↓
Render four images
  ↓
Student selects one
  ↓
Generate four variations
  ↓
Repeat
```

UI sketch:

```text
┌──────────────────────────────────────────────────────────┐
│ ARTIST–MODEL STUDIO                                      │
│                                                          │
│ Artist:   [ Qwen 2B           ▾ ]                        │
│ Medium:   [ Watercolor        ▾ ]                        │
│                                                          │
│ Prompt                                                   │
│ [ three red flowers bending toward the left          ]  │
│                                                          │
│ [ Generate 4 ]                                           │
│                                                          │
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐      │
│ │          │ │          │ │          │ │          │      │
│ │    A     │ │    B     │ │    C     │ │    D     │      │
│ │          │ │          │ │          │ │          │      │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘      │
│      ○            ●            ○            ○             │
│                                                          │
│ [ variations ] [ continue ] [ critique ] [ start over ] │
│                                                          │
│ Program                                                  │
│ ┌──────────────────────────────────────────────────────┐ │
│ │ fill #ce526d 0.8                                    │ │
│ │ bleed .25                                           │ │
│ │ circle -80 -40 110                                  │ │
│ │ ...                                                  │ │
│ └──────────────────────────────────────────────────────┘ │
│                                                          │
│ [ Render same program with another medium ]             │
└──────────────────────────────────────────────────────────┘
```

No chat interface is necessary for MVP.

---

# 3. Architecture

Use four major abstractions:

```text
Artist
Medium
Critic
Trainer
```

Conceptually:

```text
                  ┌──────────────┐
                  │    Artist    │
                  └──────┬───────┘
                         │
                     Action[]
                         │
                         ▼
                  ┌──────────────┐
                  │    Medium    │
                  └──────┬───────┘
                         │
                       image
                         │
               ┌─────────┴─────────┐
               ▼                   ▼
          human choice           Critic
               │                   │
               └─────────┬─────────┘
                         │
                      reward
                         │
                         ▼
                     Trainer
```

For MVP:

```text
Artist  = Ollama model
Medium  = Canvas / Pixel / p5.brush
Critic  = Human
Trainer = None
```

Everything else should be layered onto this later.

---

# 4. Technology choices

Prefer:

- Vite
- vanilla JavaScript or very light TypeScript
- p5.js
- local browser rendering
- Ollama-compatible model endpoint
- IndexedDB or simple localStorage for session data
- JSON export

Avoid unless necessary:

- React
- server databases
- Docker
- authentication
- accounts
- cloud infrastructure
- large UI frameworks

The project should launch roughly as:

```bash
npm install
npm run dev
```

Local-model setup should be separate.

Example:

```bash
ollama pull qwen3.5:2b
```

Do not assume a specific model exists. Model names should be configurable.

---

# 5. Action language

The model must NOT emit arbitrary executable JavaScript in the default mode.

Create a constrained drawing-action representation.

Use JSON internally.

Example:

```json
{
  "version": 1,
  "actions": [
    {
      "op": "background",
      "color": "#f4eee3"
    },
    {
      "op": "fill",
      "color": "#c95267",
      "opacity": 0.8
    },
    {
      "op": "circle",
      "x": -90,
      "y": -45,
      "diameter": 110
    }
  ]
}
```

Also provide a readable text representation:

```text
background #f4eee3
fill #c95267 .8
circle -90 -45 110
```

The text representation is for humans.

The JSON form is authoritative.

---

# 6. Core action vocabulary

Define a small renderer-independent core:

```text
background
clear

fill
noFill

stroke
noStroke
strokeWidth

line
circle
rect

polygon
polyline
```

Coordinates should use normalized canvas coordinates where possible.

Recommended logical coordinate system:

```text
x: -1 .. 1
y: -1 .. 1
```

rather than physical pixels.

This makes programs transferable between differently sized renderers.

---

# 7. Renderer capabilities

Do not force every medium into the same vocabulary.

A Medium must declare its capabilities.

Example:

```js
medium.capabilities()
```

might return:

```json
{
  "core": [
    "background",
    "fill",
    "circle",
    "polygon"
  ],
  "extensions": [
    "brush.bleed",
    "brush.texture",
    "brush.hatch"
  ]
}
```

The Artist receives the current capability list as part of its system prompt.

This is important conceptually:

> The medium determines the space of actions available to the artist.

---

# 8. Medium interface

Implement something approximately like:

```ts
interface Medium {
  id: string;
  name: string;

  capabilities(): CapabilitySpec;

  reset(config?: object): void;

  render(program: DrawingProgram): Promise<RenderResult>;

  snapshot(): Promise<Blob>;

  validate(program: DrawingProgram): ValidationResult;
}
```

`RenderResult` should include:

```ts
{
  image,
  width,
  height,
  warnings,
  executionTimeMs
}
```

---

# 9. Initial media

Implement THREE media.

## 9.1 Plain Canvas

Use Canvas2D or ordinary p5.

Purpose:

- baseline renderer;
- fast;
- no special aesthetic tricks;
- useful for renderer ablation.

Call it:

```text
Flat Canvas
```

It should implement only the core DSL.

---

## 9.2 Watercolor

Use `p5.brush`.

Call it:

```text
Watercolor
```

Initial extensions:

```text
brush.bleed
brush.texture
brush.hatch
brush.weight
```

Do not expose the entire p5.brush API initially.

Keep the vocabulary deliberately small.

---

## 9.3 Pixel

Provide a true logical pixel canvas.

Default:

```text
32 × 48
```

Configurable alternatives:

```text
16 × 16
32 × 32
32 × 48
64 × 64
```

Render the result enlarged using nearest-neighbor scaling.

Pixel-specific operations:

```text
pixel
hline
vline
rect
line
polygon
palette
mirrorX
mirrorY
```

Coordinates must be integer logical pixels.

The renderer, rather than the language model, guarantees pixel-grid correctness.

Example:

```json
{
  "op": "pixel",
  "x": 13,
  "y": 21,
  "color": 2
}
```

Palette:

```json
[
  "#16151c",
  "#693a32",
  "#c96a55",
  "#e3b86c",
  "#eee4c8"
]
```

This renderer should be genuinely discrete, not a simulation of pixel art.

---

# 10. Renderer ablation mode

This is an important classroom feature.

Add:

```text
COMPARE MEDIA
```

For programs using only the shared core DSL, render the exact same program through:

```text
Flat Canvas
Watercolor
```

side by side.

Example:

```text
same model
same prompt
same program
same geometry

      ↓

Flat Canvas       Watercolor
```

This lets the class ask:

> How much of the perceived artistic quality comes from the model, and how much comes from the medium?

This is one of the project's central experiments.

Pixel does not have to support one-to-one comparison when semantics differ.

---

# 11. Artist interface

Use:

```ts
interface Artist {
  id: string;
  name: string;

  generate(request: ArtistRequest): Promise<DrawingProgram[]>;
}
```

`ArtistRequest`:

```ts
{
  prompt,
  count,
  mediumCapabilities,
  previousProgram?,
  feedback?,
  image?,
  history?
}
```

---

# 12. Initial Artist: Ollama

Implement an Ollama-compatible provider.

Suggested models to test:

```text
Qwen 0.5–4B class
LFM ~1B class
other locally installed Ollama models
```

Do not hard-code model-specific logic.

Settings:

```text
Endpoint
Model
Temperature
Seed
Max tokens
```

Use structured JSON output when supported.

Otherwise:

1. ask for JSON only;
2. extract JSON;
3. validate it;
4. reject malformed programs;
5. optionally attempt one repair request.

Never execute model-generated JS.

---

# 13. System prompt generation

The model prompt should be generated from the selected Medium's capabilities.

Conceptually:

```text
You are drawing using a constrained visual language.

Canvas:
...

Available actions:
...

Return exactly one JSON drawing program.

Coordinates:
...

Current artistic request:
...
```

Watercolor and Pixel should therefore result in substantially different model behavior even with the same model.

This is desirable.

---

# 14. Candidate generation

Default:

```text
4 candidates
```

Allow:

```text
1
2
4
8
```

but keep 4 as the teaching default.

Each candidate record stores:

```ts
{
  id,
  timestamp,

  prompt,
  model,
  modelSettings,

  medium,
  mediumSettings,

  program,

  parentId,
  generation,

  selected,
  rating?,
  feedback?,

  renderMetadata
}
```

---

# 15. Human preference loop

Selecting a candidate should make it the parent of the next generation.

"Variations" means:

```text
prompt
+
selected previous program
+
instruction to preserve some qualities
+
request for controlled variation
```

Do not pretend this is training.

Label it explicitly in code and documentation as:

```text
contextual iteration
```

The model weights remain unchanged.

---

# 16. Critique mode

Add later in MVP, after basic generation works.

Allow:

```text
Human critique
```

Example:

```text
more empty space
reduce symmetry
keep the palette
```

This becomes text feedback in the next Artist request.

Then optionally support:

```text
Model critique
```

where a multimodal model receives the render and returns structured observations.

Example:

```json
{
  "observations": [
    "composition is strongly centered",
    "three forms overlap heavily"
  ],
  "suggestions": [
    "move one form toward the upper-left",
    "increase negative space"
  ]
}
```

Keep critique separate from generation.

---

# 17. Data collection

Every interaction should optionally create useful training data.

Record:

```text
prompt
candidate programs
renders
selected candidate
rejected candidates
human critique
model critique
parent-child relationships
medium
model
settings
```

Provide:

```text
Export Session
```

as JSON.

Also provide:

```text
Export SFT Dataset
Export Preference Dataset
```

---

# 18. SFT dataset

Generate records such as:

```json
{
  "messages": [
    {
      "role": "user",
      "content": "three sparse red flowers bending left"
    },
    {
      "role": "assistant",
      "content": "{ ...drawing program... }"
    }
  ]
}
```

Allow export of:

```text
all selected examples
only ★ examples
all manually edited examples
```

---

# 19. Preference dataset

Selections naturally generate pairs:

```json
{
  "prompt": "...",
  "chosen": "{program B}",
  "rejected": "{program D}"
}
```

Optionally create all pairings:

```text
chosen B > A
chosen B > C
chosen B > D
```

Keep the source session IDs for provenance.

---

# 20. Training architecture

Training is NOT required for first MVP.

However, design the repo so these can be added cleanly:

```text
training/
    sft/
    preference/
    rl/
```

The browser application should know nothing about MLX, PyTorch, TRL, etc.

Its responsibility ends at dataset export and model inference.

---

# 21. First real training experiment: LoRA

Target:

```text
small causal language model
~0.5B–1.5B
```

Use a tiny class-generated dataset.

Goal:

```text
BEFORE
model understands general language but inconsistently produces our DSL

AFTER
model reliably behaves like an Artist–Model Studio painter
```

Prefer LoRA rather than full fine-tuning.

On Apple Silicon, make MLX/MLX-LM the first training backend to investigate.

Training should remain a separate CLI workflow.

Conceptual command:

```bash
python training/sft/train.py \
  --model <model> \
  --data exports/sft.jsonl
```

Exact backend details may change.

Keep the interface stable even if implementation changes.

---

# 22. Fast classroom RL

Do not begin by trying to reproduce full LLM GRPO.

Implement a small real reinforcement-learning experiment first.

The RL policy can operate on drawing parameters or drawing actions while the LLM remains frozen.

For example:

```text
LLM generates rough composition
        ↓
small policy adjusts:
  position
  size
  color
  density
        ↓
render
        ↓
reward
        ↓
policy update
```

This should train fast enough for a live demonstration.

Possible algorithm:

```text
REINFORCE
or
small PPO
```

The point is to expose:

```text
state
action
environment
reward
policy update
```

rather than to maximize image quality.

---

# 23. Deterministic reward laboratory

Create several deliberately simplistic rewards.

Examples:

```text
validity
number of shapes
redness
blueness
leftness
centeredness
symmetry
empty space
coverage
average size
palette size
```

Example composite reward:

```js
reward =
    0.20 * validProgram
  + 0.20 * redScore
  + 0.20 * leftness
  + 0.20 * desiredShapeCount
  + 0.20 * negativeSpace;
```

Show the individual terms in the UI.

Example:

```text
Reward: 0.73

valid       1.00
redness     0.94
leftness    0.81
3 shapes    1.00
empty space 0.38
```

---

# 24. Reward-hacking mode

Do not prevent amusing reward exploits unless they break the program.

They are educational output.

Example:

Prompt:

```text
Make a beautiful sparse painting with three red flowers.
```

Reward:

```text
redness + three objects + empty space
```

The policy may discover:

```text
three microscopic red dots
```

Keep that result.

The lesson is:

```text
desired outcome ≠ specified reward
```

Include reward history and generated results so students can watch this happen.

---

# 25. Later: LLM GRPO

Treat this as an optional advanced module.

Architecture:

```text
small LLM policy
      ↓
N drawing programs
      ↓
Medium
      ↓
reward
      ↓
relative advantage
      ↓
GRPO update
```

Aim initially for:

```text
0.5B-ish model
short drawing programs
4 rollouts
simple deterministic reward
LoRA updates
```

Do not require this module for the classroom app to function.

Design a Trainer abstraction now:

```ts
interface Trainer {
  train(datasetOrEnvironment, config): Promise<TrainingResult>;
}
```

but leave implementation optional.

Possible backends can later include:

```text
MLX-native experiment
PyTorch / TRL
remote GPU
```

---

# 26. Studio modes

The eventual interface can expose several clearly named modes.

## DRAW

```text
prompt → model → image
```

## BREED

```text
4 variants → human chooses → variants
```

No training.

## CRITIQUE

```text
image → feedback → revision
```

No training.

## COLLECT

Save selections for training.

## TRAIN

Show SFT / preference training externally.

## REWARD LAB

Run a small RL experiment.

Avoid pretending these are the same process.

---

# 27. Program editor

Generated programs should be editable.

The student can:

1. generate a program;
2. edit a coordinate/color/action;
3. rerender immediately.

Example:

```text
circle -.7 -.4 .35
```

becomes:

```text
circle .4 -.4 .35
```

The visual result changes without another model invocation.

This reinforces that the model is generating an understandable representation rather than opaque pixels.

---

# 28. Seeds and reproducibility

Where possible store:

```text
model seed
renderer seed
program
settings
```

`p5.brush` stochastic texture should expose a seed if practical.

Pixel and Flat Canvas should be deterministic.

A saved candidate should rerender consistently.

---

# 29. Classroom-friendly status display

Keep model execution visible.

Example:

```text
MODEL
qwen-small

generation
842 ms

program
27 actions

render
11 ms

total
853 ms
```

This makes performance differences between models and media observable.

---

# 30. File structure

Suggested:

```text
artist-model-studio/
│
├── index.html
├── package.json
├── vite.config.js
│
├── src/
│   ├── main.js
│   ├── app.js
│   │
│   ├── artists/
│   │   ├── Artist.js
│   │   ├── OllamaArtist.js
│   │   └── promptBuilder.js
│   │
│   ├── media/
│   │   ├── Medium.js
│   │   ├── FlatCanvasMedium.js
│   │   ├── WatercolorMedium.js
│   │   └── PixelMedium.js
│   │
│   ├── language/
│   │   ├── schema.js
│   │   ├── validate.js
│   │   ├── normalize.js
│   │   └── textFormat.js
│   │
│   ├── critics/
│   │   ├── HumanCritic.js
│   │   └── ModelCritic.js
│   │
│   ├── rewards/
│   │   ├── validity.js
│   │   ├── composition.js
│   │   ├── color.js
│   │   └── combine.js
│   │
│   ├── sessions/
│   │   ├── sessionStore.js
│   │   └── exportDataset.js
│   │
│   └── ui/
│       ├── CandidateGrid.js
│       ├── ProgramEditor.js
│       ├── Controls.js
│       └── RewardPanel.js
│
├── training/
│   ├── README.md
│   ├── sft/
│   ├── preference/
│   └── rl/
│
├── examples/
│   ├── watercolor/
│   ├── pixel/
│   └── flat/
│
└── docs/
    ├── architecture.md
    ├── classroom-demo.md
    └── experiments.md
```

Do not create empty architectural abstractions purely to satisfy this diagram. Keep implementation small.

---

# 31. MVP milestones

## Milestone 1 — deterministic studio

No AI.

Build:

```text
DrawingProgram
Flat Canvas
Pixel
Watercolor
program editor
renderer selector
```

Provide hand-written example programs.

Acceptance:

- editing JSON changes the image;
- renderer failures do not crash the app;
- Pixel output is genuinely grid-aligned;
- Watercolor renders through p5.brush.

---

## Milestone 2 — local artist

Add Ollama.

Acceptance:

```text
prompt
→ valid DrawingProgram
→ image
```

Generate four candidates.

Malformed output should be visible but recoverable.

---

## Milestone 3 — human preference

Add:

```text
select
variations
continue
critique
history
```

Acceptance:

A student can explore several generations without losing ancestry.

---

## Milestone 4 — medium experiment

Add:

```text
same program
Flat Canvas ↔ Watercolor
```

Acceptance:

One button provides a controlled renderer comparison.

This is the first classroom-ready release.

---

## Milestone 5 — dataset collection

Add:

```text
session export
SFT export
preference export
```

Acceptance:

Ten minutes of interaction produces a readable `.jsonl` training dataset.

---

## Milestone 6 — LoRA

Add small-model SFT outside the browser.

Acceptance:

Demonstrate measurable before/after difference in DSL validity or stylistic behavior.

---

## Milestone 7 — Reward Lab

Add a tiny fast-learning policy.

Acceptance:

Students can:

1. select a reward;
2. start training;
3. watch mean reward change;
4. inspect candidate drawings;
5. observe at least one plausible reward exploit.

---

## Milestone 8 — experimental LLM RL

Only after everything above works.

Attempt GRPO or comparable policy optimization using the same Medium and reward interfaces.

---

# 32. First classroom demonstration

Design around a 15–25 minute sequence.

### A. Human writes code

Show:

```text
circle
fill
polygon
```

Students recognize creative coding.

### B. Model writes the same language

Prompt:

```text
three flowers leaning into the wind
```

Generate four outputs.

### C. Change medium, not intelligence

Render equivalent geometry as:

```text
Flat Canvas
Watercolor
```

Discuss where aesthetic character came from.

### D. Replace the medium entirely

Switch to:

```text
Pixel
```

Ask the same model for a small sprite/composition.

The available vocabulary changes.

### E. Human preference

Choose one of four.

Generate descendants.

Point out:

```text
model has not learned anything yet
```

Only context changed.

### F. Fine-tuning

Show a before/after small LoRA if available.

Now weights changed.

### G. Reinforcement learning

Open Reward Lab.

Let a policy optimize a deliberately incomplete reward.

Watch what it discovers.

---

# 33. Core conceptual experiment

The application should make this matrix easy to explore:

```text
             MODEL

          small   larger
        ┌───────┬───────┐
flat    │       │       │
        ├───────┼───────┤
water   │       │       │
        ├───────┼───────┤
pixel   │       │       │
        └───────┴───────┘
          MEDIUM
```

Later:

```text
MODEL × MEDIUM × CRITIC × TRAINING
```

This is more important than maximizing image quality.

---

# 34. Design principle

Treat the model as one component of a creative system rather than the source of the finished artwork.

A beautiful output might come from:

```text
strong model
weak renderer
```

or:

```text
weak model
strong renderer
```

or:

```text
simple model
well-designed action space
strong human selection
```

The software should make those distinctions experimentally accessible.

---

# 35. Codex implementation instruction

Begin with Milestones 1–4 only.

Priorities:

1. smallest understandable implementation;
2. renderer modularity;
3. safe constrained action language;
4. true pixel renderer;
5. p5.brush renderer;
6. Ollama model integration;
7. four-candidate preference loop;
8. same-program renderer comparison.

Do not implement training until the basic studio is stable.

Do not introduce React or backend infrastructure unless a concrete limitation requires it.

Keep individual modules readable enough to use directly in a creative-coding classroom.

After Milestone 4, report:

- file structure;
- architectural choices;
- how each Medium is registered;
- how a new Medium can be added;
- how model capabilities are included in prompts;
- current Ollama models tested;
- known failure cases;
- what is required next for dataset collection and LoRA.