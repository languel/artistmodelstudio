/**
 * The sampling lesson as a scene you can teach from: its drawing boards (made from their code), with
 * Markdown boards around them: a title board with the contents, an intro at the head of each row
 * (the section's text, its source and rights, its examples), and notes under each example (the
 * idea, and folded callouts with the pseudocode and the p5.js code). Links are [[board titles]].
 *
 * buildLessonScene(app) makes a new scene. In the studio: import it and call it (see the docs).
 */
import { LESSON } from './lesson.js';
import { runScript } from '../../../src/process/script.js';
import { toP5Code } from '../../../src/process/p5code.js';
import { renderMarkdown } from '../../../src/process/markdown.js';

const GAP = 90, ROW_GAP = 220, NOTE_GAP = 40, INTRO_W = 560, DARK = '#141414', PAPER = '#1b1b1b';
const intro = sec => `§ ${sec.title}`;

const quote = text => text.split('\n').map(l => `> ${l}`).join('\n');
const fence = (text, lang = '') => `\`\`\`${lang}\n${text.trim()}\n\`\`\``;

function p5For(b) {
  const names = Object.keys(LESSON.sources).filter(n => new RegExp(`source\\(\\s*'${n}'`).test(b.code || ''));
  const sources = Object.fromEntries(names.map(n => [n, { file: LESSON.sources[n].file, kind: LESSON.sources[n].animated ? 'animated' : 'image' }]));
  return toP5Code(b.code, { board: { title: b.title, width: b.w, height: b.h, ground: b.ground || '#f3efe6' }, sources, loop: Boolean(b.follow) });
}

function notesFor(b, sec) {
  const ref = sec.boards.find(x => x.reference);
  return [
    `## ${b.title}`,
    b.idea,
    b.pseudo ? `${quote(`[!abstract]- Pseudocode\n${fence(b.pseudo)}`)}` : '',
    b.code ? `${quote(`[!example]- p5.js\n${fence(p5For(b), 'js')}`)}` : '',
    `Its studio code: Code → Board.${ref ? ` Its source: [[${ref.title}]].` : ''} Back to [[${intro(sec)}]].`
  ].filter(Boolean).join('\n\n');
}

function introFor(sec, i, all) {
  const ref = sec.boards.find(x => x.reference);
  const src = ref && LESSON.sources[ref.source];
  const examples = sec.boards.filter(x => !x.reference);
  return [
    `# ${sec.title}`,
    sec.text,
    src ? `> [!quote] Source\n> ${src.title}. Public domain, [Wikimedia Commons](${src.commons}). On the canvas: [[${ref.title}]].` : '',
    `**Examples:** ${examples.map(x => `[[${x.title}]]`).join(' · ')}`,
    `${i > 0 ? `← [[${intro(all[i - 1])}]]` : `↑ [[${LESSON.title}]]`}${i < all.length - 1 ? ` · [[${intro(all[i + 1])}]] →` : ''}`
  ].filter(Boolean).join('\n\n');
}

function titleFor() {
  return [
    `# ${LESSON.title}`,
    `*${LESSON.subtitle}*`,
    `> [!info] The one idea\n> A picture is a function from a place to a color. Ask it, then decide what to draw there.`,
    `## Contents`,
    LESSON.sections.map((s, i) => `${i + 1}. [[${intro(s)}]] (${s.boards.filter(b => !b.reference).length} ${s.diagram ? 'diagrams' : 'examples'})`).join('\n'),
    `Every drawing is a board with its own code (Code → Board). Boards that follow a moving source run while they are on screen; ▶ above a board plays it, ‖ pauses it.`
  ].join('\n\n');
}

