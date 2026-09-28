/**
 * The sampling lesson as a scene you can teach from, in frames (slides, 16:9): a cover, an intro
 * frame per section (its text beside its source), a frame per example (the drawing beside its
 * notes: the idea, and folded callouts with the pseudocode and the other language's code), and the
 * bibliography. Drawing boards are 800×600; notes 680 wide. Links are [[board titles]].
 *
 * buildLessonScene(app, { language }) makes a new scene: 'studio' (boards run the studio's code)
 * or 'p5' (the same boards as p5.js sketches, as they would paste into the p5 editor).
 */
import { LESSON, BIBLIOGRAPHY } from './lesson.js';
import { runScript } from '../../../src/process/script.js';
import { toP5Code } from '../../../src/process/p5code.js';
import { renderMarkdown } from '../../../src/process/markdown.js';

const FW = 1600, FH = 900, PAD = 40, BW = 800, BH = 600, NW = 680, FGAP = 160, DARK = '#141414';
const intro = sec => `§ ${sec.title}`;
const quote = text => text.split('\n').map(l => `> ${l}`).join('\n');
const fence = (text, lang = '') => `\`\`\`${lang}\n${text.trim()}\n\`\`\``;

function p5For(b) {
  const names = Object.keys(LESSON.sources).filter(n => new RegExp(`source\\(\\s*'${n}'`).test(b.code || ''));
  const sources = Object.fromEntries(names.map(n => [n, { file: LESSON.sources[n].file, kind: LESSON.sources[n].animated ? 'animated' : 'image' }]));
  return toP5Code(b.code, { board: { title: b.title, width: b.w, height: b.h, ground: b.ground || '#f3efe6' }, sources, loop: Boolean(b.follow) });
}

function notesFor(b, sec, language) {
  const ref = sec.boards.find(x => x.reference);
  const other = language === 'p5' ? fence(b.code, 'js') : fence(p5For(b), 'js');
  return [
    `## ${b.title}`,
    b.idea,
    b.pseudo ? quote(`[!abstract]- Pseudocode\n${fence(b.pseudo)}`) : '',
    b.code ? quote(`[!example]- ${language === 'p5' ? 'Studio code' : 'p5.js'}\n${other}`) : '',
    `${language === 'p5' ? 'Its p5.js code' : 'Its studio code'}: Code → Board.${ref ? ` Source: [[${ref.title}]].` : ''} Back to [[${intro(sec)}]].`
  ].filter(Boolean).join('\n\n');
}

function introFor(sec, i, all) {
  const ref = sec.boards.find(x => x.reference);
  const src = ref && LESSON.sources[ref.source];
  const examples = sec.boards.filter(x => !x.reference);
  return [
    `# ${sec.title}`,
    sec.text,
    src ? `> [!quote] Source\n> ${src.title}. Public domain, [Wikimedia Commons](${src.commons}).` : '',
    `**${sec.diagram ? 'Diagrams' : 'Examples'}:** ${examples.map(x => `[[${x.title}]]`).join(' · ')}`,
    `${i > 0 ? `← [[${intro(all[i - 1])}]]` : `↑ [[${LESSON.title}]]`}${i < all.length - 1 ? ` · [[${intro(all[i + 1])}]] →` : ' · [[Bibliography: pictures|Bibliography]] →'}`
  ].filter(Boolean).join('\n\n');
}

const cover = () => [
  `# ${LESSON.title}`,
  `*${LESSON.subtitle}*`,
  `> [!info] The one idea\n> A picture is a function from a place to a color. Ask it, then decide what to draw there.`,
  `## Contents`,
  LESSON.sections.map((s, i) => `${i + 1}. [[${intro(s)}]] (${s.boards.filter(b => !b.reference).length} ${s.diagram ? 'diagrams' : 'examples'})`).join('\n') + `\n${LESSON.sections.length + 1}. [[Bibliography: pictures|Bibliography]]`,
  `Each frame is a slide: present them, or step with the arrow keys. Every drawing is a board with its own code (Code → Board).`
].join('\n\n');

const bibliography = (title, items) => [`# ${title}`, items.map(([text, url]) => `- ${text} [${url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '')} ↗](${url})`).join('\n')].join('\n\n');

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

