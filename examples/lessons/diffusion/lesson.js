/**
 * Lecture: diffusion models, from noise to picture.
 *
 * The same shape as the sampling lesson (examples/lessons/sampling/lesson.js) and built by the same scene builder
 * (examples/lessons/sampling/scene.js, as `/lesson diffusion`): a cover, a section of diagrams drawn by studio code,
 * a section of p5.js simulations (a board with `p5` is a sketch written by hand), and a bibliography.
 *
 * The simulations use the real DDPM / DDIM formulas. Where a trained network would go, the toy problems allow the
 * ideal denoiser to be written exactly (a mixture of Gaussians, or a handful of pictures), so what runs is the process
 * itself, with a perfect network.
 */

// The helpers the diagrams share (studio code, fractions of the board; the board is 800 x 600).
const HELP = `const INK = '#dadada', MUTED = '#8c8c8c', WARM = '#c8664f', GOLD = '#f2c14e', BLUE = '#5b7fd1', GREEN = '#7fb069', k = width / height
const label = (x, y, t, o = {}) => note(x, y, t, { color: o.color || MUTED, note: { style: 'plain', font: 'sans', size: o.size || 14, width: o.width || 200 } })
const box = (x, y, w, h, c = INK) => line(rect(x, y, w, h), { brush: 'pen', width: 2, color: c, closed: true, path: 'straight' })
const arrow = (pts, c = MUTED, w = 2) => {
  line(pts, { brush: 'pen', width: w, color: c, path: 'straight' })
  const a = pts[pts.length - 2], b = pts[pts.length - 1]
  const dx = (b[0] - a[0]) * width, dy = (b[1] - a[1]) * height, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len
  const p = (s, n) => [b[0] - (s * ux + n * uy) / width, b[1] - (s * uy - n * ux) / height]
  line([p(11, 5.5), b, p(11, -5.5)], { brush: 'pen', width: w, color: c, path: 'straight' })
}
// A box with its title (bright) and a line or two under it.
const card = (x, y, w, h, title, sub, c = INK) => {
  box(x, y, w, h, c)
  label(x + 0.012, y + 0.016, title, { color: c, width: w * width - 14, size: 15 })
  if (sub) label(x + 0.012, y + 0.016 + 0.058, sub, { width: w * width - 14, size: 13 })
}
`;

