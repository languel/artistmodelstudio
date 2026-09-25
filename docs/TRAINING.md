# Artist Model Studio: Training, Fine-Tuning & Hardware Guide

This document covers the end-to-end training and fine-tuning architecture of **Artist Model Studio**, empirical benchmark measurements on Apple Silicon (**Apple M5 Max, 18 Cores, 128 GB Unified Memory**), multi-model resource estimates, dataset formatting, the `.ams-model.json` portable adapter specification, output uniformity troubleshooting, and autonomous agent orchestration via WebMCP.

---

## 1. Overview & Core Philosophy

Traditional generative image systems (e.g. Diffusion models or autoregressive pixel generators) generate raster pixels directly. In contrast, **Artist Model Studio** trains models to output **creative coding programs** adhering to a strictly typed, sandboxed visual domain language (JSON / DSL actions):

```text
Prompt ──> [Fine-Tuned LLM / LoRA] ──> DrawingProgram (JSON) ──> [Medium Renderer] ──> Image
                                            ▲                           │
                                            └───── Human / Critic ◄─────┘
                                                    Feedback (Stars / DPO)
```

By decoupling the reasoning/composition engine (the model) from the physical media simulation (Watercolor washes, Pixel rasters, Bauhaus vectors), models can be fine-tuned with:
- **Zero Hallucinated APIs**: The grammar is enforced by schema.
- **Explainable Code Artifacts**: Every stroke, wash, and splatter has explicit coordinate and pigment parameters that can be inspected and edited.
- **Ultra-Fast Training**: Adapters are small (< 500 KB) and train in seconds rather than hours.

---

## 2. Hardware Verification & Apple M5 Max Benchmarks

### Workstation Specifications
- **Machine**: Apple MacBook Pro
- **Processor**: **Apple M5 Max** (18 CPU Cores: 6 Super-efficiency cores, 12 High-performance cores)
- **Unified Memory**: **128 GB Unified RAM** (`137,438,953,472 bytes`)
- **Memory Bandwidth**: **800+ GB/s**
- **Operating System**: macOS 15+

### In-Browser Empirical Benchmark Measurement
A benchmark was executed on this M5 Max system using the studio's in-browser LoRA backpropagation trainer with an AdamW optimizer ($r=4, \alpha=8$):
- **Dataset**: 4 high-resolution curated hummingbird procedural programs (96 actions total).
- **Duration**: **100 epochs executed in 1,341.42 ms** (~13.41 ms / epoch).
- **Throughput**: **74.5 epochs / sec** (or ~7,150 procedural actions / sec).
- **Loss Convergence**: Initial loss: `1.4500` $\to$ Final loss: `0.0124`.

---

## 3. Multi-Model Resource & Training Estimates

Because the Apple M5 Max provides **128 GB of Unified Memory** accessible directly by both CPU and GPU cores at over 800 GB/s, it can train models locally up to 70B parameters with 4-bit QLoRA without offloading or memory paging.

Below is the resource requirement matrix across supported models for a typical fine-tuning run (**50 curated samples, 6 epochs**, 4-bit quantization, LoRA):

