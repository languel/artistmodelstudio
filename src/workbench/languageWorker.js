// The editor's language service for p5.js and three.js sketches: TypeScript's, in a worker, so the source never
// leaves the machine and typing is never blocked. Built into public/lang/ by scripts/build-language.mjs.
import ts from 'typescript';

let service, files, versions = {}, snapshots = new Map(), roots = [];
const sources = {};
const LIB = '/node_modules/typescript/lib/lib.es2022.full.d.ts';

const AMS = `declare const ams: {
  /** The board's title. */ board: string; width: number; height: number;
  /** Values of the controls the code declares (// @param name = 1 (0..5)), live. */ params: Record<string, any>;
  /** Run any studio tool. */ call(tool: string, args?: object): Promise<any>;
  /** Add a mark to the board. */ mark(role: string, points: number[][], opts?: object): Promise<any>;
  /** A source's picture. */ frame(name: string): Promise<any>;
};`;

const init = (async () => {
  const response = await fetch(new URL('./language-types.json', import.meta.url));
  if (!response.ok) throw Error('Language definitions unavailable');
  files = await response.json();
  files['/p5-environment.d.ts'] = `/// <reference path="/node_modules/@types/p5/global.d.ts" />\n${AMS}`;
  files['/three-environment.d.ts'] = AMS;
  const directories = new Set();
  for (const path of Object.keys(files)) { let at = path.lastIndexOf('/'); while (at > 0) { directories.add(path.slice(0, at)); at = path.lastIndexOf('/', at - 1); } }
  const host = {
    getCompilationSettings: () => ({
      allowJs: true, checkJs: false, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler,
      types: [], skipLibCheck: true, allowSyntheticDefaultImports: true, esModuleInterop: true, baseUrl: '/',
      // 'three' and its addons, as the sketch imports them
      paths: { three: ['node_modules/@types/three/index.d.ts'], 'three/addons/*': ['node_modules/@types/three/examples/jsm/*'], 'three/examples/jsm/*': ['node_modules/@types/three/examples/jsm/*'] }
    }),
    getScriptFileNames: () => roots,
    getScriptVersion: path => String(versions[path] || 0),
    getScriptSnapshot: path => {
      const source = sources[path] ?? files[path];
      if (source === undefined) return;
      const cached = snapshots.get(path);
      if (cached?.source === source) return cached.snapshot;
      const snapshot = ts.ScriptSnapshot.fromString(source);
      snapshots.set(path, { source, snapshot });
      return snapshot;
    },
    getCurrentDirectory: () => '/', getDefaultLibFileName: () => LIB,
    fileExists: path => path in files || path in sources, readFile: path => sources[path] ?? files[path],
    directoryExists: path => directories.has(path) || path === '/', getDirectories: () => [], readDirectory: () => [], useCaseSensitiveFileNames: () => true
  };
  service = ts.createLanguageService(host, ts.createDocumentRegistry());
})();

const text = parts => ts.displayPartsToString(parts || []);
const kindOf = k => (/method|function/.test(k) ? 'function' : /class|interface/.test(k) ? 'class' : /const|enum/.test(k) ? 'constant' : /property|getter|setter/.test(k) ? 'property' : /keyword/.test(k) ? 'keyword' : 'variable');

self.onmessage = async event => {
  const { id, mode, source, pos, operation = 'completion', name } = event.data;
  try {
    await init;
    const path = '/sketch.js';
    if (sources[path] !== source) { sources[path] = source; versions[path] = (versions[path] || 0) + 1; }
    roots = [LIB, `/${mode}-environment.d.ts`, path];
    let result;
    if (operation === 'hover') {
      const info = service.getQuickInfoAtPosition(path, pos);
      result = info ? { from: info.textSpan.start, to: info.textSpan.start + info.textSpan.length, signature: text(info.displayParts), description: text(info.documentation) } : null;
    } else if (operation === 'detail') {
      const entry = service.getCompletionEntryDetails(path, pos, name, {}, undefined, {}, undefined);
      result = entry ? { signature: text(entry.displayParts), description: text(entry.documentation) } : null;
    } else {
      const info = service.getCompletionsAtPosition(path, pos, { includeCompletionsForModuleExports: false, includeCompletionsWithInsertText: true });
      result = info?.entries.map(e => ({ label: e.name, type: kindOf(e.kind), apply: e.insertText || e.name, boost: 5 })) || [];
    }
    self.postMessage({ id, result });
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
