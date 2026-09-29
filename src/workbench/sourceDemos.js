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
    id: 'paint', label: 'Painterly, fading strokes', rate: 12, hint: 'A continuous reconstruction: layers of brush strokes, big to small, painted where the picture so far differs from the source; they follow the forms, draw themselves on, and fade as new ones arrive',
    code: name => `// “${name}” repainted, continuously. Layers of strokes, big to small. The code keeps a coarse model of what its
// live strokes show, and paints where that differs from the source: big strokes first, small ones where the
// big ones were wrong. A stroke follows the forms (a quarter turn from the change of light), takes the
// source's color across its width, and stops where the color turns. It draws itself on, stays, fades out;
// as strokes fade the model differs again, so the picture keeps repainting itself (and follows a moving source).
const s = source('${name}')
const brushId = 'oil'              // oil | bristles | charcoal | chalk | pencil | marker | ink | any brush of yours
const look = { hair: 1.6, streaks: 0.35 }   // the brush's own parameters
const tolerance = 1 /* 0.3..3 */    // how different the picture may be before it is painted over (small: faithful)
const speed = 1 /* 0.2..3 */        // how many strokes are painted at once
const linger = 1 /* 0.3..3 */       // how long they live (times)
const stop = 60 /* 10..150 */       // how far the color may turn before a stroke stops
// A layer: brush width (of the board's width), steps a stroke takes, most alive, seconds they live, difference that calls for it, births a run
const layers = [
  { w: 0.14, steps: 5, n: 90, life: 24, err: 60, cap: 3 },
  { w: 0.075, steps: 7, n: 220, life: 18, err: 44, cap: 5 },
  { w: 0.038, steps: 9, n: 420, life: 14, err: 32, cap: 9 },
  { w: 0.018, steps: 10, n: 700, life: 10, err: 24, cap: 16 }
]

const memo = state('paint')
const now = Date.now()
const alive = (memo.strokes || []).filter(k => now - k.born < k.life * 1000)
const asp = width / height, G = 48                      // the model: G by G cells
const paper = [244, 240, 232]
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
const hex = c => '#' + c.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')
const rgb = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const grad = (x, y, e) => [s.value(x + e, y) - s.value(x - e, y), s.value(x, y + e) - s.value(x, y - e)]

// The source on the grid, and the model: the color each cell shows so far, and how much is painted there.
const src = range(G * G).map(i => s.rgb(((i % G) + 0.5) / G, (Math.floor(i / G) + 0.5) / G))
const col = range(G * G).map(() => paper.slice()), cov = new Float32Array(G * G)
const splat = (k, a) => {
  const r = layers[k.li].w * G * 0.5, c = rgb(k.color)
  for (let q = 0; q + 1 < k.pts.length; q++) {
    const [x0, y0] = k.pts[q], [x1, y1] = k.pts[q + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * G * 2))
    for (let t = 0; t <= n; t++) {
      const px = (x0 + (x1 - x0) * t / n) * G, py = (y0 + (y1 - y0) * t / n) * G
      for (let cy = Math.max(0, Math.floor(py - r)); cy <= Math.min(G - 1, Math.floor(py + r)); cy++)
        for (let cx = Math.max(0, Math.floor(px - r)); cx <= Math.min(G - 1, Math.floor(px + r)); cx++) {
          if ((cx + 0.5 - px) ** 2 + (cy + 0.5 - py) ** 2 > r * r + 0.5) continue
          const i = cy * G + cx
          for (let j = 0; j < 3; j++) col[i][j] += (c[j] - col[i][j]) * a
          cov[i] += (1 - cov[i]) * a
        }
    }
  }
}
const weight = k => { const age = (now - k.born) / 1000; return Math.min(1, age / 0.6) * Math.min(1, (k.life - age) / k.out) }
for (const k of alive.slice().sort((a, b) => a.li - b.li || a.born - b.born)) splat(k, Math.max(0, weight(k)))

// One stroke of a layer, starting at a cell, or null when the place is too small to paint.
const make = (L, li, cell) => {
  const e = Math.max(0.006, L.w * 0.4)
  let x = ((cell % G) + Math.random()) / G, y = (Math.floor(cell / G) + Math.random()) / G
  const c0 = s.rgb(x, y), samples = [c0], pts = [[x, y]], d = L.w * 0.55
  let vx = 0, vy = 0
  for (const i of range(L.steps)) {
    const g = grad(x, y, e), m = Math.hypot(g[0], g[1])
    let nx = -g[1], ny = g[0]                                  // along the form
    if (m > 0.004) { nx /= m; ny /= m } else if (i === 0) { const a = Math.random() * TAU; nx = cos(a); ny = sin(a) } else { nx = vx; ny = vy }
    if (nx * vx + ny * vy < 0) { nx = -nx; ny = -ny }         // keep going the same way
    vx = i ? vx * 0.5 + nx * 0.5 : nx; vy = i ? vy * 0.5 + ny * 0.5 : ny
    const l = Math.hypot(vx, vy) || 1; vx /= l; vy /= l
    x += vx * d; y += vy * d / asp
    if (x < 0 || x > 1 || y < 0 || y > 1) break
    const c = s.rgb(x, y)
    if (i >= 1 && dist(c, c0) > stop * (1 + L.w * 6)) break   // big strokes let more turn
    pts.push([x, y]); samples.push(c)
    for (const side of [-0.35, 0.35]) samples.push(s.rgb(Math.max(0, Math.min(1, x - vy * L.w * side)), Math.max(0, Math.min(1, y + vx * L.w * side * asp))))   // across the width
  }
  if (pts.length < 2) return null
  const mean = [0, 1, 2].map(k => samples.reduce((t, c) => t + c[k], 0) / samples.length + (Math.random() - 0.5) * 8)
  const life = L.life * linger * (0.6 + Math.random() * 0.8)
  return { li, pts, color: hex(mean), seed: Math.floor(Math.random() * 1e9), born: now, life, out: Math.min(3, life * 0.35) }
}

// Births: each layer paints where the picture differs most, if that is more than it tolerates. The finer layers
// only where the coarser ones have already painted.
for (const [li, L] of layers.entries()) {
  let have = alive.filter(k => k.li === li).length
  for (const b of range(Math.max(1, Math.round(L.cap * speed)))) {
    if (have >= L.n) break
    let best = -1, bestErr = L.err * tolerance
    for (const t of range(24)) {
      const cell = Math.floor(Math.random() * G * G)
      if (li > 0 && cov[cell] < 0.6) continue
      const err = dist(src[cell], col[cell])
      if (err > bestErr) { best = cell; bestErr = err }
    }
    if (best < 0) continue
    const k = make(L, li, best)
    if (!k) continue
    alive.push(k); have++; splat(k, 1)                        // painted at once in the model: the next one goes elsewhere
  }
}
memo.strokes = alive

// Drawn: big layers first, so small strokes lie on top; each on its own time envelope.
for (const k of alive.slice().sort((a, b) => a.li - b.li || a.born - b.born)) {
  const L = layers[k.li]
  line(k.pts, { brush: brushId, ...look, width: L.w * width * 0.9, color: k.color, seed: k.seed, born: k.born,
    pressures: t => 0.5 + 0.5 * Math.sin(Math.PI * t) ** 0.6,
    time: { in: 0.4, out: k.out, life: k.life, draw: 0.5 + L.w * 5 } })
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
    code: name => `// The face tracker on “${name}”: the face as a few lines (the abstract faces), the tracker's own