/** How tall a Markdown board must be for its text (rendered off screen at the board's width). */
function heightFor(md, width) {
  const probe = document.createElement('div');
  probe.className = 'wb-bframe dark';
  probe.style.cssText = `position:absolute; left:-99999px; top:0; width:${width}px; visibility:hidden;`;
  probe.innerHTML = `<div class="wb-md" style="height:auto">${renderMarkdown(md)}</div>`;
  document.body.append(probe);
  const h = probe.firstChild.scrollHeight;
  probe.remove();
  return Math.ceil(h + 8);
}

export async function buildLessonScene(app, { title = `Lesson: ${LESSON.title}` } = {}) {
  await app.scenes.create({ title });
  const st = app.store;
  // Sources: made from the lesson's media when missing (by name).
  for (const [name, def] of Object.entries(LESSON.sources)) {
    if (app.sources.def(name)) continue;
    const blob = await (await fetch(new URL(`./media/${def.file}`, import.meta.url))).blob();
    const a = await app.assetStore.add(blob, { title: def.title, kind: 'import', folder: 'Lessons/Sampling', tags: ['source', 'public-domain'], meta: { source: def.commons, license: 'Public domain (Wikimedia Commons)' } });
    await app.sources.add({ kind: 'asset', assetId: a.id, name });
  }
  const md = (t, x, y, w, text, ground = DARK) => {
    const b = st.addBoard({ title: t, width: w, height: heightFor(text, w), x, y, ground });
    st.updateBoard(b.id, { kind: 'markdown', code: text });
    return b;
  };

  // Rows: the title, then one row per section: its intro, then each board with its notes below.
  // The first board of the Seurat row is the main board (it stays at the origin).
  const seuratRow = LESSON.sections.findIndex(s => s.boards.some(b => b.id === 'seurat'));
  const rows = LESSON.sections.map(sec => {
    const notes = sec.boards.map(b => (b.reference ? null : notesFor(b, sec)));
    const noteH = Math.max(0, ...sec.boards.map((b, i) => (notes[i] ? heightFor(notes[i], b.w) : 0)));
    return { sec, notes, height: Math.max(...sec.boards.map(b => b.h)) + (noteH ? NOTE_GAP + noteH : 0) };
  });
  // y of each row, with the Seurat row at 0.
  const ys = []; let y = 0;
  for (let i = seuratRow; i < rows.length; i++) { ys[i] = y; y += rows[i].height + ROW_GAP; }
  y = 0;
  for (let i = seuratRow - 1; i >= 0; i--) { y -= rows[i].height + ROW_GAP; ys[i] = y; }

  const top = titleFor();
  md(LESSON.title, -INTRO_W - GAP, Math.min(...ys) - heightFor(top, INTRO_W) - ROW_GAP, INTRO_W, top, PAPER);

  for (const [r, { sec, notes }] of rows.entries()) {
    md(intro(sec), -INTRO_W - GAP, ys[r], INTRO_W, introFor(sec, r, LESSON.sections));
    let x = 0;
    for (const [i, b] of sec.boards.entries()) {
      let id;
      if (b.id === 'seurat') { id = 'main'; st.updateBoard('main', { title: b.title, width: b.w, height: b.h }); }
      else id = st.addBoard({ title: b.title, width: b.w, height: b.h, x, y: ys[r], ...(b.ground ? { ground: b.ground } : {}) }).id;
      st.updateBoard(id, { text: b.idea });
      if (b.reference) app.setBoardSource(id, b.source, 1);
      if (b.live) app.setBoardLive(id, true);
      if (b.code) st.runBoardCode(id, b.code, app.runScript || runScript);   // the app's runner: it has the sources
      if (b.follow) app.setBoardFollow(id, true);
      if (notes[i]) md(`${b.title} · notes`, x, ys[r] + b.h + NOTE_GAP, b.w, notes[i]);
      x += b.w + GAP;
    }
  }
  st.change('page intro', d => { d.meta = { ...(d.meta || {}), intro: titleFor() }; });
  app.goToBoard(st.doc.boards.find(b => b.title === LESSON.title)?.id || 'main', { animate: true });
  return st.doc.boards.length + 1;
}