export const LESSON = {
  title: 'Diffusion models: from noise to picture',
  subtitle: 'Add noise to a picture a little at a time; teach a network to take it out again; then start from noise.',
  idea: 'Destroying a picture is easy and needs no learning: add noise. Undoing one small step of it is a problem a network can learn. Do the small undoing many times, from pure noise, and a picture appears.',
  main: 'process',
  sources: {},
  sections: [
    {
      id: 'diagrams',
      title: 'Diffusion, in pictures',
      label: 'Diagrams',
      text: 'A diffusion model is trained to undo a very simple process: adding noise to a picture a little at a time. Once it can take one step of noise out, we start from pure noise and take the steps in reverse, and a new picture appears. Six diagrams: the two directions, the noise schedule, training, sampling, the version behind Stable Diffusion (a latent space, a prompt, guidance) and the score, the view that ties diffusion to older ideas. Key papers: [Sohl-Dickstein et al. 2015](https://arxiv.org/abs/1503.03585) (the idea), [Ho et al. 2020](https://arxiv.org/abs/2006.11239) (DDPM, what made it work), [Song et al. 2021](https://arxiv.org/abs/2011.13456) (the score view).',
      diagram: true,
      boards: [
        { id: 'process', title: '0.1 · Two directions', w: 800, h: 600, ground: '#141414',
          idea: 'Forward: take a picture x₀ and add a little Gaussian noise, again and again. After T steps (about a thousand) nothing of the picture is left: x_T is pure noise, a distribution we can sample from. Reverse: a network learns to undo one step, and running it T times turns noise into a picture. The forward direction has no parameters, only the reverse is learned.',
          pseudo: `x ← a picture from the data
for t = 1 … T:
  x ← √(1 − βₜ) · x + √βₜ · (fresh noise)        # forward: destroy
x is now noise
for t = T … 1:
  x ← a slightly less noisy x, using the network   # reverse: create`,
          code: HELP + `// Diffusion in one picture: noise added a little at a time (forward), and a network that takes it out again (reverse).
const N = 12, n = 6, pw = 0.105, gap = 0.058, x0 = 0.04, y0 = 0.35
const ab = [1, 0.93, 0.72, 0.42, 0.14, 0]                       // how much of the picture is left at each panel (abar)
const pic = (u, v) => {                                        // a tiny sunset: sky, sun, hill
  if (Math.hypot(u - 0.66, v - 0.4) < 0.19) return [250, 214, 120]
  if (v > 0.72 - 0.1 * Math.sin(u * 5)) return [48, 84, 66]
  return [60 + 150 * v, 70 + 90 * v, 130 - 20 * v]
}
const hex = c => '#' + c.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')
const gauss = () => 2 * (random() + random() + random() - 1.5)  // about N(0, 1)
for (let i = 0; i < n; i++) {
  const ox = x0 + i * (pw + gap)
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
    const p = pic((c + 0.5) / N, (r + 0.5) / N)
    const col = p.map(v => 255 * ((Math.sqrt(ab[i]) * (2 * v / 255 - 1) + Math.sqrt(1 - ab[i]) * gauss()) + 1) / 2)   // x_t = √ᾱ x₀ + √(1−ᾱ) ε
    plane(rect(ox + c * pw / N, y0 + r * pw * k / N, pw / N * 1.03, pw * k / N * 1.03), { color: hex(col), path: 'straight' })
  }
}
;['x₀ · a picture', 'x₁', 'x₂', '…', 'x_{T−1}', 'x_T · pure noise'].forEach((t, i) => label(x0 + i * (pw + gap) - 0.005, y0 + pw * k + 0.02, t, { width: 100, color: INK }))
arrow([[0.04, 0.27], [0.96, 0.27]], WARM, 3)
label(0.04, 0.09, 'forward: add a little Gaussian noise at each step. No learning: just a recipe.', { color: WARM, width: 640, size: 16 })
label(0.04, 0.165, 'q(x_t | x_{t−1}) = N(√(1−β_t) · x_{t−1}, β_t · I)', { color: WARM, width: 500 })
arrow([[0.96, 0.66], [0.04, 0.66]], GOLD, 3)
label(0.04, 0.70, 'reverse: a network learns to remove it, step by step: noise becomes a picture.', { color: GOLD, width: 640, size: 16 })
label(0.04, 0.775, 'p_θ(x_{t−1} | x_t): this is the part that is trained', { color: GOLD, width: 500 })
label(0.04, 0.88, 'To make a new picture: draw x_T from the noise, then run the reverse steps.', { width: 640 })
` },
        { id: 'schedule', title: '0.2 · The noise schedule', w: 800, h: 600, ground: '#141414',
          idea: 'Because every step adds Gaussian noise, we can jump from x₀ straight to any step: x_t = √ᾱ_t · x₀ + √(1−ᾱ_t) · ε. ᾱ_t, the product of (1 − β_s) up to t, says how much of the picture is left. The schedule of β sets how quickly it goes: the linear one of Ho et al. (2020) has lost most of the picture by t ≈ 500; the cosine one of Nichol and Dhariwal (2021) loses it more evenly.',
          pseudo: `β[t] ← small numbers that grow with t
ᾱ[t] ← (1 − β[1]) · (1 − β[2]) ⋯ (1 − β[t])
x_t ← √ᾱ[t] · x₀ + √(1 − ᾱ[t]) · ε        # ε: Gaussian noise`,
          code: HELP + `// The noise schedule: how much picture (gold) and how much noise (red) is in x_t, for t = 0 … T.
const T = 1000
const lin = [], cos = []
let p = 1
for (let t = 0; t <= T; t++) {
  p *= 1 - (1e-4 + (0.02 - 1e-4) * Math.min(t, T - 1) / (T - 1))            // linear beta (Ho et al. 2020)
  lin.push(p)
  const f = s => Math.pow(Math.cos((s / T + 0.008) / 1.008 * Math.PI / 2), 2)  // cosine (Nichol & Dhariwal 2021)
  cos.push(f(t) / f(0))
}
const X0 = 0.09, X1 = 0.6, Y0 = 0.8, Y1 = 0.14
const px = t => X0 + (X1 - X0) * t / T, py = v => Y0 + (Y1 - Y0) * v
line([[X0, Y1], [X0, Y0], [X1, Y0]], { brush: 'pen', width: 1.5, color: MUTED, path: 'straight' })
for (const t of [0, 250, 500, 750, 1000]) label(px(t) - 0.03, Y0 + 0.02, String(t), { width: 60, size: 12 })
for (const v of [0, 0.5, 1]) label(X0 - 0.06, py(v) - 0.025, String(v), { width: 40, size: 12 })
label(0.32, Y0 + 0.085, 'step t', { width: 80, size: 12 })
const every = d => range(T / d + 1).map(i => i * d)
const curve = (a, f, c, w) => line(every(20).map(t => [px(t), py(f(a[t]))]), { brush: 'pen', width: w, color: c })
const dots = (a, f, c) => every(25).forEach(t => point(px(t), py(f(a[t])), { size: 4, color: c }))
curve(lin, v => Math.sqrt(v), GOLD, 3)
curve(lin, v => Math.sqrt(1 - v), WARM, 3)
dots(cos, v => Math.sqrt(v), GOLD)
dots(cos, v => Math.sqrt(1 - v), WARM)
label(0.66, 0.08, 'x_t = √ᾱ_t · x₀ + √(1−ᾱ_t) · ε', { color: INK, width: 280, size: 17 })
label(0.66, 0.2, 'ε is Gaussian noise. One jump from x₀ to any x_t: no need to run the chain.', { width: 270 })
point(0.665, 0.4, { size: 8, color: GOLD }); label(0.685, 0.375, '√ᾱ_t: how much of the picture is left', { color: GOLD, width: 240 })
point(0.665, 0.5, { size: 8, color: WARM }); label(0.685, 0.475, '√(1−ᾱ_t): how much noise', { color: WARM, width: 240 })
line([[0.655, 0.6], [0.7, 0.6]], { brush: 'pen', width: 3, color: INK, path: 'straight' }); label(0.72, 0.575, 'linear β (DDPM)', { color: INK, width: 200 })
point(0.66, 0.67, { size: 4, color: INK }); point(0.68, 0.67, { size: 4, color: INK }); label(0.72, 0.645, 'cosine ᾱ (improved DDPM)', { color: INK, width: 220 })
label(0.66, 0.77, 'Linear: the picture is mostly gone by t ≈ 500, and the last half of the steps do little. Cosine keeps it longer.', { width: 270 })
` },
        { id: 'training', title: '0.3 · Training: guess the noise', w: 800, h: 600, ground: '#141414',
          idea: 'Training is a game of guessing the noise. Take a training picture, choose a random step t and a random noise ε, mix them into x_t, and ask the network which noise was added. The loss is the squared difference. The network never sees x₀, only x_t and t, so to answer it has to learn what pictures look like. Averaged over many pictures, steps and noises, that is all of the training.',
          pseudo: `repeat:
  x₀ ← a picture from the training set
  t ← a random step,  ε ← Gaussian noise
  x_t ← √ᾱ[t] · x₀ + √(1 − ᾱ[t]) · ε
  ε̂ ← network(x_t, t)
  loss ← average of (ε − ε̂)² over the pixels
  change the network a little to lower the loss`,
          code: HELP + `// Training: guess the noise that was added.
card(0.04, 0.09, 0.26, 0.17, 'x₀', 'a picture from the training set')
card(0.04, 0.38, 0.26, 0.17, 't, ε', 'a random step, and Gaussian noise ε ~ N(0, I)', WARM)
card(0.37, 0.235, 0.26, 0.17, 'x_t', '√ᾱ_t · x₀ + √(1−ᾱ_t) · ε: the noisy picture')
card(0.7, 0.235, 0.26, 0.17, 'network ε_θ(x_t, t)', 'a U-Net or a transformer: what is learned', GOLD)
card(0.7, 0.56, 0.26, 0.17, 'ε̂', 'its guess of the noise in x_t', GOLD)
card(0.37, 0.56, 0.26, 0.17, 'loss = ‖ε − ε̂‖²', 'how far the guess is from the truth', BLUE)
arrow([[0.3, 0.175], [0.335, 0.175], [0.335, 0.28], [0.37, 0.28]])
arrow([[0.3, 0.465], [0.335, 0.465], [0.335, 0.36], [0.37, 0.36]], WARM)
arrow([[0.63, 0.32], [0.7, 0.32]])
arrow([[0.83, 0.405], [0.83, 0.56]], GOLD)
arrow([[0.7, 0.645], [0.63, 0.645]], GOLD)
arrow([[0.17, 0.55], [0.17, 0.645], [0.37, 0.645]], WARM)
label(0.19, 0.685, 'the true ε', { color: WARM, width: 120, size: 12 })
label(0.04, 0.82, 'The network sees only x_t and t. To say which part is noise, it has to know what pictures look like.', { width: 620, color: INK })
label(0.04, 0.9, 'Lower the loss over many pictures, steps and noises: that is the whole of training.', { width: 620 })
` },
        { id: 'sampling', title: '0.4 · Sampling: from noise to picture', w: 800, h: 600, ground: '#141414',
          idea: 'Sampling runs the network in a loop. From the current x_t it predicts the noise, from which we get a guess x̂₀ of the clean picture; then we step to a slightly less noisy x_{t−1}, keeping a bit of the guess and a bit of the noise. DDPM adds fresh noise at every step. DDIM (Song et al. 2021) takes the same kind of step with none: a fixed starting noise gives a fixed picture, and much larger steps work, 20 to 50 instead of a thousand.',
          pseudo: `x ← Gaussian noise                                 # x_T
for t = T … 1:
  ε̂ ← network(x, t)
  x̂₀ ← (x − √(1 − ᾱ[t]) · ε̂) / √ᾱ[t]             # a guess of the clean picture
  x ← √ᾱ[t−1] · x̂₀ + √(1 − ᾱ[t−1]) · ε̂           # DDIM; DDPM also adds fresh noise
x is the new picture`,
          code: HELP + `// Sampling: the loop that turns noise into a picture.
card(0.04, 0.1, 0.24, 0.14, 'x_T', 'pure noise: N(0, I)', WARM)
card(0.36, 0.1, 0.28, 0.14, '1 · predict the noise', 'ε̂ = ε_θ(x_t, t)', GOLD)
card(0.36, 0.32, 0.28, 0.14, '2 · guess the clean picture', 'x̂₀ = (x_t − √(1−ᾱ_t) · ε̂) / √ᾱ_t')
card(0.36, 0.54, 0.28, 0.14, '3 · step to x_{t−1}', '√ᾱ_{t−1} · x̂₀ + √(1−ᾱ_{t−1}) · ε̂')
card(0.36, 0.8, 0.28, 0.12, 'x₀ · a new picture', '', GREEN)
arrow([[0.28, 0.17], [0.36, 0.17]], WARM)
arrow([[0.5, 0.24], [0.5, 0.32]])
arrow([[0.5, 0.46], [0.5, 0.54]])
arrow([[0.64, 0.61], [0.7, 0.61], [0.7, 0.17], [0.64, 0.17]], MUTED)
arrow([[0.5, 0.68], [0.5, 0.8]], GREEN)
label(0.72, 0.35, 'repeat for t = T … 1: a thousand times, or 20 to 50 with DDIM', { width: 190, color: INK })
label(0.53, 0.72, 'when t reaches 0', { width: 140, size: 12 })
label(0.04, 0.36, 'DDPM: add fresh noise at every step, so every run differs and the path is random.', { width: 230 })
label(0.04, 0.6, 'DDIM: add none. A fixed x_T gives a fixed picture, and steps can be skipped.', { width: 230, color: INK })
` },
        { id: 'latent', title: '0.5 · Latent space, a prompt, guidance', w: 800, h: 600, ground: '#141414',
          idea: 'Stable Diffusion and its relatives (Rombach et al. 2022) run the diffusion in the small latent space of an autoencoder instead of on pixels: a 512 × 512 picture becomes a 64 × 64 × 4 tensor, 48 times fewer numbers. A text encoder (CLIP, later also T5) turns the prompt into vectors that the denoiser attends to. Classifier-free guidance (Ho and Salimans 2022) runs the denoiser with and without the prompt and pushes the result away from the answer without it, by a factor w (often 5 to 8): the closer the picture follows the words, the less varied the pictures are.',
          pseudo: `c ← text_encoder(prompt)
z ← Gaussian noise, in latent space             # 64 × 64 × 4
for t = T … 1:
  ε̂ ← ε(z, t, ∅) + w · (ε(z, t, c) − ε(z, t, ∅))   # with and without the prompt
  z ← the sampling step, with ε̂
picture ← decoder(z)                             # 512 × 512 × 3`,
          code: HELP + `// Latent diffusion with a prompt and guidance.
card(0.04, 0.05, 0.24, 0.13, 'prompt', 'a red house by the sea')
card(0.34, 0.05, 0.26, 0.13, 'text encoder', 'CLIP (or T5): one vector per word', GOLD)
arrow([[0.28, 0.115], [0.34, 0.115]])
arrow([[0.47, 0.18], [0.47, 0.32]], GOLD)
label(0.5, 0.215, 'c: what the denoiser attends to', { width: 200, size: 12, color: GOLD })
card(0.04, 0.32, 0.2, 0.18, 'z_T', 'noise in latent space, 64 × 64 × 4', WARM)
card(0.3, 0.32, 0.3, 0.18, 'denoiser', 'a U-Net or a transformer, repeated T times', GOLD)
card(0.7, 0.32, 0.26, 0.18, 'z₀', 'a clean latent', GREEN)
arrow([[0.24, 0.41], [0.3, 0.41]], WARM)
arrow([[0.6, 0.41], [0.7, 0.41]], GOLD)
label(0.3, 0.535, 'guidance: ε̃ = ε(∅) + w · (ε(c) − ε(∅))', { width: 300, color: GOLD, size: 14 })
card(0.7, 0.6, 0.26, 0.14, 'VAE decoder', '', BLUE)
arrow([[0.83, 0.5], [0.83, 0.6]], GREEN)
card(0.36, 0.6, 0.24, 0.14, 'picture', '512 × 512 × 3', INK)
arrow([[0.7, 0.67], [0.6, 0.67]], BLUE)
label(0.04, 0.6, 'In training the picture is encoded once (VAE encoder): z₀ = E(x). The noise is added to z₀.', { width: 240 })
label(0.04, 0.83, 'Everything else is as before: noise the latent, learn to predict the noise, run the loop. It is cheaper because z has 48 times fewer numbers than the picture.', { width: 720, color: INK })
` },
        { id: 'score', title: '0.6 · The score: a field pointing to the data', w: 800, h: 600, ground: '#141414',
          idea: 'The same thing seen another way. The score ∇ₓ log p(x) points, from any x, toward where the data is denser. The noise the network predicts is that direction, upside down and rescaled: ∇ₓ log p_t(x_t) = −ε / √(1−ᾱ_t). Generating is following this field from noise into the data, and the field itself changes as the noise level falls: wide and smooth at first, sharp at the end. This is the view of Song and Ermon (2019), of the SDE formulation of Song et al. (2021), and of denoising score matching (Vincent 2011). (Here x has two numbers, so it can be drawn.)',
          pseudo: `s(x) ← the direction, at x, in which the data is more likely
x ← x + a small step along s(x) + a little noise       # Langevin dynamics
network(x_t, t) ≈ −√(1 − ᾱ[t]) · s(x_t)                # what it learns`,
          code: HELP + `// The score field of two clusters of data (only two numbers per point, so it can be drawn).
const W = width, H = height, C = [[190, 230], [360, 395]], S = 46, Sf = 78    // cluster centers, their spread, the spread of the field
for (const [cx, cy] of C) for (let i = 0; i < 240; i++)
  point((cx + S * (random() + random() + random() - 1.5) * 1.6) / W, (cy + S * (random() + random() + random() - 1.5) * 1.6) / H, { size: 3, color: '#b9b9b9' })
const score = (x, y) => {                                                     // of a mixture of Gaussians: toward the near centers
  const d = C.map(([cx, cy]) => Math.exp(-((x - cx) ** 2 + (y - cy) ** 2) / (2 * Sf * Sf)))
  const z = d[0] + d[1] + 1e-12
  return [0, 1].reduce((s, i) => [s[0] + d[i] / z * (C[i][0] - x) / (Sf * Sf), s[1] + d[i] / z * (C[i][1] - y) / (Sf * Sf)], [0, 0])
}
for (let x = 45; x < 560; x += 50) for (let y = 45; y < 570; y += 50) {
  const [sx, sy] = score(x, y), m = Math.hypot(sx, sy)
  if (m < 1e-9) continue
  const L = 6 + 20 * Math.min(1, m * Sf / 3), ux = sx / m, uy = sy / m
  const bx = x + ux * L, by = y + uy * L
  line([[x / W, y / H], [bx / W, by / H]], { brush: 'pen', width: 1.5, color: GOLD, path: 'straight' })
  line([[(bx - 5 * ux + 3 * uy) / W, (by - 5 * uy - 3 * ux) / H], [bx / W, by / H], [(bx - 5 * ux - 3 * uy) / W, (by - 5 * uy + 3 * ux) / H]], { brush: 'pen', width: 1.5, color: GOLD, path: 'straight' })
}
label(0.73, 0.08, '∇ₓ log p_t(x)', { color: GOLD, size: 20, width: 190 })
label(0.73, 0.18, 'the score: at every x, the direction in which the data is more likely (arrows). Dots are data.', { width: 190 })
label(0.73, 0.42, '−ε̂ / √(1−ᾱ_t)', { color: INK, size: 17, width: 190 })
label(0.73, 0.5, 'is what the network gives: predicting the noise is predicting the score.', { width: 190 })
label(0.73, 0.68, 'Sampling follows the arrows from noise into the data, while the field sharpens as t goes to 0.', { width: 190, color: INK })
` }
      ]
    },
    {
      id: 'simulations',
      title: 'Simulating diffusion',
      label: 'Simulations',
      text: 'Five p5.js sketches, each short enough to read, with the real formulas of [DDPM](https://arxiv.org/abs/2006.11239) and [DDIM](https://arxiv.org/abs/2010.02502). Where a trained network would go, the toy problems let us write the ideal denoiser exactly: for a mixture of Gaussians, or for a handful of pictures, the best possible answer is a formula. So what runs is the process itself with a perfect network. A trained network can only approximate that, and the difference is where real models go wrong. Sliders are written in the code as ranges: change one and the sketch runs again. Guidance is from [Ho and Salimans 2022](https://arxiv.org/abs/2207.12598).',
      boards: [
        { id: 'forward-image', title: '1.1 · Noising a picture', w: 800, h: 600, ground: '#141414',
          idea: 'x_t = √ᾱ_t · x₀ + √(1−ᾱ_t) · ε, with the same noise ε at every t. Move t: at first the picture is still there under a veil; the coarse shapes last longest and the fine detail goes first; near T only noise is left. Switch the schedule to see the cosine one keep more of the picture for longer. The picture is 64 × 64 and drawn by the sketch.',
          pseudo: `x₀ ← the picture, scaled to −1 … 1
ε ← Gaussian noise, one number per pixel (the seed fixes it)
x_t ← √ᾱ[t] · x₀ + √(1 − ᾱ[t]) · ε
show x_t`,
          p5: `// 1.1 Noising a picture: x_t = sqrt(abar_t) * x0 + sqrt(1 - abar_t) * eps, with the same eps at every t.
const t = 300 /* 0..999 */
const schedule = 0 /* 0..1 */
const seed = 7 /* 1..99 */
const N = 64, T = 1000

function abar(cosine) {                       // abar[i]: how much of the picture is left after i + 1 steps
  const a = []
  if (!cosine) { let p = 1; for (let i = 0; i < T; i++) { p *= 1 - (1e-4 + (0.02 - 1e-4) * i / (T - 1)); a.push(p) } }
  else { const f = x => Math.pow(Math.cos((x / T + 0.008) / 1.008 * Math.PI / 2), 2); for (let i = 0; i < T; i++) a.push(Math.min(0.9999, f(i + 1) / f(0))) }
  return a
}

function picture(u, v) {                      // a sunset, colors in -1 .. 1
  let c
  if (Math.hypot(u - 0.66, (v - 0.4)) < 0.16) c = [250, 214, 120]
  else if (v > 0.72 - 0.08 * Math.sin(u * 7) - 0.03 * Math.sin(u * 19)) c = v > 0.85 ? [36, 66, 52] : [48, 84, 66]
  else c = [60 + 150 * v, 70 + 90 * v, 130 - 20 * v]
  return c.map(x => 2 * x / 255 - 1)
}

function show(values, x, y, size, caption) {
  const img = createImage(N, N)
  img.loadPixels()
  for (let i = 0; i < N * N; i++) for (let c = 0; c < 3; c++) img.pixels[4 * i + c] = constrain((values[3 * i + c] + 1) / 2, 0, 1) * 255
  for (let i = 0; i < N * N; i++) img.pixels[4 * i + 3] = 255
  img.updatePixels()
  noSmooth(); image(img, x, y, size, size)
  noStroke(); fill(170); textSize(14); textAlign(CENTER); text(caption, x + size / 2, y + size + 22)
}

function setup() { createCanvas(800, 600); pixelDensity(1); noLoop() }

function draw() {
  background(20)
  randomSeed(seed)
  const ab = abar(schedule >= 0.5), a = ab[t], s = Math.sqrt(a), n = Math.sqrt(1 - a)
  const x0 = [], eps = [], xt = []
  for (let i = 0; i < N * N; i++) {
    const p = picture((i % N + 0.5) / N, (Math.floor(i / N) + 0.5) / N)
    for (let c = 0; c < 3; c++) { const e = randomGaussian(); x0.push(p[c]); eps.push(e); xt.push(s * p[c] + n * e) }
  }
  show(x0, 35, 50, 210, 'x₀ · the picture, × √ᾱ')
  show(eps, 295, 50, 210, 'ε · the noise, × √(1−ᾱ)')
  show(xt, 555, 50, 210, 'x_t · what the model sees')
  fill(200); noStroke(); textSize(34); textAlign(CENTER)
  text('+', 270, 168); text('=', 530, 168)
  // the two coefficients over all t, and where t is
  const X0 = 70, X1 = 730, Y0 = 560, Y1 = 350
  stroke(120); strokeWeight(1); line(X0, Y0, X1, Y0); line(X0, Y0, X0, Y1)
  noStroke(); fill(140); textSize(12); textAlign(CENTER)
  for (const k of [0, 250, 500, 750, 999]) text(k, X0 + (X1 - X0) * k / 999, Y0 + 16)
  textAlign(RIGHT); text('1', X0 - 8, Y1 + 4); text('0', X0 - 8, Y0 + 4)
  noFill(); strokeWeight(3)
  stroke(242, 193, 78); beginShape(); for (let i = 0; i < T; i += 5) vertex(X0 + (X1 - X0) * i / 999, Y0 - (Y0 - Y1) * Math.sqrt(ab[i])); endShape()
  stroke(200, 102, 79); beginShape(); for (let i = 0; i < T; i += 5) vertex(X0 + (X1 - X0) * i / 999, Y0 - (Y0 - Y1) * Math.sqrt(1 - ab[i])); endShape()
  stroke(255, 120); strokeWeight(1); line(X0 + (X1 - X0) * t / 999, Y0, X0 + (X1 - X0) * t / 999, Y1)
  noStroke(); textAlign(LEFT); textSize(15)
  fill(242, 193, 78); text('√ᾱ = ' + s.toFixed(2) + '  the picture', 90, 340)
  fill(200, 102, 79); text('√(1−ᾱ) = ' + n.toFixed(2) + '  the noise', 330, 340)
  fill(170); text('t = ' + t + ' of ' + T + (schedule >= 0.5 ? ' · cosine' : ' · linear'), 600, 340)
}
` },
        { id: 'forward-points', title: '1.2 · The forward process on points', w: 800, h: 600, ground: '#141414',
          idea: 'The same on a cloud of 1200 points in the plane (a spiral, colored by where each starts). Each step shrinks the cloud a hair and adds a little noise. The last states have forgotten the spiral: whatever the data, the end is a round Gaussian cloud with standard deviation about 1, a distribution we can sample. The lines follow 10 of the points.',
          pseudo: `p ← a cloud of points (the data)
for t = 1 … T:
  each point ← √(1 − β[t]) · point + √β[t] · (fresh noise)
show the cloud after t steps`,
          p5: `// 1.2 The forward process on a cloud of points: each step keeps a little less of the data and adds a little noise.
const play = 1 /* 0..1 */
const hold = 400 /* 0..1000 */
const speed = 2 /* 1..30 */
const T = 1000, M = 1200, TR = 10
const CX = 300, CY = 300, U = 100           // where the plot is, and pixels per unit
let hist, ab = [], beta = [], t = 0, wait = 0, start = 0

function setup() {
  createCanvas(800, 600); randomSeed(11); colorMode(HSB, 360, 100, 100, 100)
  let p = 1
  for (let i = 0; i < T; i++) { const b = 1e-4 + (0.02 - 1e-4) * i / (T - 1); beta.push(b); p *= 1 - b; ab.push(p) }
  hist = new Float32Array((T + 1) * M * 2)
  for (let i = 0; i < M; i++) {                 // the data: a spiral
    const u = i / M, a = 1.5 * Math.PI + 3.4 * Math.PI * u, r = 0.15 + 1.6 * u
    hist[2 * i] = r * Math.cos(a) + 0.04 * randomGaussian(); hist[2 * i + 1] = r * Math.sin(a) + 0.04 * randomGaussian()
  }
  for (let s = 1; s <= T; s++) {                // the chain, kept for every step
    const k = Math.sqrt(1 - beta[s - 1]), n = Math.sqrt(beta[s - 1]), from = (s - 1) * M * 2, to = s * M * 2
    for (let j = 0; j < M * 2; j++) hist[to + j] = k * hist[from + j] + n * randomGaussian()
  }
}

function draw() {
  background(0, 0, 8)
  if (play >= 0.5) { if (t === 0 && start < 60) start++; else if (t < T) t = Math.min(T, t + speed); else if (++wait > 90) { t = 0; wait = 0; start = 0 } } else { t = hold; wait = 0 }
  // axes and the 2-sigma circle of the final Gaussian
  stroke(0, 0, 25); strokeWeight(1); line(CX - 2.8 * U, CY, CX + 2.8 * U, CY); line(CX, CY - 2.8 * U, CX, CY + 2.8 * U)
  noFill(); stroke(0, 0, 42); circle(CX, CY, 4 * U)
  // trails of a few points
  for (let i = 0; i < TR; i++) {
    const m = Math.floor(i * M / TR)
    stroke(210, 10, 85, 55); strokeWeight(1); noFill(); beginShape()
    for (let s = 0; s <= t; s += 4) vertex(CX + U * hist[s * M * 2 + 2 * m], CY - U * hist[s * M * 2 + 2 * m + 1])
    endShape()
  }
  // the cloud
  noStroke(); const base = t * M * 2
  let sx = 0, sy = 0, sxx = 0, syy = 0
  for (let i = 0; i < M; i++) {
    const x = hist[base + 2 * i], y = hist[base + 2 * i + 1]
    fill(30 + 200 * i / M, 80, 100, 85); circle(CX + U * x, CY - U * y, 4)
    sx += x; sy += y; sxx += x * x; syy += y * y
  }
  const mx = sx / M, my = sy / M
  // what is left
  noStroke(); textSize(15); textAlign(LEFT)
  fill(0, 0, 80); text('step t = ' + t + ' of ' + T, 620, 60)
  fill(45, 70, 100); text('√ᾱ = ' + Math.sqrt(t ? ab[t - 1] : 1).toFixed(2) + '  data kept', 620, 90)
  fill(12, 60, 85); text('√(1−ᾱ) = ' + Math.sqrt(1 - (t ? ab[t - 1] : 1)).toFixed(2) + '  noise', 620, 112)
  fill(0, 0, 60); text('std x: ' + Math.sqrt(sxx / M - mx * mx).toFixed(2), 620, 150); text('std y: ' + Math.sqrt(syy / M - my * my).toFixed(2), 620, 172)
  fill(0, 0, 45); textSize(13); text('the circle is 2 standard', 620, 230); text('deviations of N(0, 1)', 620, 248)
  // the coefficients over t
  const X0 = 600, X1 = 780, Y0 = 470, Y1 = 330
  stroke(0, 0, 40); line(X0, Y0, X1, Y0); line(X0, Y0, X0, Y1)
  noFill(); strokeWeight(2)
  stroke(45, 70, 100); beginShape(); for (let i = 0; i < T; i += 10) vertex(X0 + (X1 - X0) * i / T, Y0 - (Y0 - Y1) * Math.sqrt(ab[i])); endShape()
  stroke(12, 60, 85); beginShape(); for (let i = 0; i < T; i += 10) vertex(X0 + (X1 - X0) * i / T, Y0 - (Y0 - Y1) * Math.sqrt(1 - ab[i])); endShape()
  stroke(0, 0, 90, 60); strokeWeight(1); line(X0 + (X1 - X0) * t / T, Y0, X0 + (X1 - X0) * t / T, Y1)
}
` },
        { id: 'reverse-points', title: '1.3 · The reverse process, with an exact score', w: 800, h: 600, ground: '#141414',
          idea: 'The reverse process with a perfect network. The data is six Gaussian blobs on a ring, so p_t and its score at every noise level are formulas: a mixture of Gaussians that shrinks toward the center and widens as the noise grows. Points start as Gaussian noise and are moved by the DDIM / DDPM update using that score (arrows: the field at the current noise level). At high noise the field points toward the middle; as the noise falls the blobs separate. η = 0 is DDIM (smooth, deterministic paths); η = 1 is DDPM (fresh noise at every step). Fewer steps make coarser paths.',
          pseudo: `x ← Gaussian noise (many points)
for each step, from noisy to clean (ᾱ_now, ᾱ_next):
  ε̂ ← −√(1 − ᾱ_now) · score(x, ᾱ_now)            # exact, for this data
  x̂₀ ← (x − √(1 − ᾱ_now) · ε̂) / √ᾱ_now
  σ ← η · √((1−ᾱ_next)/(1−ᾱ_now)) · √(1 − ᾱ_now/ᾱ_next)
  x ← √ᾱ_next · x̂₀ + √(1 − ᾱ_next − σ²) · ε̂ + σ · noise`,
          p5: `// 1.3 The reverse process with the exact score of six Gaussian blobs (a perfect "network").
const steps = 40 /* 5..200 */
const eta = 0 /* 0..1 */
const field = 1 /* 0..1 */
const trails = 1 /* 0..1 */
const pace = 6 /* 1..20 */              // frames per step
const T = 1000, M = 1500, TR = 30, K = 6, R = 1.5, S0 = 0.16
const CX = 300, CY = 310, U = 95
const mu = [], ab = []
let x, path, j = 0, wait = 0, ts

function setup() {
  createCanvas(800, 600); randomSeed(5); noiseSeed(5)
  for (let i = 0; i < K; i++) mu.push([R * Math.cos(2 * Math.PI * i / K), R * Math.sin(2 * Math.PI * i / K)])
  let p = 1; for (let i = 0; i < T; i++) { p *= 1 - (1e-4 + (0.02 - 1e-4) * i / (T - 1)); ab.push(p) }
  target = []; for (let i = 0; i < 700; i++) { const m = mu[i % K]; target.push([m[0] + S0 * randomGaussian(), m[1] + S0 * randomGaussian()]) }
  restart()
}
let target

function restart() {
  ts = []; for (let i = 0; i < steps; i++) ts.push(Math.round((T - 1) * (1 - i / steps)))
  x = []; path = []; for (let i = 0; i < M; i++) x.push([randomGaussian(), randomGaussian()])
  for (let i = 0; i < TR; i++) path.push([x[i].slice()])
  j = 0; wait = 0
}

// score of the noised data at level abar: the data is a mixture of Gaussians, so the noised data is too
function score(px, py, a) {
  const v = a * S0 * S0 + (1 - a), s = Math.sqrt(a)
  let z = 0, sx = 0, sy = 0
  const w = mu.map(m => { const d2 = (px - s * m[0]) ** 2 + (py - s * m[1]) ** 2; return -d2 / (2 * v) })
  const top = Math.max(...w)
  for (let i = 0; i < K; i++) { const r = Math.exp(w[i] - top); z += r; sx += r * (s * mu[i][0] - px) / v; sy += r * (s * mu[i][1] - py) / v }
  return [sx / z, sy / z]
}

function advance() {                                 // one DDIM / DDPM step for every point
  const a = ab[ts[j]], b = j + 1 < steps ? ab[ts[j + 1]] : 1
  const sig = eta * Math.sqrt((1 - b) / (1 - a)) * Math.sqrt(Math.max(0, 1 - a / b))
  for (let i = 0; i < M; i++) {
    const [sx, sy] = score(x[i][0], x[i][1], a)
    const ex = -Math.sqrt(1 - a) * sx, ey = -Math.sqrt(1 - a) * sy                  // the noise the network would predict
    const x0x = (x[i][0] - Math.sqrt(1 - a) * ex) / Math.sqrt(a), x0y = (x[i][1] - Math.sqrt(1 - a) * ey) / Math.sqrt(a)
    const c = Math.sqrt(Math.max(0, 1 - b - sig * sig))
    x[i][0] = Math.sqrt(b) * x0x + c * ex + sig * randomGaussian(); x[i][1] = Math.sqrt(b) * x0y + c * ey + sig * randomGaussian()
    if (i < TR) path[i].push(x[i].slice())
  }
  j++
}

function draw() {
  background(20)
  if (frameCount % pace === 0) { if (j < steps) advance(); else if (++wait > 12) restart() }
  const a = j < steps ? ab[ts[j]] : 1
  stroke(60); strokeWeight(1); noFill(); circle(CX, CY, 2 * R * U)
  noStroke(); fill(90); for (const p of target) circle(CX + U * p[0], CY - U * p[1], 3)      // the data
  if (field >= 0.5 && j < steps) {                                                          // the score field now
    stroke(90, 130, 200); strokeWeight(1.3)
    for (let gx = -3; gx <= 3.01; gx += 0.4) for (let gy = -3; gy <= 3.01; gy += 0.4) {
      const [sx, sy] = score(gx, gy, a), m = Math.hypot(sx, sy); if (m < 1e-9) continue
      const L = 4 + 14 * Math.tanh(m * 0.5), ux = sx / m, uy = -sy / m, px = CX + U * gx, py = CY - U * gy
      line(px, py, px + ux * L, py + uy * L); line(px + ux * L, py + uy * L, px + ux * (L - 4) - uy * 2.5, py + uy * (L - 4) + ux * 2.5); line(px + ux * L, py + uy * L, px + ux * (L - 4) + uy * 2.5, py + uy * (L - 4) - ux * 2.5)
    }
  }
  if (trails >= 0.5) { noFill(); stroke(242, 193, 78, 90); strokeWeight(1); for (const pth of path) { beginShape(); for (const q of pth) vertex(CX + U * q[0], CY - U * q[1]); endShape() } }
  noStroke(); fill(242, 193, 78, 200); for (const p of x) circle(CX + U * p[0], CY - U * p[1], 3)
  fill(180); textSize(15); textAlign(LEFT)
  text('step ' + Math.min(j, steps) + ' of ' + steps, 610, 60)
  text('t = ' + (j < steps ? ts[j] : 0) + ' of ' + T, 610, 84)
  text('ᾱ = ' + a.toFixed(3), 610, 108)
  text(eta === 0 ? 'DDIM (η = 0)' : eta === 1 ? 'DDPM (η = 1)' : 'η = ' + eta, 610, 140)
  fill(120); textSize(13); text('gold: samples', 610, 190); text('gray: the data', 610, 210); text('blue: the score', 610, 230); text('lines: 30 paths', 610, 250)
}
` },
        { id: 'sample-image', title: '1.4 · Sampling a picture', w: 800, h: 600, ground: '#141414',
          idea: 'Sampling pictures with a denoiser that knows exactly three: a sunrise, a moon over the sea and a tree. The ideal denoiser’s guess x̂₀ is a weighted average of the three, with weights given by how well each explains the current x_t. At first all three are equally plausible and x̂₀ is their blurry average; at some noise level the noise in x_t happens to favor one, the weights snap to it, and the picture commits: which one depends only on the noise it started from (the seed). A trained network does not memorize like this, but it has the same job: guess the clean picture from the noisy one, more exactly as the noise falls.',
          pseudo: `x ← Gaussian noise (one number per pixel and color)
for each step, from noisy to clean:
  w[i] ← how well picture i explains x     (softmax of −‖x − √ᾱ · picture[i]‖² / (2(1 − ᾱ)))
  x̂₀ ← Σ w[i] · picture[i]                 # the best guess of the clean picture
  ε̂ ← (x − √ᾱ · x̂₀) / √(1 − ᾱ)
  x ← the DDIM step with ε̂`,
          p5: `// 1.4 Sampling a picture with an ideal denoiser that has "learned" three pictures (exact posterior mean).
const steps = 30 /* 5..100 */
const eta = 0 /* 0..1 */
const seed = 1 /* 1..99 */
const auto = 1 /* 0..1 */
const pace = 8 /* 1..30 */              // frames per step
const N = 24, D = N * N * 3, T = 1000, SNAPS = 8
const ab = []
let pics, x, x0hat, wts = [1 / 3, 1 / 3, 1 / 3], j = 0, wait = 0, ts, snaps = [], epoch = 0

function setup() {
  createCanvas(800, 600); pixelDensity(1)
  let p = 1; for (let i = 0; i < T; i++) { p *= 1 - (1e-4 + (0.02 - 1e-4) * i / (T - 1)); ab.push(p) }
  pics = [make(0), make(1), make(2)]
  restart()
}

function make(which) {                    // three pictures, colors in -1 .. 1
  const a = new Float32Array(D)
  for (let i = 0; i < N * N; i++) {
    const u = (i % N + 0.5) / N, v = (Math.floor(i / N) + 0.5) / N
    let c
    if (which === 0) {                                             // sunrise over hills
      if (Math.hypot(u - 0.66, v - 0.4) < 0.17) c = [250, 214, 120]
      else if (v > 0.72 - 0.08 * Math.sin(u * 7)) c = [48, 84, 66]
      else c = [60 + 150 * v, 70 + 90 * v, 130 - 20 * v]
    } else if (which === 1) {                                      // a moon over the sea
      if (Math.hypot(u - 0.3, v - 0.28) < 0.12) c = [235, 235, 220]
      else if (v > 0.62) c = Math.abs(Math.sin((v - 0.62) * 60 + u * 3)) > 0.8 && Math.abs(u - 0.3) < 0.15 ? [200, 200, 190] : [20, 40 + 40 * (v - 0.62), 80 + 60 * (v - 0.62)]
      else c = [10, 14 + 30 * v, 40 + 50 * v]
    } else {                                                       // a tree
      const crown = Math.hypot(u - 0.5, v - 0.36) < 0.24, trunk = Math.abs(u - 0.5) < 0.05 && v > 0.5 && v < 0.85
      if (crown) c = [40, 130, 60]; else if (trunk) c = [110, 70, 40]; else if (v > 0.85) c = [110, 160, 70]; else c = [150 + 60 * v, 200, 240]
    }
    for (let k = 0; k < 3; k++) a[3 * i + k] = 2 * c[k] / 255 - 1
  }
  return a
}

function restart() {
  randomSeed(seed + epoch); ts = []
  for (let i = 0; i < steps; i++) ts.push(Math.round((T - 1) * (1 - i / steps)))
  x = new Float32Array(D); for (let i = 0; i < D; i++) x[i] = randomGaussian()
  x0hat = new Float32Array(D); j = 0; wait = 0; snaps = []
  denoise(ab[ts[0]])
}

function denoise(a) {                     // the best guess of the clean picture, given x at noise level a
  const s = Math.sqrt(a), v = 2 * (1 - a), lw = []
  for (const q of pics) { let d = 0; for (let i = 0; i < D; i++) { const e = x[i] - s * q[i]; d += e * e } lw.push(-d / v) }
  const top = Math.max(...lw), e = lw.map(l => Math.exp(l - top)), z = e[0] + e[1] + e[2]
  wts = e.map(w => w / z)
  for (let i = 0; i < D; i++) x0hat[i] = wts[0] * pics[0][i] + wts[1] * pics[1][i] + wts[2] * pics[2][i]
}

function advance() {                         // the DDIM (eta = 0) or DDPM step
  const a = ab[ts[j]], b = j + 1 < steps ? ab[ts[j + 1]] : 1
  const sig = eta * Math.sqrt((1 - b) / (1 - a)) * Math.sqrt(Math.max(0, 1 - a / b)), c = Math.sqrt(Math.max(0, 1 - b - sig * sig))
  for (let i = 0; i < D; i++) {
    const eps = (x[i] - Math.sqrt(a) * x0hat[i]) / Math.sqrt(1 - a)
    x[i] = Math.sqrt(b) * x0hat[i] + c * eps + sig * randomGaussian()
  }
  j++
  if (j < steps) denoise(ab[ts[j]]); else { x0hat.set(x) }
}

function paint(values, x0, y0, size) {
  const img = createImage(N, N); img.loadPixels()
  for (let i = 0; i < N * N; i++) { for (let c = 0; c < 3; c++) img.pixels[4 * i + c] = constrain((values[3 * i + c] + 1) / 2, 0, 1) * 255; img.pixels[4 * i + 3] = 255 }
  img.updatePixels(); noSmooth(); image(img, x0, y0, size, size)
}

function draw() {
  background(20)
  if (frameCount % pace === 0) {
    if (j < steps) { advance(); const at = Math.floor(j * SNAPS / steps), last = snaps.length ? snaps[snaps.length - 1].k : -1; if (at !== last && at <= SNAPS) snaps.push({ k: at, x: Float32Array.from(x), h: Float32Array.from(x0hat) }) }
    else if (auto >= 0.5 && ++wait > 12) { epoch++; restart() }
  }
  paint(x, 30, 50, 270); paint(x0hat, 330, 50, 270)
  noStroke(); fill(170); textSize(14); textAlign(CENTER)
  text('x_t · the noisy picture', 165, 342); text('x̂₀ · the denoiser’s guess', 465, 342)
  // which of the three pictures explains x_t
  textAlign(LEFT)
  for (let i = 0; i < 3; i++) {
    paint(pics[i], 640, 50 + i * 95, 64)
    fill(90); rect(712, 62 + i * 95, 70, 12, 3); fill(242, 193, 78); rect(712, 62 + i * 95, 70 * wts[i], 12, 3)
    fill(150); textSize(12); text((wts[i] * 100).toFixed(0) + '%', 712, 96 + i * 95)
  }
  fill(120); textSize(12); text('weights', 640, 40)
  fill(190); textSize(15); text('step ' + j + ' of ' + steps + '   ·   t = ' + (j < steps ? ts[j] : 0) + '   ·   ᾱ = ' + (j < steps ? ab[ts[j]] : 1).toFixed(3) + '   ·   seed ' + (seed + epoch), 30, 372)
  // the film strip
  for (let k = 0; k < snaps.length; k++) { paint(snaps[k].x, 30 + k * 96, 400, 88); paint(snaps[k].h, 30 + k * 96, 496, 88) }
  fill(120); textSize(12); text('x_t', 12, 448); text('x̂₀', 8, 544)
}
` },
        { id: 'guidance', title: '1.5 · Guidance', w: 800, h: 600, ground: '#141414',
          idea: 'Classifier-free guidance, on the ring of six blobs again. Three of them (gold) belong to the class we ask for, three (blue) to the other. The unconditional score knows all six; the conditional one only the asked class. Guidance w mixes them: score = s_uncond + w · (s_cond − s_uncond). w = 0 ignores the class (half the samples land in it), w = 1 is the plain conditional model (all in the class, the three blobs equally), and w > 1 pushes further away from the unconditional answer: the samples crowd into the blob that is farthest from the other class, the same trade as in real models, more typical pictures for less variety, and a large w overshoots the blob. Try w = 1, 3, 8 and watch the share of the biggest blob. (Readout: the share in the asked class and the share of the biggest blob.)',
          pseudo: `for each step, from noisy to clean:
  s_u ← the score of all the data, at x
  s_c ← the score of the asked class only, at x
  s ← s_u + w · (s_c − s_u)                       # guidance
  ε̂ ← −√(1 − ᾱ) · s
  x ← the DDIM step with ε̂`,
          p5: `// 1.5 Classifier-free guidance with exact scores: six blobs, three per class; we ask for the gold class.
const w = 3 /* 0..10 */
const steps = 40 /* 5..200 */
const eta = 0 /* 0..1 */
const pace = 6 /* 1..20 */              // frames per step
const T = 1000, M = 1500, K = 6, R = 1.5, S0 = 0.16
const CX = 300, CY = 310, U = 95
const mu = [], ab = []
let x, j = 0, wait = 0, ts, stat = null, target

function setup() {
  createCanvas(800, 600); randomSeed(5)
  for (let i = 0; i < K; i++) mu.push([R * Math.cos(2 * Math.PI * i / K + 0.3), R * Math.sin(2 * Math.PI * i / K + 0.3)])
  let p = 1; for (let i = 0; i < T; i++) { p *= 1 - (1e-4 + (0.02 - 1e-4) * i / (T - 1)); ab.push(p) }
  target = []; for (let i = 0; i < 700; i++) { const m = mu[i % K]; target.push([m[0] + S0 * randomGaussian(), m[1] + S0 * randomGaussian(), (i % K) < 3]) }
  restart()
}

function restart() {
  ts = []; for (let i = 0; i < steps; i++) ts.push(Math.round((T - 1) * (1 - i / steps)))
  x = []; for (let i = 0; i < M; i++) x.push([randomGaussian(), randomGaussian()])
  j = 0; wait = 0; stat = null
}

function mixScore(px, py, a, ids) {          // score of the noised data made of the blobs in ids
  const v = a * S0 * S0 + (1 - a), s = Math.sqrt(a)
  const lw = ids.map(i => -((px - s * mu[i][0]) ** 2 + (py - s * mu[i][1]) ** 2) / (2 * v)), top = Math.max(...lw)
  let z = 0, sx = 0, sy = 0
  ids.forEach((i, n) => { const r = Math.exp(lw[n] - top); z += r; sx += r * (s * mu[i][0] - px) / v; sy += r * (s * mu[i][1] - py) / v })
  return [sx / z, sy / z]
}

function advance() {
  const a = ab[ts[j]], b = j + 1 < steps ? ab[ts[j + 1]] : 1
  const sig = eta * Math.sqrt((1 - b) / (1 - a)) * Math.sqrt(Math.max(0, 1 - a / b)), c = Math.sqrt(Math.max(0, 1 - b - sig * sig))
  for (const p of x) {
    const su = mixScore(p[0], p[1], a, [0, 1, 2, 3, 4, 5]), sc = mixScore(p[0], p[1], a, [0, 1, 2])
    const sx = su[0] + w * (sc[0] - su[0]), sy = su[1] + w * (sc[1] - su[1])          // guided score
    const ex = -Math.sqrt(1 - a) * sx, ey = -Math.sqrt(1 - a) * sy
    const x0x = (p[0] - Math.sqrt(1 - a) * ex) / Math.sqrt(a), x0y = (p[1] - Math.sqrt(1 - a) * ey) / Math.sqrt(a)
    p[0] = Math.sqrt(b) * x0x + c * ex + sig * randomGaussian(); p[1] = Math.sqrt(b) * x0y + c * ey + sig * randomGaussian()
  }
  j++
  if (j === steps) {                                                                   // how did it go?
    const count = [0, 0, 0, 0, 0, 0]
    for (const p of x) { let bi = 0, bd = 1e9; mu.forEach((m, i) => { const d = Math.hypot(p[0] - m[0], p[1] - m[1]); if (d < bd) { bd = d; bi = i } }); count[bi]++ }
    stat = { share: (count[0] + count[1] + count[2]) / M, top: Math.max(...count) / M }
  }
}

function draw() {
  background(20)
  if (frameCount % pace === 0) { if (j < steps) advance(); else if (++wait > 24) restart() }
  stroke(60); strokeWeight(1); noFill(); circle(CX, CY, 2 * R * U)
  noStroke(); for (const p of target) { if (p[2]) fill(242, 193, 78, 70); else fill(91, 127, 209, 70); circle(CX + U * p[0], CY - U * p[1], 3) }
  for (const p of x) { let bi = 0, bd = 1e9; mu.forEach((m, i) => { const d = Math.hypot(p[0] - m[0], p[1] - m[1]); if (d < bd) { bd = d; bi = i } }); if (bi < 3) fill(255, 220, 120); else fill(130, 170, 255); circle(CX + U * p[0], CY - U * p[1], 3.5) }
  fill(180); textSize(15); textAlign(LEFT)
  text('guidance w = ' + w.toFixed(1), 610, 60)
  text('step ' + Math.min(j, steps) + ' of ' + steps, 610, 84)
  fill(120); textSize(13); text('faint: the data', 610, 130); text('gold: the class we ask for', 610, 150); text('blue: the other class', 610, 170)
  if (stat) { fill(230); textSize(15); text('in the asked class: ' + (100 * stat.share).toFixed(0) + '%', 610, 240); text('the biggest blob: ' + (100 * stat.top).toFixed(0) + '%', 610, 264); fill(120); textSize(12); text('(the data: 17% each)', 610, 286) }
}
` }
      ]
    }
  ],
  bibliography: [
    { title: 'Origins: noise and scores', items: [
      ['Jascha Sohl-Dickstein, Eric A. Weiss, Niru Maheswaranathan, Surya Ganguli (2015). Deep unsupervised learning using nonequilibrium thermodynamics. *ICML*. The first diffusion model.', 'https://arxiv.org/abs/1503.03585'],
      ['Pascal Vincent (2011). A connection between score matching and denoising autoencoders. *Neural Computation* 23(7), 1661–1674. Why denoising learns the score.', 'https://doi.org/10.1162/NECO_a_00142'],
      ['Aapo Hyvärinen (2005). Estimation of non-normalized statistical models by score matching. *JMLR* 6, 695–709.', 'https://jmlr.org/papers/v6/hyvarinen05a.html'],
      ['Yang Song, Stefano Ermon (2019). Generative modeling by estimating gradients of the data distribution. *NeurIPS*. Score matching at several noise levels, sampled with Langevin dynamics.', 'https://arxiv.org/abs/1907.05600'],
      ['Brian D. O. Anderson (1982). Reverse-time diffusion equation models. *Stochastic Processes and their Applications* 12(3), 313–326. Why the reverse of a diffusion is a diffusion.', 'https://doi.org/10.1016/0304-4149(82)90051-5']
    ] },
    { title: 'Diffusion models', items: [
      ['Jonathan Ho, Ajay Jain, Pieter Abbeel (2020). Denoising diffusion probabilistic models. *NeurIPS*. DDPM: predicting the noise, and pictures that rival GANs.', 'https://arxiv.org/abs/2006.11239'],
      ['Jiaming Song, Chenlin Meng, Stefano Ermon (2021). Denoising diffusion implicit models. *ICLR*. DDIM: deterministic sampling in few steps.', 'https://arxiv.org/abs/2010.02502'],
      ['Yang Song, Jascha Sohl-Dickstein, Diederik P. Kingma, Abhishek Kumar, Stefano Ermon, Ben Poole (2021). Score-based generative modeling through stochastic differential equations. *ICLR*. The two views, one framework.', 'https://arxiv.org/abs/2011.13456'],
      ['Alex Nichol, Prafulla Dhariwal (2021). Improved denoising diffusion probabilistic models. *ICML*. The cosine schedule, learned variances.', 'https://arxiv.org/abs/2102.09672'],
      ['Tero Karras, Miika Aittala, Timo Aila, Samuli Laine (2022). Elucidating the design space of diffusion-based generative models. *NeurIPS*. The choices, separated and tuned.', 'https://arxiv.org/abs/2206.00364']
    ] },
    { title: 'Images, text, architecture', page: 1, items: [
      ['Olaf Ronneberger, Philipp Fischer, Thomas Brox (2015). U-Net: convolutional networks for biomedical image segmentation. *MICCAI*. The network most diffusion models used.', 'https://arxiv.org/abs/1505.04597'],
      ['Diederik P. Kingma, Max Welling (2014). Auto-encoding variational Bayes. *ICLR*. The autoencoder family behind the latent space.', 'https://arxiv.org/abs/1312.6114'],
      ['Prafulla Dhariwal, Alex Nichol (2021). Diffusion models beat GANs on image synthesis. *NeurIPS*. Classifier guidance.', 'https://arxiv.org/abs/2105.05233'],
      ['Jonathan Ho, Tim Salimans (2022). Classifier-free diffusion guidance. *NeurIPS 2021 Workshop on Deep Generative Models and Downstream Applications*.', 'https://arxiv.org/abs/2207.12598'],
      ['Alec Radford, Jong Wook Kim, et al. (2021). Learning transferable visual models from natural language supervision. *ICML*. CLIP.', 'https://arxiv.org/abs/2103.00020'],
      ['Robin Rombach, Andreas Blattmann, Dominik Lorenz, Patrick Esser, Björn Ommer (2022). High-resolution image synthesis with latent diffusion models. *CVPR*. Stable Diffusion.', 'https://arxiv.org/abs/2112.10752'],
      ['William Peebles, Saining Xie (2023). Scalable diffusion models with transformers. *ICCV*. DiT: a transformer instead of the U-Net.', 'https://arxiv.org/abs/2212.09748']
    ] },
    { title: 'Reading', page: 1, width: 500, items: [
      ['Calvin Luo (2022). Understanding diffusion models: a unified perspective. A long derivation, step by step.', 'https://arxiv.org/abs/2208.11970'],
      ['Lilian Weng (2021). What are diffusion models? A blog post.', 'https://lilianweng.github.io/posts/2021-07-11-diffusion-models/'],
      ['Yang Song (2021). Generative modeling by estimating gradients of the data distribution. A blog post on the score view.', 'https://yang-song.net/blog/2021/score/']
    ] }
  ]
};
