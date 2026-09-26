# The workbench

`npm run dev` → http://localhost:3017. The previous studio is at `/classic.html`.

## Layout

An infinite canvas with the artboard at its center. Panels dock left, right or bottom, float,
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
| Outliner | Every mark by stage and group: select (Shift for a range, Cmd to toggle), rename, drag to reorder or move between stages and groups, hide, lock, delete. Cmd+G / Shift+Cmd+G group and ungroup. |
| Assets | Saved processes, earlier generations, imports, and the Klee references (search, folders, stars, tags). |
| Properties | The selection, or the current tool's defaults: role, stage, brush and its parameters, color, the reason (why), the author. |
| Code | Everything as code, in modes. **Score:** write or load a score (Cmd+Enter runs it; the exercises live here). **Brush:** read, fork and write brushes with a live preview. **Selection:** the selected marks as score code; edit and Apply, and they change in place (same ids). **Clip:** a timeline clip as `clip({ … })`. Right-click a mark or a clip → Show code. |
| Process | Picture or process view, stage scrub and replay, a filmstrip, decisions, reasons, the editing record, and the process sheet. |
| Generate | Engines and models write scores. Candidates can be opened, saved, or read as scores. |
| Assistant | Chat with any engine (Ollama, WebGPU, OpenRouter…). It acts through the same tools as an agent, visibly. *How did you do that?* replays its last session. |
| Decide | The drawing as a sequence of typed decisions, answered by a policy you can train (see below). |
| Docs | The documentation, with search and collapsible contents. Parts are generated from the code: brushes, vocabulary, exercises, tools. It also holds the walkthroughs and the training estimator. |
| Settings | Artboard size (presets, rotate) and paper, theme, grid (on the paper or everywhere, lines or dots, spacing, subdivisions, color, snap), reference opacity, the guide. Cmd+, |
| Shortcuts | Every command and its keys, searchable. Click a key to reassign it; a key taken from another command moves. Shift+Cmd+/ |
| Timeline | Record, review and edit takes (bottom dock): transport, tracks of clips, summary, walkthrough, export (playable HTML, project zip, video, JSON). |
| Log | What happened, including every agent action (in purple). |

**Cmd+K** opens the command palette, which finds every command, panel, exercise, walkthrough and docs topic by name. Anything else you type goes to the Assistant. **?** opens the Docs.

**Walkthroughs** (after underscores) move the guide cursor to the real controls and run actions through the agent tools, so they are logged and undoable. Some steps wait for you. The narration card has Back, Pause, Next and Stop. The walkthroughs:
- *Taking a line for a walk*, a lesson after Klee and William Ngan.
- *Tour of the workbench*.
- *Teaching a decision policy*.
- *Study: Senecio*: study a painting, write its methods as brushes and a score (typed live), reproduce it, then draw a new subject in its manner.

Walkthroughs set the layout they need (through `ams_layout`) and put yours back when they end.

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

## Editing

- **Transforms:** select, then hover near the frame. A corner scales (Shift keeps proportions, Alt from the center), a side stretches, just inside (or outside) a corner rotates (Shift snaps to 15°).
- **Right-click** a mark: arrange, move to stage, brush, simplify (fewer points, same shape), duplicate, group, lock, hide, delete. Right-click the empty canvas: select all, fit, grid, snap, a note there.
- **Image layers:** drag an asset from Assets (or image files from the desktop) onto the canvas. Pictures become image layers that move, scale and rotate like any mark and travel inside the drawing; a saved drawing comes in as a group of its marks.
- **Look:** every element has an opacity and a blend mode (Properties → Look).
- **Notes:** notebook (handwriting on the page), sticky, index card or plain; font, size, width, paper. Drag a side to re-wrap, a corner to scale the lettering. A new note starts from the last note you styled.
- **Color:** the picker has a saturation/brightness field, hue, opacity, hex or a color's name (pigments such as *payne's gray*, CSS names), palettes (Klee, Kandinsky, Bauhaus, inks, grays, pigments, your own, or sampled from the reference), recent colors, and an eyedropper (I).

## History, recording and the timeline

**History** captures every change to the drawing (its own capture button pauses it): preview any past state, restore it (undoable), or drag entries onto the Timeline as clips. The **Timeline** is what you produce: tracks of clips as in a video editor (any number of narration, drawing, title, camera or audio tracks; rename, mute, delete; drag clips between tracks of a kind). Drag sound, text or saved drawings from Assets onto it; audio plays in review, in the standalone player and in video exports.

A **take** records how a drawing was made: the starting drawing, then clips on tracks (titles, narration, drawing changes, actions, camera, audio). Record by hand; walkthroughs and agent activity record themselves (agent recordings stop after 90 s of quiet), so a long run can be reviewed later. Takes are in Assets → Takes.

