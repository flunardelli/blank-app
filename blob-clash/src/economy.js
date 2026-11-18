// Expected power curve: the upgrades a typical player owns when reaching a level. Bosses are
// sized against it (level.js), so upgrades help without trivialising every fight.
import { CONFIG } from './config.js';
import { chestStageCoins } from './chest.js';
import { generateLevel } from './level.js';
import { rewardCoins, upgradeCost } from './rules.js';
import { levelInfo } from './worlds.js';

/** Coins a typical player earns on `level`: a share of the coins, a typical bonus, and the chest payout. */
export function typicalIncome(level, cfg = CONFIG) {
  const generated = generateLevel(level);
  const { coinShare, multiplier, crowdShare } = cfg.economy;
  const collected = generated.coins.length * cfg.coins.value * coinShare;
  const { kind, worldIndex } = levelInfo(level);
  const chest = kind === 'chest' ? chestStageCoins(Math.round(generated.bestCount * crowdShare), worldIndex) : 0;
  return rewardCoins(collected, level, multiplier, cfg.reward) + chest;
}

const cache = new Map();

/** Upgrade levels owned at the start of `level`: buys the cheapest upgrade whenever affordable. */
export function expectedUpgrades(level) {
  if (cache.has(level)) return cache.get(level);
  const owned = level <= 1 ? { damage: 1, blobs: 1 } : { ...expectedUpgrades(level - 1) };
  if (level > 1) {
    let coins = (cache.get(`coins:${level - 1}`) ?? 0) + typicalIncome(level - 1);
    for (;;) {
      const id = upgradeCost(owned.damage) <= upgradeCost(owned.blobs) ? 'damage' : 'blobs';
      if (coins < upgradeCost(owned[id])) break;
      coins -= upgradeCost(owned[id]);
      owned[id] += 1;
    }
    cache.set(`coins:${level}`, coins);
  }
  cache.set(level, owned);
  return owned;
}
