// Cosmetic skins bought with coins. A skin dresses only the crowd leader and the champion, never
// the whole crowd. Pure data and save rules (no three.js, no storage) so they can be unit tested.
import { PALETTE } from './config.js';

export const DEFAULT_SKIN = 'classic';

// `gear` names a builder in art/skinModels.js; `price` is in coins.
export const SKINS = [
  { id: 'classic', name: 'Classic', icon: '🟠', price: 0, colors: PALETTE.player, gear: null },
  { id: 'ninja', name: 'Ninja', icon: '🥷', price: 120, colors: { bottom: 0x3a3a52, top: 0x15131f }, gear: 'headband' },
  { id: 'royal', name: 'Royal', icon: '👑', price: 300, colors: { bottom: 0xffd23a, top: 0xe8941a }, gear: 'crown' },
  { id: 'cool', name: 'Cool', icon: '😎', price: 500, colors: { bottom: 0x4fe0ff, top: 0x2a6bff }, gear: 'shades' },
  { id: 'hero', name: 'Hero', icon: '🦸', price: 800, colors: { bottom: 0x4f8bff, top: 0x2748d8 }, gear: 'cape' },
];

export const skinById = (id) => SKINS.find((skin) => skin.id === id) ?? SKINS[0];

export const defaultSkins = () => ({ owned: [DEFAULT_SKIN], equipped: DEFAULT_SKIN });

// Unknown ids, duplicates and a missing default all fall back to something playable.
export function normalizeSkins(raw) {
  const known = new Set(SKINS.map((skin) => skin.id));
  const owned = [...new Set([DEFAULT_SKIN, ...(Array.isArray(raw?.owned) ? raw.owned : [])])].filter((id) => known.has(id));
  return { owned, equipped: owned.includes(raw?.equipped) ? raw.equipped : DEFAULT_SKIN };
}

export const ownsSkin = (save, id) => save.skins.owned.includes(id);

// Both return { ok, save }: a new save on success, the same one on refusal. Buying equips right away.
export function buySkin(save, id) {
  const skin = SKINS.find((s) => s.id === id);
  if (!skin || ownsSkin(save, id) || save.coins < skin.price) return { ok: false, save };
  return {
    ok: true,
    save: { ...save, coins: save.coins - skin.price, skins: { owned: [...save.skins.owned, id], equipped: id } },
  };
}

export function equipSkin(save, id) {
  if (!ownsSkin(save, id)) return { ok: false, save };
  return { ok: true, save: { ...save, skins: { ...save.skins, equipped: id } } };
}
