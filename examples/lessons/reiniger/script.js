/**
 * Lesson 1.3, performed: drag the joints of the hinge, open the pseudocode, select its first line, then the code that does it.
 * Positions are in the sketch's own units (an orthographic camera that sees FRAME = 7 units top to bottom), so they follow the board's size.
 */
const FRAME = 7;
const rad = d => (d * Math.PI) / 180;
/** Points on an arc around a centre: from one angle to another, in degrees (0 is to the right, 90 up). */
const arc = ([cx, cy], r, from, to, n = 16) => Array.from({ length: n + 1 }, (_, i) => { const a = rad(from + ((to - from) * i) / n); return [cx + r * Math.cos(a), cy + r * Math.sin(a)]; });

// The hinge starts bent: the upper arm hangs from (-1.2, 1.8) turned 0.6 rad, the forearm another 0.9 rad from its end.
const SHOULDER = [-1.2, 1.8];
const LEN = 1.7;
const END_AT = deg => [SHOULDER[0] + LEN * Math.cos(rad(deg)), SHOULDER[1] + LEN * Math.sin(rad(deg))];

export const HINGE = {
  id: 'reiniger-hinge',
  title: 'The hinge (lesson 1.3), performed',
  summary: 'Drags the joints of the hinge, opens its pseudocode, selects the first line, then selects the code that makes it.',
  lesson: 'reiniger',
  cues: [
    { goto: '1.3 · A hinge', restart: '1.3 · A hinge',
      say: 'A hinge is a group: it sits at the pivot, and everything it holds turns with it.' },
    { say: 'Turn the upper arm, and the forearm swings along.',
      drag: { on: '1.3 · A hinge', space: { frame: FRAME }, ms: 2200, path: [...arc(SHOULDER, 1.2, -55.6, -125, 14), ...arc(SHOULDER, 1.2, -125, -40, 14)] } },
    { say: 'Turn the forearm, and only it moves.',
      drag: { on: '1.3 · A hinge', space: { frame: FRAME }, ms: 2200, path: [...arc(END_AT(-40), 0.7, 11.6, -70, 12), ...arc(END_AT(-40), 0.7, -70, 25, 12)] } },
    { say: 'Reiniger joined her paper pieces with thin wire. It is the same idea in four lines.',
      click: { summary: '1.3 · A hinge · notes' } },
    { say: 'First line: the upper arm is a group at the shoulder, and it holds the upper arm piece.',
      select: { pseudo: '1.3 · A hinge · notes', line: 1 } },
    { say: 'In the code, that is a THREE.Group for each bone: the hinge. The first goes into the scene, and each of the others into the group before it.',
      select: { code: '1.3 · A hinge · code', from: 'bones.forEach', to: 'group.push(g);', extra: 1 }, hold: 2500 },
    { say: 'So turning the upper arm turns everything inside it. That is all a hinge is.', hold: 1500 }
  ]
};
