# usage: sweep.sh engine model1 model2 ...   (results in window.__sweep[model])
ENGINE="$1"; shift
MODELS=$(printf '"%s",' "$@"); MODELS="[${MODELS%,}]"
ego-browser nodejs <<EOF
const task = await taskSpace("ams mic test");
const page = task.page("p1");
await page.reload(); await page.waitForTimeout(6000);
console.log(await page.evaluate(async () => {
  const app = window.__ams.app || window.__ams, A = app.artists.get("$ENGINE");
  app.guide.pace = 0; window.__evalEngine = "$ENGINE"; window.__evalTemp = "$ENGINE" === "webgpu" ? 0.1 : undefined; window.__evalMaxTokens = 1400;
  const L = await import("/src/workbench/lessonEval.js?v=" + Date.now());
  window.__sweep = {}; window.__sweepDone = false; window.__sweepNow = "";
  (async () => {
    for (const m of $MODELS) {
      window.__sweepNow = m;
      try { A.setModel(m); const t0 = performance.now(); const ask = await L.run(app, { use: "ask", examples: 0 }), alt = await L.run(app, { use: "alt", examples: 0 }); window.__sweep[m] = { ask, alt, secs: Math.round((performance.now() - t0) / 1000) }; }
      catch (e) { window.__sweep[m] = { error: e.message }; }
    }
    window.__sweepDone = true;
  })();
  return "started";
}));
EOF
