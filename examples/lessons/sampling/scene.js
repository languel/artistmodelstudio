/**
 * The sampling lesson as a scene you can teach from, in frames (slides, 16:9): a cover, an intro
 * frame per section (its text beside its source), a frame per example (the drawing beside its
 * notes: the idea, and folded callouts with the pseudocode and the other language's code), and the
 * bibliography. Drawing boards are 800×600; notes 680 wide. Links are [[board titles]].
 *
 * buildLessonScene(app, { language, lesson }) makes a new scene: 'studio' (boards run the studio's code)
 * or 'p5' (the same boards as p5.js sketches, as they would paste into the p5 editor). Other lessons
 * (examples/lessons/diffusion) use the same builder. A lesson is data:
 *   title, subtitle, idea (the one sentence on the cover), main (the id of the board that is the scene's main board),
 *   sources { name: { file, title, commons, animated } } (files beside the lesson's scene.js, in media/),
 *   sections [{ id, title, text, diagram, label, boards: [{ id, title, w, h, ground, idea, pseudo, code (studio) | p5 (a sketch), ... }] }],
 *   bibliography [{ title, items: [[text, url]], width }]   (default: the sampling lesson's)
 */
import { LESSON as SAMPLING, BIBLIOGRAPHY } from './lesson.js';
import { runScript } from '../../../src/process/script.js';
import { toP5Code } from '../../../src/process/p5code.js';
import { renderMarkdown } from '../../../src/process/markdown.js';

const FW = 1600, FH = 900, PAD = 40, BW = 800, BH = 600, NW = 680, FGAP = 160, DARK = '#141414';
const intro = sec => `§ ${sec.title}`;
const quote = text => text.split('\n').map(l => `> ${l}`).join('\n');
const fence = (text, lang = '') => `\`\`\`${lang}\n${text.trim()}\n\`\`\``;

function p5For(b, LESSON) {
  const names = Object.keys(LESSON.sources || {}).filter(n => new RegExp(`source\\(\\s*'${n}'`).test(b.code || ''));
  const sources = Object.fromEntries(names.map(n => [n, { file: LESSON.sources[n].file, kind: LESSON.sources[n].animated ? 'animated' : 'image' }]));
  return toP5Code(b.code, { board: { title: b.title, width: b.w, height: b.h, ground: b.ground || '#f3efe6' }, sources, loop: Boolean(b.follow) });
}

function notesFor(b, sec, language, lesson, expl = false) {
  const ref = sec.boards.find(x => x.reference);
  // A board written as a p5 sketch has one language; a drawing's code has the other one as a callout.
  const native = Boolean(b.p5 || b.three);
  const useExpl = (expl || language === 'expl') && Boolean(b.p5expl);
  const p5Code = useExpl ? b.p5expl : (b.three ?? (native ? b.p5 : p5For(b, lesson)));
  const p5Label = useExpl ? 'p5.js (expl)' : (b.three ? 'three.js' : native ? 'p5.js' : language === 'p5' ? 'Studio code' : 'p5.js');
  const other = language === 'p5' && !useExpl ? fence(b.code, 'js') : fence(p5Code, 'js');
  return [
    `## ${b.title}`,
    b.idea,
    b.pseudo ? quote(`[!abstract]- Pseudocode\n${fence(b.pseudo)}`) : '',
    b.code || native || b.p5expl ? quote(`[!example]- ${p5Label}\n${other}`) : '',
    `${b.three ? 'Its three.js code' : native || language === 'p5' || language === 'expl' ? 'Its p5.js code' : 'Its studio code'}: Code → Board.${ref ? ` Source: [[${ref.title}]].` : ''} Back to [[${intro(sec)}]].`
  ].filter(Boolean).join('\n\n');
}

