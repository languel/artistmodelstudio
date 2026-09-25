"""Turn Decide-panel labels (ams-decisions.jsonl) into a lev training suite.

A lev suite is a directory with train / calibration / development / test JSONL partitions and a
manifest.json that lev's loader checks (sha256, record and question counts per file, the pinned base
revision, and which sources may be trained on). Each record is a labelled request with a _meta block:

    {"state": "...", "questions": {id: {type, instructions, criteria, label, src}}, "_meta": {id, group_id, source, ...}}

    uv run --project ~/dev/lev python training/decisions/make_suite.py ams-decisions.jsonl --out training/decisions/suites/ams-v1 \
        --mix ~/dev/lev/evals/v4/decision-v4 --mix-records 3000

Partitions are made per drawing (subject), so no drawing's steps appear in two of them. --mix adds records from
an existing lev suite to train and calibration only (so the model keeps its general skills); development and
test stay pure AMS, so their scores measure the drawing decisions.
"""
import argparse
import hashlib
import json
import random
from collections import defaultdict
from pathlib import Path

SPLITS = ("train", "calibration", "development", "test")
SOURCE = "ams"
# lev pins its bases here (lev/model.py BASE_REVISIONS); the trainer refuses unpinned bases.
BASE_REVISIONS = {"LiquidAI/LFM2.5-350M": "9e6c6ccf47cd318696e137d381a7ded8fe4df09f",
                  "LiquidAI/LFM2.5-350M-Base": "9960764e30892e01f29a6dc23df2533fcd8bd5ae"}
KEV_SUITES = ("jaredpalmer/kev-suites", "a3318ddc1f630c5673232efacd8123a84de3f480")


def load(paths, sources):
    records = []
    for p in paths:
        for line in Path(p).expanduser().read_text().splitlines():
            if not line.strip():
                continue
            r = json.loads(line)
            meta = r.get("meta") or {}
            if sources and meta.get("source") not in sources:
                continue
            qs = {k: q for k, q in r["questions"].items() if q.get("label") is not None}
            if not qs:
                continue
            group = meta.get("subject") or r["state"][:80]
            rid = hashlib.sha256(json.dumps([r["state"], qs], sort_keys=True).encode()).hexdigest()[:16]
            records.append({"state": r["state"], "questions": qs,
                            "_meta": {"id": f"{SOURCE}/{rid}", "group_id": f"{SOURCE}/{group}", "source": SOURCE, "variant": "clean",
                                      "labeller": meta.get("source"), "backend": meta.get("backend"), "t": meta.get("t")}})
    # the same state answered twice (e.g. re-exported) counts once
    return list({r["_meta"]["id"]: r for r in records}.values())


def split(records, ratios, seed):
    groups = defaultdict(list)
    for r in records:
        groups[r["_meta"]["group_id"]].append(r)
    keys = sorted(groups)
    random.Random(seed).shuffle(keys)
    out = {s: [] for s in SPLITS}
    targets = dict(zip(SPLITS, (x * len(records) for x in ratios)))
    for k in keys:
        s = max(SPLITS, key=lambda s: targets[s] - len(out[s]))   # the partition furthest below its target
        out[s].extend(groups[k])
    missing = [s for s in SPLITS if not out[s]]
    if missing:
        print(f"warning: too few drawings for separate {', '.join(missing)}; borrowing training records (scores will be optimistic)")
        for s in missing:
            out[s] = out["train"][-max(1, len(out["train"]) // 10):]
    return out


def mix_file(suite_dir, name):
    path = Path(suite_dir).expanduser() / name
    if path.exists():
        return path
    # lev's frozen suites keep large training partitions on the Hub
    from huggingface_hub import hf_hub_download
    root = next(p for p in path.parents if p.name == "evals")
    return Path(hf_hub_download(KEV_SUITES[0], str(path.relative_to(root)), repo_type="dataset", revision=KEV_SUITES[1]))


def mix_in(out, suite_dir, n_train, seed):
    rng = random.Random(seed)
    manifest = json.loads((Path(suite_dir).expanduser() / "manifest.json").read_text())
    allowed = set(manifest.get("trainable_sources", []))
    added = set()
    for s, n in (("train", n_train), ("calibration", max(50, n_train // 10))):
        pool = [json.loads(l) for l in mix_file(suite_dir, f"{s}.jsonl").read_text().splitlines() if l.strip()]
        pool = [r for r in pool if r["_meta"]["source"] in allowed and r["_meta"]["source"] != "compositional"]
        pick = rng.sample(pool, min(n, len(pool)))
        added |= {r["_meta"]["source"] for r in pick}
        out[s].extend(pick)
    return sorted(added)


def write(out, dest, trainable, note):
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    files = {}
    for s in SPLITS:
        body = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in out[s])
        (dest / f"{s}.jsonl").write_text(body)
        files[f"{s}.jsonl"] = {"sha256": hashlib.sha256(body.encode()).hexdigest(), "records": len(out[s]),
                               "questions": sum(len(r["questions"]) for r in out[s])}
    manifest = {"version": 3, "name": dest.name, "note": note, "base_revisions": BASE_REVISIONS,
                "holdout_sources": [], "trainable_sources": trainable, "eval_only_sources": [],
                "context": {"max_state": 384, "max_branch": 1024, "max_packed": 2048, "truncate": False}, "files": files}
    (dest / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("labels", nargs="+", help="ams-decisions.jsonl file(s) exported from the Decide panel")
    ap.add_argument("--out", default="training/decisions/suites/ams-v1")
    ap.add_argument("--sources", default="you,accepted,agent", help="which labellers to keep")
    ap.add_argument("--ratios", default="0.7,0.1,0.1,0.1", help="train,calibration,development,test")
    ap.add_argument("--repeat", type=int, default=1, help="repeat AMS training records (oversample a small set against the mix)")
    ap.add_argument("--mix", help="a lev suite directory to mix into train/calibration, e.g. ~/dev/lev/evals/v4/decision-v4")
    ap.add_argument("--mix-records", type=int, default=3000)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    records = load(a.labels, set(a.sources.split(",")) if a.sources else None)
    if not records:
        raise SystemExit("No labelled records found (check --sources).")
    out = split(records, [float(x) for x in a.ratios.split(",")], a.seed)
    out["train"] = [dict(r, _meta={**r["_meta"], "id": f'{r["_meta"]["id"]}#{i}' if i else r["_meta"]["id"]}) for i in range(a.repeat) for r in out["train"]]
    trainable = [SOURCE]
    if a.mix:
        trainable += mix_in(out, a.mix, a.mix_records, a.seed)
    for s in SPLITS:
        random.Random(a.seed).shuffle(out[s])
    m = write(out, a.out, trainable, f"AMS decisions from {', '.join(a.labels)}" + (f" + {a.mix_records} from {a.mix}" if a.mix else ""))
    print(json.dumps({k: v["records"] for k, v in m["files"].items()}), "→", a.out)


if __name__ == "__main__":
    main()
