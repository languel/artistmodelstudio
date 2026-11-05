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
