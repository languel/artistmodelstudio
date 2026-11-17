/**
 * Lesson: sound synthesis with p5.sound. Part 1 of the synthesis series (plan: docs/notes/synthesis-lessons.md).
 *
 * The same shape as the sampling (pointillism) lesson and built by the same scene builder
 * (examples/lessons/sampling/scene.js, as `/lesson synthesis`): a cover, then one board per idea, in order, each a
 * p5.js sketch beside its notes, its pseudocode and an editor on its code. From one sine wave to pad, bass and drums.
 *
 * Every sketch can be copied and pasted: it runs in the p5 editor with p5.sound added (the studio adds it to a board
 * whose code names a p5.sound class). Sound starts on a click inside the board (browsers ask for a gesture). The
 * numbers with a range written after them (`const cutoff = 800 /* 40..8000 *\/`) are sliders: the sketches read them
 * in draw, so moving one changes the sound while it plays. Names p5 already uses (noise, filter, scale, step, key,
 * color, hue…) are not used as globals.
 *
 * p5.sound starts envelopes "now", with no scheduling on the audio clock, so the sequencers tick from a 5 ms timer
 * and can be a few milliseconds late. Part 2 (plain Web Audio) schedules ahead and fixes that.
 */

// Shared by many sketches: a round play button, top left. Inlined in each sketch so each one stands alone.
const BUTTON = `function playButton(on) {                // a round button: ▶ when stopped, ■ when playing
  noStroke(); fill(on ? '#c8664f' : 60); circle(44, 44, 44)
  fill(235)
  if (on) rect(36, 36, 16, 16)
  else triangle(37, 33, 37, 55, 56, 44)
}
const onButton = () => dist(mouseX, mouseY, 44, 44) < 24`;

