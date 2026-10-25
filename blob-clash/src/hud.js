// DOM overlay: counters, floating mass labels and the start / win / lose screens.
import * as THREE from 'three';

const projected = new THREE.Vector3();
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.level = $('level');
    this.progress = $('progress-fill');
    this.playerLabel = $('player-label');
    this.bossLabel = $('boss-label');
    this.overlay = $('overlay');
    this.title = $('overlay-title');
    this.body = $('overlay-body');
    this.button = $('overlay-button');
  }

  setLevel(level) {
    this.level.textContent = `Level ${level}`;
  }

  setProgress(fraction) {
    this.progress.style.width = `${Math.min(1, Math.max(0, fraction)) * 100}%`;
  }

  // Pins an HTML label above a 3D position.
  placeLabel(element, worldPosition, camera, text, show = true) {
    projected.copy(worldPosition).project(camera);
    const visible = show && projected.z < 1;
    element.style.display = visible ? 'block' : 'none';
    if (!visible) return;
    element.style.transform = `translate(-50%, -100%) translate(${(projected.x + 1) * 50}vw, ${(1 - projected.y) * 50}vh)`;
    element.textContent = text;
  }

  showOverlay({ title, body, button, onClick }) {
    this.title.textContent = title;
    this.body.innerHTML = body;
    this.button.textContent = button;
    this.button.onclick = () => {
      this.overlay.hidden = true;
      onClick();
    };
    this.overlay.hidden = false;
  }
}
