import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Dev-only endpoint so probe/distill pages can write results to disk:
// root "seeds" -> fixtures/seeds/<set>/, "distill" -> training/<set>/data/, "report" -> training/<set>/reports/.
function probeSavePlugin() {
  const roots = {
    seeds: set => path.resolve('fixtures/seeds', set),
    distill: set => path.resolve('training', set, 'data'),
    report: set => path.resolve('training', set, 'reports'),
    decisions: set => path.resolve('training/decisions', set),
    exports: set => path.resolve('exports', set)
  };
  return {
    name: 'ams-probe-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__probe/save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; return res.end(); }
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const { set, files, root = 'seeds' } = JSON.parse(body);
            if (!/^[a-z0-9-]+$/.test(set) || !roots[root]) throw new Error('bad set or root');
            const dir = roots[root](set);
            fs.mkdirSync(dir, { recursive: true });
            for (const [name, content] of Object.entries(files)) {
              if (!/^[a-z0-9.-]+$/.test(name)) throw new Error(`bad file name ${name}`);
              // data: URLs (images, video) are written as binary; anything else as text.
              const m = /^data:[^;,]+;base64,/.exec(content);
              const data = m ? Buffer.from(content.slice(m[0].length), 'base64') : content;
              fs.writeFileSync(path.join(dir, name), data);
            }
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ ok: true, dir: path.relative(process.cwd(), dir), count: Object.keys(files).length }));
          } catch (err) {
            res.statusCode = 400;
            res.end(JSON.stringify({ ok: false, error: err.message }));
          }
        });
      });
    }
  };
}

/**
 * Dev-only: render an exported script page (exports/…/x.html) to an MP4 (exports/video/x.mp4) with scripts/render-video.mjs.
 *   GET  /__render/ping               → { ok: true }
 *   POST /__render/start { page }     → { id }        page: the page's path as the dev server serves it (/exports/player/x.html)
 *   GET  /__render/status?id          → { stage: 'ready' | 'record' | 'encode' | 'done' | 'error', cue, of, url, bytes, error }
 */
