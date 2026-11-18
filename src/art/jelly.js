// Jelly look for the instanced crowds, done in the shader so 90 bodies stay one draw call:
// vertices wobble like gelatin and a face (eyes that blink, brows, mouth) is painted on the head.
import * as THREE from 'three';
import { jellyPhase } from '../rules.js';

// Shared clock: Crowd.update() writes the game time here, every jelly material reads it.
export const jellyClock = { value: 0 };

/** Gives every instance its own wobble phase. The attribute is shared by all crowds using `geometry`. */
export function withJellyPhases(geometry, maxInstances) {
  const phases = Float32Array.from({ length: maxInstances }, (_, i) => jellyPhase(i));
  geometry.setAttribute('aJellyPhase', new THREE.InstancedBufferAttribute(phases, 1));
  return geometry;
}

// Head layout comes from beanGeometry() in models.js: body height ≈ 1.4, front is +z.
const VERTEX_HEAD = /* glsl */`
  attribute float aJellyPhase;
  uniform float uJellyTime;
  varying vec3 vJellyPos;
  varying float vJellyPhase;
`;

const VERTEX_WOBBLE = /* glsl */`
  #include <begin_vertex>
  vJellyPos = position;
  vJellyPhase = aJellyPhase;
  float jh = clamp(position.y / 1.4, 0.0, 1.0);
  float jw = jh * jh; // feet stay planted, the head is the loosest part
  float jt = uJellyTime * 7.0 + aJellyPhase;
  float jsquash = sin(jt * 1.7) * 0.04 * jh;
  transformed.x += sin(jt + jh * 2.5) * 0.05 * jw;
  transformed.z += cos(jt * 0.9 + jh * 2.5) * 0.05 * jw;
  transformed.y *= 1.0 + jsquash;
  transformed.xz *= 1.0 - jsquash * 0.5;
`;

const FRAGMENT_HEAD = /* glsl */`
  uniform float uJellyTime;
  uniform float uJellyAngry;
  varying vec3 vJellyPos;
  varying float vJellyPhase;

  // Soft-edged mask: 1 inside (d < 1), 0 outside.
  float jellyDisc(float d) { return 1.0 - smoothstep(0.85, 1.0, d); }
`;

const FRAGMENT_FACE = /* glsl */`
  #include <color_fragment>
  if (vJellyPos.z > 0.0) {
    vec2 fp = vJellyPos.xy;
    float side = sign(fp.x);
    float ax = abs(fp.x);

    // Blink: eyes squash shut for a moment, out of step between bodies.
    float blinkWave = sin(uJellyTime * 1.3 + vJellyPhase * 5.0) * 0.5 + 0.5;
    float open = 1.0 - 0.92 * smoothstep(0.93, 0.97, blinkWave);

    vec2 eye = vec2((ax - 0.17) / 0.105, (fp.y - 1.0) / (0.13 * open));
    float white = jellyDisc(length(eye));
    float pupil = jellyDisc(length(vec2(ax - 0.17 - side * 0.015, (fp.y - 0.99) / open) / 0.058));
    float glint = jellyDisc(length(vec2(ax - 0.19, (fp.y - 1.03) / open) / 0.02));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), white);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.06, 0.04, 0.08), pupil);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), glint);

    // Mouth: a smile, or a frown plus slanted brows when angry.
    float mx = fp.x / 0.12;
    float curve = mix(0.8 + 0.07 * mx * mx, 0.86 - 0.05 * mx * mx, uJellyAngry);
    float mouth = (1.0 - smoothstep(0.011, 0.017, abs(fp.y - curve))) * (1.0 - smoothstep(0.9, 1.0, abs(mx)));
    float bx = (ax - 0.17) / 0.1;
    float brow = (1.0 - smoothstep(0.014, 0.022, abs(fp.y - (1.17 + 0.6 * (ax - 0.17)))))
      * (1.0 - smoothstep(0.9, 1.0, abs(bx))) * uJellyAngry;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.1, 0.03, 0.06), max(mouth, brow));
  }
`;

/** Adds the wobble and the painted face to a MeshPhysicalMaterial (gummyMaterial). */
export function makeJelly(material, { angry = false } = {}) {
  const angryUniform = { value: angry ? 1 : 0 };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uJellyTime = jellyClock;
    shader.uniforms.uJellyAngry = angryUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${VERTEX_HEAD}`)
      .replace('#include <begin_vertex>', VERTEX_WOBBLE);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAGMENT_HEAD}`)
      .replace('#include <color_fragment>', FRAGMENT_FACE);
  };
  material.customProgramCacheKey = () => 'jelly';
  return material;
}
