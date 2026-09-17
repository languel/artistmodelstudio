# Artist–Model Studio: Training Scaffolding

This directory contains standalone Python training scripts designed to train local models on datasets exported from **Artist–Model Studio**.

The browser application remains local-first and lightweight; its responsibility ends at dataset export and inference. Downstream training occurs externally using standard tooling (MLX on Apple Silicon, PyTorch, Hugging Face TRL).

---

## 1. Directory Structure

```text
training/
├── sft/
│   └── train.py          # Supervised Fine-Tuning (SFT) & LoRA script
├── preference/
│   └── train.py          # Direct Preference Optimization (DPO) script
└── rl/
    └── train.py          # Simple Policy Gradient / GRPO rollout training
```

---

## 2. Supervised Fine-Tuning (SFT / LoRA)

Export an SFT dataset (`sft.jsonl`) from the studio's **DATASETS** tab.
Each line has the standard conversational format:

```json
{
  "messages": [
    { "role": "user", "content": "three sparse red flowers bending left" },
    { "role": "assistant", "content": "{\"version\":1,\"actions\":[...]}" }
  ]
}
```

Run training on Apple Silicon using MLX or Hugging Face:

```bash
# Using MLX-LM on Apple Silicon (recommended for M-series Macs):
python training/sft/train.py \
  --backend mlx \
  --model liquidai/lfm2.5-1.2b-instruct \
  --data exports/sft.jsonl \
  --output models/artist-lora
```

---

## 3. Preference Learning (DPO)

Export a Preference dataset (`preference.jsonl`) from the studio:

```json
{
  "prompt": "three red flowers",
  "chosen": "{ ... winning program B ... }",
  "rejected": "{ ... rejected program D ... }"
}
```

Run DPO training:

```bash
python training/preference/train.py \
  --model liquidai/lfm2.5-1.2b-instruct \
  --data exports/preference.jsonl \
  --output models/artist-dpo
```

---

## 4. Downstream Deployment back to Studio

Once LoRA weights or merged models are exported:
1. Export model weights to GGUF or Ollama Modelfile:
   ```dockerfile
   FROM liquidai/lfm2.5-1.2b-instruct
   ADAPTER ./models/artist-lora
   ```
2. Create Ollama model:
   ```bash
   ollama create studio-painter -f Modelfile
   ```
3. In **Artist–Model Studio**, select `studio-painter` from the Model dropdown!
