// Plays the fighters' animations on their skinned bodies. Two kinds of motion meet here:
//   - the keyframed moves of moves.js, sampled by the Animator this class extends (a pose of channels);
//   - clips retargeted from the RobotExpressive model, played by a three.js AnimationMixer.
// Switching between them (or between two clips) always crossfades over CONFIG.character.blendSeconds, so
// no pose ever jumps, and the torso, head and forearms ride on springs: the body lags behind its bones
// and wobbles when they stop.
import * as THREE from 'three';
import { Animator } from './anim.js';
import { addPoseOffset, copyBones, createDriver, posesToBones } from './art/character.js';
import { placeRoot } from './art/boxer.js';
import { loadRobot, retargetClips } from './art/retarget.js';
import { CONFIG } from './config.js';

const smooth = (k) => k * k * (3 - 2 * k);
const blended = new THREE.Quaternion();

// ---- Clip library -------------------------------------------------------------------
/** Retargeted clips per body layout. Loading is optional: until a clip is here, moves fall back to their keyframes. */
export const clipLibrary = {
  clips: new Map(), // body layout name -> Map(clip name -> AnimationClip)
  get(spec, name) {
    return this.clips.get(spec.name)?.get(name);
  },
  /** Loads the robot and retargets its clips for each layout, a clip at a time so frames keep flowing. */
  async load(specs, { robot, pause = () => new Promise((resolve) => setTimeout(resolve, 0)) } = {}) {
    const source = robot ?? await loadRobot();
    for (const spec of specs) {
      const own = this.clips.get(spec.name) ?? new Map();
      this.clips.set(spec.name, own);
      for (const name of CONFIG.character.clips) {
        await pause();
        retargetClips(source, spec, [name]).forEach((clip, key) => own.set(key, clip));
      }
    }
  },
};

// ---- Jelly springs ------------------------------------------------------------------
const error = new THREE.Quaternion();
const step = new THREE.Quaternion();
const spin = new THREE.Vector3();

/** A rotation that trails its target on an underdamped spring, so it overshoots and settles. */
export class RotationSpring {
  constructor(stiffness, damping) {
    this.stiffness = stiffness;
    this.damping = damping;
    this.value = null;
    this.velocity = new THREE.Vector3(); // rad/s, in the frame of `value`
  }

  /** Advances by dt towards `target` and returns the sprung rotation. */
  update(target, dt) {
    if (!this.value) {
      this.value = target.clone();
      return this.value;
    }
    const steps = Math.max(1, Math.ceil(dt / CONFIG.character.wobbleMaxStep));
    const h = dt / steps;
    for (let i = 0; i < steps; i++) {
      error.copy(this.value).invert().multiply(target);
      if (error.w < 0) error.set(-error.x, -error.y, -error.z, -error.w); // the short way round
      const angle = 2 * Math.atan2(Math.hypot(error.x, error.y, error.z), error.w);
      const s = Math.hypot(error.x, error.y, error.z);
      spin.set(error.x, error.y, error.z).multiplyScalar(s > 1e-9 ? angle / s : 2);
      this.velocity.addScaledVector(spin, this.stiffness * h).addScaledVector(this.velocity, -this.damping * h);
      const turn = this.velocity.length() * h;
      if (turn > 1e-9) this.value.multiply(step.setFromAxisAngle(spin.copy(this.velocity).normalize(), turn));
    }
    return this.value.normalize();
  }
}

// ---- Player -------------------------------------------------------------------------
/** Every bone's transform plus the root's dash/lift: what a crossfade starts from. Reused frame after frame. */
class Snapshot {
  static of({ bones }) {
    const snapshot = new Snapshot();
    snapshot.bones = Object.fromEntries(Object.keys(bones).map((name) => [name, {
      position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1),
    }]));
    snapshot.root = { dash: 0, lift: 0 };
    return snapshot;
  }

  take({ bones }, root) {
    for (const name in bones) {
      this.bones[name].position.copy(bones[name].position);
      this.bones[name].quaternion.copy(bones[name].quaternion);
      this.bones[name].scale.copy(bones[name].scale);
    }
    this.root.dash = root.dash;
    this.root.lift = root.lift;
  }

  copy(other) {
    for (const name in this.bones) {
      this.bones[name].position.copy(other.bones[name].position);
      this.bones[name].quaternion.copy(other.bones[name].quaternion);
      this.bones[name].scale.copy(other.bones[name].scale);
    }
    Object.assign(this.root, other.root);
  }
}

const HOLD_MARGIN = 1e-3; // seconds before the end of a held clip, so it never wraps around
const BLEND_CHANNELS = ['dash', 'lift'];

export class AnimPlayer extends Animator {
  constructor(base, options) {
    super(base, options);
    this.rig = null;
    this.wanted = null; // a retargeted clip asked for, started on the next frame it is available
    this.running = null; // the retargeted clip playing now
    this.sourceKey = 'pose';
    this.blend = null; // { t } while crossfading from `from`
    this.last = null; // bones and root offsets as drawn last frame, before the springs
    this.from = null; // `last` as it was when the crossfade began
    this.nextId = 0;
  }

  bind(rig) {
    this.rig = rig;
    this.driver = createDriver(rig.body.spec);
    this.mixer = new THREE.AnimationMixer(this.driver.root);
    this.springs = Object.entries(CONFIG.character.wobble)
      .map(([bone, [stiffness, damping]]) => [rig.body.bones[bone], new RotationSpring(stiffness, damping)]);
    this.running = null;
    this.sourceKey = 'pose';
    this.blend = null;
    this.last = null;
    this.from = Snapshot.of(rig.body);
  }

