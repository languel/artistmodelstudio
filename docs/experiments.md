# Experimental Matrix & Research Questions

The core objective of **Artist–Model Studio** is to make the generative art matrix observable and controllable:

```text
                           MODEL
                     Small (~0.5B)     Larger (~2B+)
                  ┌─────────────────┬─────────────────┐
  Flat Canvas     │ Pure geometry   │ Richer semantic │
                  │ from simple LM  │ composition     │
                  ├─────────────────┼─────────────────┤
M Watercolor      │ Aesthetic lift  │ Subtle washes & │
E                 │ from renderer   │ spatial nuance  │
D                 ├─────────────────┼─────────────────┤
I Pixel           │ Discrete grid   │ Complex sprite  │
A                 │ constraints     │ detailing       │
                  └─────────────────┴─────────────────┘
```

---

## 1. The Four Core Experimental Questions

### Experiment 1: Renderer Aesthetic Contribution (Ablation)
- **Protocol**: Generate a drawing program in the core DSL using an LLM. Render using Flat Canvas, then Watercolor.
- **Hypothesis**: Observers rate Watercolor significantly higher in artistic appeal, even though the model generated the exact same coordinates and geometry.

### Experiment 2: Action Space Constrained Intelligence
- **Protocol**: Provide the same prompt to the same model under Flat Canvas (normalized coordinates) vs Pixel (discrete integer grid).
- **Hypothesis**: The model exhibits different cognitive behaviors because the medium's system prompt alters the reasoning grammar.

### Experiment 3: Contextual Iteration vs. Weight Fine-Tuning
- **Protocol**: Compare the stylistic drift across 5 generations of contextual breeding against a model trained with LoRA weights.
- **Finding**: Breeding provides rapid local steering but remains bounded by base model distributions; LoRA shifts default stylistic priors.

### Experiment 4: Metric Optimization vs. Human Value (Reward Hacking)
- **Protocol**: Task an RL policy with optimizing composite score: `0.3 * redness + 0.3 * emptySpace + 0.4 * 3_shapes`.
- **Finding**: Without human critic constraints, policies discover microscopic dot exploits that achieve near 1.0 reward while defying aesthetic value.
