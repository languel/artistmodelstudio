/**
 * Lessons: whole lectures as scenes of frames (examples/lessons). A lesson is data (sections of boards with code, notes
 * and a bibliography); the builder (examples/lessons/sampling/scene.js) makes it a scene. The palette (`/lesson`), the
 * Docs and the walkthroughs all build them from here.
 */
export const LESSONS = [
  { id: 'sampling', title: 'Pointillism and Expressionism, by sampling', summary: 'Seurat, Munch and Muybridge as sources: sample a picture, decide what to draw there. Diagrams of the eye, ten examples, a body as a source.', languages: ['studio', 'p5', 'expl'] },
  { id: 'sampling-expl', title: 'Pointillism and Expressionism, by sampling (p5.js expl)', summary: 'The sampling lesson with barebones, copy-pasteable p5.js code under pseudocode for each art demo.', languages: ['studio', 'p5', 'expl'] },
  { id: 'diffusion', title: 'Diffusion models: from noise to picture', summary: 'Six diagrams (forward and reverse, the schedule, training, sampling, latent space, the score) and five p5.js simulations, with a bibliography.', languages: ['studio'] }
];

/** Build a lesson as a new scene. language: 'studio', 'p5' or 'expl' (barebones p5.js sketch). Returns the number of boards. */
export async function buildLesson(app, id = 'sampling', { language = 'studio', expl = false } = {}) {
  const isExpl = id === 'sampling-expl' || id.endsWith('-expl') || language === 'expl' || expl;
  const baseId = id.replace(/-expl$/, '');
  const [{ buildLessonScene }, lesson] = await Promise.all([
    import('../../examples/lessons/sampling/scene.js'),
    baseId === 'diffusion' ? import('../../examples/lessons/diffusion/lesson.js').then(m => m.LESSON) : null
  ]);
  return buildLessonScene(app, { language, expl: isExpl, ...(lesson ? { lesson } : {}) });
}

/**
 * The three.js series for body and sound lives in its own repository (threejs-body-sound): ten small lessons from a
 * spinning cube to MediaPipe body tracking, depth, a laser harp, a body drum, costumes, one-line drawings and paint
 * marks. The studio runs three.js sketches as a board kind ('three'); the lessons are the course that goes with it.
 */
export const THREEJS_LESSONS = [
  ['00', 'A spinning cube', 'The whole program: scene, camera, renderer, one cube.'],
  ['01', 'Anatomy of a scene', 'Scene, camera, objects, materials, light.'],
  ['02', 'A body in the scene', 'MediaPipe landmarks live, from clips or recorded.'],
  ['03', 'Pinboard', 'Person mask and monocular depth drive a pin screen.'],
  ['04', 'The body in metres', 'Depth and pose fused into one metric space with a point cloud.'],
  ['05', 'Laser harp', 'Beams in the air at measured distances; fingertips pluck notes (after Jean-Michel Jarre).'],
  ['06', 'Body drum', 'Pads on your own body; hand hits, claps and stomps make drum sounds (after Laurie Anderson).'],
  ['07', 'Triadic costumes', 'Costumes hung on a moving body, with motion cleaning for performance (after Schlemmer).'],
  ['08', 'One line', 'A face or figure drawn without lifting the pen (after Picasso).'],
  ['09', 'Paint marks', 'Hands, feet and head leave strokes in space you can orbit (after Ghostcatching).']
];

/** A new board running a three.js sketch (the spinning cube), live, in view. Returns the board id. */
export async function addThreeBoard(app, { title = 'three.js sketch', code } = {}) {
  const { THREE_STARTER } = await import('../process/threeModules.js');
  const b = app.store.addBoard({ title, width: 640, height: 420, ground: '#f3efe6' });
  app.store.updateBoard(b.id, { kind: 'three', code: code || THREE_STARTER, live: true });
  app.goToBoard?.(b.id);
  return b.id;
}