function renderVideoPlugin() {
  const jobs = new Map();
  let seq = 0;
  return {
    name: 'ams-render-video',
    apply: 'serve',
    configureServer(server) {
      const json = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
      server.middlewares.use('/__render', (req, res) => {
        const url = new URL(req.url, 'http://x');
        if (url.pathname === '/ping') return json(res, 200, { ok: true });
        if (url.pathname === '/status') { const j = jobs.get(url.searchParams.get('id')); return j ? json(res, 200, j) : json(res, 404, { stage: 'error', error: 'No such job.' }); }
        if (url.pathname === '/start' && req.method === 'POST') {
          let body = '';
          req.on('data', c => { body += c; });
          req.on('end', () => {
            try {
              const { page, width = 1920, height = 1080, fps = 30 } = JSON.parse(body || '{}');
              const exportsDir = path.resolve('exports'), file = path.resolve(String(page || '').replace(/^\//, ''));
              if (!file.startsWith(exportsDir + path.sep) || !file.endsWith('.html') || !fs.existsSync(file)) throw new Error('The page must be an exported .html under exports/.');
              const name = path.basename(file, '.html'), out = path.join(exportsDir, 'video', `${name}.mp4`);
              const id = String(++seq), job = { stage: 'starting' };
              jobs.set(id, job);
              const child = spawn(process.execPath, ['scripts/render-video.mjs', file, out, '--width', String(Number(width) || 1920), '--height', String(Number(height) || 1080), '--fps', String(Number(fps) || 30)], { cwd: process.cwd() });
              let buf = '';
              child.stdout.on('data', d => {
                buf += d;
                for (let i; (i = buf.indexOf('\n')) >= 0;) {
                  const line = buf.slice(0, i); buf = buf.slice(i + 1);
                  try { const m = JSON.parse(line); if (m.stage === 'warning') continue; Object.assign(job, m); if (m.stage === 'done') job.url = `/exports/video/${name}.mp4`; } catch { /* not a status line */ }
                }
              });
              child.stderr.on('data', () => {});
              child.on('close', code => { if (code && job.stage !== 'error') Object.assign(job, { stage: 'error', error: `The renderer stopped (${code}).` }); });
              json(res, 200, { id });
            } catch (err) { json(res, 400, { error: err.message }); }
          });
          return;
        }
        json(res, 404, { error: 'Unknown route.' });
      });
    }
  };
}

/**
 * Dev-only relay so external MCP clients can drive a studio tab.
 *   GET  /__ams/tabs            connected tabs (newest last)
 *   GET  /__ams/tools           tool list from the newest tab
 *   POST /__ams/call            { name, args, timeoutSec? } → { result } | { error }
 * The tab side lives in src/mcp/webmcp.js (ams:hello / ams:call / ams:result).
 */
function amsRelayPlugin() {
  return {
    name: 'ams-relay',
    configureServer(server) {
      // Tabs long-poll GET /__ams/poll?tab=ID for calls and POST results to /__ams/result.
      // (Plain HTTP: the HMR websocket can drop silently and strand calls.)
      const tabs = new Map();   // id → { title, url, tools, seen, waiters: [res], queue: [msg] }
      const pending = new Map(); // call id → { res, timer }
      let seq = 0;
      const json = (res, code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
      const live = () => [...tabs.entries()].filter(([, t]) => Date.now() - t.seen < 40000).sort((a, b) => a[1].since - b[1].since);
      const readBody = req => new Promise(r => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => { try { r(JSON.parse(b || '{}')); } catch { r({}); } }); });
      const deliver = (tab, msg) => {
        const w = tab.waiters.shift();
        if (w) json(w, 200, msg); else tab.queue.push(msg);
      };
      server.middlewares.use('/__ams', async (req, res) => {
        const url = new URL(req.url, 'http://x');
        const route = url.pathname;
        if (route === '/hello' && req.method === 'POST') {
          const b = await readBody(req);
          const t = tabs.get(b.tab) || { waiters: [], queue: [], since: Date.now() };
          Object.assign(t, { title: b.title, url: b.url, tools: b.tools, seen: Date.now() });
          tabs.set(b.tab, t);
          return json(res, 200, { ok: true });
        }
        if (route === '/poll') {
          const t = tabs.get(url.searchParams.get('tab'));
          if (!t) return json(res, 404, { hello: true });
          t.seen = Date.now();
          if (t.queue.length) return json(res, 200, t.queue.shift());
          t.waiters.push(res);
          const timer = setTimeout(() => { const i = t.waiters.indexOf(res); if (i >= 0) { t.waiters.splice(i, 1); res.statusCode = 204; res.end(); } }, 25000);
          res.on('close', () => { clearTimeout(timer); const i = t.waiters.indexOf(res); if (i >= 0) t.waiters.splice(i, 1); });
          return;
        }
        if (route === '/result' && req.method === 'POST') {
          const { id, result, error } = await readBody(req);
          const p = pending.get(id);
          if (p) { pending.delete(id); clearTimeout(p.timer); json(p.res, 200, error ? { error } : { result }); }
          return json(res, 200, { ok: true });
        }
        const list = live();
        if (route === '/tabs') return json(res, 200, list.map(([id, t], i) => ({ index: i, id, title: t.title, url: t.url, tools: t.tools?.length || 0, lastSeenMs: Date.now() - t.seen })));
        if (!list.length) return json(res, 503, { error: 'No studio tab connected. Open the app (npm run dev) in a browser.' });
        const [, tab] = list[list.length - 1];
        if (route === '/tools') return json(res, 200, tab.tools || []);
        if (route === '/call' && req.method === 'POST') {
          const msg = await readBody(req);
          const id = ++seq;
          const timer = setTimeout(() => { pending.delete(id); json(res, 504, { error: 'Timed out waiting for the studio tab' }); }, (msg.timeoutSec || 900) * 1000);
          pending.set(id, { res, timer });
          return deliver(tab, { id, name: msg.name, args: msg.args || {} });
        }
        json(res, 404, {});
      });
    }
  };
}


/**
 * Hosted LLM providers through the dev server: GET /__llm/_status says which have a key here; /__llm/<id>/<path> forwards to the provider
 * with its key from the environment added, so the key never reaches the page (and the provider's CORS does not matter).
 */
function llmProxyPlugin() {
  const ghToken = () => { try { return execFileSync('gh', ['auth', 'token'], { encoding: 'utf8', timeout: 4000 }).trim(); } catch { return ''; } };
  const providers = {
    pratt: { origin: 'https://llm.pratt.edu', env: ['PRATT_LLM_API_KEY'] },
    nim: { origin: 'https://integrate.api.nvidia.com', env: ['NVIDIA_NIM_API_KEY', 'NVIDIA_API_KEY'] },
    github: { origin: 'https://models.github.ai', env: ['GITHUB_TOKEN', 'GH_TOKEN'], fallback: ghToken },
    gemini: { origin: 'https://generativelanguage.googleapis.com', env: ['GEMINI_API_KEY', 'GOOGLE_API_KEY'] },
    openrouter: { origin: 'https://openrouter.ai', env: ['OPENROUTER_API_KEY'] }
  };
  const keyOf = p => p.env.map(n => process.env[n]).find(Boolean) || p.fallback?.() || '';
  return {
    name: 'ams-llm-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__llm', async (req, res) => {
        const url = new URL(req.url, 'http://x');
        const [, id, ...rest] = url.pathname.split('/');
        if (url.pathname === '/_status' || url.pathname === '/') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(Object.fromEntries(Object.entries(providers).map(([k, p]) => [k, Boolean(keyOf(p))])))); }
        const p = providers[id];
        if (!p) { res.statusCode = 404; return res.end('unknown provider'); }
        const key = keyOf(p);
        if (!key) { res.statusCode = 401; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: { message: `No key for ${id} in the environment of the dev server` } })); }
        try {
          const chunks = []; for await (const c of req) chunks.push(c);
          const body = Buffer.concat(chunks);
          const up = await fetch(`${p.origin}/${rest.join('/')}${url.search}`, { method: req.method, headers: { 'Content-Type': req.headers['content-type'] || 'application/json', Accept: req.headers.accept || '*/*', 'Accept-Encoding': 'identity', Authorization: `Bearer ${key}` }, body: ['GET', 'HEAD'].includes(req.method) ? undefined : body });
          res.statusCode = up.status;
          const ct = up.headers.get('content-type'); if (ct) res.setHeader('Content-Type', ct);
          if (!up.body) return res.end();
          const reader = up.body.getReader();
          res.on('close', () => reader.cancel().catch(() => {}));
          for (;;) { const { done, value } = await reader.read(); if (done) break; res.write(value); }
          res.end();
        } catch (err) { if (!res.headersSent) { res.statusCode = 502; res.setHeader('Content-Type', 'application/json'); } res.end(JSON.stringify({ error: { message: `Proxy: ${err.message}` } })); }
      });
    }
  };
}

