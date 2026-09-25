#!/usr/bin/env python3
"""
DPO (Direct Preference Optimization) Training Scaffolding for Artist Model Studio.
Loads pairwise chosen vs rejected drawing programs exported from the preference loop.
"""

import argparse
import json
import os
import sys

def parse_args():
    parser = argparse.ArgumentParser(description="Train preference model using DPO")
    parser.add_argument("--model", type=str, default="liquidai/lfm2.5-1.2b-instruct")
    parser.add_argument("--data", type=str, required=True, help="Path to preference.jsonl")
    parser.add_argument("--output", type=str, default="models/artist-dpo")
    return parser.parse_args()

def main():
    args = parse_args()
    print("=" * 60)
    print(" Artist Model Studio : DPO Preference Training")
    print("=" * 60)
    if not os.path.exists(args.data):
        print(f"Error: {args.data} not found", file=sys.stderr)
        sys.exit(1)

    pairs = []
    with open(args.data, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                pairs.append(json.loads(line))

    print(f"Loaded {len(pairs)} preference pairs (chosen > rejected).")
    print(f"Base model: {args.model}")
    print(f"Output directory: {args.output}")
    print("Ready for DPOTrainer integration.")

if __name__ == "__main__":
    main()
