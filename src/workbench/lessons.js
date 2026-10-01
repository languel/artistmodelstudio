/**
 * Lessons: whole lectures as scenes of frames (examples/lessons). A lesson is data (sections of boards with code, notes
 * and a bibliography); the builder (examples/lessons/sampling/scene.js) makes it a scene. The palette (`/lesson`), the
 * Docs and the walkthroughs all build them from here.
 */
export const LESSONS = [
  { id: 'sampling', title: 'Pointillism and Expressionism, by sampling', summary: 'Seurat, Munch and Muybridge as sources: sample a picture, decide what to draw there. Diagrams of the eye, ten examples, a body as a source.', languages: ['studio', 'p5'] },
  { id: 'diffusion', title: 'Diffusion models: from noise to picture', summary: 'Six diagrams (forward and reverse, the schedule, training, sampling, latent space, the score) and five p5.js simulations, with a bibliography.', languages: ['studio'] }
];

/** Build a lesson as a new scene. language: 'studio' (code runs in the studio) or 'p5' (every drawing as a p5.js sketch). Returns the number of boards. */
export async function buildLesson(app, id = 'sampling', { language = 'studio' } = {}) {
  const [{ buildLessonScene }, lesson] = await Promise.all([
    import('../../examples/lessons/sampling/scene.js'),
    id === 'diffusion' ? import('../../examples/lessons/diffusion/lesson.js').then(m => m.LESSON) : null
  ]);
  return buildLessonScene(app, { language, ...(lesson ? { lesson } : {}) });
}
