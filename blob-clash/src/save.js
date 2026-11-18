// Progress persistence. Storage can be unavailable (private mode), so every access is guarded.
const KEY = 'blob-clash.save.v2';
const DEFAULTS = {
  level: 1, coins: 0, keys: 0, upgrades: { damage: 1, blobs: 1 },
  settings: { sound: true, music: true, vibration: true },
  hats: [],
  hat: null,
};

export function loadSave() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    return {
      ...DEFAULTS, ...saved,
      upgrades: { ...DEFAULTS.upgrades, ...saved?.upgrades },
      settings: { ...DEFAULTS.settings, ...saved?.settings },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // progress just isn't remembered
  }
}
