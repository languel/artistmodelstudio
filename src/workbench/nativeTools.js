/**
 * The quick field's tools, in the form a model with native tool calling takes them: a name, a plain description, a small JSON schema.
 * (A model that must write JSON by hand gets the same things from `flowPrompt`; this is for engines that call tools themselves.)
 * `execute` goes through the real tools (`window.ams.callTool`), so it is the same action, the same undo step, the same request log.
 */
const num = d => ({ type: 'number', description: d });
const arr = (d, items = { type: 'number' }) => ({ type: 'array', items, description: d });
const str = d => ({ type: 'string', description: d });

export const NATIVE_TOOLS = [
  { name: 'ams_add', description: 'Draw a new mark. A circle or rectangle: shape and box [x0, y0, x1, y1] (page units, the page is 1000 by 1000). A line: role "line" and points [[x, y], [x, y], …]. A dot: role "point" and points [[x, y]]. Copies in a row or column: repeat {count, dx, dy}.',
    parameters: { type: 'object', properties: { shape: { type: 'string', enum: ['circle', 'rect'] }, box: arr('[x0, y0, x1, y1]'), role: { type: 'string', enum: ['point', 'line', 'plane'] }, points: arr('[[x, y], …]', { type: 'array', items: { type: 'number' } }), fill: str('#rrggbb'), color: str('outline #rrggbb'), repeat: { type: 'object', properties: { count: num('how many'), dx: num('step right'), dy: num('step down') } } } } },
  { name: 'ams_update', description: 'Change marks. id: a mark id from the lists, or a word: selected, all, circle, square, line, point, or a color like red. patch holds only what changes: fill, color (the outline), opacity (0 to 1), label, strokeWidth, realize {brush: "hatch" | "stipple" | "flat"}.',
    parameters: { type: 'object', properties: { id: str('mark id, or selected / all / circle / square / line / point / a color'), patch: { type: 'object', properties: { fill: str('#rrggbb'), color: str('outline #rrggbb'), opacity: num('0 to 1'), label: str('name'), strokeWidth: num('outline width'), realize: { type: 'object' } } } }, required: ['id', 'patch'] } },
  { name: 'ams_transform', description: 'Move, resize or turn marks. move [dx, dy] (x to the right, y down); scale (1 is the same size, 1.5 half again bigger, 2 double, 0.5 half); rotate in degrees.',
    parameters: { type: 'object', properties: { id: str('mark id, or selected / all'), move: arr('[dx, dy]'), scale: num('1 = same size'), rotate: num('degrees') } } },
  { name: 'ams_delete', description: 'Remove marks.', parameters: { type: 'object', properties: { id: str('mark id, or selected / all / circle / square') } } },
  { name: 'ams_command', description: 'Run a studio command on the selection: edit.duplicate, edit.group, edit.ungroup, edit.selectAll, view.frameSelection, view.fit.', parameters: { type: 'object', properties: { id: { type: 'string', enum: ['edit.duplicate', 'edit.group', 'edit.ungroup', 'edit.selectAll', 'view.frameSelection', 'view.fit'] } }, required: ['id'] } }
];

/** The system prompt for a tool-calling model: what is on the page, and the manner (no format to learn). */
export function nativePrompt(app) {
  const doc = app.store.doc, sel = [...app.canvas.selected];
  const line = e => `- ${e.id}: ${e.role === 'plane' ? (e.points.length > 6 ? 'circle' : e.points.length === 4 ? 'rectangle' : 'shape') : e.role}${e.label ? ` "${e.label}"` : ''}, fill ${e.fill || 'none'}, outline ${e.color || 'default'}, opacity ${e.opacity ?? 1}`;
  const chosen = doc.elements.filter(e => sel.includes(e.id)).slice(0, 12), page = doc.elements.slice(-12);
  return `You change a drawing in a drawing app, at once, by calling tools. Never ask a question: when something is unclear, choose the most sensible reading and do it. Undo is one key away. Colors are #rrggbb, chosen by you. After the tools, say what you did in a few words.
${chosen.length ? `Selected ("it" and "this" mean these):\n${chosen.map(line).join('\n')}` : `Nothing is selected.${page.length ? ` Marks on the page:\n${page.map(line).join('\n')}` : ' The page is empty.'}`}`;
}

/** The tools as { name, description, parameters, execute } for a model's chat(): each call goes through the real tool and reports. */
export function nativeToolset(app, { quiet = true, onCall = () => {} } = {}) {
  return NATIVE_TOOLS.map(t => ({
    ...t,
    execute: async args => {
      try { const out = await window.ams.callTool(t.name, args || {}, { quiet }); onCall({ tool: t.name, args: args || {}, out }); return out; }
      catch (err) { onCall({ tool: t.name, args: args || {}, error: err.message }); throw err; }
    }
  }));
}
