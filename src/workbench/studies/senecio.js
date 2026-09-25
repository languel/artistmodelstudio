/**
 * A study of Klee's Senecio (1922, oil on gauze): what it is made of, as code.
 *
 * Observations:
 *   1. A head built from basic forms: a circle almost filling the panel, cut by a grid.
 *   2. Paint rubbed thin over gauze: flat planes, but worn, so light ground and red underpaint show,
 *      and the weave of the cloth runs through everything.
 *   3. Thin incised lines state the divisions and the almond eyes.
 *   4. Few, small, complementary accents carry it: two red discs, one green arc, a violet cross.
 */

export const OBSERVATIONS = [
  'The head is a circle that nearly fills the panel, cut by a few vertical and horizontal divisions into planes: a face built from basic forms, not modelled light and shadow.',
  'The paint is rubbed thin over gauze. Each plane is flat, but worn: light ground and red underpaint show through, and the weave of the cloth runs through everything.',
  'Thin incised lines state the divisions, the circle and the almond eyes.',
  'A few small accents carry the whole: two red discs, one green arc, a violet cross. The rest stays in warm, close values.'
];

export const SCUMBLE = `brush({
  id: 'scumble',
  label: 'Scumble',
  roles: ['plane'],
  doc: 'Paint rubbed thin over a woven ground (after Senecio, oil on gauze): an even body, worn patches where ground or warm underpaint show, and the weave of the cloth.',
  params: {
    opacity: [0, 1, 0.92, 'Body of the paint'],
    wear: [0, 1, 0.35, 'How much is rubbed away'],
    warm: [0, 1, 0.25, 'How much of the wear shows warm underpaint (the rest shows light ground)'],
    grain: [0, 1, 0.4, 'The weave of the cloth'],
    scale: [2, 60, 12, 'Size of the rubbed patches']
  },
  draw(ctx, e, p, k) {
    if (e.points.length < 3) return
    const poly = e.points   // exact outline: grids and triangles keep their corners
    const hex = (e.color || '#d98c52').replace('#', '').slice(0, 6)
    const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16))
    const mix = (to, t) => 'rgb(' + rgb.map((v, i) => Math.round(v + (to[i] - v) * t)).join(',') + ')'
    const ys = poly.map(q => q[1]), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const xsAll = poly.map(q => q[0]), x0 = Math.min(...xsAll), x1 = Math.max(...xsAll)
    const A = ctx.globalAlpha
    ctx.save()
    // 1. the body: one even coat
    ctx.globalAlpha = A * p.opacity
    ctx.fillStyle = e.color || '#d98c52'
    k.tracePath(ctx, poly, true)
    ctx.fill()
    // 2. the wear: short dry strokes where the paint was rubbed, light ground or warm underpaint
    const s = p.scale
    ctx.lineCap = 'round'
    for (let y = y0 + k.rng() * s * 0.3; y < y1; y += s * 0.3) {
      const xs = k.spans(poly, y)
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = xs[i] + k.rng() * s * 0.3; x < xs[i + 1]; x += s * (0.25 + k.rng() * 0.45)) {
          const n = k.noise(x / (s * 4), y / (s * 4)) * 0.8 + k.noise(x / s, y / s) * 0.45
          if (n < 1 - p.wear * 1.8) continue
          ctx.strokeStyle = k.rng() > p.warm ? mix([247, 242, 232], 0.65) : mix([190, 58, 36], 0.6)
          ctx.globalAlpha = A * (0.12 + 0.42 * k.rng())
          ctx.lineWidth = s * (0.06 + k.rng() * 0.22)
          const len = s * (0.3 + k.rng() * 1.1), a = (k.rng() - 0.5) * 0.5
          k.segment(ctx, x, y, Math.min(x + Math.cos(a) * len, xs[i + 1]), y + Math.sin(a) * len)
        }
      }
    }
    // 3. the grain: the weave of the gauze, across and down
    if (p.grain > 0) {
      ctx.strokeStyle = mix([70, 45, 30], 0.55)
      ctx.lineWidth = 0.45
      ctx.globalAlpha = A * 0.16 * p.grain
      ctx.beginPath()
      for (let y = y0; y < y1; y += 2.4) { const xs = k.spans(poly, y); for (let i = 0; i + 1 < xs.length; i += 2) { ctx.moveTo(xs[i], y); ctx.lineTo(xs[i + 1], y) } }
      const turned = poly.map(q => [q[1], q[0]])
      for (let x = x0; x < x1; x += 2.4) { const ys2 = k.spans(turned, x); for (let i = 0; i + 1 < ys2.length; i += 2) { ctx.moveTo(x, ys2[i]); ctx.lineTo(x, ys2[i + 1]) } }
      ctx.stroke()
    }
    ctx.restore()
  }
})
`;