export const LESSON = {
  title: 'Sound synthesis, from a sine wave to a band',
  subtitle: 'What sound is (pressure, loudspeakers, the voice, the ear), then waves, envelopes, filters, LFOs, FM, noise, drums, scales, sequencers, rhythm and listening, in p5.sound. Each board is a small instrument you can read.',
  idea: 'Every sound a synthesizer makes is a few simple waves, shaped over time and filtered, then played in time. Build each part once, by itself, and a band is only the parts together.',
  main: 'pressure',
  codePanel: true,
  sources: {},
  sections: [
    {
      id: 'sound',
      title: 'What sound is',
      label: 'Sound',
      text: 'Before any synthesizer: what is a sound? Something moves (a loudspeaker\'s cone, a string, the folds in your throat) and pushes the air beside it. The air is squeezed, pushes the air next to it, which pushes the next: a **wave of pressure** travels away at about 343 metres a second, while each bit of air only rocks back and forth where it is. A **microphone** and a **loudspeaker** are the same machine run in opposite directions: a membrane and a coil in a magnet. So are we: the **voice** is a membrane (the vocal folds) driven by air from the lungs, and the **ear** is a membrane (the eardrum) whose movement three tiny bones carry into the cochlea, where thousands of hair cells sort it by pitch. Four boards to play with, before we draw a single wave.',
      boards: [
        { id: 'pressure', title: '0.1 · Sound is pressure', w: 800, h: 600, ground: '#141414',
          idea: 'The loudspeaker on the left pushes and pulls; every dot is a grain of air. Watch the dots bunch up (**compression**: more pressure) and spread out (**rarefaction**: less) as the push travels to the right. The three red grains show the secret: each one only rocks back and forth around the same place; it is the push that travels, not the air. The gold curve below is the pressure along the room, the shape every later board draws as "a wave". Drag the cone with the mouse to push the air yourself: a single push, a slow one, a sharp one. It is slowed down about a hundred times so we can see it; ▶ plays it at the speed you would hear (pushes × 100 Hz). The distance from one squeeze to the next is the **wavelength**: speed ÷ frequency (for 150 Hz in air, 2.3 metres).',
          pseudo: `cone position $c(t)$: pushes and pulls
a grain resting at $x$ is moved by $c(t - x / v)$    # the push arrives later farther away
pressure $p(x) \\propto -\\,\\partial(\\text{displacement}) / \\partial x$    # squeezed where grains crowd
wavelength $\\lambda = v / f$`,
          p5: `// 0.1 Sound is pressure. The cone pushes the air; each grain only rocks in place, but the push travels. Drag the cone; ▶ to hear it.
const pushes = 1.5 /* 0.3..5 */
const strength = 0.7 /* 0..1 */
const SPEED = 140                              // how fast the push crosses the board, pixels a second (in air: 343 m/s)
const AMP = 20, X0 = 120
let grains = [], hist = [], acc = 0, t = 0, osc, on = false

function setup() {
  createCanvas(800, 600)
  randomSeed(3)
  for (let i = 0; i < 2600; i++) grains.push({ x: random(X0 + 10, 790), y: random(70, 330) })
  for (const x of [270, 450, 630]) grains.push({ x, y: 200, tag: true })
  osc = new p5.Oscillator(150, 'sine')
  osc.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  osc.amp(0)
}

function mousePressed() { if (onButton()) { userStartAudio(); if (!osc.started) osc.start(); on = !on } }

// where the cone was, a while ago: one sample every 1/60 s, newest first
const past = seconds => hist[Math.round(seconds * 60)] ?? 0
const moved = x => AMP * past((x - X0) / SPEED) * (1 - 0.25 * (x - X0) / 680)   // (a little weaker far away)

function draw() {
  background(20)
  const hand = mouseIsPressed && mouseX < X0 + 20 && mouseY > 60 && mouseY < 340 && !onButton()
  const c = hand ? constrain(map(mouseX, 40, X0, -1, 1), -1, 1) : strength * Math.sin(TWO_PI * pushes * t)
  t += deltaTime / 1000; acc += deltaTime / 1000
  while (acc >= 1 / 60) { hist.unshift(c); acc -= 1 / 60 }
  if (hist.length > 600) hist.length = 600
  osc.freq(pushes * 100, 0.05)
  osc.amp(on && !hand ? 0.35 * strength : 0, 0.05)

  // the loudspeaker: a magnet and a cone
  const cx = X0 - 10 + AMP * c
  noStroke(); fill(70); rect(30, 160, 40, 80, 4)
  fill(150); quad(70, 185, cx, 75, cx, 325, 70, 215)
  fill(hand ? '#f2c14e' : 200); rect(cx - 3, 75, 6, 250, 3)
  // the air
  for (const g of grains) {
    const x = g.x + moved(g.x)
    if (g.tag) { stroke(120); strokeWeight(1); line(g.x, g.y - 14, g.x, g.y + 14); noStroke(); fill('#c8664f'); circle(x, g.y, 10) }
    else { noStroke(); fill(205); circle(x, g.y, 2.4) }
  }
  // pressure along the room
  const y0 = 470
  stroke(60); strokeWeight(1); line(X0, y0, 790, y0)
  noStroke(); fill('#f2c14e')
  for (let x = X0 + 6; x < 790; x += 4) circle(x, y0 - 3.2 * (moved(x - 3) - moved(x + 3)) * 2, 3.5)
  fill(140); textSize(12); textAlign(LEFT)
  text('more pressure (squeezed)', X0 + 4, y0 - 70); text('less (stretched)', X0 + 4, y0 + 80)
  text('pressure along the room', X0 + 4, 580)
  fill(235); textSize(16)
  text(hand ? 'you are pushing the air' : pushes + ' pushes a second, slowed down: heard as ' + Math.round(pushes * 100) + ' Hz', 90, 50)
  fill(140); textSize(12)
  text('one wavelength here: ' + Math.round(SPEED / pushes) + ' px · drag the cone (left) to push by hand · red grains: they only rock in place', 90, 368)
  playButton(on)
}

${BUTTON}` },

        { id: 'transducers', title: '0.2 · Loudspeaker and microphone', w: 800, h: 600, ground: '#141414',
          idea: 'Two machines, one idea: a light membrane joined to a coil of wire that sits around a magnet. **Loudspeaker** (left): a changing current in the coil makes it a changing magnet, the magnet pushes and pulls it, the cone moves, the air moves. **Microphone** (right): the air moves the diaphragm, the coil moves through the magnet\'s field, and that makes a current: the same signal, back as electricity. (This is a dynamic microphone; plug a dynamic mic into a speaker output and it works, weakly, as a speaker.) Choose **tone** and click ▶ to send a tone in; choose **voice** and click to let the microphone of your computer drive the left side: talk or sing, and watch your voice cross the room. The traces are the signal in and the signal out, the same shape, a moment later.',
          pseudo: `loudspeaker: current $\\to$ coil in a magnet $\\to$ force $\\to$ cone $\\to$ air
microphone: air $\\to$ diaphragm $\\to$ coil moves in the magnet $\\to$ current
out$(t) \\approx$ in$(t - d / v)$    # the same signal, later`,
          p5: `// 0.2 Loudspeaker and microphone: one machine, both ways. ▶ sends a tone; input voice lets your microphone drive it.
const input = 'tone' /* tone|voice */
const pushes = 2 /* 0.5..6 */
const SPEED = 150, AMP = 12, SX = 230, MX = 590
let hist = [], acc = 0, t = 0, osc, mic, meter, level = 0, on = false, ins = [], outs = []

function setup() {
  createCanvas(800, 600)
  osc = new p5.Oscillator(220, 'sine')
  osc.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  osc.amp(0)
  mic = new p5.AudioIn(); mic.disconnect()    // the microphone never goes to the speakers (feedback)
  meter = new p5.Amplitude(0.85); mic.connect(meter)
}

function mousePressed() {
  userStartAudio()
  if (input === 'voice') { if (!mic.started) mic.start(); return }
  if (onButton()) { if (!osc.started) osc.start(); on = !on }
}

const past = s => hist[Math.round(s * 60)] ?? 0

function machine(x, d, flip, label) {          // a magnet, a coil, a membrane (flip: facing left)
  const k = flip ? -1 : 1, m = x + k * 0 + AMP * d
  noStroke(); fill(70); rect(flip ? x + 30 : x - 70, 160, 40, 80, 4)                     // magnet
  fill(110); textSize(11); textAlign(CENTER); text('N', flip ? x + 50 : x - 50, 186); text('S', flip ? x + 50 : x - 50, 228)
  stroke('#c8664f'); strokeWeight(3)                                                  // the coil, on the membrane
  for (let i = 0; i < 6; i++) line(m - k * 22, 172 + i * 11, m - k * 10, 177 + i * 11)
  noStroke(); fill(150)
  quad(m - k * 10, 185, m, 90, m, 310, m - k * 10, 215)                                // cone or diaphragm
  fill(220); rect(m - 2, 90, 4, 220, 2)
  stroke(90); strokeWeight(1.5); noFill()                                              // wires
  line(flip ? x + 70 : x - 70, 200, flip ? x + 110 : x - 110, 200)
  noStroke(); fill(170); textSize(14); text(label, x - k * 10, 345)
}

function trace(list, x0, y0, c) {
  noStroke(); fill(c)
  list.forEach((v, i) => circle(x0 + i * 1.5, y0 - 40 * v, 3))
}

function draw() {
  background(20)
  if (input === 'voice') level = meter.getLevel()
  const d = input === 'voice' ? constrain(level * 9, 0, 1) * Math.sin(TWO_PI * 3 * t) : (on ? 0.9 : 0) * Math.sin(TWO_PI * pushes * t)
  t += deltaTime / 1000; acc += deltaTime / 1000
  while (acc >= 1 / 60) { hist.unshift(d); acc -= 1 / 60 }
  if (hist.length > 400) hist.length = 400
  osc.amp(on && input === 'tone' ? 0.3 : 0, 0.05)
  const heard = past((MX - SX) / SPEED)

  machine(SX, d, false, 'loudspeaker')
  machine(MX, heard, true, 'microphone')
  // the air between, as grains
  randomSeed(5); noStroke(); fill(200)
  for (let i = 0; i < 900; i++) { const x = random(SX + 20, MX - 20), y = random(100, 300); circle(x + AMP * past((x - SX) / SPEED), y, 2.2) }
  // the signals, in and out
  ins.unshift(d); outs.unshift(heard); if (ins.length > 140) { ins.pop(); outs.pop() }
  trace(ins, 30, 470, '#f2c14e'); trace(outs, 560, 470, '#5b7fd1')
  fill(150); textSize(12); textAlign(LEFT)
  text('current in (the signal)', 30, 540); text('current out', 560, 540)
  text('current → coil in a magnet → cone → air', 30, 380); textAlign(RIGHT); text('air → diaphragm → coil in a magnet → current', 770, 380)
  textAlign(LEFT); fill(235); textSize(16)
  text(input === 'voice' ? (mic.started ? 'your voice drives the loudspeaker' : 'click to let the microphone listen') : 'a tone: ▶ to send it', 90, 50)
  if (input === 'tone') playButton(on)
}

${BUTTON}` },

        { id: 'voice', title: '0.3 · The voice', w: 800, h: 600, ground: '#141414',
          idea: 'Air from the lungs pushes up through the **vocal folds**, two small membranes in the larynx; they blow open, snap shut, open again, a hundred or more times a second, and chop the air into a **buzz** with many harmonics (its pitch is how fast they flap). Above them the throat and mouth, the **vocal tract**, is a tube that rings at a few frequencies, the **formants**, and those harmonics are loud while the others fade. Move your tongue and lips and the formants move: that is a vowel. Hold the mouse on the chart (right) to sing; drag to change the vowel: left-right is the second formant (tongue forward or back), up-down the first (mouth closed or open). The dots under the throat are the buzz\'s harmonics; their heights are the tract\'s filter. This is the source–filter model, and the next lessons build every sound the same way: a source, then a filter.',
          pseudo: `source: the folds buzz at $f_0$ $\\to$ harmonics $f_0, 2f_0, 3f_0, \\ldots$
filter: the tract resonates at $F_1, F_2, F_3$ (the formants)
vowel = which harmonics the formants let through
synth: sawtooth($f_0$) $\\to$ band-pass($F_1$) + band-pass($F_2$) + band-pass($F_3$)`,
          p5: `// 0.3 The voice: folds buzz (the source), the throat and mouth ring at formants (the filter). Hold and drag on the vowel chart to sing.
const pitch = 120 /* 70..320 */
const VOWELS = [['i', 'heed', 270, 2290], ['e', 'head', 530, 1840], ['a', 'hot', 730, 1090], ['o', 'law', 570, 840], ['u', 'who', 300, 870]]   // F1, F2 in Hz (adult averages, after Peterson & Barney 1952)
const PX = 440, PY = 80, PW = 340, PH = 300   // the chart
const toX = f2 => PX + PW * (2500 - f2) / 1800, toY = f1 => PY + PH * (f1 - 220) / 680
const fromX = x => 2500 - (x - PX) / PW * 1800, fromY = y => 220 + (y - PY) / PH * 680
let src, bands = [], f1 = 730, f2 = 1090, singing = false, t = 0
// a cubic curve as vertices (works the same in p5 1 and 2)
const cubic = (x0, y0, x1, y1, x2, y2, x3, y3) => { for (let i = 1; i <= 16; i++) { const u = i / 16, v = 1 - u; vertex(v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3, v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3) } }

function setup() {
  createCanvas(800, 600)
  src = new p5.Oscillator(pitch, 'sawtooth')  // the buzz of the folds
  src.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  src.disconnect(); src.amp(0)
  for (const q of [7, 9, 11]) { const b = new p5.Biquad(1000, 'bandpass'); b.res(q); src.connect(b); bands.push(b) }   // three formants, side by side
}

const inChart = () => mouseX > PX && mouseX < PX + PW && mouseY > PY && mouseY < PY + PH
function mousePressed() { if (!inChart()) return; userStartAudio(); if (!src.started) src.start(); singing = true; follow() }
function mouseDragged() { if (singing) follow() }
function mouseReleased() { singing = false }
function follow() { f2 = constrain(fromX(mouseX), 700, 2500); f1 = constrain(fromY(mouseY), 220, 900) }

// how loud the tract lets a frequency through: three resonances
const gainAt = f => [[f1, 90], [f2, 120], [2600, 160]].reduce((s, [F, B]) => s + 1 / (1 + ((f - F) / B) ** 2), 0)

function draw() {
  background(20)
  t += deltaTime / 1000
  src.freq(pitch, 0.03)
  src.amp(singing ? 0.5 : 0, 0.06)
  bands[0].freq(f1); bands[1].freq(f2); bands[2].freq(2600)

  // the tract: a bent tube from the folds up to the lips
  stroke(90); strokeWeight(2); noFill()
  const open = map(f1, 220, 900, 10, 40), front = map(f2, 700, 2500, 0, 1)
  beginShape(); vertex(110, 380); vertex(110, 180); cubic(110, 180, 110, 110, 160, 90, 230, 95); vertex(330, 105 - open / 2); endShape()
  beginShape(); vertex(150, 380); vertex(150, 200); cubic(150, 200, 150, 160, 180, 150, 230, 150 - front * 25); vertex(330, 115 + open / 2); endShape()
  noStroke(); fill('#c8664f'); ellipse(230 + front * 30, 150 - front * 20, 60, 22)        // the tongue
  // the folds: open and shut (slowed down to be seen)
  const gap = singing ? 6 * Math.abs(Math.sin(TWO_PI * 4 * t)) : 0
  fill(singing ? '#f2c14e' : 140); rect(111, 360, 19 - gap, 8, 3); rect(130 + gap, 360, 19 - gap, 8, 3)
  fill(140); textSize(12); textAlign(LEFT)
  text('vocal folds', 160, 368); text('tongue', 250 + front * 30, 135 - front * 20); text('lips', 336, 110); text('lungs: air ↑', 100, 400)
  // the harmonics and the tract's filter
  const base = 560
  for (let k = 1; k * pitch < 4000; k++) {
    const f = k * pitch, x = 40 + 360 * f / 4000, h = 120 * Math.min(1, gainAt(f)) / Math.sqrt(k) * 1.6
    stroke(singing ? '#f2c14e' : 90); strokeWeight(2); line(x, base, x, base - h)
  }
  noFill(); stroke('#5b7fd1'); strokeWeight(1.5); beginShape()
  for (let f = 50; f < 4000; f += 25) vertex(40 + 360 * f / 4000, base - 70 * Math.min(1.4, gainAt(f)))
  endShape()
  noStroke(); fill(140); textSize(11)
  for (const f of [0, 1000, 2000, 3000, 4000]) text(f + ' Hz', 40 + 360 * f / 4000 - 10, base + 16)
  // the chart of vowels
  stroke(60); strokeWeight(1); noFill(); rect(PX, PY, PW, PH, 6)
  noStroke()
  for (const [v, w, F1, F2] of VOWELS) { fill(200); textSize(22); textAlign(CENTER, CENTER); text(v, toX(F2), toY(F1)); fill(120); textSize(11); text(w, toX(F2), toY(F1) + 18) }
  fill(singing ? '#f2c14e' : '#c8664f'); circle(toX(f2), toY(f1), 16)
  fill(140); textSize(11); textAlign(LEFT, BASELINE)
  text('← tongue forward          tongue back →', PX, PY + PH + 18)
  text('mouth closed ↑   open ↓', PX, PY - 8)
  fill(235); textSize(16)
  text(singing ? 'F1 ' + Math.round(f1) + ' Hz · F2 ' + Math.round(f2) + ' Hz · pitch ' + pitch + ' Hz' : 'hold the mouse on the chart to sing', 40, 40)
  fill(140); textSize(12); text('harmonics of the buzz, and the tract’s filter (blue)', 40, 590)
}` },

        { id: 'ear', title: '0.4 · The ear', w: 800, h: 600, ground: '#141414',
          idea: 'The **outer ear** is a funnel that gathers the pressure wave into the ear canal. At its end the **eardrum**, a membrane, moves with it. Three of the smallest bones in the body, the **hammer**, **anvil** and **stirrup**, work as a lever and press on the **oval window** of the **cochlea**, a snail-shaped tube of fluid. Inside, the **basilar membrane** runs its length, stiff and narrow at the base, wide and floppy at the tip: a high sound shakes it near the base, a low one near the tip, so the cochlea sorts sound by pitch, a spectrum analyser made of flesh (it is drawn here uncoiled). Where it shakes, rows of **hair cells** bend their tiny **stereocilia** (the "cilia") and fire the nerve. Drag along the uncoiled cochlea to choose the pitch, choose **chord** to hear three places at once, or **voice** to see your own voice spread along it. Healthy young ears hear about 20 Hz to 20,000 Hz; the top falls with age.',
          pseudo: `pressure $\\to$ eardrum $\\to$ hammer, anvil, stirrup (a lever) $\\to$ oval window $\\to$ fluid
place of the peak for frequency $f$ (Greenwood): $f = 165.4\\,(10^{2.1\\,x} - 0.88)$, $x$ from the tip (0) to the base (1)
hair cells where it peaks bend $\\to$ the nerve fires: each place is one band of a spectrum`,
          p5: `// 0.4 The ear: funnel, eardrum, three bones, and the cochlea (drawn uncoiled) that sorts sound by pitch. Drag along the cochlea; ▶ to hear.
const input = 'tone' /* tone|chord|voice */
let freq = 1000 /* 20..16000 */
const CX0 = 70, CX1 = 760, CY = 430              // the uncoiled cochlea: base (left) to tip (right)
const placeOf = f => Math.log10(f / 165.4 + 0.88) / 2.1         // Greenwood: 1 at the base, 0 at the tip
const freqAt = x => 165.4 * (Math.pow(10, 2.1 * x) - 0.88)
const toPx = x => CX0 + (1 - x) * (CX1 - CX0), fromPx = px => 1 - (px - CX0) / (CX1 - CX0)
let oscs = [], mic, fft, on = false, t = 0
// a cubic curve as vertices (works the same in p5 1 and 2)
const cubic = (x0, y0, x1, y1, x2, y2, x3, y3) => { for (let i = 1; i <= 16; i++) { const u = i / 16, v = 1 - u; vertex(v * v * v * x0 + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3, v * v * v * y0 + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3) } }

function setup() {
  createCanvas(800, 600)
  for (let i = 0; i < 3; i++) { const o = new p5.Oscillator(440, 'sine'); o.amp(0); oscs.push(o) }
  oscs[0].node.context.lookAhead = 0          // play now: p5.sound (Tone.js) waits 0.1 s by default
  mic = new p5.AudioIn(); mic.disconnect()    // listen only: never to the speakers
  fft = new p5.FFT(4096); mic.connect(fft)
}

function mousePressed() {
  userStartAudio()
  if (input === 'voice') { if (!mic.started) mic.start(); return }
  if (onButton()) { for (const o of oscs) if (!o.started) o.start(); on = !on }
}
function mouseDragged() { if (mouseY > CY - 70 && mouseY < CY + 110) freq = constrain(freqAt(fromPx(mouseX)), 20, 16000) }

// how strongly the membrane moves at place x for a tone of frequency f: rises toward its place, then dies fast
function envelope(x, f) {
  const p = placeOf(f), d = 1 - x, dp = 1 - p
  return d <= dp ? Math.pow(d / Math.max(dp, 0.01), 2) : Math.exp(-(((d - dp) / 0.035) ** 2))
}

function draw() {
  background(20)
  t += deltaTime / 1000
  const tones = input === 'chord' ? [freq, freq * 1.26, freq * 1.5] : input === 'tone' ? [freq] : []
  oscs.forEach((o, i) => { if (tones[i]) o.freq(tones[i], 0.03); o.amp(on && i < tones.length ? 0.22 : 0, 0.05) })
  const sounding = (on && tones.length) || (input === 'voice' && mic.started)
  let spectrum = null, df = 1
  if (input === 'voice' && mic.started) { spectrum = fft.analyze(); df = getAudioContext().sampleRate / 2 / spectrum.length }
  const shake = x => {
    if (spectrum) { const i = Math.round(freqAt(x) / df); return constrain(map(20 * Math.log10((spectrum[i] || 0) + 1e-9), -90, -30, 0, 1), 0, 1) }
    return sounding ? Math.min(1, tones.reduce((s, f) => s + envelope(x, f), 0)) : 0
  }
  const wiggle = sounding ? Math.sin(TWO_PI * 3 * t) : 0

  // the outer ear: a funnel, and the canal
  noStroke(); fill(90)
  beginShape(); vertex(45, 85); cubic(45, 85, 95, 75, 112, 125, 120, 140); vertex(120, 175); cubic(120, 175, 102, 200, 85, 255, 50, 250); cubic(50, 250, 75, 205, 78, 125, 45, 85); endShape()
  fill(60); rect(118, 140, 110, 35)
  // the eardrum, the bones (a lever), the oval window
  const e = 4 * wiggle
  stroke('#f2c14e'); strokeWeight(4); line(232 + e, 128, 232 + e, 187)
  stroke(220); strokeWeight(6)
  line(234 + e, 150, 262 + e * 0.8, 128)              // hammer
  line(262 + e * 0.8, 128, 292 + e * 0.6, 138)         // anvil
  strokeWeight(4); line(292 + e * 0.6, 138, 318 + e * 0.5, 160); line(300 + e * 0.5, 165, 322 + e * 0.5, 158)   // stirrup
  stroke('#c8664f'); strokeWeight(3); line(326 + e * 0.5, 148, 326 + e * 0.5, 172)                           // oval window
  // the cochlea, coiled (two and a half turns)
  noFill(); stroke(150); strokeWeight(7)
  beginShape(); for (let a = 0; a < 5 * PI; a += 0.08) { const r = 46 - a * 2.6; vertex(400 + r * Math.cos(a + PI), 160 + r * Math.sin(a + PI)) } endShape()
  noStroke(); fill(140); textSize(11); textAlign(CENTER)
  text('outer ear', 70, 280); text('ear canal', 175, 128); text('eardrum', 232, 205); text('three bones', 285, 112); text('cochlea', 400, 228); text('to the brain →', 520, 165)
  stroke(110); strokeWeight(1); line(440, 160, 480, 160)

  // the cochlea, uncoiled: the basilar membrane and its travelling wave
  noStroke(); fill(40)
  beginShape(); vertex(CX0, CY - 26); vertex(CX1, CY - 40); vertex(CX1, CY + 40); vertex(CX0, CY + 26); endShape(CLOSE)
  stroke('#5b7fd1'); strokeWeight(2); noFill(); beginShape()
  for (let px = CX0; px <= CX1; px += 3) { const x = fromPx(px); vertex(px, CY + 26 * shake(x) * Math.sin(TWO_PI * 3 * t - (1 - x) * 40)) }
  endShape()
  // hair cells, their stereocilia bending where it shakes
  for (let i = 0; i < 70; i++) {
    const px = CX0 + 6 + i * (CX1 - CX0 - 12) / 69, s = shake(fromPx(px)), bend = 9 * s * Math.sin(TWO_PI * 3 * t - i * 0.2)
    noStroke(); fill(s > 0.35 ? '#f2c14e' : 70); circle(px, CY + 62, 7)
    stroke(s > 0.35 ? '#f2c14e' : 90); strokeWeight(1.2)
    for (const dx of [-2.5, 0, 2.5]) line(px + dx, CY + 58, px + dx + bend, CY + 46)
  }
  // where each frequency lands
  noStroke(); fill(120); textSize(10); textAlign(CENTER)
  for (const f of [16000, 8000, 4000, 2000, 1000, 500, 250, 125, 60, 30]) text(f >= 1000 ? f / 1000 + 'k' : f, toPx(placeOf(f)), CY + 92)
  textAlign(LEFT); text('base: stiff, narrow, high', CX0, CY - 50); textAlign(RIGHT); text('tip: floppy, wide, low', CX1, CY - 50)
  textAlign(LEFT); fill(140); textSize(12); text('hair cells and their stereocilia', CX0, CY + 118)
  if (input !== 'voice') { stroke('#c8664f'); strokeWeight(2); for (const f of tones) line(toPx(placeOf(f)), CY - 40, toPx(placeOf(f)), CY + 40) }
  noStroke(); fill(235); textSize(16); textAlign(LEFT)
  text(input === 'voice' ? (mic.started ? 'your voice, spread along the cochlea' : 'click to let the microphone listen') : (input === 'chord' ? 'a chord on ' : '') + Math.round(freq) + ' Hz · drag along the cochlea', 90, 40)
  if (input !== 'voice') playButton(on)
}

${BUTTON}` }
      ]
    },
    {
      id: 'waves',
      title: 'Waves',
      label: 'Waves',
      text: 'A sound is air pressure going up and down. A loudspeaker follows a list of numbers, 44,100 or 48,000 every second, and an oscillator is a program that writes that list: the same shape over and over. How often it repeats is the **frequency**, heard as pitch; how far it swings is the **amplitude**, heard as loudness; the **shape** is heard as timbre. Three boards: the four classic shapes, the sine wave by itself, and how sine waves add up to the other shapes.',
      boards: [
        { id: 'waveforms', title: '1.1 · Four waveforms', w: 800, h: 600, ground: '#141414',
          idea: 'Sine, triangle, sawtooth and square: the four shapes every synthesizer starts from. Above, one cycle of each, as maths; below, the sound as it leaves, read back from the speaker\'s signal. Same pitch, same loudness, and they sound nothing alike: the sine is pure, the triangle soft, the sawtooth bright and buzzy, the square hollow. Change the shape and the pitch with the sliders while it plays.',
          pseudo: `osc $\\leftarrow$ an oscillator of a given shape and frequency
scope $\\leftarrow$ an analyser listening to osc
every frame:
  draw one cycle of each shape (maths)
  draw scope's last 1024 samples (sound)`,
          p5: `// 1.1 Four waveforms. Click ▶ to hear the chosen shape. Top: one cycle of each, as maths. Bottom: the sound as it leaves.
const shape = 'sawtooth' /* sine|triangle|sawtooth|square */
const freq = 220 /* 55..880 */
const volume = 0.3 /* 0..1 */
const SHAPES = ['sine', 'triangle', 'sawtooth', 'square']
let osc, scope, on = false, last = {}

function wave(t, p) {                        // one cycle of a shape: p from 0 to 1, value from -1 to 1
  if (t === 'sine') return Math.sin(TWO_PI * p)
  if (t === 'triangle') return 1 - 4 * Math.abs(((p + 0.25) % 1) - 0.5)
  if (t === 'sawtooth') return 2 * ((p + 0.5) % 1) - 1
  return p < 0.5 ? 1 : -1
}

function setup() {
  createCanvas(800, 600)
  osc = new p5.Oscillator(freq, shape)
  osc.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  osc.amp(0)
  scope = new p5.FFT(1024)                   // an analyser; waveform() gives the last 1024 samples
  osc.connect(scope)
}

function mousePressed() {
  if (!onButton()) return
  userStartAudio()
  if (!osc.started) osc.start()
  on = !on
}

function draw() {
  background(20)
  if (last.shape !== shape) osc.setType(shape)
  if (last.freq !== freq) osc.freq(freq, 0.05)
  if (last.on !== on || last.volume !== volume) osc.amp(on ? volume : 0, 0.05)
  last = { shape, freq, volume, on }

  // the four shapes, as maths
  SHAPES.forEach((t, i) => {
    const x0 = 40 + i * 185, y0 = 160, w = 165, h = 110
    stroke(t === shape ? '#f2c14e' : 90); strokeWeight(t === shape ? 3 : 1.5); noFill()
    beginShape()
    for (let j = 0; j <= 100; j++) vertex(x0 + w * j / 100, y0 - h / 2 * wave(t, j / 100))
    endShape()
    noStroke(); fill(t === shape ? 235 : 120); textSize(14); textAlign(CENTER)
    text(t, x0 + w / 2, y0 + 80)
  })

  // the sound itself: start where the signal crosses zero going up, so the picture holds still
  const s = scope.waveform()
  let z = 0
  while (z < s.length / 2 && !(s[z] <= 0 && s[z + 1] > 0)) z++
  stroke('#5b7fd1'); strokeWeight(2); noFill()
  beginShape()
  for (let j = 0; j < 512; j++) vertex(40 + 720 * j / 511, 440 - 260 * s[z + j])
  endShape()
  noStroke(); fill(140); textAlign(LEFT); textSize(13)
  text('the sound (512 samples, ' + nf(512 / getAudioContext().sampleRate * 1000, 1, 1) + ' ms)', 40, 580)
  textAlign(RIGHT)
  text(freq + ' Hz: one cycle every ' + nf(1000 / freq, 1, 2) + ' ms', 760, 580)
  playButton(on)
}

${BUTTON}` },

        { id: 'sine', title: '1.2 · The sine wave', w: 800, h: 600, ground: '#141414',
          idea: 'Hold the mouse down anywhere: left to right is pitch, five octaves from 55 Hz to 1760 Hz; bottom to top is loudness. Each octave doubles the frequency, so equal steps to the ear are equal steps in the logarithm of the frequency, which is why the A notes are evenly spaced. The note name comes from the MIDI number m = 69 + 12 log₂(f / 440): 69 is the A above middle C, 12 notes to an octave. The cents say how far the pitch is from that note (100 cents to a semitone).',
          pseudo: `while the mouse is down:
  $f \\leftarrow 55 \\cdot 2^{\\,5x}$    # x from 0 to 1: five octaves
  $A \\leftarrow y$
  play $A \\sin(2\\pi f t)$
note $\\leftarrow 69 + 12\\log_2(f / 440)$, rounded; cents $\\leftarrow$ the rest $\\times 100$`,
          p5: `// 1.2 The sine wave. Hold the mouse down: left to right is pitch (55 Hz to 1760 Hz, five octaves), bottom to top is loudness.
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const xToHz = x => 55 * Math.pow(2, 5 * x / width)       // five octaves across the board
const hzToX = f => width * Math.log2(f / 55) / 5
let osc, f = 220, a = 0

function setup() {
  createCanvas(800, 600)
  osc = new p5.Oscillator(f, 'sine')
  osc.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  osc.amp(0)
}

function mousePressed() { userStartAudio(); if (!osc.started) osc.start() }

function draw() {
  background(20)
  const down = mouseIsPressed && mouseY > 0 && mouseY < height
  if (down) { f = xToHz(constrain(mouseX, 0, width)); a = map(mouseY, height - 60, 60, 0, 0.8, true) }
  osc.freq(f, 0.02)
  osc.amp(down ? a : 0, 0.04)

  // 20 ms of the wave: y = A sin(2 pi f t)
  stroke(down ? '#f2c14e' : 80); strokeWeight(2); noFill()
  beginShape()
  for (let x = 0; x <= width; x += 2) vertex(x, 270 - 200 * (down ? a : 0.05) * Math.sin(TWO_PI * f * 0.02 * x / width))
  endShape()

  // the A notes, an octave apart, evenly spaced
  for (let k = 0; k <= 5; k++) {
    const x = hzToX(55 * 2 ** k)
    stroke(60); strokeWeight(1); line(x, 470, x, 500)
    noStroke(); fill(130); textSize(12); textAlign(CENTER)
    text('A' + (k + 1) + '  ' + 55 * 2 ** k + ' Hz', constrain(x, 40, width - 40), 520)
  }
  const m = 69 + 12 * Math.log2(f / 440), n = Math.round(m), cents = Math.round(100 * (m - n))
  stroke('#c8664f'); strokeWeight(2); line(hzToX(f), 460, hzToX(f), 505)
  noStroke(); fill(235); textSize(22); textAlign(LEFT)
  text(nf(f, 1, 1) + ' Hz   ' + NAMES[n % 12] + (Math.floor(n / 12) - 1) + (cents ? '  ' + (cents > 0 ? '+' : '') + cents + ' cents' : ''), 40, 60)
  textSize(13); fill(140)
  text('the window shows 20 ms: ' + nf(f * 0.02, 1, 1) + ' cycles · one cycle = ' + nf(1000 / f, 1, 2) + ' ms · loudness ' + nf(a, 1, 2), 40, 86)
  text('hold the mouse down to play', 40, 570)
}` },

        { id: 'additive', title: '1.3 · Additive synthesis', w: 800, h: 600, ground: '#141414',
          idea: 'Fourier\'s idea: any repeating shape is a sum of sine waves at whole-number multiples of one frequency, its **harmonics**. A sawtooth is every harmonic at 1/n of the first; a square only the odd ones at 1/n; a triangle the odd ones at 1/n², every other one turned upside down. Raise the number of partials and watch the sum (gold) get closer to the shape. An organ mixes a few harmonics by hand (its drawbars). A bell uses partials that are not whole multiples (inharmonic): it no longer has one clear pitch.',
          pseudo: `for $n = 1 \\ldots N$:
  an oscillator at $n \\cdot f$ (or $r_n \\cdot f$ for a bell), loudness $w_n$
  sawtooth: $w_n = 1/n$; square: $1/n$, odd $n$; triangle: $\\pm 1/n^2$, odd $n$
sound $= \\sum_n w_n \\sin(2\\pi\\, n f t)$`,
          p5: `// 1.3 Additive synthesis: sine waves at multiples of one frequency (harmonics) add up to other shapes.
const recipe = 'sawtooth' /* sawtooth|square|triangle|organ|bell */
const partials = 6 /* 1..16 */
const freq = 110 /* 55..440 */
const N = 16
let oscs = [], on = false, last = {}

function weights(r, n) {                      // how loud partial n is (n = 1, 2, 3…); negative = upside down
  if (r === 'sawtooth') return 1 / n
  if (r === 'square') return n % 2 ? 1 / n : 0
  if (r === 'triangle') return n % 2 ? (((n - 1) / 2) % 2 ? -1 : 1) / (n * n) : 0
  if (r === 'organ') return [1, 0.8, 0.6, 0, 0.4, 0, 0, 0.3][n - 1] || 0
  return [1, 0.6, 0.5, 0.4, 0.3, 0.25, 0.2, 0.15][n - 1] || 0          // bell
}
const ratio = (r, n) => r === 'bell' ? [1, 2.76, 5.4, 8.93, 13.34, 18.64, 24.8, 31.87][n - 1] || n : n

function setup() {
  createCanvas(800, 600)
  for (let n = 1; n <= N; n++) { const o = new p5.Oscillator(freq * n, 'sine'); o.amp(0); oscs.push(o) }
  oscs[0].node.context.lookAhead = 0          // play now: p5.sound (Tone.js) waits 0.1 s by default
}

function mousePressed() {
  if (!onButton()) return
  userStartAudio()
  for (const o of oscs) if (!o.started) o.start()
  on = !on; last = {}
}

function draw() {
  background(20)
  const w = n => n <= partials ? weights(recipe, n) : 0
  let total = 0
  for (let n = 1; n <= N; n++) total += Math.abs(w(n))
  if (last.recipe !== recipe || last.partials !== partials || last.freq !== freq || last.on !== on) {
    oscs.forEach((o, i) => {
      const n = i + 1
      o.freq(freq * ratio(recipe, n), 0.05)
      o.phase(w(n) < 0 ? 180 : 0)              // upside down = half a cycle late
      o.amp(on ? 0.35 * Math.abs(w(n)) / total : 0, 0.05)
    })
    last = { recipe, partials, freq, on }
  }

  // the partials, as bars
  for (let n = 1; n <= N; n++) {
    const x = 60 + (n - 1) * 44, h = 120 * Math.abs(w(n)) / (Math.abs(w(1)) || 1)
    noStroke(); fill(n <= partials ? (w(n) < 0 ? '#5b7fd1' : '#c8664f') : 45)
    rect(x, 560 - h, 26, h)
    fill(120); textSize(11); textAlign(CENTER); text(nf(ratio(recipe, n), 1, recipe === 'bell' ? 2 : 0), x + 13, 578)
  }
  // each sine, faint, and their sum, bright
  const y0 = 260, A = 150, cycles = 2
  const sine = (n, t) => w(n) * Math.sin(TWO_PI * ratio(recipe, n) * t)
  strokeWeight(1); noFill()
  for (let n = 1; n <= partials; n++) {
    stroke(255, 40); beginShape()
    for (let x = 0; x <= 720; x += 3) vertex(40 + x, y0 - A * sine(n, cycles * x / 720) / (Math.abs(w(1)) || 1))
    endShape()
  }
  stroke('#f2c14e'); strokeWeight(3); beginShape()
  for (let x = 0; x <= 720; x += 2) {
    let s = 0
    for (let n = 1; n <= partials; n++) s += sine(n, cycles * x / 720)
    vertex(40 + x, y0 - A * s / (Math.abs(w(1)) || 1))
  }
  endShape()
  noStroke(); fill(235); textSize(16); textAlign(LEFT, BASELINE)
  text(recipe + ' from ' + partials + (partials > 1 ? ' sine waves' : ' sine wave'), 90, 50)
  fill(140); textSize(12); text('partial: × the first frequency', 60, 430)
  playButton(on)
}

${BUTTON}` }
      ]
    },
    {
      id: 'shaping',
      title: 'Shaping a sound',
      label: 'Shaping',
      text: 'An oscillator by itself never changes: it starts, it drones, it stops with a click. Instruments change all the time. Four tools shape a sound: an **envelope** shapes loudness over the length of a note; a **filter** takes away part of the spectrum; an **LFO** (a low-frequency oscillator, too slow to hear) moves any setting up and down; and **FM**, an oscillator fast enough to hear moving another one\'s pitch, makes new harmonics.',
      boards: [
        { id: 'envelope', title: '2.1 · Envelopes', w: 800, h: 600, ground: '#141414',
          idea: 'Hold the mouse down (or the space bar) for a note. **Attack**: how long it takes to get loud. **Decay**: how long it takes to fall to the **sustain** level, where it stays while you hold. **Release**: how long it takes to die away after you let go. A piano is a fast attack, no sustain and a long decay; a violin a slow attack; an organ is on and off. The dots are the loudness actually measured, a dot every frame, so you can compare the sound with the plan.',
          pseudo: `on press: triggerAttack    # 0 $\\to$ 1 in attack, then $\\to$ sustain in decay
while held: stay at sustain
on release: triggerRelease    # $\\to$ 0 in release
sound $\\leftarrow$ oscillator $\\times$ envelope`,
          p5: `// 2.1 Envelopes. Hold the mouse (or the space bar) for a note: attack, decay, sustain while held, release after.
const attack = 0.08 /* 0.001..2 */
const decay = 0.4 /* 0.01..2 */
const sustain = 0.4 /* 0..1 */
const release = 0.8 /* 0.01..3 */
let osc, env, meter, held = false, dots = [], last = ''

function setup() {
  createCanvas(800, 600)
  osc = new p5.Oscillator(220, 'triangle')
  osc.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  env = new p5.Envelope(attack, decay, sustain, release)
  osc.disconnect()                           // take the oscillator off the speakers…
  osc.connect(env)                           // …and send it through the envelope instead
  meter = new p5.Amplitude()
  env.connect(meter)
}

function press() { userStartAudio(); if (!osc.started) osc.start(); if (!held) { held = true; env.triggerAttack() } }
function lift() { if (held) { held = false; env.triggerRelease() } }
function mousePressed() { press() }
function mouseReleased() { lift() }
function keyPressed() { if (key === ' ') press() }
function keyReleased() { if (key === ' ') lift() }

function draw() {
  background(20)
  const adsr = [attack, decay, sustain, release].join()
  if (adsr !== last) { env.setADSR(attack, decay, sustain, release); last = adsr }

  // the plan: A, D, S (drawn as one second), R
  const total = attack + decay + 1 + release, X = t => 60 + 680 * t / total, Y = v => 300 - 220 * v
  stroke(90); strokeWeight(2); noFill()
  beginShape(); vertex(X(0), Y(0)); vertex(X(attack), Y(1)); vertex(X(attack + decay), Y(sustain))
  vertex(X(attack + decay + 1), Y(sustain)); vertex(X(total), Y(0)); endShape()
  noStroke(); fill(150); textSize(14); textAlign(CENTER)
  text('A', X(attack / 2), 325); text('D', X(attack + decay / 2), 325); text('S', X(attack + decay + 0.5), 325); text('R', X(total - release / 2), 325)

  // what was measured: a dot a frame, scrolling left
  dots.push(meter.getLevel())
  if (dots.length > 360) dots.shift()
  noStroke()
  dots.forEach((v, i) => { fill(held ? '#f2c14e' : '#c8664f'); circle(60 + i * 2, 560 - 400 * Math.min(1, v * 2.5), 4) })
  fill(140); textSize(13); textAlign(LEFT)
  text(held ? 'held: attack, decay, then sustain' : 'hold the mouse or the space bar', 60, 50)
  text('loudness, measured (last 6 seconds)', 60, 380)
}` },

        { id: 'filter', title: '2.2 · Filters', w: 800, h: 600, ground: '#141414',
          idea: 'A sawtooth has every harmonic, so it is a good thing to filter. A **low-pass** filter lets frequencies under the **cutoff** through and turns down the ones above: the sound gets darker. A **high-pass** does the opposite; a **band-pass** keeps a band around the cutoff. **Resonance** boosts the frequencies right at the cutoff, the whistle of a synth filter. The picture is the spectrum, measured: one dot for each frequency band, height in decibels, frequency on a log scale like a keyboard. Drag across the board to sweep the cutoff; up and down is resonance. This is subtractive synthesis: start bright, take away.',
          pseudo: `saw $\\to$ filter(type, cutoff, resonance) $\\to$ speakers
spectrum $\\leftarrow$ FFT of the filtered sound
draw each band at $x = \\log(f)$, $y = 20 \\log_{10}(\\text{level})$ dB`,
          p5: `// 2.2 Filters. Click ▶, then drag: left to right is the cutoff, up and down is resonance. The dots are the spectrum, measured.
const kind = 'lowpass' /* lowpass|highpass|bandpass */
const cutoff = 800 /* 40..8000 */
const resonance = 4 /* 0.1..20 */
let osc, lp, fft, on = false, fc = cutoff, q = resonance, last = {}
const fToX = f => 40 + 720 * Math.log2(f / 20) / Math.log2(20000 / 20)
const xToF = x => 20 * Math.pow(1000, (x - 40) / 720)

function setup() {
  createCanvas(800, 600)
  osc = new p5.Oscillator(110, 'sawtooth')
  osc.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  lp = new p5.Biquad(cutoff, kind)
  osc.disconnect(); osc.connect(lp)
  osc.amp(0)
  fft = new p5.FFT(2048)
  lp.connect(fft)
}

function mousePressed() { if (onButton()) { userStartAudio(); if (!osc.started) osc.start(); on = !on } }
function mouseDragged() { fc = constrain(xToF(mouseX), 30, 18000); q = map(mouseY, height, 0, 0.1, 20, true) }

function draw() {
  background(20)
  if (last.cutoff !== cutoff) fc = cutoff
  if (last.resonance !== resonance) q = resonance
  if (last.kind !== kind) lp.setType(kind)
  last = { cutoff, resonance, kind }
  lp.freq(fc); lp.res(q)
  osc.amp(on ? 0.3 : 0, 0.05)

  const s = fft.analyze(), nyq = getAudioContext().sampleRate / 2
  noStroke()
  for (let i = 1; i < s.length; i++) {
    const f = i * nyq / s.length
    if (f < 20) continue
    const db = 20 * Math.log10(s[i] + 1e-9)
    const y = map(db, -120, -20, 540, 80, true)
    fill(f < fc ? '#f2c14e' : '#5b7fd1'); circle(fToX(f), y, 3)
  }
  stroke('#c8664f'); strokeWeight(2); line(fToX(fc), 80, fToX(fc), 540)
  for (const f of [50, 100, 200, 500, 1000, 2000, 5000, 10000]) {
    noStroke(); fill(110); textSize(11); textAlign(CENTER); text(f >= 1000 ? f / 1000 + 'k' : f, fToX(f), 565)
  }
  noStroke(); fill(235); textSize(16); textAlign(LEFT)
  text(kind + ' · cutoff ' + Math.round(fc) + ' Hz · resonance ' + nf(q, 1, 1), 90, 50)
  playButton(on)
}

${BUTTON}` },

        { id: 'lfo', title: '2.3 · LFOs', w: 800, h: 600, ground: '#141414',
          idea: 'An LFO is an oscillator too slow to hear (a few times a second) used to move a setting. On **pitch** it is vibrato, on **loudness** tremolo, on a filter\'s **cutoff** a wah or a wobble. Here the LFO runs at audio rate, inside the sound engine, and is connected straight to the setting it moves: p5.sound has no call for that yet, so the sketch reaches under it: each setting is a Tone.js object around a Web Audio `AudioParam`, and `param()` finds it. The dots trace the moving setting, the way it moves.',
          pseudo: `lfo $\\leftarrow$ a slow sine (rate Hz), loudness = depth
connect lfo to one setting:
  pitch: 220 Hz $+$ lfo (vibrato)
  loudness: 1 $+$ lfo (tremolo)
  cutoff: 1200 Hz $+$ lfo (wah)`,
          p5: `// 2.3 LFOs: a slow oscillator moving a setting. Click ▶. Choose what it moves, how fast and how far.
const target = 'pitch' /* pitch|loudness|cutoff */
const rate = 5 /* 0.1..20 */
const depth = 0.5 /* 0..1 */
const RANGE = { pitch: 30, loudness: 0.9, cutoff: 1100 }      // how far depth = 1 moves each setting
let osc, lp, lfo, on = false, last = {}, trail = []
// A setting inside p5.sound is a Tone.js object; underneath is a Web Audio AudioParam, which a signal can be plugged into.
const param = p => { while (p && !(p instanceof AudioParam)) p = p.input; return p }

function setup() {
  createCanvas(800, 600)
  osc = new p5.Oscillator(220, 'sawtooth')
  osc.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  lp = new p5.Biquad(1200, 'lowpass'); lp.res(6)
  osc.disconnect(); osc.connect(lp)
  osc.amp(0)
  lfo = new p5.Oscillator(rate, 'sine')
  lfo.disconnect()                           // an LFO is never heard: off the speakers before it starts
}

function mousePressed() {
  if (!onButton()) return
  userStartAudio()
  if (!osc.started) { osc.start(); lfo.start() }
  on = !on
}

function plug(t) {                           // connect the LFO to one setting
  lfo.disconnect()
  if (t === 'pitch') lfo.connect(param(osc.node.frequency))
  if (t === 'loudness') osc.amp(lfo)        // adds the LFO to the oscillator's output level
  if (t === 'cutoff') lfo.connect(param(lp.node.frequency))
}

function draw() {
  background(20)
  if (last.target !== target) plug(target)
  if (last.rate !== rate) lfo.freq(rate, 0.1)
  if (last.target !== target || last.depth !== depth || last.on !== on) {
    lfo.amp(depth * RANGE[target], 0.05)
    osc.amp(on ? 0.3 : 0, 0.05)
  }
  last = { target, rate, depth, on }

  // the moving setting, worked out from the LFO's phase
  const v = depth * Math.sin(TWO_PI * rate * millis() / 1000)
  trail.push(v); if (trail.length > 300) trail.shift()
  const label = target === 'pitch' ? nf(220 + v * RANGE.pitch, 1, 1) + ' Hz'
    : target === 'loudness' ? nf(1 + v * RANGE.loudness, 1, 2) + ' × the level'
    : Math.round(1200 + v * RANGE.cutoff) + ' Hz cutoff'
  noStroke()
  trail.forEach((u, i) => { fill(on ? '#f2c14e' : 90); circle(60 + i * 2.3, 330 - 200 * u, 5) })
  stroke(70); line(60, 330, 750, 330)
  noStroke(); fill(235); textSize(16); textAlign(LEFT)
  text(target + ' · ' + rate + ' times a second · ' + label, 90, 50)
  fill(140); textSize(13); text(target === 'pitch' ? 'vibrato' : target === 'loudness' ? 'tremolo' : 'wah', 90, 74)
  playButton(on)
}

${BUTTON}` },

        { id: 'fm', title: '2.4 · FM synthesis', w: 800, h: 600, ground: '#141414',
          idea: 'Make the LFO fast, as fast as the sound itself, and you no longer hear vibrato: you hear a new timbre. The **modulator** moves the **carrier**\'s frequency; new partials, **sidebands**, appear at the carrier ± whole multiples of the modulator. The **ratio** (modulator / carrier) decides where they fall: whole numbers give harmonic sounds, others metallic, bell-like ones. The **index** (how far the frequency swings, divided by the modulator\'s frequency) decides how many there are and how bright. John Chowning found this at Stanford in 1967; the Yamaha DX7 made it the sound of the 1980s. The grey ticks show where the sidebands fall.',
          pseudo: `$f_m \\leftarrow$ ratio $\\cdot f_c$
modulator: $\\sin(2\\pi f_m t)$, loudness $I \\cdot f_m$ Hz
carrier's frequency $\\leftarrow f_c + I f_m \\sin(2\\pi f_m t)$
sidebands at $f_c \\pm k f_m$, $k = 1, 2, 3\\ldots$`,
          p5: `// 2.4 FM synthesis: one oscillator (the modulator) moves another's frequency (the carrier) at audio rate. Click ▶.
const carrier = 220 /* 55..880 */
const ratio = 2 /* 0.25..8 */
const index = 3 /* 0..20 */
let car, mod, fft, on = false, last = {}
// A setting inside p5.sound is a Tone.js object; underneath is a Web Audio AudioParam, which a signal can be plugged into.
const param = p => { while (p && !(p instanceof AudioParam)) p = p.input; return p }
const fToX = f => 40 + 720 * f / 5000

function setup() {
  createCanvas(800, 600)
  car = new p5.Oscillator(carrier, 'sine')
  car.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  mod = new p5.Oscillator(carrier * ratio, 'sine')
  mod.disconnect()                           // the modulator is never heard by itself
  mod.amp(0)
  mod.connect(param(car.node.frequency))     // its output is added to the carrier's frequency (in Hz)
  car.amp(0)
  fft = new p5.FFT(4096)
  car.connect(fft)
}

function mousePressed() {
  if (!onButton()) return
  userStartAudio()
  if (!car.started) { car.start(); mod.start() }
  on = !on
}

function draw() {
  background(20)
  const fm = carrier * ratio
  if (last.carrier !== carrier || last.ratio !== ratio || last.index !== index || last.on !== on) {
    car.freq(carrier, 0.05); mod.freq(fm, 0.05)
    mod.amp(index * fm, 0.05)                // how far the carrier's frequency swings
    car.amp(on ? 0.3 : 0, 0.05)
    last = { carrier, ratio, index, on }
  }
  // where the sidebands should be
  stroke(60); strokeWeight(1)
  for (let k = -12; k <= 12; k++) { const f = Math.abs(carrier + k * fm); if (f < 5000) line(fToX(f), 90, fToX(f), 530) }
  // the spectrum, measured: one dot a band, linear in frequency so the sidebands are evenly spaced
  const s = fft.analyze(), nyq = getAudioContext().sampleRate / 2
  noStroke()
  for (let i = 1; i < s.length; i++) {
    const f = i * nyq / s.length
    if (f > 5000) break
    const y = map(20 * Math.log10(s[i] + 1e-9), -120, -20, 530, 90, true)
    fill(y < 400 ? '#f2c14e' : '#5b7fd1'); circle(fToX(f), y, 3)
  }
  for (let f = 0; f <= 5000; f += 1000) { fill(110); textSize(11); textAlign(CENTER); text(f + ' Hz', fToX(f), 555) }
  fill(235); textSize(16); textAlign(LEFT)
  text('carrier ' + carrier + ' Hz · modulator ' + nf(fm, 1, 1) + ' Hz · index ' + index, 90, 50)
  fill(140); textSize(13); text(Number.isInteger(ratio) ? 'whole-number ratio: harmonic' : 'ratio ' + ratio + ': inharmonic, metallic', 90, 74)
  playButton(on)
}

${BUTTON}` }
      ]
    },
    {
      id: 'notes',
      title: 'Playing notes',
      label: 'Notes',
      text: 'With a wave, an envelope and a filter we have a **voice**: something that can play a note. Now we play it: from the computer keyboard or a MIDI keyboard, one note at a time (a mono synth); on a scale, which is a choice of notes, in a tuning, which is a choice of frequencies; and in a line, a short loop of notes that repeats.',
      boards: [
        { id: 'monosynth', title: '3.1 · A mono synth', w: 800, h: 600, ground: '#141414',
          idea: 'One voice played from the computer keys (A W S E D F T G Y H U J K… is a piano: A is C, W is C♯) or from a MIDI keyboard plugged into the computer, or by clicking the keys drawn on the board; Z and X move down and up an octave. A mono synth plays one note at a time: if you hold several, the last one wins, and letting it go falls back to the one still held (**last-note priority**). Playing a new note while one is held glides to it (**glide**, or portamento) without starting the envelope again: legato, the sound of many bass and lead lines. The chain is oscillator → filter → envelope.',
          pseudo: `held $\\leftarrow$ [ ]
note on $m$: add $m$ to held; glide to $f(m)$; if it is the only note, start the envelope
note off $m$: remove $m$; if notes are still held, glide to the last one, else release
$f(m) = 440 \\cdot 2^{(m-69)/12}$`,
          p5: `// 3.1 A mono synth. Play with the keys A W S E D F T G Y H U J K (Z, X: octave), a MIDI keyboard, or the mouse.
const shape = 'sawtooth' /* sine|triangle|sawtooth|square */
const glide = 0.06 /* 0..0.5 */
const cutoff = 1800 /* 100..8000 */
const resonance = 3 /* 0.1..15 */
const attack = 0.01 /* 0.001..1 */
const release = 0.3 /* 0.01..2 */
const KEYS = 'awsedftgyhujkolp'              // A = C, W = C♯, S = D…
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const mtof = m => 440 * Math.pow(2, (m - 69) / 12)
let osc, lp, env, scope, held = [], octave = 4, midiNote = 'MIDI: click the board to look for a keyboard', last = {}, mouseNote = null

function setup() {
  createCanvas(800, 600)
  osc = new p5.Oscillator(220, shape)
  osc.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  lp = new p5.Biquad(cutoff, 'lowpass')
  env = new p5.Envelope(attack, 0.2, 0.8, release)
  osc.disconnect(); osc.connect(lp)
  lp.disconnect(); lp.connect(env)
  scope = new p5.FFT(1024); env.connect(scope)
}

function start() {
  userStartAudio()
  if (osc.started) return
  osc.start()
  if (navigator.requestMIDIAccess) navigator.requestMIDIAccess().then(access => {
    const listen = () => { let n = 0; for (const input of access.inputs.values()) { input.onmidimessage = midi; n++ } midiNote = n ? 'MIDI: ' + n + ' keyboard' + (n > 1 ? 's' : '') : 'MIDI: no keyboard plugged in' }
    listen(); access.onstatechange = listen
  }).catch(() => { midiNote = 'MIDI: not allowed here' })
}

function midi(e) {
  const [status, m, vel] = e.data, kind = status & 0xf0
  if (kind === 0x90 && vel > 0) noteOn(m)
  else if (kind === 0x80 || kind === 0x90) noteOff(m)
}

function noteOn(m) {
  start()
  if (held.includes(m)) return
  held.push(m)
  osc.freq(mtof(m), held.length > 1 ? glide : 0)  // glide only between held notes (legato)
  if (held.length === 1) env.triggerAttack()
}
function noteOff(m) {
  held = held.filter(n => n !== m)
  if (held.length) osc.freq(mtof(held[held.length - 1]), glide)
  else env.triggerRelease()
}

function keyPressed() {
  const k = key.toLowerCase()
  if (k === 'z') octave = max(1, octave - 1)
  if (k === 'x') octave = min(7, octave + 1)
  const i = KEYS.indexOf(k)
  if (i >= 0) noteOn(12 * (octave + 1) + i)
}
function keyReleased() { const i = KEYS.indexOf(key.toLowerCase()); if (i >= 0) for (const m of [...held]) if (m % 12 === i % 12) noteOff(m) }

// the keyboard on the board: two octaves from C
const WHITE = [0, 2, 4, 5, 7, 9, 11], KX = 60, KY = 360, KW = 48, KH = 190
function keyAt(x, y) {
  for (let o = 0; o < 2; o++) for (const [j, s] of [1, 3, 6, 8, 10].entries()) {
    const bx = KX + (o * 7 + [1, 2, 4, 5, 6][j]) * KW - 15
    if (x > bx && x < bx + 30 && y > KY && y < KY + 115) return o * 12 + s
  }
  const w = Math.floor((x - KX) / KW)
  return w >= 0 && w < 14 && y > KY && y < KY + KH ? Math.floor(w / 7) * 12 + WHITE[w % 7] : null
}
function mousePressed() { start(); const k = keyAt(mouseX, mouseY); if (k !== null) { mouseNote = 12 * (octave + 1) + k; noteOn(mouseNote) } }
function mouseReleased() { if (mouseNote !== null) { noteOff(mouseNote); mouseNote = null } }

function draw() {
  background(20)
  if (last.shape !== shape) osc.setType(shape)
  if (last.cutoff !== cutoff || last.resonance !== resonance) { lp.freq(cutoff); lp.res(resonance) }
  if (last.attack !== attack || last.release !== release) env.setADSR(attack, 0.2, 0.8, release)
  last = { shape, cutoff, resonance, attack, release }

  const lit = new Set(held.map(m => m - 12 * (octave + 1)))
  for (let w = 0; w < 14; w++) {
    const s = Math.floor(w / 7) * 12 + WHITE[w % 7]
    stroke(20); fill(lit.has(s) ? '#f2c14e' : 225); rect(KX + w * KW, KY, KW, KH, 0, 0, 4, 4)
    noStroke(); fill(110); textSize(12); textAlign(CENTER); text((KEYS[s] || '').toUpperCase(), KX + w * KW + KW / 2, KY + KH - 12)
  }
  for (let o = 0; o < 2; o++) [1, 3, 6, 8, 10].forEach((s, j) => {
    const bx = KX + (o * 7 + [1, 2, 4, 5, 6][j]) * KW - 15
    noStroke(); fill(lit.has(o * 12 + s) ? '#c8664f' : 30); rect(bx, KY, 30, 115, 0, 0, 3, 3)
    fill(150); textSize(11); textAlign(CENTER); text((KEYS[o * 12 + s] || '').toUpperCase(), bx + 15, KY + 100)
  })
  // the sound
  const s = scope.waveform()
  let z = 0
  while (z < 400 && !(s[z] <= 0 && s[z + 1] > 0)) z++
  stroke('#5b7fd1'); strokeWeight(2); noFill(); beginShape()
  for (let j = 0; j < 512; j++) vertex(60 + 680 * j / 511, 230 - 110 * s[z + j])
  endShape()
  const m = held[held.length - 1]
  noStroke(); fill(235); textSize(22); textAlign(LEFT)
  text(m === undefined ? '–' : NAMES[m % 12] + (Math.floor(m / 12) - 1) + '  ' + nf(mtof(m), 1, 1) + ' Hz', 60, 60)
  fill(140); textSize(13)
  text('octave ' + octave + ' (Z, X) · held: ' + (held.length ? held.map(n => NAMES[n % 12]).join(' ') : 'nothing') + ' · ' + midiNote, 60, 86)
}` },

        { id: 'tuning', title: '3.2 · Scales and tuning', w: 800, h: 600, ground: '#141414',
          idea: 'A **scale** is a choice of notes from the twelve of an octave; a **tuning** is a choice of the frequencies those twelve have. **Equal temperament** makes every semitone the same ratio, 2^(1/12): every key is as good as any other, and no interval but the octave is pure. **Just intonation** uses small whole-number ratios (5/4 for a major third, 3/2 for a fifth): pure in one key, out of tune in others. **Pythagorean** builds everything from fifths (3/2). The bars show each note\'s distance from equal temperament in cents. Hold 3 for a major third, 5 for a fifth, 8 for an octave above the root: in equal temperament the third **beats** (a fast wobble, about 10 times a second near middle C) because its harmonics nearly but not quite meet; in just intonation it is still.',
          pseudo: `equal: $r_k = 2^{k/12}$
just: $1, \\tfrac{16}{15}, \\tfrac98, \\tfrac65, \\tfrac54, \\tfrac43, \\tfrac{45}{32}, \\tfrac32, \\tfrac85, \\tfrac53, \\tfrac95, \\tfrac{15}8$
cents$_k = 1200 \\log_2 r_k - 100k$
beating between partials $a$ and $b$: $|f_a - f_b|$ times a second`,
          p5: `// 3.2 Scales and tuning. ▶ plays the scale up and down. Hold 3, 5 or 8 for a third, a fifth or an octave over the root.
const mode = 'major' /* major|minor|dorian|pentatonic|blues|chromatic */
const tuning = 'equal' /* equal|just|pythagorean */
const root = 60 /* 48..72 */
const MODES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], dorian: [0, 2, 3, 5, 7, 9, 10], pentatonic: [0, 2, 4, 7, 9], blues: [0, 3, 5, 6, 7, 10], chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }
const RATIOS = {
  equal: [...Array(12)].map((_, k) => Math.pow(2, k / 12)),
  just: [1, 16 / 15, 9 / 8, 6 / 5, 5 / 4, 4 / 3, 45 / 32, 3 / 2, 8 / 5, 5 / 3, 9 / 5, 15 / 8],
  pythagorean: [1, 256 / 243, 9 / 8, 32 / 27, 81 / 64, 4 / 3, 729 / 512, 3 / 2, 128 / 81, 27 / 16, 16 / 9, 243 / 128]
}
const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const hz = semis => 440 * Math.pow(2, (root - 69) / 12) * Math.pow(2, Math.floor(semis / 12)) * RATIOS[tuning][((semis % 12) + 12) % 12]
let a, b, lp, env, playing = false, run = [], at = 0, next = 0, now = null, interval = null

function setup() {
  createCanvas(800, 600)
  a = new p5.Oscillator(261, 'sawtooth'); b = new p5.Oscillator(392, 'sawtooth')
  a.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  lp = new p5.Biquad(2500, 'lowpass'); env = new p5.Envelope(0.02, 0.1, 0.9, 0.3)
  for (const o of [a, b]) { o.disconnect(); o.connect(lp) }
  lp.disconnect(); lp.connect(env)
  b.amp(0)
  setInterval(tick, 5)
}

function start() { userStartAudio(); if (!a.started) { a.start(); b.start() } }
function mousePressed() {
  if (!onButton()) return
  start(); playing = !playing
  const up = [...MODES[mode], 12]
  run = [...up, ...up.slice(0, -1).reverse()]
  at = 0; next = millis()
  if (!playing) { env.triggerRelease(); now = null }
}
function tick() {                            // a note every 250 ms while the scale plays
  if (!playing || millis() < next) return
  now = run[at % run.length]; at++
  a.freq(hz(now)); env.triggerAttack()
  next += 250
}
function keyPressed() {
  const k = { 3: 4, 5: 7, 8: 12 }[key]
  if (k === undefined) return
  start(); playing = false; interval = k; now = 0
  a.freq(hz(0)); b.freq(hz(k)); b.amp(0.5, 0.02); env.triggerAttack()
}
function keyReleased() { if (interval !== null) { env.triggerRelease(); b.amp(0, 0.3); interval = null; now = null } }

function draw() {
  background(20)
  const inScale = new Set(MODES[mode])
  for (let k = 0; k < 12; k++) {
    const x = 60 + k * 58, cents = 1200 * Math.log2(RATIOS[tuning][k]) - 100 * k
    const lit = now !== null && ((now % 12) === k || (interval !== null && interval % 12 === k))
    noStroke(); fill(lit ? '#f2c14e' : inScale.has(k) ? '#c8664f' : 50); circle(x + 20, 200, inScale.has(k) ? 36 : 20)
    fill(inScale.has(k) ? 235 : 110); textSize(14); textAlign(CENTER)
    text(NAMES[(root + k) % 12], x + 20, 260)
    fill(cents >= 0 ? '#f2c14e' : '#5b7fd1'); rect(x + 10, 420, 20, -cents * 6)
    fill(130); textSize(11); text((cents > 0 ? '+' : '') + nf(cents, 1, 1), x + 20, 520)
  }
  stroke(70); line(60, 420, 760, 420)
  noStroke(); fill(235); textSize(16); textAlign(LEFT)
  text(NAMES[root % 12] + ' ' + mode + ', ' + tuning + ' temperament', 90, 50)
  fill(140); textSize(13)
  text('cents away from equal temperament (100 cents = a semitone)', 60, 560)
  if (interval) {
    const n = interval === 4 ? [5, 4] : interval === 7 ? [3, 2] : [2, 1]   // the partials that nearly meet
    text('beating: ' + nf(Math.abs(n[0] * hz(0) - n[1] * hz(interval)), 1, 2) + ' times a second', 90, 74)
  }
  playButton(playing)
}

${BUTTON}` },

        { id: 'line', title: '3.3 · A basic line', w: 800, h: 600, ground: '#141414',
          idea: 'Sixteen steps, a note or a rest on each, looping: a bass line. Click the grid to write notes (one per step; click a note again to rest). Each note opens the filter and lets it close again: **envelope amount** is how far it opens, **decay** how fast it closes, and the line starts to talk. That moving filter, more than the notes, is the sound of acid house and of most synth bass. The timer ticks every 5 ms and plays a step when its time comes; the gate (how long a note is held) is 60% of a step.',
          pseudo: `every 16th note:
  $n \\leftarrow$ pattern[step]; if $n$ is a rest, release
  else: frequency $\\leftarrow f(\\text{root} + n)$; cutoff $\\leftarrow$ cutoff $+$ amount; attack
  after 60% of a step: release
cutoff decays towards its resting value: $c \\leftarrow c_0 + (c - c_0)\\, e^{-\\Delta t / \\text{decay}}$`,
          p5: `// 3.3 A basic line: 16 steps, looping. Click ▶; click the grid to write notes. Each note opens the filter, which closes again.
const tempo = 116 /* 60..180 */
const root = 36 /* 28..48 */
const cutoff = 300 /* 80..3000 */
const envAmount = 2400 /* 0..6000 */
const decay = 0.15 /* 0.02..1 */
const glide = 0.02 /* 0..0.2 */
const ROWS = 13, CW = 42, CH = 26, GX = 60, GY = 120
let pattern = [0, null, 0, 12, null, 0, 10, null, 0, null, 7, 0, 3, null, 5, 7]
let osc, lp, env, on = false, at = -1, next = 0, off = Infinity, fc = 300, lastT = 0

function setup() {
  createCanvas(800, 600)
  osc = new p5.Oscillator(65, 'sawtooth'); osc.amp(0.3)
  osc.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  lp = new p5.Biquad(cutoff, 'lowpass'); lp.res(8)
  env = new p5.Envelope(0.005, 0.1, 0.8, 0.05)
  osc.disconnect(); osc.connect(lp); lp.disconnect(); lp.connect(env)
  setInterval(tick, 5)
}

function tick() {
  const t = millis()
  fc = cutoff + (fc - cutoff) * Math.exp(-(t - lastT) / 1000 / decay)   // the filter closes
  lastT = t
  lp.freq(fc)
  if (!on) return
  if (t >= off) { env.triggerRelease(); off = Infinity }
  if (t < next) return
  const sixteenth = 60000 / tempo / 4
  at = (at + 1) % 16
  const n = pattern[at]
  if (n !== null) {
    osc.freq(440 * Math.pow(2, (root + n - 69) / 12), glide)
    fc = cutoff + envAmount                    // the filter opens
    env.triggerAttack(); off = t + 0.6 * sixteenth
  }
  next += sixteenth
}

function mousePressed() {
  userStartAudio()
  if (onButton()) { if (!osc.started) osc.start(); on = !on; at = -1; next = millis(); if (!on) env.triggerRelease(); return }
  const c = Math.floor((mouseX - GX) / CW), r = ROWS - 1 - Math.floor((mouseY - GY) / CH)
  if (c >= 0 && c < 16 && r >= 0 && r < ROWS) pattern[c] = pattern[c] === r ? null : r
}

function draw() {
  background(20)
  const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
  noStroke()
  for (let r = 0; r < ROWS; r++) {
    fill(110); textSize(11); textAlign(RIGHT, CENTER)
    text(NAMES[(root + r) % 12], GX - 8, GY + (ROWS - 1 - r) * CH + CH / 2)
    for (let c = 0; c < 16; c++) {
      const x = GX + c * CW + CW / 2, y = GY + (ROWS - 1 - r) * CH + CH / 2
      if (pattern[c] === r) { fill(c === at && on ? '#f2c14e' : '#c8664f'); circle(x, y, 20) }
      else { fill(c === at && on ? 70 : c % 4 ? 38 : 52); circle(x, y, 6) }
    }
  }
  // the filter's cutoff, as a bar
  fill('#5b7fd1'); rect(GX, 500, 672 * Math.min(1, fc / 8000), 10)
  fill(140); textSize(13); textAlign(LEFT, BASELINE)
  text('cutoff ' + Math.round(fc) + ' Hz', GX, 535)
  fill(235); textSize(16); text('16 steps at ' + tempo + ' BPM', 90, 50)
  playButton(on)
}

${BUTTON}` }
      ]
    },
    {
      id: 'drums',
      title: 'Noise and drums',
      label: 'Drums',
      text: '**Noise** is a sound with no pattern at all: every sample a random number. It has every frequency at once, so a filter can carve anything out of it: wind, surf, breath, the snap of a snare. A drum machine needs no recordings: a falling sine is a kick, a burst of noise with a tone in it a snare, a click of high noise a hi-hat. Each is a few lines of code.',
      boards: [
        { id: 'noise', title: '4.1 · Noise', w: 800, h: 600, ground: '#141414',
          idea: '**White** noise has the same energy at every frequency: it sounds bright, like steam. **Pink** noise falls by 3 dB an octave, the same energy in every octave, closer to rain. **Brown** (Brownian, a random walk) falls by 6 dB an octave, a low rumble. Filter it: a low-pass on brown noise, its loudness swelling slowly, is surf; a band-pass swept by hand is wind. The bottom row of dots is the noise itself, sample by sample; the top is its spectrum.',
          pseudo: `white: each sample $\\sim$ uniform$(-1, 1)$
brown: $x \\leftarrow x + $ a small random step (a random walk)
noise $\\to$ filter $\\to$ speakers
surf: loudness $\\leftarrow 1 - s\\,\\tfrac{1 + \\sin(0.8 t)}{2}$`,
          p5: `// 4.1 Noise: white, pink, brown, through a filter. Click ▶; drag across the board to sweep the filter.
const noiseColor = 'brown' /* white|pink|brown */
const filterType = 'lowpass' /* lowpass|highpass|bandpass */
const cutoff = 1200 /* 40..12000 */
const resonance = 1 /* 0.1..15 */
const surf = 0.6 /* 0..1 */
let hiss, lp, fft, on = false, fc = cutoff, last = {}
const fToX = f => 40 + 720 * Math.log2(f / 20) / Math.log2(1000)
const xToF = x => 20 * Math.pow(1000, (x - 40) / 720)

function setup() {
  createCanvas(800, 600)
  hiss = new p5.Noise(noiseColor)
  hiss.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  lp = new p5.Biquad(cutoff, filterType)
  hiss.disconnect(); hiss.connect(lp)
  hiss.amp(0)
  fft = new p5.FFT(2048); lp.connect(fft)
}

function mousePressed() { if (onButton()) { userStartAudio(); if (!hiss.started) hiss.start(); on = !on } }
function mouseDragged() { fc = constrain(xToF(mouseX), 30, 18000) }

function draw() {
  background(20)
  if (last.noiseColor !== noiseColor) hiss.type(noiseColor)
  if (last.filterType !== filterType) lp.setType(filterType)
  if (last.cutoff !== cutoff) fc = cutoff
  last = { noiseColor, filterType, cutoff }
  lp.freq(fc); lp.res(resonance)
  const swell = 1 - surf * (1 + Math.sin(0.8 * millis() / 1000)) / 2   // slow waves of loudness
  hiss.amp(on ? 0.5 * swell : 0, 0.05)

  const s = fft.analyze(), nyq = getAudioContext().sampleRate / 2
  noStroke()
  for (let i = 1; i < s.length; i++) {
    const f = i * nyq / s.length
    if (f < 20) continue
    fill('#f2c14e'); circle(fToX(f), map(20 * Math.log10(s[i] + 1e-9), -110, -10, 360, 80, true), 2.5)
  }
  stroke('#c8664f'); strokeWeight(2); line(fToX(fc), 80, fToX(fc), 360)
  // the samples themselves
  const w = fft.waveform()
  noStroke(); fill('#5b7fd1')
  for (let j = 0; j < 360; j++) circle(40 + j * 2, 480 - 90 * w[j], 3)
  fill(235); textSize(16); textAlign(LEFT)
  text(noiseColor + ' noise · ' + filterType + ' at ' + Math.round(fc) + ' Hz', 90, 50)
  fill(140); textSize(13); text('spectrum', 40, 385); text('360 samples (' + nf(360 / getAudioContext().sampleRate * 1000, 1, 1) + ' ms)', 40, 590)
  playButton(on)
}

${BUTTON}` },

        { id: 'percussion', title: '4.2 · Percussion', w: 800, h: 600, ground: '#141414',
          idea: 'Four drums from nothing but oscillators and noise. Press 1, 2, 3, 4 or click the pads. **Kick**: a sine whose pitch falls fast (from 160 to 45 Hz in a tenth of a second) under a short envelope: the fall is the thump. **Snare**: high-passed noise for the wires, plus a short triangle for the drum\'s body. **Hi-hat**: very high noise, very short. **Clap**: band-passed noise, three quick bursts then a tail, like several hands not quite together. Each envelope has no sustain, so a drum ends by itself: its sound is all attack and decay.',
          pseudo: `kick: $f \\leftarrow 160 \\to 45$ Hz in 0.08 s; envelope decay kickDecay
snare: noise $\\to$ high-pass 1500 Hz, and a triangle at 185 Hz, both short
hat: noise $\\to$ high-pass 7000 Hz, decay hatDecay
clap: noise $\\to$ band-pass 1100 Hz, triggered 3 times 12 ms apart`,
          p5: `// 4.2 Percussion from oscillators and noise. Press 1 2 3 4 or click the pads.
const kickFrom = 160 /* 60..400 */
const kickTo = 45 /* 30..120 */
const kickDecay = 0.35 /* 0.05..1.5 */
const snareDecay = 0.18 /* 0.03..0.6 */
const hatDecay = 0.05 /* 0.01..0.5 */
const PADS = ['kick', 'snare', 'hat', 'clap']
let kick, kickEnv, hiss, snareHP, snareEnv, body, bodyEnv, hatHP, hatEnv, clapBP, clapEnv, scope, flash = [0, 0, 0, 0], last = ''

function voice(src, envelope) { src.disconnect(); src.connect(envelope); return envelope }
function setup() {
  createCanvas(800, 600)
  kick = new p5.Oscillator(kickFrom, 'sine'); kickEnv = voice(kick, new p5.Envelope(0.001, kickDecay, 0, 0.05))
  kick.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  body = new p5.Oscillator(185, 'triangle'); bodyEnv = voice(body, new p5.Envelope(0.001, 0.08, 0, 0.05))
  hiss = new p5.Noise('white'); hiss.disconnect(); hiss.amp(0.35)   // one noise, three filters
  snareHP = new p5.Biquad(1500, 'highpass'); hatHP = new p5.Biquad(7000, 'highpass'); clapBP = new p5.Biquad(1100, 'bandpass')
  for (const f of [snareHP, hatHP, clapBP]) hiss.connect(f)
  snareEnv = voice(snareHP, new p5.Envelope(0.001, snareDecay, 0, 0.05))
  hatEnv = voice(hatHP, new p5.Envelope(0.001, hatDecay, 0, 0.02))
  clapEnv = voice(clapBP, new p5.Envelope(0.001, 0.15, 0, 0.05))
  hatHP.res(1); clapBP.res(2)
  scope = new p5.FFT(1024)
  for (const e of [kickEnv, bodyEnv, snareEnv, hatEnv, clapEnv]) e.connect(scope)
}

function start() { userStartAudio(); if (!kick.started) { kick.start(); body.start(); hiss.start() } }
function hit(i) {
  start(); flash[i] = 1
  if (i === 0) { kick.freq(kickFrom); kick.freq(kickTo, 0.08); kickEnv.triggerAttack() }
  if (i === 1) { snareEnv.triggerAttack(); bodyEnv.triggerAttack() }
  if (i === 2) hatEnv.triggerAttack()
  if (i === 3) { clapEnv.triggerAttack(); setTimeout(() => clapEnv.triggerAttack(), 12); setTimeout(() => clapEnv.triggerAttack(), 24) }
}
function keyPressed() { const i = '1234'.indexOf(key); if (i >= 0) hit(i) }
function mousePressed() { for (let i = 0; i < 4; i++) if (dist(mouseX, mouseY, 130 + i * 180, 220) < 70) hit(i) }

function draw() {
  background(20)
  const settings = [kickDecay, snareDecay, hatDecay].join()
  if (settings !== last) {
    kickEnv.setADSR(0.001, kickDecay, 0, 0.05); snareEnv.setADSR(0.001, snareDecay, 0, 0.05); hatEnv.setADSR(0.001, hatDecay, 0, 0.02)
    last = settings
  }
  PADS.forEach((p, i) => {
    noStroke(); fill(lerpColor(color(45), color('#f2c14e'), flash[i])); circle(130 + i * 180, 220, 130)
    fill(flash[i] > 0.5 ? 20 : 220); textSize(16); textAlign(CENTER, CENTER); text(p + '\\n' + (i + 1), 130 + i * 180, 220)
    flash[i] *= 0.88
  })
  const s = scope.waveform()
  noStroke(); fill('#5b7fd1')
  for (let j = 0; j < s.length; j += 2) circle(40 + 720 * j / s.length, 460 - 100 * s[j], 2.5)
  fill(140); textSize(13); textAlign(LEFT, BASELINE); text('the last ' + nf(1024 / getAudioContext().sampleRate * 1000, 1, 1) + ' ms', 40, 585)
}` }
      ]
    },
    {
      id: 'time',
      title: 'Sequencing and rhythm',
      label: 'Rhythm',
      text: 'A **sequencer** plays sounds at set times: a grid of steps, a clock that walks along it, and on each step whatever is switched on. The clock\'s speed is the **tempo**, in beats per minute; a step is usually a sixteenth note, four to a beat. Rhythm is then a pattern of on and off. Two boards: a drum machine grid with a few classic beats, and rhythms made by a rule (Euclid\'s, it turns out) that spreads hits as evenly as possible, with swing.',
      boards: [
        { id: 'sequencer', title: '5.1 · A step sequencer', w: 800, h: 600, ground: '#141414',
          idea: 'The drums of 4.2 on a 16-step grid. Click a dot to switch a step on or off; choose a preset to load a beat. **Four on the floor**: a kick on every beat (disco, house). **Backbeat**: snare on beats 2 and 4 (rock, pop, soul). **Half-time**: the snare only on beat 3, which feels half as fast at the same tempo. **Breakbeat**: a syncopated kick, after the drum breaks hip-hop was built on. The four dots in each row that are a little brighter are the beats.',
          pseudo: `every 16th note ($60000 / \\text{tempo} / 4$ ms):
  step $\\leftarrow$ (step $+ 1$) mod 16
  for each row: if grid[row][step] is on, play the row's drum`,
          p5: `// 5.1 A step sequencer: the drums of 4.2 on a 16-step grid. Click ▶; click dots to change the beat.
const preset = 'four on the floor' /* four on the floor|backbeat|half-time|breakbeat|empty */
const tempo = 120 /* 60..180 */
const PRESETS = {
  'four on the floor': ['x...x...x...x...', '....x.......x...', '..x...x...x...x.', '................'],
  backbeat: ['x.......x.x.....', '....x.......x...', 'x.x.x.x.x.x.x.x.', '................'],
  'half-time': ['x.........x.....', '........x.......', 'x.x.x.x.x.x.x.x.', '............x...'],
  breakbeat: ['x.x.......x..x..', '....x..x.x..x..x', 'x.x.x.x.x.x.x.x.', '................'],
  empty: ['................', '................', '................', '................']
}
const ROWS = ['kick', 'snare', 'hat', 'clap']
let grid, at = -1, next = 0, on = false, shown = ''
let kick, kickEnv, hiss, snareEnv, bodyEnv, body, hatEnv, clapEnv

function voice(src, envelope) { src.disconnect(); src.connect(envelope); return envelope }
function setup() {
  createCanvas(800, 600)
  kick = new p5.Oscillator(160, 'sine'); kickEnv = voice(kick, new p5.Envelope(0.001, 0.35, 0, 0.05))
  kick.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  body = new p5.Oscillator(185, 'triangle'); bodyEnv = voice(body, new p5.Envelope(0.001, 0.08, 0, 0.05))
  hiss = new p5.Noise('white'); hiss.disconnect(); hiss.amp(0.35)
  const snareHP = new p5.Biquad(1500, 'highpass'), hatHP = new p5.Biquad(7000, 'highpass'), clapBP = new p5.Biquad(1100, 'bandpass')
  for (const f of [snareHP, hatHP, clapBP]) hiss.connect(f)
  snareEnv = voice(snareHP, new p5.Envelope(0.001, 0.18, 0, 0.05))
  hatEnv = voice(hatHP, new p5.Envelope(0.001, 0.05, 0, 0.02))
  clapEnv = voice(clapBP, new p5.Envelope(0.001, 0.15, 0, 0.05))
  setInterval(tick, 5)
}

function play(row) {
  if (row === 0) { kick.freq(160); kick.freq(45, 0.08); kickEnv.triggerAttack() }
  if (row === 1) { snareEnv.triggerAttack(); bodyEnv.triggerAttack() }
  if (row === 2) hatEnv.triggerAttack()
  if (row === 3) { clapEnv.triggerAttack(); setTimeout(() => clapEnv.triggerAttack(), 12); setTimeout(() => clapEnv.triggerAttack(), 24) }
}
function tick() {
  if (!on || millis() < next) return
  at = (at + 1) % 16
  for (let r = 0; r < 4; r++) if (grid[r][at]) play(r)
  next += 60000 / tempo / 4
}

function mousePressed() {
  userStartAudio()
  if (onButton()) { if (!kick.started) { kick.start(); body.start(); hiss.start() } on = !on; at = -1; next = millis(); return }
  const c = Math.floor((mouseX - 140) / 40), r = Math.floor((mouseY - 150) / 80)
  if (c >= 0 && c < 16 && r >= 0 && r < 4) grid[r][c] = !grid[r][c]
}

function draw() {
  background(20)
  if (preset !== shown) { grid = PRESETS[preset].map(row => [...row].map(ch => ch === 'x')); shown = preset }
  noStroke()
  for (let r = 0; r < 4; r++) {
    fill(170); textSize(14); textAlign(RIGHT, CENTER); text(ROWS[r], 120, 190 + r * 80)
    for (let c = 0; c < 16; c++) {
      const x = 160 + c * 40, y = 190 + r * 80, now = on && c === at
      if (grid[r][c]) { fill(now ? '#f2c14e' : '#c8664f'); circle(x, y, now ? 30 : 24) }
      else { fill(now ? 90 : c % 4 ? 45 : 75); circle(x, y, 8) }
    }
  }
  fill(235); textSize(16); textAlign(LEFT, BASELINE); text(preset + ' at ' + tempo + ' BPM', 90, 50)
  fill(140); textSize(13); text('beat ' + (at < 0 ? '–' : Math.floor(at / 4) + 1) + ' · step ' + (at + 1), 90, 74)
  playButton(on)
}

${BUTTON}` },

        { id: 'rhythm', title: '5.2 · Euclidean rhythms and swing', w: 800, h: 600, ground: '#141414',
          idea: 'Spread k hits over n steps as evenly as you can and you get, as Godfried Toussaint showed in 2005, rhythms that musicians found long ago: 3 over 8 is the Cuban tresillo, 5 over 8 the cinquillo, 7 over 12 a West African bell pattern, 5 over 16 the bossa nova. Each ring is one drum with its own length; when the lengths differ, the rings drift against one another and meet again only after their least common multiple of steps (**polymeter**). **Turn** rotates the snare\'s ring. **Swing** delays every second sixteenth: at 0 the time is straight; at about 0.33 the pairs are long-short, two to one, like a shuffle.',
          pseudo: `hit$(i) \\iff ((i + \\text{turn}) \\cdot k) \\bmod n < k$    # k hits spread over n steps
every 16th note: for each ring, play if hit(step mod its n)
swing: even steps last $(1 + s)$, odd steps $(1 - s)$ sixteenths`,
          p5: `// 5.2 Euclidean rhythms and swing: k hits spread evenly over n steps, one ring a drum. Click ▶.
const kickHits = 3 /* 0..16 */
const kickSteps = 8 /* 1..16 */
const snareHits = 2 /* 0..16 */
const snareSteps = 7 /* 1..16 */
const hatHits = 5 /* 0..16 */
const hatSteps = 16 /* 1..16 */
const turn = 2 /* 0..15 */
const swing = 0 /* 0..0.5 */
const tempo = 110 /* 60..180 */
const hitAt = (i, k, n, r = 0) => k > 0 && (((i + r) * Math.min(k, n)) % n) < Math.min(k, n)
let count = -1, next = 0, on = false, kick, kickEnv, hiss, snareEnv, hatEnv, flash = [0, 0, 0]

function voice(src, envelope) { src.disconnect(); src.connect(envelope); return envelope }
function setup() {
  createCanvas(800, 600)
  kick = new p5.Oscillator(160, 'sine'); kickEnv = voice(kick, new p5.Envelope(0.001, 0.3, 0, 0.05))
  kick.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  hiss = new p5.Noise('white'); hiss.disconnect(); hiss.amp(0.35)
  const snareHP = new p5.Biquad(1500, 'highpass'), hatHP = new p5.Biquad(7000, 'highpass')
  hiss.connect(snareHP); hiss.connect(hatHP)
  snareEnv = voice(snareHP, new p5.Envelope(0.001, 0.16, 0, 0.05))
  hatEnv = voice(hatHP, new p5.Envelope(0.001, 0.04, 0, 0.02))
  setInterval(tick, 5)
}

const rings = () => [[kickHits, kickSteps, 0], [snareHits, snareSteps, turn], [hatHits, hatSteps, 0]]
function tick() {
  if (!on || millis() < next) return
  count++
  rings().forEach(([k, n, r], j) => {
    if (!hitAt(count % n, k, n, r)) return
    flash[j] = 1
    if (j === 0) { kick.freq(160); kick.freq(45, 0.08); kickEnv.triggerAttack() }
    if (j === 1) snareEnv.triggerAttack()
    if (j === 2) hatEnv.triggerAttack()
  })
  next += 60000 / tempo / 4 * (count % 2 ? 1 - swing : 1 + swing)   // swing: long, short, long, short
}

function mousePressed() {
  if (!onButton()) return
  userStartAudio()
  if (!kick.started) { kick.start(); hiss.start() }
  on = !on; count = -1; next = millis()
}

function draw() {
  background(20)
  const COLORS = ['#c8664f', '#f2c14e', '#5b7fd1']
  rings().forEach(([k, n, r], j) => {
    const R = 230 - j * 65, cx = 470, cy = 310
    noFill(); stroke(40); strokeWeight(1); circle(cx, cy, 2 * R)
    for (let i = 0; i < n; i++) {
      const a = -HALF_PI + TWO_PI * i / n, x = cx + R * Math.cos(a), y = cy + R * Math.sin(a)
      const now = on && count >= 0 && count % n === i
      noStroke(); fill(hitAt(i, k, n, r) ? COLORS[j] : 55)
      circle(x, y, (hitAt(i, k, n, r) ? 22 : 9) + (now ? 10 : 0))
    }
    flash[j] *= 0.9
    fill(lerpColor(color(40), color(COLORS[j]), flash[j])); circle(cx, cy, 24 + 30 * (2 - j))
  })
  noStroke(); fill(235); textSize(16); textAlign(LEFT, BASELINE)
  text('kick ' + kickHits + '/' + kickSteps + ' · snare ' + snareHits + '/' + snareSteps + ' (turned ' + turn + ') · hat ' + hatHits + '/' + hatSteps, 90, 50)
  fill(140); textSize(13); text('swing ' + nf(swing, 1, 2) + ' · ' + tempo + ' BPM', 90, 74)
  fill(COLORS[0]); text('kick, outer', 40, 520); fill(COLORS[1]); text('snare, middle', 40, 540); fill(COLORS[2]); text('hat, inner', 40, 560)
  playButton(on)
}

${BUTTON}` }
      ]
    },
    {
      id: 'listening',
      title: 'Listening',
      label: 'Listening',
      text: 'So far we made sound and measured it. Now we measure sound from outside: the **microphone**, or a **sound file** dropped on the board. Recordings to start with are in the studio\'s samples: two of the first ever made, Edison cylinders from London in 1888, and from the Voyager Golden Record of 1977, the greetings in 55 languages, with the sound of interstellar space that Voyager 1 sent back in 2013. The tools are the ones we already used to draw: an **amplitude** follower (how loud), and the **FFT** (fast Fourier transform), which splits the last few thousand samples into frequency bands, the additive synthesis of 1.3 run backwards. From those few numbers come the rest: bass, mids and treble; **brightness** (the spectral centroid, the spectrum\'s centre of mass); **onsets** (the moments a new sound starts, where the spectrum suddenly grows). The microphone is never sent to the speakers: that would feed back.',
      boards: [
        { id: 'listen', title: '6.1 · Listening: spectrum and spectrogram', w: 800, h: 600, ground: '#141414',
          idea: 'Click to play a recording: **speech** is Arthur Sullivan talking to Edison on a wax cylinder in 1888, **music** is *The Lost Chord* on piano and cornet from the same year, two of the earliest recordings that survive. **greetings** is the Voyager Golden Record\'s hello in 55 languages (1977), each voice a different pattern of harmonics; **space** is Voyager 1\'s plasma wave instrument in interstellar space (2012–13), a tone that rises as the plasma gets denser; **jupiter** is Jupiter\'s magnetic field heard by Voyager in 1979; **mars** is a meteoroid hitting Mars, felt by InSight\'s seismometer in 2021 and sped up until we can hear it. All public domain, in Assets › Samples. Or set the input to **mic** and click to listen to the microphone (the browser asks first), or to **file** and drop an audio file on the board. Click again to pause. At the top, the spectrum now: one dot a band, frequency on a log scale, height in decibels. In the middle, the **spectrogram**: the same spectrum every frame as one column of colour, scrolling left, time across, frequency up, loudness as brightness. Speech shows its harmonics as stacked lines that move together, whistling a single line, a clap a vertical stripe. At the bottom the numbers a sketch can use: level, bass, mid, treble and brightness.',
          pseudo: `fft $\\leftarrow$ FFT(2048); mic $\\to$ fft (not to the speakers)
every frame:
  $S \\leftarrow$ fft.analyze()    # 1024 bands, $0 \\ldots f_s/2$
  spectrum: a dot per band at $(\\log f, 20\\log_{10} S)$
  spectrogram: shift left one pixel, draw $S$ as a column
  centroid $\\leftarrow \\sum f_i S_i / \\sum S_i$`,
          p5: `// 6.1 Listening. Click to play a recording (speech or music), to listen to the microphone (mic), or drop an audio file (file).
const input = 'speech' /* speech|music|greetings|space|jupiter|mars|mic|file */
const floor = -110 /* -140..-60 */
// Public-domain recordings (in the studio: Assets › Samples; elsewhere, upload the files beside the sketch):
// two Edison wax cylinders (1888), the Voyager Golden Record's greetings (1977), Voyager in interstellar space (2012–13) and at Jupiter (1979), InSight on Mars (2021)
const RECORDINGS = { speech: () => loadSound('edison-sullivan.mp3'), music: () => loadSound('edison-lost-chord.mp3'), greetings: () => loadSound('voyager-greetings.mp3'), space: () => loadSound('voyager-interstellar-plasma.mp3'), jupiter: () => loadSound('voyager-jupiter-magnetic-waves.mp3'), mars: () => loadSound('insight-mars-impact.mp3') }
const NAMES_OF = { speech: 'Arthur Sullivan speaking to Edison, 1888', music: 'The Lost Chord, piano and cornet, 1888', greetings: 'Voyager Golden Record: greetings in 55 languages, 1977', space: 'Interstellar plasma, heard by Voyager 1, 2012–13', jupiter: 'Jupiter’s magnetic waves, heard by Voyager, 1979', mars: 'A meteoroid hitting Mars, heard by InSight, 2021' }
let mic, file = null, loaded = '', fft, meter, spec, status = ''
const fToY = (f, top, h) => top + h - h * Math.log2(f / 40) / Math.log2(16000 / 40)   // 40 Hz to 16 kHz, log
const fToX = f => 40 + 720 * Math.log2(f / 40) / Math.log2(16000 / 40)

function setup() {
  createCanvas(800, 600)
  fft = new p5.FFT(2048)
  meter = new p5.Amplitude(0.8)
  mic = new p5.AudioIn()
  mic.disconnect()                           // never send the microphone to the speakers: it would feed back
  mic.connect(fft); mic.connect(meter)
  spec = createGraphics(720, 250); spec.background(10); spec.noStroke()
  addEventListener('dragover', e => e.preventDefault())
  addEventListener('drop', e => {              // a sound file dropped on the board
    e.preventDefault()
    const f = e.dataTransfer.files[0]
    if (f) playFile(loadSound(URL.createObjectURL(f)), f.name)
  })
}

async function playFile(loading, name) {
  userStartAudio(); status = 'loading ' + name; loaded = name
  if (file) file.stop()
  file = await loading
  file.connect(fft); file.connect(meter)       // (a file also goes to the speakers)
  file.loop(); file.play(); status = name
}

function mousePressed() {
  userStartAudio()
  if (input === 'mic') { if (!mic.started) mic.start(); return }
  if (RECORDINGS[input] && loaded !== NAMES_OF[input]) playFile(RECORDINGS[input](), NAMES_OF[input])
  else if (file) file.isPlaying() ? file.pause() : file.play()
}

function draw() {
  background(20)
  const S = fft.analyze(), nyq = getAudioContext().sampleRate / 2, df = nyq / S.length
  const db = i => 20 * Math.log10(S[i] + 1e-12)
  // the spectrum now
  noStroke(); fill('#f2c14e')
  for (let i = 1; i < S.length; i++) { const f = i * df; if (f > 40 && f < 16000) circle(fToX(f), map(db(i), floor, -20, 230, 80, true), 2.5) }
  // the spectrogram: shift left a pixel, add a column on the right
  spec.copy(spec, 1, 0, 719, 250, 0, 0, 719, 250)
  for (let y = 0; y < 250; y++) {
    const f = 40 * Math.pow(16000 / 40, (250 - y) / 250), v = map(db(Math.round(f / df)), floor, -30, 0, 1, true)
    spec.fill(255 * v, 180 * v * v, 90 * v * v * v); spec.rect(719, y, 1, 1)
  }
  image(spec, 40, 250)
  // the numbers
  let sum = 0, weighted = 0
  const band = (lo, hi) => { let e = 0; for (let i = Math.ceil(lo / df); i <= hi / df; i++) e += S[i]; return e }
  for (let i = 1; i < S.length; i++) { sum += S[i]; weighted += i * df * S[i] }
  const centroid = sum > 0 ? weighted / sum : 0, level = meter.getLevel()
  const parts = [['level', level * 3], ['bass', band(40, 250) * 3], ['mid', band(250, 2000) * 1.5], ['treble', band(2000, 12000)]]
  parts.forEach(([name, v], j) => {
    fill(45); rect(40 + j * 150, 540, 130, 12); fill('#c8664f'); rect(40 + j * 150, 540, 130 * Math.min(1, v), 12)
    fill(150); textSize(12); textAlign(LEFT); text(name, 40 + j * 150, 532)
  })
  fill(150); text('brightness ' + Math.round(centroid) + ' Hz', 640, 532)
  if (centroid > 40) { stroke('#5b7fd1'); strokeWeight(2); line(fToX(centroid), 80, fToX(centroid), 235); noStroke() }
  fill(235); textSize(16)
  const what = input === 'mic' ? (mic.started ? 'listening to the microphone' : 'click to listen to the microphone')
    : file && loaded === (NAMES_OF[input] || loaded) ? status + (file.isPlaying() ? '' : ' (paused: click)')
    : RECORDINGS[input] ? 'click to play: ' + NAMES_OF[input] : 'drop an audio file on the board'
  text(what, 40, 50)
}` },

        { id: 'listenpicture', title: '6.2 · A picture that listens', w: 800, h: 600, ground: '#141414',
          idea: 'The numbers of 6.1, drawn. **Bass** swells the warm disc in the middle; **mids** spin a ring of dots; **treble** scatters small specks; **brightness** sets the colour; each **onset** throws a ring of dots outwards. Onsets are found by **spectral flux**: how much the spectrum grew since the last frame, added over every band; when it jumps well above its recent average, something new has started. Old dots fade under a dark veil, so the board keeps a short memory of the sound. It starts on the 1888 *Lost Chord*; set the input to speech, to mic (then sing or clap), or to file and drop one.',
          pseudo: `flux $\\leftarrow \\sum_i \\max(0, S_i - S^{\\text{prev}}_i)$
average $\\leftarrow 0.95\\,$average $+ 0.05\\,$flux
onset if flux $> 1.5 \\times$ average and 150 ms since the last
bass $\\to$ disc size; mid $\\to$ ring; treble $\\to$ specks; centroid $\\to$ hue; onset $\\to$ a burst`,
          p5: `// 6.2 A picture that listens. Click to play a recording (music or speech), listen to the microphone (mic), or drop a file (file).
const input = 'music' /* music|speech|greetings|space|jupiter|mars|mic|file */
// Public-domain recordings (in the studio: Assets › Samples; elsewhere, upload the files beside the sketch):
// two Edison wax cylinders (1888), the Voyager Golden Record's greetings (1977), Voyager in interstellar space (2012–13) and at Jupiter (1979), InSight on Mars (2021)
const RECORDINGS = { speech: () => loadSound('edison-sullivan.mp3'), music: () => loadSound('edison-lost-chord.mp3'), greetings: () => loadSound('voyager-greetings.mp3'), space: () => loadSound('voyager-interstellar-plasma.mp3'), jupiter: () => loadSound('voyager-jupiter-magnetic-waves.mp3'), mars: () => loadSound('insight-mars-impact.mp3') }
const NAMES_OF = { speech: 'Arthur Sullivan speaking to Edison, 1888', music: 'The Lost Chord, piano and cornet, 1888', greetings: 'Voyager Golden Record: greetings in 55 languages, 1977', space: 'Interstellar plasma, heard by Voyager 1, 2012–13', jupiter: 'Jupiter’s magnetic waves, heard by Voyager, 1979', mars: 'A meteoroid hitting Mars, heard by InSight, 2021' }
const sensitivity = 1.5 /* 1.1..3 */
const memory = 0.92 /* 0.7..0.99 */
let mic, file = null, loaded = '', fft, prev = null, avg = 0, lastOnset = 0, bursts = [], spin = 0

function setup() {
  createCanvas(800, 600)
  colorMode(HSB, 360, 100, 100, 1)
  fft = new p5.FFT(1024)
  mic = new p5.AudioIn(); mic.disconnect(); mic.connect(fft)   // the microphone only to the analyser
  addEventListener('dragover', e => e.preventDefault())
  addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) playFile(loadSound(URL.createObjectURL(f)), f.name) })
}

async function playFile(loading, name) {
  userStartAudio(); loaded = name
  if (file) file.stop()
  file = await loading
  file.connect(fft); file.loop(); file.play()
}

function mousePressed() {
  userStartAudio()
  if (input === 'mic') { if (!mic.started) mic.start(); return }
  if (RECORDINGS[input] && loaded !== NAMES_OF[input]) playFile(RECORDINGS[input](), NAMES_OF[input])
  else if (file) file.isPlaying() ? file.pause() : file.play()
}

function draw() {
  background(0, 0, 8, 1 - memory)              // a veil: the older a dot, the fainter
  const S = fft.analyze(), df = getAudioContext().sampleRate / 2 / S.length
  const band = (lo, hi) => { let e = 0; for (let i = Math.ceil(lo / df); i <= hi / df; i++) e += S[i]; return e }
  const bass = Math.min(1, band(40, 250) * 4), mid = Math.min(1, band(250, 2000) * 2), treble = Math.min(1, band(2000, 12000) * 1.5)
  let sum = 0, weighted = 0, flux = 0
  for (let i = 1; i < S.length; i++) {
    sum += S[i]; weighted += i * df * S[i]
    if (prev) flux += Math.max(0, S[i] - prev[i])
  }
  prev = S.slice()
  const centroid = sum > 0 ? weighted / sum : 500
  const hueNow = map(Math.log2(Math.max(centroid, 100)), Math.log2(100), Math.log2(6000), 20, 260, true)
  // onsets: the spectrum grew much more than it usually does
  if (flux > sensitivity * avg + 0.002 && millis() - lastOnset > 150) { lastOnset = millis(); bursts.push({ r: 20, a: 1, h: hueNow }) }
  avg = 0.95 * avg + 0.05 * flux

  const cx = width / 2, cy = height / 2
  noStroke()
  fill(25, 80, 95, 0.5); circle(cx, cy, 40 + 260 * bass)                 // bass: the disc
  spin += 0.01 + 0.1 * mid
  for (let k = 0; k < 24; k++) {                                         // mids: the ring
    const a = spin + TWO_PI * k / 24, r = 150 + 40 * mid
    fill(hueNow, 70, 95, 0.8); circle(cx + r * Math.cos(a), cy + r * Math.sin(a), 4 + 14 * mid)
  }
  for (let k = 0; k < 60 * treble; k++) { fill(200, 20, 100, 0.9); circle(random(width), random(height), 2.5) }   // treble: specks
  for (const b of bursts) {                                              // onsets: rings of dots
    for (let k = 0; k < 36; k++) { const a = TWO_PI * k / 36; fill(b.h, 60, 100, b.a); circle(cx + b.r * Math.cos(a), cy + b.r * Math.sin(a), 5) }
    b.r += 8; b.a *= 0.92
  }
  bursts = bursts.filter(b => b.a > 0.05)
  fill(0, 0, 8, 1); rect(0, 0, width, 34)
  fill(0, 0, 85, 1); textSize(13); textAlign(LEFT)
  const source = input === 'mic' ? (mic.started ? 'the microphone' : '') : file && loaded ? loaded : ''
  text(source ? source + ' · brightness ' + Math.round(centroid) + ' Hz' : input === 'mic' ? 'click to listen to the microphone' : RECORDINGS[input] ? 'click to play: ' + NAMES_OF[input] : 'drop an audio file on the board', 16, 22)
}` }
      ]
    },
    {
      id: 'together',
      title: 'Together',
      label: 'Together',
      text: 'Everything at once. First a synth to play, connected to a picture: the sound is measured as it plays (its loudness and its spectrum) and the measurements draw. Then a small piece in three parts that every electronic track is made of: a **pad** (slow chords, the harmony), a **bass** (the line under them) and **drums** (the time).',
      boards: [
        { id: 'synthpicture', title: '7.1 · A synth and its picture', w: 800, h: 600, ground: '#141414',
          idea: 'The mono synth of 3.1 with an echo (a delay that feeds back into itself), played from the keys, a MIDI keyboard, or the mouse: hold the mouse anywhere, left to right picks a note of the scale, bottom to top opens the filter. The picture listens: every frame the spectrum is split into eight bands, and each loud band drops a dot, its height the band (low notes low), its colour the note playing, its size the loudness. The dots fade slowly, so the board fills like a pointillist painting of what was played. Swap the drawing for your own: the numbers are all there.',
          pseudo: `osc $\\to$ filter $\\to$ envelope $\\to$ speakers, and $\\to$ delay $\\to$ speakers
every frame:
  bands $\\leftarrow$ the spectrum in 8 bands; level $\\leftarrow$ loudness
  for each band $b$ louder than a threshold: a dot at height $b$, colour of the note, size $\\propto$ level
  fade every dot a little`,
          p5: `// 7.1 A synth and its picture. Keys A W S E D F T G Y H U J K (Z, X: octave), MIDI, or hold the mouse (x: note, y: filter).
const shape = 'sawtooth' /* sine|triangle|sawtooth|square */
const glide = 0.04 /* 0..0.5 */
const echo = 0.35 /* 0..0.8 */
const fade = 0.985 /* 0.9..0.999 */
const KEYS = 'awsedftgyhujkolp'
const PENTA = [0, 3, 5, 7, 10]                 // the mouse plays a minor pentatonic: nothing sounds wrong
const mtof = m => 440 * Math.pow(2, (m - 69) / 12)
let osc, lp, env, echoFx, fft, meter, held = [], octave = 3, dots = [], mouseNote = null, cut = 2000, last = {}

function setup() {
  createCanvas(800, 600)
  osc = new p5.Oscillator(220, shape)
  osc.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  lp = new p5.Biquad(2000, 'lowpass'); lp.res(5)
  env = new p5.Envelope(0.01, 0.3, 0.6, 0.6)
  osc.disconnect(); osc.connect(lp); lp.disconnect(); lp.connect(env)
  echoFx = new p5.Delay(0.375, echo)           // an echo every 375 ms, each one quieter
  echoFx.wet(1)
  env.connect(echoFx)
  fft = new p5.FFT(1024); meter = new p5.Amplitude(0.8)
  env.connect(fft); env.connect(meter)
  colorMode(HSB, 360, 100, 100, 1)
}

function start() {
  userStartAudio()
  if (osc.started) return
  osc.start()
  if (navigator.requestMIDIAccess) navigator.requestMIDIAccess().then(access => {
    for (const input of access.inputs.values()) input.onmidimessage = e => {
      const [st, m, v] = e.data
      if ((st & 0xf0) === 0x90 && v > 0) noteOn(m); else if ((st & 0xf0) === 0x80 || (st & 0xf0) === 0x90) noteOff(m)
    }
  }).catch(() => {})
}
function noteOn(m) { start(); if (held.includes(m)) return; held.push(m); osc.freq(mtof(m), held.length > 1 ? glide : 0); if (held.length === 1) env.triggerAttack() }
function noteOff(m) { held = held.filter(n => n !== m); if (held.length) osc.freq(mtof(held[held.length - 1]), glide); else env.triggerRelease() }
function keyPressed() {
  const k = key.toLowerCase()
  if (k === 'z') octave = max(1, octave - 1)
  if (k === 'x') octave = min(6, octave + 1)
  const i = KEYS.indexOf(k); if (i >= 0) noteOn(12 * (octave + 1) + i)
}
function keyReleased() { const i = KEYS.indexOf(key.toLowerCase()); if (i >= 0) for (const m of [...held]) if (m % 12 === i % 12) noteOff(m) }
const mouseToNote = () => { const d = Math.floor(constrain(mouseX / width, 0, 0.999) * 15); return 45 + 12 * Math.floor(d / 5) + PENTA[d % 5] }
function mousePressed() { start(); mouseNote = mouseToNote(); noteOn(mouseNote) }
function mouseDragged() { const m = mouseToNote(); if (m !== mouseNote) { noteOn(m); noteOff(mouseNote); mouseNote = m } }
function mouseReleased() { if (mouseNote !== null) { noteOff(mouseNote); mouseNote = null } }

function draw() {
  if (last.shape !== shape) osc.setType(shape)
  if (last.echo !== echo) echoFx.feedback(echo)
  last = { shape, echo }
  if (mouseIsPressed) cut = map(mouseY, height, 0, 200, 8000, true)
  lp.freq(cut)

  background(0, 0, 8, 1 - fade)                // a dark veil: old dots fade
  const spectrum = fft.analyze(), level = meter.getLevel()
  const m = held[held.length - 1]
  const hueNow = m === undefined ? 220 : (m % 12) * 30
  for (let b = 0; b < 8; b++) {                // eight bands, an octave or so each
    const lo = Math.floor(Math.pow(2, b) * 2), hi = Math.floor(Math.pow(2, b + 1) * 2)
    let e = 0
    for (let i = lo; i < hi; i++) e = Math.max(e, spectrum[i])
    const db = 20 * Math.log10(e + 1e-9)
    if (db > -60) dots.push({ x: random(width), y: height - (b + random()) * height / 8, r: 3 + 60 * level * random(0.5, 1), h: (hueNow + b * 8) % 360, a: map(db, -60, -10, 0.3, 1, true) })
  }
  noStroke()
  for (const d of dots) { fill(d.h, 70, 95, d.a); circle(d.x, d.y, d.r) }
  dots = dots.slice(-400)                      // only the newest dots are drawn again; the veil keeps the rest
  for (const d of dots) d.a *= 0.9
  fill(0, 0, 8, 1); rect(0, 0, width, 40)       // a clear strip for the caption
  fill(0, 0, 90, 1); textSize(13); textAlign(LEFT)
  text(m === undefined ? 'play: keys, MIDI or hold the mouse' : 'note ' + m + ' · ' + nf(mtof(m), 1, 1) + ' Hz · level ' + nf(level, 1, 2), 20, 28)
}` },

        { id: 'band', title: '7.2 · Pad, bass, drums', w: 800, h: 600, ground: '#141414',
          idea: 'The whole lesson in one piece. The **pad**: three voices, each two sawtooths a few cents apart (the beating between them makes it wide and slow), through a low-pass whose cutoff an LFO moves; a slow attack and release, and the chord changes by gliding, so the pad never stops. The progression is A minor, F, C, G (i–VI–III–VII), a bar each. The **bass**: the voice of 3.3, playing each chord\'s root in a pattern. The **drums**: the kit of 4.2 in a pattern of 5.1. Press 1, 2, 3 to mute and unmute each part. The picture: the background is the chord\'s colour, the bass a line of dots at its pitch, each kick a ring, each hat a speck.',
          pseudo: `chords $\\leftarrow$ [Am, F, C, G], a bar each
every 16th note:
  on a bar's first step: the pad glides to the next chord
  bass: if pattern[step]: the chord's root, an octave or two down
  drums: kick, snare, hat by their patterns
the pad's cutoff $\\leftarrow 900 + 500 \\sin(2\\pi\\, 0.1\\, t)$`,
          p5: `// 7.2 Pad, bass, drums. Click ▶. Press 1, 2, 3 to mute or unmute the pad, the bass and the drums.
const tempo = 100 /* 70..140 */
const padLevel = 0.5 /* 0..1 */
const bassLevel = 0.7 /* 0..1 */
const drumLevel = 0.8 /* 0..1 */
const CHORDS = [[57, 60, 64], [53, 57, 60], [48, 55, 64], [55, 59, 62]]   // Am, F, C, G (MIDI notes)
const NAMES = ['A minor', 'F major', 'C major', 'G major']
const HUES = [[60, 70, 140], [130, 70, 60], [150, 110, 50], [60, 120, 110]]
const BASS = [0, null, 0, null, 12, null, 0, 7, 0, null, 0, null, 10, null, 7, null]   // semitones above the root
const KICK = 'x...x...x...x..x', SNARE = '....x.......x...', HAT = '..x...x...x...x.'
const mtof = m => 440 * Math.pow(2, (m - 69) / 12)
let pad = [], padLP, padEnv, bass, bassLP, bassEnv, kick, kickEnv, hiss, snareEnv, hatEnv
let on = false, count = -1, next = 0, bassOff = Infinity, bassCut = 300, mute = [false, false, false], rings = [], specks = [], bassDots = [], chord = 0

function voice(src, envelope) { src.disconnect(); src.connect(envelope); return envelope }
function setup() {
  createCanvas(800, 600)
  // pad: 3 notes x 2 detuned sawtooths -> one low-pass -> one envelope, held for the whole piece
  padLP = new p5.Biquad(900, 'lowpass'); padLP.res(2)
  padEnv = new p5.Envelope(1.5, 0.5, 1, 2.5)
  padLP.disconnect(); padLP.connect(padEnv)
  for (let i = 0; i < 6; i++) { const o = new p5.Oscillator(220, 'sawtooth'); o.disconnect(); o.connect(padLP); o.amp(0.08); pad.push(o) }
  // bass: the line of 3.3
  bass = new p5.Oscillator(55, 'sawtooth'); bassLP = new p5.Biquad(300, 'lowpass'); bassLP.res(7)
  bass.node.context.lookAhead = 0              // play now: p5.sound (Tone.js) waits 0.1 s by default
  bassEnv = new p5.Envelope(0.005, 0.1, 0.8, 0.05)
  bass.disconnect(); bass.connect(bassLP); bassLP.disconnect(); bassLP.connect(bassEnv)
  // drums: the kit of 4.2
  kick = new p5.Oscillator(160, 'sine'); kickEnv = voice(kick, new p5.Envelope(0.001, 0.35, 0, 0.05))
  hiss = new p5.Noise('white'); hiss.disconnect(); hiss.amp(0.35)
  const snareHP = new p5.Biquad(1500, 'highpass'), hatHP = new p5.Biquad(7000, 'highpass')
  hiss.connect(snareHP); hiss.connect(hatHP)
  snareEnv = voice(snareHP, new p5.Envelope(0.001, 0.18, 0, 0.05))
  hatEnv = voice(hatHP, new p5.Envelope(0.001, 0.05, 0, 0.02))
  setChord(0, 0)
  setInterval(tick, 5)
}

function setChord(c, time) {                   // each note on two oscillators, 7 cents apart
  CHORDS[c].forEach((m, i) => { pad[2 * i].freq(mtof(m) * Math.pow(2, -3.5 / 1200), time); pad[2 * i + 1].freq(mtof(m) * Math.pow(2, 3.5 / 1200), time) })
}

function tick() {
  const t = millis()
  padLP.freq(900 + 500 * Math.sin(TWO_PI * 0.1 * t / 1000))       // the pad's slow LFO
  bassCut = 250 + (bassCut - 250) * 0.97; bassLP.freq(bassCut)
  if (t >= bassOff) { bassEnv.triggerRelease(); bassOff = Infinity }
  if (!on || t < next) return
  count++
  const s = count % 16, sixteenth = 60000 / tempo / 4
  if (s === 0) { chord = Math.floor(count / 16) % 4; setChord(chord, 0.4) }
  const root = CHORDS[chord][0] - 24
  if (BASS[s] !== null && !mute[1]) {
    bass.freq(mtof(root + BASS[s]), 0.01); bassCut = 1800; bassEnv.triggerAttack(); bassOff = t + 0.55 * sixteenth
    bassDots.push({ x: 0, m: root + BASS[s] })
  }
  if (!mute[2]) {
    if (KICK[s] === 'x') { kick.freq(160); kick.freq(45, 0.08); kickEnv.triggerAttack(); rings.push({ r: 10, a: 1 }) }
    if (SNARE[s] === 'x') snareEnv.triggerAttack()
    if (HAT[s] === 'x') { hatEnv.triggerAttack(); specks.push({ x: random(width), y: random(height), a: 1 }) }
  }
  next += sixteenth
}

function levels() {
  for (const o of pad) o.amp(mute[0] ? 0 : 0.08 * padLevel, 0.3)
  bass.amp(0.35 * bassLevel, 0.05)
  kick.amp(0.55 * drumLevel, 0.05); hiss.amp(0.25 * drumLevel, 0.05)
}

function mousePressed() {
  if (!onButton()) return
  userStartAudio()
  if (!bass.started) { for (const o of pad) o.start(); bass.start(); kick.start(); hiss.start() }
  on = !on
  if (on) { count = -1; next = millis(); padEnv.triggerAttack() } else { padEnv.triggerRelease(); bassEnv.triggerRelease() }
}
function keyPressed() { const i = '123'.indexOf(key); if (i >= 0) mute[i] = !mute[i] }

function draw() {
  levels()
  const [r, g, b] = HUES[chord]
  background(r * 0.35, g * 0.35, b * 0.35, 60)  // the chord's colour, washing in slowly
  noFill()
  for (const k of rings) { stroke(242, 193, 78, 255 * k.a); strokeWeight(3); circle(width / 2, height / 2, k.r); k.r += 9; k.a *= 0.93 }
  rings = rings.filter(k => k.a > 0.03)
  noStroke()
  for (const s of specks) { fill(220, 230, 255, 255 * s.a); circle(s.x, s.y, 4); s.a *= 0.9 }
  specks = specks.filter(s => s.a > 0.05)
  for (const d of bassDots) { fill(200, 102, 79); circle(width - d.x, map(d.m, 21, 57, height - 40, height / 2), 10); d.x += 3 }
  bassDots = bassDots.filter(d => d.x < width)
  fill(235); textSize(16); textAlign(LEFT, BASELINE)
  text(on ? NAMES[chord] + ' · bar ' + (Math.floor(count / 16) + 1) + ' · beat ' + (Math.floor((count % 16) / 4) + 1) : 'pad, bass, drums', 90, 50)
  fill(170); textSize(13)
  text(['1 pad', '2 bass', '3 drums'].map((p, i) => p + (mute[i] ? ' (muted)' : '')).join(' · '), 90, 74)
  playButton(on)
}

${BUTTON}` }
      ]
    }
  ],
  bibliography: [
    { title: 'Synthesis', items: [
      ['John M. Chowning (1973). The synthesis of complex audio spectra by means of frequency modulation. *Journal of the Audio Engineering Society* 21(7), 526–534. FM.', 'https://www.aes.org/e-lib/browse.cfm?elib=1954'],
      ['Miller Puckette (2007). *The Theory and Technique of Electronic Music*. World Scientific. Free online: oscillators, envelopes, filters, modulation.', 'https://msp.ucsd.edu/techniques.htm'],
      ['Julius O. Smith III. *Introduction to Digital Filters with Audio Applications*. CCRMA, Stanford. Free online.', 'https://ccrma.stanford.edu/~jos/filters/'],
      ['William A. Sethares (2005). *Tuning, Timbre, Spectrum, Scale*. Springer. Why some intervals beat and others do not.', 'https://sethares.engr.wisc.edu/ttss.html'],
      ['Godfried T. Toussaint (2005). The Euclidean algorithm generates traditional musical rhythms. *Bridges*. Euclidean rhythms.', 'http://cgm.cs.mcgill.ca/~godfried/publications/banff.pdf']
    ] },
    { title: 'Tools', items: [
      ['p5.sound.js: the p5.js sound library, built on Tone.js. Source and examples.', 'https://github.com/processing/p5.sound.js'],
      ['Tone.js: the Web Audio framework under p5.sound.', 'https://tonejs.github.io/'],
      ['MDN: the Web Audio API, which both are built on (part 2 of this series).', 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API'],
      ['Chris Wilson (2013). A tale of two clocks: scheduling Web Audio with precision. Why our sequencers can be late, and the fix.', 'https://web.dev/articles/audio-scheduling'],
      ['Daniel Shiffman. p5.js Sound tutorial (video series, for the earlier p5.sound).', 'https://www.youtube.com/playlist?list=PLRqwX-V7Uu6aFcVjlDAkkGIixw70s7jpW']
    ] }
  ]
};
