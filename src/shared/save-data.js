// The versioned save file (v2) and its migration from v1. Pure functions over
// plain objects; reading and writing localStorage happens in profile.js.
//
// v1 (`spiritOfTheWoodsStats`) was {wins, losses, draws, totalGames}, where
// `wins` also counted every two-player win. v2 keeps those numbers in
// `shellsFeathers.stats.legacy` and records new games per mode and difficulty.
// Acorns & Leaves (added later in v2) has its own settings and records under
// `acornsLeaves`, with Fog of War records apart from Classic ones in
// `acornsLeaves.stats.fog`; a v2 save without them gets the defaults.
//
// Also added within v2, each with a default for older v2 saves:
// - settings.sfxVolume and settings.musicVolume (0–100) and settings.motion
//   ('system' follows the device, 'reduce' or 'full' override it);
// - <game>.achievements: { [id]: { at } }, each achievement unlocked once,
//   `at` being when (ms since 1970), or null for one found in the records of
//   a save made before achievements were kept (see achievements.js). A save
//   without the field gets them worked out from its records, once.
import { SYMBOLS } from '../games/shells-feathers/rules.js';
import { DIFFICULTIES } from '../games/shells-feathers/ai.js';
import { SIDES } from '../games/acorns-leaves/engine.js';
import { DIFFICULTIES as AL_DIFFICULTIES } from '../games/acorns-leaves/ai.js';
import { GAMES, definition, earnedFromRecords, earnedByMoment } from './achievements.js';

export const SAVE_VERSION = 2;
export const SAVE_KEY = 'spiritOfTheWoods:v2';
export const LEGACY_STATS_KEY = 'spiritOfTheWoodsStats';

const LEGACY_FIELDS = ['wins', 'losses', 'draws', 'totalGames'];
const SINGLE_FIELDS = ['wins', 'losses', 'draws'];
const TWO_PLAYER_FIELDS = ['player1Wins', 'player2Wins', 'draws'];
const AL_TWO_PLAYER_FIELDS = ['acornWins', 'leafWins', 'draws'];
const AL_VARIANTS = ['classic', 'fog'];
export const MOTION_CHOICES = ['system', 'reduce', 'full'];
export const DEFAULT_SETTINGS = { sfx: true, music: true, sfxVolume: 50, musicVolume: 30, motion: 'system' };

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const objectOr = (value) => (isObject(value) ? value : {});
const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const boolOr = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
// A whole percentage, 0–100.
const percentOr = (value, fallback) => (
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? Math.round(value) : fallback
);

// Unlocked achievements: keeps entries shaped { at: number | null }, for ids
// this build knows and ones it doesn't (a newer build's), and drops the rest.
function achievementsOr(raw) {
  return Object.fromEntries(Object.entries(objectOr(raw)).flatMap(([id, entry]) => {
    if (!isObject(entry)) return [];
    const at = typeof entry.at === 'number' && Number.isFinite(entry.at) ? entry.at : null;
    return [[id, { ...entry, at }]];
  }));
}

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

// One set of checkers records: per Spirit difficulty, and two players.
function checkersRecords(raw = {}) {
  const single = objectOr(raw.single);
  return {
    single: { ...single, ...Object.fromEntries(AL_DIFFICULTIES.map((d) => [d, countsOf(single[d], SINGLE_FIELDS)])) },
    twoPlayer: countsOf(raw.twoPlayer, AL_TWO_PLAYER_FIELDS),
  };
}

function emptyAcornsLeavesStats() {
  return { ...checkersRecords(), fog: checkersRecords() };
}

