#!/usr/bin/env python3
"""
Join Reference Fitter programs (data/fits.jsonl, from distill.html) with
captions and titles into chat-format SFT files for mlx-lm:

  data/sft/train.jsonl, data/sft/valid.jsonl   (train-split artworks only)
  data/eval_prompts.jsonl                       (test-split artworks, never trained on)

The system and user prompts mirror src/training/distillFormat.js exactly; a
check at the end compares them with the JS module so the two cannot drift.

Prompt text per seed: seeds 1–2 use the VLM caption, seed 3 the painting's
title, seed 4 "title: caption". Validation holds out whole artwork groups.
"""
import hashlib
import json
import re
from pathlib import Path

HERE = Path(__file__).parent
DATA = HERE / "data"
ROOT = HERE.parent.parent

# Must match DISTILL_SYSTEM in src/training/distillFormat.js (checked below).
DISTILL_SYSTEM = "\n".join([
    "You paint pictures with code. Reply with drawing commands only, one per line:",
    "background #rrggbb",
    "fill #rrggbb",
    "rect x y w h",
    "circle x y d",
    "polygon x1,y1 x2,y2 x3,y3",
    "The canvas runs from -1 to 1 on both axes (y grows downward). rect and circle take a centre point; w, h and d are sizes on the same scale.",
    "Start with background, then put a fill before every shape. Paint large shapes first and details last.",
])
VALID_FRACTION = 0.08


def user_prompt(description, shapes):
    return f"{description.strip()}\nShapes: {shapes}"


def check_js_parity():
    js = (ROOT / "src/training/distillFormat.js").read_text()
    block = re.search(r"DISTILL_SYSTEM = \[(.*?)\]\.join", js, re.S).group(1)
    lines = [json.loads(m) for m in re.findall(r"'((?:[^'\\]|\\.)*)'", block) for m in [f'"{m}"']]
    assert "\n".join(lines) == DISTILL_SYSTEM, "DISTILL_SYSTEM differs between Python and distillFormat.js"


def description_for(seed, title, caption):
    if seed == 3:
        return title
    if seed == 4:
        return f"{title}: {caption}"
    return caption


def main():
    check_js_parity()
    manifest = {r["id"]: r for r in json.loads((HERE / "manifest.json").read_text())["references"]}
    captions = json.loads((HERE / "captions.json").read_text())["captions"]
    fits = [json.loads(l) for l in (DATA / "fits.jsonl").read_text().splitlines() if l.strip()]

    missing = sorted({f["id"] for f in fits if f["id"] not in captions})
    if missing:
        raise SystemExit(f"{len(missing)} images have no caption yet, e.g. {missing[:3]}; run caption.py first")

    def is_valid_group(group):
        return int(hashlib.sha256(("valid:" + group).encode()).hexdigest(), 16) % 1000 / 1000 < VALID_FRACTION

    out = {"train": [], "valid": []}
    for f in fits:
        if f["split"] != "train":
            continue
        ref = manifest[f["id"]]
        desc = description_for(f["seed"], ref["title"], captions[f["id"]]["text"])
        rec = {"messages": [
            {"role": "system", "content": DISTILL_SYSTEM},
            {"role": "user", "content": user_prompt(desc, f["budget"])},
            {"role": "assistant", "content": f["text"]},
        ]}
        out["valid" if is_valid_group(f["group"]) else "train"].append(rec)

    sft = DATA / "sft"
    sft.mkdir(parents=True, exist_ok=True)
    for name, recs in out.items():
        (sft / f"{name}.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in recs))

    # Held-out prompts: one caption prompt per test artwork group, at each budget.
    seen, prompts = set(), []
    for rid, ref in manifest.items():
        if ref["split"] != "test" or ref["group"] in seen:
            continue
        seen.add(ref["group"])
        for budget in sorted({f["budget"] for f in fits}):
            prompts.append({"id": rid, "title": ref["title"], "budget": budget,
                            "caption": captions[rid]["text"],
                            "user": user_prompt(captions[rid]["text"], budget)})
    (DATA / "eval_prompts.jsonl").write_text("".join(json.dumps(p, ensure_ascii=False) + "\n" for p in prompts))
    print(f"train {len(out['train'])}, valid {len(out['valid'])}, eval prompts {len(prompts)} "
          f"({len(seen)} held-out artworks)")


if __name__ == "__main__":
    main()
