MODEL="$1"
ego-browser nodejs <<EOF
const task = await taskSpace("ams mic test");
const page = task.page("p1");
await page.reload(); await page.waitForTimeout(6000);
console.log(await page.evaluate(async () => {
  const app = window.__ams.app || window.__ams, W = app.artists.get("webgpu");
  window.__wtest = (async () => {
    const out = { model: "$MODEL" }; let t = performance.now();
    try {
      out.reply = await W.complete({ model: "$MODEL", system: "Answer in one short sentence.", user: "What is a hatch fill in a drawing program?", temperature: 0, maxTokens: 80 });
      out.loadAndAskS = Math.round((performance.now() - t) / 100) / 10; out.dtype = W.activeDtype;
      t = performance.now();
      out.reply2 = await W.complete({ model: "$MODEL", system: "Answer in one short sentence.", user: "Name three colors.", temperature: 0, maxTokens: 40 });
      out.askMs = Math.round(performance.now() - t);
    } catch (e) { out.error = e.message.slice(0, 200); }
    return out;
  })();
  return "started";
}));
EOF