In the Timeline, clips are rectangles: drag to move, drag the right edge to retime, double-click text, right-click for speed, reveal and delete; the selected clip's properties are in Properties. **Summary** distills a run (narration at reading pace, the drawing brisk, analysis and waiting sped through, a hold at the end). **Walkthrough** makes a live walkthrough from a take. **Export** writes a standalone playable HTML file (the renderer inlined; `window.amsPlayer.seek(ms)` / `frame(ms)` for frame-by-frame capture), a project zip, a video (MP4 or WebM), or JSON. Agents use `ams_record` and `ams_timeline`.

## Brushes are code

Every brush, the built-ins included, is a small program written against a kit:

```js
brush({
  id: 'ticks', label: 'Ticks', roles: ['line', 'gesture'],
  doc: 'Short marks across the walk, as long as the hand was fast.',
  params: { len: [1, 40, 10, 'Longest tick'] },
  draw(ctx, e, p, k) {
    k.beginInk(ctx, e, { width: 1, opacity: 1 })
    for (const f of k.frames(e)) { const r = Math.min(p.len, f.speed * 1.5); k.segment(ctx, f.x - f.nx * r, f.y - f.ny * r, f.x + f.nx * r, f.y + f.ny * r) }
    ctx.restore()
  }
})
```

The kit: `k.frames(e)` (the walk with normals, speed and pressure), `k.smoothPath`, `k.spans` (for fills), `k.rotatePts`, `k.tracePath`, `k.segment`, `k.beginInk`, `k.draw(id, …)` (another brush), `k.rng()`, `k.noise(x, y)`, `k.image(src)`. The Brushes panel lists built-in, library and drawing brushes; scores define brushes with the same `brush({...})`; agents use `ams_brush`. A brush that fails draws plainly (and warns once) instead of breaking the drawing. Brush code runs in the page: open drawings from people you trust.

## Lines

Every line records its walk: points with time and pressure. Six line forms after William Ngan's *Taking a line for a walk* read the hand's speed from it: speed lines, restated, zigzag, inner lines, dotted walk, arcs.

A score can also create its own line, following Ngan's point that artists should make their lines before drawing them:

```js
defineLine('teeth', { params: { bite: [0, 60, 18] } }, (ctx, frames, p, env) => { /* frames: x, y, nx, ny, speed, pressure */ })
line(pts, { brush: 'teeth' })
```

The definition is stored in the drawing (`doc.lines`). It renders on the canvas and in SVG exports, and appears in Properties.

## Scores

A score is JavaScript that uses the vocabulary. Running it records the process document. Coordinates are **fractions of the artboard** (0..1), with `width` and `height` for its size, as in p5; `units('artboard')` switches to absolute units, and older absolute scores are recognized and still run:

```js
artboard(1000, 600, '#f3efe6')
stage('Construction', 'construction')
guide([[0, 0.66], [1, 0.66]], { why: 'horizon' })
stage('Marks', 'marks')
const path = walk({ from: [0.08, 0.7], heading: -10, steps: 200, step: 0.004, turn: i => sin(i / 13) * 5 })
line(path, { width: 4, taper: 0.4, pressures: t => 0.3 + 0.6 * sin(t * PI), why: 'an active line' })
plane(rect(0.6, 0.2, 0.2, 0.23), { brush: 'hatch', angle: 30, spacing: 8, why: 'a light plane, high right' })
decide('Where does the weight sit?', ['low left', 'high right'], 'low left', 'below and left feels heavy')
note(0.02, 0.03, 'A note shown in the process view')
```

The Score panel is a code editor (CodeMirror): line numbers, wrapping, folding, search, Cmd+/ comments, completion of the vocabulary, brush names and a brush's parameters, hover docs, and the failing line marked after a run.

The full vocabulary is in the Score panel (**Vocabulary**), in the Docs, and in `ams_vocabulary` for agents.

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

1. **Analyze reference** turns the reference into value masses and regions. Each region has a place, size,
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
3. Click any option to override, then **Apply step**. A small executor realizes the step on the region's
   geometry, and every mark records the decisions behind it as its *why*.
4. **Run ×8** lets the policy continue. It stops for you when its confidence is below *Ask me*.

Policies:
- **Rules**: a transparent baseline.
- **lev / kev**: a local TypeSafe `/v1/systemone` server, proxied at `/__decide`.
- **Agent**: answers over MCP.
- **You**.

What you choose and what the agent answers become labels in lev's format. Export them and train a local
policy with `training/decisions/` (see its README).
