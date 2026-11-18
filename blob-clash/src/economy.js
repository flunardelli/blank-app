// Expected power curve: which upgrades a typical player owns when reaching a level.
// Bosses are sized against it, so upgrades help without trivialising every fight.
import { CONFIG } from './config.js';
import { rewardCoins, upgradeCost } from './rules.js';

const segmentsFor = (level) => 5 + Math.min(level, 5);

/** Coins a typical player earns on `level` (share of coins collected, typical bonus multiplier). */
export function typicalIncome(level, cfg = CONFIG) {
  const collected = segmentsFor(level) * cfg.coins.perRow * cfg.coins.value * cfg.economy.coinShare;
  return rewardCoins(collected, level, cfg.economy.multiplier, cfg.reward);
}

const cache = new Map();

/** Upgrade levels a typical player owns at the start of `level`: buys the cheapest upgrade whenever affordable. */
export function expectedUpgrades(level, cfg = CONFIG) {
  if (cfg === CONFIG && cache.has(level)) return cache.get(level);
  const owned = { damage: 1, blobs: 1 };
  let coins = 0;
  for (let l = 1; l < level; l++) {
    coins += typicalIncome(l, cfg);
    for (;;) {
      const id = upgradeCost(owned.damage, cfg.upgrades) <= upgradeCost(owned.blobs, cfg.upgrades) ? 'damage' : 'blobs';
      const cost = upgradeCost(owned[id], cfg.upgrades);
      if (coins < cost) break;
      coins -= cost;
      owned[id] += 1;
    }
  }
  if (cfg === CONFIG) cache.set(level, owned);
  return owned;
}
