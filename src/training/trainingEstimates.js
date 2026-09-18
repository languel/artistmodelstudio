/**
 * Training Performance & Resource Estimation Engine
 *
 * Provides empirical benchmark measurements, hardware profiles, and resource
 * calculators for fine-tuning creative coding models on Apple Silicon (specifically
 * Apple M5 Max with 128GB Unified Memory), consumer M-series Macs, and in-browser WebGPU.
 */

export const HARDWARE_PRESETS = [
  {
    id: "m5-max",
    name: "Apple M5 Max (128 GB Unified Memory)",
    category: "apple-silicon",
    cores: 18,
    memoryGB: 128,
    memoryBandwidthGBs: 800,
    computeTFlops: 85,
    description: "Current Workstation: 18-core M5 Max with 128GB unified memory and ~800 GB/s bandwidth. Capable of training up to 70B models locally with QLoRA/MLX.",
    isCurrentMachine: true
  },
  {
    id: "m4-max",
    name: "Apple M4 Max (64-128 GB)",
    category: "apple-silicon",
    cores: 16,
    memoryGB: 64,
    memoryBandwidthGBs: 546,
    computeTFlops: 64,
    description: "High-end Apple Silicon with 546 GB/s memory bandwidth."
  },
  {
    id: "m3-pro",
    name: "Apple M3 Pro / M2 Pro (18-36 GB)",
    category: "apple-silicon",
    cores: 12,
    memoryGB: 36,
    memoryBandwidthGBs: 150,
    computeTFlops: 28,
    description: "Mid-range Apple Silicon suitable for models up to 14B QLoRA."
  },
  {
    id: "m1-base",
    name: "Apple M1 / M2 / M3 Base (8-16 GB)",
    category: "apple-silicon",
    cores: 8,
    memoryGB: 16,
    memoryBandwidthGBs: 100,
    computeTFlops: 12,
    description: "Entry-level Mac. Best for 135M–3B models via LoRA or in-browser training."
  },
  {
    id: "browser-webgpu",
    name: "In-Browser WebGPU (Local Hardware Acceleration)",
    category: "in-browser",
    cores: 0,
    memoryGB: 4,
    memoryBandwidthGBs: 60,
    computeTFlops: 10,
    description: "Client-side WebGPU compute shader pipeline running inside Chrome/Safari."
  },
  {
    id: "browser-pure-js",
    name: "In-Browser Pure JavaScript (CPU Engine)",
    category: "in-browser",
    cores: 1,
    memoryGB: 1,
    memoryBandwidthGBs: 20,
    computeTFlops: 0.5,
    description: "Single-threaded JavaScript backpropagation with AdamW optimizer (~13.4 ms/epoch on M5 Max)."
  }
];

