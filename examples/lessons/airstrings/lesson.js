/**
 * Lesson: Strings in the Air. An instrument played with the body in front of a camera, built one idea at a time: hands as numbers,
 * a pinch, a string between two pinches, a pluck, tuning by place, pads made by a ring of fingers, the face as a controller, claps that
 * throw balls, MIDI in and out, and at the end the whole instrument (public/demos/hand-strings.html) on a board of its own.
 *
 * Built by the sampling lesson's scene builder (`/lesson airstrings`). Every board is a p5.js sketch that opens the camera with
 * createCapture and runs MediaPipe (Tasks Vision, from jsDelivr) itself, so it can be copied into the p5 editor as it is. The sound is
 * plain Web Audio (the strings and bells of the Web Audio lesson, 4.1 and 4.2). Each sketch also plays with the mouse, without a camera.
 * The shared pieces (camera and tracker, hands, pinch, strings, struck objects, tuning) are written once below and pasted into each sketch.
 * Names p5 already uses (scale, key, color, noise…) are not used as globals.
 */

const AUDIO = `function audio() { if (!ac) ac = new AudioContext(); ac.resume(); return ac }
let ac, OUT = null                               // where the voices go (a sketch may put a filter or an echo in the way)
const output = () => OUT || ac.destination`;

const START = `function startButton() {                // ▶ starts the camera (the browser asks first); a dot while it runs
  noStroke(); fill(started ? 60 : '#c8664f'); circle(44, 44, 44)
  fill(235)
  if (started) circle(44, 44, 14)
  else triangle(37, 33, 37, 55, 56, 44)
}
const onStart = () => dist(mouseX, mouseY, 44, 44) < 24`;

const CAMERA = `// The camera, mirrored, and a MediaPipe tracker on it, loaded from a CDN on the first click of ▶.
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21'
const MODELS = 'https://storage.googleapis.com/mediapipe-models/'
let cam, camReady = false, tracker = null, started = false, lastSeen = -1, lastAnswer = null
async function start(kind) {
  started = true; audio()
  cam = createCapture(VIDEO, () => { camReady = true }); cam.hide()
  const mp = await import(MP + '/vision_bundle.mjs'), files = await mp.FilesetResolver.forVisionTasks(MP + '/wasm')
  const [Task, path, extra] = kind === 'face'
    ? [mp.FaceLandmarker, 'face_landmarker/face_landmarker/float16/1/face_landmarker.task', { numFaces: 1, outputFaceBlendshapes: true }]
    : [mp.HandLandmarker, 'hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task', { numHands: 2 }]
  for (const delegate of ['GPU', 'CPU']) {       // the graphics card if it can, else the processor
    try { tracker = await Task.createFromOptions(files, { baseOptions: { modelAssetPath: MODELS + path, delegate }, runningMode: 'VIDEO', ...extra }); break }
    catch (err) { console.warn(err) }
  }
}
function track() {                               // the tracker's answer for the camera's latest frame (asked once a frame)
  if (!tracker || !camReady || cam.elt.readyState < 2) return null
  if (cam.elt.currentTime !== lastSeen) { lastSeen = cam.elt.currentTime; lastAnswer = tracker.detectForVideo(cam.elt, performance.now()) }
  return lastAnswer
}
const mirror = p => ({ x: (1 - p.x) * width, y: p.y * height })   // flipped left to right: you see yourself as in a mirror
function drawCamera(alpha) {
  if (!camReady) return
  push(); translate(width, 0); scale(-1, 1); tint(255, alpha); image(cam, 0, 0, width, height); pop()
}`;

const HANDS = `let hands = []                                  // each hand: 21 points in the canvas's pixels (0 wrist, 4 thumb tip, 8 index tip…)
function readHands() {
  const r = track()
  if (r) hands = r.landmarks.map(h => h.map(mirror)).sort((a, b) => a[0].x - b[0].x)   // the hand on the left of the screen first
}
const BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [17, 18], [18, 19], [19, 20], [0, 17]]
function drawHand(h, c) { stroke(c); strokeWeight(2); for (const [a, b] of BONES) line(h[a].x, h[a].y, h[b].x, h[b].y) }
const handSize = h => dist(h[0].x, h[0].y, h[9].x, h[9].y)   // wrist to the middle knuckle: bigger when the hand is near`;

const PINCH = `// A pinch: the thumb tip (4) near the index tip (8), measured in hand sizes, with two thresholds so it does not flicker.
let pinching = [false, false]
function pinches() {                             // for each hand: { x, y, on, d }
  return hands.slice(0, 2).map((h, i) => {
    const d = dist(h[4].x, h[4].y, h[8].x, h[8].y) / handSize(h)
    pinching[i] = pinching[i] ? d < 0.5 : d < 0.28
    return { x: (h[4].x + h[8].x) / 2, y: (h[4].y + h[8].y) / 2, on: pinching[i], d }
  })
}`;

const CROSS = `// Where the path p→q crosses the string a–b: 0..1 along the string, or -1 if it does not.
function crossing(p, q, a, b) {
  const rx = q.x - p.x, ry = q.y - p.y, sx = b.x - a.x, sy = b.y - a.y, den = rx * sy - ry * sx
  if (Math.abs(den) < 1e-9) return -1
  const u = ((a.x - p.x) * sy - (a.y - p.y) * sx) / den, t = ((a.x - p.x) * ry - (a.y - p.y) * rx) / den
  return u >= 0 && u <= 1 && t >= 0 && t <= 1 ? t : -1
}`;

const STRING = `// Karplus-Strong (Web Audio lesson 4.1): noise in a loop one period long, averaged on each trip. pos: where it is plucked (0..1).
function pluckSound(freq, pos, vel, damping, pan) {
  audio()
  const sr = ac.sampleRate, N = Math.max(2, Math.round(sr / freq - damping)), len = 3 * sr
  const buf = ac.createBuffer(1, len, sr), out = buf.getChannelData(0), loop = new Float32Array(N)
  const noise = Array.from({ length: N }, () => Math.random() * 2 - 1), P = Math.max(1, Math.round(pos * N))
  for (let i = 0; i < N; i++) loop[i] = noise[i] - noise[(i + P) % N]     // plucked at pos: a comb on the noise
  const loss = Math.pow(10, -3 / (3 * freq))     // 60 dB quieter after 3 seconds, whatever the note
  let p = 0, last = 0
  for (let i = 0; i < len; i++) {
    const v = loop[p]; out[i] = 0.2 * v
    loop[p] = loss * ((1 - damping) * v + damping * last); last = v
    p = (p + 1) % N
  }
  const src = new AudioBufferSourceNode(ac, { buffer: buf })
  if (typeof onVoice === 'function') onVoice(src)   // (a sketch may wire each voice, for vibrato)
  src.connect(new GainNode(ac, { gain: 0.2 + 0.8 * vel })).connect(new StereoPannerNode(ac, { pan: pan || 0 })).connect(output())
  src.start()
}`;

const DRAWSTRING = `function drawString(s, col) {                // the string as the sum of its first 8 modes, slowed down so the eye can follow
  const L = dist(s.a.x, s.a.y, s.b.x, s.b.y) || 1, nx = -(s.b.y - s.a.y) / L, ny = (s.b.x - s.a.x) / L
  const age = s.hit ? (millis() - s.hit.t) / 1000 : 9, A = s.hit ? s.hit.vel * min(40, 0.12 * L) * Math.exp(-age * 1.8) : 0, pos = s.hit ? s.hit.pos : 0.5
  stroke(col); strokeWeight(3); noFill(); beginShape()
  for (let i = 0; i <= 100; i++) {
    const u = i / 100; let d = 0                 // where it was plucked decides how much of each mode; the higher ones die first
    if (A > 0.2) for (let n = 1; n <= 8; n++) d += Math.sin(n * PI * pos) / n * Math.exp(-age * n * 0.8) * Math.sin(n * PI * u) * Math.cos(TWO_PI * 2.5 * Math.sqrt(n) * n * age)
    vertex(lerp(s.a.x, s.b.x, u) + nx * 1.4 * A * d, lerp(s.a.y, s.b.y, u) + ny * 1.4 * A * d)
  }
  endShape()
  noStroke(); fill(col); circle(s.a.x, s.a.y, 9); circle(s.b.x, s.b.y, 9)
}`;

