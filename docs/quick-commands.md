# Quick commands: the `/` field, Cmd+K, and how a phrase becomes an action

Written 5 November 2026. The idea, which turned out to be right: **guess the intent most of the time, show the guess, and act instantly.** Nothing here needed a trained model. Undo is the safety net.

## What the user sees

- **`/`** opens a small field at the pointer ([palette.js](../src/workbench/palette.js), `openPalette(app, { compact: true })`). Empty, it offers only what fits the selection (frame, paint, duplicate, group, code); with nothing selected it shows nothing. If nothing is selected but a mark is under the pointer, that mark is selected first.
- **Enter** runs the top row. **Cmd+Enter** sends the text to the Assistant, with the selected marks named as context. Esc closes.
- The top row is often a *ready-made action* with a swatch showing what it resolved to (`change fill to lavender cross hatch` → "Fill: lavender cross hatch", a lavender dot). Below it: other matching commands, then "Ask: …".
- **Cmd+K** is the same engine in a full-size list. `/` typed inside it still works as before.
- **Option+right-click** opens the whole Properties panel, compact, at the pointer ([propsPopup.js](../src/workbench/propsPopup.js)). See "Properties at the pointer" below.

## The three layers (cheapest first)

A request goes down until something takes it. `rank()` in palette.js builds the list; the first row is what Enter does.

1. **Instant phrases, no model** ([intents.js](../src/workbench/intents.js), tests in `intents.test.js`).
   - `parseIntent(text)` is pure: text → `{ do: 'paint' | 'style' | 'opacity' | 'blend' | 'brush' | 'flag' | 'rename', … }` or null. `intentCommand(app, text)` turns it into a command that acts on the selection (one undo step).
   - A fill is a colour, a *style* (hatch, cross hatch, stipple, flat), or both (`red hatch`, `lavender cross hatch`). Colours go through `toHex` ([palettes.js](../src/workbench/palettes.js)): hex, artists' pigments, your palettes, CSS names.
   - Needs a selection for anything that changes marks. With none, only paint for *new* marks applies.
   - To add a phrasing: add a pattern in `parseIntent` and a case in `intents.test.js`. That is the main way the system improves.
2. **Commands** (the registry). Every keyboard command (`defaultCommands` in [shortcuts.js](../src/workbench/shortcuts.js)) is also a palette command, plus the hand-written ones in `buildCommands` and the slash commands (`slashAll`: `/background`, `/grid`, `/pin`…). One registry, three doors: keys, Cmd+K and `/`, MCP. Ranking: name and alias matches, filler words ignored ("frame it"), commands that act on the selection rise when something is selected and sink when not (`NEEDS`, `ALIAS` in palette.js). `/fit` with a selection: "Frame the selection" first.
3. **The assistant, in flow mode** ([panels/assistant.js](../src/workbench/panels/assistant.js), `flowPrompt`, `send({ flow: true })`).
   - Rule from the user: **never ask for clarification**; assume and act, because undo is one key away. The prompt says so; if the model asks anyway it is told once to just do it.
   - **A small prompt on purpose:** only the selected marks and a few tools, no chat history, no full tool list. That was the difference between ~10 s with an unreadable reply and 200–850 ms with valid JSON (measured on Ollama `lfm3-omni`). Ollama is called with `format: json` and a token cap (`json`, `maxTokens` in `OllamaArtist.complete`): uncapped JSON mode once hung the runner.
   - **One undo step** per request (`store.beginStep` / `endStep`, `ProcessStore` in document.js). **Quiet tool calls** (`callTool(name, args, { quiet: true })`): no guide cursor, no pauses, and no "Agent run" take is started by the recorder.
   - Feedback is a chip by the pointer (`askInFlow`), not a panel switch. Click it to open the Assistant.

## Where it stands, and what to do next

