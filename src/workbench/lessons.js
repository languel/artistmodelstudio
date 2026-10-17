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