const TUNE = `const SCALES = { 'major pentatonic': [0, 2, 4, 7, 9], 'minor pentatonic': [0, 3, 5, 7, 10], major: [0, 2, 4, 5, 7, 9, 11], dorian: [0, 2, 3, 5, 7, 9, 10], hirajoshi: [0, 2, 3, 7, 8] }
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
const noteName = m => NAMES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1)
const mtof = m => 440 * Math.pow(2, (m - 69) / 12)
function tune(s) {                               // where a string is decides how it sounds
  const sc = SCALES[scaleName], n = sc.length
  const my = (s.a.y + s.b.y) / 2, len = dist(s.a.x, s.a.y, s.b.x, s.b.y)
  const step = Math.floor(constrain(1 - my / height, 0, 0.999) * (2 * n + 1))   // height: a step of the scale, two octaves
  const octave = len < 160 ? 1 : len > 420 ? -1 : 0                             // length: the octave (short is high)
  s.midi = rootNote + 12 * Math.floor(step / n) + sc[step % n] + 12 * octave
  s.damping = 0.06 + 0.42 * Math.abs(Math.sin(Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x)))   // slant: level is bright, upright is dark
  s.pan = constrain((s.a.x + s.b.x) / width - 1, -0.8, 0.8)                    // left-right: stereo
  return s
}
const hue = m => ((m % 12) + 12) % 12 * 30`;

const MODES = `// Struck objects (Web Audio lesson 4.2): a few sines, each dying at its own rate. where: 0 the centre … 1 the edge.
const MATERIALS = {
  glass: { modes: [1, 2.32, 4.25, 6.63, 9.38], ring: 3 },
  bell: { modes: [0.5, 1, 1.183, 1.506, 2, 2.514, 2.662, 3.011], ring: 4 },
  vibes: { modes: [1, 2.756, 5.404, 8.933], ring: 2.5 },
  marimba: { modes: [1, 3.93, 9.97], ring: 1 },
  drum: { modes: [1, 1.594, 2.136, 2.296, 2.653, 2.918], ring: 0.5 }
}
function hitSound(freq, material, where, vel, pan) {
  audio()
  const m = MATERIALS[material], t = ac.currentTime + 0.005
  const out = new GainNode(ac, { gain: 0.2 * (0.3 + 0.7 * vel) })
  out.connect(new StereoPannerNode(ac, { pan: pan || 0 })).connect(output())
  m.modes.forEach((r, k) => {
    const a = k === 0 ? 1 - 0.55 * where : (0.2 + 0.8 * where) / Math.sqrt(k + 1), T = m.ring / Math.pow(r, 0.6)   // centre: pure; edge: ringing
    const o = new OscillatorNode(ac, { frequency: freq * r }), env = new GainNode(ac, { gain: 0 })
    env.gain.setValueAtTime(0, t); env.gain.linearRampToValueAtTime(a, t + 0.002); env.gain.exponentialRampToValueAtTime(0.0001, t + T)
    o.connect(env).connect(out); o.start(t); o.stop(t + T + 0.05)
  })
}`;

const STATUS = `function status(lines) {                      // the title line and a hint under it
  noStroke(); fill(235); textSize(16); textAlign(LEFT); text(lines[0], 90, 42)
  fill(150); textSize(13); text(lines[1] || '', 90, 64)
}
const cameraLine = what => !started ? 'click ▶ to start the camera (or use the mouse)' : !tracker ? 'loading the tracker…' : what`;

