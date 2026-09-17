/**
 * Bidirectional translator between Authoritative JSON DrawingProgram
 * and human-readable text DSL.
 */

export function programToText(program) {
  if (!program || !Array.isArray(program.actions)) return '';

  const lines = [];

  for (const act of program.actions) {
    if (!act || !act.op) continue;

    switch (act.op) {
      case 'background':
        lines.push(`background ${act.color || '#ffffff'}`);
        break;

      case 'clear':
        lines.push(act.color ? `clear ${act.color}` : 'clear');
        break;

      case 'fill':
        if (act.opacity !== undefined && act.opacity !== 1) {
          lines.push(`fill ${act.color || '#000000'} ${act.opacity}`);
        } else {
          lines.push(`fill ${act.color || '#000000'}`);
        }
        break;

      case 'noFill':
        lines.push('noFill');
        break;

      case 'stroke':
        if (act.width !== undefined) {
          lines.push(`stroke ${act.color || '#000000'} ${act.width}`);
        } else {
          lines.push(`stroke ${act.color || '#000000'}`);
        }
        break;

      case 'noStroke':
        lines.push('noStroke');
        break;

      case 'strokeWidth':
        lines.push(`strokeWidth ${act.width ?? 1}`);
        break;

      case 'circle':
        lines.push(`circle ${formatNum(act.x)} ${formatNum(act.y)} ${formatNum(act.diameter)}`);
        break;

      case 'rect':
        lines.push(`rect ${formatNum(act.x)} ${formatNum(act.y)} ${formatNum(act.width)} ${formatNum(act.height)}${act.color ? ' ' + act.color : ''}`);
        break;

      case 'line':
        lines.push(`line ${formatNum(act.x1)} ${formatNum(act.y1)} ${formatNum(act.x2)} ${formatNum(act.y2)}`);
        break;

      case 'polygon':
        if (Array.isArray(act.points)) {
          const ptsStr = act.points.map(p => `${formatNum(p[0])},${formatNum(p[1])}`).join(' ');
          lines.push(`polygon ${ptsStr}`);
        }
        break;

      case 'polyline':
        if (Array.isArray(act.points)) {
          const ptsStr = act.points.map(p => `${formatNum(p[0])},${formatNum(p[1])}`).join(' ');
          lines.push(`polyline ${ptsStr}`);
        }
        break;

      case 'brush.bleed':
        lines.push(`bleed ${formatNum(act.amount ?? 0.25)}`);
        break;

      case 'brush.texture':
        lines.push(`texture ${formatNum(act.amount ?? 0.5)}`);
        break;

      case 'brush.hatch':
        lines.push(`hatch ${formatNum(act.distance ?? 10)} ${formatNum(act.angle ?? 45)}`);
        break;

      case 'brush.weight':
        lines.push(`brush.weight ${formatNum(act.width ?? 2)}`);
        break;

      case 'pixel':
        lines.push(`pixel ${Math.round(act.x ?? 0)} ${Math.round(act.y ?? 0)} ${act.color ?? 0}`);
        break;

      case 'hline':
        lines.push(`hline ${Math.round(act.y ?? 0)} ${Math.round(act.x1 ?? 0)} ${Math.round(act.x2 ?? 0)} ${act.color ?? 0}`);
        break;

      case 'vline':
        lines.push(`vline ${Math.round(act.x ?? 0)} ${Math.round(act.y1 ?? 0)} ${Math.round(act.y2 ?? 0)} ${act.color ?? 0}`);
        break;

      case 'palette':
        if (Array.isArray(act.colors)) {
          lines.push(`palette ${act.colors.join(' ')}`);
        }
        break;

      case 'mirrorX':
        lines.push(`mirrorX ${act.enabled ? 'on' : 'off'}`);
        break;

      case 'mirrorY':
        lines.push(`mirrorY ${act.enabled ? 'on' : 'off'}`);
        break;

      default:
        lines.push(`${act.op} ${JSON.stringify(act)}`);
        break;
    }
  }

  return lines.join('\n');
}