export function createDefaultSave() {
  return {
    version: SAVE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    shellsFeathers: {
      settings: { difficulty: 'easy', player1Symbol: 'shell' },
      stats: emptyStats(),
      achievements: {},
    },
    // side: the side the player takes against the Spirit; variant: the rules
    // last chosen ('classic' or 'fog').
    acornsLeaves: {
      settings: { difficulty: 'easy', side: 'acorn', variant: 'classic' },
      stats: emptyAcornsLeavesStats(),
      achievements: {},
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
  const checkers = objectOr(raw.acornsLeaves);
  const checkersSettings = objectOr(checkers.settings);
  const checkersStats = objectOr(checkers.stats);

  const save = {
    ...raw,
    settings: {
      ...settings,
      sfx: boolOr(settings.sfx, DEFAULT_SETTINGS.sfx),
      music: boolOr(settings.music, DEFAULT_SETTINGS.music),
      sfxVolume: percentOr(settings.sfxVolume, DEFAULT_SETTINGS.sfxVolume),
      musicVolume: percentOr(settings.musicVolume, DEFAULT_SETTINGS.musicVolume),
      motion: oneOf(settings.motion, MOTION_CHOICES, DEFAULT_SETTINGS.motion),
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
      achievements: achievementsOr(game.achievements),
    },
    acornsLeaves: {
      ...checkers,
      settings: {
        ...checkersSettings,
        difficulty: oneOf(checkersSettings.difficulty, AL_DIFFICULTIES, 'easy'),
        side: oneOf(checkersSettings.side, SIDES, 'acorn'),
        variant: oneOf(checkersSettings.variant, AL_VARIANTS, 'classic'),
      },
      stats: {
        ...checkersStats,
        ...checkersRecords(checkersStats),
        fog: { ...objectOr(checkersStats.fog), ...checkersRecords(objectOr(checkersStats.fog)) },
      },
      achievements: achievementsOr(checkers.achievements),
    },
    migratedFrom: raw.migratedFrom === 1 ? 1 : null,
  };
  // A save from before achievements were kept: unlock what its records have
  // already earned (with no date), once.
  for (const name of GAMES) {
    if (!isObject(objectOr(raw[name]).achievements)) backfillAchievements(save, name);
  }
  return save;
}

// Repaired v1 counts, or null when the stored value isn't a v1 object.
export function legacyStatsFromV1(raw) {
  return isObject(raw) ? legacyCounts(raw) : null;
}

export function migrateFromV1(legacy) {
  const save = createDefaultSave();
  save.shellsFeathers.stats.legacy = { ...legacy };
  save.migratedFrom = 1;
  backfillAchievements(save, 'shellsFeathers');
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

// Clears every Shells & Feathers record (including games from before v2)
// and locks its achievements again. Its settings are kept.
export function clearStats(save) {
  save.shellsFeathers.stats = emptyStats();
  save.shellsFeathers.achievements = {};
}

export function applySettings(save, patch) {
  for (const key of ['sfx', 'music']) {
    if (typeof patch[key] === 'boolean') save.settings[key] = patch[key];
  }
  for (const key of ['sfxVolume', 'musicVolume']) save.settings[key] = percentOr(patch[key], save.settings[key]);
  save.settings.motion = oneOf(patch.motion, MOTION_CHOICES, save.settings.motion);
}

export function applyGameSettings(save, patch) {
  const settings = save.shellsFeathers.settings;
  settings.difficulty = oneOf(patch.difficulty, DIFFICULTIES, settings.difficulty);
  settings.player1Symbol = oneOf(patch.player1Symbol, SYMBOLS, settings.player1Symbol);
}

// Acorns & Leaves. outcome: 'win' | 'loss' | 'draw' against the Spirit (from
// the player's side), 'acorn' | 'leaf' | 'draw' for two players; variant
// 'fog' records into the Fog of War records. Mutates `save`.
export function recordAcornsLeavesResult(save, { mode, difficulty, outcome, variant = 'classic' }) {
  const stats = variant === 'fog' ? save.acornsLeaves.stats.fog : save.acornsLeaves.stats;
  if (mode === 'single') {
    const record = stats.single[oneOf(difficulty, AL_DIFFICULTIES, 'easy')];
    if (outcome === 'win') record.wins++;
    else if (outcome === 'loss') record.losses++;
    else if (outcome === 'draw') record.draws++;
  } else if (mode === 'two') {
    if (outcome === 'acorn') stats.twoPlayer.acornWins++;
    else if (outcome === 'leaf') stats.twoPlayer.leafWins++;
    else if (outcome === 'draw') stats.twoPlayer.draws++;
  }
}

// Clears every Acorns & Leaves record (Classic and Fog) and locks its
// achievements again. Its settings are kept.
export function clearAcornsLeavesStats(save) {
  save.acornsLeaves.stats = emptyAcornsLeavesStats();
  save.acornsLeaves.achievements = {};
}

export function applyAcornsLeavesSettings(save, patch) {
  const settings = save.acornsLeaves.settings;
  settings.difficulty = oneOf(patch.difficulty, AL_DIFFICULTIES, settings.difficulty);
  settings.side = oneOf(patch.side, SIDES, settings.side);
  settings.variant = oneOf(patch.variant, AL_VARIANTS, settings.variant);
}

// Achievements -------------------------------------------------------------

const recordsOf = (save) => ({
  shellsFeathers: { stats: save.shellsFeathers.stats, totals: summarizeStats(save) },
  acornsLeaves: { stats: save.acornsLeaves.stats },
});

// Unlocks `ids` of `game` that aren't unlocked yet, at time `at`. Returns the
// ids newly unlocked (each id only ever once). Mutates `save`.
export function unlockAchievements(save, game, ids, at) {
  const unlocked = save[game].achievements;
  const fresh = [...new Set(ids)].filter((id) => definition(game, id) && !Object.hasOwn(unlocked, id));
  for (const id of fresh) unlocked[id] = { at };
  return fresh;
}

function backfillAchievements(save, game) {
  unlockAchievements(save, game, earnedFromRecords(game, recordsOf(save)), null);
}

// After a result is recorded: unlocks the record achievements now earned.
// Returns [{ game, id }] for the new ones. Mutates `save`.
export function checkRecordAchievements(save, at) {
  const records = recordsOf(save);
  return GAMES.flatMap((game) => unlockAchievements(save, game, earnedFromRecords(game, records), at).map((id) => ({ game, id })));
}

// A moment in play ('crowned', 'multi-jump'), counted only in games against
// the Spirit. Returns [{ game, id }] for achievements newly unlocked.
export function recordMoment(save, { game, moment, mode }, at) {
  if (mode !== 'single' || !GAMES.includes(game)) return [];
  return unlockAchievements(save, game, earnedByMoment(game, moment), at).map((id) => ({ game, id }));
}
