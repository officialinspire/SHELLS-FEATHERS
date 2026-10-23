// The versioned save file (v2) and its migration from v1. Pure functions over
// plain objects; reading and writing localStorage happens in profile.js.
//
// v1 (`spiritOfTheWoodsStats`) was {wins, losses, draws, totalGames}, where
// `wins` also counted every two-player win. v2 keeps those numbers in
// `shellsFeathers.stats.legacy` and records new games per mode and difficulty.
import { SYMBOLS } from '../games/shells-feathers/rules.js';
import { DIFFICULTIES } from '../games/shells-feathers/ai.js';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'spiritOfTheWoods:v2';
export const LEGACY_STATS_KEY = 'spiritOfTheWoodsStats';

const LEGACY_FIELDS = ['wins', 'losses', 'draws', 'totalGames'];
const SINGLE_FIELDS = ['wins', 'losses', 'draws'];
const TWO_PLAYER_FIELDS = ['player1Wins', 'player2Wins', 'draws'];

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const objectOr = (value) => (isObject(value) ? value : {});
const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const boolOr = (value, fallback) => (typeof value === 'boolean' ? value : fallback);

// A non-negative safe integer. Numeric strings are accepted (v1 data may have
// been hand-edited); anything else counts as 0.
export function toCount(value) {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n) || n <= 0) return 0;
  return Math.min(Math.floor(n), Number.MAX_SAFE_INTEGER);
}

const countsOf = (raw, fields) => Object.fromEntries(fields.map((f) => [f, toCount(objectOr(raw)[f])]));

function legacyCounts(raw) {
  const counts = countsOf(raw, LEGACY_FIELDS);
  counts.totalGames = Math.max(counts.totalGames, counts.wins + counts.losses + counts.draws);
  return counts;
}

function emptyStats() {
  return {
    single: Object.fromEntries(DIFFICULTIES.map((d) => [d, countsOf({}, SINGLE_FIELDS)])),
    twoPlayer: countsOf({}, TWO_PLAYER_FIELDS),
    legacy: countsOf({}, LEGACY_FIELDS),
  };
}

export function createDefaultSave() {
  return {
    version: SAVE_VERSION,
    settings: { sfx: true, music: true },
    shellsFeathers: {
      settings: { difficulty: 'easy', player1Symbol: 'shell' },
      stats: emptyStats(),
    },
    migratedFrom: null,
  };
}

// Returns a valid v2 save built from `raw`, or null when `raw` is not a v2
// save at all. Bad values are repaired field by field; unknown fields are kept
// so a newer build's data survives a round trip through this one.
export function normalizeSave(raw) {
  if (!isObject(raw) || raw.version !== SAVE_VERSION) return null;
  const settings = objectOr(raw.settings);
  const game = objectOr(raw.shellsFeathers);
  const gameSettings = objectOr(game.settings);
  const stats = objectOr(game.stats);
  const single = objectOr(stats.single);

  return {
    ...raw,
    settings: {
      ...settings,
      sfx: boolOr(settings.sfx, true),
      music: boolOr(settings.music, true),
    },
    shellsFeathers: {
      ...game,
      settings: {
        ...gameSettings,
        difficulty: oneOf(gameSettings.difficulty, DIFFICULTIES, 'easy'),
        player1Symbol: oneOf(gameSettings.player1Symbol, SYMBOLS, 'shell'),
      },
      stats: {
        ...stats,
        single: { ...single, ...Object.fromEntries(DIFFICULTIES.map((d) => [d, countsOf(single[d], SINGLE_FIELDS)])) },
        twoPlayer: countsOf(stats.twoPlayer, TWO_PLAYER_FIELDS),
        legacy: legacyCounts(stats.legacy),
      },
    },
    migratedFrom: raw.migratedFrom === 1 ? 1 : null,
  };
}

// Repaired v1 counts, or null when the stored value isn't a v1 object.
export function legacyStatsFromV1(raw) {
  return isObject(raw) ? legacyCounts(raw) : null;
}

export function migrateFromV1(legacy) {
  const save = createDefaultSave();
  save.shellsFeathers.stats.legacy = { ...legacy };
  save.migratedFrom = 1;
  return save;
}

// Totals in v1 terms; "Your Path" shows these, and profile.js mirrors them
// into the v1 key so an older build still shows the right numbers.
export function summarizeStats(save) {
  const { single, twoPlayer, legacy } = save.shellsFeathers.stats;
  const total = { ...legacy };
  for (const d of DIFFICULTIES) {
    const { wins, losses, draws } = single[d];
    total.wins += wins;
    total.losses += losses;
    total.draws += draws;
    total.totalGames += wins + losses + draws;
  }
  // v1 counted every two-player win as a victory, whichever player won.
  total.wins += twoPlayer.player1Wins + twoPlayer.player2Wins;
  total.draws += twoPlayer.draws;
  total.totalGames += twoPlayer.player1Wins + twoPlayer.player2Wins + twoPlayer.draws;
  return total;
}

// If the v1 record holds more games than the v2 save (an older build kept
// playing after a rollback), adds the difference to the legacy bucket so
// those games aren't lost. Mutates `save`; returns whether anything changed.
export function absorbNewerLegacyStats(save, legacy) {
  const current = summarizeStats(save);
  if (legacy.totalGames <= current.totalGames) return false;
  const bucket = save.shellsFeathers.stats.legacy;
  for (const field of LEGACY_FIELDS) bucket[field] += Math.max(0, legacy[field] - current[field]);
  return true;
}

// outcome: 'win' | 'loss' | 'draw' for single player (from the human's side),
// 'player1' | 'player2' | 'draw' for two players. Mutates `save`.
export function recordResult(save, { mode, difficulty, outcome }) {
  const stats = save.shellsFeathers.stats;
  if (mode === 'single') {
    const record = stats.single[oneOf(difficulty, DIFFICULTIES, 'easy')];
    if (outcome === 'win') record.wins++;
    else if (outcome === 'loss') record.losses++;
    else if (outcome === 'draw') record.draws++;
  } else if (mode === 'two') {
    if (outcome === 'player1') stats.twoPlayer.player1Wins++;
    else if (outcome === 'player2') stats.twoPlayer.player2Wins++;
    else if (outcome === 'draw') stats.twoPlayer.draws++;
  }
}

export function clearStats(save) {
  save.shellsFeathers.stats = emptyStats();
}

export function applySettings(save, patch) {
  for (const key of ['sfx', 'music']) {
    if (typeof patch[key] === 'boolean') save.settings[key] = patch[key];
  }
}

export function applyGameSettings(save, patch) {
  const settings = save.shellsFeathers.settings;
  settings.difficulty = oneOf(patch.difficulty, DIFFICULTIES, settings.difficulty);
  settings.player1Symbol = oneOf(patch.player1Symbol, SYMBOLS, settings.player1Symbol);
}
