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
| Boards | The drawing's boards in order (click to go, double-click to rename, the dot marks the training board), the blackboard, the page intro and page export. |
| Stages | The process as ordered layers: show, lock, rename, kind, reorder. New marks go to the active stage. |
| Outliner | Every mark by stage and group: select (Shift for a range, Cmd to toggle), rename, drag to reorder or move between stages and groups, hide, lock, delete. Cmd+G / Shift+Cmd+G group and ungroup. |
| Assets | Saved processes, takes, earlier generations, imports (images, audio, text, SVG, JSON; files or whole folders, subfolders kept), and the Klee references. Search, folders (right-click to remove), stars, tags; click, Shift and Cmd select several to drag or delete. |
| Properties | The selection, or the current tool's defaults: role, stage, brush and its parameters, color, the reason (why), the author. |
| Code | Everything as code, in modes. **Score:** write or load a score (Cmd+Enter runs it; the exercises live here). **Brush:** read, fork and write brushes with a live preview. **Sculpt:** the sculpt tools, with a preview sweep. **Selection:** the selected marks as score code; edit and Apply, and they change in place (same ids). **Clip:** a timeline clip as `clip({ … })`. Right-click a mark or a clip → Show code. Parameters are sliders (see *Parameters in code*); two glyphs at the right of the tabs toggle line numbers and where sliders go. |
| Process | Picture or process view, stage scrub and replay, a filmstrip, decisions, reasons, the editing record, and the process sheet. |
| Generate | Engines and models write scores. Candidates can be opened, saved, or read as scores. |
| Assistant | Chat with any engine (Ollama, WebGPU, OpenRouter…). It acts through the same tools as an agent, visibly. *How did you do that?* replays its last session. |
| Decide | The drawing as a sequence of typed decisions, answered by a policy you can train (see below). |
| Docs | The documentation, with search and collapsible contents. Parts are generated from the code: brushes, vocabulary, exercises, tools. It also holds the walkthroughs, the Lessons (each with Build the scene and Take the tour) and the training estimator. |
| Settings | Artboard size (presets, rotate) and paper, theme, accent color (record, playhead, points), grid (on the paper or everywhere, lines or dots, spacing, subdivisions, color, snap), reference opacity, the guide. Cmd+, |
| Shortcuts | Every command and its keys, searchable. Click a key to reassign it; a key taken from another command moves. Shift+Cmd+/ |
| Timeline | Record, review and edit takes (bottom dock): transport, tracks of clips, summary, walkthrough, export (playable HTML, project zip, video, JSON). |
| Log | What happened, including every agent action (in purple). |

**Cmd+K** opens the command palette, which finds every command, panel, exercise, walkthrough and docs topic by name. Anything else you type goes to the Assistant. **?** opens the Docs.

**Walkthroughs** (after underscores) move the guide cursor to the real controls and run actions through the agent tools, so they are logged and undoable. Some steps wait for you. The narration card has Back, Pause, Next and Stop. The walkthroughs:
- *Taking a line for a walk*, a lesson after Klee and William Ngan.
- *Tour of the workbench*.
- *Teaching a decision policy*.
- *Study: Senecio*: study a painting, write its methods as brushes and a score (typed live), reproduce it, then draw a new subject in its manner.
- *Lesson: sampling Seurat and Munch*, *Lesson: diffusion models* and *Painterly, fading strokes (Klee)*: build the lesson as a scene (or open it, when it is already there) and walk through its slides; the painterly one builds a scene with Senecio as a source and shows the painter, its sliders, performance and an effect.

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
| B | Brush: draw with the active brush (click the button again or right-click for the list; picking one with marks selected applies it, Cmd-click only picks) |
| S | Sculpt (see below); Shift+drag over a mark sculpts it with most tools. `[` `]` radius, Shift+`[` `]` strength |
| T | Note (after the grid toggle in the toolbar) |
| ' | Show every mark's points as faint dots |
| Opt+right-click | The active tool's parameters as sliders, where you click |
| F | Fit the artboard |
| \ | Toggle the picture / process view |
| R | Toggle the reference underlay |
| Cmd+Z / Shift+Cmd+Z | Undo / redo |
| Cmd+S | Save to Assets |

**Stroke and fill:** two swatches in the toolbar. New marks take them, and selected marks change with them. Right-click for none, brush ink or swap; the color picker has a None button (or type `none`).

Opening an image asset (or an image file) puts it under the artboard as a reference. It isn't part
of the picture, and the Generate panel can send it to vision models.

## Editing

**Several marks selected:** Properties shows what they share, and a change goes to all of them in one undo step. Element, Brush and Look as before; **Play** shows the first mark's controls and applies each change to every selected mark that plays alike (the same Play parts: all travelers, all events…), and says how many do; **Physics** shows the role, shape and material, *Mixed* where they differ; **Reason** shows *Mixed* when they differ and sets one for all.

- **Transforms:** select, then hover near the frame. A corner scales (Shift keeps proportions, Alt from the center), a side stretches, just inside (or outside) a corner rotates (Shift snaps to 15°).
- **Right-click** a mark: arrange, move to stage, brush, sculpt, simplify (fewer points, same shape), duplicate, group, lock, hide, delete. Right-click the empty canvas: select all, fit, grid, snap, a note there.
- **Image layers:** drag an asset from Assets (or image files from the desktop) onto the canvas. Pictures become image layers that move, scale and rotate like any mark and travel inside the drawing; a saved drawing comes in as a group of its marks.
- **Look:** every element has an opacity and a blend mode (Properties → Look).
- **Notes:** notebook (handwriting on the page), sticky, index card or plain; font, size, width, paper. Drag a side to re-wrap, a corner to scale the lettering. A new note starts from the last note you styled.
- **Color:** the picker has a saturation/brightness field, hue, opacity, hex or a color's name (pigments such as *payne's gray*, CSS names), palettes (Klee, Kandinsky, Bauhaus, inks, grays, pigments, your own, or sampled from the reference), recent colors, and an eyedropper (I).

## Quick commands and Properties at the pointer

- **`/`** opens a small field at the pointer, about what is selected (or under the pointer). Type a command ("fit", "group"), a phrase ("change the fill to red", "cross hatch it", "opacity 50", "hide it", "call it horizon") or a request. **Enter** runs the top row, **Cmd+Enter** asks the Assistant. It never asks you questions back: it picks the likeliest meaning and does it, and the whole request undoes as one step. Cmd+K is the same list, larger.
- **Option+right-click** opens the whole Properties panel, small, at the pointer: the marks, the board, or the tool's settings. Blend, brush, role and path are glyph menus. Work without the side panels.
- How it works, and what is next: [quick-commands.md](quick-commands.md).

## History, recording and the timeline

(Architecture, file map and how to reuse this in other projects: `docs/recording-system.md`.)

**History** captures every change to the drawing (its own capture button pauses it): preview any past state, restore it (undoable), or drag entries onto the Timeline as clips. Each change has **▶** (play it: the canvas shows the drawing as it was before it, and the change is drawn on at the pace it was made) and **mute** (the change is left out of previews, playback, takes and the Timeline, so the rest can be tried without it); the ▶ in the bar plays the selected changes in order. In the list, ↑ ↓ step through the changes (previewing each), Space plays the selection, M mutes it, Esc goes back to the drawing. Dragged onto the Timeline, changes go **at the end** of what is there (so a composition is assembled a step at a time; on the grid, the next line after the end), **at the playhead** with ⌥⇧, or **where you drop them** with Ctrl/⌘ (on the grid); a line and a note show where while you drag. Changes keep their order and their own lengths; muted ones are skipped. The **Timeline** is what you produce: tracks of clips as in a video editor (any number of narration, drawing, title, camera or audio tracks; rename, mute, delete; drag clips between tracks of a kind). It starts with no tracks: one appears when something goes on it (a recording, a drop, an insert) or when you add it (**Track** under the track names, or the track glyph in the bar). The **insert** glyph (a playhead with a plus) puts a title card, a line of narration, a camera keyframe, a hold or a sound at the playhead, starting a take if there is none; the playhead can sit past the end, where the next thing goes. Drag sound, text or saved drawings from Assets onto it; audio plays in review, in the standalone player and in video exports.

