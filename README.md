# Artist–Model Studio (AMS)

> **A human-in-the-loop creative coding studio for fine-tuning, evaluating, and running generative art models on local Apple Silicon & WebGPU.**

[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF.svg)](https://vitejs.dev/)
[![Apple Silicon](https://img.shields.io/badge/Hardware-Apple%20M5%20Max%20128GB-black.svg)]()
[![LoRA](https://img.shields.io/badge/Training-In--Browser%20LoRA-brightgreen.svg)]()
[![WebMCP](https://img.shields.io/badge/Agent%20API-WebMCP-blueviolet.svg)]()

---

## 🎨 Key Capabilities

1. **Parallel 4-Candidate Art Generation**:
   - Generates 4 distinct variations per prompt with configurable variation temperature (Low, Medium, High, Wild).
   - Generates typed, sandboxed JSON visual programs rather than raw pixels.
2. **Multi-Media Visual Simulation**:
   - **Watercolor**: Organic pigment bleed, granulation, paper textures, and wet-on-wet blending via `p5.brush`.
   - **Pixel Art**: True 32×32 / 64×64 integer coordinate grid with indexed color palettes and symmetry modes.
   - **Flat 2D / Bauhaus**: Clean geometric primitives, circles, and primary color compositions.
3. **Interactive Visual Rating & Human Preference Collection**:
   - 1-to-5 star candidate ratings.
   - 1-click active candidate selection for DPO (Direct Preference Optimization) pair recording (`chosen` vs `rejected`).
4. **Reward Lab & Automated Critique**:
   - Deterministic rule-based evaluation scores: Color Harmony, Stroke Economy, Dynamic Range, and Composition Hierarchy.
5. **In-Browser LoRA Fine-Tuning**:
   - Train lightweight adapter matrices ($r=4..32$) directly in JavaScript without sending data to external servers.
   - 100 epochs complete in **~13.4 ms/epoch (74.5 epochs/sec)** on Apple M5 Max.
6. **Portable Model Format (`.ams-model.json`)**:
   - Export and import trained models and adapters seamlessly across browser sessions or machines.
7. **Apple Silicon M5 Max Hardware Estimator**:
   - In-app interactive calculator estimating memory footprint, tokens/second, and duration across 8 models (135M to 70B) for Apple Silicon (M5 Max, M4 Max, M3/M2 Pro, M1) and WebGPU.
8. **WebMCP & Agent Programmatic API**:
   - Full JSON-RPC 2.0 tool interface exposed on `window.ams` and `window.webmcp` for autonomous AI agents.

---

## 🚀 Quick Start

### 1. Install & Run Locally

```bash
# Clone repository
git clone https://github.com/liuboto/artistmodelstudio.git
cd artistmodelstudio

# Install dependencies
npm install

# Start Vite development server
npm run dev
```

Open your browser at `http://localhost:3000`.

### 2. Run Tests

```bash
npm test
```

---

## 🤖 Supported Inference Engines

- **Mock / Procedural Engine**: Offline, zero-dependency procedural generator covering avian, mountain landscapes, Bauhaus abstract, creatures, and floral scenes.
- **In-Browser WebGPU**: Runs quantized models client-side with hardware acceleration via `@huggingface/transformers` (e.g. SmolLM2-135M, Liquid LFM2.5-1.2B, Qwen2.5-0.5B, Gemma-2-2B).
- **Local Ollama**: Connects to `http://localhost:11434` with auto-detected local LLMs.
- **OpenRouter**: Access to 400+ cloud models (Claude 3.5 Sonnet, GPT-4o, Gemini 1.5 Pro) with in-app model explorer.
- **Trained Model Engine**: Runs locally fine-tuned LoRA models stored in browser memory or imported `.ams-model.json` files.

---

## 📚 Documentation

- [Training, Fine-Tuning & M5 Max Hardware Guide](docs/TRAINING.md)
- [System Architecture & Drawing Language](docs/architecture.md)
- [Experiments & Benchmark Log](docs/experiments.md)
- [Classroom Demo Walkthrough](docs/classroom-demo.md)

---

## 💻 Apple Silicon M5 Max Benchmarks

| Model | Parameters | LoRA Config | RAM Footprint (4-bit) | M5 Max Speed | 50 Samples (6 Epochs) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **SmolLM2-135M** | 135M | $r=4, \alpha=8$ | ~0.25 GB (< 0.2%) | 16,500 tok/s | **~0.3s** |
| **Qwen2.5-0.5B** | 500M | $r=8, \alpha=16$ | ~0.55 GB (~0.4%) | 8,800 tok/s | **~1.1s** |
| **Liquid LFM2.5-1.2B** | 1.2B | $r=16, \alpha=32$ | ~1.15 GB (~0.9%) | 4,200 tok/s | **~2.4s** |
| **Gemma-4-12B (MLX)** | 12B | $r=32, \alpha=64$ | ~8.20 GB (~6.4%) | 1,400 tok/s | **~18s** |
| **Qwen2.5-32B (MLX)** | 32B | $r=32, \alpha=64$ | ~21.5 GB (~16.8%) | 650 tok/s | **~45s** |
| **Llama-3.3-70B (QLoRA)**| 70B | $r=32, \alpha=64$ | ~44.0 GB (~34.4%) | 320 tok/s | **~1.5m** |

*Measured on Apple M5 Max with 128 GB Unified Memory.*

---

## 📄 License

MIT License © 2026 Artist–Model Studio contributors.
