# The workbench

`npm run dev` → http://localhost:3017. The previous studio is at `/classic.html`.

## Layout

An infinite canvas with the artboard at its centre. Panels dock left, right or bottom, float,
and collapse, as in underscores:

- **Tab icon:** click to activate. Drag it past a small threshold to float the panel, and drop it at an
  edge to dock it. Right-click for placement options.
- **Resizing:** drag a dock's canvas-facing edge. Drag it past the edge to collapse the dock, and
  double-click or drag the edge to bring it back. **Cmd+B**, **Cmd+Opt+B** and **Cmd+Shift+B** toggle
  the left, right and bottom docks.
- **Floating panels:** move them by the header and resize from the corner. **Shift+double-click** the
  icon to minimise.
- The layout persists. **Menu → Reset layout** restores the defaults.

| Panel | What it holds |
|---|---|
| Stages | The process as ordered layers: show, lock, rename, kind, reorder. New marks go to the active stage. |
| Assets | Saved processes, earlier generations, imports, and the Klee references (search, folders, stars, tags). |
| Properties | The selection, or the current tool's defaults: role, stage, brush and its parameters, colour, the reason (why), the author. |
| Score | Write or load a score (JS in the point/line/plane vocabulary). **Cmd+Enter** runs it. The exercises live here. |
| Process | Picture or process view, stage scrub and replay, a filmstrip, decisions, reasons, the editing record, and the process sheet. |
| Generate | Engines and models write scores. Candidates can be opened, saved, or read as scores. |
| Assistant | Chat with any engine (Ollama, WebGPU, OpenRouter…). It acts through the same tools as an agent, visibly. *How did you do that?* replays its last session. |
| Decide | The drawing as a sequence of typed decisions, answered by a policy you can train (see below). |
| Docs | The documentation, with search and a table of contents. Parts are generated from the code: brushes, vocabulary, exercises, tools. It also holds the walkthroughs and the training estimator. |

**Cmd+K** opens the command palette, which finds every command, panel, exercise, walkthrough and docs topic by name. Anything else you type goes to the Assistant. **?** opens the Docs.

**Walkthroughs** (after underscores) move the guide cursor to the real controls and run actions through the agent tools, so they are logged and undoable. Some steps wait for you. The narration card has Back, Pause, Next and Stop. The walkthroughs:
- *Taking a line for a walk*, a lesson after Klee and William Ngan.
- *Tour of the workbench*.
- *Teaching a decision policy*.
| Log | What happened, including every agent action (in purple). |

## Tools

| Key | Tool |
|---|---|
| V | Select: click, shift-click, marquee; drag to move; Delete removes |
| H / Space | Pan (also the wheel; Cmd/Ctrl+wheel or pinch zooms) |
| O | Point |
| P | Line: freehand; time and pressure are recorded (with a mouse, speed sets pressure) |
| A | Plane: freehand lasso |
| E | Gesture: construction, hidden in the picture view |
| G | Guide: straight; Shift snaps to 15° steps |
| T | Note |
| F | Fit the artboard |
| \ | Toggle the picture / process view |
| R | Toggle the reference underlay |
| Cmd+Z / Shift+Cmd+Z | Undo / redo |
| Cmd+S | Save to Assets |

Opening an image asset (or an image file) puts it under the artboard as a reference. It isn't part
of the picture, and the Generate panel can send it to vision models.

## Lines

Every line records its walk: points with time and pressure. Six line forms after William Ngan's *Taking a line for a walk* read the hand's speed from it: speed lines, restated, zigzag, inner lines, dotted walk, arcs.

A score can also create its own line, following Ngan's point that artists should make their lines before drawing them:

```js
defineLine('teeth', { params: { bite: [0, 60, 18] } }, (ctx, frames, p, env) => { /* frames: x, y, nx, ny, speed, pressure */ })
line(pts, { brush: 'teeth' })
```

The definition is stored in the drawing (`doc.lines`). It renders on the canvas and in SVG exports, and appears in Properties.

