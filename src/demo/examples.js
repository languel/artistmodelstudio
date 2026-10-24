/**
 * Three small scores for the sequencer demo. Each is plain data (the same JSON a score exports); the blurb says
 * what to listen for. Coordinates are artboard units (400 × 300), y down.
 */
const SETTINGS = { tempo: 120, signature: { numerator: 4, denominator: 4 }, fps: 30, beatUnits: 25 };
const ART = { width: 400, height: 300 };
const loop = (id, pts) => ({ id, label: id, role: 'line', closed: true, path: 'straight', points: pts, play: { path: true } });
const path = (id, pts) => ({ id, label: id, role: 'line', path: 'straight', points: pts, play: { path: true } });
const node = (id, x, y, n) => ({ id, label: id, role: 'point', points: [[x, y]], play: { node: { name: id, ...n } } });

export const EXAMPLES = [
  {
    id: 'ring',
    title: 'Midinous ring',
    blurb: 'Nodes around a loop, after Midinous. A driver goes round forever and every node it passes plays its note: a ring of four notes, each one a step up the scale from the last.',
    listen: 'Each corner sounds once per lap. Drag a node in the editor and the pattern changes.',
    doc: {
      artboard: ART, settings: SETTINGS,
      elements: [
        loop('ring', [[80, 60], [320, 60], [320, 240], [80, 240]]),
        { id: 'driver', label: 'driver', role: 'point', points: [[80, 60]], play: { travel: { on: 'ring', dur: 8 } } },
        node('n1', 80, 60, { kind: 'note', note: 60, start: true, scale: 'Ionian', root: 60 }),
        node('n2', 320, 60, { kind: 'note', rel: 2, scale: 'Ionian', root: 60 }),
        node('n3', 320, 240, { kind: 'note', rel: 2, scale: 'Ionian', root: 60 }),
        node('n4', 80, 240, { kind: 'note', rel: 2, scale: 'Ionian', root: 60 })
      ]
    }
  },
  {
    id: 'curve',
    title: 'Curve and planes',
    blurb: 'A curve travelled round and round, with planes across it that sound when crossed, the way IanniX does: height picks the pitch.',
    listen: 'Each plane sounds the note at its height. The curve sets the timing, the planes the pitches.',
    doc: {
      artboard: ART, settings: SETTINGS,
      elements: [
        loop('wave', [[60, 150], [120, 60], [200, 40], [280, 60], [340, 150], [280, 250], [200, 260], [120, 240]]),
        { id: 'sweeper', label: 'sweeper', role: 'point', points: [[60, 150]], play: { travel: { on: 'wave', dur: 6 } } },
        { id: 'p1', label: 'p1', role: 'line', path: 'straight', points: [[150, 20], [150, 280]], play: { trigger: { emit: "note(1, snap(48 + lane(ny, 24), 'dorian', 62), 90, 'gate')" } } },
        { id: 'p2', label: 'p2', role: 'line', path: 'straight', points: [[250, 20], [250, 280]], play: { trigger: { emit: "note(2, snap(60 + lane(ny, 24), 'pentatonicmajor', 60), 80, 'gate')" } } }
      ]
    }
  },
  {
    id: 'both',
    title: 'Nodes and a curve',
    blurb: 'Both at once: a Midinous ring makes the bass, and a plane on the ring starts a second traveler on a curve, which plays the melody when it runs.',
    listen: 'The bass loops. Every time the driver crosses the plane, the melody starts from its beginning.',
    doc: {
      artboard: ART, settings: SETTINGS,
      elements: [
        loop('bass', [[60, 200], [200, 200], [200, 280], [60, 280]]),
        { id: 'walker', label: 'walker', role: 'point', points: [[60, 200]], play: { travel: { on: 'bass', dur: 8 } } },
        node('b1', 60, 200, { kind: 'note', note: 36, start: true, scale: 'Aeolian', root: 36 }),
        node('b2', 200, 200, { kind: 'note', rel: 4, scale: 'Aeolian', root: 36 }),
        node('b3', 200, 280, { kind: 'note', rel: 2, scale: 'Aeolian', root: 36 }),
        node('b4', 60, 280, { kind: 'note', rel: 3, scale: 'Aeolian', root: 36 }),
        path('tune', [[60, 40], [140, 20], [220, 60], [300, 40], [360, 90]]),
        { id: 'cue', label: 'cue', role: 'line', path: 'straight', points: [[130, 170], [130, 300]], play: { trigger: { emit: "note(3, snap(72 + lane(ny, 12), 'Aeolian', 72), 96, 0.25)", on: ['cross'] } } },
        { id: 'melody', label: 'melody', role: 'point', points: [[60, 40]], play: { travel: { on: 'tune', dur: 4, cue: 'cue' } } }
      ]
    }
  }
];
