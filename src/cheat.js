// Dev-only key sequences (pure, no DOM): feed key codes in, learn when a sequence completes.
export function createSequences(sequences, { timeout }) {
  const progress = sequences.map(() => 0);
  let lastAt = -Infinity;

  return {
    /** Returns the index of the sequence this key completed, or null. `now` is in seconds. */
    feed(code, now) {
      if (now - lastAt > timeout) progress.fill(0);
      lastAt = now;
      let done = null;
      sequences.forEach((keys, i) => {
        if (code === keys[progress[i]]) progress[i] += 1;
        else progress[i] = code === keys[0] ? 1 : 0; // a wrong key restarts, but may itself start over
        if (progress[i] === keys.length) {
          progress[i] = 0;
          done ??= i;
        }
      });
      return done;
    },
  };
}
