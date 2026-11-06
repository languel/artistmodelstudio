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

## Model settings: what applies where

- **Assistant panel (chat):** Temperature (0.4), Steps, Remember, Studio tools. Defaults were a judgement, not measured.
- **The `/` field:** its own temperature (`flowTemperature`, Settings › Model › Quick field). Measured on 5 Nov 2026 with lfm3-omni, model only, held-out wording, 16 tasks, two runs each: temperature 0 → 13, 13; 0.3 → 12, 13; 0.7 → 11, 13. Lower is steadier and never worse. lfm3-omni's own Modelfile recommends 0, which agrees.
- **The model's own settings fill the fields** (`OllamaArtist.recommended()` reads `/api/show`: temperature, top_p, top_k, min_p, num_ctx). Unset, a field shows what the model recommends (tagged *model*, hover for the others, which Ollama applies by itself since we send no override) and the request omits the temperature; with no recommendation it falls back to 0.4 (chat) or 0.1 (quick field). Typing a value overrides it; ↺ goes back. Other engines (OpenRouter, OpenAI-compatible) have no such metadata here, so they use the fallbacks. Models that advertise `tools`, `audio` or `speech` in `ollama show` (lfm3-omni does) could also do native tool calls and dictation; not used yet. It does not use Steps or Remember: it keeps no history, gets one retry after a failed call, and has its own token cap.
- **Agent (MCP):** the Assistant panel does nothing (it says to drive the tools over MCP). The engine only serves the Generate panel (`ams_pending` → `ams_answer`). The Asking settings are dimmed and off for it.
- **Favorites** are per engine, but the model menu shows all of them. *Remove a favorite* in that menu lists every one with ✕; an Ollama model that is no longer installed is marked.

## LFM3-Omni in the browser (engine `lfm3`)

`src/artists/Lfm3WebGPUArtist.js`: Liquid AI's LFM3-Omni-2B on WebGPU, one model for text, tool calls, listening and speaking. Pick it in the model menu or Settings › Model (*LFM3-Omni (this browser)*). The runtime is Liquid's own WebGPU library, imported at run time from their demo Space's static host (it follows the Space's latest version, not a pinned commit; **not copied into the repo: its licence is not stated**); the weights are `LiquidAI/LFM3-Omni-2B-GGUF` (LFM Open License v1.0), downloaded once and kept by the browser. Needs WebGPU (Chrome, Edge).

