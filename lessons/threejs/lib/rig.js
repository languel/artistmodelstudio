// The shared stage for the depth lessons (04, 05): source -> pose + depth -> Fusion -> a metric three.js scene
// with the fused skeleton, the MediaPipe-only ghost and the room as a point cloud. A lesson adds its own objects
// to rig.scene and its own logic in rig.onFrame.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTracker } from './tracker.js';
import { createDepth } from './depth.js';
import { Body, J } from './body.js';
import { BodyView } from './bodyview.js';
import { Fusion } from './fusion.js';
import { bindSources } from './sources.js';

export function createRig({ stage, video, status, camBtn, clipSel }) {
  // ---- scene: metres, y up, the camera is the origin looking down -z ------------------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(devicePixelRatio); stage.prepend(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(getComputedStyle(document.body).backgroundColor);
  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 100); camera.position.set(2.2, 1, 1.5);
  const orbit = new OrbitControls(camera, renderer.domElement); orbit.target.set(0, 0, -3);
  const floor = new THREE.GridHelper(12, 24, 0x777777, 0x3a3a3a); scene.add(floor);
  // the real camera, drawn as a frustum at the origin
  const camGauge = new THREE.PerspectiveCamera(40, 4 / 3, 0.05, 1.2), camHelper = new THREE.CameraHelper(camGauge); scene.add(camHelper);

  const body = new Body(), fusion = new Fusion();
  const fused = new BodyView(body), ghost = new BodyView(body);   // fused skeleton, and the MediaPipe-only one for comparison
  fused.name = 'fused'; ghost.name = 'poseOnly'; scene.add(fused);
  // the ghost reuses BodyView's drawing but reads fusion.poseOnly: a stand-in Body that shares the frame
  ghost.body = Object.assign(Object.create(body), { c: fusion.poseOnly });
  ghost.joints.material = new THREE.MeshBasicMaterial({ color: 0x8a8f9a, transparent: true, opacity: 0.55 });
  ghost.bones.material = new THREE.LineBasicMaterial({ color: 0x8a8f9a, transparent: true, opacity: 0.5 });
  scene.add(ghost);

  // @key The room as a point cloud | One Points object; its positions are rewritten each time a new depth map arrives, its colours come from the video.
  const MAXP = 252 * 196;
  const cloud = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: 0.035, vertexColors: true, sizeAttenuation: true }));
  cloud.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
  cloud.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAXP * 3), 3));
  cloud.frustumCulled = false; scene.add(cloud);
  // @/key

  const resize = () => { const w = stage.clientWidth, h = stage.clientHeight; renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix(); rig.onResize?.(w, h); };
  const rig = { renderer, scene, camera, orbit, floor, body, fusion, fused, ghost, cloud, video, status,
    show: { cloud: true, fused: true, ghost: true },
    live: false, mirror: false, depth: null, depthMaps: 0, fps: 0, active: false, onFrame: null,
    render: null,       // a lesson can replace the final draw (for example with a bloom composer)
    onResize: null };
  new ResizeObserver(resize).observe(stage); resize();

  // ---- sources and models -----------------------------------------------------------------------------------
  let tracker = null, depthNet = null, t0 = 0, lastVT = -1, busy = false, framed = false, frames = 0, fpsT = performance.now();
  const sample = document.createElement('canvas'), sx = sample.getContext('2d', { willReadFrequently: true });
  async function load() {
    if (tracker && depthNet) return;
    status('loading pose and depth models…');
    [tracker, depthNet] = await Promise.all([createTracker({ pose: true, hands: false, face: false }), createDepth({ device: new URLSearchParams(location.search).get('device') || undefined })]);
  }
  bindSources({ video, camBtn, clipSel, load, status, onStart(m, name) {
    rig.mirror = body.mirror = m; body.reset(); rig.live = true; rig.depth = null; framed = false; t0 = performance.now();
    Object.assign(fusion, { Zhip: null, alpha: null, beta: null, floorY: null });
    body.aspect = video.videoWidth / video.videoHeight || 4 / 3;
    camGauge.fov = 2 * Math.atan(Math.tan(fusion.fov * Math.PI / 360) / body.aspect) * 180 / Math.PI; camGauge.aspect = body.aspect; camGauge.updateProjectionMatrix(); camHelper.update();
    status(name + ' · depth on ' + depthNet.device);
    rig.onStart?.(m, name);
  } });

  // rebuild the cloud from the newest depth map (not every frame: depth arrives a few times a second)
  function refreshCloud() {
    const depth = rig.depth; if (!depth || fusion.alpha == null) return;
    const pos = cloud.geometry.attributes.position.array, col = cloud.geometry.attributes.color.array;
    const n = fusion.cloud(depth, rig.mirror ? -1 : 1, pos, 1);
    if (sample.width !== depth.width) { sample.width = depth.width; sample.height = depth.height; }
    sx.drawImage(video, 0, 0, depth.width, depth.height); const px = sx.getImageData(0, 0, depth.width, depth.height).data;
    for (let i = 0; i < n; i++) { col[i * 3] = px[i * 4] / 255; col[i * 3 + 1] = px[i * 4 + 1] / 255; col[i * 3 + 2] = px[i * 4 + 2] / 255; }
    cloud.geometry.setDrawRange(0, n);
    cloud.geometry.attributes.position.needsUpdate = cloud.geometry.attributes.color.needsUpdate = true;
  }

  // ---- loop ----------------------------------------------------------------------------------------------------
  const v3 = new THREE.Vector3(); let fpsN = 0;
  // @key One frame | Pose every video frame, depth in the background; Fusion turns both into metres; then the lesson's own code runs.
  renderer.setAnimationLoop(now => {
    if (rig.live && video.readyState >= 2) {
      const vt = video.srcObject ? (now - t0) / 1000 : video.currentTime;
      if (video.srcObject || vt !== lastVT) { lastVT = vt; body.update(tracker.detect(video, vt)); fusion.update(body, rig.depth); frames++; rig.fresh = true; }
      if (!busy) { busy = true; depthNet.estimate(video).then(d => { rig.depth = d; rig.depthMaps++; if (body.present) { fusion.update(body, d); refreshCloud(); } }).catch(e => status('depth: ' + e.message)).finally(() => busy = false); }
    }
    rig.active = body.present && fusion.Zhip != null;
    fused.visible = rig.show.fused && rig.active; ghost.visible = rig.show.ghost && fused.visible; cloud.visible = rig.show.cloud;
    if (rig.active) {
      fused.update('camera'); ghost.update('camera');
      if (!framed) { orbit.target.copy(body.c[J.leftHip]).lerp(body.c[J.rightHip], 0.5); camera.position.copy(orbit.target).add(v3.set(2.4, 0.9, 2.2)); framed = true; }
      if (fusion.floorY != null) floor.position.y = fusion.floorY;
    }
    rig.onFrame?.(now, rig.fresh); rig.fresh = false;
    orbit.update(); rig.render ? rig.render() : renderer.render(scene, camera);
    if (now - fpsT > 1000) { rig.fps = frames; frames = 0; fpsT = now; }
  });
  // @/key
  return rig;
}
