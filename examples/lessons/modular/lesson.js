/**
 * Lesson 2 of the synthesis series: the studio's own modular synth (plan: docs/notes/synthesis-lessons.md). After the
 * p5.sound and Web Audio lessons, sound made with the studio's tools: the patch (the Patch tab, ported from genereti),
 * its visual sequencers, scores in the manner of IanniX that play it, the Arecibo message as a sequencer and as a score,
 * and the Timeline (automation, tempo, scale) for a composition.
 *
 * Built by the sampling lesson's scene builder (`/lesson modular`). The boards are studio code; the scores among them
 * start paused (every unpaused score in a scene plays at once): ▶ by a board's title lets it play, Alt-click plays only it.
 * `setup` gives the scene its patch and routes the score channels to it.
 */
import ARECIBO from '../../media/arecibo-message.json';

const ROWS = ARECIBO.rows;   // 73 rows of 23 bits, as sent from Arecibo on 16 November 1974

// Diagram helpers (studio code, fractions of an 800 × 600 board).
const HELP = `const INK = '#dadada', MUTED = '#8c8c8c', WARM = '#c8664f', GOLD = '#d9a93a', BLUE = '#5b7fd1'
const label = (x, y, t, o = {}) => note(x, y, t, { color: o.color || MUTED, note: { style: 'plain', font: 'sans', size: o.size || 14, width: o.width || 200 } })
const box = (x, y, w, h, c = INK) => line(rect(x, y, w, h), { brush: 'pen', width: 2, color: c, closed: true, path: 'straight' })
const cable = (a, b, c = WARM) => line([a, [(a[0] + b[0]) / 2, a[1]], [(a[0] + b[0]) / 2, b[1]], b], { brush: 'pen', width: 2.5, color: c })
const module = (x, y, name, kind, c) => { box(x, y, 0.2, 0.1, c); label(x + 0.012, y + 0.015, name, { color: INK, size: 15 }); label(x + 0.012, y + 0.055, kind, { size: 12 }) }
`;

// Where each part of the message is (rows), and its colour.
const PARTS = [[0, 4, '#eeeeee', 'the numbers 1 to 10'], [5, 11, '#b08bd8', 'H, C, N, O, P'], [12, 29, '#7fb069', 'the parts of DNA'], [30, 45, '#5b7fd1', 'the double helix'], [46, 55, '#c8664f', 'a person, their height, how many'], [56, 61, '#f2c14e', 'the solar system'], [62, 72, '#b08bd8', 'the telescope']];

const ARECIBO_SCORE = (withDrums = false) => `// The Arecibo message as a score: 1679 bits, 23 by 73, 397 of them 1. Each 1 is an event; a bar sweeps across and plays
// the ones it crosses (channel 2: the patch's strings), a row of the message at a time, in the order it was sent.
const ROWS = ${JSON.stringify(ROWS)}
const PARTS = ${JSON.stringify(PARTS.map(([a, b, c]) => [a, b, c]))}
const colorOf = r => (PARTS.find(([a, b]) => r >= a && r <= b) || [0, 0, '#888'])[2]
const N = ROWS.length, M = ROWS[0].length, x0 = 0.06, x1 = 0.94, top = 0.22, bottom = 0.86
const cw = (x1 - x0) / N, ch = (bottom - top) / M
for (let r = 0; r < N; r++) for (let c = 0; c < M; c++) {
  if (ROWS[r][c] !== '1') continue
  // up the board is up the scale (ny: 0 at the bottom, 1 at the top)
  point(x0 + (r + 0.5) * cw, top + (c + 0.5) * ch, { size: 7, color: colorOf(r), play: { event: { r: 3, emit: "note(2, snap(38 + lane(ny, 30), 'pentatonicminor', 38), 72, 0.6)" } } })
}
const scan = line([[x0, (top + bottom) / 2], [x1, (top + bottom) / 2]], { path: 'straight', color: '#444', width: 1, play: { path: true } })
point(x0, (top + bottom) / 2, { size: 6, color: '#f2c14e', play: { travel: { on: scan, dur: '${withDrums ? 64 : 36} beats', loop: 'loop', width: 420 } } })${withDrums ? `
// A beat under it: a second traveler on a one-bar loop crosses planes (channel 10: the patch's drums)
const bar = line([[0.06, 0.1], [0.94, 0.1]], { path: 'straight', color: '#333', play: { path: true } })
point(0.06, 0.1, { size: 5, color: '#c8664f', play: { travel: { on: bar, dur: '1 bar', loop: 'loop' } } })
const hit = (x, n, v, c) => plane(rect(x - 0.004, 0.06, 0.008, 0.08), { color: c, play: { event: { emit: 'note(10, ' + n + ', ' + v + ', 0.1)' } } })
for (const x of [0.06, 0.5]) hit(x + 0.004, 36, 110, '#c8664f')
for (const x of [0.28, 0.72]) hit(x, 38, 90, '#f2c14e')
for (let i = 0; i < 8; i++) hit(0.115 + i * 0.11, 42, 50, '#888')` : ''}
note(0.06, 0.92, '1974, Arecibo, Puerto Rico → the cluster M13, 25,000 light years away', { color: '#8c8c8c', note: { style: 'plain', font: 'sans', size: 13, width: 600 } })`;