export async function buildLessonScene(app, { language = 'studio', title = `Lesson: ${LESSON.title}${language === 'p5' ? ' (p5.js)' : ''}` } = {}) {
  await app.scenes.create({ title });
  const st = app.store, run = app.runScript || runScript;
  for (const [name, def] of Object.entries(LESSON.sources)) {
    if (app.sources.def(name)) continue;
    const blob = await (await fetch(new URL(`./media/${def.file}`, import.meta.url))).blob();
    const a = await app.assetStore.add(blob, { title: def.title, kind: 'import', folder: 'Lessons/Sampling', tags: ['source', 'public-domain'], meta: { source: def.commons, license: 'Public domain (Wikimedia Commons)' } });
    await app.sources.add({ kind: 'asset', assetId: a.id, name });
  }
  // The pictures must be sampled before any code reads them (after a reload they are still loading).
  await app.sources.whenReady(Object.keys(LESSON.sources));
  const frame = (t, x, y) => { const f = st.addBoard({ title: t, width: FW, height: FH, x, y }); st.updateBoard(f.id, { kind: 'frame' }); return f; };
  const doc = (t, x, y, text, w = NW) => { const b = st.addBoard({ title: t, width: w, height: Math.min(FH - 2 * PAD, heightFor(text, w)), x, y, ground: DARK }); st.updateBoard(b.id, { kind: 'markdown', code: text }); return b; };
  const drawing = (b, x, y) => {
    let id;
    if (b.id === 'seurat') { id = 'main'; st.updateBoard('main', { title: b.title, width: BW, height: BH }); }
    else id = st.addBoard({ title: b.title, width: BW, height: BH, x, y, ...(b.ground ? { ground: b.ground } : {}) }).id;
    st.updateBoard(id, { text: b.idea, ...(b.pseudo ? { pseudo: b.pseudo } : {}) });
    if (b.reference) app.setBoardSource(id, b.source, 1, b.fit || 'cover');
    if (b.live) app.setBoardLive(id, true);
    if (b.code) {
      if (language === 'p5') st.updateBoard(id, { kind: 'p5', code: p5For(b) });
      else st.runBoardCode(id, b.code, run);
    }
    if (b.follow && language !== 'p5') app.setBoardFollow(id, true);
    return id;
  };
  // Where a drawing sits in a frame: right half for intros, left for examples.
  const left = (fx, fy) => [fx + PAD, fy + (FH - BH) / 2], right = (fx, fy) => [fx + FW - PAD - BW, fy + (FH - BH) / 2];

  // Rows of frames: the cover; a row per section (its intro, then its examples); the bibliography.
  // The Seurat intro's picture is the main board (at the origin): the rows are placed around it.
  const seuratRow = LESSON.sections.findIndex(s => s.boards.some(b => b.id === 'seurat'));
  const rowY = r => -((FH - BH) / 2) + (r - seuratRow) * (FH + FGAP);
  const x0 = -(FW - PAD - BW);
  const fx = k => x0 + k * (FW + FGAP);

  const cy = rowY(-1);
  frame(LESSON.title, fx(0), cy);
  doc(LESSON.title, fx(0) + PAD, cy + PAD, cover());

  for (const [r, sec] of LESSON.sections.entries()) {
    const y = rowY(r);
    const ref = sec.boards.find(b => b.reference);
    frame(intro(sec), fx(0), y);
    doc(intro(sec), fx(0) + PAD, y + PAD, introFor(sec, r, LESSON.sections));
    if (ref) drawing(ref, ...right(fx(0), y));
    let k = 1;
    for (const b of sec.boards.filter(x => !x.reference)) {
      frame(b.title, fx(k), y);
      drawing(b, ...left(fx(k), y));
      doc(`${b.title} · notes`, fx(k) + PAD + BW + PAD, y + PAD, notesFor(b, sec, language));
      k++;
    }
  }

  const by = rowY(LESSON.sections.length);
  frame('Bibliography', fx(0), by);
  doc('Bibliography: pictures', fx(0) + PAD, by + PAD, bibliography('Pictures', BIBLIOGRAPHY.pictures), 440);
  doc('Bibliography: literature', fx(0) + PAD + 440 + PAD, by + PAD, bibliography('Literature', BIBLIOGRAPHY.history), FW - 3 * PAD - 440);

  st.change('page intro', d => { if (d.meta) delete d.meta.intro; });
  const first = st.doc.boards.find(b => b.title === LESSON.title && b.kind === 'frame');
  app.goToBoard(first?.id || 'main', { animate: true });
  return st.doc.boards.length + 1;
}
