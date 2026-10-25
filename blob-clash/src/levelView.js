// Turns level data (level.js) into three.js meshes. Distance d along the track maps to z = -d.
import * as THREE from 'three';
import { CONFIG, COLORS } from './config.js';
import { Blob } from './blob.js';
import { massToRadius } from './rules.js';

export const toZ = (d) => -d;

const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x3d3d5c, roughness: 0.5 });
const sawMaterial = new THREE.MeshStandardMaterial({ color: 0xc9ced6, metalness: 0.8, roughness: 0.25 });
const railMaterial = new THREE.MeshStandardMaterial({ color: 0x555566 });
const sawGeometry = new THREE.CylinderGeometry(1, 1, 0.22, 20).rotateZ(Math.PI / 2);

function stripeTexture() {
  const canvas = Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f1ecff';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#e1d9fb';
  ctx.fillRect(0, 0, 64, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function buildTrack(length, owned) {
  const { width } = CONFIG.track;
  const texture = stripeTexture();
  texture.repeat.set(1, length / 4);
  const geometry = new THREE.BoxGeometry(width, 1, length);
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.9 });
  owned.push(texture, geometry, material);

  const track = new THREE.Mesh(geometry, material);
  track.position.set(0, -0.5, toZ(length / 2 - 15));
  track.receiveShadow = true;
  return track;
}

function buildGate(gate, owned) {
  const half = CONFIG.track.width / 2;
  const group = new THREE.Group();
  group.position.z = toZ(gate.d);
  const geometry = new THREE.BoxGeometry(half, 3.2, 0.15);
  owned.push(geometry);
  [[gate.left, -half / 2], [gate.right, half / 2]].forEach(([color, x]) => {
    const material = new THREE.MeshStandardMaterial({
      color: COLORS[color], transparent: true, opacity: 0.45, emissive: COLORS[color], emissiveIntensity: 0.3,
    });
    owned.push(material);
    const panel = new THREE.Mesh(geometry, material);
    panel.position.set(x, 1.6, 0);
    group.add(panel);
  });
  return group;
}

function buildObstacle(obstacle, owned) {
  if (obstacle.kind === 'saw') {
    const group = new THREE.Group();
    const rail = new THREE.Mesh(new THREE.BoxGeometry(CONFIG.track.width, 0.1, 0.3), railMaterial);
    owned.push(rail.geometry);
    const saw = new THREE.Mesh(sawGeometry, sawMaterial);
    saw.scale.setScalar(obstacle.radius);
    saw.position.y = obstacle.radius * 0.8;
    saw.castShadow = true;
    group.add(rail, saw);
    group.position.z = toZ(obstacle.d);
    return { obstacle, group, moving: saw };
  }
  const geometry = new THREE.BoxGeometry(obstacle.halfWidth * 2, 1.8, obstacle.halfDepth * 2);
  owned.push(geometry);
  const wall = new THREE.Mesh(geometry, wallMaterial);
  wall.position.set(obstacle.x, 0.9, toZ(obstacle.d));
  wall.castShadow = true;
  return { obstacle, group: wall, moving: null };
}

export function buildLevelView(scene, level) {
  const root = new THREE.Group();
  const owned = []; // per-level GPU resources to free on dispose
  root.add(buildTrack(level.boss.d + 40, owned));
  level.gates.forEach((gate) => root.add(buildGate(gate, owned)));

  const obstacles = level.obstacles.map((o) => buildObstacle(o, owned));
  obstacles.forEach(({ group }) => root.add(group));

  const pickups = new Map(level.pickups.map((p) => {
    const blob = new Blob(p.color, massToRadius(p.mass));
    blob.group.position.set(p.x, blob.group.position.y, toZ(p.d));
    root.add(blob.group);
    return [p.id, blob];
  }));

  const boss = new Blob('red', massToRadius(level.boss.mass), { face: 'angry', faceDirection: 1 });
  boss.body.material = new THREE.MeshStandardMaterial({ color: 0x2b2b3a, roughness: 0.3 });
  owned.push(boss.body.material);
  boss.group.position.z = toZ(level.boss.d);
  root.add(boss.group);

  scene.add(root);
  return {
    root,
    pickups,
    obstacles,
    boss,
    dispose() {
      scene.remove(root);
      owned.forEach((resource) => resource.dispose());
    },
  };
}
