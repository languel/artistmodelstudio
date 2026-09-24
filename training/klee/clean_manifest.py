#!/usr/bin/env python3
"""
Post-process manifest.json: clean Commons titles (strip wikidata QS markup and
German/English doubling) and force near-duplicate photos of one artwork into
the same split so test results can't leak from training.
"""
import json
import re
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
MAN = HERE / "manifest.json"


def clean_title(t):
    t = re.split(r"(?:title|label)\s*QS:", t)[0]
    t = re.sub(r"^\s*(German|French|English)\s*:\s*", "", t)
    t = re.sub(r"\s*[-,]?\s*\b(1[89]\d\d)\b.*$", "", t)  # trailing year / museum
    t = re.sub(r"\s+", " ", t).strip(" -,.")
    words = t.split(" ")
    half = len(words) // 2
    if len(words) % 2 == 0 and half and words[:half] == words[half:]:
        t = " ".join(words[:half])  # "Stickerei Stickerei"
    # "Rosengarten Rose Garden" style doubling: keep as is, it is informative.
    return t or "Untitled"


def dhash(path, n=16):
    im = Image.open(path).convert("L")
    w, h = im.size
    im = im.crop((w * .12, h * .12, w * .88, h * .88)).resize((n + 1, n))
    p = list(im.tobytes())
    return [p[y * (n + 1) + x] > p[y * (n + 1) + x + 1] for y in range(n) for x in range(n)]


def main():
    m = json.loads(MAN.read_text())
    refs = m["references"]
    for r in refs:
        r.setdefault("rawTitle", r["title"])
        r["title"] = clean_title(r["rawTitle"])

    parent = list(range(len(refs)))
    find = lambda i: i if parent[i] == i else find(parent[i])
    hashes = [dhash(HERE / "images" / r["file"]) for r in refs]
    for i in range(len(refs)):
        for j in range(i + 1, len(refs)):
            same_title = refs[i]["title"].lower() == refs[j]["title"].lower() and refs[i]["title"] != "Untitled"
            close = sum(a != b for a, b in zip(hashes[i], hashes[j])) <= 55
            if same_title or close:
                parent[find(j)] = find(i)
    groups = {}
    for i, r in enumerate(refs):
        g = find(i)
        r["group"] = refs[g]["id"]
        r["split"] = refs[g]["split"]
        groups.setdefault(g, []).append(r["id"])
    m["references"] = refs
    MAN.write_text(json.dumps(m, ensure_ascii=False, indent=2))
    multi = [v for v in groups.values() if len(v) > 1]
    n_test = sum(r["split"] == "test" for r in refs)
    print(f"{len(refs)} images, {len(groups)} artworks, {len(multi)} duplicate groups; {len(refs) - n_test} train / {n_test} test")


if __name__ == "__main__":
    main()