// markers (its points and expression bars), and the source underneath. Each has its opacity: 0 hides it.
// s.face is a list of faces: { points: [{ x, y, z }] × 478, blend: { smile, jawOpen, blink… 0..1 }, box }.
const s = source('${name}')
const under = 0.35 /* 0..1 */    // the source under the board
const markers = 0.7 /* 0..1 */   // the tracker's points and expression bars
const faces = 1 /* 0..1 */       // the abstract faces: outline, lips, eyes, brows
const weight = 3 /* 1..14 */     // their line width
underlay({ source: '${name}', opacity: under })
const ring = (f, ids, closed) => faces > 0 && line(ids.map(i => [f.points[i].x, f.points[i].y]), { brush: 'pen', width: weight, color: '#1d1b19', closed, opacity: faces })
const OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]
const LIPS = [61, 146, 91, 181, 84, 17, 314, 405, 321, 375, 291, 409, 270, 269, 267, 0, 37, 39, 40, 185]
const EYE_L = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466]
const EYE_R = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
const BROW_L = [276, 283, 282, 295, 285], BROW_R = [46, 53, 52, 65, 55]
const BARS = ['smile', 'frown', 'blink', 'browUp', 'jawOpen', 'mouthPucker']
for (const f of s.face) {
  if (markers > 0) for (const p of f.points) point(p.x, p.y, { size: 4, color: '#c8664f', opacity: markers })
  ring(f, OVAL, true); ring(f, LIPS, true); ring(f, EYE_L, true); ring(f, EYE_R, true); ring(f, BROW_L); ring(f, BROW_R)
}
// The expression bars, once (for the first face): a bar and its value.
const first = s.face[0]
if (first && markers > 0) BARS.forEach((k, i) => {
  const v = first.blend[k] || 0, y = 0.06 + i * 0.05
  plane([[0.04, y], [0.04 + 0.2 * v, y], [0.04 + 0.2 * v, y + 0.03], [0.04, y + 0.03]], { color: '#c8664f', path: 'straight', opacity: markers })
  note(0.27, y - 0.004, k + ' ' + v.toFixed(2), { note: { size: 13, font: 'mono' }, opacity: markers })
})
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