export const LESSON = {
  title: 'Modular: patches, sequencers and scores',
  subtitle: 'The studio\'s own synth: a patch of modules (after genereti and BespokeSynth), sequencers you can see, scores that play it in the manner of IanniX, the Arecibo message, and the Timeline. Part 2 of the synthesis series.',
  idea: 'In a modular synth the instrument is a drawing: boxes joined by cables. In the studio the score is a drawing too, so the picture you make and the sound you hear can be one thing.',
  main: 'patch',
  codePanel: true,
  sources: {},
  sections: [
    {
      id: 'patch',
      title: 'The patch',
      label: 'Patch',
      text: 'Open the **Patch** tab (beside the Timeline and the Mixer). A patch is a set of **modules** joined by **cables**, like the racks of Buchla and Moog, or BespokeSynth and VCV Rack on a screen. **Instruments** (Synth, Karplus, Granular, DrumKit, DrumSynth) make sound when a note reaches them; **effects** (Gain, Filter, Delay, Reverb, Distortion, Mixer) change it; the **Output** is the speakers. Notes come from **sequencers** (gold cables) or from scores, by channel. The engine is genereti\'s, ported: every module is a few Web Audio nodes, the ones you built by hand in the Web Audio lesson. This scene came with a patch: the lead, the strings, the drums and a mixer.',
      boards: [
        { id: 'patch', title: '1.1 · A patch', w: 800, h: 600, ground: '#141414',
          idea: 'The patch this scene came with, drawn: what each module is and where the sound goes. In the Patch tab you can do everything this picture shows: add a module from the menu, drag from the dot on the right of a box (orange: sound; gold: notes) to another box to patch a cable, click a cable to take it out, select a box to set it (or pick a preset), press ♪ to hear it. Every number has a ◆: key it, and it moves on the Timeline. Nothing you change stops the sound.',
          pseudo: `patch = modules + cables
sequencer $\\xrightarrow{\\text{notes}}$ instrument $\\xrightarrow{\\text{sound}}$ effects $\\to$ mixer $\\to$ output
a score's notes on channel $c$ $\\to$ every instrument on channel $c$ (Mixer: out = Patch)`,
          code: HELP + `// The scene's patch, drawn: sequencers (gold), instruments (warm), effects (blue), and where the sound goes.
module(0.04, 0.12, 'melody', 'Steps · sequencer', GOLD)
module(0.04, 0.42, 'beat', 'Drums · sequencer', GOLD)
module(0.3, 0.12, 'lead', 'Synth · channel 1', WARM)
module(0.3, 0.27, 'strings', 'Karplus · channel 2', WARM)
module(0.3, 0.42, 'kit', 'DrumSynth · channel 10', WARM)
module(0.55, 0.12, 'echo', 'Delay', BLUE)
module(0.55, 0.27, 'space', 'Reverb', BLUE)
module(0.55, 0.42, 'mix', 'Mixer', BLUE)
module(0.78, 0.42, 'out', 'Output · the speakers', BLUE)
line([[0.24, 0.17], [0.3, 0.17]], { brush: 'pen', width: 2, color: GOLD, dash: [6, 5] })
line([[0.24, 0.47], [0.3, 0.47]], { brush: 'pen', width: 2, color: GOLD, dash: [6, 5] })
cable([0.5, 0.17], [0.55, 0.17]); cable([0.5, 0.32], [0.55, 0.32])
cable([0.75, 0.17], [0.55, 0.45]); cable([0.75, 0.32], [0.55, 0.48]); cable([0.5, 0.47], [0.55, 0.51])
cable([0.75, 0.47], [0.78, 0.47])
label(0.04, 0.6, 'Scores reach instruments by channel: in the Mixer, channels 1, 2 and 10 go out to the Patch.', { width: 600, size: 15, color: INK })
label(0.04, 0.68, 'The sequencers are not cabled yet: patch melody → lead and beat → kit, and press Play.', { width: 600, size: 15 })
label(0.04, 0.76, 'Dashed gold: notes. Orange: sound.', { width: 600, size: 13 })` }
      ]
    },
    {
      id: 'sequencers',
      title: 'Sequencers you can see',
      label: 'Sequencers',
      text: 'A sequencer is a pattern and a clock. Here the clock is always the Timeline\'s: press Play there (or in the Patch tab) and every sequencer cabled to an instrument plays, in time with the scores, the loop range and the tempo. Four kinds, after genereti\'s: **Steps** (a melody written as note names), **Drums** (a grid, a row a drum), **Euclid** (rings of evenly spread hits, from the rhythm lesson), and **Bits** (any grid of 0s and 1s, read row by row: a picture as a score). Each draws its pattern in its box, with the step it is on.',
      boards: [
        { id: 'sequencers', title: '2.1 · Four sequencers', w: 800, h: 600, ground: '#141414',
          idea: 'The four patterns, drawn as their boxes draw them. **Steps**: `C3 - Eb3 G3 …`, a note or a rest (- or .) each step; *division* is steps a beat (4: sixteenths), *gate* how much of a step a note is held. **Drums**: a line a drum, `kick 36 x...x...` (x a hit, X an accent, the number the General MIDI drum note). **Euclid**: a line a ring, `16 4 0 36` (steps, hits, rotation, note). **Bits**: rows of 0 and 1; a 1 in column c plays the c-th note of the scale. Every pattern is text in the module\'s settings: type into it while it plays.',
          pseudo: `step $i$ starts at beat $i$ / division
Steps: notes[$i$ mod $n$]
Drums: every row with a hit at $i$ mod its length
Euclid: hit $\\iff ((i - r) \\cdot k) \\bmod n < k$
Bits: row $\\lfloor i / w \\rfloor$, column $i \\bmod w$: a 1 plays scale[column]`,
          code: HELP + `// The four sequencers' patterns, as dots: Steps, Drums, Euclid, Bits.
const dot = (x, y, s, c) => point(x, y, { size: s, color: c })
label(0.05, 0.06, 'Steps', { color: INK, size: 16 })
const melody = [48, null, 51, 55, null, 60, 55, 51, 48, null, 51, 55, 58, 55, 51, null]
melody.forEach((n, i) => dot(0.05 + i * 0.025, n === null ? 0.36 : 0.34 - (n - 48) * 0.016, n === null ? 3 : 9, n === null ? '#555' : GOLD))
label(0.5, 0.06, 'Drums', { color: INK, size: 16 })
;['x...x...x...x...', '....x.......x...', 'x.x.x.x.x.x.x.x.'].forEach((row, j) => [...row].forEach((ch, i) => dot(0.5 + i * 0.027, 0.16 + j * 0.07, ch === 'x' ? 10 : 3, ch === 'x' ? WARM : '#555')))
label(0.05, 0.48, 'Euclid', { color: INK, size: 16 })
;[[16, 4, 0.13], [16, 3, 0.09], [16, 7, 0.05]].forEach(([n, k, R]) => { for (let i = 0; i < n; i++) { const a = -PI / 2 + TAU * i / n, on = (i * k) % n < k; dot(0.2 + R * cos(a) * 0.75, 0.73 + R * sin(a), on ? 9 : 3, on ? BLUE : '#555') } })
label(0.5, 0.48, 'Bits (the Arecibo message, its first rows)', { color: INK, size: 16, width: 360 })
const BITS = ${JSON.stringify(ROWS.slice(0, 14))}
BITS.forEach((row, j) => [...row].forEach((b, i) => { if (b === '1') dot(0.5 + i * 0.0165, 0.56 + j * 0.026, 6, '#eeeeee') }))` }
      ]
    },
    {
      id: 'scores',
      title: 'Scores that play the patch',
      label: 'Scores',
      text: 'The studio\'s scores work like IanniX (Iannis Xenakis\' UPIC, then IanniX from 2002): a **traveler** runs along a **path**, and **events** (planes, points, lines) sound when it touches them; the picture is the score and the Timeline is the clock. Their `emit` code says what to play: `note(channel, pitch, velocity, length)`. In this scene the Mixer sends channels 1, 2 and 10 to the Patch, so a score plays the patch\'s lead, strings and drums. Each score board starts **paused**: press ▶ by its title (Alt-click: only it) and Play on the Timeline. An IanniX file opens the same way (`/iannix`).',
      boards: [
        { id: 'curve', title: '3.1 · A curve and planes (IanniX)', w: 800, h: 600, ground: '#141414', paused: true,
          idea: 'A closed curve, a traveler that goes round it every four bars, and eight planes across it. Each plane sounds when the traveler crosses it; the height where it is crossed picks the pitch (`lane(ny, 24)`: 24 steps up the board), held to D Dorian by `snap`. Channel 1: the patch\'s lead Synth. Drag the curve\'s points or a plane, and the melody changes as it plays; turn the lead\'s cutoff in the Patch tab, and its colour changes.',
          pseudo: `traveler: round the curve every 4 bars
plane $k$ crossed at height $y$: note(1, snap(48 + lane($y$, 24), Dorian), 90, gate)
channel 1 $\\to$ Mixer (out: Patch) $\\to$ the lead Synth`,
          code: `// A curve, a traveler, eight planes (IanniX). Channel 1: the patch's lead. ▶ by the title, then Play.
const curve = line([[0.08, 0.5], [0.2, 0.2], [0.42, 0.1], [0.66, 0.16], [0.9, 0.42], [0.82, 0.78], [0.55, 0.9], [0.25, 0.84]], { closed: true, width: 2, color: '#888', play: { path: true } })
point(0.08, 0.5, { size: 9, color: '#f2c14e', play: { travel: { on: curve, dur: '4 bars', loop: 'loop' } } })
for (let i = 0; i < 8; i++) {
  const x = 0.14 + i * 0.1
  plane(rect(x, 0.04, 0.01, 0.92), { color: '#c8664f', opacity: 0.6, play: { event: { emit: "note(1, snap(48 + lane(ny, 24), 'dorian', 50), 90, 'gate')" } } })
}` },
        { id: 'drumplanes', title: '3.2 · A beat from planes', w: 800, h: 600, ground: '#141414', paused: true,
          idea: 'The step sequencer of the rhythm lesson, drawn as a score: a path one bar long and a traveler that loops it; each plane is a hit. The kick (36) is on beats 1 and 3, the snare (38) on 2 and 4, a hat (42) on every eighth, all on channel 10: the patch\'s DrumSynth. A plane\'s place along the path is its time: drag one and the beat moves. Copy a plane (Alt-drag) to add a hit; delete one to take it out.',
          pseudo: `path: one bar; traveler: loops it
plane at $x$ $\\Rightarrow$ a hit at $x \\cdot$ one bar
note(10, 36 | 38 | 42, velocity, 0.1)`,
          code: `// A beat from planes: a one-bar path, a traveler, a plane for each hit. Channel 10: the patch's drums.
const bar = line([[0.08, 0.5], [0.92, 0.5]], { path: 'straight', width: 2, color: '#888', play: { path: true } })
point(0.08, 0.5, { size: 9, color: '#f2c14e', play: { travel: { on: bar, dur: '1 bar', loop: 'loop' } } })
const x = beat => 0.08 + 0.84 * beat / 4 + 0.004
const hit = (b, n, v, c, h) => plane(rect(x(b) - 0.006, 0.5 - h / 2, 0.012, h), { color: c, play: { event: { emit: 'note(10, ' + n + ', ' + v + ', 0.1)' } } })
for (const b of [0, 2]) hit(b, 36, 115, '#c8664f', 0.5)
for (const b of [1, 3]) hit(b, 38, 95, '#f2c14e', 0.36)
for (let i = 0; i < 8; i++) hit(i / 2 + 0.25, 42, 45, '#8c8c8c', 0.2)
note(0.08, 0.86, 'kick: beats 1 and 3 · snare: 2 and 4 · hat: every eighth, off the beat', { color: '#8c8c8c', note: { style: 'plain', font: 'sans', size: 14, width: 600 } })` }
      ]
    },
    {
      id: 'arecibo',
      title: 'The Arecibo message',
      label: 'Arecibo',
      text: 'On 16 November 1974 the Arecibo radio telescope sent 1679 bits towards the star cluster M13, 25,000 light years away. 1679 is 23 × 73, the product of two primes, so whoever receives it can only arrange it one way: 73 rows of 23. Frank Drake wrote it, with Carl Sagan and others. From the top: the numbers 1 to 10, the atoms of life (hydrogen, carbon, nitrogen, oxygen, phosphorus), the parts of DNA, the double helix, a person with their height and the population of the Earth, the solar system, and the telescope that sent it. Here it is two instruments: a sequencer that reads it bit by bit, and a score whose ones are events that a bar sweeps across. (The bits: Assets › Samples › arecibo message, and examples/media/arecibo-message.json.)',
      boards: [
        { id: 'bits', title: '4.1 · The message as a sequencer', w: 800, h: 600, ground: '#141414',
          idea: 'The message in its 73 rows of 23, coloured by what each part says. In the Patch tab, **Start from… → The Arecibo message, plucked** loads a Bits sequencer holding all 1679 bits, cabled to a Karplus string and a reverb: it reads the message the way it was sent, left to right, top to bottom, a sixteenth a bit, and each 1 plucks the note of the minor pentatonic that its column gives. At 120 BPM the whole message takes three and a half minutes. Watch its box: the gold square is the bit being read.',
          pseudo: `bits $\\leftarrow$ 73 rows of 23
step $i$: row $\\lfloor i/23 \\rfloor$, column $c = i \\bmod 23$
a 1 $\\Rightarrow$ pluck(scale[$c$]); a 0 $\\Rightarrow$ silence`,
          code: `// The Arecibo message: 73 rows of 23 bits, coloured by what each part says.
const ROWS = ${JSON.stringify(ROWS)}
const PARTS = ${JSON.stringify(PARTS)}
const colorOf = r => (PARTS.find(([a, b]) => r >= a && r <= b) || [0, 0, '#888'])[2]
const s = 0.0078, x0 = 0.04, y0 = 0.035
for (let r = 0; r < ROWS.length; r++) for (let c = 0; c < 23; c++) if (ROWS[r][c] === '1') plane(rect(x0 + c * s * 0.75, y0 + r * s * 1.67, s * 0.68, s * 1.5), { color: colorOf(r) })
PARTS.forEach(([a, b, c, t]) => note(0.26, y0 + (a + b) / 2 * s * 1.67 - 0.01, t, { color: c, note: { style: 'plain', font: 'sans', size: 14, width: 300 } }))
note(0.62, 0.08, '1679 = 23 × 73', { color: '#dadada', note: { style: 'plain', font: 'sans', size: 22, width: 280 } })
note(0.62, 0.15, 'Two primes: the receiver can arrange the bits only one way.', { color: '#8c8c8c', note: { style: 'plain', font: 'sans', size: 14, width: 260 } })` },
        { id: 'aresscore', title: '4.2 · The message as a score', w: 800, h: 600, ground: '#141414', paused: true,
          idea: 'The same 1679 bits laid on their side, each row of the message a column here: every 1 is an event (397 of them) and a bar as tall as the message sweeps across it, playing a row at a time in the order it was sent, in 36 beats. Height picks the pitch (up the board, up the scale), so each row sounds as a chord of plucked strings (channel 2: the patch\'s Karplus) and the parts of the message become harmony: the numbers are sparse, the DNA dense, the person a narrow cluster. Events light up as they are struck. ▶ by the title, then Play.',
          pseudo: `for each bit (row $r$, column $c$) $= 1$: an event at $(r, c)$
traveler: a bar across all 23 columns, sweeping the 73 rows
struck at height $y$: note(2, snap(38 + lane($y$, 30), minor pentatonic), 72, 0.6)`,
          code: ARECIBO_SCORE(false) }
      ]
    },
    {
      id: 'timeline',
      title: 'The Timeline',
      label: 'Timeline',
      text: 'Everything above runs on one clock, the Timeline\'s, and the Timeline is also where a piece is arranged and shaped. **Tempo and meter** are the scene\'s (the Timeline bar): change them and scores, sequencers and lanes follow. The **loop range** (Shift-drag on the ruler) repeats a passage. The **Mixer**\'s scale holds every note of every score to one scale, so a score that wanders becomes tonal. And **automation**: any number with a ◆ (a patch module\'s cutoff, a sketch\'s slider, a board\'s opacity) can have a lane of keys, or follow the sound (Follow the sound). This scene has one lane already: the lead\'s filter opens over eight seconds and closes again.',
      boards: [
        { id: 'automation', title: '5.1 · Automation', w: 800, h: 600, ground: '#141414',
          idea: 'A lane is a curve in time for one setting. This scene\'s lane is on `patch:lead.cutoff`: from 300 Hz, open to 4000 Hz at 8 s, closed again at 16 s (open the Timeline to see it under the clips). To make one yourself: select a module in the Patch tab, move the playhead, set a value, press its ◆; move the playhead again, set another value, ◆ again. With Auto-key on (the Timeline\'s button) moving a slider at the playhead keys it. Right-click a ◆ for Follow the sound: the setting follows the loudness, the bass, the onsets… of the Timeline\'s audio. Lanes change the sound as it plays; the patch keeps its own value.',
          pseudo: `lane = keys $\\{(t_i, v_i)\\}$ for one address, e.g. patch:lead.cutoff
at the playhead $t$: value $\\leftarrow$ interpolate the keys around $t$
set the running sound (no undo step: the patch is unchanged)`,
          code: HELP + `// A lane: the lead's cutoff over sixteen seconds (the keys are dots, the curve is how it moves between them).
const X = t => 0.08 + 0.84 * t / 16, Y = hz => 0.82 - 0.62 * Math.log2(hz / 200) / Math.log2(5000 / 200)
const keys = [[0, 300], [8, 4000], [16, 300]]
const pts = []
for (let i = 0; i <= 80; i++) { const t = 16 * i / 80, k = t < 8 ? t / 8 : (16 - t) / 8; pts.push([X(t), Y(300 + (4000 - 300) * k)]) }
line(pts, { brush: 'pen', width: 3, color: GOLD })
keys.forEach(([t, v]) => point(X(t), Y(v), { size: 14, color: WARM }))
line([[0.08, 0.82], [0.92, 0.82]], { brush: 'pen', width: 1, color: '#555', path: 'straight' })
for (let t = 0; t <= 16; t += 4) label(X(t) - 0.01, 0.84, t + ' s', { size: 12 })
for (const hz of [300, 1000, 4000]) label(0.01, Y(hz) - 0.015, hz + ' Hz', { size: 12 })
label(0.08, 0.06, 'patch:lead.cutoff', { color: INK, size: 18, width: 400 })` }
      ]
    },
    {
      id: 'composition',
      title: 'A composition',
      label: 'Composition',
      text: 'Put together: the Arecibo score with a beat under it, the lead\'s filter lane, the scene\'s tempo and scale, and the picture is the score. Render it to a film (Timeline → Render): the sound of the patch is recorded with the picture. Ideas to take further: let a sketch\'s slider and the cutoff follow the same lane; give each part of the message its own instrument (channel by row); draw a new message of your own in Bits and send it to a friend.',
      boards: [
        { id: 'piece', title: '6.1 · Arecibo, played', w: 800, h: 600, ground: '#141414', paused: true,
          idea: 'The message as a piece, about two minutes long: the sweep is slower (64 beats for the 73 rows), and a one-bar beat runs under it on the drums. Before playing it, pause the other score boards (or Alt-click this board\'s ▶ to play it alone), set the tempo (90 to 110 suits it), and loop the whole length on the ruler. The picture lights as it plays; the filter lane breathes over it. A starting point: change the scale in the Mixer (Dorian, Hirajoshi, Whole Tone) and the message sounds like another culture wrote it.',
          pseudo: `the Arecibo score (4.2), sweep $=$ 64 beats
$+$ a beat: a one-bar path, planes on channel 10
$+$ the lane on patch:lead.cutoff
render: picture and sound, from one score`,
          code: ARECIBO_SCORE(true) }
      ]
    }
  ],
  bibliography: [
    { title: 'Modular and scores', items: [
      ['IanniX: a graphical sequencer for digital art (Thierry Coduys, Guillaume Jacquemin, Matthieu Ranc and others, after Xenakis\' UPIC).', 'https://www.iannix.org/en/'],
      ['BespokeSynth: a software modular synthesizer (Ryan Challinor).', 'https://www.bespokesynth.com/'],
      ['VCV Rack: an open-source virtual Eurorack.', 'https://vcvrack.com/'],
      ['Midinous (open source as open-midinous): generative sequencing with nodes and paths. The model behind the studio\'s nodes.', 'https://github.com/Nornec/open-midinous']
    ] },
    { title: 'The Arecibo message', items: [
      ['The Staff at the National Astronomy and Ionosphere Center (1975). The Arecibo message of November, 1974. *Icarus* 26(4), 462–466.', 'https://doi.org/10.1016/0019-1035(75)90116-5'],
      ['Arecibo message (overview, with the bits and their meaning).', 'https://en.wikipedia.org/wiki/Arecibo_message']
    ] }
  ],

  /** The scene's patch, the Mixer's routes, the tempo, and the lane on the lead's cutoff. */
  async setup(app) {
    const { examplePatch, normalizePatch } = await import('../../../src/audio/modular/patch.js');
    const p = examplePatch('starter');
    const modules = [...p.modules, { id: 'strings', kind: 'Karplus', x: 260, y: 130, settings: { channel: 2, decay: 2.4, damping: 0.75, level: 0.6, polyphony: 16 } }, { id: 'space', kind: 'Reverb', x: 480, y: 130, settings: { decay: 3.2, mix: 0.35 } }];
    for (const m of modules) if (m.id === 'out') m.settings = { ...m.settings, level: 0.9 };
    const cables = p.cables.filter(c => c.slot !== 'notes').concat([{ from: 'strings', to: 'space', slot: 'input' }, { from: 'space', to: 'mix', slot: 'input_3' }]);
    app.patch?.setPatch(normalizePatch({ modules, cables }));
    app.score?.setMixer({ channel: { 1: { out: 'patch' }, 2: { out: 'patch' }, 10: { out: 'patch' } } });
    app.player?.setSettings({ tempo: 100 });
    try {
      app.docks?.open('timeline');
      await new Promise(r => setTimeout(r, 300));
      const call = globalThis.ams?.callTool;
      if (call) for (const [t, v] of [[0, 300], [8000, 4000], [16000, 300]]) await call('ams_keys', { action: 'set', address: 'patch:lead.cutoff', t, v, ease: 'ease' });
    } catch (err) { app.log?.(`Lesson: the lane was not made (${err.message})`, 'warn'); }
  }
};
