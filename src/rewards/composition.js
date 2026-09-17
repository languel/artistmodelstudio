/**
 * Composition and Spatial Metrics
 */

export function computeCompositionScores(program, targetShapeCount = 3) {
  if (!program?.actions?.length) {
    return {
      leftness: 0.5,
      centeredness: 0,
      symmetry: 1,
      shapeCountScore: 0,
      shapeCount: 0,
      emptySpace: 1.0
    };
  }

  const shapeOps = new Set(['circle', 'rect', 'line', 'polygon', 'polyline', 'pixel']);
  let totalX = 0;
  let shapeCount = 0;
  let totalArea = 0;
  let leftShapes = 0;
  let rightShapes = 0;

  for (const act of program.actions) {
    if (shapeOps.has(act.op)) {
      shapeCount++;
      let x = 0;
      let area = 0.05;

      if (act.op === 'circle') {
        x = act.x ?? 0;
        const r = (act.diameter ?? 0.2) * 0.5;
        area = Math.PI * r * r;
      } else if (act.op === 'rect') {
        x = act.x ?? 0;
        area = (act.width ?? 0.2) * (act.height ?? 0.2);
      } else if (act.op === 'line') {
        x = ((act.x1 ?? 0) + (act.x2 ?? 0)) * 0.5;
        area = 0.02;
      } else if (act.op === 'polygon' && Array.isArray(act.points)) {
        x = act.points.reduce((sum, p) => sum + (p[0] || 0), 0) / Math.max(1, act.points.length);
        area = 0.08;
      }

      totalX += x;
      totalArea += area;

      if (x < -0.05) leftShapes++;
      else if (x > 0.05) rightShapes++;
    }
  }

  if (shapeCount === 0) {
    return {
      leftness: 0.5,
      centeredness: 0,
      symmetry: 1,
      shapeCountScore: 0,
      shapeCount: 0,
      emptySpace: 1.0
    };
  }

  const avgX = totalX / shapeCount;
  // Map x from [-1, 1] to leftness: -1 -> 1.0, 0 -> 0.5, 1 -> 0.0
  const leftness = Math.max(0, Math.min(1.0, Number(((-avgX + 1) * 0.5).toFixed(3))));

  // Centeredness: 1.0 if avgX is 0, drops as avgX moves away
  const centeredness = Math.max(0, Math.min(1.0, Number((1 - Math.abs(avgX)).toFixed(3))));

  // Symmetry: 1 - |left - right| / total
  const diff = Math.abs(leftShapes - rightShapes);
  const symmetry = Number((1 - diff / shapeCount).toFixed(3));

  // Shape count matching: Gaussian or inverted distance
  const shapeDist = Math.abs(shapeCount - targetShapeCount);
  const shapeCountScore = Math.max(0, Number((1 - shapeDist * 0.25).toFixed(3)));

  // Canvas normalized area is 2 * 2 = 4 (for [-1, 1] bounds)
  const coverageRatio = Math.min(1.0, totalArea / 4.0);
  const emptySpace = Number((1.0 - coverageRatio).toFixed(3));

  return {
    leftness,
    centeredness,
    symmetry,
    shapeCountScore,
    shapeCount,
    emptySpace
  };
}
