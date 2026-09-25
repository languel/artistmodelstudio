/**
 * First exercises: scores written in the process vocabulary.
 * Sources: Kandinsky, Point and Line to Plane (1926); Klee, Pedagogical Sketchbook (1925);
 * the algorists (Mohr, Verostko). Each score names its stages, records its decisions,
 * and says why its marks are there, so students and models can compare processes.
 */
export const EXERCISES = [
  {
    id: 'point-weight',
    title: 'Point: where the weight sits',
    brief: 'Place one point on the basic plane. Kandinsky: above feels light and free, below dense and heavy; left is distant and loose, right is near and constrained. Decide where the weight sits, then check it against the plane\'s diagonals.',
    source: `artboard(800, 800, '#f2ede3')

stage('Analysis', 'analysis')
// Kandinsky's basic plane: two diagonals divide it into four tensions.
guide([[0, 0], [800, 800]], { why: 'lyrical diagonal: from upper left, calm descent' })
guide([[0, 800], [800, 0]], { why: 'dramatic diagonal: rising from lower left' })
guide([[400, 0], [400, 800]], { why: 'vertical axis: warm/cold, left/right' })
guide([[0, 400], [800, 400]], { why: 'horizontal axis: light above, heavy below' })

stage('Concept', 'concept')
const where = decide('Where does the weight sit?', ['high right', 'center', 'low left'], 'low left',
  'below and left the point sinks and gathers weight')
const [x, y] = { 'high right': [560, 230], center: [400, 400], 'low left': [250, 590] }[where]

stage('Marks', 'marks')
point(x, y, { size: 90, why: 'the only element: its size and place are the whole composition' })

stage('Notes', 'notes')
note(20, 20, 'Try the other options in decide(...) and compare: which feels heavier?')`
  },
  {
    id: 'line-walk',
    title: 'Line: a walk for its own sake',
    brief: 'Klee\'s active line: a point that moves freely, for the sake of moving. Plan the gesture first, then let the line walk it with its own small deviations.',
    source: `artboard(1000, 700, '#f3efe6')

stage('Gesture', 'construction')
const plan = walk({ from: [80, 420], heading: -10, steps: 24, step: 38, turn: i => sin(i / 3) * 22 })
gesture(plan, { why: 'the intention: a rising, swaying movement across the plane' })

stage('Line', 'marks')
seed(7)
const path = walk({ from: [80, 420], heading: -10, steps: 220, step: 4,
  turn: (i, t) => sin(i / 13) * 5.5 + (noise(i / 9) - 0.5) * 9 })
line(path, { width: 5, pressure: 0.8, taper: 0.4, wobble: 0.1,
  pressures: t => 0.35 + 0.6 * sin(t * PI), why: 'the active line: walks the plan but finds its own way' })

stage('Notes', 'notes')
note(20, 20, 'Klee: "An active line on a walk, moving freely, without goal."')`
  },
  {
    id: 'whose-line',
    title: 'Line: whose line is it?',
    brief: 'After Klee and William Ngan ("Taking a line for a walk", 2016). A brush is someone\'s idea of a line: the app maker\'s invisible hand guides yours. Create your line before you draw it: a function of the walk (its points, direction and speed). Keep it to one idea. In code complexity is free and simplicity is elusive.',
    source: `artboard(1000, 700, '#f3efe6')

stage('Concept', 'concept')
decide('What should this line say?', ['it bites', 'it hesitates', 'it breathes'], 'it bites',
  'one idea only: a line with teeth where the hand hurried')

// A line is a function of its walk: frames carry x, y, the normal (nx, ny) and the hand's speed.
defineLine('teeth', { doc: 'Teeth that grow where the hand was fast', params: { bite: [0, 60, 18] } },
  (ctx, frames, p, env) => {
    ctx.lineWidth = 1.2
    ctx.beginPath()
    frames.forEach((f, i) => {
      const o = i % 2 ? min(p.bite, f.speed * 2) : 0   // every other frame steps out, by speed
      const x = f.x + f.nx * o, y = f.y + f.ny * o
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)
    })
    ctx.stroke()
  })

stage('Gesture', 'construction')
const path = walk({ from: [90, 380], heading: -8, steps: 60, step: 14, turn: (i, t) => sin(i / 5) * 14 + noise(i / 9, 0) * 10 })
gesture(path, { why: 'the walk before the line: where it goes, not yet how it looks' })

stage('Line', 'marks')
// The same walk twice: once calm (slow, the time between points is long), once hurried.
line(path.map(([x, y], i) => [x, y - 90, i * 60]), { brush: 'teeth', bite: 30, why: 'slow: the teeth stay small' })
line(path.map(([x, y], i) => [x, y + 90, i * 8]), { brush: 'teeth', bite: 30, why: 'hurried: the same line bites' })

stage('Notes', 'notes')
note(40, 40, 'Change what the line says: rewrite defineLine, keep it short. Then draw your own walk and give it your line in Properties.')`
  },
  {
    id: 'medial-line',
    title: 'Line: the medial line encloses a plane',
    brief: 'Klee\'s medial line: a line that closes on itself and so describes a plane. Draw the walk, close it, then let the enclosed area become a plane.',
    source: `artboard(900, 900, '#f1ece2')

stage('Construction', 'construction')
const c = [450, 450]
guide(circle(c[0], c[1], 260), { why: 'the envelope the walk will wander around' })

stage('Line', 'structure')
seed(3)
const loop = range(90).map(i => {
  const a = i / 90 * TAU, r = 230 + (noise(i / 7) - 0.5) * 160
  return [c[0] + cos(a) * r, c[1] + sin(a) * r]
})
line(loop, { closed: true, width: 3, why: 'the medial line: walking and enclosing at once' })

stage('Plane', 'value')
plane(loop, { brush: 'hatch', angle: 35, spacing: 9, width: 1.2, why: 'what the line enclosed becomes a plane, stated by hatching' })

stage('Notes', 'notes')
note(20, 20, 'Line becomes plane when it closes. Change seed(3) and compare shapes.')`
  },
  {
    id: 'value-by-hatching',
    title: 'Line to plane: three values by hatching',
    brief: 'State three values (light, middle, dark) using only lines. Value comes from spacing and crossing, not from color.',
    source: `artboard(1000, 420, '#f4f0e8')

stage('Construction', 'construction')
for (const x of [60, 370, 680]) guide(rect(x, 80, 260, 260), { why: 'three equal planes, so only value differs' })

stage('Value', 'value')
decide('How many values?', ['2', '3', '5'], '3', 'three values is the classic notan study')
plane(rect(60, 80, 260, 260), { brush: 'hatch', angle: 45, spacing: 16, width: 1.2, why: 'light: wide spacing' })
plane(rect(370, 80, 260, 260), { brush: 'hatch', angle: 45, spacing: 7, width: 1.2, why: 'middle: close spacing' })
plane(rect(680, 80, 260, 260), { brush: 'hatch', angle: 45, spacing: 6, width: 1.4, cross: 1, why: 'dark: crossed and close' })

stage('Notes', 'notes')
note(60, 360, 'Squint: do the three planes read as light, middle, dark?')`
  },
  {
    id: 'structural-rhythm',
    title: 'Structure: rhythm by repetition and gradation',
    brief: 'Klee\'s structural rhythms: a unit repeated, then graded in weight. Decide the unit and the law of change.',
    source: `artboard(1000, 600, '#f2eee5')

stage('Construction', 'construction')
guide([[60, 300], [940, 300]], { why: 'the axis the rhythm travels along' })

stage('Rhythm', 'structure')
const unit = decide('What is the unit?', ['bar', 'dot'], 'bar', 'a vertical bar reads as a beat')
const law = decide('Law of change', ['constant', 'growing', 'pulsing'], 'pulsing', 'pulsing gives a strong-weak metre')
for (const i of range(16)) {
  const x = 90 + i * 55
  const w = law === 'constant' ? 1 : law === 'growing' ? 0.3 + i / 15 : (i % 2 ? 0.45 : 1)
  if (unit === 'bar') line([[x, 300 - 160 * w], [x, 300 + 160 * w]], { width: 4 + 10 * w, taper: 0, why: \`beat \${i + 1}\` })
  else point(x, 300, { size: 12 + 30 * w, why: \`beat \${i + 1}\` })
}

stage('Notes', 'notes')
note(60, 40, 'Change the law of change: what happens to the reading speed?')`
  },
  {
    id: 'algorist-family',
    title: 'Algorist: a family of forms',
    brief: 'After Mohr and Verostko: one rule produces a family of forms; the realization (the brush) is separate from the rule. Vary the seed, keep the rule.',
    source: `artboard(1000, 1000, '#f3efe6')

stage('Rule', 'concept')
decide('The rule', ['wandering loops', 'nested squares'], 'wandering loops', 'loops show the walk and the enclosure together')

stage('Family', 'structure')
for (const gx of range(3)) for (const gy of range(3)) {
  seed(100 + gx * 3 + gy)
  const cx = 190 + gx * 310, cy = 190 + gy * 310
  const pts = walk({ from: [cx - 60, cy], heading: random(0, 360), steps: 140, step: 4,
    turn: i => 7 + (noise(i / 10) - 0.5) * 18 })
  line(pts, { width: 1.6, taper: 0.2, why: \`member \${gx * 3 + gy + 1}: same rule, seed \${100 + gx * 3 + gy}\` })
}

stage('Notes', 'notes')
note(20, 20, 'Verostko: the algorithm is the score, the pen is the performer.')`
  }
];
