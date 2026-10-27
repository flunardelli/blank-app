import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKINS, buySkin, equipSkin, normalizeSkins, ownsSkin, skinById } from '../src/skins.js';
import { defaultSave, normalizeSave } from '../src/progress.js';

const withCoins = (coins) => ({ ...defaultSave(), coins });

test('catalog: unique ids, the default is free, every paid skin has a price and gear', () => {
  assert.equal(new Set(SKINS.map((s) => s.id)).size, SKINS.length);
  assert.equal(SKINS[0].price, 0);
  for (const skin of SKINS.slice(1)) assert.ok(skin.price > 0 && skin.gear, skin.id);
});

test('a new save owns and wears only the default skin', () => {
  const save = defaultSave();
  assert.deepEqual(save.skins, { owned: ['classic'], equipped: 'classic' });
  assert.ok(ownsSkin(save, 'classic'));
  assert.ok(!ownsSkin(save, 'royal'));
});

test('buying takes the price, adds the skin and equips it', () => {
  const { ok, save } = buySkin(withCoins(1000), 'royal');
  assert.ok(ok);
  assert.equal(save.coins, 1000 - skinById('royal').price);
  assert.deepEqual(save.skins, { owned: ['classic', 'royal'], equipped: 'royal' });
});

test('buying is refused without enough coins, twice, or for an unknown skin', () => {
  const poor = withCoins(10);
  assert.deepEqual(buySkin(poor, 'royal'), { ok: false, save: poor });
  const rich = buySkin(withCoins(5000), 'ninja').save;
  assert.equal(buySkin(rich, 'ninja').ok, false);
  assert.equal(buySkin(rich, 'nope').ok, false);
});

test('equipping needs ownership and costs nothing; buying does not mutate the old save', () => {
  const before = withCoins(5000);
  const bought = buySkin(before, 'cool').save;
  assert.deepEqual(before.skins, defaultSave().skins);
  assert.equal(before.coins, 5000);
  assert.equal(equipSkin(bought, 'hero').ok, false);
  const back = equipSkin(bought, 'classic');
  assert.ok(back.ok);
  assert.equal(back.save.skins.equipped, 'classic');
  assert.equal(back.save.coins, bought.coins);
  assert.ok(ownsSkin(back.save, 'cool'), 'still owned after taking it off');
});

test('normalizeSkins drops unknown ids, keeps the default and falls back when the worn skin is not owned', () => {
  assert.deepEqual(normalizeSkins({ owned: ['ninja', 'ninja', 'ghost'], equipped: 'ninja' }),
    { owned: ['classic', 'ninja'], equipped: 'ninja' });
  assert.deepEqual(normalizeSkins({ owned: [], equipped: 'royal' }), { owned: ['classic'], equipped: 'classic' });
  assert.deepEqual(normalizeSkins('junk'), { owned: ['classic'], equipped: 'classic' });
});

test('a v3 save written before skins existed loads with the default skin', () => {
  const legacy = { ...defaultSave(), coins: 40 };
  delete legacy.skins;
  const save = normalizeSave(legacy);
  assert.equal(save.coins, 40);
  assert.deepEqual(save.skins, { owned: ['classic'], equipped: 'classic' });
});

test('skins survive a save round trip', () => {
  const save = buySkin(withCoins(5000), 'hero').save;
  assert.deepEqual(normalizeSave(JSON.parse(JSON.stringify(save))).skins, save.skins);
});
