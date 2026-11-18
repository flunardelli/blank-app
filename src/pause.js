// Pause state, kept free of DOM so it can be unit-tested. `canPause` says whether pausing makes sense right now
// (not on the menu / complete / lose screens); `onChange` receives the new paused flag.
export class Pause {
  constructor({ canPause = () => true, onChange = () => {} } = {}) {
    this.paused = false;
    this.canPause = canPause;
    this.onChange = onChange;
  }

  set(paused) {
    if (paused === this.paused || (paused && !this.canPause())) return;
    this.paused = paused;
    this.onChange(paused);
  }

  pause() { this.set(true); }
  resume() { this.set(false); }
  toggle() { this.set(!this.paused); }
}
