// Procedural canvas textures: no image files to download, everything is drawn at startup.
import * as THREE from 'three';
import { PALETTE } from '../config.js';

export const FONT_FAMILY = '"Fredoka", "Arial Rounded MT Bold", system-ui, sans-serif';

function makeCanvas(width, height) {
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  return [canvas, canvas.getContext('2d')];
}

function toTexture(canvas, { repeat = false } = {}) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  if (repeat) texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const cache = new Map();
const cached = (key, build) => {
  if (!cache.has(key)) cache.set(key, build());
  return cache.get(key);
};

export const stripeTexture = () => cached('stripes', () => {
  const [canvas, ctx] = makeCanvas(8, 64);
  ctx.fillStyle = PALETTE.trackLight;
  ctx.fillRect(0, 0, 8, 64);
  ctx.fillStyle = PALETTE.trackDark;
  ctx.fillRect(0, 0, 8, 28);
  return toTexture(canvas, { repeat: true });
});

// Worley-noise caustics (distance to 2nd nearest minus nearest cell point) that tile seamlessly.
export const waterTexture = () => cached('water', () => {
  const size = 256;
  const [canvas, ctx] = makeCanvas(size, size);
  const points = Array.from({ length: 22 }, () => [Math.random() * size, Math.random() * size]);
  const image = ctx.createImageData(size, size);
  const base = new THREE.Color(PALETTE.waterBase);
  const line = new THREE.Color(PALETTE.waterLine);
  const out = new THREE.Color();
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let f1 = Infinity;
      let f2 = Infinity;
      for (const [px, py] of points) {
        const dx = Math.min(Math.abs(x - px), size - Math.abs(x - px));
        const dy = Math.min(Math.abs(y - py), size - Math.abs(y - py));
        const dist = Math.hypot(dx, dy);
        if (dist < f1) [f1, f2] = [dist, f1];
        else if (dist < f2) f2 = dist;
      }
      const edge = 1 - THREE.MathUtils.smoothstep(f2 - f1, 0, 7);
      out.copy(base).lerp(line, edge * 0.9);
      const i = (y * size + x) * 4;
      image.data.set([out.r * 255, out.g * 255, out.b * 255, 255], i);
    }
  }
  ctx.putImageData(image, 0, 0);
  return toTexture(canvas, { repeat: true });
});

export const skyTexture = () => cached('sky', () => {
  const [canvas, ctx] = makeCanvas(2, 256);
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  gradient.addColorStop(0, PALETTE.skyTop);
  gradient.addColorStop(0.75, PALETTE.skyHorizon);
  gradient.addColorStop(1, PALETTE.skyHorizon);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 2, 256);
  return toTexture(canvas);
});

export const cloudTexture = () => cached('cloud', () => {
  const [canvas, ctx] = makeCanvas(256, 128);
  for (let i = 0; i < 14; i++) {
    const x = 40 + Math.random() * 176;
    const y = 60 + Math.random() * 30;
    const r = 24 + Math.random() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.7)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  return toTexture(canvas);
});

export const checkerTexture = () => cached('checker', () => {
  const [canvas, ctx] = makeCanvas(64, 16);
  for (let x = 0; x < 8; x++) {
    for (let y = 0; y < 2; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#ffffff' : '#141414';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  }
  const texture = toTexture(canvas, { repeat: true });
  texture.magFilter = THREE.NearestFilter;
  return texture;
});

// Chunky outlined text like the reference UI: white fill, thick dark ink outline.
export function textTexture(text, { fill = '#ffffff', stroke = PALETTE.ink, height = 128 } = {}) {
  return cached(`text:${text}:${fill}:${height}`, () => {
    const font = `700 ${height * 0.72}px ${FONT_FAMILY}`;
    const [probe, probeCtx] = makeCanvas(1, 1);
    probeCtx.font = font;
    const width = Math.ceil(probeCtx.measureText(text).width + height * 0.4);
    const [canvas, ctx] = makeCanvas(width, height);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = height * 0.14;
    ctx.strokeStyle = stroke;
    ctx.strokeText(text, width / 2, height * 0.54);
    ctx.fillStyle = fill;
    ctx.fillText(text, width / 2, height * 0.54);
    probe.remove();
    const texture = toTexture(canvas);
    texture.userData.aspect = width / height;
    return texture;
  });
}

// Paint splats: a big blob, satellite droplets and a few streaks. Drawn white, tinted per material.
export const splatTextures = () => cached('splats', () => Array.from({ length: 3 }, () => {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#ffffff';
  const blob = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
  for (let i = 0; i < 9; i++) blob(64 + (Math.random() - 0.5) * 30, 64 + (Math.random() - 0.5) * 30, 14 + Math.random() * 12);
  for (let i = 0; i < 22; i++) {
    const a = Math.random() * Math.PI * 2;
    const dist = 30 + Math.random() * 30;
    blob(64 + Math.cos(a) * dist, 64 + Math.sin(a) * dist, 1.5 + Math.random() * 5);
  }
  return toTexture(canvas);
}));

export const melonFaceTexture = () => cached('melon', () => {
  const [canvas, ctx] = makeCanvas(256, 256);
  const ring = (r, color) => { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(128, 128, r, 0, Math.PI * 2); ctx.fill(); };
  ring(128, '#3f9b3a');
  ring(118, '#9fe28a');
  ring(108, '#f1fbe6');
  ring(100, '#ff6b6b');
  ctx.fillStyle = '#1a1a1a';
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const dist = 35 + Math.random() * 50;
    ctx.save();
    ctx.translate(128 + Math.cos(a) * dist, 128 + Math.sin(a) * dist);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.ellipse(0, 0, 7, 3.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  return toTexture(canvas);
});

export const coinFaceTexture = () => cached('coin', () => {
  const [canvas, ctx] = makeCanvas(128, 128);
  ctx.fillStyle = '#ffc21a';
  ctx.beginPath();
  ctx.arc(64, 64, 64, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ff9d00';
  ctx.beginPath();
  ctx.arc(64, 64, 46, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd84a';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 16 : 36;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  ctx.fill();
  return toTexture(canvas);
});
