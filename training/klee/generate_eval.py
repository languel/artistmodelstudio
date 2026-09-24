#!/usr/bin/env python3
"""
Generate programs for the held-out Klee prompts (data/eval_prompts.jsonl) with
a base model, optionally plus a LoRA adapter, using the same chat format as
training. Output: runs/eval/<name>.jsonl, scored and rendered by eval.html.

Usage:
  training/.venv/bin/python training/klee/generate_eval.py --model Qwen/Qwen3-0.6B --name qwen3-base
  training/.venv/bin/python training/klee/generate_eval.py --model Qwen/Qwen3-0.6B \
      --adapter training/klee/runs/qwen3-0.6b/adapter --name qwen3-lora
  # A larger model, prompted only (no fine-tuning), through a local Ollama server:
  training/.venv/bin/python training/klee/generate_eval.py --ollama gemma4:12b-mlx --name gemma4-12b-prompted --budgets 24 --samples 1
"""
import argparse
import json
import time
from pathlib import Path

import urllib.request

from build_sft import DISTILL_SYSTEM

HERE = Path(__file__).parent
TOKENS_PER_SHAPE = 34  # ~30 measured for Qwen/LFM tokenizers, plus headroom


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model")
    ap.add_argument("--ollama", help="Ollama model name; generates through http://localhost:11434 instead of mlx-lm")
    ap.add_argument("--budgets", help="comma-separated subset of budgets, e.g. 24")
    ap.add_argument("--adapter")
    ap.add_argument("--name", required=True)
    ap.add_argument("--samples", type=int, default=2)
    ap.add_argument("--temp", type=float, default=0.8)
    ap.add_argument("--top-p", type=float, default=0.95)
    ap.add_argument("--batch", type=int, default=16)
    ap.add_argument("--limit", type=int, default=0)
    args = ap.parse_args()

    prompts = [json.loads(l) for l in (HERE / "data/eval_prompts.jsonl").read_text().splitlines() if l.strip()]
    if args.budgets:
        keep = {int(b) for b in args.budgets.split(",")}
        prompts = [p for p in prompts if p["budget"] in keep]
    if args.limit:
        prompts = prompts[: args.limit]
    out_dir = HERE / "runs/eval"
    out_dir.mkdir(parents=True, exist_ok=True)
    if args.ollama:
        return run_ollama(args, prompts, out_dir)

    from mlx_lm import batch_generate, load
    from mlx_lm.sample_utils import make_sampler
    model, tok = load(args.model, adapter_path=args.adapter)

    jobs = []
    for p in prompts:
        messages = [{"role": "system", "content": DISTILL_SYSTEM}, {"role": "user", "content": p["user"]}]
        ids = tok.apply_chat_template(messages, add_generation_prompt=True, enable_thinking=False)
        for s in range(args.samples):
            jobs.append((p, s, ids, 60 + TOKENS_PER_SHAPE * p["budget"] * 3 // 2))

    out = []
    sampler = make_sampler(temp=args.temp, top_p=args.top_p)
    t0 = time.time()
    for i in range(0, len(jobs), args.batch):
        chunk = jobs[i:i + args.batch]
        t = time.time()
        resp = batch_generate(model, tok, [j[2] for j in chunk], max_tokens=[j[3] for j in chunk], sampler=sampler)
        dt = time.time() - t
        for (p, s, ids, max_tokens), text in zip(chunk, resp.texts):
            out.append({"id": p["id"], "title": p["title"], "budget": p["budget"], "sample": s,
                        "model": args.name, "text": text, "max_tokens": max_tokens,
                        "batch_seconds": round(dt, 2)})
        print(f"{min(i + args.batch, len(jobs))}/{len(jobs)} in {time.time() - t0:.0f}s", flush=True)

    (out_dir / f"{args.name}.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in out))
    meta = {"name": args.name, "model": args.model, "adapter": args.adapter, "samples": args.samples,
            "temp": args.temp, "top_p": args.top_p, "prompts": len(prompts), "seconds": round(time.time() - t0, 1)}
    (out_dir / f"{args.name}.meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta))


def run_ollama(args, prompts, out_dir):
    out, t0 = [], time.time()
    for i, p in enumerate(prompts):
        for s in range(args.samples):
            body = {"model": args.ollama, "stream": False, "think": False,
                    "options": {"temperature": args.temp, "top_p": args.top_p, "num_predict": 60 + TOKENS_PER_SHAPE * p["budget"] * 3 // 2},
                    "messages": [{"role": "system", "content": DISTILL_SYSTEM}, {"role": "user", "content": p["user"]}]}
            req = urllib.request.Request("http://localhost:11434/api/chat", data=json.dumps(body).encode(),
                                         headers={"Content-Type": "application/json"})
            t = time.time()
            text = json.loads(urllib.request.urlopen(req, timeout=600).read())["message"]["content"]
            # Large chat models often wrap code in ``` fences; drop those lines so formatting habits
            # are not scored as invalid drawing commands.
            text = "\n".join(l for l in text.split("\n") if not l.strip().startswith("```"))
            out.append({"id": p["id"], "title": p["title"], "budget": p["budget"], "sample": s, "model": args.name,
                        "text": text, "seconds": round(time.time() - t, 2)})
        print(f"{i + 1}/{len(prompts)} in {time.time() - t0:.0f}s", flush=True)
    (out_dir / f"{args.name}.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in out))
    meta = {"name": args.name, "ollama": args.ollama, "samples": args.samples, "temp": args.temp,
            "prompts": len(prompts), "seconds": round(time.time() - t0, 1)}
    (out_dir / f"{args.name}.meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta))


if __name__ == "__main__":
    main()
