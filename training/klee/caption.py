#!/usr/bin/env python3
"""
Caption every corpus image with a local vision model through Ollama, as the
kind of short prompt a person might type. Resumable: existing captions are kept.

Captions are machine-written and unreviewed; captions.json says so per entry.

Usage: training/.venv/bin/python training/klee/caption.py [--model gemma4:12b-mlx]
"""
import argparse
import base64
import json
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "captions.json"

PROMPT = (
    "Describe this painting as a short prompt someone might type to request a similar picture: "
    "the subject, the main shapes and layout, and the palette. One sentence, at most 25 words. "
    "Do not name the artist, and do not mention paper, frame, mount, signature, inscription or texture. "
    'For context only, the work is titled "{title}".'
)


def caption(model, image_path, title):
    body = {
        "model": model,
        "stream": False,
        "think": False,
        "options": {"temperature": 0.2},
        "messages": [{
            "role": "user",
            "content": PROMPT.format(title=title),
            "images": [base64.b64encode(image_path.read_bytes()).decode()],
        }],
    }
    req = urllib.request.Request("http://localhost:11434/api/chat", data=json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=300).read())["message"]["content"].strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="gemma4:12b-mlx")
    args = ap.parse_args()

    refs = json.loads((HERE / "manifest.json").read_text())["references"]
    data = json.loads(OUT.read_text()) if OUT.exists() else {"model": args.model, "prompt": PROMPT, "reviewed": False, "captions": {}}
    for i, r in enumerate(refs):
        if r["id"] in data["captions"]:
            continue
        t0 = time.time()
        text = caption(args.model, HERE / "images" / r["file"], r["title"])
        data["captions"][r["id"]] = {"text": text, "model": args.model, "reviewed": False}
        OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1))
        print(f"[{i + 1}/{len(refs)}] {time.time() - t0:.1f}s {r['id']}: {text}", flush=True)


if __name__ == "__main__":
    main()
