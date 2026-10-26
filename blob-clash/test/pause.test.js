import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pause } from '../src/pause.js';

test('pause, resume and toggle notify only on real changes', () => {
  const changes = [];
  const pause = new Pause({ onChange: (paused) => changes.push(paused) });
  pause.pause();
  pause.pause(); // already paused: no second notification
  pause.toggle();
  pause.resume(); // already running
  pause.toggle();
  assert.deepEqual(changes, [true, false, true]);
  assert.equal(pause.paused, true);
});

test('cannot pause while canPause is false, but can always resume', () => {
  let allowed = false;
  const pause = new Pause({ canPause: () => allowed });
  pause.pause();
  assert.equal(pause.paused, false);
  allowed = true;
  pause.pause();
  allowed = false; // e.g. the level ended while paused
  pause.resume();
  assert.equal(pause.paused, false);
});