## Scores

A score is JavaScript that uses the vocabulary. Running it records the process document:

```js
artboard(1000, 600, '#f3efe6')
stage('Construction', 'construction')
guide([[0, 400], [1000, 400]], { why: 'horizon' })
stage('Marks', 'marks')
const path = walk({ from: [80, 420], heading: -10, steps: 200, step: 4, turn: i => sin(i / 13) * 5 })
line(path, { width: 4, taper: 0.4, pressures: t => 0.3 + 0.6 * sin(t * PI), why: 'an active line' })
plane(rect(600, 120, 200, 140), { brush: 'hatch', angle: 30, spacing: 8, why: 'a light plane, high right' })
decide('Where does the weight sit?', ['low left', 'high right'], 'low left', 'below and left feels heavy')
note(20, 20, 'A note shown in the process view')
```

The full vocabulary is in the Score panel (**Vocabulary**), and in `ams_vocabulary` for agents. Brushes and their
parameter ranges are in `src/process/brushes.js`.

## Exports

From the menu:
- **PNG:** the picture view or the process view.
- **SVG:** one group per stage, and each element's full record in `data-ams-*` (it re-imports losslessly).
- **p5.js zip:** re-runs the score. P toggles the process view, 1–9 show the stages, R reseeds.
- **Process sheet:** a PNG of the stages and the decisions.
- **Process JSON.**
- **Excalidraw:** round-trips to underscores through `customData.ams`.

## Agents

The same actions are MCP tools on `window.ams`, on WebMCP where the browser supports it, and over the dev
relay for Claude Code (`.mcp.json` registers `ams`). Start with `ams_vocabulary` and `ams_wb_state`.

- **Author directly:** `ams_run_score {source, by}`, `ams_add`, `ams_stage`, `ams_decide`.
- **Inspect:** `ams_snapshot`, `ams_process_sheet`, `ams_get {format}`.
- **Be the engine:** `ams_generate {engine: "agent"}`, then `ams_pending` (the exact prompts a model
  would get) and `ams_answer {text}`.
- **Other engines:** `ams_generate {engine, model, count, exercise, withReference}`, then `ams_candidates`.
- **Decide:** `ams_analyze {mediapipe}`, `ams_decide_step {backend, apply}`, `ams_decision_pending`,
  `ams_decision_answer {answers, apply}`, `ams_decision_labels {export}`.
- **Show:** every call moves a visible cursor to the control it uses and narrates. The narration card sets
  the pace (0 = instant). Strokes are traced, and scores are revealed stage by stage.
  `ams_sessions {action: "replay"}` replays a recorded session from its starting point, and Undo returns to where you were.

The Assistant panel runs the same loop with the model you load. Its replies are JSON:
`{say, actions: [{tool, args}], done}`. It is outsourced to Ollama or WebGPU when no harness is attached.

## Decide

A **System One** loop: small, fast, typed decisions, not free text.

1. **Analyse reference** turns the reference into value masses and regions. Each region has a place, size,
   value, hue, edge activity and direction, plus a polygon. With **MediaPipe** on, you also get a figure
   region (selfie segmentation) and pose limbs, which you can add as gesture guides.
2. **Propose step** asks the policy six questions:
   - *next* (look, block, structure, value, accent, stop),
   - *region*,
   - *technique*,
   - *value* (a score),
   - *direction*,
   - *density* (a score).

   The answers come with probabilities.
3. Click any option to override, then **Apply step**. A small executor realises the step on the region's
   geometry, and every mark records the decisions behind it as its *why*.
4. **Run ×8** lets the policy continue. It stops for you when its confidence is below *Ask me*.

Policies:
- **Rules**: a transparent baseline.
- **lev / kev**: a local TypeSafe `/v1/systemone` server, proxied at `/__decide`.
- **Agent**: answers over MCP.
- **You**.

What you choose and what the agent answers become labels in lev's format. Export them and train a local
policy with `training/decisions/` (see its README).