  /** A keyframed move; one with a `retarget` clip name plays that retargeted clip instead, once it is loaded. */
  play(move, options = {}) {
    super.play(move, options);
    this.stopClip();
    this.wanted = move.retarget ? { name: move.retarget, hold: options.hold, speed: this.impactSpeed(move) } : null;
  }

  /** A retargeted clip by name; `fallback` (a move) plays when the clip is not loaded. */
  playClip(name, { hold = false, loop = false, speed = 1, fallback = null } = {}) {
    this.stopClip();
    this.wanted = { name, hold, loop, speed, fallback };
    this.action = null;
  }

  /** A victory dance: the animators' clip when loaded, else the keyframed move; a dance with no clip is only keyframes. */
  dance({ clip, move }) {
    if (clip) this.playClip(clip, { loop: true, fallback: move });
    else this.play(move, { loop: true });
  }

  /** The speed that lands the clip's impact frame on the move's hit time. */
  impactSpeed({ retarget, hits }) {
    const impact = CONFIG.character.clipImpact[retarget];
    return impact && hits?.length ? impact / hits[0] : 1;
  }

  stopClip() {
    this.running?.action.stop();
    this.running = null;
  }

  get busy() {
    return Boolean(this.action || this.running || this.wanted);
  }

  /**
   * Advances by dt and poses `rig`. `idle` is the keyframed idle pose; `ambient` names a retargeted clip
   * to loop while nothing else plays (null = the keyframed idle).
   */
  drive(rig, dt, idle, ambient = null) {
    if (this.rig !== rig) this.bind(rig);
    const pose = this.update(dt, idle);
    this.startWanted(ambient);

    const clip = this.running;
    const key = clip ? `clip:${clip.id}` : 'pose';
    if (key !== this.sourceKey) {
      this.sourceKey = key;
      if (this.last) this.from.copy(this.last);
      this.blend = this.last ? { t: 0 } : null;
    }

    const { body } = rig;
    let root;
    if (clip) {
      if (clip.hold && !clip.loop && clip.t + dt * clip.speed >= clip.duration - HOLD_MARGIN) {
        clip.action.time = clip.duration - HOLD_MARGIN; // frozen on the last frame, still writing it every frame
        this.mixer.update(0);
      } else {
        this.mixer.update(dt * clip.speed);
      }
      clip.t += dt * clip.speed;
      copyBones(this.driver.bones, body.bones);
      addPoseOffset(body, this.offset);
      root = this.offset;
      if (!clip.loop && !clip.hold && clip.t >= clip.duration) this.stopClip();
    } else {
      posesToBones(body, pose);
      root = pose;
    }
    const rootOffset = { dash: root.dash ?? 0, lift: root.lift ?? 0 };

    if (this.blend) {
      this.blend.t += dt;
      const k = smooth(Math.min(1, this.blend.t / CONFIG.character.blendSeconds));
      this.mix(this.from, k, rootOffset);
      if (this.blend.t >= CONFIG.character.blendSeconds) this.blend = null;
    }
    this.last ??= Snapshot.of(body);
    this.last.take(body, rootOffset);

    for (const [bone, spring] of this.springs) bone.quaternion.copy(spring.update(bone.quaternion, dt));
    placeRoot(rig, rootOffset);
  }

  // Starts the clip asked for by play()/playClip(), or the ambient one, when it exists for this body.
  startWanted(ambient) {
    const { spec } = this.rig.body;
    if (this.wanted) {
      const wanted = this.wanted;
      this.wanted = null;
      const clip = clipLibrary.get(spec, wanted.name);
      if (clip) this.startClip(clip, wanted);
      else if (wanted.fallback) super.play(wanted.fallback, { hold: wanted.hold, loop: wanted.loop });
      return;
    }
    if (this.running?.ambient && this.running.name !== ambient) this.stopClip();
    if (!this.running && !this.action && ambient) {
      const clip = clipLibrary.get(spec, ambient);
      if (clip) this.startClip(clip, { name: ambient, loop: true, ambient: true });
    }
  }

  startClip(clip, { name, hold = false, loop = false, speed = 1, ambient = false }) {
    const action = this.mixer.clipAction(clip);
    action.reset();
    // A held clip loops until it freezes on its last frame by hand: a finished action stops writing to the bones.
    action.setLoop(loop || hold ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.play();
    this.action = null; // a retargeted clip replaces the keyframed action
    this.running = { id: this.nextId++, name, action, hold, loop, speed, ambient, t: 0, duration: clip.duration };
  }

  // ---- Crossfade ----
  /** Blends the bones (and root offsets) from the captured pose towards what they were just set to. */
  mix(from, k, rootOffset) {
    const { bones } = this.rig.body;
    for (const name in bones) {
      const bone = bones[name];
      const start = from.bones[name];
      bone.position.lerpVectors(start.position, bone.position, k);
      bone.quaternion.copy(blended.copy(start.quaternion).slerp(bone.quaternion, k)); // not slerpQuaternions: it would overwrite its own target
      bone.scale.lerpVectors(start.scale, bone.scale, k);
    }
    for (const channel of BLEND_CHANNELS) rootOffset[channel] += (from.root[channel] - rootOffset[channel]) * (1 - k);
  }
}
