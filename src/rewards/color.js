/**
 * Color Score Metrics
 * Evaluates redness, blueness, greenness of a program.
 */

export function computeColorScores(program) {
  if (!program?.actions?.length) {
    return { redness: 0, blueness: 0, greenness: 0, colorCount: 0 };
  }

  let redWeight = 0;
  let blueWeight = 0;
  let greenWeight = 0;
  let totalColors = 0;
  const uniqueColors = new Set();

  for (const act of program.actions) {
    if (act.color && typeof act.color === 'string') {
      const hex = act.color.replace('#', '');
      if (hex.length === 6) {
        const r = parseInt(hex.slice(0, 2), 16) / 255;
        const g = parseInt(hex.slice(2, 4), 16) / 255;
        const b = parseInt(hex.slice(4, 6), 16) / 255;

        // Redness is high when r > g and r > b
        const redDominance = Math.max(0, r - (g + b) * 0.5);
        const blueDominance = Math.max(0, b - (r + g) * 0.5);
        const greenDominance = Math.max(0, g - (r + b) * 0.5);

        redWeight += (r > 0.5 ? r : 0) + redDominance;
        blueWeight += (b > 0.5 ? b : 0) + blueDominance;
        greenWeight += (g > 0.5 ? g : 0) + greenDominance;

        totalColors++;
        uniqueColors.add(act.color.toLowerCase());
      }
    }
  }

  if (totalColors === 0) {
    return { redness: 0, blueness: 0, greenness: 0, colorCount: 0 };
  }

  return {
    redness: Math.min(1.0, Number((redWeight / totalColors).toFixed(3))),
    blueness: Math.min(1.0, Number((blueWeight / totalColors).toFixed(3))),
    greenness: Math.min(1.0, Number((greenWeight / totalColors).toFixed(3))),
    colorCount: uniqueColors.size
  };
}
