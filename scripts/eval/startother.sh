MODEL="$1"
ego-browser nodejs <<EOF
const task = await taskSpace("ams mic test");
const page = task.page("p1");
await page.reload(); await page.waitForTimeout(3500);
console.log(await page.evaluate(async () => {
  const app = window.__ams.app || window.__ams, O = app.artists.get("ollama");
  O.setModel("$MODEL"); window.__evalEngine = "ollama"; app.guide.pace = 0;
  const L = await import("/src/workbench/lessonEval.js?v=" + Date.now());
  window.__lessonEval = (async () => { try { return { ask: await L.run(app, { use: "ask", examples: 0 }), alt: await L.run(app, { use: "alt", examples: 0 }) }; } catch (e) { return { error: e.message }; } })();
  return "started " + O.getModel();
}));
EOF