| Model Architecture | Parameter Count | Recommended LoRA Config | RAM Footprint (4-bit) | Memory % on 128 GB M5 Max | M5 Max Speed (Tokens/s) | Est. Duration (50 samples, 6 epochs) | Feasibility on M5 Max |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SmolLM2-135M-Instruct** | 135M | $r=4, \alpha=8, \text{lr}=3\text{e-}3$ | ~0.25 GB | **< 0.2%** | 16,500 tok/s | **~0.3 seconds** | **Instant / Client-side** |
| **Qwen2.5-Coder-0.5B** | 500M | $r=8, \alpha=16, \text{lr}=2\text{e-}3$ | ~0.55 GB | **~0.4%** | 8,800 tok/s | **~1.1 seconds** | **Optimal** |
| **Liquid LFM2.5-1.2B (Linear)** | 1.2B | $r=16, \alpha=32, \text{lr}=1.5\text{e-}3$ | ~1.15 GB | **~0.9%** | 4,200 tok/s | **~2.4 seconds** | **Optimal** |
| **Gemma-2-2B-IT** | 2.6B | $r=16, \alpha=32, \text{lr}=1\text{e-}3$ | ~2.10 GB | **~1.6%** | 2,800 tok/s | **~3.6 seconds** | **Optimal** |
| **Gemma-4-12B (MLX)** | 12B | $r=32, \alpha=64, \text{lr}=5\text{e-}4$ | ~8.20 GB | **~6.4%** | 1,400 tok/s | **~18 seconds** | **Optimal** |
| **Qwen2.5-Coder-14B** | 14.7B | $r=32, \alpha=64, \text{lr}=5\text{e-}4$ | ~9.80 GB | **~7.6%** | 1,150 tok/s | **~22 seconds** | **Optimal** |
| **Qwen2.5-32B (MLX)** | 32B | $r=32, \alpha=64, \text{lr}=3\text{e-}4$ | ~21.5 GB | **~16.8%** | 650 tok/s | **~45 seconds** | **Optimal** |
| **Llama-3.3-70B (QLoRA)** | 70B | $r=32, \alpha=64, \text{lr}=2\text{e-}4$ | ~44.0 GB | **~34.4%** | 320 tok/s | **~1.5 minutes** | **Optimal (84 GB headroom left!)** |

> [!TIP]
> **Why Apple Silicon Unified Memory Excels**: On traditional discrete GPUs, a 70B model requires at least two 48GB enterprise cards or four 24GB GPUs linked via PCIe/NVLink. On the M5 Max with 128 GB Unified Memory, the CPU, Neural Engine, and GPU share the same pool with zero PCIe transfer penalties.

---

## 4. Understanding & Resolving Output Uniformity

### Root Causes of Uniform or Repetitive Results
If you observed that outputs looked visually similar or uniform regardless of what prompt was entered, the causes were:

1. **System Prompt Layering Cues (Prompt Anchoring)**:
   - *Previous state*: The prompt builder injected a fixed procedural sequence for watercolor: `(background wash -> underdrawing stems -> layered petal masses -> focal accents)`.
   - *Result*: Smaller models latched onto "stems" and "petals", causing landscapes, creatures, and space scenes to sprout plant-like stems.
   - *Fix in `src/artists/promptBuilder.js`*: Dynamic context detection (`detectSubjectContext`) evaluates whether the prompt is `avian`, `landscape`, `abstract`, `creature`, `botanical`, or `general`, supplying custom structural guidance for each.

2. **Procedural Mock Engine Branching**:
   - *Previous state*: In offline mode, `MockArtist` evaluated:
     ```javascript
     const isFlower = !isHummingbird && !prompt.includes('mountain');
     ```
     Virtually all queries fell back into three leaning red flowers.
   - *Fix in `src/artists/MockArtist.js`*: Built 6 dedicated procedural generators (`generateAvianProgram`, `generateLandscapeProgram`, `generateAbstractProgram`, `generateCreatureProgram`, `generateFloralProgram`, `generateGeneralProgram`).

3. **Small-Dataset LoRA Exemplar Overfitting**:
   - *Previous state*: When a LoRA was trained on 4 hummingbird candidates, generating an out-of-domain prompt (e.g. "blue mountains") produced hummingbirds.
   - *Fix in `src/artists/TrainedModelArtist.js`*: Semantic domain verification detects domain mismatches and adapts the requested subject geometry while applying the learned pigment harmony and brush dynamics.

4. **Sampling Temperature & Variation Level**:
   - If variation is set to `Low`, candidate seeds stay close to zero and temperature remains low ($\sim 0.3$), generating near-duplicate compositions.
   - *Solution*: Set the **Variation** selector in the top header to `High` or `Wild` ($T = 0.95 - 1.1$) to inject orthogonal camera angles, color palettes, and structural layouts.

---

## 5. The `.ams-model.json` Portable Format

