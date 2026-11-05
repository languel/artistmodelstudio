K="${1:-2}"
ego-browser nodejs <<EOF
const task = await taskSpace("ams mic test");
const page = task.page("p1");
await page.reload(); await page.waitForTimeout(3500);
console.log(await page.evaluate(async () => {
  const app = window.__ams.app || window.__ams, M = await import("/src/workbench/modelStore.js"), A = app.artists.get("lfm3");
  M.useModel(app, "lfm3", "LiquidAI/LFM3-Omni-2B-GGUF"); app.guide.pace = 0;
  const L = await import("/src/workbench/lessonEval.js?v=" + Date.now());
  window.__lessonEval = (async () => { await A.ensureLoaded(); try { return { ask: await L.run(app, { use: "ask", examples: $K }), alt: await L.run(app, { use: "alt", examples: $K }) }; } catch (e) { return { error: e.message, stack: String(e.stack).slice(0, 400) }; } })();
  return "started";
}));
EOF