export const INCISED = `brush({
  id: 'incised',
  label: 'Incised',
  roles: ['line', 'gesture'],
  doc: 'A thin line scratched into wet paint (after Senecio): a dark cut with a light lip beside it, slightly unsteady.',
  params: {
    width: [0.3, 4, 1.1, 'Width of the cut'],
    lip: [0, 1, 0.55, 'The light edge beside it'],
    waver: [0, 3, 0.5, 'Unsteadiness of the hand']
  },
  draw(ctx, e, p, k) {
    const f = k.frames(e, 6)
    if (f.length < 2) return
    const A = ctx.globalAlpha
    const trace = offset => {
      ctx.beginPath()
      f.forEach((q, i) => {
        const w = k.noise(i / 9, (e.seed || 1) % 97) * p.waver + offset
        const x = q.x + q.nx * w, y = q.y + q.ny * w
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y)
      })
      if (e.closed) ctx.closePath()
      ctx.stroke()
    }
    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    if (p.lip > 0) { ctx.strokeStyle = '#fbf6ec'; ctx.globalAlpha = A * 0.55 * p.lip; ctx.lineWidth = p.width * 1.3; trace(p.width * 1.2) }
    ctx.strokeStyle = e.color || k.INK
    ctx.globalAlpha = A * 0.85
    ctx.lineWidth = p.width
    trace(0)
    ctx.restore()
  }
})
`;

