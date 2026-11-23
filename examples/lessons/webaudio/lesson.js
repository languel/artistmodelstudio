/**
 * Lesson: sound synthesis, part B: Web Audio itself (plan: docs/notes/synthesis-lessons.md). After the p5.sound lesson
 * (examples/lessons/synthesis), the same ideas one layer down, then what oscillators alone cannot do: exact time,
 * samples written by hand, physical models (a plucked string, struck bars and bells), recordings, grains.
 *
 * Built by the sampling lesson's scene builder (`/lesson webaudio`). Every board is a p5.js sketch in which p5 only draws:
 * the sound is plain Web Audio (AudioContext, nodes, AudioParams), so the same code works in any page. Each sketch can
 * be copied and pasted into the p5 editor as it is (no p5.sound). The recordings are read with
 * `loadBytes('name.mp3')`: in the studio from Assets › Samples, elsewhere from the file uploaded beside the sketch.
 * Names p5 already uses (noise, filter, scale, step, round, key, color, rotate…) are not used as globals.
 */

const BUTTON = `function playButton(on) {                // a round button: ▶ when stopped, ■ when playing
  noStroke(); fill(on ? '#c8664f' : 60); circle(44, 44, 44)
  fill(235)
  if (on) rect(36, 36, 16, 16)
  else triangle(37, 33, 37, 55, 56, 44)
}
const onButton = () => dist(mouseX, mouseY, 44, 44) < 24`;

