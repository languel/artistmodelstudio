// The whole program: a scene, a camera, a renderer and one mesh.
import * as THREE from 'three';

// @key Scene and camera | The scene holds what exists; the camera says where we look from and how wide.
const scene = new THREE.Scene();
// PerspectiveCamera(field of view in degrees, aspect ratio, near plane, far plane)
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 100);
camera.position.z = 3;            // step back from the origin so the cube is in view
// @/key

// @key Renderer | Draws the scene, seen through the camera, onto a canvas element.
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.append(renderer.domElement);   // domElement is the <canvas>
// @/key

// @key Mesh: geometry plus material | A mesh is a shape (BoxGeometry) with a surface (MeshNormalMaterial colours faces by direction).
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshNormalMaterial()
);
scene.add(cube);                  // nothing is drawn until it is in the scene
// @/key

// @key The loop | Called every frame with the time in milliseconds. Change something, then render.
renderer.setAnimationLoop((t) => {
  cube.rotation.x = t / 1000;     // radians
  cube.rotation.y = t / 1500;
  renderer.render(scene, camera);
});
// @/key
