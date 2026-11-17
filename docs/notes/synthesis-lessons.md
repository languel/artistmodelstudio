# Sound synthesis lessons: plan

Two lessons, each a scene of frames built by the lesson builder (`examples/lessons/sampling/scene.js`) the way the sampling (pointillism) lesson is: a cover, then one board per idea, in order, each beside its notes, pseudocode and code.

- **Lesson 1 · The basics**: p5.sound (part A, built), then plain Web Audio (part B, built)
- **Lesson 2 · Modular, with the studio's own tools**: the synth ported from genereti, a node editor, visual sequencers, IanniX scores and the Timeline, ending in a full audiovisual composition

## Lesson 1A · Synthesis with p5.sound (built: `/lesson synthesis`, `examples/lessons/synthesis/lesson.js`)

p5.sound 0.4.1 (the Tone.js-based rewrite, works with p5 2). A board loads it when its code names a p5.sound class or calls `userStartAudio`/`loadSound` (`usesP5Sound` in `src/process/p5code.js`; also in exported pages and project files). Board frames `allow="autoplay; midi; microphone"`. Sound starts on a click inside the board. `loadSound('name.mp3')` in a board reads the asset of that name, the way `loadImage` does (`LOADERS` in `boardFrames.js`), so the same line works in the p5 editor with the file uploaded beside the sketch. Sliders written as `const x = 1 /* 0..2 */` at the top of a sketch are live: they change the sound while it plays, because the sketch reads them in `draw`. Every sketch can be copied and pasted.

1. **Waves**: 1.1 four waveforms (maths and scope) · 1.2 the sine wave (pitch, loudness, Hz and notes) · 1.3 additive synthesis
2. **Shaping a sound**: 2.1 envelopes (ADSR) · 2.2 filters (spectrum) · 2.3 LFOs (vibrato, tremolo, wah) · 2.4 FM (sidebands)
3. **Playing notes**: 3.1 a mono synth (computer keys, MIDI, mouse; last-note priority, glide) · 3.2 scales and tuning (equal, just, Pythagorean; cents; beating) · 3.3 a basic line (16 steps, filter envelope)
4. **Noise and drums**: 4.1 noise (white, pink, brown; surf) · 4.2 percussion (kick, snare, hat, clap)
5. **Sequencing and rhythm**: 5.1 a step sequencer (preset beats) · 5.2 Euclidean rhythms, polymeter, swing
6. **Listening**: 6.1 spectrum and spectrogram (level, bass/mid/treble, brightness) · 6.2 a picture that listens (spectral flux onsets). Inputs: public-domain recordings, the microphone, or a dropped file
7. **Together**: 7.1 a synth and its picture (pointillist) · 7.2 pad, bass, drums

Things learnt building it (p5.sound 0.4.1):

- Tone.js plays everything 0.1 s late by default (`lookAhead`): each sketch sets `osc.node.context.lookAhead = 0`, which brings a drum hit from ~100 ms to ~5 ms
- There is no `sampleRate()`: use `getAudioContext().sampleRate`
- `connect()` does not reach a Tone.js setting (`osc.node.frequency`); the LFO and FM boards use a two-line `param()` that finds the Web Audio `AudioParam`
- Every p5.sound node starts connected to the speakers: `disconnect()` before routing (and never send the microphone out: feedback)
- Envelopes start "now", with no time argument: the sequencers tick from a 5 ms timer. Part B schedules ahead
- Global names p5 owns cannot be sketch globals (`rotate`, `noise`, `filter`, `scale`, `step`, `round`, `key`, `color`…)

Checked: each board in `experiments/synth-harness.html?id=<board>` (un-sandboxed, with a tap on the speakers): no errors, sound out, peaks under 1.0.

### Sounds and pictures added to the studio's samples (Assets › Samples; credits in `examples/media/RIGHTS.md`)