/** The reproduction, written in stages; each stage is typed, then the whole score runs. */
export const REPRO = [
  {
    say: 'Analysis first: the panel, the head circle, and the grid that cuts it. Coordinates are fractions of the artboard, so the score works at any size.',
    code: `// Senecio (after Klee, 1922): a study
artboard(920, 1000, '#d98a52')

// Helpers: the head is a circle; its planes are the circle cut by rectangles.
const head = circle(0.52, 0.405, 0.375, 160)
const cut = (poly, x0, y0, x1, y1) => {
  for (const [ax, v, s] of [[0, x0, 1], [0, x1, -1], [1, y0, 1], [1, y1, -1]]) {
    const inside = q => (q[ax] - v) * s >= 0
    const at = (a, b) => { const t = (v - a[ax]) / (b[ax] - a[ax]); return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] }
    const out = []
    poly.forEach((b, i) => { const a = poly[(i + poly.length - 1) % poly.length]; if (inside(b)) { if (!inside(a)) out.push(at(a, b)); out.push(b) } else if (inside(a)) out.push(at(a, b)) })
    poly = out
  }
  return poly
}
const cell = (x0, y0, x1, y1) => cut(head, x0, y0, x1, y1)
// Straight edges for brushes that smooth their outline (flat): more points along each side.
const straight = pts => pts.flatMap((a, i) => { const b = pts[(i + 1) % pts.length]; return range(8).map(j => [lerp(a[0], b[0], j / 8), lerp(a[1], b[1], j / 8)]) })
const almond = (ax, ay, bx, by, h) => [
  ...range(21).map(i => { const t = i / 20; return [lerp(ax, bx, t), lerp(ay, by, t) - sin(PI * t) * h] }),
  ...range(19).map(i => { const t = (19 - i) / 20; return [lerp(ax, bx, t), lerp(ay, by, t) + sin(PI * t) * h * 0.8] })
]
// The grid: one vertical axis just right of center, two bands (the eyes, the nose)
const xv = 0.535, xl = 0.285, xr = 0.785, yEye = 0.335, yNose = 0.585

stage('Analysis', 'analysis')
decide('How is the face built?', ['modelled light and shadow', 'a circle cut by a grid'], 'a circle cut by a grid',
  'Klee builds the head from a circle divided into colored planes')
guide(head, { why: 'the head: a circle that nearly fills the panel' })
guide([[xv, 0.03], [xv, 0.78]], { why: 'the axis, just right of center' })
guide([[0.1, yEye], [0.95, yEye]], { why: 'the band of the eyes' })
guide([[0.1, yNose], [0.95, yNose]], { why: 'below the nose: where the face turns pale' })
`
  },
  {
    say: 'The ground: warm orange rubbed over red underpaint, the gauze showing through. One plane, with the scumble brush.',
    code: `
stage('Ground', 'blocking')
plane(rect(0, 0, 1, 1), { brush: 'scumble', color: '#d98a52', wear: 0.5, warm: 0.6, grain: 0.55, scale: 16, why: 'warm ground, rubbed over red underpaint' })
`
  },
  {
    say: 'The face: the circle cut into planes, each a close warm value. Pinks through the middle band, yellows to the right, pale below the nose.',
    code: `
stage('Face planes', 'value')
const planes = [
  [cell(0, 0, xv, yEye), '#e9cfb4', 'top left: pale warm'],
  [cell(xv, 0, 1, yEye), '#e6cf72', 'top right: yellow'],
  [cell(0, yEye, xl, yNose), '#e4b99e', 'left edge'],
  [cell(xl, yEye, xv, yNose), '#dea4b7', 'left cheek: pink'],
  [cell(xv, yEye, xr, yNose), '#e2abbb', 'right cheek: pink'],
  [cell(xr, yEye, 1, yNose), '#e8d06a', 'right edge: yellow'],
  [cell(0, yNose, 0.36, 1), '#f2ece2', 'below: white'],
  [cell(0.36, yNose, xv, 1), '#e9dac6', 'below: pale'],
  [cell(xv, yNose, 0.7, 1), '#e7d27a', 'below: a yellow wedge'],
  [cell(0.7, yNose, 1, 1), '#f1ebe0', 'below right: white']
]
for (const [pts, color, why] of planes) plane(pts, { brush: 'scumble', color, wear: 0.3, warm: 0.1, grain: 0.35, why })
// White shapes: the left brow triangle, a pale wedge on the axis, a spike at the right
plane([[0.255, 0.3], [0.375, 0.145], [0.495, 0.3]], { brush: 'scumble', color: '#f5f0e7', wear: 0.25, warm: 0, why: 'the left brow: a white triangle' })
plane([[xv, 0.07], [0.585, 0.08], [0.6, 0.42], [xv, 0.36]], { brush: 'scumble', color: '#f3eee5', wear: 0.3, warm: 0, why: 'a pale wedge down the axis' })
plane([[0.76, 0.13], [0.735, 0.24], [0.8, 0.36], [0.8, 0.19]], { brush: 'scumble', color: '#f3eee5', wear: 0.3, warm: 0, why: 'a white spike at the right' })
`
  },
  {
    say: 'Structure: incised lines. The head, the two almond eyes meeting on the axis, and the nose line down to the mouth.',
    code: `
stage('Structure', 'structure')
const leftEye = almond(0.255, 0.305, 0.54, 0.352, 0.036), rightEye = almond(0.54, 0.352, 0.8, 0.374, 0.03)
plane(leftEye, { brush: 'scumble', color: '#efe6d6', wear: 0.2, warm: 0, grain: 0.5, why: 'the left eye: an almond of pale ground' })
plane(rightEye, { brush: 'scumble', color: '#efe6d6', wear: 0.2, warm: 0, grain: 0.5, why: 'the right eye: a little lower' })
line(head, { brush: 'incised', closed: true, width: 1, why: 'the head, scratched in' })
line(leftEye, { brush: 'incised', closed: true, width: 1.2, why: 'lids of the left eye' })
line(rightEye, { brush: 'incised', closed: true, width: 1.2, why: 'lids of the right eye' })
line([[0.542, 0.352], [0.54, 0.46], [0.535, 0.57]], { brush: 'incised', width: 1, why: 'the nose: one line down the axis' })
`
  },
  {
    say: 'The accents that carry it: two red discs, one green arc for the brow, a small violet cross for the mouth.',
    code: `
stage('Accents', 'accents')
plane(circle(0.392, 0.318, 0.037), { brush: 'flat', color: '#b83a22', why: 'the left eye: a red disc' })
plane(circle(0.648, 0.366, 0.034), { brush: 'flat', color: '#b83a22', why: 'the right eye: a red disc, looking aside' })
line(range(24).map(i => { const t = i / 23; return [lerp(0.575, 0.745, t), 0.33 - sin(PI * (0.15 + t * 0.7)) * 0.07 + t * 0.005] }),
  { brush: 'ink', color: '#2f5a2e', width: 7, taper: 0.7, pressure: 0.2, why: 'the right brow: one green arc' })
plane(straight(rect(0.528, 0.555, 0.017, 0.05)), { brush: 'flat', color: '#5b2a52', why: 'the mouth: a small violet cross' })
plane(straight(rect(0.515, 0.583, 0.042, 0.014)), { brush: 'flat', color: '#5b2a52', why: 'its cross-bar' })
`
  },
  {
    say: 'Neck and shoulders: the same grid, continued below. Small squares of pink, violet and white; a band of brown, red and violet.',
    code: `
stage('Neck and shoulders', 'value')
plane(rect(0.4, 0.75, 0.14, 0.13), { brush: 'scumble', color: '#ecdcdc', wear: 0.4, warm: 0.3, why: 'the neck: pale' })
plane(rect(0.54, 0.75, 0.08, 0.075), { brush: 'scumble', color: '#c86a8c', why: 'a pink square' })
plane(rect(0.47, 0.83, 0.075, 0.06), { brush: 'scumble', color: '#6d5ea3', why: 'a violet square' })
plane(rect(0.545, 0.825, 0.075, 0.06), { brush: 'scumble', color: '#f0e3e3', why: 'a white square' })
plane(rect(0, 0.885, 1, 0.115), { brush: 'scumble', color: '#a98c70', wear: 0.35, warm: 0.3, why: 'the shoulders: a brown band' })
plane(rect(0.26, 0.9, 0.34, 0.1), { brush: 'scumble', color: '#c63a26', wear: 0.25, why: 'a red block' })
plane(rect(0.6, 0.9, 0.115, 0.1), { brush: 'scumble', color: '#5e3b7c', why: 'a violet block' })
plane(rect(0.28, 0.9, 0.3, 0.035), { brush: 'scumble', color: '#efe7da', wear: 0.35, warm: 0, why: 'a white collar' })
plane([[0.545, 0.9], [0.71, 0.9], [0.71, 0.94], [0.565, 0.95]], { brush: 'scumble', color: '#e3cc6a', why: 'a yellow wedge' })

stage('Notes', 'notes')
note(0.04, 0.7, 'A head from a circle and a grid. Close warm values, rubbed; the accents do the looking.')
`
  }
];

