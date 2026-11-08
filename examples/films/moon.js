/**
 * The short moongazing film, rebuilt with the film system (src/workbench/film.js): the lesson's own set and puppet (board 4.1,
 * a three.js sketch on a clock of its own), but now photographed by a camera: three shots cut from one running sketch, a push in
 * on the figure, the reach seen from lower down, and the whole sky for the fall, with a title and a credit as cards over it.
 * The sketch starts when the render starts, so the story keeps its own time across the cuts (13 s).
 */
export const FILM = {
  id: 'moon',
  title: 'The Moon',
  summary: 'A paper figure on a dune watches the moon rise, stands, reaches for it, and cannot. A silhouette film in thirteen seconds, made with Artist Model Studio.',
  credit: 'Puppet, set and film: the silhouette lesson, Artist Model Studio. Made in homage to Lotte Reiniger; no frame of her work is used.',
  camera: { w: 1024, h: 768 },
  fps: 25,
  voice: false,
  beats: [
    { board: '4.1 · The moon', dur: 4800, label: 'Wide', pose: { z: 1, dx: 0, dy: 0 }, to: { z: 1.35, dx: -0.12, dy: 0.12 }, title: 'The Moon', sub: 'a silhouette film', titleDur: 2200, chapter: 'The dune' },
    { board: '4.1 · The moon', dur: 4400, label: 'The reach', pose: { z: 1.5, dx: 0.02, dy: -0.12 }, to: { z: 1.2, dx: 0.08, dy: -0.1 }, chapter: 'The reach' },
    { board: '4.1 · The moon', dur: 3800, label: 'Sky', pose: { z: 1, dx: 0, dy: -0.04 }, to: { z: 1, dx: 0, dy: 0.04 }, chapter: 'The fall' }
  ]
};
