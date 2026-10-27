// Progress persistence. Storage can be unavailable (private mode), so every access is guarded.
import { defaultSave, migrateV2, normalizeSave } from './progress.js';

const KEY = 'blob-clash.save.v3';
const LEGACY_KEY_V2 = 'blob-clash.save.v2';

const read = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null; // missing, unreadable or corrupted
  }
};

export function loadSave() {
  const v3 = read(KEY);
  if (v3) return normalizeSave(v3);
  const v2 = read(LEGACY_KEY_V2);
  return v2 ? migrateV2(v2) : defaultSave();
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // progress just isn't remembered
  }
}

// Fresh start (coins, keys and upgrades included); the v2 save is dropped so it can't migrate back.
export function resetSave() {
  const save = defaultSave();
  try {
    localStorage.removeItem(LEGACY_KEY_V2);
  } catch {
    // nothing to clean up
  }
  writeSave(save);
  return save;
}

// The sound preference lives apart from the progress save, so "new game" doesn't flip it.
const MUTE_KEY = 'blob-clash.muted';

export function loadMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function writeMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
  } catch {
    // the choice just isn't remembered
  }
}
