---
name: ams
description: How to drive Artist Model Studio (AMS) through its tools: drawing marks, changing them, moving and scaling, commands, sources, and the request log. Use when an agent or a small model is asked to make or change a drawing in AMS (MCP tools named ams_*, or window.ams.callTool).
---

# Driving AMS

AMS is a drawing studio. The page is **1000 × 1000** units, x to the right, y down. A drawing is a list of **marks**: `point`, `line` (2+ points), `plane` (a closed shape, 3+ points, with a fill and an outline).

## The tools you need nearly always

| To | Call |
|---|---|
| draw a circle / rectangle | `ams_add {shape: "circle" \| "rect", box: [x0, y0, x1, y1], fill: "#rrggbb"}` |
| several of them | add `repeat: {count: 3, dx: 300}` (a row) or `dy` (a column) |
| a line or dot | `ams_add {role: "line", points: [[x, y], [x, y]]}` / `{role: "point", points: [[x, y]]}` |
| recolor, opacity, label, brush | `ams_update {id, patch: {fill, color (the outline), opacity, label, realize: {brush: "hatch"}}}` |
| move / resize / turn | `ams_transform {ids, move: [dx, dy], scale: 1.5, rotate: 30}` (scale 1 = same, 2 = double, 0.5 = half). Never rewrite points yourself |
| delete | `ams_delete {ids}` |
| duplicate, group, frame, fit | `ams_command {id: "edit.duplicate"}` (`ams_commands {query}` lists them) |
| see what happened | `ams_render` / `ams_snapshot`, and the result of the call itself: `ams_add` returns the mark's id, box and fill |

`id` may be a mark's id, or a word: `selected`, `all`, `last`, `circle`, `square`, `line`, `point`, a color (`red`), or a label. Colors may be `#rrggbb` or names (`red`, `dark blue`).

## What goes wrong (from the evals)

- A `line` with one point is invisible. A circle is `shape: "circle"` with a `box`, not a line.
- Do not guess tool names (`ams_edit`, `ams_duplicate`, `ams_move`): the list is `ams_list_tools`; the aliases that exist are only a safety net.
- Copying an example's ids or numbers literally. Look at the marks you were given.
- Reply with one valid JSON object when asked for JSON; nothing else around it.
- `ams_run_score` **replaces** the board's marks. Use `ams_add` to add.
- Undo is always there (`ams_undo`); a request is one undo step. Do not ask for clarification: make the most sensible assumption and say what you assumed.

## Checking your work

`ams_requests {action: "list", problems: true}` shows requests that failed or were undone. `src/workbench/assistEval.js` holds 16 tasks with checkers on the resulting drawing; run `(await import('/src/workbench/assistEval.js')).run(app, { mode: 'quick' | 'model', use: 'say' | 'alt' })`.

## Films, cameras and keyframes

Notes on the take: `ams_notes {action: "text"}` lists the annotations kept on clips (feedback and instructions people left, in time order); read the `instruction` ones, do what they say, then `ams_notes {action: "delete", id}`. `{action: "add", at, text, kind}` leaves one on the clip under that time. `{action: "transcribe", clip, as: "notes" | "track" | "both"}` turns an audio clip's speech into timed text (Whisper, English, on this machine). To hear a sound: `ams_audio {action: "analyse", clip}` gives tempo, onset times and band levels; `ams_audio {action: "onsets", clip}` marks the beats as notes. A sketch follows the music with `source('sound').level`, `.bands(n)`, `.onset`, `.bass`, `.pitch`, `.spectrum(n)` (add it with `ams_source {action: "add", kind: "sound"}`). To make a parameter move with the music without code: `ams_keys {action: "follow", address, signal: "level" | "pitch" | "bass" | "onset" | "band0"…"fft63", lo, hi, release}`.

To make a film or explainer: `ams_film {action: "guide"}` returns the format (beats with a board, a camera pose, narration `say`, a `code` card, keyframed `set` of a sketch control, `cuts` to other shots or cameras); build a spec, `ams_film {action: "check", spec}`, then `{action: "open", spec}` to see it on the Timeline and `{action: "render", spec}` to make the MP4 and page (dev server). Keep films 16:9, cut every few seconds between a wide and a closer camera, and show the thing happening (a control moved by keys, a pointer in a sketch) rather than saying it. For a recording: `ams_timeline` open and `summary`, then `ams_camera` (cameras, shots, cuts, a 1080×1920 camera for a short, render) and `ams_keys` (curves on any parameter). Docs: docs/films.md.
