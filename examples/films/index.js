/** The films, by the name `/film <name>` takes. Each loads on demand. */
export const FILMS = {
  condense: () => import('./condense.js').then(m => m.FILM),
  moon: () => import('./moon.js').then(m => m.FILM),
  silhouette: () => import('./silhouette.js').then(m => m.FILM),
  threejs: () => import('./threejs.js').then(m => m.FILM),
  pointillism: () => import('./pointillism.js').then(m => m.FILM)
};