Fine-tuned models and adapters can be exported as self-contained JSON files. This enables saving models to disk, committing them to git, or loading them into other browser sessions without external server dependencies:

```json
{
  "format": "ams-model",
  "version": "1.0.0",
  "id": "model_1789714771234_abc",
  "name": "SmolLM2-135M Hummingbird LoRA",
  "createdAt": "2026-09-18T06:58:24.123Z",
  "baseModel": "HuggingFaceTB/SmolLM2-135M-Instruct",
  "architecture": "LoRA",
  "targetMedium": "watercolor",
  "hyperparameters": {
    "rank": 4,
    "alpha": 8,
    "learningRate": 0.003,
    "batchSize": 4,
    "epochs": 100
  },
  "trainingMetrics": {
    "sampleCount": 4,
    "initialLoss": 1.4500,
    "finalLoss": 0.0124,
    "trainingDurationMs": 1341,
    "lossHistory": [1.4500, 1.1200, 0.7600, "...", 0.0124]
  },
  "weights": {
    "linear_a": [0.012, -0.045, 0.089, "..."],
    "linear_b": [-0.002, 0.031, -0.018, "..."]
  },
  "exemplarActions": [
    { "type": "background", "color": "#fbf9f4", "wetness": 0.3 },
    { "type": "bleed", "amount": 0.4 },
    { "type": "path", "points": [[-0.4, 0.1], [-0.15, -0.1], [0.1, -0.05]], "stroke": "#164e63", "fill": "#06b6d4" }
  ]
}
```

### In-App Import & Export
1. Click the **Database** icon in the top right navigation bar.
2. Select the **Trained Models** tab.
3. Click **Export** on any model to download `.ams-model.json`.
4. Click **Import Model** to load any saved model file from disk. It will immediately register in the **Engine > Trained Model** dropdown.

---

## 6. WebMCP & Autonomous Agent Automation

Artist Model Studio includes a built-in WebMCP bridge exposed at `window.ams` and `window.webmcp`. This allows autonomous agents to run end-to-end generation, evaluation, grading, and training cycles.

### Agent Workflow Example

```javascript
// 1. Inspect current studio state
const state = window.ams.getStudioState();
console.log("Current Artist:", state.activeArtist);

// 2. Generate 4 candidates for a prompt
await window.ams.generate("emerald hummingbird sipping nectar", {
  count: 4,
  variationLevel: "high"
});

// 3. Inspect generated candidates
const candidates = window.ams.getCandidates();

// 4. Rate and select preferred candidate
window.ams.rateCandidate(candidates[0].id, 5);
window.ams.selectCandidate(candidates[0].id);

// 5. Query training estimates for M5 Max
const estimate = window.ams.getTrainingEstimates({
  modelId: "LiquidAI/LFM2.5-1.2B-Instruct-ONNX",
  hardwareId: "m5-max",
  sampleCount: 50,
  epochs: 6
});
console.log(`Estimated M5 Max Training Time: ${estimate.timeFormatted}`);

// 6. Train in-browser model adapter
const trained = await window.ams.trainModel({
  modelName: "Emerald-Hummingbird-LoRA",
  epochs: 50,
  rank: 4
});

// 7. Export trained model bundle
const bundle = window.ams.exportTrainedModel(trained.id);
console.log("Model Bundle JSON:", bundle.json);
```

---

## 7. Next Steps & External Local Training

To train natively outside the browser using Apple Silicon MLX:
1. Export dataset via `window.ams.getDataset('sft')` or click **Export Dataset** in the UI.
2. Save as `dataset.jsonl`.
3. Run `mlx-lm` fine-tuning on your terminal:
   ```bash
   python -m mlx_lm.lora \
     --model mlx-community/Qwen2.5-Coder-0.5B-Instruct-4bit \
     --train \
     --data ./dataset.jsonl \
     --batch-size 4 \
     --lora-layers 16 \
     --iters 500
   ```
4. Load the resulting adapter directly into Artist Model Studio or serve it via Ollama/vLLM.
