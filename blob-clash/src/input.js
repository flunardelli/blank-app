// Unifies keyboard and pointer (mouse / touch drag) into one lateral movement per frame.
export class Input {
  constructor(element) {
    this.keys = new Set();
    this.dragPixels = 0;
    this.lastPointerX = null;
    this.pressListeners = [];
    this.locked = false; // while true (game paused) presses and movement are ignored

    window.addEventListener('keydown', (e) => {
      if (this.locked) return;
      this.keys.add(e.code);
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'Space'].includes(e.code)) this.emitPress();
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

  /** Lateral displacement in world units since the previous call. */
  consumeLateral(dt, { lateralSpeed, dragSensitivity }) {
    const dx = this.keyboardAxis() * lateralSpeed * dt + this.dragPixels * dragSensitivity;
    this.dragPixels = 0;
    return dx;
  }
}
