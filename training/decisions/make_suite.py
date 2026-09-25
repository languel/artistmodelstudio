"""Turn Decide-panel labels (ams-decisions.jsonl) into a lev training suite.

A lev suite is a directory with train / development / calibration / test JSONL splits
and a manifest.json (sha256 and record counts per split). Each record is a labelled
request: {"state": "...", "questions": {id: {type, instructions, criteria, label, src}}}.

    python training/decisions/make_suite.py ams-decisions.jsonl --out suites/ams-v1
    python training/decisions/make_suite.py a.jsonl b.jsonl --sources you,agent --mix ~/dev/lev/suites/core --mix-share 0.3

Splits are by drawing (subject), not by record, so a drawing's steps never leak across splits.
"""
import argparse
import hashlib
import json
import random
from collections import defaultdict
from pathlib import Path

SPLITS = ("train", "development", "calibration", "test")


def load(paths, sources):
    records = []
    for p in paths:
        for line in Path(p).expanduser().read_text().splitlines():
            if not line.strip():
                continue
            r = json.loads(line)
            if sources and (r.get("meta") or {}).get("source") not in sources:
                continue
            qs = {k: q for k, q in r["questions"].items() if q.get("label") is not None}
            if not qs:
                continue
            records.append({"state": r["state"], "questions": qs, "_group": (r.get("meta") or {}).get("subject") or r["state"][:80]})
    return records


def split(records, ratios, seed):
    groups = defaultdict(list)
    for r in records:
        groups[r["_group"]].append(r)
    keys = sorted(groups)
    random.Random(seed).shuffle(keys)
    out = {s: [] for s in SPLITS}
    total = len(records)
    targets = {s: ratios[i] * total for i, s in enumerate(SPLITS)}
    for k in keys:
        # put the group where it is furthest below its target
        s = max(SPLITS, key=lambda s: targets[s] - len(out[s]))
        out[s].extend(groups[k])
    # a tiny dataset still needs something in every split
    for s in SPLITS:
        if not out[s] and out["train"]:
            out[s].append(out["train"][-1])
    return out


def mix_in(out, suite_dir, share, seed):
    """Add a share of an existing lev suite (e.g. lev's own) so the model keeps its general skills."""
    rng = random.Random(seed)
    for s in SPLITS:
        f = Path(suite_dir).expanduser() / f"{s}.jsonl"
        if not f.exists():
            continue
        extra = [json.loads(l) for l in f.read_text().splitlines() if l.strip()]
        n = int(len(out[s]) * share / max(1e-9, 1 - share))
        out[s].extend(rng.sample(extra, min(n, len(extra))))
        rng.shuffle(out[s])


def write(out, dest):
    dest = Path(dest)
    dest.mkdir(parents=True, exist_ok=True)
    manifest = {"name": dest.name, "source": "artist-model-studio decide panel", "splits": {}}
    for s in SPLITS:
        body = "".join(json.dumps({k: v for k, v in r.items() if not k.startswith("_")}, ensure_ascii=False) + "\n" for r in out[s])
        (dest / f"{s}.jsonl").write_text(body)
        manifest["splits"][s] = {"file": f"{s}.jsonl", "records": len(out[s]), "sha256": hashlib.sha256(body.encode()).hexdigest()}
    (dest / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    return manifest


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("labels", nargs="+", help="ams-decisions.jsonl file(s) exported from the Decide panel")
    ap.add_argument("--out", default="training/decisions/suites/ams-v1")
    ap.add_argument("--sources", default="you,accepted,agent", help="which label sources to keep")
    ap.add_argument("--ratios", default="0.7,0.1,0.1,0.1", help="train,development,calibration,test")
    ap.add_argument("--mix", help="an existing lev suite directory to mix in")
    ap.add_argument("--mix-share", type=float, default=0.3)
    ap.add_argument("--seed", type=int, default=7)
    a = ap.parse_args()
    records = load(a.labels, set(a.sources.split(",")) if a.sources else None)
    if not records:
        raise SystemExit("No labelled records found (check --sources).")
    out = split(records, [float(x) for x in a.ratios.split(",")], a.seed)
    if a.mix:
        mix_in(out, a.mix, a.mix_share, a.seed)
    m = write(out, a.out)
    print(json.dumps({s: v["records"] for s, v in m["splits"].items()}), "→", a.out)


if __name__ == "__main__":
    main()