export const LESSON = {
  title: 'Web Audio: strings, bells, samples and grains',
  subtitle: 'The engine under p5.sound: nodes, exact time, samples written by hand, physical models, recordings and grains, and strings drawn in the air. Part B of the synthesis series.',
  idea: 'Underneath every web synth is one small machine: a graph of nodes that the browser runs on its own clock. Learn to schedule on that clock and to write samples yourself, and you can build a string, a bell or a cloud of grains from nothing.',
  main: 'graph',
  codePanel: true,
  sources: {},
  sections: [
    {
      id: 'graph',
      title: 'The graph',
      label: 'Graph',
      text: 'p5.sound is a thin layer over the **Web Audio API**, which every browser has. Its model is a **graph**: nodes that make sound (oscillators, buffers, the microphone), nodes that change it (gains, filters, delays), nodes that measure it (analysers), joined by `connect()` and ending at `ctx.destination`, the speakers. The browser runs the graph on its own audio thread, 128 samples at a time, whatever the page is doing. Our code never makes sound directly: it builds the graph and tells its settings, its **AudioParams**, what to do and **when**. In these boards p5 only draws.',
      boards: [
        { id: 'graph', title: '1.1 · The audio graph', w: 800, h: 600, ground: '#141414',
          idea: 'The sketch of p5.sound 1.1, with nothing between us and the browser. An `OscillatorNode` makes the wave, a `GainNode` turns it up and down, an `AnalyserNode` lets us look at it (it changes nothing), and `ctx.destination` is the speakers. `osc.connect(amp).connect(scope).connect(ctx.destination)` is the whole patch. Settings like the frequency and the gain are **AudioParams**: rather than setting them at once, `setTargetAtTime` glides them there, so a change never clicks. The boxes show the live values.',
          pseudo: `ctx $\\leftarrow$ new AudioContext()
osc $\\to$ gain $\\to$ analyser $\\to$ speakers
on a change: param.setTargetAtTime(value, now, 0.02)    # glide, never jump`,
          p5: `// 1.1 The audio graph: oscillator -> gain -> analyser -> speakers. Click ▶. Plain Web Audio; p5 only draws.
const shape = 'sawtooth' /* sine|triangle|sawtooth|square */
const freq = 220 /* 55..880 */
const volume = 0.3 /* 0..1 */
let ac, osc, amp, scope, data, on = false, last = {}

function setup() { createCanvas(800, 600) }

function build() {                             // the graph, made once, on the first click
  ac = new AudioContext()
  osc = new OscillatorNode(ac, { type: shape, frequency: freq })   // makes the wave
  amp = new GainNode(ac, { gain: 0 })                               // turns it up and down
  scope = new AnalyserNode(ac, { fftSize: 2048 })                   // listens; changes nothing
  osc.connect(amp).connect(scope).connect(ac.destination)           // the patch
  osc.start()
  data = new Float32Array(scope.fftSize)
}

function mousePressed() {
  if (!onButton()) return
  if (!ac) build()
  ac.resume(); on = !on
}

function card(x, y, title, lines, lit) {
  stroke(lit ? '#f2c14e' : 90); strokeWeight(2); fill(30); rect(x, y, 160, 90, 8)
  noStroke(); fill(235); textSize(14); textAlign(LEFT); text(title, x + 12, y + 24)
  fill(150); textSize(12); lines.forEach((l, i) => text(l, x + 12, y + 46 + i * 18))
}

function draw() {
  background(20)
  if (ac) {
    const now = ac.currentTime
    if (last.shape !== shape) osc.type = shape
    if (last.freq !== freq) osc.frequency.setTargetAtTime(freq, now, 0.02)
    if (last.on !== on || last.volume !== volume) amp.gain.setTargetAtTime(on ? volume : 0, now, 0.02)
    last = { shape, freq, volume, on }
  }
  const nodes = [
    ['OscillatorNode', ['type: ' + shape, 'frequency: ' + freq + ' Hz']],
    ['GainNode', ['gain: ' + (ac ? nf(amp.gain.value, 1, 2) : '0')]],
    ['AnalyserNode', ['fftSize: 2048', '(only listens)']],
    ['destination', ['the speakers', ac ? ac.sampleRate + ' samples/s' : '']]
  ]
  nodes.forEach(([t, l], i) => {
    card(30 + i * 190, 110, t, l, on)
    if (i < 3) { stroke(on ? '#f2c14e' : 90); strokeWeight(2); line(190 + i * 190, 155, 220 + i * 190, 155); line(212 + i * 190, 149, 220 + i * 190, 155); line(212 + i * 190, 161, 220 + i * 190, 155) }
  })
  if (ac) {
    scope.getFloatTimeDomainData(data)
    let z = 0
    while (z < 1000 && !(data[z] <= 0 && data[z + 1] > 0)) z++
    stroke('#5b7fd1'); strokeWeight(2); noFill(); beginShape()
    for (let j = 0; j < 600; j++) vertex(40 + 720 * j / 599, 400 - 250 * data[z + j])
    endShape()
  }
  noStroke(); fill(140); textSize(13); textAlign(LEFT)
  text('ac.currentTime: ' + (ac ? nf(ac.currentTime, 1, 2) + ' s (the audio clock)' : 'no AudioContext yet'), 40, 575)
  playButton(on)
}

${BUTTON}` },

        { id: 'automation', title: '1.2 · Automation', w: 800, h: 600, ground: '#141414',
          idea: 'An AudioParam can be given a plan: from now on, be 0; reach 1 in 50 ms; then fall to 0 over a second. The browser carries it out sample by sample, exactly on time, which is how every envelope, sweep and glide on the web is made. Four ways to move: **step** (`setValueAtTime`, a jump), **linear** (`linearRampToValueAtTime`, a straight line), **exponential** (`exponentialRampToValueAtTime`: equal ratios in equal times, which the ear hears as even; it cannot reach 0, so it aims at 0.0001), **target** (`setTargetAtTime`: heads towards a value and slows as it nears, like a capacitor charging). Click or press space: the drawn curve is the plan, the dots are the loudness measured.',
          pseudo: `t $\\leftarrow$ ctx.currentTime; gain.cancelScheduledValues(t)
linear: setValueAtTime(0, t); linearRampToValueAtTime(1, t + a); linearRampToValueAtTime(0, t + a + d)
exponential: … exponentialRampToValueAtTime(1, t + a) …(0.0001, t + a + d)
target: setTargetAtTime(1, t, a/3); setTargetAtTime(0, t + a, d/4)`,
          p5: `// 1.2 Automation: an AudioParam follows a plan, on the audio clock. Click (or press space) for a note shaped by the chosen curve.
const curve = 'exponential' /* step|linear|exponential|target */
const attack = 0.05 /* 0.005..1 */
const decay = 1 /* 0.05..3 */
let ac, osc, amp, meter, data, dots = []

function setup() { createCanvas(800, 600) }

function build() {
  ac = new AudioContext()
  osc = new OscillatorNode(ac, { type: 'triangle', frequency: 330 })
  amp = new GainNode(ac, { gain: 0 })
  meter = new AnalyserNode(ac, { fftSize: 1024 })
  osc.connect(amp).connect(meter).connect(ac.destination)
  osc.start()
  data = new Float32Array(meter.fftSize)
}

function note() {
  if (!ac) build()
  ac.resume()
  const t = ac.currentTime, g = amp.gain
  g.cancelScheduledValues(t)                   // forget any plan still running
  if (curve === 'step') { g.setValueAtTime(0.5, t); g.setValueAtTime(0, t + attack + decay) }
  if (curve === 'linear') { g.setValueAtTime(0, t); g.linearRampToValueAtTime(0.5, t + attack); g.linearRampToValueAtTime(0, t + attack + decay) }
  if (curve === 'exponential') { g.setValueAtTime(0.0001, t); g.exponentialRampToValueAtTime(0.5, t + attack); g.exponentialRampToValueAtTime(0.0001, t + attack + decay) }
  if (curve === 'target') { g.setValueAtTime(0, t); g.setTargetAtTime(0.5, t, attack / 3); g.setTargetAtTime(0, t + attack, decay / 4) }
  dots = []
}
function mousePressed() { note() }
function keyPressed() { if (key === ' ') note() }

function plan(c, s) {                          // the same curves, as maths (s in seconds since the note)
  const a = attack, d = decay
  if (s < 0) return 0
  if (c === 'step') return s < a + d ? 1 : 0
  if (c === 'linear') return s < a ? s / a : Math.max(0, 1 - (s - a) / d)
  if (c === 'exponential') return s < a ? Math.pow(10000, s / a - 1) : Math.max(0, Math.pow(0.0001, (s - a) / d))
  return s < a ? 1 - Math.exp(-3 * s / a) : (1 - Math.exp(-3)) * Math.exp(-4 * (s - a) / d)
}

function draw() {
  background(20)
  const T = attack + decay * 1.3, X = s => 60 + 680 * s / T, Y = v => 380 - 300 * v
  for (const c of ['step', 'linear', 'exponential', 'target']) {
    stroke(c === curve ? '#f2c14e' : 70); strokeWeight(c === curve ? 3 : 1.5); noFill(); beginShape()
    for (let i = 0; i <= 300; i++) { const s = T * i / 300; vertex(X(s), Y(plan(c, s))) }
    endShape()
  }
  if (ac) {
    meter.getFloatTimeDomainData(data)
    let peak = 0
    for (const v of data) peak = Math.max(peak, Math.abs(v))
    dots.push(peak / 0.5)
    noStroke(); fill('#c8664f')
    dots.forEach((v, i) => { const s = i / 60; if (s < T) circle(X(s), Y(v), 5) })
  }
  noStroke(); fill(235); textSize(16); textAlign(LEFT)
  text(curve + ' · attack ' + attack + ' s · decay ' + decay + ' s', 60, 50)
  fill(140); textSize(13); text('the line: the plan (all four, the chosen one bright) · the dots: the loudness measured, a frame each · click or space', 60, 440)
}` }
      ]
    },
    {
      id: 'time',
      title: 'Time',
      label: 'Time',
      text: 'There are two clocks in a web page. JavaScript\'s timers (`setTimeout`, `setInterval`, `draw`) are late by a few milliseconds, sometimes many: they wait for whatever the page is doing. The **audio clock** (`ctx.currentTime`) is exact to the sample. So we never play sounds "now" from a timer; we **schedule** them a little ahead, at exact times, on the audio clock: a timer wakes up every 25 ms and books everything that falls in the next tenth of a second (Chris Wilson\'s look-ahead scheduler). Then a stranger kind of time: pulsars, stars that tick, slow enough to hear as rhythm or fast enough to hear as pitch.',
      boards: [
        { id: 'clocks', title: '2.1 · Two clocks', w: 800, h: 600, ground: '#141414',
          idea: 'A beat played two ways. **ahead**: every 25 ms a timer books each hit that falls in the next `lookahead` seconds at its exact time, `osc.start(t)`. **now**: the timer plays each hit as soon as it notices it is due, the way the p5.sound sequencers did. Each dot is one hit, its height how late it really was. Ahead, the dots lie flat on zero. Now, they scatter over 0 to 25 ms, and more when the page is busy (drag the board around, or open another tab): you can hear the beat stagger. Each hit is a new node: in Web Audio, sources are made for one use and cost almost nothing.',
          pseudo: `every 25 ms:
  while next $<$ ctx.currentTime $+$ lookahead:
    play(step, at: next)    # ahead: exactly on time
    next $\\leftarrow$ next $+$ one sixteenth
(now: play(step, at: ctx.currentTime) once next has passed: late by up to 25 ms)`,
          p5: `// 2.1 Two clocks: a beat booked ahead on the audio clock, or played "now" from a timer. Click ▶; the dots are how late each hit was.
const timing = 'ahead' /* ahead|now */
const tempo = 120 /* 60..200 */
const lookahead = 0.1 /* 0.03..0.5 */
let ac, hiss, on = false, next = 0, count = 0, lateness = []

function setup() { createCanvas(800, 600); setInterval(scheduler, 25) }

function build() {
  ac = new AudioContext()
  hiss = ac.createBuffer(1, ac.sampleRate * 0.1, ac.sampleRate)      // 0.1 s of noise, made once, for the hats
  const d = hiss.getChannelData(0)
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
}

function play(n, t) {                          // one hit at time t: a kick on the beat, a hat on every sixteenth
  if (n % 4 === 0) {
    const o = new OscillatorNode(ac, { frequency: 150 }), g = new GainNode(ac, { gain: 0.6 })
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.12)
    g.gain.setValueAtTime(0.6, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3)
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.3)
  }
  const s = new AudioBufferSourceNode(ac, { buffer: hiss }), hp = new BiquadFilterNode(ac, { type: 'highpass', frequency: 7000 })
  const g = new GainNode(ac, { gain: 0 })
  g.gain.setValueAtTime(n % 2 ? 0.1 : 0.2, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05)
  s.connect(hp).connect(g).connect(ac.destination); s.start(t); s.stop(t + 0.06)
}

function scheduler() {
  if (!on) return
  const sixteenth = 60 / tempo / 4
  if (timing === 'ahead') {
    while (next < ac.currentTime + lookahead) { play(count, next); lateness.push(0); count++; next += sixteenth }
  } else if (ac.currentTime >= next) {         // due already: play it now, as late as the timer was
    const t = ac.currentTime
    play(count, t); lateness.push(t - next); count++; next += sixteenth
  }
  if (lateness.length > 200) lateness.splice(0, lateness.length - 200)
}

function mousePressed() {
  if (!onButton()) return
  if (!ac) build()
  ac.resume(); on = !on
  next = ac.currentTime + 0.05; count = 0
}

function draw() {
  background(20)
  const Y = ms => 480 - ms * 12
  stroke(60); strokeWeight(1)
  for (let ms = 0; ms <= 30; ms += 5) { line(40, Y(ms), 760, Y(ms)); noStroke(); fill(110); textSize(11); textAlign(RIGHT); text(ms + ' ms', 36, Y(ms) + 4); stroke(60) }
  noStroke()
  lateness.forEach((s, i) => { fill(s * 1000 > 2 ? '#c8664f' : '#f2c14e'); circle(44 + i * 3.6, Y(s * 1000), 6) })
  const late = lateness.slice(-50), avg = late.length ? late.reduce((a, b) => a + b, 0) / late.length * 1000 : 0
  fill(235); textSize(16); textAlign(LEFT)
  text(timing === 'ahead' ? 'booked ' + Math.round(lookahead * 1000) + ' ms ahead, at exact times' : 'played "now" from a 25 ms timer', 90, 50)
  fill(140); textSize(13); text('each dot a hit: how late it was · average of the last 50: ' + nf(avg, 1, 1) + ' ms', 90, 74)
  playButton(on)
}

${BUTTON}` },

        { id: 'pulsars', title: '2.2 · Pulsars: rhythm into pitch', w: 800, h: 600, ground: '#141414',
          idea: 'A pulsar is a collapsed star, about 20 km across, spinning; a beam from it sweeps past the Earth once a turn, and a radio telescope hears a tick. The first, **PSR B1919+21**, was found by Jocelyn Bell Burnell in 1967: a tick every 1.337 s, so regular they first called it LGM-1 (little green men). **Vela** ticks 11 times a second, the **Crab** 30, **PSR J1748−2446ad** 716 times a second, the fastest known. Here each one is a click at its real period: a buffer exactly one period long, holding one click, looped (`loop = true`), so the timing is perfect at any speed. Somewhere around 20 clicks a second you stop hearing rhythm and start hearing pitch: the Crab already hums, J1748 is a note (716 Hz, about F5).',
          pseudo: `period $P$ (s) $\\to$ a buffer of $P \\cdot f_s$ samples: a click, then silence
source.loop $\\leftarrow$ true    # one click every $P$ seconds, exactly
rate $= 1/P$ clicks a second: below $\\approx 20$ heard as rhythm, above as pitch`,
          p5: `// 2.2 Pulsars: each a click at its real period, a buffer one period long, looped. Click ▶. Rhythm turns into pitch.
const pulsar = 'Vela' /* B1919+21|Vela|Crab|J1748-2446ad */
const PERIODS = { 'B1919+21': 1.3373, Vela: 0.08933, Crab: 0.03374, 'J1748-2446ad': 0.0013957 }   // seconds per turn
const ABOUT = { 'B1919+21': 'the first pulsar (Bell Burnell, 1967)', Vela: 'in Vela, 11 turns a second', Crab: 'the heart of the Crab Nebula, 30 a second', 'J1748-2446ad': 'the fastest known, 716 turns a second' }
let ac, src = null, on = false, shown = ''

function setup() { createCanvas(800, 600) }

function loopFor(P) {                          // a buffer one period long: a short click, then silence
  const sr = ac.sampleRate, n = Math.max(8, Math.round(P * sr)), b = ac.createBuffer(1, n, sr), d = b.getChannelData(0)
  const clickLen = Math.min(n / 2, sr * 0.004)
  for (let i = 0; i < clickLen; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (clickLen / 5))
  return b
}

function start() {
  if (src) src.stop()
  src = new AudioBufferSourceNode(ac, { buffer: loopFor(PERIODS[pulsar]), loop: true })
  const g = new GainNode(ac, { gain: 0.6 })
  src.connect(g).connect(ac.destination); src.start()
  shown = pulsar
}

function mousePressed() {
  if (!onButton()) return
  if (!ac) ac = new AudioContext()
  ac.resume(); on = !on
  if (on) start(); else if (src) { src.stop(); src = null }
}

function draw() {
  background(20)
  if (on && pulsar !== shown) start()
  const P = PERIODS[pulsar], hz = 1 / P, now = ac ? ac.currentTime : millis() / 1000
  // the last 2 seconds of ticks, scrolling left
  const W = 2, x = s => 760 - 720 * (now - s) / W
  stroke(50); line(40, 300, 760, 300)
  const first = Math.ceil((now - W) / P), shownTicks = Math.min(1500, Math.floor(W / P))
  noStroke()
  for (let k = 0; k < shownTicks; k++) { const s = (first + k) * P; fill(on ? '#f2c14e' : 80); circle(x(s), 300, hz > 200 ? 1.5 : hz > 20 ? 3 : 10) }
  // a star that turns
  const a = TWO_PI * ((now / P) % 1)
  fill(40); circle(400, 450, 90); fill(on ? '#5b7fd1' : 70); circle(400 + 30 * Math.cos(a), 450 + 30 * Math.sin(a), 16)
  fill(235); textSize(18); textAlign(LEFT)
  text('PSR ' + pulsar + ': ' + ABOUT[pulsar], 90, 50)
  fill(140); textSize(14)
  text('a tick every ' + (P >= 0.01 ? nf(P * 1000, 1, 1) + ' ms' : nf(P * 1000, 1, 3) + ' ms') + ' = ' + nf(hz, 1, hz < 10 ? 2 : 0) + ' a second · ' + (hz < 20 ? 'heard as rhythm' : hz < 50 ? 'between rhythm and pitch: a buzz' : 'heard as a pitch'), 90, 76)
  text('the last 2 seconds', 40, 330)
  playButton(on)
}

${BUTTON}` }
      ]
    },
    {
      id: 'samples',
      title: 'Writing samples',
      label: 'Samples',
      text: 'Oscillators are ready-made; underneath them is a list of numbers. An **AudioBuffer** is such a list that we fill ourselves, sample by sample, with any formula, and then play. An **AudioWorklet** goes further: our own code runs inside the audio thread and writes every sample as it is needed, 128 at a time, so it can react to its settings live. Everything else in this lesson (strings, bells, grains) is built from these two.',
      boards: [
        { id: 'buffer', title: '3.1 · A sound is a list of numbers', w: 800, h: 600, ground: '#141414',
          idea: 'Two seconds of sound are 96,000 numbers (at 48,000 a second). Choose a recipe and click ▶: the sketch writes every number with a formula in a `for` loop, puts them in an `AudioBuffer` and plays it. **sine**: sin(2π·220·t). **additive**: the first eight harmonics of 1.3 in part A, added by hand. **noise**: a random number each time. **chirp**: a sine whose frequency rises from 100 to 2000 Hz. **beating**: two sines 3 Hz apart (440 and 443), whose sum swells and fades three times a second. Above, all two seconds (each column the loudest sample in it); below, the first 20 ms, one sample per dot.',
          pseudo: `buffer $\\leftarrow$ ctx.createBuffer(1, 2 $\\cdot f_s$, $f_s$); $d \\leftarrow$ its numbers
for $i = 0 \\ldots$ length: $t \\leftarrow i / f_s$; $d_i \\leftarrow$ recipe$(t)$
play: new AudioBufferSourceNode(buffer).start()`,
          p5: `// 3.1 A sound is a list of numbers: write two seconds of them with a formula, then play them. Click ▶.
const recipe = 'beating' /* sine|additive|noise|chirp|beating */
const RECIPES = {
  sine: t => Math.sin(TWO_PI * 220 * t),
  additive: t => { let s = 0; for (let n = 1; n <= 8; n++) s += Math.sin(TWO_PI * 110 * n * t) / n; return s / 2 },
  noise: t => Math.random() * 2 - 1,
  chirp: t => Math.sin(TWO_PI * (100 * t + 950 * t * t / 2)),     // frequency 100 + 950 t Hz: the phase is its integral
  beating: t => (Math.sin(TWO_PI * 440 * t) + Math.sin(TWO_PI * 443 * t)) / 2
}
let ac, buf = null, made = '', src = null, startedAt = 0

function setup() { createCanvas(800, 600) }

function write() {                             // every sample, one by one
  const sr = ac.sampleRate, b = ac.createBuffer(1, 2 * sr, sr), d = b.getChannelData(0), f = RECIPES[recipe]
  for (let i = 0; i < d.length; i++) {
    const t = i / sr, fade = Math.min(1, t / 0.01, (2 - t) / 0.01)   // 10 ms fades, so it does not click
    d[i] = 0.4 * f(t) * fade
  }
  buf = b; made = recipe
}

function mousePressed() {
  if (!onButton()) return
  if (!ac) ac = new AudioContext()
  ac.resume()
  if (made !== recipe) write()
  if (src) src.stop()
  src = new AudioBufferSourceNode(ac, { buffer: buf }); src.connect(ac.destination); src.start()
  startedAt = ac.currentTime
}

function draw() {
  background(20)
  if (ac && made !== recipe) write()
  if (!buf) { fill(150); textSize(15); text('click ▶ to write and play two seconds of ' + recipe, 90, 50); playButton(false); return }
  const d = buf.getChannelData(0), per = Math.floor(d.length / 720)
  noStroke(); fill('#5b7fd1')
  for (let c = 0; c < 720; c++) { let m = 0; for (let i = c * per; i < (c + 1) * per; i += 8) m = Math.max(m, Math.abs(d[i])); rect(40 + c, 200 - 250 * m, 1, 500 * m) }
  const playing = ac.currentTime - startedAt < 2
  if (playing) { stroke('#f2c14e'); line(40 + 360 * (ac.currentTime - startedAt), 80, 40 + 360 * (ac.currentTime - startedAt), 320) }
  const n = Math.round(0.02 * buf.sampleRate)
  noStroke(); fill('#f2c14e')
  for (let i = 0; i < n; i++) circle(40 + 720 * i / n, 460 - 220 * d[i + Math.round(0.5 * buf.sampleRate)], 2.5)
  fill(235); textSize(16); textAlign(LEFT); text(recipe + ': ' + d.length.toLocaleString() + ' numbers', 90, 50)
  fill(140); textSize(13); text('all two seconds', 40, 345); text('20 ms from the middle: ' + n + ' samples, one dot each', 40, 585)
  playButton(playing)
}

${BUTTON}` },

        { id: 'worklet', title: '3.2 · An AudioWorklet', w: 800, h: 600, ground: '#141414',
          idea: 'Our own code, running on the audio thread. The processor (the text in `PROCESSOR`) is a class with a `process()` method that the browser calls 375 times a second to fill 128 samples. It is a whole oscillator by hand: a **phase** that climbs by frequency ÷ sample rate each sample and wraps at 1 (that is a sawtooth). Then two destructive effects that need sample-level code: **bits** rounds each sample to fewer levels (a bit crusher: 16 bits is CD quality, 3 is grit) and **hold** keeps each sample for several (a sample-rate reducer, which folds high partials back down as aliases). Its settings are AudioParams, moved from the sketch with `setTargetAtTime` while it runs. Click ▶; drag up and down for the pitch.',
          pseudo: `class Crusher extends AudioWorkletProcessor:
  process(outputs, params): for each of the 128 samples:
    phase $\\leftarrow$ (phase $+ f / f_s$) mod 1;  $x \\leftarrow 2\\,$phase $- 1$    # a sawtooth
    every hold-th sample: $y \\leftarrow \\text{round}(x \\cdot 2^{b-1}) / 2^{b-1}$
    out $\\leftarrow y$`,
          p5: `// 3.2 An AudioWorklet: an oscillator and a bit crusher written sample by sample, on the audio thread. Click ▶; drag up and down for pitch.
const bits = 4 /* 1..16 */
const hold = 4 /* 1..40 */
const PROCESSOR = \`
class Crusher extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'frequency', defaultValue: 110 }, { name: 'bits', defaultValue: 4 }, { name: 'hold', defaultValue: 4 }]
  }
  constructor() { super(); this.phase = 0; this.y = 0; this.n = 0 }
  process(inputs, outputs, params) {
    const out = outputs[0][0]
    for (let i = 0; i < out.length; i++) {
      const f = params.frequency.length > 1 ? params.frequency[i] : params.frequency[0]
      this.phase = (this.phase + f / sampleRate) % 1               // a sawtooth, by hand
      const x = 2 * this.phase - 1
      if (this.n++ % Math.max(1, Math.round(params.hold[0])) === 0) {
        const levels = Math.pow(2, Math.max(1, params.bits[0]) - 1)
        this.y = Math.round(x * levels) / levels                     // fewer levels: crushed
      }
      out[i] = 0.25 * this.y
    }
    return true                                                      // keep running
  }
}
registerProcessor('crusher', Crusher)\`
let ac, node, scope, data, on = false, f = 110, ready = false

function setup() { createCanvas(800, 600) }

async function build() {
  ac = new AudioContext()
  const url = URL.createObjectURL(new Blob([PROCESSOR], { type: 'text/javascript' }))
  await ac.audioWorklet.addModule(url)         // load the processor into the audio thread
  node = new AudioWorkletNode(ac, 'crusher')
  scope = new AnalyserNode(ac, { fftSize: 2048 }); data = new Float32Array(2048)
  node.connect(scope)
  ready = true
}

async function mousePressed() {
  if (!onButton()) return
  if (!ac) await build()
  ac.resume(); on = !on
  if (on) scope.connect(ac.destination); else scope.disconnect()
}
function mouseDragged() { f = 55 * Math.pow(2, 4 * (1 - constrain(mouseY / height, 0, 1))) }

function draw() {
  background(20)
  if (ready) {
    const t = ac.currentTime, p = name => node.parameters.get(name)
    p('bits').setTargetAtTime(bits, t, 0.01); p('hold').setTargetAtTime(hold, t, 0.01); p('frequency').setTargetAtTime(f, t, 0.02)
    scope.getFloatTimeDomainData(data)
    let z = 0
    while (z < 1000 && !(data[z] <= 0 && data[z + 1] > 0)) z++
    noStroke(); fill('#f2c14e')
    for (let j = 0; j < 360; j++) circle(40 + 2 * j, 330 - 700 * data[z + j], 3)
  }
  noStroke(); fill(235); textSize(16); textAlign(LEFT)
  text(Math.round(f) + ' Hz · ' + bits + (bits > 1 ? ' bits (' : ' bit (') + Math.pow(2, bits) + ' levels) · each sample held ' + hold + ' times', 90, 50)
  fill(140); textSize(13); text('the samples, one dot each: the steps are the bits, the flat runs the holds', 40, 560)
  playButton(on)
}

${BUTTON}` }
      ]
    },
    {
      id: 'physical',
      title: 'Physical models',
      label: 'Physical',
      text: 'Instead of describing the sound, describe the **object** and let the sound follow. A plucked string is a wave running back and forth, losing a little at each end: a short delay line fed back into itself (**Karplus–Strong**, 1983). A struck bar, a bell, a glass or a drum rings at a few **modes**, each a sine that dies away at its own rate; where you strike decides which modes sound. Neither needs a recording, and both respond to how they are played.',
      boards: [
        { id: 'string', title: '4.1 · A plucked string (Karplus–Strong)', w: 800, h: 600, ground: '#141414',
          idea: 'Fill a short list with noise, one period long (N = sample rate ÷ frequency: 218 numbers for 220 Hz); then, again and again, play the first number and put back the average of the first two at the end. The averaging is a gentle low-pass, so the high partials die first and the noise turns, within milliseconds, into a plucked string. **damping** is how much it averages (0: bright and long, like steel; 0.5: dark, like nylon), **decay** how much is lost each trip. The six strings are tuned like a guitar (E A D G B E): click one, drag across them to strum, or play the keys 1–6. Each pluck is computed into a buffer, 3 seconds in a few milliseconds. The bright line on each string is its delay line as it sounds now: watch the noise turn smooth.',
          pseudo: `$N \\leftarrow f_s / f$; line $\\leftarrow N$ random numbers    # the pluck
for each sample: out $\\leftarrow$ line[$p$]
  line[$p$] $\\leftarrow$ decay $\\cdot ((1 - k)\\,$line[$p$] $+ k\\,$line[$p{+}1$])    # $k$: damping
  $p \\leftarrow (p + 1) \\bmod N$`,
          p5: `// 4.1 A plucked string (Karplus-Strong): noise in a short loop, averaged each trip. Click or drag across the strings, or keys 1-6.
const damping = 0.5 /* 0..0.5 */
const decay = 0.996 /* 0.97..0.9999 */
const TUNING = [82.41, 110, 146.83, 196, 246.94, 329.63]   // E2 A2 D3 G3 B3 E4
let ac, plucks = Array(6).fill(null), lastString = -1

function setup() { createCanvas(800, 600) }

function pluckBuffer(f) {                      // the whole string, simulated into 3 seconds of samples
  const sr = ac.sampleRate, N = Math.round(sr / f), len = 3 * sr
  const buf = ac.createBuffer(1, len, sr), out = buf.getChannelData(0), line = new Float32Array(N)
  for (let i = 0; i < N; i++) line[i] = Math.random() * 2 - 1   // the pluck: noise, one period long
  let p = 0
  for (let i = 0; i < len; i++) {
    out[i] = 0.25 * line[p]
    line[p] = decay * ((1 - damping) * line[p] + damping * line[(p + 1) % N])
    p = (p + 1) % N
  }
  return { buf, N }
}

function pluck(s) {
  if (!ac) ac = new AudioContext()
  ac.resume()
  const { buf, N } = pluckBuffer(TUNING[s])
  const src = new AudioBufferSourceNode(ac, { buffer: buf })
  src.connect(ac.destination); src.start()
  plucks[s] = { buf, N, t: ac.currentTime }
}

const stringAt = y => Math.floor((y - 120) / 70)
function mousePressed() { const s = stringAt(mouseY); if (s >= 0 && s < 6) { pluck(s); lastString = s } }
function mouseDragged() { const s = stringAt(mouseY); if (s >= 0 && s < 6 && s !== lastString) { pluck(s); lastString = s } }
function mouseReleased() { lastString = -1 }
function keyPressed() { const s = '123456'.indexOf(key); if (s >= 0) pluck(5 - s) }

function draw() {
  background(20)
  for (let s = 0; s < 6; s++) {
    const y = 155 + s * 70, p = plucks[s]
    stroke(70); strokeWeight(1 + (5 - s) * 0.4); line(40, y, 760, y)
    if (p && ac) {                             // the delay line as it sounds now: N samples, laid along the string
      const at = Math.floor((ac.currentTime - p.t) * p.buf.sampleRate), d = p.buf.getChannelData(0)
      if (at < d.length - p.N) {
        stroke('#f2c14e'); strokeWeight(2); noFill(); beginShape()
        for (let i = 0; i < p.N; i += Math.max(1, Math.floor(p.N / 300))) vertex(40 + 720 * i / p.N, y - 70 * d[at + i])
        endShape()
      }
    }
    noStroke(); fill(150); textSize(13); textAlign(RIGHT); text(['E2', 'A2', 'D3', 'G3', 'B3', 'E4'][s] + '  ' + (6 - s), 785, y + 4)
  }
  noStroke(); fill(235); textSize(16); textAlign(LEFT)
  text('damping ' + damping + ' · decay ' + decay + ' a trip · click, strum or keys 1-6', 40, 60)
}` },

        { id: 'modal', title: '4.2 · Struck objects: modes', w: 800, h: 600, ground: '#141414',
          idea: 'Strike a bar and it rings at a few frequencies at once, its **modes**, each a shape of vibration with a fixed number of still points (nodes). For a free bar the modes are at 1, 2.76, 5.40 and 8.93 times the lowest, not whole numbers, which is why a bar sounds metallic. A marimba bar is carved underneath to tune them to 1, 4 and 10. A bell has its own famous set (the hum an octave down, a minor third above the strike note). A glass and a drum head have others. Each mode here is one sine, struck loud and dying away, higher modes faster. **Where you strike matters**: click the bar near a mode\'s node and that mode stays silent; near the end, all of them sound. The curves are the mode shapes.',
          pseudo: `for each mode $k$ (ratio $r_k$):
  amplitude $\\leftarrow$ how much its shape moves where you struck: $|\\phi_k(x)|$
  a sine at $r_k f$, from that amplitude down to silence in $T / r_k^{0.7}$ seconds
the object $=$ the sum of its modes`,
          p5: `// 4.2 Struck objects: a few sines (modes), each dying away. Click the bar: where you strike decides which modes sound.
const material = 'bar' /* bar|marimba|bell|glass|drum */
const pitch = 220 /* 55..880 */
const ring = 2 /* 0.2..8 */
const MODES = {                                // frequency ratios of each mode (to the lowest)
  bar: [1, 2.756, 5.404, 8.933],
  marimba: [1, 3.93, 9.97],
  bell: [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011],
  glass: [1, 2.32, 4.25, 6.63, 9.38],
  drum: [1, 1.594, 2.136, 2.296, 2.653, 2.918]
}
let ac, last = { x: 0.1, t: -9 }

function setup() { createCanvas(800, 600) }

const shapeOf = (k, x) => Math.sin((k + 1) * PI * x + (k % 2 ? 0 : 0.6))   // a stand-in shape for mode k along the bar
function strike(x) {
  if (!ac) ac = new AudioContext()
  ac.resume()
  const t = ac.currentTime, out = new GainNode(ac, { gain: 0.3 })
  out.connect(ac.destination)
  MODES[material].forEach((r, k) => {
    const a = Math.abs(shapeOf(k, x)) / (k + 1) ** 0.4, T = ring / Math.pow(r, 0.7)
    const o = new OscillatorNode(ac, { frequency: pitch * r }), g = new GainNode(ac, { gain: 0 })
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.002)   // struck: up at once…
    g.gain.exponentialRampToValueAtTime(0.0001, t + T)                          // …then dying away
    o.connect(g).connect(out); o.start(t); o.stop(t + T)
  })
  last = { x, t }
}
function mousePressed() { if (mouseY > 380 && mouseY < 440 && mouseX > 60 && mouseX < 740) strike((mouseX - 60) / 680) }

function draw() {
  background(20)
  const now = ac ? ac.currentTime : 0, modes = MODES[material]
  modes.forEach((r, k) => {                    // each mode's shape, swinging as it rings
    const y0 = 90 + k * (260 / modes.length), age = now - last.t, T = ring / Math.pow(r, 0.7)
    const amp = age < T ? Math.abs(shapeOf(k, last.x)) * Math.exp(-5 * age / T) : 0
    stroke(amp > 0.01 ? '#f2c14e' : 60); strokeWeight(1.5); noFill(); beginShape()
    for (let i = 0; i <= 100; i++) vertex(60 + 6.8 * i, y0 - 30 * amp * shapeOf(k, i / 100) * Math.cos(TWO_PI * Math.min(r, 6) * 2 * age))
    endShape()
    noStroke(); fill(130); textSize(11); textAlign(RIGHT); text('× ' + r + '  ' + Math.round(pitch * r) + ' Hz', 790, y0 + 4)
  })
  noStroke(); fill(80); rect(60, 390, 680, 40, 4)
  fill('#c8664f'); circle(60 + 680 * last.x, 410, 14)
  fill(235); textSize(16); textAlign(LEFT); text(material + ' at ' + pitch + ' Hz: ' + modes.length + ' modes', 60, 50)
  fill(140); textSize(13); text('click the bar to strike it (the dot: where you struck last)', 60, 470)
}` }
      ]
    },
    {
      id: 'recordings',
      title: 'Recordings',
      label: 'Recordings',
      text: 'A recording is a buffer someone else filled. Played faster it is higher and shorter; played slower, lower and longer: speed and pitch go together, as on a turntable (**sampling**). Cut it into thousands of tiny overlapping pieces, **grains** of 20 to 200 ms, and they can be put back at any speed, any pitch, in any order: a voice frozen in mid-word, a cloud of it (**granular synthesis**, after Iannis Xenakis and Curtis Roads). The material is the Voyager Golden Record\'s greetings, sent into space in 1977 (public domain, in Assets › Samples).',
      boards: [
        { id: 'sampler', title: '5.1 · A sampler', w: 800, h: 600, ground: '#141414',
          idea: 'A recording played from the keyboard. Each key plays the sample at another **playback rate**: up a semitone is 2^(1/12) = 1.0595 times faster; an octave up is twice as fast and half as long. The keys A W S E D F T G Y H U J K go from seven semitones down (A) through the original (G: no change) to five up (K). Several keys at once play several copies (polyphony: each note is its own `AudioBufferSourceNode`). **reverse** plays it backwards. Click on the waveform to play from that point at the original speed. The dots are the playheads.',
          pseudo: `buffer $\\leftarrow$ decodeAudioData(await loadBytes('voyager-hello.mp3'))
note $s$ semitones from the middle: rate $\\leftarrow 2^{s/12}$
src $\\leftarrow$ new AudioBufferSourceNode(buffer, playbackRate: rate); src.start()
reverse: copy the samples backwards into a new buffer`,
          p5: `// 5.1 A sampler: a recording played at other speeds (and pitches). Keys A W S E D F T G Y H U J K; click the waveform to play from there.
const sample = 'hello' /* hello|greetings|lost chord */
const reverse = false /* toggle */
const KEYS = 'awsedftgyhujk'                    // G (the 8th) plays at the original speed
let ac, buffers = {}, bytes = {}, voices = []

async function setup() {
  createCanvas(800, 600)
  // the recordings, as bytes: in the studio from Assets › Samples; elsewhere, upload the files beside the sketch
  bytes = { hello: await loadBytes('voyager-hello.mp3'), greetings: await loadBytes('voyager-greetings.mp3'), 'lost chord': await loadBytes('edison-lost-chord.mp3') }
}

async function bufferFor(name, backwards) {
  const k = name + (backwards ? ' reversed' : '')
  if (!buffers[name]) buffers[name] = await ac.decodeAudioData(bytes[name].buffer.slice(0))
  if (backwards && !buffers[k]) {
    const b = buffers[name], r = ac.createBuffer(b.numberOfChannels, b.length, b.sampleRate)
    for (let c = 0; c < b.numberOfChannels; c++) r.getChannelData(c).set(b.getChannelData(c).slice().reverse())
    buffers[k] = r
  }
  return buffers[k]
}

async function play(semitones, from = 0) {
  if (!ac) ac = new AudioContext()
  ac.resume()
  const buf = await bufferFor(sample, reverse), rate = Math.pow(2, semitones / 12)
  const src = new AudioBufferSourceNode(ac, { buffer: buf, playbackRate: rate })
  src.connect(ac.destination); src.start(0, from * buf.duration)
  const v = { src, rate, from, t: ac.currentTime, dur: buf.duration }
  voices.push(v); src.onended = () => { voices = voices.filter(x => x !== v) }
}

function keyPressed() { const i = KEYS.indexOf(key.toLowerCase()); if (i >= 0) play(i - 7) }   // A: 7 semitones down … K: 5 up
function mousePressed() { if (mouseY > 120 && mouseY < 360) play(0, constrain((mouseX - 40) / 720, 0, 0.99)) }

function draw() {
  background(20)
  const buf = buffers[sample + (reverse ? ' reversed' : '')] || buffers[sample]
  if (buf) {
    const d = buf.getChannelData(0), per = Math.floor(d.length / 720)
    noStroke(); fill('#5b7fd1')
    for (let c = 0; c < 720; c++) { let m = 0; for (let i = c * per; i < (c + 1) * per; i += 16) m = Math.max(m, Math.abs(d[i])); rect(40 + c, 240 - 110 * m, 1, 220 * m) }
  }
  for (const v of voices) {                    // where each copy is now
    const pos = v.from + (ac.currentTime - v.t) * v.rate / v.dur
    fill('#f2c14e'); noStroke(); circle(40 + 720 * pos, 240, 14)
  }
  // the keys
  for (let i = 0; i < KEYS.length; i++) {
    const s = i - 7, x = 40 + i * 55
    fill(s === 0 ? '#c8664f' : 50); rect(x, 420, 48, 70, 4)
    fill(220); textSize(14); textAlign(CENTER); text(KEYS[i].toUpperCase(), x + 24, 448)
    fill(150); textSize(11); text((s > 0 ? '+' : '') + s, x + 24, 468); text('×' + nf(Math.pow(2, s / 12), 1, 2), x + 24, 483)
  }
  fill(235); textSize(16); textAlign(LEFT)
  text(buf ? sample + (reverse ? ', reversed' : '') + ' · ' + nf(buf.duration, 1, 1) + ' s · ' + voices.length + ' playing' : 'press a key or click (loading ' + sample + '…)', 40, 60)
  fill(140); textSize(13); text('semitones from the original, and how much faster', 40, 520)
}` },

        { id: 'granular', title: '5.2 · Granular synthesis', w: 800, h: 600, ground: '#141414',
          idea: 'Grains: tiny pieces of the recording, each with a smooth fade in and out, started many times a second at exact times by the scheduler of 2.1. **position** is where in the recording they come from (move the mouse over the waveform to scrub; hold still and the voice freezes mid-word); **size** how long each grain is; **density** how many a second; **spray** how far each one strays from the position; **pitch** shifts them all without changing the speed, which plain sampling cannot do; **jitter** gives each grain its own small random pitch, and the sound turns into a crowd. Each dot is a grain: where it was taken from, and how high.',
          pseudo: `every 25 ms, for each grain due in the next 0.1 s, at time $t$:
  offset $\\leftarrow$ position $+$ spray $\\cdot$ random$(-1, 1)$
  src.playbackRate $\\leftarrow 2^{(\\text{pitch} + \\text{jitter}\\cdot\\text{random})/12}$
  gain: 0 $\\to$ 1 $\\to$ 0 over size (a Hann window)
  src.start($t$, offset, size); next grain at $t + 1/\\text{density}$`,
          p5: `// 5.2 Granular synthesis: thousands of tiny pieces of a recording, re-sprayed. Click ▶; move over the waveform to choose where grains come from.
const size = 0.08 /* 0.01..0.4 */
const density = 30 /* 1..120 */
const spray = 0.02 /* 0..0.3 */
const pitch = 0 /* -24..24 */
const jitter = 0 /* 0..12 */
let ac, buf = null, bytes, on = false, next = 0, pos = 0.3, grains = [], hann

async function setup() {
  createCanvas(800, 600)
  bytes = await loadBytes('voyager-greetings.mp3')   // the Voyager Golden Record's greetings (in the studio: Assets › Samples)
  setInterval(scheduler, 25)
}

function grain(t) {
  const offset = constrain(pos + spray * (Math.random() * 2 - 1), 0, 1) * (buf.duration - size)
  const semis = pitch + jitter * (Math.random() * 2 - 1)
  const src = new AudioBufferSourceNode(ac, { buffer: buf, playbackRate: Math.pow(2, semis / 12) })
  const g = new GainNode(ac, { gain: 0 })
  g.gain.setValueCurveAtTime(hann, t, size)    // fade in and out: no clicks between grains
  src.connect(g).connect(ac.destination)
  src.start(t, offset, size * Math.pow(2, semis / 12) + 0.01)
  grains.push({ x: offset / buf.duration, y: semis, born: millis() })
}

function scheduler() {
  if (!on || !buf) return
  while (next < ac.currentTime + 0.1) { grain(next); next += 1 / density * (0.7 + 0.6 * Math.random()) }
}

async function mousePressed() {
  if (!onButton()) return
  if (!ac) {
    ac = new AudioContext()
    buf = await ac.decodeAudioData(bytes.buffer.slice(0))
    hann = new Float32Array(64).map((_, i) => 0.6 * Math.sin(PI * i / 63) ** 2)
  }
  ac.resume(); on = !on; next = ac.currentTime + 0.02
}
function mouseMoved() { if (mouseY > 120 && mouseY < 380) pos = constrain((mouseX - 40) / 720, 0, 1) }

function draw() {
  background(20)
  if (buf) {
    const d = buf.getChannelData(0), per = Math.floor(d.length / 720)
    noStroke(); fill(55)
    for (let c = 0; c < 720; c++) { let m = 0; for (let i = c * per; i < (c + 1) * per; i += 32) m = Math.max(m, Math.abs(d[i])); rect(40 + c, 250 - 110 * m, 1, 220 * m) }
  }
  stroke('#c8664f'); strokeWeight(2); line(40 + 720 * pos, 120, 40 + 720 * pos, 380)
  noStroke()
  grains = grains.filter(g => millis() - g.born < 1500)
  for (const g of grains) { const a = 1 - (millis() - g.born) / 1500; fill(242, 193, 78, 255 * a); circle(40 + 720 * g.x, 250 - 5 * g.y, 3 + 40 * size * a) }
  fill(235); textSize(16); textAlign(LEFT)
  text(buf ? density + ' grains a second, ' + Math.round(size * 1000) + ' ms each, from ' + nf(pos * buf.duration, 1, 1) + ' s' : 'click ▶ (the greetings are loading…)', 90, 50)
  fill(140); textSize(13); text('the Voyager greetings, 1977 · move over the waveform to choose the position · each dot a grain (higher: higher pitch)', 40, 440)
  playButton(on)
}

${BUTTON}` }
      ]
    },
    {
      id: 'together',
      title: 'Together',
      label: 'Together',
      text: 'One piece from everything in the lesson, all of it scheduled ahead on the audio clock: plucked strings (4.1) on a Euclidean rhythm (part A, 5.2), in a pentatonic scale; a cloud of grains from the Voyager greetings (5.2), drifting slowly through the recording; and, ticking under it as a hi-hat, the Vela pulsar at its real period (2.2).',
      boards: [
        { id: 'voyager', title: '6.1 · Voyager, plucked', w: 800, h: 600, ground: '#141414',
          idea: 'A small generative piece. A look-ahead clock (2.1) runs at the tempo; on each sixteenth a Euclidean rhythm decides whether a string is plucked (4.1, computed ahead into a buffer), on a note of the pentatonic scale chosen by a slow random walk. Behind it, grains of the Voyager greetings (5.2) drift from the start of the recording to its end, so the 55 languages pass by like stations on a radio. Under both, the Vela pulsar ticks every 89.33 ms (2.2), not in time with the tempo: two clocks that never quite agree. Press 1, 2, 3 to mute the strings, the grains, the pulsar. Each pluck draws a dot where its note is, each grain a speck.',
          pseudo: `every 25 ms, for everything due in the next 0.1 s:
  strings: on step $i$ if euclid($i$, hits, 16): pluck(pentatonic[walk]) at $t$
  grains: every $1/\\text{density}$ s, a grain from position $p$; $p$ drifts through the recording
  pulsar: a click every 89.33 ms`,
          p5: `// 6.1 Voyager, plucked: strings on a Euclidean rhythm, grains of the Voyager greetings, the Vela pulsar ticking. Click ▶; keys 1 2 3 mute.
const tempo = 96 /* 60..160 */
const hits = 7 /* 1..16 */
const grainDensity = 12 /* 0..60 */
const SCALE = [0, 3, 5, 7, 10]                 // minor pentatonic
const VELA = 0.08933                           // seconds per turn
let ac, voice = null, bytes, on = false, mute = [false, false, false]
let nextStep = 0, nextGrain = 0, nextTick = 0, count = 0, walk = 5, drift = 0, dots = [], specks = [], hann, click, out

async function setup() {
  createCanvas(800, 600)
  bytes = await loadBytes('voyager-greetings.mp3')
  setInterval(scheduler, 25)
}

function pluck(f, t) {                         // Karplus-Strong (4.1), into a buffer, started at t
  const sr = ac.sampleRate, N = Math.round(sr / f), len = 2 * sr, b = ac.createBuffer(1, len, sr), d = b.getChannelData(0), line = new Float32Array(N)
  for (let i = 0; i < N; i++) line[i] = Math.random() * 2 - 1
  for (let i = 0, p = 0; i < len; i++) { d[i] = 0.3 * line[p]; line[p] = 0.995 * 0.5 * (line[p] + line[(p + 1) % N]); p = (p + 1) % N }
  const s = new AudioBufferSourceNode(ac, { buffer: b }); s.connect(out); s.start(t)
}
function grain(t) {                            // a grain (5.2)
  const g = new GainNode(ac, { gain: 0 }), s = new AudioBufferSourceNode(ac, { buffer: voice, playbackRate: Math.random() < 0.3 ? 0.5 : 1 })
  g.gain.setValueCurveAtTime(hann, t, 0.15)
  s.connect(g).connect(out); s.start(t, constrain(drift + 0.01 * (Math.random() - 0.5), 0, 0.99) * (voice.duration - 0.2), 0.32)
}
function tick(t) {                             // the pulsar (2.2)
  const s = new AudioBufferSourceNode(ac, { buffer: click }), g = new GainNode(ac, { gain: 0.12 })
  s.connect(g).connect(out); s.start(t)
}

function scheduler() {
  if (!on || !voice) return
  const horizon = ac.currentTime + 0.1, sixteenth = 60 / tempo / 4
  while (nextStep < horizon) {
    if (!mute[0] && ((count * hits) % 16) < hits) {
      walk = constrain(walk + Math.floor(Math.random() * 5) - 2, 0, 9)
      const m = 45 + 12 * Math.floor(walk / 5) + SCALE[walk % 5]
      pluck(440 * Math.pow(2, (m - 69) / 12), nextStep)
      dots.push({ x: (count % 16) / 16, m, born: millis() + (nextStep - ac.currentTime) * 1000 })
    }
    count++; nextStep += sixteenth
  }
  while (nextGrain < horizon) {
    if (!mute[1] && grainDensity > 0) { grain(nextGrain); specks.push({ x: drift, born: millis() }) }
    drift = (drift + 0.0004) % 1
    nextGrain += 1 / Math.max(1, grainDensity)
  }
  while (nextTick < horizon) { if (!mute[2]) tick(nextTick); nextTick += VELA }
}

async function mousePressed() {
  if (!onButton()) return
  if (!ac) {
    ac = new AudioContext()
    voice = await ac.decodeAudioData(bytes.buffer.slice(0))
    hann = new Float32Array(64).map((_, i) => 0.3 * Math.sin(PI * i / 63) ** 2)
    click = ac.createBuffer(1, 200, ac.sampleRate)
    click.getChannelData(0).forEach((_, i, d) => { d[i] = (Math.random() * 2 - 1) * Math.exp(-i / 30) })
    out = new GainNode(ac, { gain: 0.8 }); out.connect(ac.destination)
  }
  ac.resume(); on = !on
  const t = ac.currentTime + 0.05; nextStep = nextGrain = nextTick = t
}
function keyPressed() { const i = '123'.indexOf(key); if (i >= 0) mute[i] = !mute[i] }

function draw() {
  background(20, 20, 26, 40)
  noStroke()
  for (const d of dots) {
    const age = (millis() - d.born) / 4000
    if (age < 0 || age > 1) continue
    fill(242, 193, 78, 255 * (1 - age)); circle(60 + 680 * d.x, 520 - (d.m - 45) * 14, 8 + 20 * (1 - age))
  }
  dots = dots.filter(d => millis() - d.born < 4000)
  for (const s of specks) { const age = (millis() - s.born) / 2000; fill(91, 127, 209, 200 * (1 - age)); circle(40 + 720 * s.x + random(-30, 30), 150 + random(-40, 40), 2.5) }
  specks = specks.filter(s => millis() - s.born < 2000)
  if (on && !mute[2]) { fill(200); circle(760, 60, 4 + 6 * (((ac.currentTime / VELA) % 1) < 0.2)) }
  fill(20); rect(0, 0, width, 82)
  fill(235); textSize(16); textAlign(LEFT)
  text(on ? 'strings ' + hits + '/16 · grains from ' + nf(drift * 100, 1, 0) + '% of the greetings · Vela, every 89.33 ms' : 'Voyager, plucked', 90, 50)
  fill(150); textSize(13); text(['1 strings', '2 grains', '3 pulsar'].map((p, i) => p + (mute[i] ? ' (muted)' : '')).join(' · ') + (on && !voice ? ' · loading…' : ''), 90, 72)
  playButton(on)
}

${BUTTON}` }
      ]
    },
    {
      id: 'hands',
      title: 'Strings in the air',
      label: 'Hands',
      text: 'The strings of 4.1 and the struck objects of 4.2 do not have to sit in rows. Draw a string anywhere, at any angle, and let **where it is** decide how it sounds: its height chooses a note, its length an octave, its slant its tone. Snap every note to a **scale** and anything you draw is in tune, so the space itself becomes the instrument. The standalone demo **[Strings in the Air](demos/hand-strings.html)** plays it with your hands through the camera (MediaPipe): you see yourself in a mirror, pinch with both hands and pull to stretch a string, join thumbs and index fingers in a ring to make a drum or a bell, swipe to pluck, poke to hit, pinch to move. Your face plays too: open your mouth to brighten the sound, raise your brows for reverb, smile for vibrato, close your eyes for long sustain. It is one HTML file: save it and open it anywhere.',
      boards: [
        { id: 'strings-in-space', title: '7.1 · Strings in space', w: 800, h: 600, ground: '#141414',
          idea: 'Drag to stretch a string; move the mouse across strings to pluck them, faster for louder. Each string is the Karplus–Strong loop of 4.1, but its note comes from **where** it is: the height of its middle picks a step of the scale (the top is high), a short string goes up an octave and a long one down, and a **level** string is bright steel while an **upright** one is dark nylon (the slant sets the damping). Change **scale** and every string retunes at once. The picture is the string as a sum of its **modes** (as in 4.2), slowed down so the eye can follow: right after a pluck it ripples with several, and the higher ones die first. The full version, played with both hands in front of a camera, with pads you hit and a face that modulates the sound, is the standalone demo [Strings in the Air](demos/hand-strings.html).',
          pseudo: `step $\\leftarrow \\lfloor$ height $\\times$ (steps in two octaves) $\\rfloor$;  octave $\\leftarrow$ +1 if short, −1 if long
note $\\leftarrow$ root $+$ scale[step mod $n$] $+ 12\\,\\lfloor$step$/n\\rfloor$ $+ 12\\cdot$octave    # always in the scale
damping $\\leftarrow 0.06 + 0.42\\,|\\sin(\\text{angle})|$    # level: bright; upright: dark
pluck when the mouse's path crosses the string: at $t$ along it, as hard as it was fast`,
          p5: `// 7.1 Strings in space: drag to draw a string anywhere; move across strings to pluck. Height: note (in the scale); length: octave; slant: tone.
const scaleName = 'minor pentatonic' /* major pentatonic|minor pentatonic|major|dorian|hirajoshi */
const rootNote = 50 /* 36..60 */
const SCALES = { 'major pentatonic': [0, 2, 4, 7, 9], 'minor pentatonic': [0, 3, 5, 7, 10], major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], hirajoshi: [0, 2, 3, 7, 8] }
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
let ac, strings = [], drawing = null, prev = null, prevT = 0

function setup() {
  createCanvas(800, 600)
  strings = [[150, 200, 330, 150], [470, 150, 650, 200], [200, 330, 260, 480], [400, 380, 640, 380]].map(p => tune({ a: { x: p[0], y: p[1] }, b: { x: p[2], y: p[3] } }))
}

function tune(s) {                             // where the string is decides how it sounds
  const sc = SCALES[scaleName], n = sc.length
  const my = (s.a.y + s.b.y) / 2, len = dist(s.a.x, s.a.y, s.b.x, s.b.y)
  const step = Math.floor(constrain(1 - my / height, 0, 0.999) * (2 * n + 1))   // height: a step of the scale
  const octave = len < 160 ? 1 : len > 420 ? -1 : 0                             // length: the octave
  s.midi = rootNote + 12 * Math.floor(step / n) + sc[step % n] + 12 * octave
  s.damp = 0.06 + 0.42 * Math.abs(Math.sin(Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x)))   // slant: the tone
  return s
}

function pluck(s, pos, vel) {                  // 4.1's loop, with the pluck position as a comb on the noise
  if (!ac) ac = new AudioContext()
  ac.resume()
  const sr = ac.sampleRate, f = 440 * 2 ** ((s.midi - 69) / 12), N = Math.round(sr / f - s.damp), len = 3 * sr
  const buf = ac.createBuffer(1, len, sr), out = buf.getChannelData(0), ln = new Float32Array(N)
  const P = Math.max(1, Math.round(pos * N)), noiseLine = Array.from({ length: N }, () => Math.random() * 2 - 1)
  for (let i = 0; i < N; i++) ln[i] = noiseLine[i] - noiseLine[(i + P) % N]
  const loss = 10 ** (-3 / (3 * f))              // lose 60 dB in 3 seconds, whatever the note
  let p = 0, last = 0
  for (let i = 0; i < len; i++) {
    const v = ln[p]; out[i] = 0.2 * v
    ln[p] = loss * ((1 - s.damp) * v + s.damp * last); last = v
    p = (p + 1) % N
  }
  const src = new AudioBufferSourceNode(ac, { buffer: buf }), g = new GainNode(ac, { gain: 0.2 + 0.8 * vel })
  src.connect(g).connect(ac.destination); src.start()
  s.hit = { t: millis(), vel, pos }
}

function crossing(p, q, a, b) {                // where the path p->q crosses the string a-b (0..1), or -1
  const r = { x: q.x - p.x, y: q.y - p.y }, d = { x: b.x - a.x, y: b.y - a.y }, den = r.x * d.y - r.y * d.x
  if (Math.abs(den) < 1e-9) return -1
  const u = ((a.x - p.x) * d.y - (a.y - p.y) * d.x) / den, t = ((a.x - p.x) * r.y - (a.y - p.y) * r.x) / den
  return u >= 0 && u <= 1 && t > 0.03 && t < 0.97 ? t : -1
}

function mousePressed() { drawing = { a: { x: mouseX, y: mouseY }, b: { x: mouseX, y: mouseY } } }
function mouseDragged() { if (drawing) drawing.b = { x: mouseX, y: mouseY } }
function mouseReleased() {
  if (drawing && dist(drawing.a.x, drawing.a.y, drawing.b.x, drawing.b.y) > 40) { const s = tune(drawing); strings.push(s); pluck(s, 0.3, 0.6) }
  drawing = null
}
function mouseMoved() {                        // the mouse's path since the last frame: a fingertip
  const q = { x: mouseX, y: mouseY }
  if (prev) {
    const vel = constrain(dist(prev.x, prev.y, q.x, q.y) / max(8, millis() - prevT) / 1.5, 0.15, 1)
    for (const s of strings) { const t = crossing(prev, q, s.a, s.b); if (t >= 0) pluck(s, t, vel) }
  }
  prev = q; prevT = millis()
}

function draw() {
  background(20)
  for (const s of [...strings, drawing].filter(Boolean)) {
    if (s === drawing) tune(s)
    const age = s.hit ? (millis() - s.hit.t) / 1000 : 9, A = s.hit ? s.hit.vel * min(40, 0.12 * dist(s.a.x, s.a.y, s.b.x, s.b.y)) * Math.exp(-age * 1.8) : 0
    const L = dist(s.a.x, s.a.y, s.b.x, s.b.y), nx = -(s.b.y - s.a.y) / L, ny = (s.b.x - s.a.x) / L, pos = s.hit ? s.hit.pos : 0.5
    colorMode(HSB); stroke((s.midi % 12) * 30, 60, 100); colorMode(RGB)
    strokeWeight(1.5 + 2.5 * (1 - s.damp)); noFill(); beginShape()
    for (let i = 0; i <= 100; i++) {           // the string as a sum of its first 8 modes (slowed down so you can see them):
      const u = i / 100; let d = 0              // where you plucked decides how much of each; the higher ones die sooner
      for (let n = 1; n <= 8; n++) d += Math.sin(n * PI * pos) / n * Math.exp(-age * n * (0.5 + 3 * s.damp)) * Math.sin(n * PI * u) * Math.cos(TWO_PI * 2.5 * Math.sqrt(n) * n * age)
      vertex(lerp(s.a.x, s.b.x, u) + nx * 1.4 * A * d, lerp(s.a.y, s.b.y, u) + ny * 1.4 * A * d)
    }
    endShape()
    noStroke(); fill(200); textSize(12); textAlign(CENTER)
    text(NAMES[s.midi % 12] + (Math.floor(s.midi / 12) - 1), (s.a.x + s.b.x) / 2 + nx * 16, (s.a.y + s.b.y) / 2 + ny * 16)
  }
  noStroke(); fill(235); textSize(16); textAlign(LEFT)
  text(scaleName + ' from ' + NAMES[rootNote % 12] + ' · drag to draw a string · move across to pluck', 30, 40)
  fill(130); textSize(13); text('height: the note · length: the octave · slant: steel (level) to nylon (upright)', 30, 64)
}` }
      ]
    }
  ],
  bibliography: [
    { title: 'Web Audio', items: [
      ['W3C. Web Audio API (the specification).', 'https://www.w3.org/TR/webaudio/'],
      ['MDN Web Docs. Web Audio API: the guide and reference.', 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API'],
      ['MDN Web Docs. AudioWorklet.', 'https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet'],
      ['Chris Wilson (2013). A tale of two clocks: scheduling Web Audio with precision. The look-ahead scheduler of 2.1.', 'https://web.dev/articles/audio-scheduling']
    ] },
    { title: 'Strings, modes, grains, pulsars', items: [
      ['Kevin Karplus, Alex Strong (1983). Digital synthesis of plucked-string and drum timbres. *Computer Music Journal* 7(2), 43–55.', 'https://doi.org/10.2307/3680062'],
      ['David A. Jaffe, Julius O. Smith (1983). Extensions of the Karplus-Strong plucked-string algorithm. *Computer Music Journal* 7(2), 56–69.', 'https://doi.org/10.2307/3680063'],
      ['Julius O. Smith III. *Physical Audio Signal Processing*. CCRMA, Stanford. Free online: strings, waveguides, modes.', 'https://ccrma.stanford.edu/~jos/pasp/'],
      ['Antony Hewish, Jocelyn Bell, John Pilkington, Paul Scott, Robin Collins (1968). Observation of a rapidly pulsating radio source. *Nature* 217, 709–713. The first pulsar.', 'https://doi.org/10.1038/217709a0'],
      ['Jason Hessels et al. (2006). A radio pulsar spinning at 716 Hz. *Science* 311, 1901–1904.', 'https://doi.org/10.1126/science.1123430']
    ] },
    { title: 'Hands and faces', items: [
      ['Google. MediaPipe hand landmarker: 21 points per hand, in the browser.', 'https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker'],
      ['Google. MediaPipe face landmarker: 478 points and 52 expression scores (blendshapes).', 'https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker'],
      ['Michel Waisvisz and *The Hands* (1984): an instrument played by moving the hands in the air, made at STEIM.', 'https://en.wikipedia.org/wiki/Michel_Waisvisz']
    ] }
  ]
};
