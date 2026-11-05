# Running the assistant evals

These drive the studio in a browser pane that `ego-browser` controls (a task space named "ams mic test" with the dev server on :3017 open in `p1`; any browser automation that can run JavaScript in the page does the same). Each script prints and leaves results on `window` for a later poll.

- `runeval.sh` + the page's `window.__lfmEval`: the 16 chat/command tasks (`src/workbench/assistEval.js`) on LFM3-Omni in the browser. Result shape: `{ say, alt }`, each `{ passed, of, results }`.
- `startlesson.sh [k]`: the lesson-reproduction test (`src/workbench/lessonEval.js`) on LFM3-Omni with k retrieved examples (default use 0). Result in `window.__lessonEval`; `poll.sh` prints it.
- `startother.sh <ollama model>`: the same lesson test on an Ollama model.
- `sweep.sh <engine> <model>...`: the lesson test on several models in one run on one engine (`ollama`, `openai` for LM Studio, `webgpu` for in-browser transformers.js models); results in `window.__sweep[model]`, `sweepstat.sh` prints them.
- `browsertest.sh <model>`: load one in-browser model and ask it two things.

Two things that bit: (1) an edit under `src/` reloads the page and kills a running eval, so edit only between runs; (2) the dev server ignores `node_modules`, so after upgrading a dependency restart it (`preview_stop` then `preview_start`). `window.__evalEngine` picks the engine, `window.__evalTemp` and `window.__evalMaxTokens` the sampling.
