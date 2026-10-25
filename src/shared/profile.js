// The player's settings, records and achievements, persisted through a
// storage wrapper from storage.js. Loading never throws: unreadable data is
// copied to a `<key>:corrupt` slot and replaced with repaired or default
// values. The v1 stats key is never deleted, except by "Delete all saved
// data", which says so.
//
// When the browser won't store anything (blocked or full storage), every
// change still applies for as long as the page is open; saveFailing() tells
// the screens so they can say progress isn't being kept.
import { readJson } from './storage.js';
import {
  SAVE_KEY, LEGACY_STATS_KEY,
  createDefaultSave, normalizeSave, legacyStatsFromV1, migrateFromV1, absorbNewerLegacyStats,
  summarizeStats, recordResult, clearStats, applySettings, applyGameSettings,
  recordAcornsLeavesResult, clearAcornsLeavesStats, applyAcornsLeavesSettings,
  checkRecordAchievements, recordMoment,
} from './save-data.js';
import { ACHIEVEMENTS, definition } from './achievements.js';

export const CORRUPT_SUFFIX = ':corrupt';
// Every key the game writes, for "Delete all saved data".
export const ALL_KEYS = [SAVE_KEY, LEGACY_STATS_KEY, SAVE_KEY + CORRUPT_SUFFIX, LEGACY_STATS_KEY + CORRUPT_SUFFIX];

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
      checkRecordAchievements(existing, null);
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

const LEVELS = ['easy', 'medium', 'hard'];
const sum = (values) => values.reduce((a, b) => a + b, 0);
const spiritGames = (single) => sum(LEVELS.map((level) => single[level].wins + single[level].draws + single[level].losses));

export function createProfile(store, { onSaveError = (msg) => console.warn(msg), now = () => Date.now() } = {}) {
  const loaded = loadSave(store);
  const { notes } = loaded;
  let { save, source } = loaded;
  let reportedSaveError = false;
  let failing = false;

  function persist({ mirrorStats = false } = {}) {
    let ok = store.write(SAVE_KEY, JSON.stringify(save));
    // Keep the v1 record in step so an older build (e.g. after a rollback)
    // still shows the player's current totals.
    if (mirrorStats) ok = store.write(LEGACY_STATS_KEY, JSON.stringify(summarizeStats(save))) && ok;
    failing = !ok;
    if (!ok && !reportedSaveError) {
      reportedSaveError = true;
      onSaveError('Spirit of the Woods: progress could not be saved in this browser.');
    }
  }

  // [{ game, id }] -> [{ game, id, title, description }]
  const describe = (list) => list.map(({ game, id }) => ({ game, id, ...pick(definition(game, id)) }));
  const pick = ({ title, description }) => ({ title, description });

  function afterResult(record, result, mirrorStats) {
    record(save, result);
    const fresh = checkRecordAchievements(save, now());
    persist({ mirrorStats });
    return describe(fresh);
  }

  return {
    get source() { return source; },
    notes,
    saveFailing: () => failing,
    settings: () => ({ ...save.settings }),
    gameSettings: () => ({ ...save.shellsFeathers.settings }),
    statsSummary: () => summarizeStats(save),
    // A copy of the Shells & Feathers records (per difficulty, two-player, legacy).
    stats: () => JSON.parse(JSON.stringify(save.shellsFeathers.stats)),
    updateSettings(patch) { applySettings(save, patch); persist(); },
    updateGameSettings(patch) { applyGameSettings(save, patch); persist(); },
    // Each returns the achievements this result unlocked (usually none).
    recordResult(result) { return afterResult(recordResult, result, true); },
    resetStats() { clearStats(save); persist({ mirrorStats: true }); },
    // Acorns & Leaves (not part of the v1 totals, so never mirrored).
    acornsLeavesSettings: () => ({ ...save.acornsLeaves.settings }),
    acornsLeavesStats: () => JSON.parse(JSON.stringify(save.acornsLeaves.stats)),
    updateAcornsLeavesSettings(patch) { applyAcornsLeavesSettings(save, patch); persist(); },
    recordAcornsLeavesResult(result) { return afterResult(recordAcornsLeavesResult, result, false); },
    resetAcornsLeavesStats() { clearAcornsLeavesStats(save); persist(); },

    // A moment in play: { game, moment, mode }. Returns achievements unlocked.
    recordMoment(event) {
      const fresh = recordMoment(save, event, now());
      if (fresh.length) persist();
      return describe(fresh);
    },
    // Every achievement of `game`, in order: { id, title, description, unlocked, at }.
    achievements: (game) => ACHIEVEMENTS[game].map(({ id, title, description }) => {
      const entry = save[game].achievements[id];
      return { id, title, description, unlocked: Boolean(entry), at: entry?.at ?? null };
    }),

    // What "Clear progress" for each game would delete, as counts.
    progress() {
      const sf = save.shellsFeathers.stats;
      const al = save.acornsLeaves.stats;
      const unlocked = (game) => Object.keys(save[game].achievements).filter((id) => definition(game, id)).length;
      return {
        shellsFeathers: {
          spiritGames: spiritGames(sf.single),
          twoPlayerGames: sum(Object.values(sf.twoPlayer)),
          earlierGames: sf.legacy.totalGames,
          achievements: unlocked('shellsFeathers'),
        },
        acornsLeaves: {
          spiritGames: spiritGames(al.single),
          twoPlayerGames: sum(Object.values(al.twoPlayer)),
          fogSpiritGames: spiritGames(al.fog.single),
          fogTwoPlayerGames: sum(Object.values(al.fog.twoPlayer)),
          achievements: unlocked('acornsLeaves'),
        },
      };
    },

    // Removes every key the game has stored (see ALL_KEYS), including the
    // original v1 record, and starts again from the defaults in memory.
    // Returns whether every key is gone.
    deleteAllData() {
      const ok = ALL_KEYS.map((key) => store.remove(key)).every(Boolean);
      save = createDefaultSave();
      source = 'new';
      failing = !ok;
      return ok;
    },
  };
}