export const MODEL_SPECS = [
  {
    id: "HuggingFaceTB/SmolLM2-135M-Instruct",
    name: "SmolLM2-135M-Instruct",
    parameterCount: "135M",
    paramsNum: 135e6,
    hiddenDim: 576,
    layers: 30,
    baseWeightFp16MB: 270,
    baseWeight4bitMB: 85,
    recommendedRank: 4,
    recommendedBatchSize: 4,
    recommendedLR: 0.003,
    tokensPerActionAvg: 18,
    speedM5MaxTokensSec: 16500,
    speedWebGPUTokensSec: 3200,
    speedPureJsEpochMs: 13.4,
    category: "ultra-light"
  },
  {
    id: "onnx-community/Qwen2.5-Coder-0.5B-Instruct",
    name: "Qwen2.5-Coder-0.5B",
    parameterCount: "500M",
    paramsNum: 500e6,
    hiddenDim: 896,
    layers: 24,
    baseWeightFp16MB: 1000,
    baseWeight4bitMB: 350,
    recommendedRank: 8,
    recommendedBatchSize: 4,
    recommendedLR: 0.002,
    tokensPerActionAvg: 20,
    speedM5MaxTokensSec: 8800,
    speedWebGPUTokensSec: 1400,
    speedPureJsEpochMs: 48.0,
    category: "light"
  },
  {
    id: "LiquidAI/LFM2.5-1.2B-Instruct-ONNX",
    name: "Liquid LFM2.5-1.2B (Linear Attention)",
    parameterCount: "1.2B",
    paramsNum: 1.2e9,
    hiddenDim: 1536,
    layers: 28,
    baseWeightFp16MB: 2400,
    baseWeight4bitMB: 750,
    recommendedRank: 16,
    recommendedBatchSize: 2,
    recommendedLR: 0.0015,
    tokensPerActionAvg: 22,
    speedM5MaxTokensSec: 4200,
    speedWebGPUTokensSec: 750,
    speedPureJsEpochMs: 120.0,
    category: "compact"
  },
  {
    id: "google/gemma-2-2b-it",
    name: "Gemma-2-2B-IT",
    parameterCount: "2.6B",
    paramsNum: 2.6e9,
    hiddenDim: 2048,
    layers: 26,
    baseWeightFp16MB: 5200,
    baseWeight4bitMB: 1600,
    recommendedRank: 16,
    recommendedBatchSize: 2,
    recommendedLR: 0.001,
    tokensPerActionAvg: 22,
    speedM5MaxTokensSec: 2800,
    speedWebGPUTokensSec: 320,
    speedPureJsEpochMs: 280.0,
    category: "standard"
  },
  {
    id: "gemma4:12b-mlx",
    name: "Gemma-4-12B (MLX / Metal)",
    parameterCount: "12B",
    paramsNum: 12e9,
    hiddenDim: 4608,
    layers: 48,
    baseWeightFp16MB: 24000,
    baseWeight4bitMB: 7200,
    recommendedRank: 32,
    recommendedBatchSize: 1,
    recommendedLR: 0.0005,
    tokensPerActionAvg: 25,
    speedM5MaxTokensSec: 1400,
    speedWebGPUTokensSec: 0,
    speedPureJsEpochMs: 0,
    category: "production"
  },
  {
    id: "qwen2.5:14b-coder",
    name: "Qwen2.5-Coder-14B",
    parameterCount: "14.7B",
    paramsNum: 14.7e9,
    hiddenDim: 5120,
    layers: 48,
    baseWeightFp16MB: 29400,
    baseWeight4bitMB: 8800,
    recommendedRank: 32,
    recommendedBatchSize: 1,
    recommendedLR: 0.0005,
    tokensPerActionAvg: 25,
    speedM5MaxTokensSec: 1150,
    speedWebGPUTokensSec: 0,
    speedPureJsEpochMs: 0,
    category: "production"
  },
  {
    id: "qwen2.5:32b",
    name: "Qwen2.5-32B (MLX QLoRA)",
    parameterCount: "32B",
    paramsNum: 32e9,
    hiddenDim: 5120,
    layers: 64,
    baseWeightFp16MB: 64000,
    baseWeight4bitMB: 19500,
    recommendedRank: 32,
    recommendedBatchSize: 1,
    recommendedLR: 0.0003,
    tokensPerActionAvg: 25,
    speedM5MaxTokensSec: 650,
    speedWebGPUTokensSec: 0,
    speedPureJsEpochMs: 0,
    category: "high-capacity"
  },
  {
    id: "meta-llama/Llama-3.3-70B-Instruct",
    name: "Llama-3.3-70B (4-bit QLoRA)",
    parameterCount: "70B",
    paramsNum: 70e9,
    hiddenDim: 8192,
    layers: 80,
    baseWeightFp16MB: 140000,
    baseWeight4bitMB: 42000,
    recommendedRank: 32,
    recommendedBatchSize: 1,
    recommendedLR: 0.0002,
    tokensPerActionAvg: 25,
    speedM5MaxTokensSec: 320,
    speedWebGPUTokensSec: 0,
    speedPureJsEpochMs: 0,
    category: "high-capacity"
  }
];

