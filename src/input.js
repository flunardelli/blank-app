// Unifies keyboard and pointer (mouse / touch drag) into one lateral movement per frame.
export class Input {
  constructor(element) {
    this.keys = new Set();
    this.dragPixels = 0;
    this.lastPointerX = null;
    this.pressListeners = [];
    this.keyListeners = [];
    this.locked = false; // while true (game paused) presses and movement are ignored

    window.addEventListener('keydown', (e) => {
      if (this.locked) return;
      this.keys.add(e.code);
      if (!e.repeat) this.keyListeners.forEach((listener) => listener(e.code));
      // Letters steer but don't start the run: they're reserved for the dev cheat sequences.
      if (['ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) this.emitPress();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    element.addEventListener('pointerdown', (e) => {
      this.lastPointerX = e.clientX;
      element.setPointerCapture(e.pointerId);
      this.emitPress();
    });
    element.addEventListener('pointermove', (e) => {
      if (this.lastPointerX === null) return;
      this.dragPixels += e.clientX - this.lastPointerX;
      this.lastPointerX = e.clientX;
    });
    const release = () => { this.lastPointerX = null; };
    element.addEventListener('pointerup', release);
    element.addEventListener('pointercancel', release);
  }

  onPress(listener) {
    this.pressListeners.push(listener);
  }

  /** Every fresh key press (no auto-repeat), by `KeyboardEvent.code`. */
  onKey(listener) {
    this.keyListeners.push(listener);
  }

  /** Locking also drops held keys and drag so nothing moves the instant the game resumes. */
  setLocked(locked) {
    this.locked = locked;
    this.keys.clear();
    this.dragPixels = 0;
  }

  emitPress() {
    if (this.locked) return;
    this.pressListeners.forEach((listener) => listener());
  }

  keyboardAxis() {
    const left = this.keys.has('ArrowLeft') || this.keys.has('KeyA');
    const right = this.keys.has('ArrowRight') || this.keys.has('KeyD');
    return Number(right) - Number(left);
  }

  /** Signed sideways input since the previous call in pixels (+ = right), keys counted at `keyPixelsPerSecond`. */
  consumeSwipe(dt, keyPixelsPerSecond) {
    const pixels = this.dragPixels + this.keyboardAxis() * keyPixelsPerSecond * dt;
    this.dragPixels = 0;
    return pixels;
  }

  /** Lateral displacement in world units since the previous call. */
  consumeLateral(dt, { lateralSpeed, dragSensitivity }) {
    const dx = this.keyboardAxis() * lateralSpeed * dt + this.dragPixels * dragSensitivity;
    this.dragPixels = 0;
    return dx;
  }
}
