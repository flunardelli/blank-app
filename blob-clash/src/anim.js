// Keyframe animation for the boxers, independent of three.js so it can be unit tested.
//
// A pose is a flat map of numeric channels (see GUARD in moves.js). A clip is a list of
// keys [time, partialPose, ease]: channels a key leaves out keep the clip's base pose, and
// `ease` shapes the motion *into* that key (fast `in` curves sell an impact, `outBack`
// overshoots for follow-through).

export const EASE = {
  linear: (k) => k,
  inQuad: (k) => k * k,
  outQuad: (k) => 1 - (1 - k) * (1 - k),
  inCubic: (k) => k * k * k,
  outCubic: (k) => 1 - (1 - k) ** 3,
  inOutSine: (k) => (1 - Math.cos(Math.PI * k)) / 2,
  outBack: (k) => 1 + 2.70158 * (k - 1) ** 3 + 1.70158 * (k - 1) ** 2,
};

const lerp = (a, b, k) => a + (b - a) * k;

export function blendPose(from, to, k) {
  const out = {};
  for (const channel in to) out[channel] = lerp(from[channel] ?? to[channel], to[channel], k);
  return out;
}

export const clipDuration = (clip) => clip.keys[clip.keys.length - 1][0];

/** Pose of `clip` at time `t` (clamped to the clip), every channel of `base` filled in. */
export function sampleClip(clip, t, base) {
  const { keys } = clip;
  const full = (i) => ({ ...base, ...keys[i][1] });
  if (t <= keys[0][0]) return full(0);
  const next = keys.findIndex(([time]) => time > t);
  if (next === -1) return full(keys.length - 1);
  const [t0] = keys[next - 1];
  const [t1, , ease = 'inOutSine'] = keys[next];
  return blendPose(full(next - 1), full(next), EASE[ease]((t - t0) / (t1 - t0)));
}

/** Swaps left and right: a right jab becomes a left jab. */
export function mirrorPose(pose) {
  const out = {};
  for (const [channel, value] of Object.entries(pose)) {
    const swapped = channel.replace(/^[lr](?=[A-Z])/, (side) => (side === 'l' ? 'r' : 'l'));
    out[swapped] = channel === 'twist' ? -value : value;
  }
  return out;
}

export const mirrorClip = (clip) => ({ ...clip, keys: clip.keys.map(([t, pose, ease]) => [t, mirrorPose(pose), ease]) });

/**
 * Plays one action clip at a time over a procedural idle, plus additive reactions (flinches)
 * on top. A new action crossfades from whatever pose is on screen, so rapid taps stay fluid.
 */
export class Animator {
  constructor(base, { fade = 0.06 } = {}) {
    this.base = base;
    this.fade = fade;
    this.action = null;
    this.reactions = [];
    this.pose = { ...base };
    this.offset = {}; // what the running reactions added to the pose last frame, per channel
  }

  play(clip, { hold = false } = {}) {
    this.action = { clip, t: 0, hold, from: { ...this.pose } };
  }

  /** Additive reaction; replaying one that is still running restarts it instead of stacking. */
  react(clip) {
    this.reactions = this.reactions.filter((reaction) => reaction.clip !== clip);
    this.reactions.push({ clip, t: 0 });
  }

  get busy() {
    return Boolean(this.action);
  }

  /** Advances by dt and returns the pose to draw. `idle` is the pose when no action plays. */
  update(dt, idle = this.base) {
    let pose = idle;
    const { action } = this;
    if (action) {
      action.t += dt;
      const duration = clipDuration(action.clip);
      const sampled = sampleClip(action.clip, action.t, this.base);
      // Ease in from the previous pose, and out into the idle at the end of the clip.
      const fadeIn = Math.min(1, action.t / this.fade);
      const fadeOut = action.hold ? 1 : Math.max(0, Math.min(1, (duration - action.t) / this.fade));
      pose = blendPose(idle, blendPose(action.from, sampled, fadeIn), fadeOut);
      if (action.t >= duration && !action.hold) this.action = null;
    }
    this.offset = {};
    this.reactions = this.reactions.filter((reaction) => {
      reaction.t += dt;
      const sampled = sampleClip(reaction.clip, reaction.t, this.base);
      pose = { ...pose };
      for (const channel in sampled) {
        const delta = sampled[channel] - this.base[channel];
        pose[channel] += delta;
        this.offset[channel] = (this.offset[channel] ?? 0) + delta;
      }
      return reaction.t < clipDuration(reaction.clip);
    });
    this.pose = pose;
    return pose;
  }
}
