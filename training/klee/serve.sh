#!/usr/bin/env bash
# Serve a trained Klee model for the "Distilled Klee (local MLX)" engine in AMS.
# The LoRA adapter is fused into the base weights first (once, into runs/<run>/fused):
# mlx-lm 0.31.3's server ignores --adapter-path for the default model, so a fused
# model is the reliable way to serve it. The fused folder is also the starting
# point for an ONNX / browser export.
#
# Usage: training/klee/serve.sh [run-name] [base-model] [port]
# Examples: training/klee/serve.sh lfm25-350m mlx-community/LFM2.5-350M-bf16
#           training/klee/serve.sh qwen3-0.6b Qwen/Qwen3-0.6B
set -euo pipefail
cd "$(dirname "$0")/../.."
RUN=${1:-lfm25-350m}
MODEL=${2:-mlx-community/LFM2.5-350M-bf16}
PORT=${3:-8090}
FUSED=training/klee/runs/$RUN/fused
if [ ! -f "$FUSED/config.json" ]; then
  training/.venv/bin/python -m mlx_lm fuse --model "$MODEL" \
    --adapter-path "training/klee/runs/$RUN/adapter" --save-path "$FUSED"
fi
exec training/.venv/bin/python -m mlx_lm server \
  --model "$FUSED" \
  --port "$PORT" \
  --chat-template-args '{"enable_thinking": false}'
