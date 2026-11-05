ego-browser nodejs <<'EOF'
const task = await taskSpace("ams mic test");
const page = task.page("p1");
await page.reload(); await page.waitForTimeout(3500);
console.log(await page.evaluate(async () => {
  const app = window.__ams.app || window.__ams, M = await import("/src/workbench/modelStore.js"), A = app.artists.get("lfm3");
  M.useModel(app, "lfm3", "LiquidAI/LFM3-Omni-2B-GGUF");
  const E = await import("/src/workbench/assistEval.js?v=" + Date.now());
  window.__lfmEval = (async () => { await A.ensureLoaded(); return { say: await E.run(app, { mode: "model", use: "say" }), alt: await E.run(app, { mode: "model", use: "alt" }) }; })();
  return "started";
}));
EOF
