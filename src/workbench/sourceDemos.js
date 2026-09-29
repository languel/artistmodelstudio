/**
 * Demos that route a source into a board: ordinary board code (edit it, copy it, export it), which
 * the board follows (re-runs on each new frame). Nothing here is special: any board's code can
 * read any source.
 */
export const SOURCE_DEMOS = [
  {
    id: 'redraw', label: 'Redraw as shapes', hint: 'A continuous fit: each new frame replaces a few shapes',
    code: name => `// Redraw “${name}” as shapes: each new frame replaces a few (live), while the board follows it.
fit(source('${name}'), { shapes: 120 /* 10..400 */, live: true })
`
  },
  {
    id: 'fitcode', label: 'Fit shapes, in code', hint: 'The greedy shape fitting of fit(), written out: change how shapes are tried, kept and drawn',
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

// Drawn as planes: the ground, then the shapes, oldest first.
const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('')
plane([[0, 0], [1, 0], [1, 1], [0, 1]], { color: hex(ground), path: 'straight' })
for (const sh of memo.shapes) {
  if (sh.kind === 'rect') plane([[sh.x0 / W, sh.y0 / H], [sh.x1 / W, sh.y0 / H], [sh.x1 / W, sh.y1 / H], [sh.x0 / W, sh.y1 / H]], { color: hex(sh.color), path: 'straight' })
  else plane(range(12).map(i => [(sh.cx + sh.r * cos(i / 12 * TAU)) / W, (sh.cy + sh.r * sin(i / 12 * TAU)) / H]), { color: hex(sh.color) })
}
`
  },
  {
    id: 'dots', label: 'Dots', hint: 'Pointillism: a dot of the source’s color at random places',
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
    id: 'strokes', label: 'Strokes along forms', hint: 'Short strokes along the contours (where the light changes least)',
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
