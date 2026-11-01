// The editor's language service for p5.js and three.js sketches: the TypeScript language service in a worker,
// with the type definitions of p5, three and the browser. Built into public/lang/ (not committed) and loaded
// only when the editor's code help is on. Skipped when it is already up to date.
import { build } from 'esbuild';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';

const out = 'public/lang';
const stamp = `${out}/.stamp`;
const version = p => (existsSync(`node_modules/${p}/package.json`) ? JSON.parse(readFileSync(`node_modules/${p}/package.json`, 'utf8')).version : 'none');
const key = ['typescript', '@types/p5', '@types/three'].map(version).join('|');
if (existsSync(`${out}/language-worker.mjs`) && existsSync(`${out}/language-types.json`) && existsSync(stamp) && readFileSync(stamp, 'utf8') === key && !process.argv.includes('--force')) process.exit(0);

await mkdir(out, { recursive: true });
const typeFiles = {};
async function collect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) await collect(path);
    else if (entry.name.endsWith('.d.ts') || entry.name === 'package.json') typeFiles[`/${path}`] = await readFile(path, 'utf8');
  }
}
// (the library files only: lib.*.d.ts; the compiler itself is bundled into the worker)
for (const dir of ['typescript/lib', '@types/p5', '@types/three', '@types/webxr', '@types/stats.js']) if (existsSync(`node_modules/${dir}`)) await collect(`node_modules/${dir}`);
await writeFile(`${out}/language-types.json`, JSON.stringify(typeFiles));
await build({ entryPoints: ['src/workbench/languageWorker.js'], outfile: `${out}/language-worker.mjs`, bundle: true, minify: true, format: 'esm', platform: 'browser', external: ['fs', 'path', 'os', 'crypto', 'buffer', 'inspector', 'perf_hooks', 'source-map-support'], legalComments: 'none', target: 'es2022' });
await writeFile(stamp, key);
console.log(`language service built (${Object.keys(typeFiles).length} type files)`);
