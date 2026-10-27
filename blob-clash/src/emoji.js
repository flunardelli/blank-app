// Rules for the emoji bubbles over the crowd, free of DOM so they can be unit tested.

/** Which of the `active` bubbles (oldest first) must go so that, with one more added, at most `max` remain. */
export const overflow = (active, max) => active.slice(0, Math.max(0, active.length + 1 - max));

/** Per-mood cooldown: `ready(mood, now)` is true at most once per `cooldownMs`. */
export class Cooldown {
  constructor(cooldownMs) {
    this.cooldownMs = cooldownMs;
    this.last = new Map();
  }

  ready(mood, now) {
    if (now - (this.last.get(mood) ?? -Infinity) < this.cooldownMs) return false;
    this.last.set(mood, now);
    return true;
  }
}
