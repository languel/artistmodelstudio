#!/usr/bin/env python3
"""
Build the Paul Klee training corpus from Wikimedia Commons.

Walks "Category:Paintings by Paul Klee by date" for 1912–1930, keeps files that
Commons marks public domain with a PD-Art/PD-scan tag, drops visitor photos
("Own work"), book scans, near-duplicates and near-greyscale images, downloads a
640px version of each, and writes manifest.json with provenance and rights per
image. Whole artworks are assigned to train/test (never split across both).

Images go to training/klee/images/ (git-ignored); manifest.json is committed and
records a SHA-256 per image so a re-download can be checked.

Usage: training/.venv/bin/python training/klee/fetch_corpus.py
"""
import datetime
import hashlib
import io
import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from PIL import Image

HERE = Path(__file__).parent
IMG_DIR = HERE / "images"
UA = {"User-Agent": "AMS-research/0.1 (Artist-Model Studio; contact liuboto@gmail.com)"}
YEARS = range(1912, 1931)  # mature style; <=1930 keeps every work PD in the US too
WIDTH = 640
TEST_FRACTION = 0.15

strip = lambda s: re.sub(r"\s+", " ", re.sub(r"<[^>]+>", "", s or "")).strip()


def get(url, tries=4):
    for i in range(tries):
        try:
            return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except Exception as err:  # transient Commons / thumbnail errors
            if i == tries - 1:
                raise
            print(f"  retry {url[:80]}: {err}", file=sys.stderr)
            time.sleep(5 * (i + 1))


def api(**kw):
    kw["format"] = "json"
    return json.loads(get("https://commons.wikimedia.org/w/api.php?" + urllib.parse.urlencode(kw)))


def members(cat, kind):
    out, cont = [], {}
    while True:
        d = api(action="query", list="categorymembers", cmtitle=cat, cmlimit=500, cmtype=kind, **cont)
        out += [m["title"] for m in d["query"]["categorymembers"]]
        if "continue" not in d:
            return out
        cont = {"cmcontinue": d["continue"]["cmcontinue"]}


def collect_files():
    files = {}

    def walk(cat, depth):
        for f in members(cat, "file"):
            files.setdefault(f, cat)
        if depth > 0:
            for sub in members(cat, "subcat"):
                walk(sub, depth - 1)

    for cat in members("Category:Paintings by Paul Klee by date", "subcat"):
        m = re.search(r"(1[89]\d\d) paintings", cat)
        if m and int(m.group(1)) in YEARS:
            walk(cat, 2)
    return files


def file_info(titles):
    rows = []
    for i in range(0, len(titles), 40):
        d = api(action="query", prop="imageinfo", iiprop="url|size|sha1|mime|extmetadata", iiurlwidth=WIDTH,
                titles="|".join(titles[i:i + 40]))
        for p in d["query"]["pages"].values():
            if "imageinfo" in p:
                rows.append((p["title"], p["imageinfo"][0]))
    return rows


def year_of(meta, cat):
    for text in (strip(meta.get("DateTimeOriginal", {}).get("value", "")), cat):
        m = re.search(r"(1[89]\d\d)", text)
        if m:
            return int(m.group(1))
    return None


def dhash(img, size=8):
    g = img.convert("L").resize((size + 1, size), Image.LANCZOS)
    px = list(g.getdata())
    bits = 0
    for y in range(size):
        for x in range(size):
            bits = (bits << 1) | (px[y * (size + 1) + x] > px[y * (size + 1) + x + 1])
    return bits


def saturation(img):
    hsv = img.convert("RGB").resize((64, 64)).convert("HSV")
    s = [p[1] for p in hsv.getdata()]
    return sum(s) / len(s) / 255


def slug(text):
    text = urllib.parse.unquote(text).lower()
    text = re.sub(r"\.(jpe?g|png|tiff?)$", "", text)
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")[:70]