export function textToProgram(text) {
  if (!text || typeof text !== 'string') {
    return { version: 1, actions: [] };
  }

  const lines = text.split('\n');
  const actions = [];

  for (let rawLine of lines) {
    // Strip comments (# at start or //)
    let line = rawLine.trim();
    if (!line || line.startsWith('//') || (line.startsWith('#') && !line.startsWith('#background') && !line.startsWith('#fill'))) {
      if (line.startsWith('#') && !line.includes(' ')) continue; // comment
    }
    const tokens = line.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;

    const op = tokens[0].toLowerCase();

    switch (op) {
      case 'background':
        actions.push({ op: 'background', color: tokens[1] || '#ffffff' });
        break;

      case 'clear':
        actions.push({ op: 'clear', color: tokens[1] });
        break;

      case 'fill': {
        const act = { op: 'fill', color: tokens[1] || '#000000' };
        if (tokens[2] !== undefined) act.opacity = Number(tokens[2]);
        actions.push(act);
        break;
      }

      case 'nofill':
        actions.push({ op: 'noFill' });
        break;

      case 'stroke': {
        const act = { op: 'stroke', color: tokens[1] || '#000000' };
        if (tokens[2] !== undefined) act.width = Number(tokens[2]);
        actions.push(act);
        break;
      }

      case 'nostroke':
        actions.push({ op: 'noStroke' });
        break;

      case 'strokewidth':
        actions.push({ op: 'strokeWidth', width: Number(tokens[1] || 1) });
        break;

      case 'circle':
        actions.push({
          op: 'circle',
          x: Number(tokens[1] || 0),
          y: Number(tokens[2] || 0),
          diameter: Number(tokens[3] || 0.2)
        });
        break;

      case 'rect':
        actions.push({
          op: 'rect',
          x: Number(tokens[1] || 0),
          y: Number(tokens[2] || 0),
          width: Number(tokens[3] || 0.2),
          height: Number(tokens[4] || 0.2),
          color: tokens[5]
        });
        break;

      case 'line':
        actions.push({
          op: 'line',
          x1: Number(tokens[1] || 0),
          y1: Number(tokens[2] || 0),
          x2: Number(tokens[3] || 0),
          y2: Number(tokens[4] || 0)
        });
        break;

      case 'polygon':
      case 'polyline': {
        const points = [];
        for (let i = 1; i < tokens.length; i++) {
          const pair = tokens[i].split(',');
          if (pair.length === 2) {
            points.push([Number(pair[0]), Number(pair[1])]);
          }
        }
        actions.push({ op, points });
        break;
      }

      case 'bleed':
      case 'brush.bleed':
        actions.push({ op: 'brush.bleed', amount: Number(tokens[1] || 0.25) });
        break;

      case 'texture':
      case 'brush.texture':
        actions.push({ op: 'brush.texture', amount: Number(tokens[1] || 0.5) });
        break;

      case 'hatch':
      case 'brush.hatch':
        actions.push({
          op: 'brush.hatch',
          distance: Number(tokens[1] || 10),
          angle: Number(tokens[2] || 45)
        });
        break;

      case 'brush.weight':
        actions.push({ op: 'brush.weight', width: Number(tokens[1] || 2) });
        break;

      case 'pixel':
        actions.push({
          op: 'pixel',
          x: Number(tokens[1] || 0),
          y: Number(tokens[2] || 0),
          color: isNaN(tokens[3]) ? tokens[3] : Number(tokens[3])
        });
        break;

      case 'hline':
        actions.push({
          op: 'hline',
          y: Number(tokens[1] || 0),
          x1: Number(tokens[2] || 0),
          x2: Number(tokens[3] || 0),
          color: isNaN(tokens[4]) ? tokens[4] : Number(tokens[4])
        });
        break;

      case 'vline':
        actions.push({
          op: 'vline',
          x: Number(tokens[1] || 0),
          y1: Number(tokens[2] || 0),
          y2: Number(tokens[3] || 0),
          color: isNaN(tokens[4]) ? tokens[4] : Number(tokens[4])
        });
        break;

      case 'palette':
        actions.push({ op: 'palette', colors: tokens.slice(1) });
        break;

      case 'mirrorx':
        actions.push({ op: 'mirrorX', enabled: tokens[1] !== 'off' });
        break;

      case 'mirrory':
        actions.push({ op: 'mirrorY', enabled: tokens[1] !== 'off' });
        break;

      default:
        // Try parsing JSON if token is JSON object
        if (line.startsWith('{')) {
          try {
            const parsed = JSON.parse(line);
            actions.push(parsed);
          } catch (e) {
            // ignore malformed comment/line
          }
        }
        break;
    }
  }

  return {
    version: 1,
    actions
  };
}

function formatNum(val) {
  if (val === undefined || val === null || isNaN(val)) return '0';
  const n = Number(val);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000);
}
