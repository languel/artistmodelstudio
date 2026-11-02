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

// The pose after the two drags (the pointer ends at -40 degrees from the shoulder, then at 25 degrees from the elbow), for the diagram.
const SK = '1.3 · A hinge';
const at = (o, len, deg) => [o[0] + len * Math.cos(rad(deg)), o[1] + len * Math.sin(rad(deg))];
const P1 = at(SHOULDER, LEN, -40), P2 = at(P1, 1.5, 25), PTR = at(P1, 2.0, 25);
const mid = (a, b, off, deg) => [(a[0] + b[0]) / 2 + off * Math.cos(rad(deg + 90)), (a[1] + b[1]) / 2 + off * Math.sin(rad(deg + 90))];
const SPACE = { frame: FRAME };

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
    { say: 'Where does the elbow end up? Hang the upper arm from the shoulder, turn it by theta one, and its far end lands at P one: the shoulder, plus the length times sine theta, minus cosine theta.',
      draw: { on: SK, space: SPACE, step: 450, shapes: [
        { t: 'line', a: SHOULDER, b: at(SHOULDER, 1.2, -90), color: 'ink', dash: true, w: 2 },
        { t: 'dot', p: SHOULDER, color: 'ink' }, { t: 'label', p: SHOULDER, tex: 'P_0', color: 'ink', dx: -26, dy: -18 },
        { t: 'arc', c: SHOULDER, r: 0.8, from: -90, to: -40, color: 'amber', w: 4 },
        { t: 'label', p: at(SHOULDER, 1.1, -65), tex: '\\theta_1', color: 'amber' },
        { t: 'line', a: SHOULDER, b: P1, color: 'amber', w: 7 },
        { t: 'label', p: mid(SHOULDER, P1, 0.32, -40), tex: 'L_1', color: 'amber' },
        { t: 'dot', p: P1, color: 'amber' }, { t: 'label', p: P1, tex: 'P_1', color: 'ink', dx: 6, dy: -22 }] },
      formula: { on: SK, at: [0.97, 0.66], align: 'right', tex: 'P_1 = P_0 + L_1\\begin{pmatrix}\\sin\\theta_1\\\\ -\\cos\\theta_1\\end{pmatrix}' },
      select: { code: '1.3 · A hinge · code', from: 'g.position.y = -bones', to: 'g.position.y = -bones' }, hold: 800 },
    { say: 'The forearm turns by theta two on top of that, so turns add down the chain: its angle in the world is theta one plus theta two. A group inside a group adds the turns for you.',
      draw: { on: SK, space: SPACE, step: 450, shapes: [
        { t: 'line', a: P1, b: at(P1, 0.9, -40), color: 'ink', dash: true, w: 2 },
        { t: 'arc', c: P1, r: 0.55, from: -40, to: 25, color: 'blue', w: 4 },
        { t: 'label', p: at(P1, 0.85, -7), tex: '\\theta_2', color: 'blue' },
        { t: 'line', a: P1, b: P2, color: 'blue', w: 7 },
        { t: 'label', p: mid(P1, P2, 0.34, 25), tex: 'L_2', color: 'blue' },
        { t: 'dot', p: P2, color: 'blue' }, { t: 'label', p: P2, tex: 'P_2', color: 'ink', dx: 8, dy: -22 }] },
      formula: { on: SK, at: [0.97, 0.82], align: 'right', tex: '\\Theta_2 = \\theta_1 + \\theta_2,\\quad P_2 = P_1 + L_2\\begin{pmatrix}\\sin\\Theta_2\\\\ -\\cos\\Theta_2\\end{pmatrix}' },
      select: { code: '1.3 · A hinge · code', from: 'const angleOf', to: 'const angleOf' }, hold: 800 },
    { say: 'Dragging runs it backwards. Given the pointer, phi is the angle that points the piece at it. Take away the parent\'s angle, wrap it into half a turn either way, and that is the hinge\'s turn.',
      clear: { on: SK },
      draw: { on: SK, space: SPACE, step: 450, shapes: [
        { t: 'line', a: P1, b: at(P1, 1.1, -90), color: 'ink', dash: true, w: 2 },
        { t: 'dot', p: P1, color: 'ink' }, { t: 'label', p: P1, tex: 'P', color: 'ink', dx: -20, dy: -18 },
        { t: 'line', a: P1, b: PTR, color: 'red', dash: true, w: 3, arrow: true },
        { t: 'dot', p: PTR, color: 'red' }, { t: 'label', p: PTR, tex: 'p', color: 'red', dx: 12, dy: -16 },
        { t: 'arc', c: P1, r: 0.5, from: -90, to: 25, color: 'red', w: 4 },
        { t: 'label', p: at(P1, 0.78, -32), tex: '\\varphi', color: 'red' }] },
      formula: { on: SK, at: [0.97, 0.66], align: 'right', tex: '\\varphi = \\operatorname{atan2}(p_y - P_y,\\ p_x - P_x) + \\tfrac{\\pi}{2}' },
      select: { code: '1.3 · A hinge · code', from: 'const world = Math.atan2', to: 'held.rotation.z' }, hold: 600 },
    { say: 'The hinge turns by phi, less the angle of the group it sits in.', hold: 600,
      formula: { on: SK, at: [0.97, 0.82], align: 'right', tex: '\\theta_i = \\operatorname{wrap}(\\varphi - \\Theta_{i-1}),\\quad \\operatorname{wrap}(a) = \\operatorname{atan2}(\\sin a,\\cos a)' } },
    { say: 'So turning the upper arm turns everything inside it. That is all a hinge is.', hold: 1500, clear: { on: SK } }
  ]
};
