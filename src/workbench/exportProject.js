/**
 * A sketch as a project folder (for a zip) that opens in other editors and on a server, in two kinds:
 *   'modules': native ES modules and an import map, no build step (three.js from a CDN): index.html, src/main.js
 *   'vite':    a project with npm and Vite (three.js installed): package.json, vite.config.js, index.html, src/main.js
 * (p5.js sketches are a page and src/sketch.js.) The sketch is the code as written; options: the library at the studio's version or the
 * latest, and the controls panel, which then comes as src/controls.js and the sketch carries the small lines that let it change the values.
 */
import { instrument } from '../process/controls.js';
import { controlSpecs, panelScript } from './controlsPanel.js';
import { shim } from './exportPage.js';
import { guiCode } from './exportGui.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const slugOf = t => String(t || 'sketch').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'sketch';

const README = ({ title, kind, flavor, panel, gui, latest, versions }) => `# ${title}

Made in Artist Model Studio. ${kind === 'three' ? (flavor === 'vite'
  ? `A Vite project with three.js installed (${latest ? 'the latest' : `r${versions.three.split('.')[1]}, ${versions.three}`}): \`npm install\`, then \`npm run dev\`.`
  : `A page of native ES modules with an import map and no build step (three.js ${latest ? 'latest' : versions.three} from a CDN): serve this folder with any static server (\`npx serve .\`), or open it in Codevre, or copy \`src/main.js\` and the import map into CodePen.`)
  : `A page with p5.js ${latest ? '(the latest)' : versions.p5} from a CDN and the sketch in \`src/sketch.js\`: serve this folder with any static server.`}

## The code

\`src/${kind === 'three' ? 'main' : 'sketch'}.js\` is the sketch. ${kind === 'three' ? "It imports `'three'` and `'three/addons/…'` by their names: " + (flavor === 'vite' ? 'npm finds them.' : 'the import map in `index.html` says where they are (add a line to it for another library).') : ''}
The size of the window is \`innerWidth\` and \`innerHeight\`, as in any page.

## The comments

A comment next to a value, like \`/* 0..4 */\`, \`/* toggle */\`, \`/* a|b */\` or \`/* color */\`, is a **control** in the studio: a slider, a checkbox, a menu, a colour. ${gui
  ? 'Here they are a lil-gui panel (the GUI three.js\'s own examples use): a line after each value adds its control, and `import { GUI }` at the top brings it in. Delete those lines to have plain code.'
  : panel
  ? 'Here they are a small panel (H shows or hides it; the gear comes up near the top right corner; Shift+H hides it all): `src/controls.js` makes it, and the lines `__ctl(...)` after the values let it change them. Delete `import \'./controls.js\'` and those lines to have plain code.'
  : 'In this project they are only comments: the sketch runs with the values as written, and you change a number in the code to change the sketch. (Export with the controls panel option to have the panel.)'}
`;

/** Files of the project: [{ name, data }] under a folder named for the sketch. */
export function projectFiles({ kind, flavor = 'modules', title, code, ground, versions, latest = false, panel = false, gui = false }) {
  const slug = slugOf(title), root = `${slug}/`;
  if (kind === 'p5') flavor = 'modules';
  const bg = /^#[0-9a-f]{3,8}$/i.test(ground || '') ? ground : '#141414';
  const entry = kind === 'three' ? 'main' : 'sketch';
  const inst = instrument(code);
  const files = [];
  const specs = panel ? controlSpecs(code) : [];
  const withPanel = panel && specs.length > 0;
  // the sketch: as written, or (with the panel) with the lines that let it change the values
  const withGui = gui && kind === 'three' && !withPanel && guiCode(code) !== code;
  const body = withPanel ? inst.code : withGui ? guiCode(code) : code;
  const main = kind === 'three' && withPanel ? `import './controls.js';\n\n${body.trimEnd()}\n` : `${body.trimEnd()}\n`;
  files.push({ name: `${root}src/${entry}.js`, data: main });
  if (withPanel) files.push({ name: `${root}src/controls.js`, data: `// The controls panel, made by Artist Model Studio from the comments in ${entry}.js.\n${shim(inst.values, title, kind === 'p5')}\n${panelScript(specs, code)}\n` });

  const style = `<style>*{margin:0}html,body{overflow:hidden;background:${bg}}canvas{display:block}</style>`;
  const head = `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>${esc(title)}</title>\n  ${style}`;
  if (kind === 'three' && flavor === 'vite') {
    files.push({ name: `${root}index.html`, data: `${head}\n</head>\n<body>\n  <script type="module" src="/src/main.js"></script>\n</body>\n</html>\n` });
    files.push({ name: `${root}package.json`, data: JSON.stringify({ name: slug, version: '1.0.0', private: true, type: 'module', scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' }, dependencies: { three: latest ? 'latest' : `^${versions.three}` }, devDependencies: { vite: '^6.2.0' } }, null, 2) + '\n' });
    files.push({ name: `${root}vite.config.js`, data: `import { defineConfig } from 'vite';\n\nexport default defineConfig({\n  server: { port: 5173 }\n});\n` });
  } else if (kind === 'three') {
    const cdn = `https://cdn.jsdelivr.net/npm/three${latest ? '' : `@${versions.three}`}`;
    files.push({ name: `${root}index.html`, data: `${head}\n  <script type="importmap">\n  { "imports": {\n    "three": "${cdn}/build/three.module.js",\n    "three/addons/": "${cdn}/examples/jsm/"\n  } }\n  </script>\n</head>\n<body>\n  <script type="module" src="./src/main.js"></script>\n</body>\n</html>\n` });
    files.push({ name: `${root}package.json`, data: JSON.stringify({ name: slug, version: '1.0.0', private: true, scripts: { start: 'npx --yes serve .' } }, null, 2) + '\n' });
  } else {
    files.push({ name: `${root}index.html`, data: `${head}\n  <script src="https://cdn.jsdelivr.net/npm/p5${latest ? '' : `@${versions.p5}`}/lib/p5.min.js"></script>\n</head>\n<body>\n${withPanel ? '  <script src="./src/controls.js"></script>\n' : ''}  <script src="./src/sketch.js"></script>\n</body>\n</html>\n` });
    files.push({ name: `${root}package.json`, data: JSON.stringify({ name: slug, version: '1.0.0', private: true, scripts: { start: 'npx --yes serve .' } }, null, 2) + '\n' });
  }
  files.push({ name: `${root}README.md`, data: README({ title, kind, flavor, panel: withPanel, gui: withGui, latest, versions }) });
  return files;
}