- Measured on 12 phrases with the small local model: all parsed, none asked a question, about half were *right*. Wrong ones: "lighter" changed opacity, "remove the outline" sent a word instead of a colour, "frame it" changed opacity, an invented tool name, "draw a circle" with a bad role.
- **Next: a request log** (not built). Record each phrase, which layer took it, the action, and whether the user undid within a few seconds (a free "that was wrong" label). It shows which phrasings to add to the grammar and gives data if a router is ever worth training. Decision models ([TRAINING.md](TRAINING.md)) fit *choosing among candidates*, not parsing a sentence into an edit.
- **Next: physics and scores** (agreed direction, not built). The data is already plain (`play.spring` / `hinge` / `weld`, [model.js](../src/physics/model.js); paths, travelers, events in [relations.js](../src/score/relations.js)), so these are phrases plus two missing tools, shared by `/`, Cmd+K, MCP and the model:
  - `spring / hinge / weld these` → joints between marks. Open question: join consecutive marks in selection order, or each to its nearest neighbour?
  - `make a drum pattern from these points` → sort by x for time, y for the drum voice, snap to the grid. Open question: voices from General MIDI drum notes?
  - Open-ended asks ("feel like a heartbeat") stay with the model, calling those same tools.
- Known gaps: the model sometimes picks a wrong tool or role; the flow prompt only knows `ams_update`, `ams_command` and `ams_add`; opening the bar on a phrase that needs a selection with none selected shows no instant row.

## Plane model (touched by "change fill to hatch")

A plane is **stroke** (`color`, `strokeWidth`), **fill** (`fill`) and a **fill style** (its brush: flat, hatch, stipple). A plane with no fill draws as an outline only, so choosing a style also gives it a fill (`ensureFill`, `FILL_STYLES` in document.js; the stroke colour, else a grey). `strokeWidth` applies on the canvas and in SVG and p5 exports.

## Properties at the pointer

`mountProperties(el, app, { compact })` is the one Properties panel; it returns a function that stops it following the document. The popup mounts it in a small window ([styles.css](../src/workbench/styles.css) `.wb-props-pop`). It shows the selected marks, else the board (selected on Opt+right-click over its title or bare paper), else the tool's defaults (including the pen: Lazy, Smoothing, Simplify; circle sides; rectangle roundness). `openToolParams` and `openBoardParams` now just open it. Choices are glyph menus ([glyphSelect.js](../src/workbench/glyphSelect.js)): glyph plus name in the sidebar, glyph alone in the popup. Blend modes without an icon (colour-burn, hue…) show their names. Reason starts collapsed in the popup. The old `playPopover.js` and `openToolDefaults` (Shift+right-click) are no longer reached from Opt+right-click.

## MCP

`ams_commands { query }` lists and ranks commands with the current selection as context; `ams_command { id, arg }` runs one by id, name, `/slash` or a plain phrase ("change the fill to red"). `ams_update` accepts `fill`, `strokeWidth`, `opacity`, `blend`, `label`, `hidden`, `locked`; `ams_add` accepts `fill`.

## Files

[palette.js](../src/workbench/palette.js) (bar, ranking, registry), [intents.js](../src/workbench/intents.js) (phrases), [shortcuts.js](../src/workbench/shortcuts.js) (the registry; `/` is `app.slashbar`), [panels/assistant.js](../src/workbench/panels/assistant.js) (flow mode), [propsPopup.js](../src/workbench/propsPopup.js), [glyphSelect.js](../src/workbench/glyphSelect.js), [panels/properties.js](../src/workbench/panels/properties.js), [mcp.js](../src/workbench/mcp.js), [document.js](../src/process/document.js) (`beginStep`, `ensureFill`). Tests: `intents.test.js`, `undoStep.test.js`.

## Dictation (the mic button)

Any text field can have a microphone: `attachMic(field, { host })` in `src/workbench/voice.js`. It is on the `/` bar, the command palette and the Assistant's composer. Click to start, click to stop; the first Enter in the bar ends the dictation and the next one runs it; Alt+M toggles it in the bar. Right-click for the engine and the microphone.

