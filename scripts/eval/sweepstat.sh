ego-browser nodejs <<'EOF'
const task = await taskSpace("ams mic test");
const page = task.page("p1");
const r = await page.evaluate(() => ({ now: window.__sweepNow, done: window.__sweepDone, models: Object.fromEntries(Object.entries(window.__sweep || {}).map(([m, v]) => [m, v.error ? "ERR " + v.error : { ask: `${v.ask.passed}/${v.ask.of}`, alt: `${v.alt.passed}/${v.alt.of}`, secs: v.secs, per: [...v.ask.results, ...v.alt.results].map(q => `${q.id}:${q.pass ? "y" : "n"}${q.error ? "!" : ""}`).join(" ") }])) }));
console.log(JSON.stringify(r, null, 1));
EOF
