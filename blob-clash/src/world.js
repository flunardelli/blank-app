// Scene, camera, lights and the endless sky/water backdrop.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { cloudTexture, skyTexture, waterTexture } from './art/textures.js';

export function createWorld(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.background = skyTexture();
  scene.fog = new THREE.Fog(PALETTE.skyHorizon, 60, 170);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 500);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x9fb6d6, 1.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.bias = -0.0005;
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 22, bottom: -22, near: 1, far: 90 });
  scene.add(sun, sun.target);

  // Water and clouds travel with the camera; scrolling the texture fakes an endless sea.
  let water = waterTexture();
  water.repeat.set(30, 30);
  const seaMaterial = new THREE.MeshBasicMaterial({ map: water, color: 0xffffff });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), seaMaterial);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -1.6;
  scene.add(sea);

  const clouds = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTexture(), fog: false, depthWrite: false }));
    sprite.scale.set(70 + Math.random() * 40, 30 + Math.random() * 12, 1);
    sprite.position.set((i - 4) * 32 + (Math.random() - 0.5) * 20, 38 + Math.random() * 18, -150 - Math.random() * 30);
    clouds.add(sprite);
  }
  scene.add(clouds);

  // Re-skins sky, fog, sea, light and clouds for a world (see THEME_KEYS in worlds.js).
  const setTheme = (theme) => {
    scene.background = skyTexture(theme.sky);
    scene.fog.color.set(theme.sky[1]);
    water = waterTexture(theme.sea);
    water.repeat.set(30, 30);
    seaMaterial.map = water;
    seaMaterial.needsUpdate = true;
    hemi.color.set(theme.hemi[0]);
    hemi.groundColor.set(theme.hemi[1]);
    sun.color.set(theme.sun);
    for (const sprite of clouds.children) sprite.material.color.set(theme.cloud);
  };

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = canvas;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Portrait phones need a wider vertical FOV to keep the whole track in view.
    camera.fov = camera.aspect < 1 ? 72 : 55;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  const follow = (target, time) => {
    sun.position.set(target.x + 10, 30, target.z + 14);
    sun.target.position.copy(target);
    sea.position.z = camera.position.z - 120;
    water.offset.set(time * 0.01, -sea.position.z / 400 * 30 + time * 0.015);
    clouds.position.z = camera.position.z;
  };

  return { renderer, scene, camera, follow, setTheme, render: () => renderer.render(scene, camera) };
}