export default defineConfig({
  // GitHub Pages serves the site under /<repo>/ (the deploy workflow sets BASE_PATH); locally it is /.
  base: process.env.BASE_PATH || '/',
  plugins: [probeSavePlugin(), amsRelayPlugin(), llmProxyPlugin(), renderVideoPlugin()],
  server: {
    port: 3000,
    // Files written to exports/ (pages, reports, sketches) are outputs: writing them must not reload the studio.
    watch: { ignored: ['**/exports/**', '**/dist/**', '**/dist-single/**'] },
    // Local decision model (lev / kev: TypeSafe /v1/systemone) without CORS trouble.
    proxy: { '/__decide': { target: process.env.AMS_DECIDE_URL || 'http://127.0.0.1:8009', changeOrigin: true, rewrite: p => p.replace(/^\/__decide/, '') } },
    open: false,
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'credentialless'
    }
  },
  optimizeDeps: {
    include: ['p5.brush/standalone', 'p5'],
    exclude: ['@huggingface/transformers', '@ffmpeg/ffmpeg', '@ffmpeg/util']
  },
  // Workers are modules (the narration worker loads Kokoro with a dynamic import).
  worker: { format: 'es' },
  build: {
    target: 'esnext',
    rollupOptions: { input: { main: 'index.html', classic: 'classic.html' } }
  }
});
