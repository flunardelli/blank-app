import * as THREE from 'three';

const SKY = 0x9fd3ff;

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 45, 150);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20, near: 1, far: 80 });
  scene.add(sun, sun.target);

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Portrait screens (phones) need a wider vertical FOV to keep the track in view.
    camera.fov = camera.aspect < 1 ? 75 : 60;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  // The sun follows the player so the shadow map only has to cover a small area.
  const followSun = (target) => {
    sun.position.set(target.x + 8, 25, target.z + 10);
    sun.target.position.copy(target);
  };

  return { renderer, scene, camera, followSun, render: () => renderer.render(scene, camera) };
}
