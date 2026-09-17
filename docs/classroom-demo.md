# Classroom Demonstration Guide (15–25 Minutes)

This pedagogical sequence is designed for creative-coding classrooms where students are already familiar with p5.js.

---

### Step A: Human Writes Code (2 mins)
1. Open the **Program Editor** on the right.
2. Select **Text DSL** mode.
3. Show basic creative-coding commands:
   ```text
   fill #ce526d 0.8
   circle -0.4 -0.2 0.4
   ```
4. Click **Re-render**; watch the canvas update immediately without calling any AI model.
5. *Lesson*: Programs are understandable geometric descriptions, not opaque matrices of pixels.

---

### Step B: Model Writes the Same Language (3 mins)
1. In the Prompt bar, enter:
   `"three red flowers bending toward the left"`
2. Click **Generate 4**.
3. Observe the four candidates (A, B, C, D) render in the grid.
4. *Lesson*: The model produces the same structured language that students just wrote.

---

### Step C: Change Medium, Not Intelligence (4 mins)
1. Select Candidate B.
2. Click **Compare Media (Ablation)**.
3. Observe the exact same program rendered in:
   - **Flat Canvas** (clean geometric 2D)
   - **Watercolor** (pigment bleed, organic paper grain, wash layering)
4. *Classroom Discussion*:
   > *"How much of the perceived aesthetic character came from the model, and how much came from the medium?"*

---

### Step D: Replace the Medium Entirely (4 mins)
1. In the Medium dropdown, switch to **Pixel**.
2. Click **Generate 4**.
3. Observe that the model's vocabulary and outputs immediately adapt to discrete pixel coordinates, integer lines, and symmetry (`mirrorX`).
4. *Lesson*: The medium defines the action space available to the artist.

---

### Step E: Human Preference Loop (4 mins)
1. Switch back to **Watercolor**.
2. Choose one candidate (e.g. Candidate C).
3. Click **Variations (Breed)**.
4. Watch 4 descendants generate with parent traits preserved and subtle mutations.
5. Click **Critique** and type: `"more empty space, redder"`.
6. *Lesson*: Explain that the model weights have NOT changed—this is *contextual iteration*, not training.

---

### Step F: Fine-Tuning & Datasets (3 mins)
1. Click the **DATASETS** tab.
2. Show the **SFT Dataset** and **Preference Dataset** (`.jsonl`).
3. Point out how human selections directly form training pairs (`chosen > rejected`).
4. *Lesson*: How human choices transition into training data for LoRA and DPO.

---

### Step G: Reinforcement Learning & Reward Hacking (5 mins)
1. Click **REWARD LAB**.
2. Point to the individual reward terms: `validity`, `redness`, `leftness`, `shape count`, `empty space`.
3. Click **Run 5 Episodes**; watch the mean reward curve climb.
4. Click **Reward-Hack Demo**; observe how the policy learns to generate 3 microscopic red dots to maximize score while violating human aesthetic expectations.
5. *Lesson*: Optimization of a metric ≠ True aesthetic intention.