- `complete({system, user})`: text, what the chat and the `/` field use. Text is greedy (the model card's recommendation).
- `chat({messages, tools})`: native tool calls (OpenAI-style specs, `role: "tool"` results, rounds until it stops calling).
- `speak(text, {language, gender})` → 24 kHz samples; the prompt is `Perform TTS in <language> using a <gender> voice.` with `audio_temperature` 0.4 and `audio_repetition_penalty` 1.2 (the card's recommendations).
- `transcribe(samples16k)`: `Perform ASR in English.`
- The first use shows the download in the chat's spinner line (`ams-engine-status` events).

### Speech out

- **Narration voice** (palette): *Narration voice: LFM3-Omni* or *Kokoro*; *Narration voice (LFM3)* picks the language and gender ("American English / female"). Both make the same kind of clip (an audio Asset, found again by a hash that includes the engine and voice), so scripts and the timeline use whichever is chosen. A `[word](/ipa/)` mark keeps the word and drops the sounds for LFM3.
- **Narration → audio track**: Timeline › add › *Voice the narration* (or the palette command): every Narration (`say`) clip becomes an audio clip on the Audio track at the same time, with its waveform, kept in Assets (Narration). Run again after editing: only lines without a voice are made (`narrates` links the clip to its line).

## Chat that reads like a conversation

The Assistant shows what you said (the context line and attachments travel with the message but stay out of the bubble; hover for them) and what it said. Its tool calls are not shown: a spinner line (`⠋ working`) while it works, then nothing (a failed call leaves one line, "✗ 1 did not work"). For debugging, ⋯ › *Show tool details* (or Settings › Model › Tool details) shows each call and result under every reply; they are always in the request log (`ams_requests`).

## Speaking replies and the voice

`voiceOut.js` (`app.speaker`): the Assistant can say its reply as well as write it. ⋯ › *Speak replies* (or Settings › Model › Voice › Speak replies); each reply also has a 🔊 on hover to read it aloud (again to stop). The voice is LFM3-Omni's, in this browser, whatever engine wrote the text (Ollama writes, LFM3 speaks). Voice options (Settings › Model › Voice): **language** (the model's 19 speech languages: American and British English, Arabic, Chinese, Danish, Dutch, Finnish, French, German, Greek, Hebrew, Italian, Japanese, Korean, Polish, Portuguese, Spanish, Swedish, Turkish) and **voice** (female or male). American English / female is the default. Narration made with LFM3 uses the same voice. What is spoken is the words only (`speakable`: no code, ids, links or markup; the first sentences of a long reply), starting dictation stops the voice, and nothing is downloaded behind your back: if the model has not been loaded here, it tells you where to load it.

## LFM3 in the browser, tuned (5 Nov 2026)

Reading the reply was the first problem: the model gets the content of its JSON right and the closing brackets wrong (one missing, one too many). `repairJson` (assistant.js) closes what is open, drops what is stray, and ignores text after the object. Evals on LFM3-Omni in the browser, model only: **10/16 → 14/16** (original wording) and **6/16 → 9/16** (held-out wording).

## Watching the assistant work: `/agent` and the Guide

Every tool call goes through `callTool` (mcp.js). **Quiet** calls (the `/` field, flow mode) just act. Others are *shown*: the Guide (`guide.js`) moves a cursor to the control the tool uses, rings the click, and a caption card says what and why (a tool call's `narrate` argument is the caption; without one the studio writes one); the call is logged as `Agent → …`, and the session recorder and the Recorder keep it (an *Agent run* take; ⋯ › *How did you do that?* replays it with the Guide). Pace: the Guide card's menu (Instant, Fast, Normal, Slow).

`/agent <what to do>` (also `/show`) asks the assistant for something and acts it out that way: the same request as the `/` field, but not quiet, with the model's own sentence as the first caption. For tutorials: `/agent` for a live demonstration, an authored walkthrough (`walkthroughs.js`) or script (`script.js`: cues with `say`, `drag`, `click`) for a fixed tour, `ams_sessions replay` to show again what an agent did. The chat's normal mode (not the `/` field) is not quiet either, so its tools are also shown.

## Reproducing the lessons (5 Nov 2026)

`lessonEval.js`: give a model a teacher's description of one of the sampling lesson's boards (a grid of dots colored from a painting; the same with the size from the darkness; scattered dots; a pointillist walk) plus three boards that are not in the lessons (rings, a sun, stripes), with the studio's language reference (`SCRIPT_REFERENCE` plus the rules on units and light/dark). It writes code; the studio runs it on a blank board; the result is compared with the lesson's own board (does it run, does it read the right source, how many marks, how alike is the picture). Each task has two wordings (the teacher's, and a rephrased one). A broken program is sent back to the model with the studio's real error and line, twice at most. `fixCode` (codeFix.js) repairs two mistakes mechanically before running: a variable named like a function it calls (`const rect = rect(…)`) and a comma ending a declaration.

| Model | teacher's wording | rephrased | total |
|---|---|---|---|
| Qwen 3.8 9B coder (Ollama) | 7/7 | 7/7 | **14/14** (exact mark counts: 2700 of 2700, 721 of 721) |
| LFM3-Omni 2B in the browser | 4/7 | 5/7 | 9/14 |
| LFM3-Omni 2B on Ollama | 3/7 | 4/7 | 7/14 |

- The browser runtime is not the limit: the same weights on Ollama score the same, within noise. **The size of the model is.** The 2B model writes plausible code that is wrong in the same few ways (an inverted "lighter than", the row count made up from the picture, `const plane = rect(…)`, stray commas); the 9B coder does not.
- **Worked-example retrieval hurt** (`codeExamples.js`: the two most similar lesson boards in the prompt, the target left out): 6/14 against 8/14 without. The small model copies them. It is kept as an option (`examples: 2`), off by default.
- The repair loop rarely rescued a 2B failure (it cannot fix what it does not understand); the mechanical `fixCode` did rescue some.
- The quick field and chat tasks (move, recolor, a row of circles) are another thing: LFM3 in the browser does those (14/16, and 15/16 through the instant phrases and commands), so a reasonable split is **LFM3 for conversation, commands and drawing, a coder model for writing board code**.

## Models to try for writing code, and for students with no Ollama (survey, 5 Nov 2026)

Results so far are in *Reproducing the lessons* above (Qwen 3.8 9B coder 14/14; LFM3-Omni 2B 9/14 in the browser, 7/14 on Ollama). Next, the same lesson test (`lessonEval.js`, `window.__evalEngine` picks the engine) on:

**Ollama** (downloads started; disk is fine): `lfm2.5:8b` (LFM's offline 8B MoE), `gemma4:12b`, `flint` (a 40B MoE with about 2B active), `qwen3-coder:30b` (a 30B MoE, about 3B active, quick for its size). Already installed: `bonsai-2:27b` (ternary, 8.3 GB), `dlasher/LFM2.5-24B-A2B-ENG:IQ4_NL`, `qwen3.8:27b-mlx`, `d3:2b`, `d1-omni`.

**LM Studio** (running on this machine, port 1234, OpenAI-compatible): use the *OpenAI-compatible* engine with base URL `http://localhost:1234/v1` (no key needed); its models list at `/v1/models`.

**In the browser, no host to run** (for students). The community list at huggingface.co/spaces/webml-community has, among others: *Qwen3.5-WebGPU* (`onnx-community/Qwen3.5-0.8B / 2B / 4B-ONNX`; our *In-browser* engine already lists these, and Qwen2.5-Coder 0.5B / 1.5B, LFM2.5, Gemma 4 E2B, Llama 3.2 3B), *Phi-3.5-webgpu* (`Phi-3.5-mini-instruct-onnx-web`, 3.8B), *LFM3-1.7B-WebGPU-Pi* and *MiniCPM5-2B-WebGPU-Pi* (GGUF, their own runtime), *GPT-OSS-WebGPU* (20B, heavy), *ternary-bonsai-2-webgpu-kernels* (a 27B ternary model with custom WebGPU kernels: the family of the local `bonsai-2:27b`), and smaller ones (SmolLM, Qwen3 0.6B, DeepSeek-R1 distill 1.5B). The *In-browser* engine (`WebGPUTransformersArtist`, transformers.js) can run any of the ONNX ones by model id; the GGUF and kernel ones need their own runtimes (as LFM3-Omni does).

**Design:** a *Code model* setting (engine + model) so conversation, commands and drawing stay on a quick small model while code is written by a bigger one; and a browser-only default for students (LFM3-Omni for conversation, voice and drawing, plus the best in-browser coder that passes the lesson test).

## Speed, measured (Ollama, this Mac, 5 Nov 2026)

Generation, 160 tokens, temperature 0, **with the GPU to itself**: LFM3-Omni 2B **254 tok/s**, Flint (40B MoE, about 2.5B active) 153, Bonsai 2 4B 146, Qwen3-Coder 30B (MoE) 133, Bonsai 2 9B 101, Qwen 3.8 9B coder 76, Bonsai 2 27B **41.5**. So a 300-token program takes about 1 to 2 s on the small models and about 4 s on the 9B coder, and about 7 s on the 27B.

*Correction:* an earlier version of this section gave 31, 22, 11 and 5.3 tok/s for LFM3, Qwen3-Coder, the 9B coder and Bonsai 27B. Those were measured while a browser model was using the same GPU, and are 5 to 8 times too low. Measure with nothing else running. The browser demo for Bonsai uses its own WebGPU kernels, so its speed has to be timed there (not yet done; a 5.9 GB download).


## Lesson test, all models measured so far (5 Nov 2026)

`lessonEval.js`: 7 tasks (4 lesson boards, 3 held-out) in the teacher's wording and a rephrased one, so 14 in all. Speed is generation with the GPU to itself. Raw results: `scripts/eval/results/`.

| Model | Where | Size | Score /14 | Speed |
|---|---|---|---|---|
| **Qwen3-Coder 30B** (MoE) | Ollama | 18 GB | **14** | 133 tok/s |
| **Flint** (40B MoE, 2.5B active) | Ollama | 22 GB | **14** | 153 tok/s |
| **Qwen 3.8 9B coder** | Ollama | 6.7 GB | **14** | 76 tok/s |
| Bonsai 2 27B (ternary) | Ollama | 8.3 GB | 13 | 41.5 tok/s |
| Bonsai 2 9B (ternary) | Ollama | 3.2 GB | 12 | 101 tok/s |
| **Bonsai 2 4B (ternary)** | Ollama | 1.6 GB | **12** | 146 tok/s |
| **Qwen3 4B Instruct 2507** | **browser** (transformers.js) | 2.1 GB | **12** | |
| Qwen3.5 4B | browser | 2.6 GB | 11 | slow: it thinks aloud |
| Phi-3.5 mini 3.8B | browser | 2.3 GB | 10 | |
| **Qwen2.5-Coder 1.5B** | **browser** (transformers.js) | ~1 GB | **10** | |
| LFM3-Omni 2B | browser (Liquid runtime) | 1.6 GB | 9 | |
| LFM3-Omni 2B | Ollama | 2.4 GB | 7 | 254 tok/s |
| Qwen3.5 2B | browser | 1.3 GB | 6 | |
| LFM3-VL 2B | browser | 1 GB | 2 | |

Reading it: **code writing tracks size and code training, not recency**. At about 4B the ternary Bonsai (1.6 GB on Ollama; about 1.15 GB as the browser file) equals the best browser model that runs today (Qwen3 4B Instruct 2507, 2.1 GB), at half the download, and the 9B ternary (12/14) is no better than the 4B. Only the 9B coder and the two big MoE models (Qwen3-Coder 30B and Flint) are perfect. The one task small models keep missing is the pointillist walk ("lighter than 0.3").

The small tier for weak laptops: **Qwen2.5-Coder 1.5B (about 1 GB) scores 10/14**, as well as Phi-3.5 mini at more than twice the size, and better than LFM3-Omni 2B. A model trained for code beats a larger general one at this size; Qwen3.5 2B (6/14) shows that newer is not the same as better here, since it spends its tokens thinking aloud.

## The shipped Code model path, checked (5 Nov 2026)

`ams_write_code` (codeWriter.js: the prompt, `fixCode`, run, up to two repairs) on the 7 lesson-test tasks in the teacher's wording (`scripts/eval/results/code-model-smoke-2026-11-05.json`): **Qwen 3.8 9B coder on Ollama 6/7** (the dot grid took three tries and passed; the sun failed), **browser Standard (Qwen3 4B Instruct) 6/7** (the pointillist walk fails, as everywhere), **browser Light (Qwen2.5-Coder 1.5B) 5/7** (the sun passed on its second try). That agrees with the eval (14/14, 12/14, 10/14 over both wordings) within the noise of one wording.

Chat and command evals after all of today's changes (LFM3-Omni in the browser, the 16 tasks of `assistEval.js`): the whole path (instant phrases, then commands, then the model) **15/16 and 15/16** (only "draw a house" fails); the model alone 13/16 and 10/16.

## LFMs in the browser (WebGPU), and the other formats (catalog, 5 Nov 2026)

Format key: **ONNX** is what transformers.js runs in a browser (WebGPU). **MLX** is Apple's runtime for a Mac: fast on Apple silicon, not in a browser. **GGUF** is what Ollama / LM Studio / llama.cpp run (and Liquid's own browser runtime for Omni). **LiteRT / MNN** are phone runtimes (Android/iOS), not for us.

Browser (WebGPU), transformers.js 4.3.2 (what AMS ships):

| Model | Size (q4f16) | Works now | Notes |
|---|---|---|---|
| `LiquidAI/LFM2.5-1.2B-Instruct-ONNX` | ~0.8 GB | yes (default preset) | text |
| `LiquidAI/LFM2.5-2.6B-ONNX` | 1.53 GB | preset (Experimental) | text |
| `LiquidAI/LFM2.5-8B-A1B-ONNX` | 5.05 GB | preset (Experimental) | MoE, 1B active |
| `LiquidAI/LFM2.5-24B-A2B-ONNX` | 13.7 GB | too big for students | MoE, 2B active |
| `LiquidAI/LFM3-VL-2B-ONNX` | 1.31 GB | yes | vision; weak at code (2/14) |
| `LiquidAI/LFM2.5-VL-3B-ONNX` | 2.87 GB | untested | vision |
| `LiquidAI/LFM3-1.7B-ONNX` | 1.38 GB | **no on 4.3.2**: "Missing inputs: logits_to_keep" | needs a newer transformers.js (4.4.0-next.0 mentions `logits_to_keep`; to test) |
| `onnx-community/LFM3-1.7B-ONNX` | 1.09 GB | untested | an earlier export; may not need `logits_to_keep` |
| `onnx-community/LFM2-1.2B-Tool-ONNX` | 0.87 GB | untested | tool-calling fine-tune |
| `LiquidAI/LFM3-Omni-2B-ONNX`, `LFM3-Audio-2B-ONNX`, `LFM2.5-Audio-1.5B-ONNX` | 1.4-1.7 GB | **no**: `lfm3_omni` / `lfm3_audio` are not in transformers.js 4.3.2 or 4.4.0-next.0 | Omni runs through Liquid's own runtime instead (what AMS uses) |

Browser, Liquid's own runtime (loaded from their Space): LFM3-Omni-2B GGUF (1.6 GB; text, tools, speech in and out) and the Pi coding-agent Space's LFM3-1.7B GGUF Q4_K_M (~1.1 GB, `Lfm3ForCausalLM.js`). Licence of the runtime is unstated: load at run time, do not vendor.

Mac (MLX, for personal development; `mlx-lm` / LM Studio): `LiquidAI/LFM3-1.7B-MLX-{4,5,6,8bit,bf16}`, `LiquidAI/LFM3-Omni-2B-MLX-{4,8bit,bf16}`, `LFM3-VL-2B-MLX-*`, `LFM3-Audio-2B-MLX-*`, `LiquidAI/LFM2.5-24B-A2B-MLX-{4,6}bit`, `mlx-community/LFM2.5-24B-A2B-OptiQ-4bit`, `mlx-community/LFM2.5-8B-A1B-OptiQ-4bit`, `mlx-community/LFM2.5-230M-OptiQ-4bit` (sub-1B candidate).

Ollama (GGUF): already installed `dlasher/LFM2.5-24B-A2B-ENG:IQ4_NL` (13 GB), `lfm3:1.7b`, `lfm3-omni`.

Community / elsewhere: Spaces `LiquidAI/LFM2.5-1.2B-Thinking-WebGPU`, `LFM2.5-VL-{450M,1.6B,3B}-WebGPU`, `LFM2-MoE-WebGPU`, `webml-community/lfm2-webgpu-kernels` (LFM2.5-230M with custom kernels), `webml-community/LFM3-1.7B-WebGPU-Pi`. Fine-tunes: `LFM2.5-350M-JSON-NoFence`, `ScanAtlas-LFM2.5-350M-Planner`.

Plan: browser = student default (LFM2.5-2.6B / LFM3-1.7B once loadable, Qwen as the reliable fallback); Ollama/MLX = personal, with the 24B-A2B as the "better model" test.

Candidate found by the user (5 Nov): `danyalmalik/NVIDIA-Nemotron-3.5-Bolt-E4B-ONNX-WebGPU` — NVIDIA Nemotron 3.5 Bolt E4B (post-trained from Gemma 4 E4B), text only, q4f16 ~4.9 GB (decoder 2.9 GB + embeddings 2.0 GB), licence OpenMDW-1.1, arch `gemma4` (graphs from `onnx-community/gemma-4-E4B-it-ONNX`, so transformers.js may load it; it is built for the "Quick Inference" runtime). Too big for a student default; a candidate for personal browser use. To test after the running sweep (editing `src/` would reload the page).

Lesson test on Ollama (/14, 5 Nov, GPU not idle so times are rough): `dlasher/LFM2.5-24B-A2B-ENG:IQ4_NL` **13/14** (only the light-walk lesson failed on one wording; the best LFM so far, close to the 9B coder); `lfm3:1.7b` 8/14; `lfm3-omni` 7/14. So the LFM3 small models are still the weak code writers; the 24B-A2B is the "better model" for personal use (13 GB, 2B active).

Browser, `onnx-community/LFM3-1.7B-ONNX` (q4f16, loads in 19 s with transformers.js 4.3.2, so the `logits_to_keep` error is only in Liquid's own build): lesson test **3/14**. It writes its reasoning aloud ("We need to answer…") and runs out of tokens before the code; the same model on Ollama (`lfm3:1.7b`) is 8/14. It would need its thinking suppressed or a larger token budget. Not a student default.

Browser, `LiquidAI/LFM2.5-2.6B-ONNX` (q4f16, ~1.6 GB): lesson test **8/14** (4/7 on each wording), 387 s. The same score as `lfm3:1.7b` on Ollama and a little under LFM3-Omni in the browser (9); the Qwen2.5-Coder 1.5B Light tier scored 10 and Qwen3 4B Instruct 12. So among ~2B browser models, Qwen-Coder 1.5B is still the best code writer; LFM2.5-2.6B is the versatile (chat/tools/vision-free) alternative.

Not loadable in AMS's browser engine (transformers.js 4.3.2), 5 Nov: `danyalmalik/Qwen3-8B-ONNX-WebGPU` (one `model.onnx` at the root: the Quick Inference / ORT-GenAI layout, no `onnx/model_q4.onnx`), and `danyalmalik/NVIDIA-Nemotron-3.5-Bolt-E4B-ONNX-WebGPU` (the q4f16 load failed for a reason the fallback hid, then asked for a `q4` file that does not exist). The same goes for the other danyalmalik builds (DeepSeek R1 7B, Flint). Using them would mean adopting the Quick Inference runtime (github.com/mdanyalmalik/quick-inf) as a second browser engine; their presets are removed. Not worth it for students; revisit for personal use.

**Liquid's official `LiquidAI/LFM3-1.7B-ONNX` in the browser: lesson test 12/14** (6/7 on each wording, 366 s; q4f16, ~1.4 GB, 1.6 s to answer a short question once loaded). It needed three things: transformers.js `4.4.0-next.0` (upgraded from 4.3.2), a small workaround in `WebGPUTransformersArtist.js` (`supplyLogitsToKeep`: the graph takes an input `logits_to_keep` that the library does not know; we give it `[1]`), and `enable_thinking: false` (the model thinks aloud otherwise, and 4.4 puts that in a separate `reasoning_content` field). The earlier 3/14 for the onnx-community export was the thinking, not the model. This is the best ~2B browser model so far for code (Qwen2.5-Coder 1.5B 10, LFM2.5-2.6B 8) and is from the same family as Omni.

Chat/command eval, `LiquidAI/LFM3-1.7B-ONNX` in the browser, whole path (phrase grammar, then model), first wording: **15/16** (11 handled by the phrase grammar, 5 by the model; only "draw a simple house" failed, as with LFM3-Omni). The model-only and held-out-wording runs have not been done for it yet.

## Hosted providers (6 Nov 2026): Pratt Institute, NVIDIA NIM, GitHub Models

Three engines beside OpenRouter and OpenAI-compatible (`src/artists/providers.js`, one `OpenAICompatibleArtist` each, own key and model in Settings → Model). On the **dev server** the keys are read from its environment and added by a proxy (`/__llm/<provider>/…` in `vite.config.js`), so they never reach the page and the providers' CORS does not matter: `PRATT_LLM_API_KEY`, `NVIDIA_NIM_API_KEY` (or `NVIDIA_API_KEY`), `GITHUB_TOKEN` / `GH_TOKEN` (or `gh auth token`). On the deployed site there is no proxy: paste a key in Settings (a provider may refuse calls made straight from a browser).
- **Pratt** (`https://llm.pratt.edu/v1`): works. The key sees 16 chat models (DeepSeek V4 Flash/Pro, Kimi, Qwen, Grok, Nemotron, GLM, Mistral, Gemini, …); `pratt-high`, `pratt-medium` and `pratt-medium-fast` from the docs are **not allowed for this key**. DeepSeek V4 Flash answered in 1.5 s. The server mislabels compressed replies, so the proxy asks for none.
- **NVIDIA NIM**: the model list loads (84), but many are retired or not enabled for the account ("end of life", "Function not found for account"); a few answered slowly or not within 90 s. Pick from the live list and test.
- **GitHub Models**: needs a token with the `models:read` permission; the `gh` token has only gist/read:org/repo/workflow, and the host answered a bare "OK" from here, so it is not verified. Create a fine-grained token with Models read and put it in `GITHUB_TOKEN`.
- **ChatGPT subscription** is not offered: a ChatGPT plan has no API access (the API is billed separately), and the unofficial ways to borrow a subscription's login are against OpenAI's terms. Use an OpenAI API key in the OpenAI-compatible engine.
- **Google Gemini** (`GEMINI_API_KEY` or `GOOGLE_API_KEY`; OpenAI-compatible endpoint `generativelanguage.googleapis.com/v1beta/openai`): works. 58 models listed, `gemini-2.5-flash` answered in 1.6 s.
- **OpenRouter** now uses `OPENROUTER_API_KEY` from the dev server environment when no key is set in Settings (the proxy adds it). Verified: the list loads and a request is accepted (the free model tried was rate-limited upstream, which is a different error from a missing key).
