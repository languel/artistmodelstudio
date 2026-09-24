#!/usr/bin/env bash
# Train a LoRA adapter on the Klee distillation data with mlx-lm.
# Usage: training/klee/train.sh <hf-model-id> <run-name> [iters] [extra mlx_lm lora args...]
# Example: training/klee/train.sh Qwen/Qwen3.5-0.8B qwen35-0.8b 1200
set -euo pipefail
cd "$(dirname "$0")/../.."
MODEL=${1:?model id}
RUN=${2:?run name}
ITERS=${3:-1200}
OUT=training/klee/runs/$RUN
mkdir -p "$OUT"
PYTHONUNBUFFERED=1 training/.venv/bin/python -m mlx_lm lora \
  -c "${CONFIG:-training/klee/configs/lora.yaml}" \
  --model "$MODEL" \
  --data training/klee/data/sft \
  --iters "$ITERS" \
  --adapter-path "$OUT/adapter" "${@:4}" 2>&1 | tee "$OUT/train.log"
