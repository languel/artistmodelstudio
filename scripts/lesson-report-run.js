// Run a sketch in place: p5.js in a small frame of its own, the picture's files from media/.
// Range comments in the code (const n = 4000 /* 500..12000 */) become sliders that re-run it.
const SKETCHES = JSON.parse(document.getElementById('sketches').textContent);
const P5 = 'https://cdn.jsdelivr.net/npm/p5@2.3.2/lib/p5.min.js';
const RANGE = /([A-Za-z_$][\w$]*)\s*=\s*(-?[\d.]+)(\s*\/\*\s*(-?[\d.]+)\s*\.\.\s*(-?[\d.]+)\s*\*\/)/g;
const frameDoc = code => '<!doctype html><html><head><meta charset="utf-8">'
  + '<base href="' + location.href.replace(/[^/]*$/, '') + '">'
  + '<style>html, body { margin: 0; background: #141414; overflow: hidden; } canvas { width: 100% !important; height: auto !important; display: block; }</style>'
  + '<script src="' + P5 + '"></scr' + 'ipt></head><body><script>' + code.replace(/<\/script/gi, '<\\/script') + '</scr' + 'ipt></body></html>';
for (const fig of document.querySelectorAll('figure[data-run]')) {
  const sk = SKETCHES[fig.dataset.run], stage = fig.querySelector('.stage'), btn = fig.querySelector('.run'), controls = fig.querySelector('.controls');
  const params = [...sk.code.matchAll(RANGE)].map(m => ({ name: m[1], value: Number(m[2]), min: Number(m[4]), max: Number(m[5]) }));
  let frame = null, timer = 0;
  const code = () => { let i = 0; return sk.code.replace(RANGE, (all, name, v, rest) => name + ' = ' + params[i++].value + rest); };
  const start = () => {
    if (!frame) {
      frame = document.createElement('iframe');
      frame.title = fig.closest('.example').querySelector('h3').textContent;
      stage.querySelector('img').hidden = true;
      stage.prepend(frame);
    }
    frame.srcdoc = frameDoc(code());
    btn.textContent = 'Stop';
  };
  const stop = () => { if (frame) frame.remove(); frame = null; stage.querySelector('img').hidden = false; btn.textContent = 'Run'; };
  btn.addEventListener('click', () => (frame ? stop() : start()));
  for (const p of params) {
    const whole = [p.value, p.min, p.max].every(Number.isInteger);
    const input = Object.assign(document.createElement('input'), { type: 'range', min: p.min, max: p.max, step: whole ? 1 : (p.max - p.min) / 100, value: p.value, id: fig.dataset.run + '-' + p.name });
    const out = Object.assign(document.createElement('output'), { value: p.value });
    const row = document.createElement('label');
    row.className = 'ctl';
    row.append(Object.assign(document.createElement('span'), { textContent: p.name }), input, out);
    input.addEventListener('input', () => {
      p.value = Number(input.value);
      out.value = whole ? p.value : p.value.toFixed(2);
      clearTimeout(timer);
      timer = setTimeout(start, 250);   // sliders run the sketch (and start it if it is not running)
    });
    controls.append(row);
  }
}