def main():
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    files = collect_files()
    print(f"{len(files)} files in 1912–1930 categories", file=sys.stderr)

    kept, rejected = [], {}
    seen_hashes = []
    for title, ii in sorted(file_info(list(files)), key=lambda r: -r[1]["width"] * r[1]["height"]):
        meta = ii["extmetadata"]
        g = lambda k: strip(meta.get(k, {}).get("value", ""))
        cats = g("Categories")
        credit = g("Credit")
        year = year_of(meta, files[title])
        reason = None
        if g("LicenseShortName") != "Public domain":
            reason = f"licence {g('LicenseShortName')}"
        elif "PD-Art" not in cats and "PD-scan" not in cats:
            reason = "no PD-Art/PD-scan tag"
        elif year not in YEARS:
            reason = f"year {year}"
        elif ii["mime"] not in ("image/jpeg", "image/png", "image/tiff"):
            reason = ii["mime"]
        elif min(ii["width"], ii["height"]) < 500:
            reason = "too small"
        elif re.search(r"\bown work\b", credit, re.I):
            reason = "visitor photo (Own work)"
        elif re.search(r"hathitrust|book|catalog", credit + " " + title, re.I):
            reason = "book scan"
        if reason:
            rejected[title] = reason
            continue

        time.sleep(0.5)  # stay well under Wikimedia's rate limits
        data = get(ii.get("thumburl") or ii["url"])
        img = Image.open(io.BytesIO(data)).convert("RGB")
        sat = saturation(img)
        if sat < 0.12:
            rejected[title] = f"near-greyscale (saturation {sat:.2f})"
            continue
        h = dhash(img)
        dup = next((t for hh, t in seen_hashes if bin(hh ^ h).count("1") <= 6), None)
        if dup:
            rejected[title] = f"duplicate of {dup}"
            continue
        seen_hashes.append((h, title))

        rid = f"klee-{year}-{slug(title[5:])}"
        if any(r["id"] == rid for r in kept):
            rid += f"-{len(kept)}"
        fn = f"{rid}.jpg"
        buf = io.BytesIO()
        img.save(buf, "JPEG", quality=90)
        (IMG_DIR / fn).write_bytes(buf.getvalue())
        credit_html = meta.get("Credit", {}).get("value", "")
        kept.append({
            "id": rid,
            "file": fn,
            "title": g("ObjectName") or re.sub(r"\.\w+$", "", title[5:]),
            "artist": "Paul Klee (1879–1940)",
            "year": year,
            "local": {"width": img.width, "height": img.height, "sha256": hashlib.sha256(buf.getvalue()).hexdigest()},
            "source": {
                "commonsPage": ii["descriptionurl"],
                "downloadedFrom": (ii.get("thumburl") or ii["url"]).split("?")[0],
                "original": {"url": ii["url"], "width": ii["width"], "height": ii["height"], "sha1": ii["sha1"]},
                "commonsCredit": credit[:300],
                "upstreamUrls": [u.replace("&amp;", "&") for u in re.findall(r'href="([^"]+)"', credit_html)][:3],
            },
            "rights": {
                "commonsLicense": g("LicenseShortName"),
                "commonsTemplates": [c for c in cats.split("|") if c.startswith("PD")],
                "basis": "Artist died 1940 (PD in life+70/80 jurisdictions); dated 1912–1930, so PD in the US.",
            },
        })
        print(f"  kept {rid} (sat {sat:.2f})", file=sys.stderr)

    # Deterministic split by artwork id.
    for ref in kept:
        bucket = int(hashlib.sha256(ref["id"].encode()).hexdigest(), 16) % 1000 / 1000
        ref["split"] = "test" if bucket < TEST_FRACTION else "train"

    manifest = {
        "collection": "Paul Klee 1912–1930 — AMS distillation corpus",
        "use": "Internal research. Rights recorded per image for possible later publication; re-check before publishing.",
        "retrievedAt": datetime.date.today().isoformat(),
        "filters": {
            "years": [YEARS.start, YEARS.stop - 1],
            "licence": "Commons 'Public domain' with PD-Art or PD-scan tag",
            "excluded": "visitor photos (Own work), book scans, near-greyscale, near-duplicates (dHash distance <= 6)",
        },
        "references": sorted(kept, key=lambda r: (r["year"], r["id"])),
        "rejected": rejected,
    }
    (HERE / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
    n_test = sum(r["split"] == "test" for r in kept)
    print(f"kept {len(kept)} ({len(kept) - n_test} train / {n_test} test), rejected {len(rejected)}", file=sys.stderr)


if __name__ == "__main__":
    main()