/** Out of distribution: a new subject in Senecio's manner. */
export const NOVEL = {
  prompt: 'A lighthouse at dusk, in the manner of Senecio',
  say: 'Now something the painting never shows: a lighthouse at dusk. The same methods: a circle cut by a grid for the lamp room, the neck becomes the tower, the accents become the lights, and a green arc becomes a wave.',
  code: `// A lighthouse at dusk, in the manner of Senecio
artboard(920, 1000, '#d98a52')
const cut = (poly, x0, y0, x1, y1) => {
  for (const [ax, v, s] of [[0, x0, 1], [0, x1, -1], [1, y0, 1], [1, y1, -1]]) {
    const inside = q => (q[ax] - v) * s >= 0
    const at = (a, b) => { const t = (v - a[ax]) / (b[ax] - a[ax]); return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] }
    const out = []
    poly.forEach((b, i) => { const a = poly[(i + poly.length - 1) % poly.length]; if (inside(b)) { if (!inside(a)) out.push(at(a, b)); out.push(b) } else if (inside(a)) out.push(at(a, b)) })
    poly = out
  }
  return poly
}
const straight = pts => pts.flatMap((a, i) => { const b = pts[(i + 1) % pts.length]; return range(8).map(j => [lerp(a[0], b[0], j / 8), lerp(a[1], b[1], j / 8)]) })

stage('Analysis', 'analysis')
decide('What plays the head?', ['the tower', 'the lamp room', 'the sea'], 'the lamp room',
  'the circle that looks out: Senecio\\'s head becomes the room with the light')
const lamp = circle(0.5, 0.24, 0.17, 120)
guide(lamp, { why: 'the lamp room: a circle, like the head' })
guide([[0.5, 0.02], [0.5, 0.86]], { why: 'the axis runs through light and tower' })
guide([[0, 0.66], [1, 0.66]], { why: 'the horizon: where the face turned pale, the sea begins' })

stage('Ground', 'blocking')
plane(rect(0, 0, 1, 0.66), { brush: 'scumble', color: '#d98a52', wear: 0.5, warm: 0.6, grain: 0.55, scale: 16, why: 'dusk: the same warm ground' })
plane(rect(0, 0.66, 1, 0.34), { brush: 'scumble', color: '#6a6f9a', wear: 0.45, warm: 0.2, grain: 0.55, scale: 16, why: 'the sea: the violet accent grown into a field' })

stage('Light', 'value')
plane([[0.5, 0.24], [0, 0.1], [0, 0.34]], { brush: 'scumble', color: '#f3e7c8', opacity: 0.55, wear: 0.4, warm: 0, why: 'the beam: the white brow triangle, turned sideways' })
plane([[0.5, 0.24], [1, 0.16], [1, 0.3]], { brush: 'scumble', color: '#f3e7c8', opacity: 0.35, wear: 0.5, warm: 0, why: 'the fainter beam' })
const cells = [[0, 0, 0.5, 0.2, '#e6cf72'], [0.5, 0, 1, 0.2, '#e9cfb4'], [0, 0.2, 0.38, 0.3, '#e2abbb'], [0.38, 0.2, 0.62, 0.3, '#f5f0e7'], [0.62, 0.2, 1, 0.3, '#e8d06a'], [0, 0.3, 1, 1, '#dea4b7']]
for (const [x0, y0, x1, y1, color] of cells) plane(cut(lamp, x0, y0, x1, y1), { brush: 'scumble', color, wear: 0.3, warm: 0.1, why: 'the lamp room cut into planes, like the face' })

stage('Tower', 'value')
const rows = 6
for (const r of range(rows)) for (const c of range(2)) {
  const y = 0.41 + r * 0.045, x = 0.43 + c * 0.07, w = 0.07 - r * 0.002
  const color = ['#ecdcdc', '#c86a8c', '#6d5ea3', '#f0e3e3', '#e3cc6a', '#c63a26'][(r + c * 3) % 6]
  plane(rect(x - r * 0.004, y, w + r * 0.008, 0.045), { brush: 'scumble', color, wear: 0.35, warm: 0.3, why: 'the tower: the neck\\'s squares, stacked' })
}
plane([[0.3, 0.68], [0.7, 0.68], [0.8, 0.8], [0.2, 0.8]], { brush: 'scumble', color: '#a98c70', wear: 0.4, warm: 0.3, why: 'the rock: the shoulders\\' band' })

stage('Structure', 'structure')
line(lamp, { brush: 'incised', closed: true, why: 'the lamp room, scratched in' })
line([[0.5, 0.07], [0.5, 0.41]], { brush: 'incised', why: 'the axis through the light' })
line([[0.36, 0.41], [0.64, 0.41]], { brush: 'incised', why: 'the gallery' })

stage('Accents', 'accents')
plane(circle(0.44, 0.24, 0.028), { brush: 'flat', color: '#b83a22', why: 'two red lights: the eyes, keeping watch' })
plane(circle(0.56, 0.25, 0.025), { brush: 'flat', color: '#b83a22', why: 'the second, looking aside' })
line(range(30).map(i => { const t = i / 29; return [lerp(0.12, 0.62, t), 0.86 - sin(PI * (0.1 + t * 0.8)) * 0.06] }),
  { brush: 'ink', color: '#2f5a2e', width: 7, taper: 0.7, pressure: 0.2, why: 'one green arc: the brow becomes a wave' })
plane(straight(rect(0.745, 0.735, 0.012, 0.04)), { brush: 'flat', color: '#5b2a52', why: 'a small violet cross: a boat far out' })
plane(straight(rect(0.735, 0.748, 0.032, 0.011)), { brush: 'flat', color: '#5b2a52', why: 'its mast' })

stage('Notes', 'notes')
note(0.04, 0.9, 'Senecio\\'s methods on a new subject: circle and grid, rubbed warm planes, incised lines, three small accents.')
`
};
