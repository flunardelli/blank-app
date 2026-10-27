import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVEL_COUNT, WORLDS, levelInfo } from '../src/worlds.js';
import { BOSSES, bossForLevel } from '../src/bosses.js';
import { CONFIG } from '../src/config.js';

test('10 worlds of 3 levels make the 30-level campaign', () => {
  assert.equal(WORLDS.length, 10);
  assert.equal(LEVEL_COUNT, 30);
  assert.equal(new Set(WORLDS.map((w) => w.id)).size, 10, 'unique world ids');
  assert.equal(new Set(WORLDS.map((w) => w.name)).size, 10, 'unique world names');
});

test('levelInfo maps a level to its world, slot and kind', () => {
  assert.deepEqual(['mini', 'boss', 'chest'], [1, 2, 3].map((n) => levelInfo(n).kind));
  assert.equal(levelInfo(4).world.id, WORLDS[1].id);
  assert.equal(levelInfo(30).world.id, 'castle');
  assert.equal(levelInfo(30).kind, 'chest');
  assert.equal(levelInfo(30).pressure, 1);
  assert.equal(levelInfo(1).pressure, 0);
  assert.deepEqual(levelInfo(45), levelInfo(30), 'levels past the end reuse the final world');
});

test('every world names bosses that exist, and its mini boss is not its world boss', () => {
  const ids = BOSSES.map((b) => b.id);
  for (const w of WORLDS) {
    assert.ok(ids.includes(w.boss) && ids.includes(w.mini), w.id);
    assert.notEqual(w.boss, w.mini, w.id);
  }
});

test('bossForLevel reads the world: smaller coloured mini boss on level 1, world boss on 2 and 3', () => {
  for (const [i, world] of WORLDS.entries()) {
    const [mini, boss, chest] = [1, 2, 3].map((slot) => bossForLevel(i * 3 + slot));
    assert.equal(boss.id, world.boss);
    assert.equal(chest.id, world.boss, 'chest levels have no fight and answer with the world boss');
    assert.equal(mini.id, world.mini);
    assert.deepEqual(mini.colors, world.tint);
    const base = BOSSES.find((b) => b.id === world.mini);
    assert.deepEqual(mini.body, base.body.map((s) => s * CONFIG.boss.miniScale));
    assert.equal(mini.attack.move, 'jab', 'mini bosses only jab');
  }
});

test('neighbouring worlds never share a world boss', () => {
  for (let i = 1; i < WORLDS.length; i++) assert.notEqual(WORLDS[i].boss, WORLDS[i - 1].boss);
});

test('every world has a complete, distinct visual theme', async () => {
  const { THEME_KEYS } = await import('../src/worlds.js');
  const hex = /^#[0-9a-f]{6}$/i;
  for (const w of WORLDS) {
    assert.deepEqual(Object.keys(w.theme).sort(), [...THEME_KEYS].sort(), w.id);
    for (const key of ['sky', 'sea', 'track']) {
      assert.equal(w.theme[key].length, 2, `${w.id}.${key}`);
      assert.ok(w.theme[key].every((c) => hex.test(c)), `${w.id}.${key} are css hex colours`);
    }
    assert.equal(w.theme.hemi.length, 2, `${w.id}.hemi`);
  }
  assert.equal(new Set(WORLDS.map((w) => w.theme.sky.join())).size, WORLDS.length, 'no two worlds share a sky');
});

test('the ten worlds field ten different world bosses, ending with the Castle King on level 29', () => {
  assert.equal(BOSSES.length, 10);
  assert.equal(new Set(WORLDS.map((w) => w.boss)).size, 10, 'every boss is some world\'s boss');
  assert.equal(bossForLevel(29).id, 'castleking');
  assert.equal(levelInfo(29).kind, 'boss');
  assert.equal(WORLDS[9].arena, 'castle');
  assert.equal(WORLDS.filter((w) => w.arena).length, 1, 'only the last fight is inside the castle');
});

test('every boss has its own silhouette, attack and look', () => {
  for (const key of ['headgear', 'emoji', 'name']) {
    assert.equal(new Set(BOSSES.map((b) => b[key])).size, BOSSES.length, `${key} is unique`);
  }
  assert.equal(new Set(BOSSES.map((b) => b.attack.move)).size, BOSSES.length, 'every boss has a move of its own');
  assert.equal(new Set(BOSSES.map((b) => b.body.join())).size, BOSSES.length, 'silhouettes differ');
});

test('a world boss is bigger than a mini boss and enters with its own banner', () => {
  for (const [i, world] of WORLDS.entries()) {
    const [mini, boss] = [1, 2].map((slot) => bossForLevel(i * 3 + slot));
    assert.equal(boss.size, CONFIG.boss.worldBossScale);
    assert.equal(CONFIG.boss.worldBossScale, 1.5);
    assert.equal(mini.size, 1, 'a mini boss is small through its body frame instead');
    assert.ok(boss.banner.title.includes(world.name) && boss.banner.text.includes(boss.name));
    assert.ok(!mini.banner.title, 'a mini boss has no title line');
  }
});
