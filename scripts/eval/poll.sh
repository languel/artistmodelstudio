ego-browser nodejs <<'EOF'
const task = await taskSpace("ams mic test");
const page = task.page("p1");
const r = await page.evaluate(async () => { const x = await Promise.race([window.__lessonEval, new Promise(r => setTimeout(() => r("running"), 6000))]); return x; });
const fmt = s => s.results.map(q => `${q.id.padEnd(11)} ran=${q.ran ? "y" : "N"} src=${q.usesSource ? "y" : "N"} marks=${q.marks}/${q.wanted} score=${q.score} tries=${q.tries} ${q.error ? "ERR " + String(q.error).slice(0, 60) : ""}`).join("\n");
if (r === "running") console.log("running"); else if (r.error) console.log(JSON.stringify(r)); else for (const k of ["ask", "alt"]) if (r[k]) console.log(`--- ${k}: ${r[k].passed}/${r[k].of} pass\n${fmt(r[k])}`);
EOF