**History on the Timeline.** Every take carries the History as a muted track named *History*, holding one composition clip with the changes made so far (the last 200), each a clip, at the pace they were made. Unmute the track to replay the drawing from History; double-click the clip to open it and inspect, move or delete steps (Esc leaves). The clock-arrow button in the Timeline's transport (beside Record) is History's own capture switch: on, every change goes to the History panel and the track; off, neither is recorded (the panel's red dot is the same switch). Delete the track (right-click its name) and it stays gone for that take until the button is switched off and on again. It is rebuilt when History changes, so edits inside it last until the next change to the drawing, and it is never saved with the take.

**Recording interactions (for walkthroughs).** History keeps the drawing; the pointer button in the Timeline's transport (beside the History one) records the *controls you click*: the tool you pick, the panel you open, the menu item, each with its name and when. Strokes on the canvas and pointer moves are not recorded (History has the strokes). They appear on an *Interactions* track of a take (real spacing, long gaps shortened). As the take plays, the Guide's cursor travels to each control and clicks it, with its name on the card (mute the track to silence it; History's track is muted by default); it only shows, it does not redo the action. The Guide's pace must not be Instant. Order matters: switch recording on, do the work, then press New take: the take starts from when recording began (picking a tool closes a take that is open on the canvas, so work outside it). A take made with recording off starts empty, from now. Unlike the History track, the Interactions track is saved with the take.

**One clock for the live tracks.** The History and Interactions tracks are built from real timestamps on a shared clock (`liveClock.js`), so a click, the stroke it made and its History entry sit at the same place. Idle stretches longer than 2 s are shortened the same way on both, so they stay in step. A stroke lasts as long as it took to draw (from when you pressed). A take's own *Drawing* track (an overdub, a recording, clips dragged in) is separate: it is on the transport's time, not on this clock, so it does not line up with the live tracks unless it was recorded in the same pass.

**Reading a take closely.** *Track height:* the vertical slider down the right side of the tracks (taller up; or Alt+wheel over the tracks), makes every track taller; from about 1.5× a clip shows its whole label, wrapped, so events can be read. *Take as text:* the Code panel's **Take** tab (or right-click a track › Show as text…) shows the take, or one track, as Markdown to read or hand to someone, or JSON to process: titles and narration as written, drawing changes in words ("added 1 plane"), the agent's calls and your interactions as their own lines, and compositions (History is one) opened out under their clip. *New take:* a take started now starts its History and Interactions tracks from now, not from earlier in the session. *Rename:* Shift+click the take's name. **Chat:** click an Assistant reply that did something to open the tool calls behind it and what came back (a click again closes them; Show tool details shows them all).

**Clip text.** Hovering a clip tells you its kind, time and label; with Settings › Timeline › Clip tips on *In words, with details* it is the clip in a sentence ("Draw: add line — added 1 line (agent)"), who made it and what it changed. Settings › Timeline › *Text at the playhead* (off by default) shows the same sentence for every clip under the playhead, beside it, as it passes, muted tracks too: play a take and read what happens. In the Code panel's Clip tab the first lines say the same in words; a comment that starts `//!` is a headline and is shown bold, not dimmed.

**Making a demo from what you do (History + Interactions).** 1. Switch on *Record interactions* (the pointer button in the Timeline's transport, left of the History one). 2. Do the work: pick tools, open panels, draw. 3. **New take** (or the **record** button) starts empty: nothing from before is carried into it, and what you do from then on appears in its own tracks (none until there is something). To make a take from what you did before pressing it, **right-click the interactions button › Take from the recording**: it holds everything recorded since recording was switched on. A take carries a *History* track (your drawing; muted: unmute it to replay the drawing) and an *Interactions* track (your clicks, drags and keys; the Guide's cursor travels to each as it plays, so the Guide's pace must not be Instant). 4. **Save** (the disk button) to keep it: an unsaved take is gone when the page reloads, and only saved takes are in the takes list. Both tracks are saved with it. Shift+click the take's name to rename; the trash button (next to Save and Close) deletes the open take: a saved one leaves Assets, an unsaved one is just dropped, and the drawing is never touched. **Working in the current take.** Picking a tool no longer closes the take that is open: pick a tool and press record to overdub onto it (the record button uses the open take; it only makes a new one when none is open). A take being looked at is view-only: drawing on it says so, and the × in the Timeline is how you go back to your own drawing. **New take** starts empty; **Shift+click** starts it from the drawing as it is (for example the end state of what you just recorded).

**Recording state.** The record button is an outline when idle and a filled accent button with a clear ring when recording. A take made with it carries live History and Interactions tracks that grow only while it records, on the transport's own time (what you did 12 s in is at 12 s, level with the Drawing track's gestures), and are then left alone; a New take starts empty and a take from the recording is built once. What you do on the Timeline itself is not recorded as interactions (it would feed itself). **Colour picker:** a drag or click in it is recorded and played back: the picker reopens where it was and the pointer works it (other pop-ups, menus and dialogs are recorded as cues with their coordinates, but playback does not reopen them). **Scrubbing:** with the playhead stopped inside a recorded interaction the agent pointer is shown where the pointer was at that moment. The pen marker (a ring at the tip of a stroke being drawn back) is off; Settings › Timeline › Pen marker brings it back.

**Selection frames.** While interactions are recorded, each change of the selection is kept (which marks), and a take plays the dashed frame with its corner handles around the marks that were selected, from the moment they were picked until the next selection change (an *Interactions* clip *Select 2 marks* or *Deselect* marks each change). The click ring shows at the press and at the release of a drag as well as on a click.

**Playback.** A recorded drag keeps the path the pointer took and when, so on playback the pointer traces the stroke as it is drawn (the drawing's own pen marker is hidden while it does); a click travels to its control. Settings › Guide › *On playback* can leave the pointer out (*No pointer*) to watch the drawing alone, as for a video. The History clip spans as long as the recording, so the live tracks line up end to end. The agent pointer's look is in Settings › Guide: shape (arrow, ring, crosshair, dot), color (the accent color until you pick one; ↺ goes back), style (outline or filled), glow (0 to 1) and pulse.

**Recording onto the Timeline (overdub).** The Timeline's record button plays the transport (round the loop region with Loop on, else from In to Out, else from the playhead) and every gesture you draw goes onto the take's drawing track where the playhead was as you drew it, lasting as long as it took to draw. Each pass plays what is there and adds to it. Gestures that overlap share the drawing track as **voices** (polyphonic, stacked in the track), or, chosen from the record button's right-click menu, go on a track of their own (a track per pass). You can draw on the canvas while the take plays. Space, the button, or the transport reaching Out stops; the take is saved in Assets, and ⌘Z over the Timeline takes gestures back one at a time. With no take open, one is started from the drawing as it is. A **take** records how a drawing was made: the starting drawing, then clips on tracks (titles, narration, drawing changes, actions, camera, audio). Record by hand; walkthroughs and agent activity record themselves (agent recordings stop after 90 s of quiet), so a long run can be reviewed later. Takes are in Assets → Takes.

In the Timeline, clips are rectangles: drag to move, drag the right edge to retime, double-click text, right-click for speed, reveal and delete; the selected clip's properties are in Properties. **Picking and copying clips:** Shift-, Ctrl- or ⌘-click picks several; drag a box over the tracks to pick what it touches (with Shift, Ctrl or ⌘ it adds); a picked clip drags the others with it; a click on one of them picks just it. **Alt-drag** drags copies (the clips stay where they were), **⇧D** puts copies just after them. The playhead moves from the ruler (press or drag there); dragging over the tracks picks. On the canvas too, **Alt-drag** drags a copy of the selection and **⇧D** duplicates it. **Compositions** (as in After Effects): pick clips and **⌘G** (or right-click → *Group into a composition*) puts them in one clip on the **Comps** track, a timeline of their own: strokes that belong to one sequence move, stretch and repeat together. **Double-click** a composition to open it (a breadcrumb in the bar shows where you are; **Esc** over the Timeline, or the breadcrumb, comes back out); what you change inside is written back, and it grows to hold what you add at its end. Drag its right edge to **stretch** it (it plays faster or slower, shown as ×rate; Alt-drag trims instead). Right-click → *Stretch* fits it to In and Out, the loop region, or a number of bars or beats (other clips get the same *Length* menu). **⇧⌘G** ungroups (its clips go back on the tracks at its rate). Compositions nest, play in the standalone player and in video, and a muted track inside one is silent. **Two ranges, kept apart** (as an editor and a sequencer do). **In and Out** (I and O at the playhead, or drag their brackets on the ruler; right-click the ruler for *In and Out around the selected clip* and *Clear*): the time outside them is dimmed; play stops at Out, Home goes to In, L fits them, and the MIDI export runs to Out. The **loop region** is the strip along the top of the ruler (Shift-drag the ruler for a new one; drag it to move it, its ends to change it): coloured while **Loop** is on, an outline when off. With Loop on, playback goes round the loop region, else In to Out, else the whole take, and a band over the tracks shows which; scores wrap in the same range. *Loop In to Out* and *In and Out to the loop region* copy one to the other. The bar's **new take** glyph (film and a plus) starts an empty take from the drawing as it is (asking first if the one open has clips and is not saved). **Getting around:** Ctrl/⌘ + wheel (or a pinch) zooms at the pointer, the time under it held still; Shift + wheel pans (and the plain wheel does, when the tracks fit); the middle button drags the view. Under the tracks, the **navigator** is an editor's zoom bar: the whole timeline (its clips faint, In and Out, the loop region, the playhead) with the view as a thumb, a handle at each end. Drag the thumb to pan, a handle to zoom, press elsewhere to go there, double-click to fit all, the wheel zooms; at its right, what the view shows of the whole (*0:20–1:14 · 30% of 2:58*). It stands in for a scrollbar. Beside it, zoom out, zoom in, and **Fit** (all, In to Out, the loop region, the selected clip, centre on the playhead, the previous view). Pressing or dragging on the ruler or an empty lane scrubs; held near an edge, the view scrolls on and the playhead goes with it (moving a clip or a loop edge does the same). The grid (Auto) is always a division of the ruler's marks, so its lines fall on them. The ruler labels as closely as it has room (to hundredths of a second, single frames, sixteenths) and stays at the top while the tracks scroll. While playing, the view follows in pages, unless you have moved it away (then it waits until the playhead comes back into view, or play starts again). **Keys,** while the pointer is over the Timeline (or something in it has focus; they are taken before the canvas's shortcuts, and typing in a field is left alone): **F** frames the selection (the selected clip, else In to Out or the loop region, else all), **\\** or Shift+F fits all, **L** fits In to Out (else the loop region), **X** goes back to the previous view, **=** and **−** zoom about the playhead, **.** centres on it; **← →** step a frame (with the beats ruler, a beat), Shift a second (a bar); **↑ ↓** jump to the previous or next clip edge (and In, Out and the loop region's ends); **I** and **O** set In and Out at the playhead; Space plays, Delete removes the selected clip, Home goes to the start, and **⌘Z / ⇧⌘Z undo and redo the Timeline** (clips, tracks, In and Out, the loop region; a drag is one step; with no take open they undo the drawing). Right-click the ruler for the same, a clip for *Zoom to the clip*. Agents and scripts: `app.timelineView` (`get()`, `fit('all' | 'loop' | 'clip' | 'selection')`, `show(startMs, endMs)`, `zoom(factor)`, `back()`); the view's arithmetic is `src/time/timelineView.js`. **Summary** (the glyph of arrows pressing inward) distills a run (narration at reading pace, the drawing brisk, analysis and waiting sped through, a hold at the end). **Walkthrough** (the dotted route) makes a live walkthrough from a take. **Export** writes a standalone playable HTML file (the renderer inlined; `window.amsPlayer.seek(ms)` / `frame(ms)` for frame-by-frame capture), a project zip, a video (MP4 or WebM), or JSON. Agents use `ams_record` and `ams_timeline`.

## The interface

It is kept minimal.

- **Two islands:** the tools sit top centre; the menu island sits top left (menu, picture or process view, points, present, theme).
  - Drag either island, or the zoom control, by its dotted grip; double-click the grip to put it back.
  - **Alt+Z** (zen mode; also **Cmd+.**) hides all of the interface and leaves only the drawing.
  - **⌘;** opens the Code panel on the selection (the selected marks, else the picked clip, else the score); **⌥;** opens Properties.
  - **Show user actions** (**⌘⌥I** / Ctrl+Alt+I, or the command palette; after Underscores' screencast input): a small overlay showing each key you press (with the command it is bound to), each click, drag or scroll (with its modifiers, and where: the canvas, the Timeline, a panel) and **what it did**: the drawing's change (*add line*, *duplicate*, *undo*), a tool chosen, play or pause, the playhead moved, a selection, the line logged; when nothing followed, the command's or the control's name. The top line is always the latest: the glyph and the keycaps, the same size and on one line, in the accent color (each modifier and the key a cap; a gesture one short cap: *L click*, *R drag*, *M click*, ✎ pen, ☝ touch, *scroll ↑*, *scroll zoom*), and what it did in white on the right. The small chevron under the × folds the part below the line (folded by default, so the box is one line): there, first in white, what kind of input it was and where, with the current tool at the right, then the four earlier actions, dimmer, in the same two columns. A selection that follows another effect (a drag draws a mark and the new mark is selected; starting a stroke clears the selection) is left out; a click that only selects says *Select 2 marks*, one that only clears says *Deselect*. Every line is one line, so the box never changes size. Drag its header to move it, the small × at the top right hides it; it is remembered in this browser. Agent tool calls shown by `/agent` are listed too, as *Agent · add*. Pointer moves are left out (a drag is one line); typing in a field is not shown. The command palette (and `ams_ui`) hides the tools, menu island, zoom control or panels one by one.
- **Panels on demand:** Scenes, Boards, Stages, Outliner, Assets, Properties, Code and the rest open as needed.
- **Right-click and Opt+right-click:**
  - Right-click a toolbar button for its list (Brush, Sculpt, Construction) or its settings (the grid button: grid and drawing).
  - Opt+right-click the canvas for the active tool's parameters.
- **Icons:** every built-in brush and sculpt tool has an icon; the toolbar shows the active one. Custom tools take theirs from their preview (the camera button in Code → Brush / Sculpt). In menus the active item has a soft background.
- **Names:** Shift+double-click renames anything with a name, in place: boards, scenes, stages, tracks, asset titles and folders, and marks, groups and stages in the Outliner. Enter keeps it, Esc puts it back. In the Outliner and the Boards panel a plain double-click frames the item.
- **Framing:** Alt+Home frames the active board, Alt+Shift+Home the selection (Home and Shift+Home are the transport's rewind and stop).
- **Drawing:** Settings → Drawing (or the gear button, Canvas settings) has Smoothing and Simplify.
  - **Lazy** (Settings → Drawing, or the grid button's right-click) is the string length in screen pixels, and it applies to every drawing stroke. The Pen's Lazy on a tool (right-click Line, Plane, Gesture or Brush) switches the string on for that tool; with no editor Lazy set it uses the tool's own length (40 by default). Laziness in the Pen is the same setting as the editor's Lazy. The string runs between the cursor and the pen. Catch up (On by default, in the Pen) eases the pen to a still pointer, so the line reaches the cursor; Off leaves it where the string left it. Wobbles shorter than the string never reach the line, and corners get rounded.
  - **Smoothing** (0 to 0.95) is how much the pen holds back each step: 0.5 covers half the distance, so higher is smoother and lags more.
  - **Simplify** (screen pixels, 0 = off) keeps only the points the line needs, live while drawing: how far the shape may move from what your hand did. With Points on, the stroke being drawn shows its kept points.
  - Planes close smoothly: overshooting ends are cut and the seam relaxed.
- **Running a score** (Score panel, a generated candidate, an agent) draws into the active board and replaces that board's marks. The other boards and the blackboard stay.
- **Naming:** project > scene > board > stage and marks. New project starts over (after offering to keep the current one in Assets); New scene adds a drawing.

## Drawing and editing points

- **Point by point:** with a drawing tool, click without dragging; each click adds a point. Double-click or Enter finishes, clicking the first point closes, Backspace removes the last point, Esc finishes.
- **Closing:** a line drawn back to its start closes itself.
- **Smooth or straight:** ` makes the path straight and ~ makes it smooth (double-tap CapsLock flips it; it ends as it was). With a drawing tool the choice is the tool's state: the stroke being drawn takes it now and the next strokes keep it. With Select or Direct it is the selected marks'. Properties → Look → Path sets it too. Starting a new stroke lets go of the mark selected before it.
- **Laser pointer** (K, next to Pan): press and drag; a dot in the current stroke color (red when there is none) leaves a trail that fades out in about a second. It adds nothing to the drawing, the undo history or a take, and works anywhere, over locked stages and boards and while presenting. (The trail has its own overlay canvas, so the drawing is not redrawn for it.)
- **Gesture and guide** (under Line, on the same button; Shift+1 cycles line, gesture, guide): construction, shown in the process view and not in the picture. A gesture is the movement behind a form, drawn freehand. A guide is a straight segment when you drag (Shift snaps its angle); click without dragging to place one point by point, straight by default and smooth (a curved construction line) with ~.
- **Circle and rectangle** (under Plane, on the same button; Shift+2 cycles plane, circle, rectangle): drag a box. Shift keeps the sides equal (a circle, a square), Alt draws from the center, Ctrl snaps to the grid. Both make plane marks with the plane's brush, color and fill. A rectangle is four corners, or rounded ones (Rounded, 0 to 1, a pill at 1) baked into its points; a circle is Sides points (12 by default, 3 to 48) on the ellipse, round when its path is smooth and a polygon when straight. Right-click the Plane button while the circle or rectangle is in use to set Sides or Rounded; they stay for the next shapes.
- **Toolbar:** one toolbar, the same as the embedded editor's. Pan and the laser pointer share a button (H pans, K picks the laser, Shift+H cycles); Text (T) sits next to Board; the zoom controls are at the end after Canvas settings (right-click the % for the performance readout). The toolbar is modular: menu → **Toolbar** switches its sections on and off (Selection, Drawing, Score, Canvas, Frame); Score (the Play tool) is off until you want it, and every tool keeps its key whether or not its button shows; Alt+Shift+D toggles the light and dark theme. The menu (≡) comes first and holds view (picture or process, the reference), Play (present the boards), the theme, scenes and files, settings, and Panels as a submenu. The grid button toggles snap, its right-click is the grid (and Mark points); the gear next to it is Canvas settings: paper and workspace colours, names, how scores glow, how the pen draws.
- **At the pointer:** Shift+Space shows a radial menu of the current tools in a circle (a stack's members, all the brushes, all the sculpt tools, or the top-level tools from Pan or Laser). Hold the keys, move toward a tool and release to pick it; a click picks too, Esc or releasing in the middle cancels. Shift+right-click shows the current tool's settings at the pointer, for every tool. Clicking the stroke or fill swatch in the toolbar opens the same picker under it, in the mode you used last, with that side selected. C (or Ctrl+right-click) opens stroke and fill together at the pointer, in one popup with three modes (the small icons at the top; they all have the same size, the colors carry over when you switch, and it opens in the mode you used last). Fields: a field, hue, opacity and hex for each side, one shared palette (a swatch goes to the side you touched last), ⇄ swaps them, the slash button makes either none. Disc: hue is the angle and chroma the distance from the middle, in OKLCH, so the distance between the two dots is how different the colors look; lightness is the bar at each side (left fill, right stroke); click the disc to move the nearer dot. Cube: the two colors as points in a see-through, spinning RGB cube, standing on its black corner with white on top; the points can sit inside it, the tiny dots at the corners snap, drag the empty space to turn it (flick to coast, double-click to reset), and a dragged dot stays under the pointer, sliding along your line of sight only as far as it must to stay inside. The fill is a solid rounded square everywhere (the chip, the field cursor, the dots) and the stroke a hollow one, as in the toolbar. Recent and Mine stay in the toolbar's picker. Ctrl+Shift+right-click opens the grid settings at the pointer: the grid, its color, the paper of the board under the pointer (else the active one) and the workspace background, so you can adjust them on the spot. In any color field, type transparent or pull the opacity to 0 to make it clear. Every color picker has the palette dropdown with Recent and Mine in it (right-click a Mine swatch to remove it); the single-color picker adds + (add the current color to Mine) and a palette from the reference image at the bottom.- **Tool settings:** right-click Point, Line or Plane (gesture and guide share the Line button; circle and rectangle the Plane button) for the brush, its settings, opacity, blend and path of new marks. They stay until changed.
- **Boards as structure:** a board's title and border can each be switched off (Properties, the board's right-click menu under Board, or Opt+right-click on a board for a popup with those, its paper, hidden, locked, mask and performance). With both off a board draws nothing but its marks: it is only where they live, which is what you want for performance. Selected, it still shows its outline so it can be moved.
- **Zen mode:** Alt+Z (or Cmd+.) hides all of the interface, leaving only the drawing; again to bring it back. In it everything is reached by shortcuts, the context menus (right-click; Ctrl+right-click for colors, Ctrl+Shift+right-click for the grid, Shift+right-click for the tool's settings), the radial menu (Shift+Space) and the command palette (Cmd+K). The two most used panels have plain keys: **C** the stroke and fill picker at the pointer, **G** the grid and drawing settings at the pointer (the grid button's right-click). Both, and every other command, are listed with their keys in the Shortcuts panel (Cmd+Shift+/), where you can change them.
- **Sculpt preview:** while Direct is active, or with Option held in any tool, the sculpt brush's ring, the curve it would act on (highlighted) and its control points show under the pointer; the points within the ring are larger and stronger.
- **Direct selection** (Shift+V, sharing the Select slot):
  - Click a mark to see its points, and drag points to move them.
  - Shift-click or a marquee selects several.
  - Double-click a segment to add a point; Delete removes points.
- **Snapping:**
  - Hold Ctrl while drawing, moving or scaling to snap.
  - **Snap to** (right-click the grid button) sets how: *Grid* puts the grabbed point on a grid point (the default), *Steps* moves in whole grid steps, *Objects* snaps to the nearest point of another mark.
  - Right-click → Snap works on a selection: points to grid, tidy, position (top-left or center), or quantize 2× or 4×.
- **Simplify** (with Lazy and Smoothing) keeps only the points a line needs, live while drawing.
- **Brushes:**
  - **Pen:** one constant width.
  - **Ink:** width follows pressure, smoothed along the line.
- **Copy and add:** right-click selected marks → Copy as SVG, PNG or p5 code, or Add to Assets as PNG (it opens again as a drawing) or SVG.

## Workspace

- **Background:** Settings → Workspace, or the command palette: `/background <color | transparent | default>` and `/transparent`.
  - Transparent shows what is behind the window, for a see-through browser overlay.
  - Other slash commands: `/ui`, `/present`, `/grid`.
- **One HTML file:** `npm run build:single` → `dist-single/ams.html` (about 3 MB), the whole workbench to open from disk (for example in CloudyWindow). In-browser WebGPU models are left out.
- **Panels:** drag a panel tab along its row to reorder it.
- **Toolbars:** drag an island by its grip; a moved island keeps its size.
- **Performance readout:** right-click the zoom control. It shows frames per second while redrawing, the last redraw time and the number of marks; a redraw over 16 ms shows in the accent color.

## Scenes, boards and pages

A **project** holds **scenes**, and a scene holds **boards**. It is enough to write a lecture, a blog post or a report, or to prepare a performance.

- **Scenes** (the Scenes panel) are separate drawings. Each has its own undo, History and Timeline; Assets, brushes and settings are shared by all. Opening a drawing from Assets, or a file, makes a new scene, so your drawing is never replaced. Alt+PageUp and Alt+PageDown step through scenes.
- **Copy a scene** (the scene's menu → Copy as JSON): the scene as studio JSON on the clipboard; paste it (Cmd+V) in any browser or tab and it opens as a new scene.
- **Boards** (;, or the Boards panel) are artboards in one drawing, in order, like slides.
  - **Numbers:** a board's number, in the Boards panel and above the board, is its place in the presentation (what Present and Alt+1–9 step through): the frames in reading order (rows top to bottom, left to right), or, in a scene without frames, the boards in their sequence. A board inside a frame, or beside frames, is not a slide and has no number.
  - **The main board** is the old artboard at the origin, so every older drawing, score and training record is unchanged.
  - **Editing boards:** drag out more with the Board tool. A board's title selects it, moves it (with its marks) and renames it; its right-click menu exports it, trains on it, reorders or duplicates it.
  - **Which board a mark is on:** marks belong to the board they are drawn on. Outside the boards is the **blackboard**: kept, but in no board's picture.
  - **Training** uses the board marked with the dot in the Boards panel.
- **Board code** (Code → Board): a board's own score, run with the board as its artboard. Each run replaces its last run's marks, so the board is live while you edit or move its sliders.
- **Keeping a board as a reference** (right-click a board → Save to Assets, the save glyph in the code header, or Cmd+Shift+S for the picture): its **picture** as a PNG (what it shows now, a running sketch included), its **drawing** as an SVG (drawing boards), or its **code** as a **snippet** asset (the Assets kind “Snippets”). Placing a snippet inserts it into the code being edited.
- **Stop motion** (right-click a board → Stop-motion board, or `/stopmotion`): a board that photographs another board, a frame at a time. Its code is one call, `stopmotion({ source, fps, hold, onion, advance, loop, record, change, in, out, frames })`, which its controls write and you can edit. The shutter (**Alt+Enter**, from the stop-motion board or from the board it photographs) takes a frame of what the source shows now (a running sketch included); `hold` is exposures a shot (2 is on twos); the last frame shows faintly over the live view (the onion skin); `advance` goes back to the live view after a shot. Step with the buttons or Alt+Shift+←/→, remove the last frame with Alt+Backspace (or the one shown, with its button), play the frames at `fps`, and click a frame in the strip. The save glyph keeps the film in Assets or downloads it as **WebM**, **MP4** (if the browser can record it) or **GIF** (480 px wide). The frames are Assets of kind “Stop-motion frames” (in `Stop motion/<board>`, kept out of the All view). A p5.js or three.js source is watched where it runs: while the stop-motion board is on screen (or armed to record) the sketch keeps running wherever it is on the canvas (parked off screen, as a board sent to an output is), and the board shows it live, frame by frame. The glyph next to the source menu plays or pauses the source, so the recorder and the source need not be near each other.
  - **Record** (the ring glyph, **Alt+R**): arm it, then press play on the source. Recording starts when the source first moves (a change of `change` percent of the picture, default 1) and ends when you press the glyph again. `record: 'rate'` keeps a frame every 1/`fps`; `record: 'change'` (the menu beside the glyph: “on change”) keeps a frame only when the picture differs from the last kept one by `change` percent, at most `fps` a second, and ends by itself when nothing has moved for two seconds (so a halting film records only its exposures; grain and flicker count as change, so raise `change` above them). A running p5.js or three.js sketch is read straight from its canvas each frame, so recording keeps up with it; any other board is asked for its picture twice per frame. The frames are kept when it ends (Assets, one undo step); `hold` does not apply, and a recording stops at 1500 frames.
  - **Timeline:** under the controls, a bar with a frame marker: press or drag on it to scrub. The two end markers (or the bracket glyphs, **Alt+I** and **Alt+O**, at the frame shown) set `in` and `out`, the range that plays and is saved or downloaded; frames outside it are dimmed. The trim glyph keeps only the frames in the range (the pictures stay in Assets, and Cmd+Z brings the list back); the cross clears the range.
- **Attach here:** right-click a line (or a traveler or event on one) → **Attach a traveler here** / **Attach an event here**: the line becomes a path, and a new traveler or event goes on it where you clicked, made like the last one in the drawing (its shape, brush, colour and play settings, not its path), else as the Play tool makes one. A traveler runs from that point. One undo step.
- **Scripts** (command palette → “The hinge (lesson 1.3), performed”; `app.script.play(id)`): a lesson performed, where a walkthrough only walks to controls. The cursor does what a person would: it drags across a sketch (the pointer reaches the sketch as real events, so the joints move), opens a folded callout (the pseudocode), drags across a line of it to select it, goes to a code board and drags across the lines that implement it. Each cue has a subtitle (long enough to read), keys show as keycaps at the bottom left, and a mouse glyph beside the cursor shows the pressed button and a drag. Space pauses between cues, Esc stops; the guide's pace setting scales it (0 does it all at once). A script is data (`examples/lessons/reiniger/script.js`): `{ id, title, lesson, cues: [{ say, hold, goto | restart | drag | click | select | key | wait }] }`, with boards named by title and code lines found by their text, so it survives edits. **Blackboard:** `draw: { on, space, shapes }`, `formula: { on, tex, at }` and `clear: { on, layer }` put diagrams and formulas over a board, one after another (lines and arcs draw themselves on, labels and formula cards fade in; TeX through KaTeX), in the units of the sketch's camera, so a diagram lines up with the sketch it explains; a cue can draw while it highlights the code that does it. The hinge script uses them for the maths of the joints (where the elbow is, how angles add down a chain, and how a drag solves it backwards). The same drawing is in the exported page (its TeX is made into HTML when it is exported).  **Narration:** the `say` of each cue is also spoken (or `speak`, for other words), by Kokoro, a small voice model that runs in your browser (a one-time download of about 90 MB; you are asked first). A script prepares all its lines before it plays, so each cue lasts as long as its line; the clips are kept as audio Assets (`Narration/<script>`), so a line is made once and a different voice makes new ones. Command palette: Narration on / off, and Narrator voice… (try the voices). The audio is also available as a stream for a recording. **Recording:** the palette's “… record as a video” plays the script while recording this tab, cropped to the stage so the panels stay out (Chrome and Edge), with the narration as the sound and the cursor, keys and subtitles as they are on screen. The browser asks which tab to share: choose this one. The voice is prepared first and the recording starts after that. It runs in real time. The movie (MP4 where the browser can make it, else WebM) and the subtitles (`.vtt`) are kept in Assets (Videos) and downloaded; stopping the script (Esc) discards the take. **Playable exports:** “… export as a page that plays on its own” writes one HTML file: the slide the script works on (its sketch running, its notes with the pseudocode, its code, laid out as in the studio), the narration inside as audio, and the same cursor, subtitles and keys. Press Play and the page performs the script on its own elements (the sketch is dragged, the pseudocode opened and selected, the code selected); afterwards the page is yours to use. Space pauses, Esc stops, C toggles subtitles, `?autoplay` plays at once (a browser may keep the sound until a click). A script that names boards outside its first slide cannot be exported to a page yet.  **Timeline, seeking and notes:** a script shows a bar (in the studio while it runs, and at the bottom of an exported page): one segment for each cue, sized by the narration (the actions are guessed, so the bar follows the real playing), a time, previous/play-pause/next/stop, and a pencil and a list for notes. Press a segment, or ← →, to play from that cue: the cues before it are done at once (the board, the sketches set, what is drawn and selected), then it plays as usual; with the narration made once, a seek is quick. **N** (or the pencil) pauses and adds a note pinned to the cue and the moment, which shows as a diamond on the bar; the list copies the notes as Markdown (to paste where a change is asked for) or downloads them. Notes are kept in the browser, by script, and are shared by the studio and a page opened from the same address. While recording, the bar is hidden and seeking is off (`src/workbench/scriptTimeline.js`; the page embeds the same file).  **MP4 export:** the palette's “… export as an MP4 video” (and the **⤓ MP4** button on an exported page that is open from the dev server, under `/exports/`) renders the script without a tab to share: `scripts/render-video.mjs` opens the exported page in headless Chrome (puppeteer-core), plays it with its own clock, captures the picture as it changes (Chrome's screencast, at most 30 frames a second), mixes the narration clips at the times the page played them, and ffmpeg makes `exports/video/<script>.mp4` with a `.vtt` beside it. It runs in real time (a ten minute script takes about ten minutes), the cursor, keys and subtitles are in the picture, and the picture fades to black at the end (`fade` in the script, 1500 ms; 0 for none). Needs `npm run dev`, ffmpeg, and Chrome or Chromium (`--chrome` for another path). By hand: `node scripts/render-video.mjs exports/player/x.html out.mp4 --width 1920 --height 1080 --fps 30`. **Pointing:** a cue's `point: { on, at, space?, dwell? }` glides the cursor to a place on a sketch and rings it (a list of places is visited in turn), to show where to look while it is told. **Pronunciation:** words the voice gets wrong are written with their sounds, `[Reiniger](/ɹˈaɪnɪɡɚ/)` (IPA, as Kokoro reads it), and `PRONUNCIATIONS` in `narration.js` does it for the names it lists (Reiniger is said RYE-nih-ger). A lesson may put a picture of its own on its cover (`LESSON.cover`, a three.js board: the silhouette film's is its own puppet, walking).  **Code in an exported page:** the code panes are coloured (`codeHighlight.js`) and keep the controls of the code as widgets in front of their values, as the studio's editor does: a slider for `/* 0..1 */`, a toggle, a colour, a menu for `/* a|b|c */`. A student moves one and the sketch follows, with the value in the code; the script's `set` cue goes to the control, presses it, and drags a slider to its new value (the cursor, the glow and the sketch move together) before it carries on. A reset (playing from a cue) puts the widgets back at the values in the code. **Files in other editors:** the exports for Codevre and other editors turn `window.__amsFiles?.['Fox.glb']` into `'./Fox.glb'` and say at the top which files to put next to the code (`relativeFiles` in `exportPage.js`). **1.4 of the three.js lesson** has a slider for each clip of the fox (`survey`, `walk`, `run`: the weights of the mix). A scene built earlier from a lesson is rebuilt when the lesson has a newer board (`LESSON_NEWEST`, a title or `[title, a mark in its code]`); a scene keeps its own copy of the code, so slider edits made in it are in what it exports. “… keep in Assets (plays from there)” saves the script as an asset (kind Scripts): opening it in the Assets panel plays it in a scene that has the lesson's boards.
- **Present** (Opt+Cmd+P): the boards full-window, with eased moves between them. **PageDown** and **PageUp** (also Alt+→ and Alt+←) step to the next and previous board from the active one, presenting or not; they, and the arrows while presenting, work from inside a live sketch too (the frame forwards them to the studio).
- **Perform** (Ctrl+Opt+P, again to leave): the active board alone, filling the screen, running live, with no interface, for a performance or an installation. It is the board itself, so a sketch keeps its state and takes the pointer and keys; the pointer hides when still. Ctrl+Opt+F switches between the whole board (bars around it) and the board filling the screen (its edges cropped); Esc leaves. These keys work while a sketch has the focus. Also Play → Perform in the view menu. For a p5.js or three.js board, Perform also has the exported page's controls panel (and the code glyph), starting hidden as if Shift+H had been pressed: move the pointer to the top right corner for the gear, or press H. A change is written into the board's code and reaches the sketch (and its output window) at once. The corner is the one place a sketch does not get the pointer. The panel follows the studio's light or dark theme.

A three.js sketch draws at the resolution it is shown at: the frame's `devicePixelRatio` is the board's zoom times the screen's (between 1 and 4), and a `THREE.WebGLRenderer` made in a board follows it as the board is zoomed or performed, so an enlarged board stays sharp instead of being a stretched picture. (A p5.js sketch takes it when it starts.)
  - Keys: →, Space, ←, Alt+1–9, Esc.
  - Drawing still works.
  - While recording, the moves go onto the camera track, so replays and videos follow them.
- **Frames** are slides: a board whose kind is *Frame* (Code → Board) holds the boards whose centres lie inside it.
  - Dragging a frame by its title moves its boards, and their marks, with it.
  - Going to a frame fits the view to the slide, and its boards run together.
  - Presenting steps through the frames, in reading order, when a scene has any.
  - The Boards panel lists each frame's boards under it, numbered by slide.
  - An exported page shows a frame as one section, with its boards side by side as on the canvas.
- **Page** (Export → Page): the drawing as one HTML file.
  - The page uses the studio's dark theme, and follows reading order (as the boards are laid out: rows top to bottom, each left to right).
  - Each board is a section, depending on its kind:
    - **Drawing:** its picture, then ▶ (for a board that follows a moving source), Picture / Process / Replay, and its sliders, all below the picture. Under them, its code in one box with tabs: **Pseudocode** (a board's `pseudo`, when it has one), **Studio** and **p5.js**, with Copy. A click on a tab opens it; a click on the open tab minimizes the box to its bar of tabs. A board opens with its code minimized when its **Code** switch is on (below). On the page, a notes board's folded pseudocode and code callouts give way to that box.
    - **Markdown:** the document itself. `[[links]]` jump to boards on the page, and `![[embeds]]` show their pictures. A Markdown board titled "*Board* · notes" joins that board's section.
    - **HTML:** its page, in a sandboxed frame.
    - **p5:** ▶ below the sketch starts it in a sandboxed frame; its code box has p5.js (and Studio, when the sketch came from studio code).
  - The pictures of the sources the boards read travel inside the page and are sampled there, so sliders and Run work without the studio. Pose and hands still need the studio.
  - A page that opens with a document uses it as its header.
  - The studio's renderer is inside the page, and so is the drawing, so File → Open the page to keep working on it.
  - Two examples: `scripts/point-line-plane-demo.mjs` (a lecture after Kandinsky) and `scripts/senecio-report-scene.mjs` (the Senecio run report).
- **Performing:** Alt+1–9 go to a board (0, 1 and 2 are the point, line and plane tools); Alt+Shift+1–9 pick a brush slot; Ctrl+Alt+Shift+1–9 keep the active brush in a slot (Shift+2 cycles the plane stack).

In a score:

```js
board('A line')                         // made if new, right of the others
line(walk({ from: [0.1, 0.5], steps: 80, turn: i => sin(i / 7) * 9 }))   // fractions of this board
board()                                 // back to the main board
```

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

**Textured brushes** (*charcoal, chalk, pencil, bristles, oil, marker, wash*) paint each mark into a small layer of its own, multiply the paper's grain into it and tint it. The grain is fixed to the paper, so crossing strokes share one tooth; a layer is kept while its mark (points, parameters, seed, color, zoom) stays the same, so a mark that only fades is a bitmap, not painted again. The kit has `k.paint(ctx, { key, bounds, draw(layer ctx), grain: { kind: 'paper' | 'canvas' | 'fibre' | 'noise', scale, strength, seed }, color, alpha })`, `k.dabs` (a tip stamped along the walk: `soft`, `flat`, `square`; size, flow, spacing, scatter, angle), `k.hairs` (bristles that lift off as the paint runs down), `k.wash` (a fill whose pigment gathers at the edge), `k.bounds`, `k.hash`. *Oil* is the painterly stroke: dozens of hairs packed into one body of paint, with streaks, a taper and ragged ends. Where there is no canvas (a test), a textured mark is simply not drawn; and when the browser takes canvases' contents away (memory, a hidden window), nothing is painted until they are back, then every kept layer is dropped and painted anew.

The *Painterly, fading strokes* demo (board menu → Draw from a source) repaints a source continuously with `oil`: layers of strokes, big to small, each starting where a coarse model of the live strokes differs from the source, following the forms, taking the source's color across its width, stopping where the color turns, drawing itself on and fading out on a time envelope. Each of its four layers sees the source blurred as much as its brush is broad, looks at the picture in blocks the size of the brush, and paints a block once per lifetime; the first layer always paints (the underpainting) and the paper is toned to the source's mean color, which is what keeps it from decaying as strokes fade. Its code is plain board code with sliders (tolerance, speed, linger, stop) and the brush and its parameters at the top; a fifth, finer layer is one more line of the layer table (closer to the source, about twice the marks). It exports to p5.js with the same brushes (*Convert to p5.js* on the board), and a report on how close it gets, on three Klee paintings, is in `exports/klee-painterly/report.html` (`scripts/klee-painterly-report.mjs`, `experiments/klee-painterly/`).

**Performance.** A textured mark is painted once (its layer is kept); after that drawing it is a lookup and a blit. Fading changes its opacity and drawing on is a clip along the stroke, so neither paints again. The canvas draws only what is in view, redraws marks that fade or draw on at most 15 times a second (about a fifth of the main thread), and does not animate marks that only stay. Layers are painted smaller while the cache is short of room. The board's performance line (View → performance under boards) reads `runs a second · code ms · d(raw draw ms) · marks · layer MB`. The painterly demo has sliders for what it costs: `density` (strokes alive), `detail` (layers), `size` (brush), `fade` and `drawOn` (0: nothing animates, the biggest single saving). Numbers and method: `docs/notes/painterly-performance.md`.

**Masks.** Marks are free objects on the page, and a brush's width reaches past its points, so a mark near a board's edge spills over it: marks from you, from agents and from code all may. A board can be **masked** (the mask glyph in its Properties, *Mask to board* in its menu, or `mask()` in its code): its marks are cropped to the board, the default mask being the board's own rectangle. Only the marks that reach over the edge pay for a clip, and an unmasked board pays nothing.

**Time envelopes**: any mark can carry `time: { in, hold, out, life, draw, curve, loop }` (seconds) and a `born` time (epoch ms, set when it is made). The renderer fades it by its age at the view's clock, draws its stroke on along its length (`draw`), and drops it when `life` is over; a number is a fade out. The canvas keeps redrawing while any mark still changes, then stops. In code: `line(pts, { time: { in: 0.3, out: 2 } })`, and a brush reads `k.age`. Exports and the p5 sketch carry the same code (`envelope.js`, `texture.js` are embedded).

## Marks and points

A drawing is a set of **stages** holding **marks**. Each mark has:

- **role:** point, line, plane, guide, gesture or note (and image, for pictures placed as layers).
- **points:** `[x, y, t, pressure]`, in artboard units. `t` is milliseconds from the start of the stroke; pressure is 0 to 1 as recorded, and can go above 1 when a line is thickened.
- **brush and params:** the brush that realizes the mark (`realize: { brush, params }`).
- **color and fill:** stroke color, plus an optional fill (painted under the stroke for closed lines; for planes the fill drives the brush and the stroke outlines it).
- **why and by:** the reason for the mark and who made it (you, a model, an agent).

Curves are the points themselves. The renderer passes a Catmull-Rom spline through them, so a line is always smooth through every point. This keeps marks simple enough to write as code and to learn from.

## Sculpting

Sculpt tools come from threegrease's sculpt brushes. A smooth falloff across the brush circle weights every change. `[` and `]` set the radius, Shift+`[` and Shift+`]` the strength. With a selection, only the selected marks change. Each drag is one undo step.

Right-click the Sculpt button (Ctrl-click on a Mac) for the brush's settings: a Tool picker, Radius, Strength and the tool's own settings. Push, Grab, Pinch and Twist have a **Detail** setting, how many points a stretch may add: 0 moves only the points that exist (Grab starts there), 1 is the usual, 2 twice as many. Click the button again, or Option+right-click it, for the list of tools.

| Tool | Does | Alt | Cmd (the opposite tool) |
|---|---|---|---|
| Push | points follow the cursor | | |
| Grab | picks up the points under the brush and moves them | | |
| Smooth | points move toward their neighbours; pressure evens out too | | Jitter |
| Relax | evens out spacing without changing the shape | | Pinch |
| Pinch | points gather toward the cursor | inflate | Relax |
| Twist | points turn around the cursor | other way | |
| Jitter | a seeded tremor | | Smooth |
| Simplify | fewer points, same shape (tolerance) | | Resample |
| Resample | more, evenly spaced points along the curve (along the segments, for a straight mark), graded by the falloff (density) | | Simplify |
| Thicken | raises pressure, so pressure-aware brushes draw wider | thinner | thinner |

Tools that bend lines add points under the brush first, so a mark with few points can still bend and swell smoothly.

A sculpt tool is code:

```js
sculpt({
  id: 'comb',
  label: 'Comb',
  doc: 'Points drift across the direction you move.',
  refine: true,
  params: { amount: [0, 1, 0.3, 'How strongly each pass acts'] },
  step(pts, s, p, k) {
    return pts.map(q => {
      const w = k.w(q) * p.amount
      return w ? [q[0] - s.dy * w, q[1] + s.dx * w, q[2], q[3]] : q
    })
  }
})
```

- `pts` are the mark's points.
- `s` is the stroke: cursor `x, y`, movement `dx, dy`, `radius`, `strength`, `invert` (Alt), `boost` (Cmd), the points when the stroke began (`orig`) and `state` kept for the stroke.
- `k` is the kit: `w(pt)` is the brush weight at a point, plus `falloff`, `mean`, `rdp`, `refine`, `nearMark` and `rng`.

**Code → Sculpt** shows every tool, with a preview sweep. Fork one or write your own; saved tools go to your library and appear in the toolbar list.

## Parameters in code

Parameters in code are controls:

- **Declared params:** `key: [min, max, default, 'doc']` in a `params` block gets a slider.
  - With marks selected that use the brush, the slider sets their value.
  - Otherwise it sets the active brush, the tool's defaults, or the sculpt tool in use.
  - Only when nothing uses it does it rewrite the default in the code.
  - Hovering a slider says what it acts on.
- **Range comments:** any number followed by one, like `0.4 /* 0..1 */`, gets a slider that rewrites the number.
- **Cmd-drag** any number in the code to scrub it (Shift for fine steps). Cmd-drag also works in every number box in the app.
- **More than sliders:** toggles, selects (with pictures for shape names), colours, palettes and `// @param` lines, in p5.js and three.js boards, change the running sketch without restarting it: see *Controls in code* under Documents and programs on boards.

Two glyph toggles at the right of the Code panel's tab bar set how the editors look: line numbers on or off, and where sliders go (on the code lines, beside the preview, or off). Sliders look the same everywhere: in the code, in the preview strip and in the Opt+right-click popover.

This is the first step toward every value in code being something you can play.

Ink draws round joins (a quad per segment and a disc per point, filled as one shape), so thick and thickened lines turn smoothly.

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

`circle(cx, cy, r, n = 48)` and `rect(x, y, w, h, round = 0)` return point lists for `line()` and `plane()`. `round` (0 to 1, 1 a pill) bakes rounded corners into the rectangle's points: draw it with `path: 'straight'`. The Circle and Rectangle tools make the same marks by hand.

The Score panel is a code editor (CodeMirror): line numbers, wrapping, folding, search, Cmd+/ comments, completion of the vocabulary, brush names and a brush's parameters, hover docs, and the failing line marked after a run.

The full vocabulary is in the Score panel (**Vocabulary**), in the Docs, and in `ams_vocabulary` for agents.

## Physics

A board can be **physical**, as in Algodoo: turn physics on for it (the **physics toolbar**: Menu → Toolbar → Physics toolbar, or the palette's *Physics on for this board*), then make marks physical: **nothing is physical until you say so**, from the toolbar's *what the selection is* menu or Properties → Physics (several marks at once: shared fields show their value, or *Mixed*, and a change goes to all), or by placing a hinge, motor, weld or spring over it. *Physical, automatic* lets the drawing decide: closed marks (planes, circles, closed lines) are bodies that fall; open lines and gestures are ground (ramps, walls, bowls); points are small balls; notes, pictures, guides and a score's paths and travelers stay out. Round closed marks collide as circles, other closed ones as their convex outline, open ones as their stroke (as thick as it is drawn). The board's floor and sides hold things in.

**The toolbar** (its own island; move it by its grip): physics on (click it again for the world: gravity, speed, scale, precision, the floor and sides, off) · **rewind** (the world runs backwards, twice as fast, silently, to its start; press again, or play, to stop where it is; on the Timeline's clock the playhead goes back with it) · **play / pause** · **step** a frame (Shift: one back) · **reset** (back to the drawing) · **apply pose** (where things are now becomes the drawing, one undo step) · the **clock** · **Hinge** (click on something to pin it there, or where two things overlap to join them) · **Motor** (a hinge that turns: click on a wheel) · **Weld** (glues the two things under it) · **Spring** (click one end, then the other) · what the selection **is** · the **debug** view (colliders, joints).

**Two clocks.** *Timeline*: the world follows the playhead (play, pause, scrub, the loop region, In/Out); scrubbing back restores the nearest checkpoint and replays to there, so a run is the same every time. *Free*: its own clock, for when there is no transport: play, pause, step, reset. Either way, at time 0 the drawing is as drawn; past it, the bodies are drawn where they are (the drawing itself does not change until you apply the pose).

**Properties → Physics** (a mark on a physical board): what it is (as drawn, falls, ground, kinematic, a sensor, not physical), its shape (as drawn, circle, box, convex, outline) and material (density, friction, bounce, damping, spin). A hinge: its motor (speed in degrees a second, torque) and limits; a spring: stiffness, damping and length.

**Events.** A physical mark that is also an event (Play → event) fires when it is touched, at the point of contact, with how hard (`speed`, pixels a second) and where (`x`, `y`): `note(1, 72, map(speed, [0, 800], [40, 127]))` rings louder the harder it is hit. A blip shows where. Score code can act back: `impulse('ball', [0, -400])` kicks a body, `motor('axle', 240)` sets a motor. A traveler set to *kinematic* follows its path as a solid thing and pushes what is in the way.

Physics runs in a worker (Rapier 2D, deterministic, loaded only when a board turns physics on); the marks keep everything (`play.phys`, `play.hinge`, `play.weld`, `play.spring`; the board's `physics`). The plan and what comes next: `docs/notes/physics.md`.

## Sources

Sources are the project's streams: the camera, and images and videos from Assets. Later they will include other data. The **Sources** panel (left dock) lists them by name, and every scene and board shares them.

- **Add:** the camera glyph adds the camera; **+ asset…** adds an image or a video.
- **Speed:** a clip plays at ¼×, ½×, 1×, 2× or 4× (or paused). This is the source's pace only: how fast the man walks.
- **Sampling:**
  - *continuous* samples every frame.
  - *every…* samples every N seconds.
  - *hold* keeps one frame.
- **Rename:** Shift+double-click the name.

- **Streams as assets:** every clip in the list is also an asset (Assets › Streams, by group): a reference of about 100 bytes (the address, the size, the in and out points), with a card and no media kept. Drag one onto the canvas, or double-click it, to start it as a source with a board and its controls (the same board again if it is already in the scene). An address you type in the Sources panel is kept as a stream asset too, to drag into any scene.
- **Asset properties:** select an asset in Assets and Properties shows it: title, folder, tags and rating, and for a stream its address, size, in and out (seconds), note, licence and author. A stream, a video or a GIF also has **Starts with**: the speed, loop, volume and how it shows under its board (opacity, blend, fit) that a new source gets when the asset is dragged into a scene. All of it is kept in the asset (in the browser), not in a source file; a scene already using the clip keeps what it had.
- **Stream a clip:** the **+ stream…** menu in the Sources panel lists clips to stream, cut to their moment (`src/workbench/streamSamples.js`; each is a Wikipedia / Commons `File:` page with optional `start` and `end` seconds, which become the in and out points): Maria's wink and the machine becoming Maria (*Metropolis*, 1927), Vertov's eye in the lens, the iris and the editor's table (*Man with a Movie Camera*, 1929), Fred Ott's sneeze, Méliès's heads, Lumière's cards, breakfast, factory and train, Edison's and Lumière's serpentine and butterfly dances (Annabelle, Loïe Fuller), Sandow, Dickson's greeting, Ruttmann's *Lichtspiel*, Duchamp's *Anemic Cinema*, Chaplin's *Recreation* and Keaton's *The Scarecrow*. All are public domain. Clips cut from a long film use the 240p version, because starting at minute 85 reads the file up to there. To add your own, put an entry in that file.
**Mediathèque (Assets ▦ button, only while the archive is reachable):** a second view of Assets that browses the public archive at `languel.github.io/mediatheque` (`src/assets/mediatheque.js`, `src/ui/MediathequePanel.js`): search (words, `#tag`), kind, Clips, PD, tag chips. **+** adds the item as a *reference* (a stream asset `mediatheque:<id>` with credit, rights and the archive's thumbnail; nothing stored), the download button adds a *copy* (the file, works offline), double-click adds and places it, and a card drags to the canvas like an asset. Nothing is cached across sessions; offline hides the button. To work against a local checkout: `localStorage.ams_mediatheque_base = 'http://localhost:8000/'` (serve `~/dev/mediatheque` with `python3 -m http.server`).
**Media clips (the Timeline's `media` track; `src/workbench/mediaClips.js`):** a moment of a video or stream, by reference: `{ track: 'media', url, asset, in, out (s of the source), speed, fit, opacity, volume, credit }`. Drag a stream, a video or a Mediathèque card onto the Timeline, or use a player board's menu › **Board › Clip**: *Put on the Timeline* (at the playhead, over the player's in and out points) and *Keep as a clip in Assets* (a new stream asset with its own in and out, credit and rights carried over). The take plays them like sounds (a hidden video follows the playhead, scrubbing shows the frame) and draws them over the artboard (Contain or Cover, opacity, fade); Properties edits in, out, speed, opacity, volume (muted by default), fit. Not yet: media clips in the standalone player, the HTML export and the video render (the take's own export does not draw them), and a cut as a file (the planned ffmpeg export).
**Putting a short edit together:** a take with only media, titles, narration or sound (nothing recorded: no Drawing or Camera clips) is *composing*: the canvas stays live (tools, selection and drawing work as usual; no view-only hand) and the take's media and captions show over the main board. **Editing like an NLE:** every Assets card (and every Mediathèque card) has a **▶ Timeline** button that appends the clip at the playhead, after what is there (a photo is a 5 s still: stretch it); **X** splits the clips under the playhead (the picked ones, else all under it; a media clip keeps its moment of the source); **⇧⌫** ripple-deletes (closes the gap); right-click a clip for the same. Add clips one by one (a Media lane is made for you): drag a card from Assets or the Mediathèque onto the Timeline, or a player board's menu › Board › Clip › *Put on the Timeline*: a clip added where another is goes after it, so the sequence builds up end to end. Press play to see it; click a clip to change its in, out, speed, opacity or fit in Properties; drag a clip to move it, its right edge to retime. In the Mediathèque view ⌘/Ctrl-click picks several cards and **+ N picked** (or **+ all shown**) adds them to Assets as references.

**Keyframes (the dot).** Beside a field that can be animated there is a small diamond (◇ not animated, ◆ animated, bright: a keyframe at the playhead, warm: changed since and not keyed). Click it to key the value at the playhead (again to remove it); hover a field and press **I** (Alt+I removes); right-click for Insert, Delete, Interpolation (ease, linear, in, out, hold) and Clear all. Each animated parameter gets a row on the Timeline named for it ("line · Width") with its keys as diamonds; moving the lane moves its keys; playing or scrubbing applies the values (numbers and `#rrggbb` colours blend, toggles and choices hold). It is on a mark's brush parameters, stroke width and opacity, a board's width, height, opacity and source opacity, and every control of a p5 or three.js sketch (the code keeps its default: the lane drives the running value). Addresses are `mark:<id>.brush.width`, `board:<id>.opacity`, `ctl:<board>.<name>` (`src/workbench/params.js`); a field joins with `numberField({ …, address })`. **States tint the field** (and a sketch control's whole row): green while a lane drives it, yellow when there is a key at the playhead, orange when you changed it since and have not keyed it (press the diamond to key it); the next move of the playhead puts the lane's value back. **Auto-key** (the diamond button in the Timeline bar, off by default): with it on, changing an animated parameter at the playhead keys it. Colours blend, a **palette** blends colour by colour, a **choice** (`/* a|b|c */`) steps through its options and snaps to the nearest (switching half-way), a toggle switches half-way. The dot is also on **colours** (a mark's colour and fill, a board's paper), **blend modes** (a stepped choice: it moves through the list and snaps), a board's **X and Y** (its marks move with it), and the **effect parameters** and **mask feather** of a board (`board:<id>.fx.0.amount`, by index in the stack, so reordering effects changes what a lane drives). Any field made with `numberField`, `colorField`, `selectField` or `glyphSelect` and an `address` gets it; marks and boards resolve any property by path (`mark:<id>.fill`, `board:<id>.maskWith.feather`). Not yet: the Play section (travelers, tails), note size and width, the sculpt and tool settings, timeline clip fields, a curve editor and record. Values a lane sets stay in the scene at the last frame played. Plan and next steps: [camera-plan.md](camera-plan.md).
**Boards as clips, and the Program board:** a board menu › **Put on the Timeline** (the selected boards, in order) makes the board a clip on the media track: its picture (the source under it, then its marks and effects) for 5 s, which you trim, move, split and fade like a video clip. The Timeline is **per scene** (a scene remembers its take; switching scenes closes it; the transport settings are the scene's), not per board. The first media clip makes a **Program board** (a 16:9 black board named *Program*; the Timeline's *Insert › Program board* makes it too): it shows the Timeline as a source (`source('timeline')`, `src/workbench/timelineSource.js`: the take at the playhead, 1280×720, with its media, board clips and captions), so it is the monitor of the sequence and what outputs take from: board menu › Output › pin it, open it in a window or full screen, or read it from another board's code. While a Program board exists the sequence is no longer drawn over the main board. Limits: a board clip shows marks and the source under the board (as *Use as a source* does), not a running p5 or three.js sketch; a video playing under a board clip is not synced to the timeline.
**Cameras and shots (Phase 1 of [camera-plan.md](camera-plan.md); `src/workbench/camera.js`).** A take has any number of **cameras** (Timeline › Insert › *New camera*; Camera 1 is made for you) and a **Shots** track: a shot points a camera at a whole board or a region of the canvas for a time (`{ camera, target: { board } | { rect }, dx, dy, z, to? }`; z 1 shows the whole target, `to` is the pose at the end: a move). Make shots with a board's menu › *Put on the Timeline* (a shot on that board, one after another), Insert › *Shot on a board*, or *Cut to the current view* (a region: what the canvas shows now); Properties edits the camera, its name, what it looks at, zoom, shifts and the move. **The Program board shows the shot that started last** (a cut between cameras is two shots on the same time: the later one is on air); *Board for a camera* makes a board that shows one camera (`source('camera-1')`), a second monitor. While a take is open each camera's frame is drawn in its colour on the canvas, dashed, and solid with *on air* for the camera on air. A camera draws the boards in their stacking order, each as a picture (marks, the source under it, masks and effects, or a sketch's latest snapshot) with its opacity and blend; sources a camera sees keep running. Limits: a sketch's picture is its snapshot, a few a second (the deterministic frame-by-frame render is Phase 4); the old *Camera* track (artboard view keyframes) still works as before in review and is not converted; media clips still overlay the Program picture rather than being filmed; an explicit cut track is not built (the later shot wins).
**Phase 5 additions.** **Cuts**: a *Cuts* track says which camera is on air (`{ track: 'cut', camera, start, dur }`); with no cut clips the shot that started last is on air. With two or more cameras the Timeline bar shows a pill for each (C1, C2…): click one to **cut to that camera at the playhead**; while the transport plays it is a **live switch**, written as a cut clip (the cut it interrupts ends there, and the first cut of a take starts with the camera that was on air). Insert › *Cut to a camera* does the same from the menu; a cut clip's camera is chosen in Properties. **Stop-motion boards** are filmed: a camera sees the frame of a stop-motion board for the film's time (at its fps and hold, over its in and out, looping), and the render loads every frame first. **Lightbox**: a board's **Light** (0 to 1, keyframable) draws a falloff of light over it for the cameras, bright in the middle and darker toward the edges; put silhouettes on boards above it with the Multiply blend. A take whose only draw clips are the muted History track no longer makes the canvas view-only.
**Render the take as a video (Phase 4; `src/workbench/render.js`).** The film button in the Timeline bar opens the render dialog: range (the whole take, In to Out, the loop region), size, frame rate, MP4 or WebM. The render steps the playhead **frame by frame**: each frame applies the keyframe lanes, puts the videos on their exact frames, advances each p5 / three.js sketch to that time, draws what the Program shows (the cameras with their shots, the media clips, the captions) and keeps the picture; ffmpeg in the browser then encodes them. The result is saved in Assets › Renders and downloaded. **It is repeatable**: sketches restart in render mode (a fixed seed per board, `performance.now`, `Date` and `millis()` on the render clock, `requestAnimationFrame` only queues, the studio runs 60 steps of sketch time a second), and two renders of the same scene produced byte-identical files. **Sound** is mixed in (the *Sound* box in the dialog, on by default): the take's audio clips and narration, and media clips whose Volume is raised, are scheduled offline as on the Timeline (start, offset, speed, fade, volume, muted tracks left out), mixed to stereo at 48 kHz and muxed as AAC in MP4 or Vorbis in WebM (a tone clip at 0.5–1.5 s of a 2 s render measured silent, 0.35 RMS, silent). Limits: sound from a video playing under a board is not mixed (only media clips on the Timeline), a video playing under a board is held to the render clock (looping over its in and out) while a GIF or picture sequence is not stepped, marks that animate on the real clock are not on the render clock, a sketch's clock leads the render by its first 3 frames, and the whole frame sequence is held in memory (a few hundred frames at 720p are fine; hours are not).
**Phase 2 additions (7 Nov, night).** A shot's **Zoom, Shift x and Shift y** carry the dot (`shot:<clip>.z|dx|dy`), so a camera move is keyframed like anything else (the shot's older *Move to another pose* still works; with keys, prefer them). Boards have a **Depth** (Board panel; `board:<id>.depth`, keyframable): a camera moves and scales a board at depth d by 1/(1+d) about the middle of its view, so far boards move less when it pans (parallax). **Lanes are curves**: a number lane draws its value over time (a colour lane shows its colours), keys are diamonds you **drag** (across: when; up and down: the value), right-click a key for its interpolation or to delete it. **Record automation** (the ring-diamond button in the Timeline bar, beside Auto-key): arm it, press play and move any parameter that has a diamond; it is written as keys at the playhead and thinned when you stop (a few keys instead of one per movement).
**Export a clip as a file (ffmpeg.wasm; `src/media/ffmpegRunner.js`):** a player board's menu › Board › Clip › *Export as a file…*, the download button in the Assets preview (streams and videos) and *Export as a file…* in a media clip's Properties cut the range into **MP4** (H.264 + AAC), **WebM** (VP8, no sound) or **GIF** (15 fps, 480 px, no sound). It is frame-accurate (re-encoded), the title and credit go into the file's metadata, and it runs in the browser with the single-thread core (no cross-origin isolation needed, so it works on the Pages build and in embeds): about 30 MB loaded the first time, then kept by the browser; nothing is uploaded. The whole source file is read into memory (limit 250 MB: a long film must be streamed at 240p or cut as a clip first). A 2 s cut of a 6 s clip took 2 s (MP4), 2 s (WebM), 4 s (GIF). Checked: a cut of 2 s gives a 2.00 s file at the source's size. Not yet: speed, crop, a take rendered with its media clips.

- **From an address:** the field at the bottom of the panel takes a URL to a video or picture, or a Wikipedia / Commons `File:` page (`https://en.wikipedia.org/wiki/File:Metropolis_(1927).webm`). Nothing is downloaded or kept: a video is **streamed** (the browser fetches what it plays) and only the address is saved; a picture is fetched once. For a wiki video the size menu picks which version to stream (240p, 480p, 1080p, original): the smaller ones are re-encoded and much lighter (a 4 GB feature film streams at about 0.6 Mbit/s at 480p). The licence and author come with the file (in the source's metadata and the log). The server must allow it (CORS, which Wikimedia does); one that does not gives an error and leaves nothing behind. A movie waits on its first frame, and gets a preview board and a player like any clip. `ams_source add` takes `url` too. **Seeking far into a stream** (dragging the timeline to the middle of a feature) makes the browser read the file up to that point, because these WebM files have no index: at 480p about 150 MB for the middle of a 65-minute film, about 50 MB at 240p. Playing from where you are, or stepping, costs only what plays.
Sources are time-based assets: the panel only lists them, with their own properties (sampling). What uses a source lives elsewhere, and any number of things can use the same one:

- **Preview:** double-click a picture, GIF or video in Assets, or drag a source onto the canvas. An asset becomes a source, and you get a board in its shape with the source shown underneath, whole and live (double-clicking the asset again goes to that board). The card's reference button still puts a picture under the main board as a faint reference.
- **Drop:** drag a source onto the canvas. You get a board in its shape, with the source shown underneath, whole and live.
- **Underneath:** a board's menu → *Source underneath* shows any source under any board (a reference, not part of its picture).
- **Draw from it:** a board's menu → *Draw from a source* puts a demo's code on the board (redraw as shapes, dots, strokes along forms, pose lines, fingertips), which the board follows. It is ordinary code: change it, or write your own.
- **Gestures** watch a source (see Gestures).

Code reads a source by its name:

```js
const cam = source('cam')         // fitted to the board (cover), fractions of the board
cam.color(0.5, 0.5)               // '#rrggbb'; also rgb(x, y), value(x, y) 0..1
cam.pose                          // [[{ x, y, v }] × 33 per person], MediaPipe, on demand
cam.hands                         // [[{ x, y }] × 21 per hand]
cam.face                          // [{ points: [{ x, y, z }] × 478, blend: { smile, jawOpen, blink, browUp… 0..1 }, box }]
cam.track('face')                 // any tracker by name: 'pose' | 'hands' | 'face' | 'mask'
cam.mask(0.5, 0.5)                // 0..1: a person there (segmentation)
cam.frame                         // changes with each new sample
```

Landmarks are computed only after code asks for them, and are kept for the next frames. Without the studio (in tests or an exported sketch), a source is grey and empty.

Brushes and sculpts reach sources through the kit. `k.source('cam')` is fitted to the mark's board, and `.colorAt(x, y)` and `.valueAt(x, y)` take world units. A brush that reads a source redraws when it takes a new frame.

### Redraw from a source

`fit(source, { shapes, kinds, brush, stage, seed, ground, live })` redraws a source as plane marks by greedy shape fitting (the classic Reference Fitter):

- Rectangles and triangles are straight; circles are smooth.
- A ground plane in the mean color comes first.
- Every shape is a real mark: select it, restyle it, export it.

A board can **follow** its sources. Its code runs again on each new frame of a source it reads (`source('…')`, `fit('…')`), as a live redraw with no undo steps. Toggle it with the loop glyph in Code → Board.

With `live: true`, `fit` keeps its shapes between frames and replaces the oldest few each time. That is the continuous redraw:

```js
fit(source('cam'), { shapes: 120 /* 10..400 */, live: true })
```

`fit` runs in the background (a worker): the board shows its last fit while the next frame is fitted, so the studio stays smooth however many shapes it asks for. `quality: 'fast'` is about ten times cheaper (a 64-cell grid, rectangles and circles, each shape the best of random tries); the default, `'fine'`, also tries triangles and refines each shape with small changes. `'fast'` is the fitter the p5 export uses, so a board and its sketch match.

`fit` is built in (`src/process/fit.js` and `src/fitting/fitCore.js`, over the Reference Fitter in `src/fitting/fitReference.js`). To change how it works, a board's menu → *Draw from a source* → **Fit shapes, in code** writes the same idea out as board code: random tries, each shape the best of them (the one that brings the picture closest to the source), the oldest giving way on each new frame. Change how shapes are tried, kept or drawn. It keeps its shapes between runs with `state(name)`: an object that lasts across runs of the board's code, for any process that carries on from frame to frame.

In the Sources panel:

- The **redraw** glyph writes that code into the active board, shows the source under the board, and turns following on.
- The **eye** shows a source under a board as a reference, not part of the picture.

### Live and paused boards

Only live boards run. A live board:
- re-runs its code on new frames of the sources it follows;
- has brushes that read live frames;
- is redrawn every frame.

The board you are on is live unless you pause it. Play and pause a board with:
- the button after its title on the canvas;
- the button in its Boards panel row;
- **Play** / **Pause** in its menu.

The button shows what a click does: ‖ while it runs, ▶ while it is paused. A paused board stays paused, even while you are on it. Playing a board you are not on keeps it running while it is on screen. Following a source plays a board again.

Every other board is paused and **baked**: drawn once into a picture and shown as that picture until it changes or runs again. Boards off screen are not drawn at all. A source samples only while a live board on screen needs it, and paused sources look dimmed in Sources. 

**Bake to image** makes a bake permanent, after underscores' bake:
- On a board's menu, the board's marks become one image mark the size of the board, and the board stops following its sources.
- On the selection's context menu, the selected marks become one image mark.
- The image records what went into it (`e.bake`), and Undo brings the marks back.
- Baked images are ordinary marks: add them to Assets, or use them as thumbnails.

Agents use `ams_get` with `format: 'p5code'` for a board's code as p5, and `ams_source`: list, add, remove, update, sample (colors, values and landmarks at points), frame (a PNG), show, follow.

### Trackers

A tracker reads a source's picture and gives back what it sees: `pose` (33 points per person), `hands` (21 per hand), `face` (478 points and 52 expression scores per face) and `mask` (where a person is). Any source can be tracked from board code, and only while code asks: `source('cam').face`, or by name, `source('cam').track('face')`. A face is `{ points, blend, box }`, in fractions of the board; `blend` has the model's scores (`jawOpen`, `mouthSmileLeft`, `eyeBlinkRight`…) and blends of them: `smile`, `frown`, `blink`, `browUp`, `browDown`, `squint`. Trackers are a registry in `src/perception/mediapipe.js` (`registerTracker(kind, { create, image, video, read })`): a new one is one entry.

To see and test a tracker: board menu → *Draw from a source* → **Face and expressions** (the face as lines, its expressions as bars) or **Pose lines** or **Fingertips**. In the Gestures panel, `expr: ['smile', 0.5]` is a condition on an expression, and `chin`, `lip.top`, `lip.bottom`, `mouth.left`, `mouth.right` are points. Face tracking is studio-only: a p5 export says so. The demo's code has `/* 0..1 */` sliders for the source under the board (`underlay({ source, opacity, blend, fit })`, a call any board's code can make), the tracker's markers (points and bars) and the abstract faces; 0 hides each. An early result, "accidental art", is kept in `notes/accidental-art-unicursal-faces.md`.

### Masks and effects

Two opt-in features for drawing boards, and a board that has neither is drawn exactly as before.

**Effects** are a stack of small image operations, and can sit in three places: on a board's picture (Properties → *Effects*, `fx([…])` in its code), on the source under it (*Source effects*, `underlay({ source, fx: […] })`), and on a mask (below). The stack is a list, in order, and each may be switched off:

| effect | does |
|---|---|
| Threshold `level, soft` | light above the level white, below it black (soft: a ramp) |
| Levels `black, white, gamma, outBlack, outWhite` | black point, white point, gamma, output range |
| Contrast, Brightness `amount` | more or less difference; lighter or darker |
| Invert | light becomes dark |
| Posterize `steps` | fewer steps of light |
| Gradient map `stops` | color by light: dark takes the first color of the gradient, light the last (stops are colors, or `[position, color]`; `#rrggbbaa` has alpha) |
| Blur `radius`, Pixelate `size` | soften; blocks |

A run of the first kind (everything but blur and pixelate) is compiled into a few lookup tables and applied in one pass over the pixels.

**Masks.** A board can be shown *through* something: Properties → *Mask*, or the board's menu → *Mask*, or `mask({ source: 'cam', mode: 'luma', invert: true, feather: 4, fx: […] })` in its code. What can be a mask: **any source** (a camera, a picture or clip from Assets, a stream, a board made a source with *Use as a source*: its output), or **a board of marks** (`{ board: 'Shape' }`). *Light* mode shows the board where the mask is light; *Alpha* mode where it is opaque; *Invert* flips it; *Feather* softens its edge; *Fit* is cover or contain; `res` (128 to 1024, default 512) is how many pixels across it is worked at. The mask has effects of its own (a threshold makes it hard-edged; a gradient map recolors it before its light is read), and they run before its light or alpha is taken.

**Make mask** (right-click marks): the selected marks move to a board of their own, `<board> · mask`, the same size, with the marks at the same places, and the board they were on is masked by it (alpha). Edit that board and the mask follows. A mask that cannot be had (its source is gone) lets the board show as it is. Marks of a board can also simply be cropped to its rectangle: the *Mask* glyph in Properties, or `mask(true)`: the default mask, the board's own shape.

**Cost.** Nothing is paid without a mask or effects. A composed board (its paper, its source, its marks, its effects) is kept until its marks, its source's frame or its effects change, and the picture before the mask is kept apart from the masked one, so a moving mask over a still board costs the mask and a copy: about 4 ms a frame for a live clip as a mask with a threshold, a blur and a gradient map on a board 1000 pixels across (a still mask, nothing per frame). Effects and masks are worked at about 900 and 512 pixels across and drawn up. PNG export and the clipboard honor masks and effects; SVG, p5 and the page's pictures do not yet, and neither do document, sketch and player boards.

### Boards as sources, and playlists

**Use as a source** (a board's menu → Board) makes a board a source: its picture (the source under it, then its marks), live and small, read by name from any board's code: `source('screen')`. So what one board shows is something others can draw from.

A **playlist** is a board of kind *Playlist* (board menu → *Add to playlist* → *New playlist*, or *Playlist* in Code → Board's kind menu). It is code, one call, and it has its own controls as well; both edit the same thing (the controls rewrite the code, so comments you add by hand are lost when you use them):

```js
playlist({
  target: 'Screen',            // the board that shows each item (a title)
  loop: true,                  // start again after the last
  items: [
    { stream: 'stream:metropolis-1927-maria-s-wink' },          // a stream asset (Assets › Streams)
    { asset: 'clip:muybridge-horse', for: 8 },                  // an asset: clip, GIF or picture; for: seconds
    { url: 'https://…', start: 12, end: 30, title: 'A clip' },  // an address (or a Wikipedia / Commons File: page)
    { source: 'cam' },                                          // a source already in the scene
    { board: 'Dots', for: 10 }                                  // any board: it runs alone and the view goes there
  ]
})
```

Media items are routed to the **target** board, which shows the source under its marks with its controls; each plays from its in point and, at its range's end (or after `for` seconds), the next begins. Fields: `title`, `start`, `end` (seconds), `quality`, `for`, `speed`, `loop: true` (keep looping, so only `for` advances), `stay: true` (a board item leaves the view where it is). The board has previous, play / pause, next, loop, a target menu and a list (go to, earlier, later, remove). Add things with the **+** on the playlist itself (a menu: a board, a source, a stream, a clip or picture, or an address), by dragging an asset onto it, from a board's menu (*Add to playlist*: the media it shows, or the board itself; several selected boards at once), or from the **+** in the Assets preview.

Chain them: a playlist routes clips to *Screen*, *Screen* is a source, and a drawing board reads `source('screen')`: a string of dance videos drawn as they play.

### Group selection of boards

**Shift+click** a board's title to add it to (or take it out of) the selected boards, or drag a **box** on the empty canvas: boards wholly inside it are selected (their marks go with them). Dragging any selected board's title moves them all, with their marks, as one undo step; Shift or Cmd+click a row in the Boards panel does the same selection. Frames carry the boards they hold.

### The Samples scene

`/samples` (or `app.buildSamplesScene()`) makes a scene with the stock samples (Assets › Samples) and the clips to stream, each on its own board with controls. The streamed ones are **lazy**: a board only starts reading its clip when it is live, on screen and big enough (at least 240 px wide on screen), so the zoomed-out overview streams nothing; a clip left unseen for half a minute is closed, and starts again at its in point when you come back.

### Redraw rate

Two speeds, set separately: the source's (Sources → speed: how fast a clip plays) and the board's (Properties → Board → **Redraw**: how many times a second its code runs). With Redraw at 0 a board following a source runs once per new frame of the source. With a rate (up to 60) it runs on its own clock, each run with fresh randomness: a slow GIF still gives dots, strokes and shapes that are drawn again and again, and a live `fit` carries on refining while the clip changes slowly. The demos (board menu → *Draw from a source*) set a rate of their own, take the source from under the board (it changes with each frame, the paper should not) and leave the ground alone: `fit` runs with `ground: false`. A p5 sketch exported from such a board draws at that rate, reseeded each frame.

### Media controls

Drag a clip or an animated GIF from Assets onto the canvas (or double-click it) and you get a source and a board previewing it, with **media controls** under the board: play / pause, a frame back and forward, a scrubber with the time and frame, and the speed (¼× to 4×). The controls belong to the board (its `controls` switch): they move and resize with it, and are not a board of their own. They work on the source, so every board that reads the source follows them. A picture or a camera has nothing to play, so it gets none.

Show or hide the controls from Properties → Board (the controls glyph, beside play) or the board's menu → Board → *Show / Hide media controls*. Hiding only hides them; playback is untouched. (Scenes saved before this have separate "player" boards; they still work.)

**Properties → Board → Media** mirrors all of it for the board's source: play / pause, steps, speed, the timeline with the time and frame, and (for a clip that can have sound) mute and volume, then how the source shows under the board: **Opacity**, **Blend** (multiply, screen, overlay… over the paper) and **Fit** (cover or contain). Clips are muted until you raise the volume; a movie added from Assets waits on its first frame for play, while a GIF plays at once. Hiding the player only hides it: playback is not touched, and a hidden player leaves no outline or title on the canvas.

Show or hide the controls from Properties → Board (the controls glyph, beside play, on a board that shows the clip or on the player itself) or the board's menu → Board → *Show / Hide media controls*. Hiding it hides the player board (a dashed outline marks where it is); showing it again brings it back, or makes one if there is none.

Cmd (or Ctrl) + click anywhere in a board, not only on its title, selects it and opens its Properties. That includes boards drawn as pages over the canvas (documents, HTML, p5 sketches, players): while Cmd is held they let clicks through. Over a mark, Cmd + click selects the mark (adding to the selection) and opens its Properties.

**Solo:** Opt+click a board's play / pause button (in the Boards panel or above the board) to run only that board and pause all the others; Opt+click it again to play them all. **Create board from selection:** the context menu of selected marks makes a board around them (with a margin), and the marks move into it.

### Board switches

Properties → Board has switches as glyphs beside its title (and the board's menu → Board):

Hover a switch for its name. In order: play or pause (a board that runs), **Lock**, **Hide** (the eye), **Title** (T), **Border** (the square), **Code** (<>), **Crop to board** (the dotted square) and **Performance** (the gauge).

- **Lock:** its marks cannot be selected, changed or drawn over, and the board cannot be moved or resized.
- **Hide:** not drawn and not run; a dashed outline marks where it is. Hidden boards are left out of the exported page.
- **Title:** hides the title above it (it shows while the board is selected, so it can still be moved). A board that runs keeps its ▶ / ⏸ there.
- **Using a sketch:** a p5.js, three.js or HTML board takes the pointer and keys only while it is the board you are on. **Click it** (with the Select tool) to make it so, even when its title is hidden, as on a lesson's slide; Cmd+click selects the board instead and opens its Properties. Going to a board (Alt+1–9, the Boards panel) also makes it the one you are on.
- **Code (minimize):** shown for a board with code. On an exported page its code box starts as a bar of tabs (Pseudocode, Studio, p5.js) and opens on a click; off, it starts open on the first tab (the pseudocode, when there is some).
- **Crop to board (mask):** its marks are cropped to the board (a mask the size of the board; see *Masks and effects*). Off by default: marks from you, from agents and from code may go past the paper.
- **Performance:** a line under it (see below). Only boards that show it are measured.

A board's menu also has **Mask** (show it through a source, or through a board of marks) and **Effects** (a stack of post effects on its picture); Properties has *Mask*, *Effects* and *Source effects* sections.

### Performance

**View → Performance under boards** (or click the performance readout by the zoom control) writes a line under every board; a board's own switch writes it under that board. Nothing is measured for boards that do not show it:

- **studio code:** runs a second, the code's time per run, the fit's time in the background, each source's new frames a second, and its marks;
- **p5:** frames drawn a second (of how many `draw()` calls: a sketch following a GIF skips frames that have not changed) and the time each took.

**Assets › Test clips** has a countdown (10 s, each frame showing its number, the time and a sweep each second) as a 30 fps video and a 10 fps GIF. Add one as a source and draw from it: the numbers show how often a board really updates.

A board following a source runs up to about 30 times a second, fewer when a run takes longer (it waits twice a run's time). Studio code makes real marks (each can be selected, restyled, exported), so thousands of marks per frame cost more than a p5 sketch painting the same dots.

## Gestures

The Gestures panel (the hand) watches a source (the camera, or a video to test with) for gestures and does something when one completes. Gestures are written as code:

```js
gesture('pick color', [{ touch: ['left.pinky', 'nose'], hold: 300 }], 'color next')
gesture('sample color', [{ pinch: 'right', hold: 500 }], 'color sample right.index')
gesture('undo', [{ fist: 'left' }, { open: 'left' }, { fist: 'left' }], 'undo', { within: 900 })
```

- **Steps** follow each other in order; each must hold for `hold` ms (default 120), and the next must come within `within` ms (default 1500). After firing, a gesture waits `cooldown` ms (default 800).
- **Conditions** (a step's keys, all must hold): `touch: [a, b, tol?]`, `apart: [a, b, tol?]`, `above` / `below: [a, b]`, `pinch`, `fist`, `open`, `point: side`, `fingers: [side, '01100']` (thumb to pinky), `still: point`, `move: [point, 'left' | 'right' | 'up' | 'down', speed?]`, `learned: 'label'`, `not: step`, `any: [steps]`.
- **Points:** `nose`, `mouth`, `neck`, and `left.` / `right.` + `eye`, `ear`, `shoulder`, `elbow`, `wrist`, `hip`, `knee`, `ankle`, `hand`, `palm`, `thumb`, `index`, `middle`, `ring`, `pinky`. Left and right are the person's own. Distances are in body units: a shoulder width (or the torso's length / 1.4, turned sideways).
- **Learned poses:** a step can be a label (`'palm out'`, the same as `{ learned: 'palm out' }`). The panel lists the labels the script uses; ● records 2 seconds of examples of each. The nearest examples decide. Sequences of learned poses make moving gestures (a wave: out, in, out).
- **Actions:** `color next` / `color prev` (the palette chosen in the panel, or `color next Bauhaus`), `color sample <point>` (the source's color there), `undo`, `redo`, `run` (play or pause the board), `board next` / `board prev`, `slot <n>`, `!<console command>`, or a function `(app, body) => …`.
- **In code:** `source('cam').point('right.index')` is where a point is (fractions of the board), and `source('cam').fired('pick color')` is true for half a second after it fires.

The script, the examples and the watched source are kept in the browser.

## Exports

From the menu:
- **PNG:** the picture view or the process view.
- **SVG:** one group per stage, and each element's full record in `data-ams-*` (it re-imports losslessly).
- **p5.js zip:** a standalone sketch of the active board (or a board, from its menu): the recorded board with its own brushes, drawn by the studio's renderer inside the sketch. R re-runs the board's code (or, for the main board, the drawing's score) with a new seed; P toggles the process view, 1–9 show the stages.
- **p5 (minimal code):** a short `sketch.js` of plain p5 calls for teaching (also Copy as → p5 code on a selection).
  - Lines are `beginShape()` with `splineVertex` (smooth) or `vertex` (straight); planes are filled shapes, points circles, notes text.
  - Only the points that shape each line are kept. Brush textures are left out; a comment names each mark's brush.
  - Runs of five or more marks of one kind (or many points) become a data array and a loop: `const dots = [[x, y, size, color], …]`, or a list of point lists for lines and planes. A small `shape()` helper draws them. Values that are the same for the whole run are set once.
- **p5 (its code):** a board's own code as a p5 sketch (zip: `index.html`, `sketch.js`, and the media of the sources it reads).
  - The score is kept as written. The studio words it uses are defined after it in plain p5, and only those.
  - `point`, `line`, `plane`, `rect` and `circle` clash with p5, so they become `drawPoint`, `drawLine`, `drawPlane`, `rectPoints` and `circlePoints`.
  - `source('name')` samples a `loadImage` (animated GIFs step with `setFrame`), a `createVideo` or `createCapture(VIDEO)`, fitted like the studio does.
  - For p5 2.x, files load with `await` in an async `setup()`; 1.x uses `preload()` and `curveVertex`.
  - **Landmarks** come from [ml5.js](https://ml5js.org/), loaded only when the code reads `.pose`, `.hands` or `.mask(…)`:
    - `bodyPose('BlazePose')`: the same 33 points as the studio.
    - `handPose()`: 21 points per hand.
    - `bodySegmentation('SelfieSegmentation', { maskType: 'person' })` for the mask.
    - Videos and cameras are watched with `detectStart`; pictures and GIF frames are asked with `detect` each time they are drawn. `index.html` loads ml5 too.
  - **Custom brushes** run as written: `brush()` keeps them, and `drawLine` / `drawPlane` / `drawPoint` hand a mark (`points` of `[x, y, t, p]` in pixels, `color`, `closed`) to the brush's `draw(ctx, e, p, k)` on p5's `drawingContext`. The kit is the studio's own: its walk (`frames`, `smoothPath`, from `walk.js`), `tracePath`, `segment`, `beginInk`, `rng` (seeded per mark), `noise`, `draw`, `source` (with `colorAt` / `valueAt` in pixels), and, for the textured brushes, its layer kit (`paint`, `dabs`, `hairs`, `wash`: `texture.js`, embedded). **The studio's textured brushes** (charcoal, chalk, pencil, bristles, oil, marker, wash) go in by name: a sketch whose code says `brush: 'oil'` carries the `oil` brush as it is, with the kit it needs. **Time envelopes** (`time: { in, hold, out, life, draw }`, `born`) work on every mark: it fades and draws on by its age (`envelope.js`, embedded), and expired marks are skipped. A still picture's pixels are read once (and an empty read, from a browser that took the canvas away, is not kept).
  - `fit()` comes as a compact greedy fitter (rectangles and circles; `live: true` keeps its shapes between frames), and `state(name)` as an object kept across `draw()` calls. `source().pixels(w, h)` is there too, so a fit written out in code exports as it is. What cannot be carried (decide, sculpt, guide, gesture) is named in a comment.
- **p5.js version:** Settings → Export: 2.x (latest, the default) or 1.x (`curveVertex`). The full export loads `p5@2` or `p5@1`.
- **Page (HTML):** see *Scenes, boards and pages*.
- **Process sheet:** a PNG of the stages and the decisions.
- **JSON (`.ams.json`), to import again.** A file holds a scene, a board or a selection (`meta.part`):
  - **Scene:** Menu → Export → *Scene (JSON)*.
  - **Board:** its menu → Export → *JSON*. Its marks come from its top-left; its size, paper, title, code, text and source come along.
  - **Selection:** *Export as JSON*, or *Copy as → JSON* for the clipboard.

  **Import into the scene you are in:**
  - *Import into this scene…* (Menu), *Import here…* (right-click the canvas), or the import button in the Boards panel.
  - Drop a `.ams.json` file on the canvas, or paste (Cmd+V) copied JSON.
  - Boards come in as new boards, right of the others. A selection lands where you drop, right-click or look, as a group.
  - Stages are matched by name, and brushes come along. *Open file* still opens a file as a new scene.
- **Excalidraw:** round-trips to underscores through `customData.ams`.

## Documents and programs on boards

A board holds one kind of thing. Choose it in Code → Board, where its source is edited:
- **Drawing:** marks, and optional studio code (the default).
- **Markdown:** a document.
- **HTML:** a page.
- **p5.js:** a sketch.
- **three.js:** a sketch, an ES module that imports `'three'` and its addons (controls, postprocessing, loaders…); the studio bundles them, so no network. A three.js board that asks for the elements a lesson page has (`document.getElementById('stage')`, `'tabs'`, `'panel'`, `'tree'`, `'hud'`, `'inset'`) gets them, so a lesson written for its own page runs in a board.
- **Code view:** a board that is an editor on another board's code (a p5.js, three.js or HTML board's menu → *Code view* makes one beside it), for teaching: a board with a header (the board's name, format, run), the code formatted and highlighted, with line numbers and the controls and colour dots in the code. It is not a copy: what you type is that board's code (a sketch changes as you type, a control restarts nothing), and what changes that code elsewhere (the Code panel, a slider, an agent) shows in it. Click it to use it; the Code panel shows the code of the board it is on. It is left out of an exported page (the sketch's own code box is there).

Documents show as you type. Marks drawn on a document board stay on top of it, as annotations.

**Markdown** renders on the canvas and stays sharp at any zoom. It is Obsidian-flavored:
- tables, task lists, `==highlights==`, `#tags`, front matter (not shown);
- math with KaTeX: `$…$`, `$$…$$`, `\(…\)`, `\[…\]`;
- Mermaid diagrams in ```` ```mermaid ```` fences;
- Pseudocode set like a paper in ```` ```pseudo ```` fences (also `algorithm`): numbered lines, two spaces per level of indentation, bold small-caps keywords (`for`, `while`, `repeat`, `until`, `if`, `else`, `then`, `return`, `do`…), `<-` as ←, `->` as →, `!=` ≠, `<=` ≤, `>=` ≥, `...` …, `#` or `//` for a comment set at the right, `$…$` anywhere for LaTeX (KaTeX), and a first line `Algorithm 2: Title` for a caption. The lessons' pseudocode tabs use it, on exported pages too;
- callouts: `> [!note] Title`, or `> [!tip]- Folded`;
- links into the drawing: `[[Board]]`, `[[Board|label]]` and `[[scene:Title]]`;
- embeds: `![[Board]]` shows a board's picture, `![[asset:Title]]` an asset.

A document longer than its board scrolls inside it: the wheel over it scrolls it (and a wide code block sideways) until it ends, then pans the canvas. Opening a fold scrolls it into view.

**Starting and snippets.** A new board starts blank: the setup a sketch needs and none of the content (a p5.js board has `setup` with `createCanvas(innerWidth, innerHeight)` and an empty `draw`; a three.js board has a renderer, a scene and a camera, draws once, and has no loop). The **{ } Snippets** dropdown in the code panel starts the board from a snippet of that kind (a spinning cube, orbit controls, particles, a sketch with every kind of control, a breathing circle, fading trails, a spiral…): it replaces the code (it asks first if there is code, and Cmd+Z brings it back). **Save as “Board name”** keeps the code (or the selection) as a snippet under the board's name; **Remove** takes one of yours away. Your snippets are kept in this browser, per kind of board. Double-click the board's name in the code panel to rename it. To clear a board, Cmd+A and Delete.

**Export a sketch** (the export button in the code panel, or the board's menu → Export): a p5.js or three.js board becomes **one HTML file that runs on its own**, offline, filling the window (F is full screen): *Standalone page* is the sketch and the library; *Page with controls* adds a small panel with the sliders, toggles, selects, colours and palettes the code declares, which H (or the gear) shows and hides (`?ui=0` opens it hidden). The gear only appears when the pointer is near the corner; Shift+H hides all of the panel (the gear still comes back near the corner, and a click shows the panel again), so an installation shows nothing. The **</>** glyph at the bottom of the panel shows the sketch's code over the page and copies it (the glyph again, or Esc, hides it), so a student can read and copy what they made. Build in the studio, export, open the file on the installation's machine. Controls that rewrite code (a number in an expression) are not in the panel; the live ones are. A p5.js sketch that loads files by name needs them beside the page. An HTML board exports as the file it is.

### The code editor

All the code editors (board, brush, sculpt, selection, clip) share these, and **Settings → Code editor** sets them:
- **Format** (Alt+Shift+F): the selection, or all the code, with Prettier (studio code keeps its no-semicolon style). **Minimize** (Alt+Shift+M): whitespace and comments go, the comments that make controls stay and each control keeps a line of its own, so a minimized sketch still has its sliders. Both are also buttons in the code panel's header. They load the first time they are used.
- **Code help** (on by default; Settings → Code editor → Code help): in p5.js and three.js boards, completion and hover docs from the libraries' own types (TypeScript's language service in a worker; `ams` and `ams.params` are known too). The files are built into `public/lang/` by `npm run lang` (also run before `dev` and `build`; not committed) and fetched the first time a sketch is edited. Nothing is sent anywhere.
- Ligatures (->, !=, ... drawn as one shape) are off, so a run of dots or dashes shows as many characters as it has; Settings → Code editor → Ligatures turns them on, and Font picks the editor's font (any installed on the computer, or one by name). Alt+Z wraps or unwraps long lines. **Colour dots** (Settings → Code editor): a dot before every colour written in the code (`#hex`, `rgb()`, `hsl()`, `0x…`) opens the picker; a colour that has a control already (`/* color */`, `/* palette */`) keeps that one.
- Cmd+Shift +/− changes the text size in code editors only; Cmd+Enter runs; Cmd+/ comments; Settings also has indent, line numbers, wrapping and where controls are shown.

**HTML and p5.js** run in sandboxed frames over their boards, with a bridge to the studio, `window.ams`:
- `innerWidth` and `innerHeight`: the board's size, and the same names in any browser, page, IDE preview, three.js or p5.js sketch, so code moves in and out without changes (they are what p5.js's `windowWidth` and `windowHeight` read, and those work here too, in every kind of board). `ams.width`, `ams.height` and `ams.board` say the same;
- `await ams.call(tool, args)`: any studio tool;
- `await ams.mark(role, points, opts)`: add a mark to the board;
- `await ams.frame('source')`: a source's picture.

**Controls in code** (p5.js and three.js boards): a value with a comment beside it becomes a control in the board's code panel, and changing it changes the running sketch without starting it again.
- `const speed = 1 /* 0..5 */` a slider (a step too: `/* 0..5 step:0.5 */`; `0...5` and `0…5` read the same, as editors change `..`);
- `let spin = true /* toggle */` a checkbox;
- `const shape = 'box' /* box|sphere */` a select;
- `const tint = '#4488ff' /* color */` a colour: any CSS colour in quotes (`'red'`, `'rgb(10,20,30)'`, `'hsl(200,60%,20%)'`) or a number like `0x4488ff`; a round swatch opens the studio's picker, and the colour stays as written until you change it;
- `const shape = 'torus' /* box|sphere|cone|torus|cylinder */`: an option named like a shape (box, sphere, cone, torus, cylinder, circle, square, plane, triangle, ring, star…) shows its picture in the menu and on the chip;
- `const colors = ['#e63946', 'steelblue', 0xf1faee] /* palette */` a colour array, shown as overlapping dots: click one to change it, right-click to duplicate or remove, **+** to add. The array changes where it stands, so a sketch that already holds it keeps working;
- `// @param size = 1 (0.2..3 step:0.1)` as in Underscores (also `(color)`, `(boolean)`, `(a|b|c)`): read as `ams.params.size`, live.

**The panel on the board:** a line `// @panel open` in a sketch shows its control panel on its board in the studio (sliders, toggles, menus, colours: what you change is written into the code, like the code panel's sliders); `// @panel hidden` shows only a gear that comes up when the pointer is near its corner; `// @panel off` means no panel, even on an exported page. It also sets how the panel starts in Perform (which otherwise starts hidden) and on an exported page (which otherwise starts open). A code view of a sketch with the line starts scrolled to it.

A declaration at the start of a line (`const`, `let` or `var`, with nothing after the comment) is live: the studio makes it a `let` and sets it as you drag. A number elsewhere in the code still gets its slider, but it rewrites the code and the sketch starts again. The sketch also starts again when anything else in the code changes. An output window's copy gets the same values.

A p5 board runs while it is live and on screen, like a drawing. Paused, it shows its last picture. Errors appear under the code and in the Log. A frame takes the pointer only on the board you are on.

### Taking a sketch out of the studio

The same sketch can leave in several ways. What each one keeps:

| You do | You get | The library | The controls (`/* 0..4 */`, `// @panel`) |
| --- | --- | --- | --- |
| Run it on a board | the studio, with the code view, snippets and help | bundled (three.js r187) | sliders, menus, colours… in the code and, with `// @panel`, a panel on the board |
| **Perform** (Ctrl+Opt+P) | the board full screen, no interface | bundled | the panel, starting hidden (`// @panel open` shows it) |
| Export → **Standalone page** | one HTML file, offline | inside the file | none: the sketch runs with the values as written |
| Export → **Page with controls** | one HTML file, offline | inside the file | a panel (H, the gear, `</>` shows the code); `// @panel hidden` starts it closed, `off` leaves it out |
| **Copy the code** into another editor | the sketch's text | the editor's | plain comments: it runs with the values as written, with no sliders |
| Export → **Copy as a page for CodePen, Codevre…** (or **Page for other editors**, a file) | a small page: the code unchanged, three.js (or p5.js) from a CDN at the studio's version by an import map | CDN, the studio's version | plain comments, with a line at the top saying so |
| Export → **app.js for Codevre's Three.js template** (copy or file; three.js boards) | only the code, to paste over `app.js` of a page whose import map names just `three` (Codevre's *Three.js* template): `three/addons/…` imports become `https://esm.sh/three@latest/addons/…?external=three` (so the addons share the page's three.js) and `lil-gui` comes from esm.sh | esm.sh, latest | plain comments |
| Export → **Options → Controls: lil-gui** (three.js boards) | with `import { GUI } from 'three/addons/libs/lil-gui.module.min.js'` at the top and, after each value, a line that adds its control (a slider, checkbox, menu, colour, or a folder of colours for a palette); the sketch's own variable stays the live value | wherever three/addons is | a lil-gui panel (applies to projects, app.js and pages for other editors) |

**Why the controls are not elsewhere.** The sliders are made by the studio from the comments next to the values. Another editor does not read them, so there they are only comments, and the sketch runs with the numbers, colours and choices written in the code. Nothing breaks: change a number in the code to change the sketch. To demonstrate with the controls, use the studio, Perform, or a page exported *with controls*.

**Moving the code to another editor** (Codevre, CodePen, a plain `index.html`, a Vite project). The code is plain: `import * as THREE from 'three'`, `import { OrbitControls } from 'three/addons/controls/OrbitControls.js'` and `innerWidth` / `innerHeight` (the same in every browser; p5.js's `windowWidth` is its own name). What the other editor needs is a way to find `'three'` and `'three/addons/…'`:
- **A project with npm** (Vite and the like): `npm i three`, and the code runs as it is.
- **A page without a build step** (Codevre's *Three.js* and *Three.js Modules* templates, CodePen, any static page): an import map in `index.html` before the script, and the code as a module (`<script type="module" src="app.js">`):
```html
<script type="importmap">
{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.187.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.187.0/examples/jsm/"
} }
</script>
```
  Codevre's templates map `three` to `three@latest` on esm.sh and have no `three/addons/` line: for `OrbitControls` and the other addons add that line, and keep the version equal to the studio's (0.187.0) so the code means the same thing. A page that says `latest` changes when three.js does.
- **An editor that takes one JS file and no import map:** the bare names cannot work; write the full URLs in the `import` lines.

**Pasting a sketch from somewhere else.** The aim is that a demo from the three.js site, Codevre or CodePen pastes in and runs, and the board's code pastes back out. Paste (Cmd+V on the canvas) makes a board of what it is:
- **A page** (a three.js example, a CodePen or Codevre file): its module script becomes the sketch, and the import map is left out (the studio resolves `three` and `three/addons/` itself). The page's own styles and markup are left out too (a board has no page around the sketch), so a demo that looks for an element of its own, such as `document.getElementById('info')`, needs it made in the code.
- **Three.js imported from a CDN** (`https://unpkg.com/three@…/build/three.module.js`, jsDelivr, esm.sh, Skypack; the addons by their URL): written as the bare names `'three'` and `'three/addons/…'`. Other libraries imported by URL (`https://esm.sh/gsap`) are left as they are and load from the network.
- **An older page with a global `THREE`:** gets `import * as THREE from 'three'`.
- **A p5.js page or sketch:** a p5.js board; **anything else:** as before (a note, or studio code).

The same applies when you paste into a three.js or p5.js board's own editor: a page becomes its script, and CDN imports become the bare names. The studio bundles three.js r187 with its addons (controls, loaders, exporters, postprocessing, `lil-gui`, `Stats`, `RoomEnvironment`, the CSS2D and CSS3D renderers, `VRButton`…), so a demo that uses them runs offline. A demo that loads its own images or models by a relative path (`textures/…`, `models/…`) needs those files at a URL.

**Projects.** Export → *Project: ES modules (zip)*, *Project: Vite (zip)* (three.js) or *Project: page and sketch.js (zip)* (p5.js) makes a folder in a zip that opens elsewhere:
- **ES modules:** `index.html` with the import map (`three` and `three/addons/`, no build step) and `src/main.js`, the sketch as written. Open it in Codevre, serve it with any static server (`npx serve .`), or copy the code and the import map into CodePen.
- **Vite:** `package.json` (three installed), `vite.config.js`, `index.html` and `src/main.js`: `npm install`, `npm run dev`.
- **p5.js:** `index.html` with p5.js from a CDN and `src/sketch.js`.
- A `README.md` says what the folder is and why the comments next to values are only comments there.

The export menu has **Project options**: *Library: the studio's version* (the sketch means the same thing there) or *latest* (it may change when the library does); and **With the controls panel**: `src/controls.js` makes the panel of the sketch's controls (H, the gear, `</>` for the code, as on an exported page), and the sketch carries the small `__ctl(...)` lines that let it change the values. Without the option the sketch is plain code, which is what a student should copy.

### Converting, baking, copying, pasting

- **Convert** (a board's menu, or `/convert p5|studio`): a drawing's studio code becomes a new p5 board running the sketch the export writes, and the same code pastes into the p5 editor as it is.
  - A p5 board loads files by name (`loadImage("seurat.jpg")`) from the studio's sources: the name before the extension is the source. In the p5 editor, students upload the picture beside the sketch.
  - A sketch the studio wrote converts back to studio code exactly. A p5 sketch written by hand has no studio code inside it: bake it instead.
- **Bake** (the board and selection menus, `/bake png|svg`): marks become one image mark. PNG gives a picture; SVG gives a vector image, crisp at any zoom. Undo brings the marks back.
- **Copy as** (nested, on boards and selections, or `/copy …`): PNG, SVG, JSON, studio code, p5.js code. Cmd+C copies the selected marks (as JSON).
- **Paste** (Cmd+V) takes what it is given, where you are looking:
  - pictures become image marks;
  - studio JSON comes in;
  - SVG comes back as marks when it carries the studio's record, and otherwise as a vector image;
  - p5 code becomes a p5 board, sized by its `createCanvas`, and studio code a drawing board;
  - other text becomes a note.

## The console

In the Assistant, a line starting with `!` runs a studio tool by hand, with no model involved:
- `!board list`
- `!add role=point points=[[10,20]] color=#c8664f`
- `!get format=p5code board="3 · Scattered dots"`
- `!snap {"ids": […], "mode": "points"}`

The first word is the tool (`ams_` optional), and a bare word after it is the action. `key=value` pairs are read as JSON where they can be. `!help` lists the tools, `!help board` shows one tool's parameters, and ↑ and ↓ recall earlier commands.

## Films

Lessons and explainers can be made as films on the camera system: cameras and shots on the Timeline, narration, code cards, keyframed controls, a deterministic frame by frame render with sound, an MP4 and a standalone page. Open one with the palette (`/film moon | silhouette | threejs | pointillism | condense`), or ask an agent (`ams_film`, `ams_camera`, `ams_keys`). See [films.md](films.md), [camera-plan.md](camera-plan.md) and [mcp.md](mcp.md).

## Lessons

The Docs have a **Lessons** section: how lessons work, then one topic for each of *Pointillism and Expressionism, by sampling*, *Diffusion models*, *Painterly, fading strokes* and *Taking a line for a walk*. A topic has **Build the scene** (and **As p5.js**) and **Take the tour**. `src/workbench/lessons.js` lists the lessons and builds them (`buildLesson(app, id, { language })`); `/lesson` in the palette uses it too.

`examples/lessons/sampling/lesson.js` is a lesson as data: *Pointillism and Expressionism, by sampling*.
- **Sections:** *How we see* (five diagrams drawn by code: the eye, the retina as a mosaic, the cone curves, a pixel, then and now), then Seurat, Munch and Muybridge, each a public-domain source (`media/`, with `RIGHTS.md`), and *The body as a source* (pose, and a custom brush; ml5.js in the p5 versions).
- **Examples:** each is a board with an idea, pseudocode and code.
- **Scripts:**
  - `scripts/lesson-sampling-p5.mjs` writes each example as a p5 sketch (`exports/lesson-sampling/p5/`).
  - `scripts/lesson-sampling-report.mjs` writes the lesson as HTML pages: `report.html` (studio and p5.js in tabs), `report-studio.html` and `report-p5.html` (one language each; the p5.js page runs its sketches). Each example's code opens on its pseudocode; the *How we see* diagrams start minimized to the bar of tabs. It uses the board pictures saved from the studio.
- **As files:** `exports/scenes/` holds the lesson in both languages, the source demos and the Klee scenes as `.ams.json` scenes, with `sources.json` and `media/` (see its `README.md`; the folder is git-ignored).

Examples for teaching favor few, simple, smooth curves over dense point lists.

`/lesson sampling` (or `buildLessonScene(app)` from `examples/lessons/sampling/scene.js`) builds the lesson as a scene of 16:9 frames. `/lesson sampling p5` builds the same lesson with every board as a p5.js sketch (the pose boards load ml5.js). The scene has:
- a cover frame with the contents;
- an intro frame per section: its text beside its source picture;
- a frame per example: the 800×600 drawing beside its notes (the idea, and folded callouts with the pseudocode and the other language's code);
- the bibliography: the pictures' Commons pages, and the papers and books behind the history, with checked DOIs.

The boards are linked by `[[title]]`. The boards inside a frame have their titles hidden (the frame carries it), and the diagrams' code is minimized on a page.

### Diffusion models

`/lesson diffusion` builds *Diffusion models: from noise to picture* (`examples/lessons/diffusion/lesson.js`) with the same builder (`buildLessonScene(app, { lesson })`). A lesson is data: sections of boards, each with `code` (studio code) or `p5` (a p5.js sketch written by hand), `idea` and `pseudo`, and a bibliography in columns (a column may say its `page` and `width`). The lecture has:
- **Diagrams** (studio code, code minimized on a page): the two directions (forward noise, learned reverse), the noise schedule (linear and cosine), training (guess the noise), sampling (DDPM and DDIM), latent diffusion with a prompt and guidance, and the score field.
- **Simulations** (p5.js, sliders from the ranges in the code): noising a picture (t, schedule, seed); the forward process on a cloud of points; the reverse process with the exact score of six Gaussian blobs (steps, η from DDIM to DDPM, the score field, trails); sampling a picture with an ideal denoiser that knows three pictures (its weights snap to one as the noise falls); and classifier-free guidance (w = 0 ignores the class, w = 1 is the conditional model, larger w crowds the samples into one blob).
- **Bibliography** on two frames: origins (score matching), the diffusion papers (DDPM, DDIM, SDEs, improved DDPM, EDM), images, text and architecture (U-Net, VAE, guidance, CLIP, latent diffusion, DiT), and reading.

The simulations use the real DDPM / DDIM updates. The networks are replaced by the ideal denoiser, which is a formula for these toy data (a mixture of Gaussians; three pictures). A trained network only approximates it. `test/lessonDiffusion.test.js` runs them without p5 and checks that the samplers land on the data. Flow matching is the next lecture.

### Three.js for body and sound

`/lesson threejs` builds *Three.js for body and sound* (`examples/lessons/threejs/lesson.js`) as a scene of slides, each a live three.js board beside its notes: *A scene from nothing* (the route, a spinning cube, the anatomy of a scene, **controls in code**), *The body as data* (joints, a pin screen, the body in metres), *Playing the air* (a laser harp and a body drum), *Dressing, drawing, painting* (costumes, one line, paint marks) and **Out of the studio** (an installation to perform and export). A dancer made of numbers stands in for the body tracker, so it needs no camera or models; the course with real tracking is the threejslessons repository.

Each slide's right column is the notes above a **code view** of the sketch (or, for the route diagram, of its studio code), filling the frame's height, so a student reads the code formatted and can change it: it is the sketch's own code. It uses what the studio has for code: every sketch reads `innerWidth` and `innerHeight` (so it runs in any page); the pinboard, the laser harp, *0.3 · Controls in code* and *4.1 · An installation* have controls (sliders, a toggle, a waveform menu, colours, a palette) that change them while they run; and the last board is the one to **perform** (Ctrl+Opt+P) and to **export** (board menu → Export → *Page with controls*). The tour (Docs → Lessons → *Take the tour*) goes through them, and through the editor, snippets and code help on the way. A lesson scene built by an earlier version is kept as "(older)" and the tour builds the current one.

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

## Next

- **A modifier stack:** non-destructive, Blender-like operations on a mark, with Apply to make them destructive.
- **Richer range comments,** with colors, choices and switches.
- **Curve and SVG optimization filters:** like Simplify, but aimed at SVG output (fewer and simpler paths for hatching and stipple).
- **Group frames** (plain, Excalidraw-style) beside boards; per-board grids and snapping.
- **Sequencing scenes,** and cameras separate from boards (a view that travels across several boards).
- **Rendering cache:** keep each mark's rendering until it changes. Panning a drawing of about 20 heavy marks runs near 30 fps, with redraws around 20 ms.


## The assistant and its model

The Assistant panel is a conversation that fills the panel, with the composer at the bottom: your text, then **+** (attach a text file, the selected marks, or this board's code), the model button, **Tools** (let it draw through the studio's tools, or only talk), **⋯** (replay how it did that, clear) and send. The model button lists your favorites on every engine, a star to favorite the current model, the engines, and a way into **Settings → Model**: the engine (Ollama, in-browser WebGPU, OpenRouter, OpenAI-compatible, an external agent over MCP), how to reach it (an endpoint, or an API key), the model list with a search and a favorites filter (OpenRouter also: free, image input), **Save & test**, and how it asks (temperature, steps, how much of the conversation it remembers). Favorites are kept per engine.


## Boards as layers, and outputs

A board is a window into the canvas world, and it is a **layer**. Boards stack in their sequence (later ones are above earlier ones where they overlap), and each can be see-through (**Opacity**) and blended with what is under it (**Blend**: normal, multiply, screen, overlay, darken, lighten, difference, exclusion, add), in Properties → Board, the Outliner, or `ams_board update {patch: {opacity, blend}}`. Masks and effects (Properties) work on a board the same way.

**Outliner → Stage | Board.** *Stage* is the tree by stage (when and why a mark was made). *Board* is the same marks by where they are: Board → Stage → Group → mark, each board a row with its opacity, show, lock and a **⋯** menu (blend, output). Drag a board row to restack it; drop marks on a board row to put them on it.

**Outputs** send a board somewhere, live. A board is a stream (a drawing, a p5 or three.js sketch, a page), and an output is a place it goes:
- **Pin on screen** (board menu → Output, the Outliner's ⋯, `/pin`): a window-like overlay that stays put while you navigate the rest of the canvas. Drag it by its bar, resize it from the corner, set its opacity, **◌** lets clicks through to what is under it, **⧉** also opens it in a window.
- **Open in a window** (`/output`): a window of its own, for another display or a projector. The browser may ask once to see your displays; the window then opens on the other one. **Click it for full screen** (F toggles, Esc leaves): then nothing of the browser shows, no title bar and no address bar. A browser always draws a pop-up's title and address bar until then, and a page cannot hide them.
- **A p5.js or three.js board in a window is a live twin of the sketch**, not a bitmap: the same code, started together with the same random numbers, paused and resumed together, and given the same pointer, wheel and keys (sent as fractions of the screen, so the window may be any size). Values of its controls change in both. It starts again when the sketch is rebuilt (new code, a new size). A board's menu → Output → *Show in the open window* points an open window at another board, keeping its place, display and full screen. For a performance, put the window on the second screen and play in the studio.
- **Open borderless** (`/output board borderless`, Chrome 116+): a picture-in-picture window instead: no address bar, always on top, and you drag it to any size or display. It cannot go full screen.

An output does not change what a board is doing. Sending a board that is not playing makes it play once, as its play button would (and closing the output leaves it playing); a board you paused stays paused. A playing board keeps running off screen while it is sent, because that is what a pinned board is for. Opening, full-screening and closing a window never touch play. One limit: a browser stops painting a window that is fully covered, and a sketch runs in the studio's window. A full-screen output on the *same* display as the studio covers it, so the sketch can stall. Put the output on another display (or use the borderless window) and the studio stays visible and keeps running. `ams_output` does the same for agents.
