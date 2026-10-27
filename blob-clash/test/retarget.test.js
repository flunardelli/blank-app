import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { retargetClips } from '../src/art/retarget.js';
import { createSkinnedBody } from '../src/art/character.js';
import { BOSS_BODY, CHAMPION_BODY } from '../src/art/bodySpecs.js';
import { CONFIG } from '../src/config.js';
import { loadRobotFromDisk } from './support/robot.mjs';

const robot = await loadRobotFromDisk();

test('the robot ships the clips the game asks for', () => {
  const names = robot.animations.map((clip) => clip.name);
  for (const name of CONFIG.character.clips) assert.ok(names.includes(name), name);
});

for (const spec of [BOSS_BODY, CHAMPION_BODY]) {
  const clips = retargetClips(robot, spec);

  test(`${spec.name}: every configured clip is retargeted onto our bones, with finite values`, () => {
    assert.deepEqual([...clips.keys()].sort(), [...CONFIG.character.clips].sort());
    for (const [name, clip] of clips) {
      const source = robot.animations.find((candidate) => candidate.name === name);
      assert.ok(Math.abs(clip.duration - source.duration) < 0.05, `${name} keeps its length`);
      assert.ok(clip.tracks.length >= 14, `${name} animates the whole body`);
      for (const track of clip.tracks) {
        assert.match(track.name, /^\.bones\[(Body|Hips|Abdomen|Torso|Neck|Head|(Upper|Lower)(Arm|Leg)[LR])\]\.(position|quaternion)$/);
        assert.ok(track.values.every(Number.isFinite), `${name} ${track.name}`);
        if (track.name.endsWith('quaternion')) {
          for (let i = 0; i < track.values.length; i += 4) {
            const length = Math.hypot(track.values[i], track.values[i + 1], track.values[i + 2], track.values[i + 3]);
            assert.ok(Math.abs(length - 1) < 1e-3, `${name} ${track.name} is a unit quaternion`);
          }
        }
      }
    }
  });

  test(`${spec.name}: the hip stays at body height instead of the robot's, and Death drops it`, () => {
    for (const [name, clip] of clips) {
      const hip = clip.tracks.find((track) => track.name === '.bones[Body].position');
      const heights = hip.values.filter((_, i) => i % 3 === 1);
      assert.ok(Math.min(...heights) > 0 && Math.max(...heights) < spec.hipY * 2.2, `${name} stays above the floor and within reach`);
      if (!['Running', 'Jump'].includes(name)) assert.ok(Math.abs(heights[0] - spec.hipY) < spec.hipY * 0.3, `${name} starts near the bind height`);
    }
    const death = clips.get('Death').tracks.find((track) => track.name === '.bones[Body].position');
    assert.ok(death.values[death.values.length - 2] < spec.hipY * 0.6, 'the collapsed body is low');
  });

  test(`${spec.name}: Punch lands where CONFIG.character.clipImpact says`, () => {
    const body = createSkinnedBody(spec, new THREE.MeshBasicMaterial(), { bottom: 0, top: 0 });
    const mixer = new THREE.AnimationMixer(body.mesh);
    const clip = clips.get('Punch');
    mixer.clipAction(clip).play();
    const hand = new THREE.Vector3();
    let [best, bestAt] = [-Infinity, 0];
    for (let t = 0; t < clip.duration; t += 1 / 60) {
      mixer.setTime(t);
      body.mesh.updateMatrixWorld(true);
      for (const side of ['L', 'R']) {
        body.bones[`Hand${side}`].getWorldPosition(hand);
        if (hand.z > best) [best, bestAt] = [hand.z, t];
      }
    }
    assert.ok(Math.abs(bestAt - CONFIG.character.clipImpact.Punch) < 0.08, `furthest reach at ${bestAt.toFixed(2)}s`);
  });
}
