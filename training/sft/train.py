#!/usr/bin/env python3
"""
SFT / LoRA Training CLI Scaffolding for Artist–Model Studio.
Demonstrates training a small causal language model on exported SFT JSONL datasets.
Supports MLX-LM on Apple Silicon and Hugging Face PEFT/TRL.
"""

import argparse
import json
import os
import sys

def parse_args():
    parser = argparse.ArgumentParser(description="Fine-tune artist model with LoRA on drawing DSL datasets")
    parser.add_argument("--model", type=str, default="liquidai/lfm2.5-1.2b-instruct", help="Base model identifier")
    parser.add_argument("--data", type=str, required=True, help="Path to exported sft.jsonl")
    parser.add_argument("--output", type=str, default="models/artist-lora", help="Output directory for adapters")
    parser.add_argument("--backend", type=str, choices=["mlx", "hf", "dry-run"], default="dry-run", help="Training backend")
    parser.add_argument("--epochs", type=int, default=3, help="Number of training epochs")
    parser.add_argument("--lr", type=float, default=1e-4, help="Learning rate")
    return parser.parse_args()

def validate_dataset(filepath):
    valid_count = 0
    with open(filepath, "r", encoding="utf-8") as f:
        for idx, line in enumerate(f):
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            assert "messages" in record, f"Line {idx} missing messages array"
            assert len(record["messages"]) >= 2, f"Line {idx} messages must have at least 2 entries"
            valid_count += 1
    print(f"[OK] Verified {valid_count} SFT conversation pairs in {filepath}")
    return valid_count

def main():
    args = parse_args()
    print("=" * 60)
    print(" Artist–Model Studio : SFT / LoRA Training Pipeline")
    print("=" * 60)
    print(f"Base Model : {args.model}")
    print(f"Dataset    : {args.data}")
    print(f"Output Dir : {args.output}")
    print(f"Backend    : {args.backend}")

    if not os.path.exists(args.data):
        print(f"[Error] Dataset file not found: {args.data}", file=sys.stderr)
        sys.exit(1)

    count = validate_dataset(args.data)

    if args.backend == "mlx":
        print("\nLaunching MLX-LM LoRA fine-tuning...")
        cmd = [
            "python", "-m", "mlx_lm.lora",
            "--model", args.model,
            "--data", os.path.dirname(args.data),
            "--train",
            "--iters", str(count * args.epochs),
            "--adapter-path", args.output
        ]
        print("Command:", " ".join(cmd))
    elif args.backend == "hf":
        print("\nLaunching Hugging Face TRL SFTTrainer...")
        print("Configure peft_config = LoraConfig(r=16, lora_alpha=32)...")
    else:
        print("\n[Dry Run] Dataset verified. Backend set to dry-run. Ready for full training.")

if __name__ == "__main__":
    main()