export const LESSON = {
  title: 'Strings in the Air: an instrument for the body',
  subtitle: 'Hands, a face and a camera; strings you stretch between two pinches, drums you make with a ring of fingers, claps that throw balls, MIDI in and out. Built one idea at a time, in p5.js, MediaPipe and Web Audio.',
  idea: 'A camera and a hand tracker turn your body into numbers: 21 points on each hand, 478 on the face, and how open your mouth is. From a few of those numbers we build an instrument: a pinch is a hand closing, a string is two pinches, a pluck is a fingertip crossing a line, and where a thing is decides how it sounds, always in tune.',
  main: 'hands',
  codePanel: true,
  sources: {},
  sections: [
    {
      id: 'hands',
      title: 'Hands as numbers',
      label: 'Hands',
      text: 'A **hand landmarker** (MediaPipe, from Google, running in the browser) looks at each frame of the camera and answers with 21 points for each hand it sees: the wrist, four joints on each finger and the fingertips, as fractions of the picture (0 to 1). We flip the picture left to right so it behaves like a **mirror**, and multiply by the canvas size. Everything after this is arithmetic on those points. The first useful one is the **pinch**: the thumb tip and the index tip close together. To make it work near and far from the camera, the distance is measured in **hand sizes** (wrist to the middle knuckle), and two thresholds (start below 0.28, end above 0.5) keep it from flickering.',
      boards: [
        { id: 'hands', title: '1.1 · Your hands, as numbers', w: 800, h: 600, ground: '#141414',
          idea: 'Click ▶ and allow the camera. MediaPipe\'s hand landmarker finds up to two hands and gives **21 points** each: 0 is the wrist, 4 the thumb tip, 8 the index tip, 12, 16 and 20 the other fingertips. They come as fractions of the picture; `mirror()` flips them (so your right hand is on the right, as in a mirror) and scales them to the canvas. The lines between the points are the bones (`BONES`). The **hand size**, wrist to the middle knuckle, tells how near the hand is: we will measure everything else in it.',
          pseudo: `each frame: answer $\\leftarrow$ tracker.detect(camera frame)
for each hand: 21 points $(u, v) \\in [0,1]^2$
on screen: $x = (1 - u)\\cdot$width, $y = v\\cdot$height    # mirrored
hand size $= |p_0 - p_9|$    # wrist to middle knuckle`,
          p5: `// 1.1 Your hands, as numbers: the camera, mirrored, and 21 points on each hand. Click ▶ and allow the camera.
${AUDIO}
${CAMERA}
${HANDS}

function setup() { createCanvas(800, 600) }
function mousePressed() { if (onStart() && !started) start('hands') }

function draw() {
  background(20)
  drawCamera(110)
  readHands()
  hands.forEach((h, i) => {
    drawHand(h, i ? '#5b7fd1' : '#f2c14e')
    noStroke(); fill(235); textSize(11)
    h.forEach((p, j) => {
      circle(p.x, p.y, [4, 8, 12, 16, 20].includes(j) ? 10 : 5)
      if ([0, 4, 8, 12, 16, 20].includes(j)) text(j, p.x + 8, p.y - 6)
    })
  })
  if (!started) { noStroke(); fill('#f2c14e'); circle(mouseX, mouseY, 10) }   // no camera yet: the mouse is a fingertip
  const h = hands[0]
  status([cameraLine(hands.length + (hands.length === 1 ? ' hand' : ' hands') + ' · 21 points each'),
    h ? 'index tip (8): ' + nf(h[8].x, 1, 0) + ', ' + nf(h[8].y, 1, 0) + ' px · hand size ' + nf(handSize(h), 1, 0) + ' px' : 'the numbers on the points are their indices']
  )
  startButton()
}

${START}
${STATUS}` },

        { id: 'pinch', title: '1.2 · A pinch', w: 800, h: 600, ground: '#141414',
          idea: 'Bring your thumb and index finger together: the ring closes and fills, and while you pinch you leave a trail. The bar at the bottom is the measure: the distance between the two tips **divided by the hand size**, so it reads the same near the camera and far from it. A pinch **starts** below 0.28 and **ends** above 0.5: between the two it keeps what it was (*hysteresis*), so a trembling hand does not flicker on and off. With no camera, the mouse button is the pinch.',
          pseudo: `$d \\leftarrow |p_4 - p_8|\\,/\\,$hand size
if not pinching and $d < 0.28$: pinching $\\leftarrow$ true
if pinching and $d > 0.5$: pinching $\\leftarrow$ false    # in between: unchanged
the pinch point $= (p_4 + p_8)/2$`,
          p5: `// 1.2 A pinch: thumb and index together, in hand sizes, with two thresholds. Pinch and move to leave a trail. The mouse button pinches too.
${AUDIO}
${CAMERA}
${HANDS}
${PINCH}
let trail = []

function setup() { createCanvas(800, 600) }
function mousePressed() { if (onStart() && !started) start('hands') }

function draw() {
  background(20)
  drawCamera(90)
  readHands()
  let ps = pinches()
  if (!hands.length) ps = [{ x: mouseX, y: mouseY, on: mouseIsPressed && !onStart(), d: mouseIsPressed ? 0.1 : 0.9 }]
  hands.forEach(h => drawHand(h, 'rgba(255,255,255,0.35)'))
  for (const p of ps) {
    if (p.on) trail.push({ x: p.x, y: p.y, t: millis() })
    const close = constrain((0.7 - p.d) / 0.42, 0, 1)            // 0 open … 1 closed
    noFill(); strokeWeight(3); stroke(242, 193, 78, p.on ? 255 : 60 + 160 * close)
    circle(p.x, p.y, 34 - 16 * close)
    if (p.on) { noStroke(); fill(242, 193, 78, 140); circle(p.x, p.y, 18) }
  }
  trail = trail.filter(q => millis() - q.t < 3000)
  noStroke()
  for (const q of trail) { fill(242, 193, 78, 255 * (1 - (millis() - q.t) / 3000)); circle(q.x, q.y, 7) }
  // the measure, with its two thresholds
  const d = ps[0] ? ps[0].d : 1, bx = 90, bw = 620, by = 548
  noStroke(); fill(50); rect(bx, by, bw, 10, 5)
  fill(ps[0] && ps[0].on ? '#f2c14e' : 150); rect(bx, by, bw * constrain(d, 0, 1), 10, 5)
  fill(235); textSize(12); textAlign(CENTER)
  text('starts 0.28', bx + bw * 0.28, by - 8); text('ends 0.5', bx + bw * 0.5, by - 8)
  stroke(235); line(bx + bw * 0.28, by - 4, bx + bw * 0.28, by + 14); line(bx + bw * 0.5, by - 4, bx + bw * 0.5, by + 14)
  status([cameraLine('thumb to index: ' + nf(d, 1, 2) + ' hand sizes' + (ps[0] && ps[0].on ? ' · pinching' : '')), 'pinch and move: a trail'])
  startButton()
}

${START}
${STATUS}` }
      ]
    },
    {
      id: 'strings',
      title: 'A string, and a pluck',
      label: 'Strings',
      text: 'A **string** is two points. Pinch with both hands and the string is stretched between the pinch points; let either go and it stays, at any length and any angle. To **pluck** it, a fingertip has to cross it: between two frames the fingertip moves along a short segment, and if that segment **crosses** the string, we know where along the string (0 to 1) and how fast. The sound is the plucked string of the Web Audio lesson (4.1, Karplus–Strong): a loop of noise one period long, averaged on each trip. Where you pluck becomes a **comb** on the noise, so plucking near an end sounds thin and plucking in the middle round, as on a guitar. A real string\'s pitch comes from its length; on our first strings it does too, and they are out of tune with each other.',
      boards: [
        { id: 'stretch', title: '2.1 · A string between two pinches', w: 800, h: 600, ground: '#141414',
          idea: 'Pinch with both hands: a dashed string follows the two pinch points. Pull them apart and let go of either: the string stays. Each string is just **two points**, and its **length** and **angle** are written beside it: the next boards turn those into sound. With the mouse: drag from one end to the other.',
          pseudo: `if both hands pinch: draft $\\leftarrow$ (pinch$_1$, pinch$_2$)
when one lets go: if $|a - b| > 50$: keep the string $(a, b)$
length $= |b - a|$,  angle $= \\operatorname{atan2}(b_y - a_y,\\ b_x - a_x)$`,
          p5: `// 2.1 A string between two pinches: pinch with both hands, pull apart, let go. With the mouse: drag.
${AUDIO}
${CAMERA}
${HANDS}
${PINCH}
let strings = [], draft = null, dragFrom = null

function setup() { createCanvas(800, 600) }
function mousePressed() {
  if (onStart()) { if (!started) start('hands'); return }
  dragFrom = { x: mouseX, y: mouseY }
}
function mouseReleased() {
  if (dragFrom && dist(dragFrom.x, dragFrom.y, mouseX, mouseY) > 40) strings.push({ a: dragFrom, b: { x: mouseX, y: mouseY } })
  dragFrom = null
}

function draw() {
  background(20)
  drawCamera(90)
  readHands()
  const ps = pinches()
  if (ps.length === 2 && ps[0].on && ps[1].on) draft = { a: { x: ps[0].x, y: ps[0].y }, b: { x: ps[1].x, y: ps[1].y } }   // both pinching
  else if (draft) {                              // one let go: the string stays
    if (dist(draft.a.x, draft.a.y, draft.b.x, draft.b.y) > 50) strings.push(draft)
    draft = null
  }
  hands.forEach(h => drawHand(h, 'rgba(255,255,255,0.35)'))
  ps.forEach(p => { noFill(); stroke(p.on ? '#f2c14e' : 'rgba(242,193,78,0.4)'); strokeWeight(3); circle(p.x, p.y, p.on ? 16 : 26) })
  const showing = [...strings]
  if (draft) showing.push(draft)
  if (dragFrom) showing.push({ a: dragFrom, b: { x: mouseX, y: mouseY } })
  for (const s of showing) {
    const live = s === showing[showing.length - 1] && (draft || dragFrom)
    stroke(live ? '#f2c14e' : '#e8e0d0'); strokeWeight(3)
    if (live) drawingContext.setLineDash([10, 8])
    line(s.a.x, s.a.y, s.b.x, s.b.y)
    drawingContext.setLineDash([])
    noStroke(); fill(235); circle(s.a.x, s.a.y, 9); circle(s.b.x, s.b.y, 9)
    const L = dist(s.a.x, s.a.y, s.b.x, s.b.y), ang = degrees(Math.atan2(s.b.y - s.a.y, s.b.x - s.a.x))
    fill(170); textSize(12); textAlign(CENTER)
    text(nf(L, 1, 0) + ' px · ' + nf(ang, 1, 0) + '°', (s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2 - 12)
  }
  status([cameraLine(strings.length + (strings.length === 1 ? ' string' : ' strings')), 'pinch with both hands, pull apart, let go · a string is two points'])
  startButton()
}

${START}
${STATUS}` },

        { id: 'pluck', title: '2.2 · Pluck: a fingertip crossing a line', w: 800, h: 600, ground: '#141414',
          idea: 'Swipe an index finger across a string (or move the mouse across it): it is **plucked** where you crossed it, as hard as you moved. Between two frames each fingertip moves along a short segment; `crossing()` says whether that segment crosses a string and where (0 at one end, 1 at the other). The sound is **Karplus–Strong** (Web Audio lesson 4.1), with the pluck position as a comb on the noise: near an end, thin; in the middle, round. Here the pitch comes from the **length**, as on a real string (half as long, an octave higher), so strings you draw are out of tune with each other. Make a few and hear it; the next board fixes it.',
          pseudo: `for each fingertip: segment $(p_{\\text{before}}, p_{\\text{now}})$
if it crosses string $(a, b)$ at $t \\in (0.03, 0.97)$: pluck at $t$, velocity $\\propto$ speed
frequency $= 110 \\cdot 400 / $length    # a real string: shorter is higher
excitation: noise $n$, then $n_i - n_{i + tN}$    # plucked at $t$`,
          p5: `// 2.2 Pluck: a fingertip crossing a string plucks it where it crossed. Pitch from length, like a real string (so: out of tune). Mouse: move across.
const damping = 0.25 /* 0..0.5 */
${AUDIO}
${CAMERA}
${HANDS}
${PINCH}
${CROSS}
${STRING}
${DRAWSTRING}
let strings = [], draft = null, dragFrom = null, tips = [], lastMouse = null

function lengthPitch(s) {                        // a real string: twice as long, an octave lower
  s.freq = 110 * 400 / dist(s.a.x, s.a.y, s.b.x, s.b.y)
  s.pan = constrain((s.a.x + s.b.x) / width - 1, -0.8, 0.8)
  return s
}
function pluck(s, pos, vel) { s.hit = { t: millis(), vel, pos }; pluckSound(s.freq, pos, vel, damping, s.pan) }
function setup() {
  createCanvas(800, 600)
  strings = [[200, 170, 600, 150], [150, 300, 420, 330], [480, 280, 640, 420]].map(p => lengthPitch({ a: { x: p[0], y: p[1] }, b: { x: p[2], y: p[3] } }))
}
function mousePressed() {
  audio()
  if (onStart()) { if (!started) start('hands'); return }
  dragFrom = { x: mouseX, y: mouseY }
}
function mouseReleased() {
  if (dragFrom && dist(dragFrom.x, dragFrom.y, mouseX, mouseY) > 40) { const s = lengthPitch({ a: dragFrom, b: { x: mouseX, y: mouseY } }); strings.push(s); pluck(s, 0.3, 0.6) }
  dragFrom = null
}
function swipe(from, to, vel) { for (const s of strings) { const t = crossing(from, to, s.a, s.b); if (t > 0.03 && t < 0.97) pluck(s, t, vel) } }
function mouseMoved() {
  const now = { x: mouseX, y: mouseY }
  if (lastMouse) swipe(lastMouse, now, constrain(dist(lastMouse.x, lastMouse.y, now.x, now.y) / 40, 0.15, 1))
  lastMouse = now
}

function draw() {
  background(20)
  drawCamera(80)
  readHands()
  const ps = pinches()
  if (ps.length === 2 && ps[0].on && ps[1].on) draft = { a: { x: ps[0].x, y: ps[0].y }, b: { x: ps[1].x, y: ps[1].y } }
  else if (draft) { if (dist(draft.a.x, draft.a.y, draft.b.x, draft.b.y) > 50) { const s = lengthPitch(draft); strings.push(s); pluck(s, 0.3, 0.6) } draft = null }
  hands.forEach((h, i) => {                      // index fingertips pluck (not while that hand pinches)
    const tip = h[8], before = tips[i]
    tips[i] = { x: tip.x, y: tip.y }
    if (before && !pinching[i]) swipe(before, tip, constrain(dist(before.x, before.y, tip.x, tip.y) / (0.6 * handSize(h)), 0.15, 1))
    drawHand(h, 'rgba(255,255,255,0.3)'); noStroke(); fill(255); circle(tip.x, tip.y, 10)
  })
  for (const s of strings) {
    drawString(s, '#e8e0d0')
    noStroke(); fill(170); textSize(12); textAlign(CENTER)
    text(nf(s.freq, 1, 1) + ' Hz', (s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2 - 14)
  }
  if (draft || dragFrom) { const s = draft || { a: dragFrom, b: { x: mouseX, y: mouseY } }; stroke('#f2c14e'); strokeWeight(2); line(s.a.x, s.a.y, s.b.x, s.b.y) }
  status([cameraLine('swipe an index finger across a string'), 'pitch from length: ' + strings.length + ' strings, in no particular key'])
  startButton()
}

${START}
${STATUS}` }
      ]
    },
    {
      id: 'tuning',
      title: 'In tune anywhere',
      label: 'Tuning',
      text: 'An instrument in the air has no frets, so let **the place** choose the note, and snap it to a **scale**. The height of a string\'s middle picks a step of the scale (two octaves from the bottom of the screen to the top); its length picks the octave (short ones an octave up, long ones down); its **slant** picks its tone (level is bright steel, upright is dark nylon: the damping of the averaging filter); and left to right is stereo. Any string you draw now lands on a note of the scale, so everything you draw is in tune with everything else, and changing the scale retunes them all at once.',
      boards: [
        { id: 'tune', title: '3.1 · In tune anywhere', w: 800, h: 600, ground: '#141414',
          idea: 'The same strings, but the note comes from **where** the string is: the height of its middle picks a step of the **scale** (the top is high), a short string goes up an octave and a long one down, the **slant** sets the tone (level: bright, little damping; upright: dark, more), left–right sets the stereo position. Every string is on a note of the scale, so they always agree; the colour is the note (the same note, the same colour, in any octave). Change `scaleName` or `rootNote` and they all retune. Pinch and pull to draw more; swipe to play.',
          pseudo: `step $\\leftarrow \\lfloor$ height $\\times (2n + 1) \\rfloor$    # $n$ notes in the scale
note $\\leftarrow$ root $+ 12\\lfloor$step$/n\\rfloor +$ scale[step mod $n$] $+ 12\\cdot$octave(length)
damping $\\leftarrow 0.06 + 0.42\\,|\\sin$ angle$|$    # level: bright, upright: dark
pan $\\leftarrow$ where its middle is, left to right`,
          p5: `// 3.1 In tune anywhere: height picks the note in a scale, length the octave, slant the tone, left-right the stereo. Swipe to play; pinch and pull to draw.
const scaleName = 'minor pentatonic' /* major pentatonic|minor pentatonic|major|dorian|hirajoshi */
const rootNote = 50 /* 36..60 */
${AUDIO}
${CAMERA}
${HANDS}
${PINCH}
${CROSS}
${STRING}
${DRAWSTRING}
${TUNE}
let strings = [], draft = null, dragFrom = null, tips = [], lastMouse = null, lastScale = ''

function pluck(s, pos, vel) { s.hit = { t: millis(), vel, pos }; pluckSound(mtof(s.midi), pos, vel, s.damping, s.pan) }
function setup() {
  createCanvas(800, 600)
  strings = [[120, 170, 320, 130], [480, 120, 680, 170], [140, 300, 220, 470], [600, 460, 690, 280], [300, 380, 520, 380]].map(p => tune({ a: { x: p[0], y: p[1] }, b: { x: p[2], y: p[3] } }))
}
function mousePressed() {
  audio()
  if (onStart()) { if (!started) start('hands'); return }
  dragFrom = { x: mouseX, y: mouseY }
}
function mouseReleased() {
  if (dragFrom && dist(dragFrom.x, dragFrom.y, mouseX, mouseY) > 40) { const s = tune({ a: dragFrom, b: { x: mouseX, y: mouseY } }); strings.push(s); pluck(s, 0.3, 0.6) }
  dragFrom = null
}
function swipe(from, to, vel) { for (const s of strings) { const t = crossing(from, to, s.a, s.b); if (t > 0.03 && t < 0.97) pluck(s, t, vel) } }
function mouseMoved() {
  const now = { x: mouseX, y: mouseY }
  if (lastMouse) swipe(lastMouse, now, constrain(dist(lastMouse.x, lastMouse.y, now.x, now.y) / 40, 0.15, 1))
  lastMouse = now
}

function draw() {
  background(20)
  if (lastScale !== scaleName + rootNote) { lastScale = scaleName + rootNote; strings.forEach(tune) }   // a new scale: everything retunes
  drawCamera(80)
  readHands()
  const ps = pinches()
  if (ps.length === 2 && ps[0].on && ps[1].on) draft = { a: { x: ps[0].x, y: ps[0].y }, b: { x: ps[1].x, y: ps[1].y } }
  else if (draft) { if (dist(draft.a.x, draft.a.y, draft.b.x, draft.b.y) > 50) { const s = tune(draft); strings.push(s); pluck(s, 0.3, 0.6) } draft = null }
  hands.forEach((h, i) => {
    const tip = h[8], before = tips[i]
    tips[i] = { x: tip.x, y: tip.y }
    if (before && !pinching[i]) swipe(before, tip, constrain(dist(before.x, before.y, tip.x, tip.y) / (0.6 * handSize(h)), 0.15, 1))
    drawHand(h, 'rgba(255,255,255,0.3)'); noStroke(); fill(255); circle(tip.x, tip.y, 10)
  })
  colorMode(HSB)
  for (const s of strings) {
    drawString(s, color(hue(s.midi), 55, 100))
    noStroke(); fill(hue(s.midi), 40, 100); textSize(12); textAlign(CENTER)
    text(noteName(s.midi), (s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2 - 14)
  }
  colorMode(RGB)
  const live = draft || (dragFrom && { a: dragFrom, b: { x: mouseX, y: mouseY } })
  if (live) { const s = tune({ a: live.a, b: live.b }); stroke('#f2c14e'); strokeWeight(2); line(s.a.x, s.a.y, s.b.x, s.b.y); noStroke(); fill('#f2c14e'); text(noteName(s.midi), (s.a.x + s.b.x) / 2, (s.a.y + s.b.y) / 2 - 14) }
  status([cameraLine(scaleName + ' from ' + NAMES[rootNote % 12]), 'height: the note · length: the octave · slant: steel (level) to nylon (upright)'])
  startButton()
}

${START}
${STATUS}` }
      ]
    },
    {
      id: 'pads',
      title: 'A ring of fingers makes a drum',
      label: 'Pads',
      text: 'Touch your thumbs together and your index fingers together, hands open: the hole between them is a **ring** (or a heart). Hold it for half a second and it becomes a **pad**, a struck object as big as the hole. Poke it with a fingertip to hit it. The sound is modal synthesis (Web Audio lesson 4.2): a few sines, each dying at its own rate, in the ratios of a **material**: glass, bell, vibes, marimba or drum, chosen by how high the pad is. Its size chooses the note (bigger is lower, in the scale), and where you hit it chooses the colour of the sound: the centre is pure, the edge rings with the higher modes. The outline wobbles in those modes, aimed at where it was hit.',
      boards: [
        { id: 'ring', title: '4.1 · A ring makes a pad', w: 800, h: 600, ground: '#141414',
          idea: 'Thumbs together, index fingers together, hands open (each hand\'s own thumb and index apart): the gesture fills a ring for half a second, then a **pad** appears, as big as the hole. Poke it with a fingertip: it rings. **Height** picks the material (glass at the top, then bell, vibes, marimba, drum at the bottom), **size** the note (bigger is lower), and **where** you hit it the sound: the centre sounds the lowest mode, the edge all of them. The outline wobbles in the drum head\'s modes (0, 1, 2, 3 waves around the rim). With the mouse: drag to make a pad, click to hit.',
          pseudo: `ring: $|$thumb$_L -$ thumb$_R| < 0.45\\,s$ and $|$index$_L -$ index$_R| < 0.45\\,s$ and both hands open
held 0.5 s: pad at the middle of the four tips, radius $= |$thumbs $-$ indices$|/2$
note $\\leftarrow$ scale step from size (bigger: lower);  material $\\leftarrow$ from height
hit at distance $r$ from the centre: mode 0 $\\propto 1 - 0.55r$, others $\\propto (0.2 + 0.8r)$`,
          p5: `// 4.1 A ring makes a pad: thumbs together, index fingers together, hold. Poke a pad to hit it. Mouse: drag to make one, click to hit.
const scaleName = 'minor pentatonic' /* major pentatonic|minor pentatonic|major|dorian|hirajoshi */
const rootNote = 38 /* 24..60 */
${AUDIO}
${CAMERA}
${HANDS}
${MODES}
${TUNE}
let pads = [], ring = 0, armed = true, hole = null, tips = [], dragFrom = null
const WAVES = [0, 1, 2, 0, 3, 1, 4, 2]              // each mode: how many times it waves around the rim (0: the whole head breathes)

function tunePad(p) {                            // size: the note (bigger is lower); height: the material
  const sc = SCALES[scaleName], n = sc.length, step = Math.floor((1 - constrain((p.r - 25) / 140, 0, 0.999)) * 2 * n)
  p.midi = rootNote + 12 * Math.floor(step / n) + sc[step % n]
  p.material = Object.keys(MATERIALS)[Math.floor(constrain(p.y / height, 0, 0.999) * 5)]
  return p
}
function hit(p, where, vel, angle) { p.hit = { t: millis(), where, vel, angle }; hitSound(mtof(p.midi), p.material, where, vel, constrain(p.x / width * 2 - 1, -0.8, 0.8)) }
function setup() { createCanvas(800, 600); pads = [tunePad({ x: 200, y: 420, r: 70 }), tunePad({ x: 600, y: 200, r: 50 })] }
function mousePressed() {
  audio()
  if (onStart()) { if (!started) start('hands'); return }
  const p = pads.find(q => dist(mouseX, mouseY, q.x, q.y) < q.r)
  if (p) hit(p, dist(mouseX, mouseY, p.x, p.y) / p.r, 0.8, Math.atan2(mouseY - p.y, mouseX - p.x))
  else dragFrom = { x: mouseX, y: mouseY }
}
function mouseReleased() {
  if (dragFrom) { const r = dist(dragFrom.x, dragFrom.y, mouseX, mouseY); if (r > 20) { const p = tunePad({ x: dragFrom.x, y: dragFrom.y, r }); pads.push(p); hit(p, 0.3, 0.6, 0) } }
  dragFrom = null
}

function drawPad(p) {
  const age = p.hit ? (millis() - p.hit.t) / 1000 : 9, m = MATERIALS[p.material]
  colorMode(HSB); stroke(hue(p.midi), 55, 100); fill(hue(p.midi), 60, 60, 0.25 + 0.4 * Math.exp(-age * 3)); strokeWeight(3)
  beginShape()
  for (let j = 0; j <= 96; j++) {
    const th = j / 96 * TWO_PI; let d = 0
    if (age < 4) m.modes.forEach((r, k) => {     // each mode, as much as the hit gave it, dying away
      const a = (k === 0 ? 1 - 0.55 * p.hit.where : (0.25 + 0.75 * p.hit.where) / Math.pow(k + 1, 0.4)) * Math.exp(-age * (1.4 + 0.8 * k) / min(2, max(0.5, m.ring)))
      d += a * Math.cos(WAVES[k % 8] * (th - p.hit.angle)) * Math.cos(TWO_PI * 2.2 * Math.sqrt(r) * age)
    })
    const rr = p.r * (1 + (age < 4 ? 0.22 * p.hit.vel * d : 0))
    vertex(p.x + rr * Math.cos(th), p.y + rr * Math.sin(th))
  }
  endShape(CLOSE)
  noStroke(); fill(0, 0, 100); textSize(12); textAlign(CENTER); text(noteName(p.midi) + ' · ' + p.material, p.x, p.y + 4)
  colorMode(RGB)
}

function draw() {
  background(20)
  drawCamera(80)
  readHands()
  let pose = false
  if (hands.length === 2) {                      // the ring: thumbs together, index fingers together, each hand open
    const [A, B] = hands, s = (handSize(A) + handSize(B)) / 2, d = (p, q) => dist(p.x, p.y, q.x, q.y)
    const open = d(A[4], A[8]) > 0.6 * handSize(A) && d(B[4], B[8]) > 0.6 * handSize(B)
    const thumbs = { x: (A[4].x + B[4].x) / 2, y: (A[4].y + B[4].y) / 2 }, index = { x: (A[8].x + B[8].x) / 2, y: (A[8].y + B[8].y) / 2 }
    pose = d(A[4], B[4]) < 0.45 * s && d(A[8], B[8]) < 0.45 * s && open && d(thumbs, index) > 0.5 * s
    if (pose) hole = { x: (thumbs.x + index.x) / 2, y: (thumbs.y + index.y) / 2, r: d(thumbs, index) / 2 }
  }
  if (pose && armed) { ring += deltaTime / 500; if (ring >= 1) { const p = tunePad({ ...hole }); pads.push(p); hit(p, 0.3, 0.6, 0); ring = 0; armed = false } }
  else ring = max(0, ring - deltaTime / 150)
  if (!pose) armed = true                        // let go of the ring before the next pad
  hands.forEach((h, i) => {                      // a fingertip entering a pad hits it
    const tip = h[8], before = tips[i]
    tips[i] = { x: tip.x, y: tip.y }
    if (before && !pose) for (const p of pads) if (dist(before.x, before.y, p.x, p.y) > p.r && dist(tip.x, tip.y, p.x, p.y) <= p.r)
      hit(p, dist(tip.x, tip.y, p.x, p.y) / p.r, constrain(dist(before.x, before.y, tip.x, tip.y) / (0.5 * handSize(h)), 0.2, 1), Math.atan2(tip.y - p.y, tip.x - p.x))
    drawHand(h, 'rgba(255,255,255,0.3)'); noStroke(); fill(255); circle(tip.x, tip.y, 10)
  })
  pads.forEach(drawPad)
  if (ring > 0 && hole) { noFill(); stroke('#f2c14e'); strokeWeight(5); arc(hole.x, hole.y, 2 * hole.r, 2 * hole.r, -HALF_PI, -HALF_PI + ring * TWO_PI) }
  if (dragFrom) { noFill(); stroke('#f2c14e'); strokeWeight(2); circle(dragFrom.x, dragFrom.y, 2 * dist(dragFrom.x, dragFrom.y, mouseX, mouseY)) }
  noStroke(); fill(255, 255, 255, 70); textSize(11); textAlign(RIGHT)
  Object.keys(MATERIALS).forEach((m, i) => text(m, width - 10, (i + 0.5) * height / 5))   // height chooses the material
  status([cameraLine('thumbs together, index fingers together: hold'), pads.length + ' pads · poke one to hit it · bigger is lower'])
  startButton()
}

${START}
${STATUS}` }
      ]
    },
    {
      id: 'face',
      title: 'The face as a controller',
      label: 'Face',
      text: 'A **face landmarker** gives 478 points on the face and, more useful for music, 52 **expression scores** (blendshapes), each from 0 to 1: how open the jaw is, how raised the brows, how much each corner of the mouth smiles, whether each eye is closed. They are made to drive an animated face, and they work just as well as knobs you play without your hands, which are busy. Mouth open opens a **filter** (the sound gets brighter, like a wah pedal); brows up send more into an **echo**; a smile adds **vibrato** (a slow wobble of the pitch). In the full instrument, closed eyes make the strings ring longer.',
      boards: [
        { id: 'face', title: '5.1 · Mouth, brows and smile', w: 800, h: 600, ground: '#141414',
          idea: 'Click ▶ and allow the camera; the strings play a slow tune by themselves so you can hear what your face does to them. **Open your mouth**: a low-pass filter opens (from 400 Hz to about 13 kHz), and the sound brightens. **Raise your brows**: more of it goes into an echo. **Smile**: vibrato, an oscillator wobbling every voice\'s pitch. The bars are the blendshape scores the face landmarker gives (0 to 1); the dots are its 478 points. Without a camera, the mouse plays the face: left–right is the mouth, up–down the brows.',
          pseudo: `scores $\\leftarrow$ face.blendshapes    # 52 numbers in $[0, 1]$
cutoff $= 400 \\cdot 2^{5\\,\\text{jawOpen}}$ Hz
echo send $= 0.8 \\cdot$ browInnerUp
vibrato depth $= 50 \\cdot$ smile cents, at 5.5 Hz`,
          p5: `// 5.1 The face as a controller: mouth opens a filter, brows send to an echo, a smile adds vibrato. The strings play by themselves. Mouse: x is the mouth, y the brows.
const tempo = 132 /* 60..200 */
const scaleName = 'minor pentatonic' /* major pentatonic|minor pentatonic|major|dorian|hirajoshi */
const rootNote = 50 /* 36..60 */
${AUDIO}
${CAMERA}
${STRING}
${TUNE}
let face = { jaw: 0, brow: 0, smile: 0 }, points = [], filter, echo, depth, next = 0, walk = 4, playing = false

function onVoice(src) { if (depth) depth.connect(src.detune) }   // every voice wobbles with the vibrato
function build() {                               // voices → filter → speakers, and → echo → speakers
  audio()
  if (filter) return
  filter = new BiquadFilterNode(ac, { type: 'lowpass', frequency: 1200, Q: 4 })
  const delay = new DelayNode(ac, { delayTime: 0.33 }), feedback = new GainNode(ac, { gain: 0.45 })
  echo = new GainNode(ac, { gain: 0 })
  filter.connect(ac.destination)
  filter.connect(echo).connect(delay).connect(ac.destination)
  delay.connect(feedback).connect(delay)
  const lfo = new OscillatorNode(ac, { frequency: 5.5 }); depth = new GainNode(ac, { gain: 0 })
  lfo.connect(depth); lfo.start()
  OUT = filter
  playing = true
}
function setup() { createCanvas(800, 600) }
function mousePressed() { build(); if (onStart() && !started) start('face') }

function meter(label, v, what, y) {
  noStroke(); fill(150); textSize(13); textAlign(LEFT); text(label, 520, y + 10)
  fill(50); rect(600, y, 120, 12, 6); fill('#f2c14e'); rect(600, y, 120 * v, 12, 6)
  fill(150); text(what, 730, y + 10)
}

function draw() {
  background(20)
  drawCamera(90)
  const r = track(), f = r && r.faceLandmarks[0]
  const ease = (k, v) => { face[k] += 0.3 * (v - face[k]) }
  if (f) {                                       // the face: its points, and the scores we use
    points = f.map(mirror)
    const s = Object.fromEntries(r.faceBlendshapes[0].categories.map(c => [c.categoryName, c.score]))
    ease('jaw', constrain((s.jawOpen - 0.04) / 0.5, 0, 1))
    ease('brow', constrain((s.browInnerUp - 0.1) / 0.55, 0, 1))
    ease('smile', constrain(((s.mouthSmileLeft + s.mouthSmileRight) / 2 - 0.2) / 0.55, 0, 1))
  } else if (!started && mouseX > 0 && mouseX < width && mouseY > 0 && mouseY < height) {   // no camera: the mouse plays the face
    points = []
    ease('jaw', mouseX / width); ease('brow', 1 - mouseY / height); ease('smile', 0)
  }
  if (playing) {
    const t = ac.currentTime
    filter.frequency.setTargetAtTime(400 * Math.pow(2, face.jaw * 5), t, 0.05)
    echo.gain.setTargetAtTime(face.brow * 0.8, t, 0.1)
    depth.gain.setTargetAtTime(face.smile * 50, t, 0.1)
    if (t > next) {                              // the tune: a slow random walk on the scale
      next = t + 60 / tempo
      const sc = SCALES[scaleName]
      walk = constrain(walk + floor(random(-2, 3)), 0, 2 * sc.length)
      pluckSound(mtof(rootNote + 12 * Math.floor(walk / sc.length) + sc[walk % sc.length]), random(0.2, 0.8), 0.7, 0.15, random(-0.5, 0.5))
    }
  }
  noStroke(); fill(242, 193, 78, 160)
  for (const p of points) circle(p.x, p.y, 2)
  meter('mouth', face.jaw, 'brightness', 110)
  meter('brows', face.brow, 'echo', 140)
  meter('smile', face.smile, 'vibrato', 170)
  status([!playing ? 'click to start the tune (▶ starts the camera)' : cameraLine('open your mouth, raise your brows, smile'), 'the face\\'s scores, 0..1, as three knobs'])
  startButton()
}

${START}
${STATUS}` }
      ]
    },
    {
      id: 'clap',
      title: 'Clap to throw',
      label: 'Claps',
      text: 'A clap is two palms meeting **fast**. We watch the distance between the palms (in hand sizes) and how quickly it shrinks; the tracker often loses the hands at the moment they touch, so the clap fires a little before, when they are about to meet. The ball goes the way the **fingers point** (from each wrist to its middle fingertip, the two averaged), as fast as the clap was. Then it is physics: a little gravity, and a bounce off whatever it meets. A string is springy: crossing it plucks it, and the ball bounces back. One throw can ricochet through several notes.',
      boards: [
        { id: 'clap', title: '6.1 · Balls that play', w: 800, h: 600, ground: '#141414',
          idea: 'Clap with your fingers pointing where you want the ball to go. The palms (the average of the wrist and three knuckles) are watched: when they are closing faster than 4 hand sizes a second and about to meet, a ball is thrown from between them, along the **fingers**, as fast as the clap. It falls a little, bounces off the walls, and when it crosses a string it **plucks** it at that point and bounces back (the string is springy). With the mouse: click to throw a ball from the bottom toward the pointer.',
          pseudo: `$d \\leftarrow |$palm$_L -$ palm$_R|\\,/\\,s$,  closing $= -\\,\\mathrm{d}d/\\mathrm{d}t$
clap when closing $> 4$ and $d - 0.12\\cdot$closing $< 0.9$    # about to meet
direction $\\leftarrow$ normalize$\\big((p_{12} - p_0)_L + (p_{12} - p_0)_R\\big)$
each frame: $v_y \\mathrel{+}= g\\,\\Delta t$; crossing a string: pluck, $v \\leftarrow v - 1.86\\,(v\\cdot n)\\,n$`,
          p5: `// 6.1 Clap to throw: palms meeting fast throw a ball the way your fingers point; it plucks the strings it crosses and bounces. Mouse: click to throw.
const gravity = 320 /* 0..1200 */
const scaleName = 'major pentatonic' /* major pentatonic|minor pentatonic|major|dorian|hirajoshi */
const rootNote = 50 /* 36..60 */
${AUDIO}
${CAMERA}
${HANDS}
${CROSS}
${STRING}
${DRAWSTRING}
${TUNE}
let strings = [], balls = [], prevD = null, armed = true, flash = null

function pluck(s, pos, vel) { s.hit = { t: millis(), vel, pos }; pluckSound(mtof(s.midi), pos, vel, s.damping, s.pan) }
function setup() {
  createCanvas(800, 600)
  strings = [[90, 140, 300, 110], [500, 110, 710, 150], [120, 260, 250, 420], [560, 420, 700, 250], [300, 300, 500, 300], [250, 480, 550, 520]]
    .map(p => tune({ a: { x: p[0], y: p[1] }, b: { x: p[2], y: p[3] } }))
}
function throwBall(at, dx, dy, power) {
  const L = Math.hypot(dx, dy) || 1, speed = 500 + 1100 * power
  balls.push({ x: at.x, y: at.y, vx: dx / L * speed, vy: dy / L * speed, born: millis(), hue: random(360) })
  flash = { x: at.x, y: at.y, t: millis() }
  if (balls.length > 12) balls.shift()
}
function mousePressed() {
  audio()
  if (onStart()) { if (!started) start('hands'); return }
  throwBall({ x: width / 2, y: height - 20 }, mouseX - width / 2, mouseY - (height - 20), 0.5)
}
const palm = h => ({ x: (h[0].x + h[5].x + h[9].x + h[17].x) / 4, y: (h[0].y + h[5].y + h[9].y + h[17].y) / 4 })

function draw() {
  background(20)
  drawCamera(80)
  readHands()
  if (hands.length === 2) {                      // the clap
    const [A, B] = hands, s = (handSize(A) + handSize(B)) / 2, pa = palm(A), pb = palm(B)
    const d = dist(pa.x, pa.y, pb.x, pb.y) / s, closing = prevD === null ? 0 : (prevD - d) / (deltaTime / 1000)
    prevD = d
    if (d > 1.8) armed = true
    if (armed && closing > 4 && d < 2.2 && d - closing * 0.12 < 0.9) {
      armed = false
      throwBall({ x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 }, A[12].x - A[0].x + B[12].x - B[0].x, A[12].y - A[0].y + B[12].y - B[0].y, min(1, closing / 9))
    }
  } else prevD = null
  hands.forEach(h => drawHand(h, 'rgba(255,255,255,0.35)'))
  const dt = min(deltaTime, 33) / 1000
  for (const b of balls) {                       // fly, fall, bounce, play
    const before = { x: b.x, y: b.y }
    b.vy += gravity * dt; b.x += b.vx * dt; b.y += b.vy * dt
    const speed = Math.hypot(b.vx, b.vy)
    for (const s of strings) {
      const t = crossing(before, b, s.a, s.b)
      if (t < 0.02 || t > 0.98) continue
      pluck(s, t, constrain(speed / 1600, 0.15, 1))
      const L = dist(s.a.x, s.a.y, s.b.x, s.b.y), nx = -(s.b.y - s.a.y) / L, ny = (s.b.x - s.a.x) / L, vn = b.vx * nx + b.vy * ny
      b.vx -= 1.86 * vn * nx; b.vy -= 1.86 * vn * ny   // bounce back, a little slower
      b.x = before.x; b.y = before.y
    }
    if (b.x < 10 || b.x > width - 10) { b.vx *= -0.86; b.x = constrain(b.x, 10, width - 10) }
    if (b.y < 10) { b.vy = abs(b.vy) * 0.86; b.y = 10 }
    if (b.y > height - 10) { b.vy = -abs(b.vy) * 0.7; b.vx *= 0.9; b.y = height - 10 }
  }
  balls = balls.filter(b => millis() - b.born < 9000 && !(b.y >= height - 11 && Math.hypot(b.vx, b.vy) < 60))
  colorMode(HSB)
  for (const s of strings) drawString(s, color(hue(s.midi), 50, 100))
  noStroke()
  for (const b of balls) { fill(b.hue, 70, 100); circle(b.x, b.y, 20) }
  colorMode(RGB)
  if (flash) { const a = (millis() - flash.t) / 400; if (a < 1) { noFill(); stroke(255, 255 * (1 - a)); strokeWeight(3); circle(flash.x, flash.y, 40 + 160 * a) } }
  status([cameraLine('clap, fingers pointing where the ball should go'), balls.length + ' balls · click to throw one with the mouse'])
  startButton()
}

${START}
${STATUS}` }
      ]
    },
    {
      id: 'midi',
      title: 'MIDI in and out',
      label: 'MIDI',
      text: '**MIDI** is how instruments have talked since 1983: small messages such as *note 64 on, velocity 100, channel 1* or *controller 74 is now 90*. The browser speaks it (**Web MIDI**), so the instrument can listen to a keyboard or a controller, and tell another synth what it plays. **In**: a note plucks the string nearest to it, at the note\'s own pitch; a controller (CC) turns a knob of ours through a small **map** (controller number → what it does). **Out**: every pluck goes out as a note, with a note-off when it fades; with the sound here muted, the instrument becomes a controller for any synth. The [ForgeRing](https://github.com/languel/forgering) smart ring sends its tilt as CC 20, 21 and 22 and a recognized gesture as CC 24: map the tilt to *strum* and you play the strings by turning your hand. Two pages talk through a virtual port (on a Mac: Audio MIDI Setup › IAC Driver › Device is online).',
      boards: [
        { id: 'midi', title: '7.1 · MIDI in and out', w: 800, h: 600, ground: '#141414',
          idea: 'Click ▶ to ask for MIDI (the browser asks you). Every input is listened to: a **note** plucks the string nearest in pitch, sounding the note played; a **controller** does what `MAP` says (`brightness`, `vibrato`, `strum`: sweep the value and it plucks each string it passes, `pluck all`: when it rises past 64). The default map takes the mod wheel (CC 1), the usual brightness knob (CC 74), and the [ForgeRing](https://github.com/languel/forgering) ring\'s X tilt (CC 20), Y tilt (CC 21) and gesture (CC 24). **Out**: with `sendOut` on, every pluck, from the mouse or from MIDI, goes to every output as a note (and its note-off); with `soundHere` off, it is MIDI only. The log shows what comes in.',
          pseudo: `on a message $[s, a, b]$: type $= s \\mathbin{\\&} \\texttt{0xF0}$, channel $= (s \\mathbin{\\&} 15) + 1$
note on ($\\texttt{0x90}$, $b > 0$): pluck the nearest string, at note $a$, velocity $b/127$
controller ($\\texttt{0xB0}$): MAP[$a$]$(b / 127)$
a pluck out: $[\\texttt{0x90}, n, v]$ now, $[\\texttt{0x80}, n, 0]$ at now $+$ 1.5 s`,
          p5: `// 7.1 MIDI in and out: a keyboard or a controller (or the ForgeRing ring) plays the strings; every pluck can go out as a note. Click ▶ for MIDI; move the mouse across strings.
const sendOut = 'yes' /* yes|no */
const soundHere = 'yes' /* yes|no */
const channelOut = 1 /* 1..16 */
const scaleName = 'minor pentatonic' /* major pentatonic|minor pentatonic|major|dorian|hirajoshi */
const rootNote = 50 /* 36..60 */
const MAP = { 1: 'vibrato', 74: 'brightness', 20: 'strum', 21: 'brightness', 24: 'pluck all' }   // controller number → what it does
${AUDIO}
${CROSS}
${STRING}
${DRAWSTRING}
${TUNE}
let strings = [], midi = null, started = false, log = [], filter, depth, strumAt = null, before = {}, lastMouse = null

function onVoice(src) { if (depth) depth.connect(src.detune) }
function setup() {
  createCanvas(800, 600)
  for (let i = 0; i < 7; i++) strings.push(tune({ a: { x: 130 + i * 85, y: 470 - i * 40 }, b: { x: 170 + i * 85, y: 250 - i * 40 } }))
}
async function connect() {
  started = true; audio()
  filter = new BiquadFilterNode(ac, { type: 'lowpass', frequency: 16000, Q: 2 }); filter.connect(ac.destination); OUT = filter
  const lfo = new OscillatorNode(ac, { frequency: 5.5 }); depth = new GainNode(ac, { gain: 0 }); lfo.connect(depth); lfo.start()
  try {
    midi = await navigator.requestMIDIAccess()
    const listen = () => { for (const input of midi.inputs.values()) input.onmidimessage = onMessage }
    listen(); midi.onstatechange = listen
  } catch (err) { log.unshift('no MIDI: ' + err.message) }
}
function pluck(s, pos, vel, note, fromMidi) {
  note = note ?? s.midi
  s.hit = { t: millis(), vel, pos }
  if (soundHere === 'yes') pluckSound(mtof(note), pos, vel, s.damping, s.pan)
  if (sendOut === 'yes' && midi && !fromMidi) for (const out of midi.outputs.values()) {   // (not what came in: no loops)
    out.send([0x90 + channelOut - 1, note, Math.round(vel * 127)])
    out.send([0x80 + channelOut - 1, note, 0], performance.now() + 1500)
  }
}
function onMessage(e) {
  const [status, a, b] = e.data, type = status & 0xf0, ch = (status & 15) + 1
  if (type === 0x90 && b > 0) {                  // a note: the nearest string, at the note's pitch
    const s = strings.reduce((p, q) => Math.abs(q.midi - a) < Math.abs(p.midi - a) ? q : p)
    pluck(s, random(0.25, 0.75), b / 127, a, true)
    log.unshift('ch ' + ch + ' note ' + a + ' (' + noteName(a) + ') vel ' + b)
  }
  if (type === 0xb0) {                           // a controller: what the map says
    const what = MAP[a], v = b / 127, was = before[a]
    before[a] = b
    if (what === 'brightness') filter.frequency.setTargetAtTime(300 * Math.pow(2, v * 6), ac.currentTime, 0.03)
    if (what === 'vibrato') depth.gain.setTargetAtTime(v * 50, ac.currentTime, 0.05)
    if (what === 'pluck all' && was !== undefined && was < 64 && b >= 64) strings.forEach((s, i) => setTimeout(() => pluck(s, 0.4, v, undefined, true), i * 25))
    if (what === 'strum') {                      // the value as a hand moving across the strings, left to right
      const pos = v * strings.length, from = strumAt ?? pos
      strumAt = pos
      strings.forEach((s, i) => { if (i + 0.5 > min(from, pos) && i + 0.5 <= max(from, pos)) pluck(s, 0.5, 0.7, undefined, true) })
    }
    log.unshift('ch ' + ch + ' CC ' + a + ' = ' + b + (what ? ' → ' + what : ''))
  }
  log = log.slice(0, 8)
}
function mousePressed() { if (onStart() && !started) connect(); else audio() }
function mouseMoved() {
  const now = { x: mouseX, y: mouseY }
  if (lastMouse) for (const s of strings) { const t = crossing(lastMouse, now, s.a, s.b); if (t > 0.03 && t < 0.97) pluck(s, t, constrain(dist(lastMouse.x, lastMouse.y, now.x, now.y) / 40, 0.15, 1)) }
  lastMouse = now
}

function draw() {
  background(20)
  colorMode(HSB)
  for (const s of strings) {
    drawString(s, color(hue(s.midi), 50, 100))
    noStroke(); fill(hue(s.midi), 40, 100); textSize(12); textAlign(CENTER); text(noteName(s.midi), s.b.x, s.b.y - 12)
  }
  colorMode(RGB)
  noStroke(); fill(150); textSize(12); textAlign(LEFT)
  const ins = midi ? [...midi.inputs.values()].map(i => i.name).join(', ') || 'none' : '-', outs = midi ? [...midi.outputs.values()].map(o => o.name).join(', ') || 'none' : '-'
  text('in: ' + ins, 90, 96); text('out: ' + outs + (sendOut === 'yes' ? '' : ' (not sending)'), 90, 114)
  text('map: ' + Object.entries(MAP).map(([k, v]) => 'CC ' + k + ' → ' + v).join(' · '), 90, 132)
  fill(200); log.forEach((l, i) => text(l, 560, 470 + i * 16))
  status([!started ? 'click ▶ to listen for MIDI' : 'listening: play a key or move a control', 'move the mouse across the strings' + (sendOut === 'yes' ? ': each pluck goes out as a note' : '')])
  startButton()
}

${START}
${STATUS.replace("const cameraLine = what => !started ? 'click ▶ to start the camera (or use the mouse)' : !tracker ? 'loading the tracker…' : what", '')}` }
      ]
    },
    {
      id: 'together',
      title: 'The whole instrument',
      label: 'Together',
      text: 'Everything at once, in one page: strings you stretch between two pinches and pluck by swiping, tuned by where they are; pads you make with a ring of fingers and poke; things you can pinch to move (and drop on the ✕ to delete); claps that throw balls; the face as three knobs (and closed eyes for a long sustain); MIDI in through a map you edit (with Learn, presets and JSON, including one for the ForgeRing ring) and MIDI out with the sound here muted if you like. It is one HTML file, [Strings in the Air](demos/hand-strings.html): open it in its own tab for the whole screen, save it, change it.',
      boards: [
        { id: 'together', title: '8.1 · Strings in the Air', w: 800, h: 600, ground: '#0c0c0f',
          idea: 'The whole instrument on a board: click **Start with camera** (or **Mouse only**). Pinch with both hands and pull to stretch a string; swipe a fingertip across it to pluck; thumbs and index fingers together (hold) for a pad, poke it to hit; pinch an end, a string or a pad with one hand to move it, drop it on ✕ to delete; clap to throw a ball. Open your mouth, raise your brows, smile, close your eyes. **Tuning and view** sets the key, the scale and the look; **MIDI** connects it to other instruments. For the whole screen, open [Strings in the Air](demos/hand-strings.html) in its own tab.' }
      ]
    }
  ],
  // The last board is the demo page itself (public/demos/hand-strings.html), on an HTML board: fetched from the site when the scene is built.
  async setup(app, ids) {
    const id = ids.together;
    if (!id) return;
    const html = await (await fetch(new URL('demos/hand-strings.html', document.baseURI))).text();
    app.store.updateBoard(id, { kind: 'html', code: html });
  },
  bibliography: [
    { title: 'Bodies as controllers', items: [
      ['Google. MediaPipe hand landmarker: 21 points per hand, in the browser.', 'https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker'],
      ['Google. MediaPipe face landmarker: 478 points and 52 expression scores (blendshapes).', 'https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker'],
      ['Léon Theremin and the theremin (1920): the first instrument played without touching it.', 'https://en.wikipedia.org/wiki/Theremin'],
      ['Michel Waisvisz and *The Hands* (1984): an instrument played by moving the hands in the air, made at STEIM.', 'https://en.wikipedia.org/wiki/Michel_Waisvisz'],
      ['Laetitia Sonami and the *Lady\'s Glove* (1991): a glove of sensors as an instrument.', 'https://en.wikipedia.org/wiki/Laetitia_Sonami'],
      ['ForgeRing: a smart ring\'s motion and gestures as MIDI, in the browser.', 'https://github.com/languel/forgering']
    ] },
    { title: 'Strings, modes and MIDI', items: [
      ['Kevin Karplus, Alex Strong (1983). Digital synthesis of plucked-string and drum timbres. *Computer Music Journal* 7(2), 43–55.', 'https://doi.org/10.2307/3680062'],
      ['David A. Jaffe, Julius O. Smith (1983). Extensions of the Karplus-Strong plucked-string algorithm. *Computer Music Journal* 7(2), 56–69.', 'https://doi.org/10.2307/3680063'],
      ['Julius O. Smith III. *Physical Audio Signal Processing*. CCRMA, Stanford. Free online: strings, waveguides, modes.', 'https://ccrma.stanford.edu/~jos/pasp/'],
      ['W3C. Web MIDI API (the specification).', 'https://www.w3.org/TR/webmidi/'],
      ['MDN Web Docs. Web Audio API: the guide and reference.', 'https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API']
    ] }
  ]
};
