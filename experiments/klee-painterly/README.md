# The Klee painterly experiment

A headless run of the *Painterly, fading strokes* demo (`src/workbench/sourceDemos.js`, id `paint`) on three
Klee paintings, on a simulated clock and a seeded random, with the picture measured against the source.

```bash
python3 experiments/klee-painterly/receiver.py &      # saves what the page sends to exports/klee-painterly/
npx vite --port 3017                                  # the dev server
# open http://localhost:3017/experiments/klee-painterly/index.html, then in its console:
#   E.runAll([{ tag: 'castle-oil', name: 'castle', brush: 'oil' }, …])
npx vite-node scripts/klee-painterly-report.mjs       # the report: exports/klee-painterly/report.html
```

`E.run({ tag, name, brush, tolerance, seconds, snaps, seed, replace })`: `replace` patches the demo's code text
(pairs of [from, to]) to try a change without editing the demo. The harness reads the pictures from
`fixtures/references/klee/`. Keep the pane in front while it runs: a hidden page can lose its canvases.
