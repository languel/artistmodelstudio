/**
 * A playlist board is code: one call that lists what to play, in order, and where it goes.
 *
 *   playlist({
 *     target: 'Screen',            // the board that shows each item (a title or id)
 *     loop: true,                  // start again after the last
 *     items: [
 *       { stream: 'stream:metropolis-1927-maria-s-wink' },       // a stream asset (from Assets › Streams)
 *       { asset: 'clip:muybridge-horse', for: 8 },               // an asset: a clip, a GIF or a picture; for: seconds
 *       { url: 'https://…', start: 12, end: 30, title: 'A clip' }, // an address (or a Wikipedia / Commons File: page)
 *       { source: 'cam' },                                       // a source already in the scene
 *       { board: 'Dots' }                                        // any board: it runs (the others pause) and the view goes to it
 *     ]
 *   })
 *
 * Media items (stream, asset, url, source) are routed to the target board, which shows the source under
 * its marks (with its controls); the item ends where its range ends, or after `for` seconds, and the next
 * begins. A board item runs that board alone and moves the view to it (stay: true keeps the view).
 * Common fields: title, start, end (seconds, for a stream or url), quality, for (seconds), speed, loop: false.
 */
const KEYS = ['stream', 'asset', 'url', 'source', 'board'];

/** { target, loop, items: [{ kind, ref, title?, start?, end?, quality?, for?, speed?, stay? }] } from the code. */
export function readPlaylist(code) {
  let spec = null;
  const playlist = s => { spec = s; };
  // eslint-disable-next-line no-new-func
  new Function('playlist', `"use strict";\n${code}`)(playlist);
  if (!spec || typeof spec !== 'object') throw new Error('playlist({ target, items: [ … ] })');
  const items = (Array.isArray(spec.items) ? spec.items : []).map((it, i) => {
    const kind = KEYS.find(k => it && it[k] != null);
    if (!kind) throw new Error(`Item ${i + 1}: say what it is (${KEYS.join(', ')})`);
    const { [kind]: ref, ...rest } = it;
    return { ...rest, kind, ref: String(ref) };
  });
  return { target: spec.target != null ? String(spec.target) : '', loop: spec.loop !== false, items };
}

const q = s => JSON.stringify(s);

/** The playlist as code (what the board's own controls write; edit it by hand as well). */
export function writePlaylist({ target = '', loop = true, items = [] }) {
  const line = it => {
    const { kind, ref, ...rest } = it;
    const fields = [`${kind}: ${q(ref)}`, ...Object.entries(rest).filter(([, v]) => v !== undefined && v !== '' && v !== null).map(([k, v]) => `${k}: ${q(v)}`)];
    return `    { ${fields.join(', ')} }`;
  };
  return `// A playlist: it plays these in order on its target board (see the docs: Playlists).
playlist({
  target: ${q(target)},
  loop: ${loop},
  items: [
${items.map(line).join(',\n')}${items.length ? '\n' : ''}  ]
})
`;
}

export const PLAYLIST_TEMPLATE = writePlaylist({ target: '', loop: true, items: [] });
