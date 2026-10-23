// The player's settings and records, persisted through a storage wrapper from
// storage.js. Loading never throws: unreadable data is copied to a
// `<key>:corrupt` slot and replaced with repaired or default values. The v1
// stats key is never deleted.
import { readJson } from './storage.js';
import {
  SAVE_KEY, LEGACY_STATS_KEY,
  createDefaultSave, normalizeSave, legacyStatsFromV1, migrateFromV1, absorbNewerLegacyStats,
  summarizeStats, recordResult, clearStats, applySettings, applyGameSettings,
} from './save-data.js';

export const CORRUPT_SUFFIX = ':corrupt';

// Returns { save, source, notes }. source: 'v2' | 'migrated-v1' | 'new'.
export function loadSave(store) {
  const notes = [];

  const v1 = readJson(store, LEGACY_STATS_KEY);
  const legacy = v1.status === 'ok' ? legacyStatsFromV1(v1.value) : null;
  if (v1.status !== 'missing' && !legacy) {
    store.write(LEGACY_STATS_KEY + CORRUPT_SUFFIX, v1.raw);
    notes.push(`unreadable ${LEGACY_STATS_KEY} copied to ${LEGACY_STATS_KEY + CORRUPT_SUFFIX}`);
  }

  const v2 = readJson(store, SAVE_KEY);
  const existing = v2.status === 'ok' ? normalizeSave(v2.value) : null;
  if (existing) {
    if (legacy && absorbNewerLegacyStats(existing, legacy)) {
      store.write(SAVE_KEY, JSON.stringify(existing));
      notes.push(`added games recorded only in ${LEGACY_STATS_KEY}`);
    }
    return { save: existing, source: 'v2', notes };
  }
  if (v2.status !== 'missing') {
    store.write(SAVE_KEY + CORRUPT_SUFFIX, v2.raw);
    notes.push(`unreadable ${SAVE_KEY} copied to ${SAVE_KEY + CORRUPT_SUFFIX}`);
  }

  const save = legacy ? migrateFromV1(legacy) : createDefaultSave();
  store.write(SAVE_KEY, JSON.stringify(save));
  return { save, source: legacy ? 'migrated-v1' : 'new', notes };
}

export function createProfile(store, { onSaveError = (msg) => console.warn(msg) } = {}) {
  const { save, source, notes } = loadSave(store);
  let reportedSaveError = false;

  function persist({ mirrorStats = false } = {}) {
    let ok = store.write(SAVE_KEY, JSON.stringify(save));
    // Keep the v1 record in step so an older build (e.g. after a rollback)
    // still shows the player's current totals.
    if (mirrorStats) ok = store.write(LEGACY_STATS_KEY, JSON.stringify(summarizeStats(save))) && ok;
    if (!ok && !reportedSaveError) {
      reportedSaveError = true;
      onSaveError('Spirit of the Woods: progress could not be saved in this browser.');
    }
  }

  return {
    source,
    notes,
    settings: () => ({ ...save.settings }),
    gameSettings: () => ({ ...save.shellsFeathers.settings }),
    statsSummary: () => summarizeStats(save),
    // A copy of the Shells & Feathers records (per difficulty, two-player, legacy).
    stats: () => JSON.parse(JSON.stringify(save.shellsFeathers.stats)),
    updateSettings(patch) { applySettings(save, patch); persist(); },
    updateGameSettings(patch) { applyGameSettings(save, patch); persist(); },
    recordResult(result) { recordResult(save, result); persist({ mirrorStats: true }); },
    resetStats() { clearStats(save); persist({ mirrorStats: true }); },
  };
}
