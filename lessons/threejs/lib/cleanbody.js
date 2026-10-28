// The cleaned body, ready to use: a Body's raw joints run through the MotionCleaner (lesson 07) into stage metres.
// clean.w are THREE.Vector3 joints with the dancer's travel across the stage included; clean.view is a body-like object for BodyView.
import * as THREE from 'three';
import { MotionCleaner, PRESETS } from './motion.js';

export function createClean(body) {
  const motion = new MotionCleaner(), w = Array.from({ length: 33 }, () => new THREE.Vector3()), out = { w, vis: new Array(33).fill(0), root: { x: 0, y: 0, z: 0 }, planted: [false, false], floorY: null, offset: 0 };
  const view = Object.create(body); view.w = w; view.frame = { pose: Array.from({ length: 33 }, () => [0, 0, 0, 0]) };   // looks like a Body to BodyView and to the costume code
  let lastT = 0;
  return {
    motion, out, w, view, params: motion.params,
    preset(name) { Object.assign(motion.params, PRESETS[name]); },
    reset() { motion.reset(); lastT = 0; },
    recentre() { motion.recentre(); },
    // call once per frame; `fresh` is true when the tracker delivered a new pose this frame
    update(body, now, fresh, enabled = true) {
      if (!body.present) return null;
      const vis = body.frame.pose.map(l => l[3]);
      if (body.frame.t < lastT) motion.reset(); lastT = body.frame.t;                    // a recording looped
      if (enabled) motion.process({ w: body.w, p: body.p, vis }, now / 1000, out, fresh);
      else { body.w.forEach((p, i) => w[i].copy(p)); out.vis = vis.map(v => v >= 0.5 ? 1 : 0); out.root = { x: 0, y: 0, z: 0 }; out.planted = [false, false]; }
      view.frame.pose.forEach((l, i) => l[3] = out.vis[i] ? 1 : 0);
      return out;
    },
  };
}