Public domain unless noted: Edison cylinders from 1888 (*The Lost Chord*; Arthur Sullivan's message), the Voyager Golden Record's greetings in 55 languages and "Hello from the children of planet Earth", the record, its cover and NASA's key to the cover, *Mementos of Earth*, Voyager 1 in interstellar plasma (2012–13), Voyager at Jupiter (1979), InSight hearing a meteoroid hit Mars (2021), and the Arecibo message (1974; CC0 source) as a picture and as data (`arecibo-message.json`: 73 rows of 23 bits). The Golden Record's music is not public domain and is not included. The Mediathèque archive lists only video, GIFs and images; it has no sound kind yet.

## Lesson 1B · Web Audio: strings, bells, samples and grains (built: `/lesson webaudio`, `examples/lessons/webaudio/lesson.js`)

Plain Web Audio in p5 boards: p5 only draws, so no p5.sound is loaded and each sketch pastes into the p5 editor as it is. Recordings are read with `loadBytes('name.mp3')` (in `LOADERS`, so the studio serves the sample of that name).

1. **The graph**: 1.1 the audio graph (oscillator → gain → analyser → speakers, live values) · 1.2 automation (step, linear, exponential, target; plan against measurement)
2. **Time**: 2.1 two clocks (a beat booked ahead on the audio clock against one played "now" from a timer; each hit's lateness plotted) · 2.2 pulsars (B1919+21, Vela, the Crab, J1748−2446ad at their real periods, each a looped buffer one period long: rhythm into pitch)
3. **Writing samples**: 3.1 a sound is a list of numbers (sine, additive, noise, chirp, beating written into an AudioBuffer) · 3.2 an AudioWorklet (a sawtooth by hand, bit crusher and sample-and-hold; loaded from a Blob URL, which works in the sandboxed frame)
4. **Physical models**: 4.1 a plucked string, Karplus–Strong, six guitar strings, strum, the delay line drawn · 4.2 struck objects from their modes (bar, marimba, bell, glass, drum; where you strike decides which modes sound)
5. **Recordings**: 5.1 a sampler on the Voyager "hello" (playback rate, polyphony, reverse) · 5.2 granular synthesis on the 55 greetings (position, size, density, spray, pitch, jitter)
6. **Together**: 6.1 *Voyager, plucked*: Karplus–Strong strings on a Euclidean rhythm, grains drifting through the greetings, the Vela pulsar as a hi-hat, all on the look-ahead clock

Checked in the harness (`?lesson=webaudio&id=<board>`): no errors, sound out, peaks under 1.0. The 4.2 mode shapes are stand-ins (sines along the bar), not a bar's true shapes. Not done: a waveguide flute; multisampling across a keyboard.

## Lesson 2 · Modular, with the studio's own tools

The modular audio comes from genereti (`~/dev/genereti`), ported rather than rewritten:

- Engine: `integrations/genereti_comfy_chop/web/modular-audio.js` (`AudioPatch`), `modular.js`, `synth-presets.js`; the Python schemas in `integrations/genereti_comfy_chop/modular.py` list every operator's settings; tests in `tests/test_modular_audio.mjs`; user docs `docs/modular-audio.md`
- Modules to bring over: transport, synth (sine, subtractive, FM, reed; ADSR, filter, vibrato), karplus, granular, drumsynth/drumkit, gain, filter, delay, reverb, distortion, mixer, output (compressor, meter, Panic)
- Visual sequencers (`audio-sequencers.js`, `audio-ui*.js`, `audio-panels.js`): melody and drum grids, Euclidean and circle sequencers, piano roll, pattern transforms. In the studio they become boards or panels on the Timeline's transport (`app.player`, `doc.transport`), so the shared clock is the Timeline's

**A node editor**, after genereti's graph and BespokeSynth: modules as boxes, cables between them, a live waveform on audio cables, presets per module. The patch is data in the scene (like `doc.transport.mixer`), so it saves, undoes and renders with the scene. An editor in code (a patch written in a board) and the node editor read and write the same data.

How it meets the rest of the studio:

- A new score output beside GM (`src/score/outputs/gm.js`) and MIDI (`webmidi.js`): the mixer routes a channel to the patch (`out: 'synth'`), so IanniX-style paths, travelers, triggers and Midinous nodes (`src/score/`) play it
- Timeline lanes modulate any module parameter, including the *Follow the sound* signals (`soundSignals.js`)
- Renders go through `renderAudio.js` with an `OfflineAudioContext`, so a render sounds like playback

Then composing on the AMS Timeline:

- The transport: tempo, signature, loop range, the ruler in beats (`doc.transport`, `src/time/`)
- Scales across a scene: the mixer's global scale and root (`doc.transport.mixer`), Midinous scales (`src/score/scale.js`), quantising travelers and triggers to a scale
- Composition: clips, compositions (`precompose`), sections, arrangement, a score as a board
- Automation: keyframe lanes on any patch parameter, *Follow the sound*, a lane drawn by hand, a lane driven by a traveler's position
- Demos built around a strong hook, short and good to show: a drawing that plays itself; a melody from a traveler on a spiral; a beat from planes a body crosses; a filter swept by a dancer's hand; **the Arecibo message as a sequencer** (`arecibo-message.json`: 73 rows of 23 steps, read top to bottom; each row a bar, or each column a voice; the picture lights as it plays, from the numbers 1 to 10 down to the telescope)
- A full audiovisual composition: picture and sound from one score, rendered to MP4 (`render.js`, `renderAudio.js`)