- **Browser speech**: words appear as you speak (Chrome, Edge, Safari). Chrome sends the audio to its speech service.
- **Whisper, on this machine**: `whisperWorker.js` (`onnx-community/whisper-tiny.en`, about 40 MB once, then the browser's cache) via the `@huggingface/transformers` dependency. You record, and the words appear when you stop. Silence returns nothing (Whisper otherwise invents words).

The default is the browser's when it has one. Devices come from `inputs.js` (shared: the light goes out when nothing holds the stream).

## Lecture recording

`src/workbench/lecture.js` (`app.lecture`): palette › Record: *Record a lecture: stage and microphone / with camera / the whole tab*, *Pause or resume*, *Stop*. It records the stage (cropped; Chrome and Edge) and the microphone; the camera is a round bubble on the stage (drag; double-click to resize), so it is in the film because it is on the page. The bar at the bottom left shows time, level, pause and stop. The film is kept in Assets (Videos) and downloaded. Built on `Capture` from `scriptRecorder.js`.

## Waveforms

`src/workbench/waveform.js`: `analyse` keeps 100 min/max/loudness slices a second; `drawWave` paints any stretch one column a pixel, as an envelope with the loudness inside. Audio clips on the Timeline use it (`clip.wave`, made on demand, also for files added with "Audio file…"); the audio lane is 40 px tall.

## The microphone as a source

Sources panel › the mic button (or `ams_source add {kind: 'mic'}`). `micSource.js` makes the microphone a source like the camera: its picture is the spectrum now (low pitches left, loud at the top, the wave drawn over it), so `source('mic').value(x, y)`, `.color(x, y)`, a board showing it, and the Sources preview all work. Sound-only extras on the sampler: `.level` (0..1) and `.bands(n)` (n loudness values, low to high). It shares the stream with dictation and lecture recording (`inputs.js`). It is not in exported sketches. The built-in browser pane of the Claude app blocks microphones: test in Chrome.

## Making the assistant reliable (5 Nov 2026)

**The request log** (`requestLog.js`, `app.requests`, MCP `ams_requests`): each phrase typed into the `/` bar, the layer that answered (`phrase`, `command`, `model`), the model's tool calls, whether it failed and whether it was undone within 30 s (a sign it was wrong). Kept in the browser (300). `ams_requests {action: "list", problems: true}`.

**The evals** (`assistEval.js`): 16 tasks (make a circle, square, dot, line, a row; recolor, darker, see-through, hatch; bigger, move; delete, duplicate, name; two recolors; a house), each with a checker on the resulting drawing, plus a second, differently worded phrase for each (`alt`, held out so the prompt cannot just have memorised them). `run(app, { mode, use })`: `mode` `reference` (the tools alone, written by hand: 14/14, so the tools can do it), `model` (the model only), `quick` (the whole path). Method: do the task yourself with the tools, then let the small model do it, compare, and bridge each gap in the cheapest layer.

Results with lfm3-omni (Ollama), model only: 9/16 at the start → 13/16 → 12/16 on held-out wording. The whole path: **15/16** on both wordings (only "draw a house" fails).

What the gaps were and how each was bridged (more prompt examples were the *worst* lever: the small model copied them literally, `<id1>` and all):

| Gap | Bridge |
|---|---|
| no move/scale tool; the model made up `ams_edit {x}` | `ams_transform {ids, move, scale, rotate}`, and the phrases "bigger", "scale it up by half", "move it right" in the grammar |
| invented names and arguments (`ams_duplicate`, `ams_delete {id}`, `shape: "line"`, point objects, `#rrggbb` placeholders, `role: "shape"`) | tool aliases, forgiving arguments, and unknown-tool errors that list the real tools |
| "create a red shape" with no geometry (a user's screenshot: three identical failures) | `ams_add` assumes (a 200×200 rectangle in the middle) and says what it assumed; and the flow mode retries once after a failed call, and once after an unreadable reply |
| opaque ids | `id` may be `selected`, `circle`, `square`, `red`, a label (`resolveMarks`) |
| it could not see the page | with nothing selected the prompt lists the marks on the page ("round", "rectangle", fill) |
| layout and multi-step (a row, two recolors) | phrases in the grammar ("three circles in a row", "make the circle blue and the square red") and `ams_add {repeat}` |
| compositions ("a house") | open: needs a bigger model, or a decomposition tool |

`.claude/skills/ams/SKILL.md` is the same knowledge as a skill for capable agents.

## Pause detection (mic)

`voice.js`: dictation stops by itself after a pause and, when what was said looks like a whole request, sends it (the `/` bar runs its top result; the chat sends). `watchPause` listens to the shared level meter: it learns the room's noise in the first 400 ms, notes when speech starts, and ends the dictation after a silence that depends on the words so far: 1.0 s after a full sentence, 1.6 s by default, 3.2 s after a dangling word ("and", "the", "to"…), and gives up after 9 s of no speech. `looksReady` holds back a request that ends mid-thought or is a single word. Only a real speech-then-pause sends; giving up on silence never does (a background voice in the room is transcribed but not run). Right-click the mic: *Stop and send when I pause* turns it off.
