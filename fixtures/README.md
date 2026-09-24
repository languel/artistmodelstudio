# Fixtures

## `references/<set>/`

Reference artworks used to test whether AMS can reproduce or respond to a real image. Each set has a `sources.json` recording, per image: the Wikimedia Commons page, the upstream (usually museum) source, the licence tags, the rights basis, and a SHA-256 of the local file.

Rules for adding references:

- Use public-domain works only. Source from Wikimedia Commons, not WikiArt, and prefer files photographed by the holding museum over prints, scans, or visitor photos.
- For the US, the work must have been published 95+ years ago (currently 1930 or earlier). Elsewhere, the artist must have died 70+ years ago (80 in a few countries).
- Skip files whose photographer claims a CC licence on the reproduction; pick a PD-Art file instead.
- Record anything that affects later publishing in `sources.json` (for example `sourceQualityNote` when a file is a scan of a print).

Current use is internal research. Re-check `sources.json` before publishing any image or derived result.

## `seeds/<set>/`

Output of the reference probe (`probe.html?save=1` on the dev server): per reference, the fitted Core DSL program, its flat-medium render, and a reference | seed | text-only comparison, plus `report.json` with RMSE scores. These images are derived from the references above, so the same rights notes apply.
