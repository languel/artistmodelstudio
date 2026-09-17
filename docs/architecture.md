# Architecture Overview

**Artist–Model Studio** is built upon four primary abstractions:

```text
                  ┌──────────────┐
                  │    Artist    │  (Ollama, In-Browser WebGPU, Mock)
                  └──────┬───────┘
                         │
                    DrawingProgram (JSON)
                         │
                         ▼
                  ┌──────────────┐
                  │    Medium    │  (Flat Canvas, Watercolor, Pixel)
                  └──────┬───────┘
                         │
                       image
                         │
               ┌─────────┴─────────┐
               ▼                   ▼
          human choice           Critic  (Human critique / Model critique)
               │                   │
               └─────────┬─────────┘
                         │
                      reward
                         │
                         ▼
                     Trainer     (SFT / LoRA / DPO / RL)
```

---

## 1. Action Language & DrawingProgram

The system forbids execution of arbitrary JavaScript from models. Instead, drawing programs are strictly typed JSON structures adhering to `{ version: 1, actions: [...] }`.

### Coordinate Spaces:
1. **Normalized Space** (`FlatCanvasMedium`, `WatercolorMedium`):
   - `x`: `[-1.0, 1.0]` (left to right, center is `0.0`)
   - `y`: `[-1.0, 1.0]` (top to bottom, center is `0.0`)
   - Size/diameter: `0.05` to `1.5`
2. **Discrete Pixel Space** (`PixelMedium`):
   - Integer grid coordinates: `x: [0, cols - 1]`, `y: [0, rows - 1]` (e.g. 32×48)
   - Palette index: integer `0..4` or hex string

### Human-Readable DSL
The studio provides bidirectional lossless translation between JSON and clean human text:

```text
background #faf7f2
bleed 0.35
fill #ce526d 0.8
circle -0.5 -0.2 0.35
```

---

## 2. Media Abstraction (`src/media/`)

Each medium implements:
- `capabilities()`: Declares supported operations, coordinate system, and extensions.
- `render(program)`: Executes drawing actions and returns `{ image: dataUrl, executionTimeMs, warnings }`.
- `validate(program)`: Validates actions against capabilities.

### Registered Media:
- **Flat Canvas** (`src/media/FlatCanvasMedium.js`): Pure 2D canvas baseline with 0 aesthetic embellishment.
- **Watercolor** (`src/media/WatercolorMedium.js`): Organic washes, pigment bleed, paper grain, and hatching via `p5.brush`.
- **Pixel** (`src/media/PixelMedium.js`): True discrete integer pixel grid with symmetry tools and nearest-neighbor scaling.

### Adding a New Medium:
Subclass `Medium` in `src/media/MyNewMedium.js` and register it with `defaultMediaRegistry.register(new MyNewMedium())`.

---

## 3. Artist Abstraction (`src/artists/`)

Each artist implements:
- `generate(request)`: Returns an array of generated candidates with execution timings.

### Registered Artists:
- **OllamaArtist**: Connects to local Ollama (`http://localhost:11434`), auto-detects installed models, and queries with structured JSON schema.
- **WebGPUTransformersArtist**: Executes in-browser language models using WebGPU and `@huggingface/transformers` (e.g. SmolLM, Gemma, Qwen).
- **MockArtist**: Procedural drawing generator for instant, offline classroom testing.

### Dynamic Prompt Generation:
`src/artists/promptBuilder.js` constructs the system prompt dynamically from `medium.capabilities()`. The model never generates operations unsupported by the active medium.

---

## 4. Sessions & Dataset Collection (`src/sessions/`)

- Full ancestral tracking: parent IDs, generation indices, selection states, ratings, and human critiques.
- Export to **Session JSON**, **SFT JSONL** (chat format), and **Preference JSONL** (chosen vs rejected).

---

## 5. Deterministic Reward Lab (`src/rewards/`)

- Transparent deterministic reward components:
  - `validity`
  - `redness`
  - `leftness`
  - `shapeCount`
  - `emptySpace`
- Interactive sliders let students vary weights and observe how a fast parameter policy optimizes drawing actions, discovering classic "reward hacks" (e.g. microscopic dots).