function introFor(sec, i, all, LESSON, bib1) {
  const ref = sec.boards.find(x => x.reference);
  const src = ref && (LESSON.sources || {})[ref.source];
  const examples = sec.boards.filter(x => !x.reference);
  return [
    `# ${sec.title}`,
    sec.text,
    src ? `> [!quote] Source\n> ${src.title}. Public domain, [Wikimedia Commons](${src.commons}).` : '',
    `**${sec.label || (sec.diagram ? 'Diagrams' : 'Examples')}:** ${examples.map(x => `[[${x.title}]]`).join(' · ')}`,
    `${i > 0 ? `← [[${intro(all[i - 1])}]]` : `↑ [[${LESSON.title}]]`}${i < all.length - 1 ? ` · [[${intro(all[i + 1])}]] →` : ` · [[${bib1}|Bibliography]] →`}`
  ].filter(Boolean).join('\n\n');
}

const cover = (LESSON, bib1) => [
  `# ${LESSON.title}`,
  `*${LESSON.subtitle}*`,
  `> [!info] The one idea\n> ${LESSON.idea || 'A picture is a function from a place to a color. Ask it, then decide what to draw there.'}`,
  `## Contents`,
  LESSON.sections.map((s, i) => `${i + 1}. [[${intro(s)}]] (${s.boards.filter(b => !b.reference).length} ${(s.label || (s.diagram ? 'diagrams' : 'examples')).toLowerCase()})`).join('\n') + `\n${LESSON.sections.length + 1}. [[${bib1}|Bibliography]]`,
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

export async function buildLessonScene(app, { language = 'studio', expl = false, lesson: LESSON = SAMPLING, title = `Lesson: ${LESSON.title}${expl || language === 'expl' ? ' (p5.js expl)' : language === 'p5' ? ' (p5.js)' : ''}` } = {}) {
  // Bibliography columns: the lesson's, or the sampling lesson's two (pictures, literature).
  const bibs = LESSON.bibliography || [{ title: 'Pictures', items: BIBLIOGRAPHY.pictures, width: 440 }, { title: 'Literature', items: BIBLIOGRAPHY.history }];
  const bibTitle = t => `Bibliography: ${t.toLowerCase()}`, bib1 = bibTitle(bibs[0].title);
  const mainId = LESSON.main || 'seurat';
  await app.scenes.create({ title });
  const st = app.store, run = app.runScript || runScript;
  for (const [name, def] of Object.entries(LESSON.sources || {})) {
    if (app.sources.def(name)) continue;
    const blob = await (await fetch(new URL(`./media/${def.file}`, import.meta.url))).blob();
    const a = await app.assetStore.add(blob, { title: def.title, kind: 'import', folder: 'Lessons/Sampling', tags: ['source', 'public-domain'], meta: { source: def.commons, license: 'Public domain (Wikimedia Commons)' } });
    await app.sources.add({ kind: 'asset', assetId: a.id, name });
  }
  // The pictures must be sampled before any code reads them (after a reload they are still loading).
  await app.sources.whenReady(Object.keys(LESSON.sources || {}));
  const frame = (t, x, y) => { const f = st.addBoard({ title: t, width: FW, height: FH, x, y }); st.updateBoard(f.id, { kind: 'frame' }); return f; };
  const doc = (t, x, y, text, w = NW) => { const b = st.addBoard({ title: t, width: w, height: Math.min(FH - 2 * PAD, heightFor(text, w)), x, y, ground: DARK }); st.updateBoard(b.id, { kind: 'markdown', code: text, hideLabel: true }); return b; };   // (inside a frame, which carries the title)
  // A drawing inside a frame: its title is the frame's, so it is not shown again (its play button stays). The diagrams' code opens as a bar of tabs on a page.
  const drawing = (b, x, y, sec) => {
    let id;
    if (b.id === mainId) { id = 'main'; st.updateBoard('main', { title: b.title, width: BW, height: BH, ...(b.ground ? { ground: b.ground } : {}) }); }
    else id = st.addBoard({ title: b.title, width: BW, height: BH, x, y, ...(b.ground ? { ground: b.ground } : {}) }).id;
    st.updateBoard(id, { text: b.idea, hideLabel: true, ...(b.pseudo ? { pseudo: b.pseudo } : {}), ...(sec?.diagram ? { codeMin: true } : {}) });
    if (b.reference) app.setBoardSource(id, b.source, 1, b.fit || 'cover');
    if (b.live) app.setBoardLive(id, true);
    if (b.three) st.updateBoard(id, { kind: 'three', code: b.three });   // a three.js sketch
    else if (b.p5) st.updateBoard(id, { kind: 'p5', code: b.p5 });   // written as a p5 sketch (a simulation)
    else if (b.code) {
      if ((language === 'expl' || (language === 'p5' && expl)) && b.p5expl) {
        st.updateBoard(id, { kind: 'p5', code: b.p5expl });
      } else if (language === 'p5') {
        st.updateBoard(id, { kind: 'p5', code: p5For(b, LESSON) });
      } else {
        st.runBoardCode(id, b.code, run);
      }
    }
    if (b.follow && language !== 'p5' && language !== 'expl') app.setBoardFollow(id, true);
    return id;
  };
  // Where a drawing sits in a frame: right half for intros, left for examples.
  const left = (fx, fy) => [fx + PAD, fy + (FH - BH) / 2], right = (fx, fy) => [fx + FW - PAD - BW, fy + (FH - BH) / 2];

  // Rows of frames: the cover; a row per section (its intro, then its examples); the bibliography.
  // The main board (the Seurat picture, in the sampling lesson) is at the origin: the rows are placed around it.
  // A section's reference picture sits at the right of its intro frame; an example, at the left of its own.
  const mainRow = Math.max(0, LESSON.sections.findIndex(s => s.boards.some(b => b.id === mainId)));
  const mainSec = LESSON.sections[mainRow], mainBoard = mainSec.boards.find(b => b.id === mainId);
  const mainCol = mainBoard?.reference ? 0 : 1 + mainSec.boards.filter(x => !x.reference).indexOf(mainBoard);
  const rowY = r => -((FH - BH) / 2) + (r - mainRow) * (FH + FGAP);
  const x0 = mainBoard?.reference ? -(FW - PAD - BW) : -PAD - mainCol * (FW + FGAP);
  const fx = k => x0 + k * (FW + FGAP);

  const cy = rowY(-1);
  frame(LESSON.title, fx(0), cy);
  doc(LESSON.title, fx(0) + PAD, cy + PAD, cover(LESSON, bib1));

  for (const [r, sec] of LESSON.sections.entries()) {
    const y = rowY(r);
    const ref = sec.boards.find(b => b.reference);
    frame(intro(sec), fx(0), y);
    doc(intro(sec), fx(0) + PAD, y + PAD, introFor(sec, r, LESSON.sections, LESSON, bib1), Object.keys(LESSON.sources || {}).length ? NW : 1000);   // (a lesson without pictures has the whole frame)
    if (ref) drawing(ref, ...right(fx(0), y), sec);
    let k = 1;
    for (const b of sec.boards.filter(x => !x.reference)) {
      frame(b.title, fx(k), y);
      drawing(b, ...left(fx(k), y), sec);
      doc(`${b.title} · notes`, fx(k) + PAD + BW + PAD, y + PAD, notesFor(b, sec, language, LESSON, expl));
      k++;
    }
  }

  const by = rowY(LESSON.sections.length);
  // Columns side by side, on as many frames as the lesson asks (a column says its `page`; and may say its width, the others share what is left).
  const pages = [...new Set(bibs.map(c => c.page || 0))].sort();
  pages.forEach((pg, n) => {
    const cols = bibs.filter(c => (c.page || 0) === pg);
    frame(n ? `Bibliography · ${n + 1}` : 'Bibliography', fx(n), by);
    const fixed = cols.reduce((m, c) => m + (c.width || 0), 0), free = cols.filter(c => !c.width).length;
    let bx = fx(n) + PAD;
    for (const c of cols) {
      const w = c.width || Math.floor((FW - (cols.length + 1) * PAD - fixed) / free);
      doc(bibTitle(c.title), bx, by + PAD, bibliography(c.title, c.items), w);
      bx += w + PAD;
    }
  });

  st.change('page intro', d => { if (d.meta) delete d.meta.intro; });
  const first = st.doc.boards.find(b => b.title === LESSON.title && b.kind === 'frame');
  app.goToBoard(first?.id || 'main', { animate: true });
  return st.doc.boards.length + 1;
}
