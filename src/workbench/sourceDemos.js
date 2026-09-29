/**
 * Demos that route a source into a board: ordinary board code (edit it, copy it, export it), which
 * the board follows (re-runs on each new frame). Nothing here is special: any board's code can
 * read any source.
 */
export const SOURCE_DEMOS = [
  {
    id: 'redraw', label: 'Redraw as shapes', hint: 'A continuous fit: at its own rate, a few shapes are replaced each time',
    rate: 20,
    code: name => `// Redraw “${name}” as shapes: a few are replaced on each run (live), at the board's redraw rate.
// No ground: the paper stays as it is, and the shapes fill it.
fit(source('${name}'), { shapes: 120 /* 10..400 */, live: true, ground: false })
`
  },
  {
    id: 'fitcode', label: 'Fit shapes, in code', rate: 20, hint: 'The greedy shape fitting of fit(), written out: change how shapes are tried, kept and drawn',
    code: name => `// Greedy shape fitting, written out (what fit() does, simplified): each shape is the best of many
// random tries: the one that makes the picture closest to the source. On each new frame the oldest
// shapes give way to a few new ones; the rest take the new frame's colors.
const s = source('${name}')
const W = 64, H = Math.max(8, Math.round(64 * height / width))   // the grid pictures are compared on
const n = 60 /* 10..200 */, tries = 40 /* 5..150 */, turnover = 6 /* 1..30 */
const target = s.pixels(W, H)                                     // the source: r, g, b, … per cell
const memo = state('fit')                                         // kept between runs: the shapes

// A shape's cells (indices into the grid), its color (the source's mean there), and what it gains.
const cells = sh => {
  const out = []
  if (sh.kind === 'rect') { for (let y = sh.y0; y < sh.y1; y++) for (let x = sh.x0; x < sh.x1; x++) out.push(y * W + x) }
  else for (let y = Math.max(0, Math.ceil(sh.cy - sh.r)); y <= Math.min(H - 1, sh.cy + sh.r); y++)
    for (let x = Math.max(0, Math.ceil(sh.cx - sh.r)); x <= Math.min(W - 1, sh.cx + sh.r); x++)
      if ((x - sh.cx) ** 2 + (y - sh.cy) ** 2 <= sh.r ** 2) out.push(y * W + x)
  return out
}
const colorOf = cs => [0, 1, 2].map(k => { let t = 0; for (const j of cs) t += target[j * 3 + k]; return t / Math.max(1, cs.length) })
const gain = (img, cs, c) => { let g = 0; for (const j of cs) for (const k of [0, 1, 2]) { const t = target[j * 3 + k]; g += (img[j * 3 + k] - t) ** 2 - (c[k] - t) ** 2 } return g }
const paint = (img, cs, c) => { for (const j of cs) for (const k of [0, 1, 2]) img[j * 3 + k] = c[k] }
const tryShape = () => {
  const size = 2 + Math.random() * W / 3
  if (Math.random() < 0.5) {
    const x0 = Math.floor(Math.random() * W), y0 = Math.floor(Math.random() * H)
    return { kind: 'rect', x0, y0, x1: Math.min(W, x0 + 1 + Math.floor(Math.random() * size)), y1: Math.min(H, y0 + 1 + Math.floor(Math.random() * size)) }
  }
  return { kind: 'circle', cx: Math.random() * W, cy: Math.random() * H, r: 1 + Math.random() * size / 2 }
}

// The picture so far: the ground (the source's mean color), then the kept shapes, recolored.
const ground = colorOf(range(W * H))
const img = new Float32Array(W * H * 3).map((_, i) => ground[i % 3])
memo.shapes = (memo.shapes || []).slice((memo.shapes || []).length >= n ? turnover : 0)
for (const sh of memo.shapes) { const cs = cells(sh); sh.color = colorOf(cs); paint(img, cs, sh.color) }
// New shapes until there are n: each the best of its tries.
while (memo.shapes.length < n) {
  let best = null
  for (const i of range(tries)) {
    const sh = tryShape(), cs = cells(sh)
    if (!cs.length) continue
    const c = colorOf(cs), g = gain(img, cs, c)
    if (!best || g > best.g) best = { sh, cs, c, g }
  }
  if (!best || best.g <= 0) break
  best.sh.color = best.c; paint(img, best.cs, best.c); memo.shapes.push(best.sh)
}

// Drawn as planes: the ground (as first seen), then the shapes, oldest first.
const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
memo.ground ||= hex(ground)   // kept from the first run: the clip's mean color changes with each frame
plane([[0, 0], [1, 0], [1, 1], [0, 1]], { color: memo.ground, path: 'straight' })
for (const sh of memo.shapes) {
  if (sh.kind === 'rect') plane([[sh.x0 / W, sh.y0 / H], [sh.x1 / W, sh.y0 / H], [sh.x1 / W, sh.y1 / H], [sh.x0 / W, sh.y1 / H]], { color: hex(sh.color), path: 'straight' })
  else plane(range(12).map(i => [(sh.cx + sh.r * cos(i / 12 * TAU)) / W, (sh.cy + sh.r * sin(i / 12 * TAU)) / H]), { color: hex(sh.color) })
}
`
  },
  {
    id: 'dots', label: 'Dots', rate: 12, hint: 'Pointillism: a dot of the source’s color at random places',
    code: name => `// Dots of “${name}”'s color at random places, larger where it is dark.
const s = source('${name}')
const n = 3000 /* 200..12000 */
for (const i of range(n)) {
  const x = random(), y = random()
  point(x, y, { size: 3 + 9 * (1 - s.value(x, y)), color: s.color(x, y) })
}
`
  },
  {
    id: 'strokes', label: 'Strokes along forms', rate: 12, hint: 'Short strokes along the contours (where the light changes least)',
    code: name => `// Strokes along the forms of “${name}”: a quarter turn from the change of light.
const s = source('${name}')
const n = 900 /* 100..4000 */, len = 0.02, e = 0.01
for (const i of range(n)) {
  const x = random(), y = random()
  const a = Math.atan2(s.value(x, y + e) - s.value(x, y - e), s.value(x + e, y) - s.value(x - e, y)) + PI / 2
  line([[x - Math.cos(a) * len, y - Math.sin(a) * len], [x + Math.cos(a) * len, y + Math.sin(a) * len]], { brush: 'pen', width: 3, color: s.color(x, y) })
}
`
  },
  {
    id: 'pose', label: 'Pose lines', hint: 'The person’s limbs as a few smooth lines',
    code: name => `// The person in “${name}”: each limb one smooth line, the head a dot.
const s = source('${name}')
const limbs = [[11, 13, 15], [12, 14, 16], [23, 25, 27], [24, 26, 28], [11, 12, 24, 23, 11]]
for (const p of s.pose) {
  for (const limb of limbs) line(limb.map(i => [p[i].x, p[i].y]), { brush: 'pen', width: 6, color: '#1d1b19' })
  point(p[0].x, p[0].y, { size: 30, color: '#1d1b19' })
}
`
  },
  {
    id: 'face', label: 'Face and expressions', hint: 'The face as lines (outline, lips, eyes, brows) and its expressions as bars: to see and test the face tracker',
    code: name => `// The face tracker on “${name}”: the face as a few lines, and its expressions as bars.
// s.face is a list of faces: { points: [{ x, y, z }] × 478, blend: { smile, jawOpen, blink… 0..1 }, box }.
const s = source('${name}')
const ring = (f, ids, closed) => line(ids.map(i => [f.points[i].x, f.points[i].y]), { brush: 'pen', width: 3, color: '#1d1b19', closed })
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
const EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
const EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
const BROW_L = [276, 283, 282, 295, 285], BROW_R = [46, 53, 52, 65, 55]
const BARS = ['smile', 'frown', 'blink', 'browUp', 'jawOpen', 'mouthPucker']
for (const f of s.face) {
  ring(f, OVAL, true); ring(f, LIPS, true); ring(f, EYE_L, true); ring(f, EYE_R, true); ring(f, BROW_L); ring(f, BROW_R)
  BARS.forEach((k, i) => {
    const v = f.blend[k] || 0, y = 0.06 + i * 0.05
    plane([[0.04, y], [0.04 + 0.2 * v, y], [0.04 + 0.2 * v, y + 0.03], [0.04, y + 0.03]], { color: '#c8664f', path: 'straight' })
    note(0.27, y - 0.004, k + ' ' + v.toFixed(2), { note: { size: 13, font: 'mono' } })
  })
}
`
  },
  {
    id: 'hands', label: 'Fingertips', hint: 'Named points of the person (see Gestures): a dot at each fingertip',
    code: name => `// Named points of the person in “${name}” (as in Gestures): a dot on each fingertip.
const s = source('${name}')
for (const side of ['left', 'right'])
  for (const f of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
    const p = s.point(side + '.' + f)
    if (p) point(p.x, p.y, { size: 14, color: side === 'left' ? '#e0a060' : '#3d6fb0' })
  }
`
  }
];
