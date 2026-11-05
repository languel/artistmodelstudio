import { describe, it, expect } from 'vitest';
import { parseReply, repairJson } from './assistant.js';

// Replies as LFM3 wrote them: the content right, the closing brackets not.
const RAW = {
  extra: '{"say":"A blue square.","actions":[{"tool":"ams_add","args":{"shape":"rect","box":[60,420,240,600],"fill":"#0000ff","repeat":{"count":1}}],"done":true}}',
  missing: '{"say":"Red fill.","actions":[{"tool":"ams_update","args":{"id":"el_x","patch":{"fill":"#ff0000"}}],"done":true}',
  missing2: '{"say":"Set to 60%.","actions":[{"tool":"ams_update","args":{"id":"el_x","patch":{"opacity":0.6}}],"done":true}',
  ok: '{"say":"Hatched.","actions":[{"tool":"ams_update","args":{"id":"el_x","patch":{"realize":{"brush":"hatch","params":{"cross":1}}}}}],"done":true}',
  trailing: '{"say":"Scene.","actions":[{"tool":"ams_vocabulary","args":{"principles":"a\\nb"}},"done":false}}'
};

describe('reading a reply whose brackets are miscounted', () => {
  it('repairs a missing and an extra closing brace', () => {
    const a = parseReply(RAW.extra);
    expect(a.say).toBe('A blue square.');
    expect(a.actions).toHaveLength(1);
    expect(a.actions[0].args.repeat).toEqual({ count: 1 });
    const b = parseReply(RAW.missing);
    expect(b.actions[0].args.patch).toEqual({ fill: '#ff0000' });
    expect(b.done).toBe(true);
    expect(parseReply(RAW.missing2).actions[0].args.patch).toEqual({ opacity: 0.6 });
  });
  it('leaves a good reply alone', () => {
    const r = parseReply(RAW.ok);
    expect(r.repaired).toBeUndefined();
    expect(r.actions[0].args.patch.realize.params).toEqual({ cross: 1 });
  });
  it('closes what is open at the end and ignores what follows the object', () => {
    expect(JSON.parse(repairJson('{"a":[1,2,{"b":3'))).toEqual({ a: [1, 2, { b: 3 }] });
    expect(JSON.parse(repairJson('{"a":1} trailing }}'))).toEqual({ a: 1 });
    expect(repairJson('no object here')).toBe(null);
  });
  it('does not take a bracket inside a string for structure', () => {
    expect(JSON.parse(repairJson('{"say":"use } and ] freely","actions":[]'))).toEqual({ say: 'use } and ] freely', actions: [] });
  });
});
