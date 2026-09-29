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
