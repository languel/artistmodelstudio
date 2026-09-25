# Decisions: training a System One policy for the Decide panel

The Decide panel asks typed questions at every step of a drawing: what next, where,
which technique, how dark, which direction, how dense. Any backend that speaks
TypeSafe's `/v1/systemone` can answer. Your choices, and the agent's, are saved as
labels in lev's format, so a small local model can learn your teaching.

```
reference ──► perception (regions, values, edges, direction, MediaPipe)
                 │
                 ▼
         state text + typed questions ──► policy (rules │ lev │ agent │ you)
                 │                                   │
                 ▼                                   ▼
          you confirm / override  ◄──── probabilities, confidence
                 │
                 ├──► executor realises the step as marks (each with its why)
                 └──► label (ams-decisions.jsonl) ──► make_suite.py ──► lev train
```

## 1. Collect labels

In the workbench: **Decide** → *Analyse reference* → *Propose step* → click options to
override → *Apply step*. Each applied step is one label:

| source     | meaning                                                         |
|------------|-----------------------------------------------------------------|
| `you`      | you chose or overrode an answer (the strongest signal)          |
| `accepted` | you looked at the proposal and applied it unchanged             |
| `agent`    | an agent answered over MCP (`ams_decision_answer`)              |

Steps a policy applies on its own (*Run ×8*, or `ams_decide_step` with `apply`) are not
labels. Export them with *Export JSONL (lev format)*.

## 2. Build a suite

```bash
python training/decisions/make_suite.py ~/Downloads/ams-decisions.jsonl --out training/decisions/suites/ams-v1
```

Options: `--sources you,accepted`, `--ratios 0.7,0.1,0.1,0.1`. `--mix <lev suite dir> --mix-share 0.3`
keeps some of lev's own data, so the model does not forget its general skills. Splits are made
per drawing, so no drawing's steps appear in more than one split.

## 3. Train and serve lev (local, Apple Silicon)

[lev](https://github.com/franckverrot/lev) is LFM2.5-350M with LoRA and a pointer head. It
answers `choice`, `score` and `noul` questions with calibrated probabilities. Training takes
about 45 minutes on an M2 Max.

```bash
git clone https://github.com/franckverrot/lev ~/dev/lev
cd ~/dev/lev && uv sync
uv run python -m lev.train --suite ~/dev/artistmodelstudio/training/decisions/suites/ams-v1 \
  --base LiquidAI/LFM2.5-350M --lora --accum 8 --device mps
uv run python -m lev.serve --run <run dir or franckverrot/lev-350m> --port 8009
```

The dev server proxies `/__decide` to `http://127.0.0.1:8009`. You can change this with
`AMS_DECIDE_URL`, or with the *Server* field when the policy is lev. Choose
**Policy → lev / kev** in the Decide panel.

Before training, check the manifest keys and flags against lev's current suite loader;
they follow its README as of September 2026.
