import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cooldown, overflow } from '../src/emoji.js';

test('at most `max` bubbles stay: the oldest make room for a new one', () => {
  assert.deepEqual(overflow([], 2), []);
  assert.deepEqual(overflow(['a'], 2), []);
  assert.deepEqual(overflow(['a', 'b'], 2), ['a']);
  assert.deepEqual(overflow(['a', 'b', 'c'], 2), ['a', 'b']);
});

test('a mood is allowed again only after its cooldown, independently of other moods', () => {
  const cooldown = new Cooldown(500);
  assert.ok(cooldown.ready('loss', 1000));
  assert.ok(!cooldown.ready('loss', 1300));
  assert.ok(cooldown.ready('good', 1300));
  assert.ok(cooldown.ready('loss', 1500));
});
