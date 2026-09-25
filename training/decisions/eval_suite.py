"""Score a System One server on a suite partition (default: development), question by question.

    python training/decisions/eval_suite.py training/decisions/suites/ams-v1 --url http://127.0.0.1:8009
    python training/decisions/eval_suite.py <suite> --url http://127.0.0.1:8009 --url http://127.0.0.1:8010   # compare

Only AMS records are scored (source "ams"). Reports accuracy per question, mean probability of the
label, and how often a wrong answer was confident (p >= 0.9).
"""
import argparse
import json
import urllib.request
from collections import defaultdict
from pathlib import Path


def ask(url, record):
    qs = {k: {kk: v for kk, v in q.items() if kk not in ("label", "src")} for k, q in record["questions"].items()}
    body = json.dumps({"state": record["state"], "model": "lev-latest", "questions": qs}).encode()
    req = urllib.request.Request(f"{url.rstrip('/')}/v1/systemone", body, {"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())["answers"]


def label_key(q):
    return str(q["label"]).lower() if q["type"] == "noul" else str(q["label"])


def pred(a):
    if a["type"] == "choice":
        return a["choice"], a.get("probabilities", {})
    if a["type"] == "score":
        probs = a.get("probabilities", {})
        return max(probs, key=probs.get), probs
    return str(a["noul"] >= 0.5).lower(), {"true": a["noul"], "false": 1 - a["noul"]}


def score(url, records):
    stats = defaultdict(lambda: {"n": 0, "right": 0, "p": 0.0, "confident_wrong": 0})
    for r in records:
        answers = ask(url, r)
        for qid, q in r["questions"].items():
            choice, probs = pred(answers[qid])
            s = stats[qid]
            s["n"] += 1
            s["right"] += choice == label_key(q)
            s["p"] += probs.get(label_key(q), 0.0)
            s["confident_wrong"] += choice != label_key(q) and max(probs.values(), default=0) >= 0.9
    return stats


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("suite")
    ap.add_argument("--url", action="append", required=True)
    ap.add_argument("--split", default="development")
    a = ap.parse_args()
    records = [json.loads(l) for l in (Path(a.suite) / f"{a.split}.jsonl").read_text().splitlines() if l.strip()]
    records = [r for r in records if r.get("_meta", {}).get("source") == "ams"]
    print(f"{len(records)} AMS records from {a.split}")
    for url in a.url:
        stats = score(url, records)
        total = sum(s["right"] for s in stats.values()) / max(1, sum(s["n"] for s in stats.values()))
        print(f"\n{url}  overall accuracy {total:.2f}")
        for qid, s in stats.items():
            print(f"  {qid:10s} acc {s['right'] / s['n']:.2f}   p(label) {s['p'] / s['n']:.2f}   confident-wrong {s['confident_wrong']}")


if __name__ == "__main__":
    main()
