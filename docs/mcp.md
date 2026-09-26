# Driving the studio from an agent (MCP / WebMCP)

Everything a user can do in the studio is also an MCP tool: engines and models, generating, candidate buttons, render options, references, continuous mode, recording, and assets. Agents can drive the app like a user, or act as the engine themselves.

## Three ways in

| Where the agent runs | How | Notes |
|---|---|---|
| Inside the page (DevTools, an in-page agent, the Claude browser pane) | `await ams.callTool('ams_get_state')`, `ams.listTools()` | `window.ams` / `window.webmcp` |
| A browser with WebMCP (`navigator.modelContext`) | registered automatically | same tools |
| Claude Code or any MCP client | stdio server `src/mcp/mcpServer.js` (`npm run mcp`; `.mcp.json` registers it as `ams`) | relays to the newest open studio tab through the dev server |

The relay is dev-only. `vite.config.js` serves `/__ams/tabs`, `/__ams/tools` and `POST /__ams/call {name, args}`. The page connects over Vite's websocket, so start it with `npm run dev` (port 3017 via `.claude/launch.json`) and keep one tab open. `AMS_STUDIO_URL` points the stdio server elsewhere. With no tab open, only the older offline tools work. `ams_studio_status` shows which tabs are connected.

Image results (data URLs) come back as MCP image content, so an agent can see what it made.

## Tools

**State and UI**
- `ams_get_state` returns everything on screen: engine, model, medium, canvas, render options, tab, candidates, continuous mode, reference and assets folder.
- `ams_screenshot` returns the preview, a given candidate, or the painting.
- `ams_set_tab`, `ams_set_theme`.
- Escape hatches for anything not covered: `ams_ui_query` (CSS selector), `ams_ui_click` (selector or button text; confirm and prompt dialogs are answered), `ams_ui_set` (sets a value and fires input + change).

**Engines**
- `ams_list_engines`, `ams_set_engine` (with an optional model).
- `ams_load_model` downloads and loads a WebGPU model, with progress shown in the app.

**Canvas and render**
- `ams_set_medium`: flat, watercolor, pixel or ascii.
- `ams_set_canvas`: size, and aspect as `w:h` or `ref`.
- `ams_set_variation`.
- `ams_set_render_options`: every field of the options popover.

**Generation**
- `ams_generate_round` types the prompt, presses Generate and waits for the round.
- `ams_candidate_action`: select, variations, continue, critique (with feedback), compare_media, animate, start_over.
- `ams_list_examples`, `ams_load_example`, `ams_export_p5`.
- The older tools remain: `ams_generate`, `ams_rate_candidate`, `ams_grade_candidates`, `ams_get_candidate`, `ams_set_program`, `ams_render_program`, `ams_evaluate_rewards`, `ams_get_dataset`, `ams_train_model`, and the rest.

**Reference and continuous mode**
- `ams_list_references`.
- `ams_set_reference`: a bundled id, an asset id, a URL or data URL, or the webcam.
- `ams_set_reference_view`: fit, overlay, and sampling for live sources.
- `ams_live_set` sets any continuous-mode control.
- `ams_live_control`: play, stop, pause, resume, clear, and `step` (advances the simulation even when the tab is hidden and frames are throttled).
- `ams_live_snapshot`: png, txt or program.
- `ams_live_record`: start, then stop to get a gif or mp4 back.
- `ams_export_continuous`.

**Assets**
- `ams_assets_list` (with search), `ams_asset_get` (image and program).
- `ams_asset_add`: from the preview, the painting, a candidate, or a URL.
- `ams_asset_update`, `ams_asset_delete`, `ams_asset_folder` (create, rename or open), `ams_asset_export`.

**Workbench: scenes, boards and pages** (the workbench at `/`)
- `ams_scene`: list, new (empty, or from a process document), open, duplicate, delete, move, and get (another scene's document without opening it).
- `ams_board`: list, add, update (title, size, place, paper, text), move in the sequence, delete (marks go to the blackboard unless deleted too), go, train (the board models learn from), assign marks to a board, and code (run the board's own score into it).
- `ams_add` takes `board`: points are then relative to that board. `ams_get`, `ams_snapshot` and `ams_process_sheet` take `board` too.
- `ams_page`: the drawing as a self-contained HTML page (every board with its picture, process view, replay, text and live code), with an intro.
- `ams_active_brush`: the Brush tool's active brush and its slots, for drawing or performing alongside a person.
- In scores, `board('Title')` makes a board (if new) and later marks land on it, in fractions of that board.

## The agent as engine

Engine **Agent (MCP)** makes the agent the model.
1. `ams_agent_brief {prompt, parent?, feedback?}` returns what an in-app engine would be told: system prompt, a user prompt per candidate with its variation directive, the medium's coordinate system, and the parent program.
2. Write programs (`{version: 1, actions: [...]}`), then call `ams_agent_submit {prompt, programs, parent?, model?}`. They become a normal round: rendered, rateable, usable for variations and datasets. `model` labels the candidates, e.g. `claude-opus-5-5`.
3. If a user presses Generate with the Agent engine selected, the round waits. `ams_agent_pending` returns its brief, and `ams_agent_submit` answers it.

This lets a frontier model produce training data in the studio's own format, with human or agent ratings attached. Rounds are logged in the session like any other, for `ams_get_dataset`.

## Part labels in programs

Label the key parts of a program with comments, not every line:

```
// background
background #efe1c2
// sun
fill #c8402f
circle -0.55 -0.6 0.22
// bow
stroke #231f20 1.6
polyline 0.44,-0.56 0.54,-0.44 0.57,-0.24
```

In JSON this is `{"op":"comment","text":"bow"}`, and a single action can also carry `"note"`. They are never drawn. They survive the DSL, JSON and SVG round trip, and engine prompts ask for them. They make programs readable, and they give training data a map from words to parts of a drawing.

## Reference as prompt

The **Prompt** menu next to the prompt box chooses what engines receive:

| Mode | What is sent |
|---|---|
| Text | the typed prompt |
| Text + reference | the prompt plus the reference image (cropped to the canvas aspect, JPEG up to 768 px) |
| Reference only | the image, with a short built-in text |
| Describe ref → text | the current model describes the reference; the description fills the prompt box (you can edit it), then generates |
| Describe ref → text + reference | the description plus the image |

- **Engines that take images:** OpenRouter and OpenAI-compatible (vision models), Ollama (vision models), and WebGPU LFM2.5-VL. The Agent engine receives the image as `referenceImage` in its brief.
- **Describing:** these engines also implement `describe()`. MCP has `ams_set_prompt_mode`, `ams_describe_reference`, and `promptMode` on `ams_generate_round`.
- **Other engines:** models without image input get the text only. WebGPU logs a warning.