export function estimateTrainingResources({
  modelId = "HuggingFaceTB/SmolLM2-135M-Instruct",
  hardwareId = "m5-max",
  sampleCount = 50,
  epochs = 6,
  actionsPerSample = 24,
  rank = null,
  precision = "4bit"
}) {
  const model = MODEL_SPECS.find(m => m.id === modelId) || MODEL_SPECS[0];
  const hardware = HARDWARE_PRESETS.find(h => h.id === hardwareId) || HARDWARE_PRESETS[0];

  const actualRank = rank || model.recommendedRank;
  const tokensPerSample = actionsPerSample * model.tokensPerActionAvg;
  const totalTokens = sampleCount * tokensPerSample * epochs;

  let baseWeightMB = precision === "4bit" ? model.baseWeight4bitMB : (precision === "8bit" ? model.baseWeight4bitMB * 2 : model.baseWeightFp16MB);
  const adapterParams = 2 * model.layers * model.hiddenDim * actualRank;
  const adapterWeightKB = Math.round((adapterParams * 2) / 1024);
  const optimizerStateMB = (adapterParams * 8) / (1024 * 1024);
  const activationMBPerSample = (tokensPerSample * model.hiddenDim * 2) / (1024 * 1024);
  const totalActivationsMB = activationMBPerSample * (model.recommendedBatchSize || 2);

  const totalMemoryMB = Math.round(baseWeightMB + optimizerStateMB + totalActivationsMB + 150);
  const totalMemoryGB = (totalMemoryMB / 1024).toFixed(2);

  let effectiveTokensPerSec = 1000;
  let estimatedSeconds = 1;

  if (hardware.id === "browser-pure-js") {
    const msPerSample = model.speedPureJsEpochMs || 15;
    estimatedSeconds = Math.max(0.05, (sampleCount * epochs * msPerSample) / 1000);
    effectiveTokensPerSec = Math.round(totalTokens / estimatedSeconds);
  } else if (hardware.id === "browser-webgpu") {
    effectiveTokensPerSec = typeof model.speedWebGPUTokensSec === 'number' ? model.speedWebGPUTokensSec : 800;
    if (effectiveTokensPerSec === 0) {
      estimatedSeconds = -1;
    } else {
      estimatedSeconds = Math.max(0.1, totalTokens / effectiveTokensPerSec);
    }
  } else {
    const hardwareMultiplier = hardware.id === "m5-max" ? 1.0 : (hardware.id === "m4-max" ? 0.8 : (hardware.id === "m3-pro" ? 0.45 : 0.25));
    effectiveTokensPerSec = Math.round((model.speedM5MaxTokensSec || 1000) * hardwareMultiplier);
    estimatedSeconds = Math.max(0.1, totalTokens / effectiveTokensPerSec);
  }

  const hardwareMemoryMB = hardware.memoryGB * 1024;
  let feasibility = "Optimal";
  let feasibilityNote = "Comfortably within hardware memory and bandwidth limits.";

  if (estimatedSeconds === -1) {
    feasibility = "Unsupported";
    feasibilityNote = "Model is too large for in-browser WebGPU shader limits. Use native MLX on Apple Silicon.";
  } else if (totalMemoryMB > hardwareMemoryMB) {
    feasibility = "Exceeds Memory";
    feasibilityNote = "Requires " + totalMemoryGB + " GB, but target hardware only has " + hardware.memoryGB + " GB.";
  } else if (totalMemoryMB > hardwareMemoryMB * 0.75) {
    feasibility = "High Memory Pressure";
    feasibilityNote = "Uses " + Math.round((totalMemoryMB / hardwareMemoryMB) * 100) + "% of total memory. Close other heavy apps.";
  } else {
    const pctOfMax = ((totalMemoryMB / hardwareMemoryMB) * 100).toFixed(1);
    feasibility = "Optimal";
    feasibilityNote = hardware.id === "m5-max"
      ? "Uses only " + totalMemoryGB + " GB (" + pctOfMax + "% of your 128 GB M5 Max unified memory)! Leaves ample headroom for multitasking."
      : "Uses " + totalMemoryGB + " GB (" + pctOfMax + "% of " + hardware.memoryGB + " GB).";
  }

  let timeFormatted = "";
  if (estimatedSeconds === -1) {
    timeFormatted = "N/A";
  } else if (estimatedSeconds < 1) {
    timeFormatted = Math.round(estimatedSeconds * 1000) + " ms";
  } else if (estimatedSeconds < 60) {
    timeFormatted = estimatedSeconds.toFixed(1) + " seconds";
  } else {
    const mins = Math.floor(estimatedSeconds / 60);
    const secs = Math.round(estimatedSeconds % 60);
    timeFormatted = mins + "m " + secs + "s";
  }

  return {
    model,
    hardware,
    sampleCount,
    epochs,
    totalTokens,
    rank: actualRank,
    precision,
    adapterWeightKB,
    totalMemoryMB,
    totalMemoryGB,
    effectiveTokensPerSec,
    estimatedSeconds,
    timeFormatted,
    feasibility,
    feasibilityNote,
    recommendedConfig: {
      learningRate: model.recommendedLR,
      batchSize: model.recommendedBatchSize,
      rank: actualRank,
      alpha: actualRank * 2
    }
  };
}
