/**
 * Docs: the studio's documentation in a panel (after underscores' Documentation panel):
 * search, a table of contents by section, and topics, some generated from the code.
 */
import { h } from '../ui.js';
import { docTopics, DOC_SECTIONS } from '../docsContent.js';

const ls = (k, v) => { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch { return null; } return v; };

export function mountDocs(root, app) {
  let topics = docTopics(app);
  let current = ls('ams_docs_topic') || topics[0].id;
  let query = '';
  const openSecs = new Set();
  let closedCurrent = false;
  let size = Number(ls('ams_docs_size') || 13);
  const search = h('input', { type: 'search', class: 'wb-inline wb-docs-search', placeholder: 'Search documentation' });
  const toc = h('nav', { class: 'wb-docs-toc' });
  const article = h('article', { class: 'wb-docs-article' });
  const sizeInput = h('input', { type: 'number', class: 'wb-inline wb-docs-size', min: 10, max: 22, value: size, title: 'Text size' });
  const box = h('div', { class: 'wb-docs', style: { '--docs-size': `${size}px` } },
    h('div', { class: 'wb-row wb-docs-bar' },
      h('button', { class: 'wb-btn', title: 'A guided tour of the workbench', onclick: () => app.walkthroughs.start('tour') }, 'Quick tour'),
      h('button', { class: 'wb-btn', title: 'Lesson: taking a line for a walk (Klee, Ngan)', onclick: () => app.walkthroughs.start('line-walk') }, 'Line walk lesson'),
      h('span', { style: { flex: 1 } }),
      h('label', { class: 'wb-row', title: 'Text size' }, h('span', { class: 'wb-muted' }, 'Aa'), sizeInput)),
    search,
    h('div', { class: 'wb-docs-main' }, toc, article));
  root.append(box);

  const text = t => `${t.title} ${t.summary} ${t.section} ${t.cache || ''}`.toLowerCase();
  const render = () => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const shown = topics.filter(t => terms.every(x => text(t).includes(x)));
    if (!shown.some(t => t.id === current) && shown[0]) current = shown[0].id;
    toc.replaceChildren(...DOC_SECTIONS.map(sec => {
      const items = shown.filter(t => t.section === sec);
      if (!items.length) return null;
      const open = terms.length > 0 || openSecs.has(sec) || items.some(t => t.id === current);
      return h('div', { class: `wb-docs-sec${open ? ' open' : ''}` }, h('h4', { title: open ? 'Collapse' : 'Expand', onclick: () => { if (openSecs.has(sec) || items.some(t => t.id === current)) { openSecs.delete(sec); if (items.some(t => t.id === current)) closedCurrent = !closedCurrent; } else openSecs.add(sec); render(); } }, h('span', { class: 'wb-docs-caret' }, open && !(closedCurrent && items.some(t => t.id === current) && !terms.length) ? '▾' : '▸'), sec), ...(open && !(closedCurrent && items.some(t => t.id === current) && !terms.length) ? items : []).map(t => h('button', { class: t.id === current ? 'active' : '', title: t.summary, onclick: () => { current = t.id; closedCurrent = false; ls('ams_docs_topic', current); render(); } }, t.title)));
    }).filter(Boolean), shown.length ? '' : h('p', { class: 'wb-muted' }, 'Nothing found.'));
    const t = topics.find(x => x.id === current);
    article.replaceChildren(...(t ? [h('header', {}, h('small', {}, t.section), h('h2', {}, t.title)), t.body()] : []));
    article.scrollTop = 0;
  };
  search.addEventListener('input', () => { query = search.value; render(); });
  search.addEventListener('keydown', e => e.stopPropagation());
  sizeInput.addEventListener('keydown', e => e.stopPropagation());
  sizeInput.addEventListener('input', () => { size = Math.max(10, Math.min(22, Number(sizeInput.value) || 13)); box.style.setProperty('--docs-size', `${size}px`); ls('ams_docs_size', String(size)); });
  // Full-text search: render each topic once, off-screen, to index its words.
  queueMicrotask(() => { for (const t of topics) { try { t.cache = t.body().textContent; } catch { t.cache = ''; } } });
  app.openDocs = id => { app.docks.open('docs'); if (id) { current = id; ls('ams_docs_topic', id); } query = ''; search.value = ''; render(); };
  render();
}

export const docsTopicList = app => docTopics(app).map(({ id, title, summary }) => ({ id, title, summary }));
