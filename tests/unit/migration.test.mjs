// Migration of the v1 `spiritOfTheWoodsStats` record into the versioned save,
// and handling of malformed or unavailable storage.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SAVE_KEY, LEGACY_STATS_KEY, createDefaultSave, normalizeSave, legacyStatsFromV1, toCount, summarizeStats,
} from '../../src/shared/save-data.js';
import { createProfile, loadSave, CORRUPT_SUFFIX } from '../../src/shared/profile.js';
import { openStorage } from '../../src/shared/storage.js';
import { createMemoryStorage } from '../helpers/fakes.mjs';

const V1 = JSON.stringify({ wins: 3, losses: 1, draws: 2, totalGames: 6 });

function load(entries, options) {
  const area = createMemoryStorage(entries, options);
  const result = loadSave(openStorage(() => area));
  return { ...result, area, stored: (key) => area.map.get(key) };
}

test('toCount keeps non-negative safe integers and zeroes everything else', () => {
  const cases = [
    [3, 3], ['3', 3], [' 7 ', 7], [2.9, 2], [0, 0], [-4, 0], ['-4', 0], [NaN, 0], [Infinity, 0],
    [1e309, 0], [2 ** 60, Number.MAX_SAFE_INTEGER], [null, 0], [undefined, 0], ['', 0], ['abc', 0],
    [true, 0], [{}, 0], [[], 0],
  ];
  for (const [input, expected] of cases) assert.equal(toCount(input), expected, `toCount(${String(input)})`);
});

test('nothing stored: defaults are written as v2', () => {
  const { save, source, stored } = load({});
  assert.equal(source, 'new');
  assert.deepEqual(save, createDefaultSave());
  assert.deepEqual(JSON.parse(stored(SAVE_KEY)), createDefaultSave());
  assert.equal(stored(LEGACY_STATS_KEY), undefined, 'no v1 key is invented');
});

test('valid v1 stats move into the legacy bucket; the v1 key is left as it was', () => {
  const { save, source, stored } = load({ [LEGACY_STATS_KEY]: V1 });
  assert.equal(source, 'migrated-v1');
  assert.equal(save.migratedFrom, 1);
  assert.deepEqual(save.shellsFeathers.stats.legacy, { wins: 3, losses: 1, draws: 2, totalGames: 6 });
  assert.deepEqual(summarizeStats(save), { wins: 3, losses: 1, draws: 2, totalGames: 6 }, '"Your Path" totals unchanged');
  assert.equal(stored(LEGACY_STATS_KEY), V1);
  assert.deepEqual(JSON.parse(stored(SAVE_KEY)), save);
});

test('odd but readable v1 values are repaired, not discarded', () => {
  const cases = [
    [{}, { wins: 0, losses: 0, draws: 0, totalGames: 0 }],
    [{ wins: '3', losses: 0, draws: 0, totalGames: '3' }, { wins: 3, losses: 0, draws: 0, totalGames: 3 }],
    [{ wins: -2, losses: 'x', draws: null, totalGames: 1e309 }, { wins: 0, losses: 0, draws: 0, totalGames: 0 }],
    [{ wins: 4, losses: 2, draws: 1, totalGames: 3 }, { wins: 4, losses: 2, draws: 1, totalGames: 7 }],
    // v1 saved NaN as null after `{}` went through `wins++`
    [{ totalGames: null, wins: null }, { wins: 0, losses: 0, draws: 0, totalGames: 0 }],
  ];
  for (const [v1, legacy] of cases) {
    const { save, source } = load({ [LEGACY_STATS_KEY]: JSON.stringify(v1) });
    assert.equal(source, 'migrated-v1', JSON.stringify(v1));
    assert.deepEqual(save.shellsFeathers.stats.legacy, legacy, JSON.stringify(v1));
  }
});

test('unreadable v1 values start fresh and are copied aside, never thrown away', () => {
  for (const raw of ['{bad json', 'null', '[]', '"text"', '42', 'undefined']) {
    const { save, source, stored, notes } = load({ [LEGACY_STATS_KEY]: raw });
    assert.equal(source, 'new', raw);
    assert.deepEqual(summarizeStats(save), { wins: 0, losses: 0, draws: 0, totalGames: 0 }, raw);
    assert.equal(stored(LEGACY_STATS_KEY), raw, `${raw}: v1 key untouched`);
    assert.equal(stored(LEGACY_STATS_KEY + CORRUPT_SUFFIX), raw, `${raw}: copy kept`);
    assert.equal(notes.length, 1, raw);
  }
});

test('a valid v2 save is used as is, including fields this build does not know', () => {
  const v2 = createDefaultSave();
  v2.settings.music = false;
  v2.shellsFeathers.settings.difficulty = 'hard';
  v2.shellsFeathers.stats.single.medium.wins = 5;
  v2.futureFeature = { keep: true };
  v2.shellsFeathers.stats.single.legend = { wins: 1 };
  // The v1 key mirrors v2's totals, as profile.js keeps it.
  const mirror = JSON.stringify({ wins: 5, losses: 0, draws: 0, totalGames: 5 });
  const { save, source, notes } = load({ [SAVE_KEY]: JSON.stringify(v2), [LEGACY_STATS_KEY]: mirror });
  assert.equal(source, 'v2');
  assert.deepEqual(save, v2);
  assert.deepEqual(notes, []);
});

test('a corrupt v2 save is copied aside and rebuilt from v1', () => {
  for (const raw of ['{oops', 'null', '{"version":1}', '[]']) {
    const { save, source, stored } = load({ [SAVE_KEY]: raw, [LEGACY_STATS_KEY]: V1 });
    assert.equal(source, 'migrated-v1', raw);
    assert.deepEqual(summarizeStats(save), { wins: 3, losses: 1, draws: 2, totalGames: 6 }, raw);
    assert.equal(stored(SAVE_KEY + CORRUPT_SUFFIX), raw, raw);
    assert.deepEqual(JSON.parse(stored(SAVE_KEY)), save, raw);
  }
});

test('a v2 save with bad fields is repaired field by field', () => {
  const raw = {
    version: 2,
    settings: { sfx: 'yes', music: false, sfxVolume: 140, musicVolume: '20', motion: 'wild' },
    shellsFeathers: {
      settings: { difficulty: 'impossible', player1Symbol: 'feather' },
      stats: { single: { easy: { wins: '2', losses: -1 }, hard: 'x' }, twoPlayer: null, legacy: { wins: 1 } },
    },
  };
  const save = normalizeSave(raw);
  assert.deepEqual(save.settings, { sfx: true, music: false, sfxVolume: 50, musicVolume: 30, motion: 'system' });
  assert.deepEqual(save.shellsFeathers.settings, { difficulty: 'easy', player1Symbol: 'feather' });
  assert.deepEqual(save.shellsFeathers.stats.single.easy, { wins: 2, losses: 0, draws: 0 });
  assert.deepEqual(save.shellsFeathers.stats.single.hard, { wins: 0, losses: 0, draws: 0 });
  assert.deepEqual(save.shellsFeathers.stats.twoPlayer, { player1Wins: 0, player2Wins: 0, draws: 0 });
  assert.deepEqual(save.shellsFeathers.stats.legacy, { wins: 1, losses: 0, draws: 0, totalGames: 1 });
  assert.equal(save.migratedFrom, null);
});

test('games an older build added to v1 after the upgrade are folded back in', () => {
  // v2 knows 6 legacy games; v1 (written by an older build after a rollback) has 8.
  const v2 = createDefaultSave();
  v2.shellsFeathers.stats.legacy = { wins: 3, losses: 1, draws: 2, totalGames: 6 };
  const v1 = JSON.stringify({ wins: 4, losses: 2, draws: 2, totalGames: 8 });
  const { save, stored } = load({ [SAVE_KEY]: JSON.stringify(v2), [LEGACY_STATS_KEY]: v1 });
  assert.deepEqual(summarizeStats(save), { wins: 4, losses: 2, draws: 2, totalGames: 8 });
  assert.deepEqual(JSON.parse(stored(SAVE_KEY)), save);

  // Loading again changes nothing (no double counting).
  const again = load({ [SAVE_KEY]: stored(SAVE_KEY), [LEGACY_STATS_KEY]: v1 });
  assert.deepEqual(summarizeStats(again.save), { wins: 4, losses: 2, draws: 2, totalGames: 8 });
});

test('recording a game keeps the v1 key in step (rollback safety); a fresh profile reads the same totals', () => {
  const area = createMemoryStorage({ [LEGACY_STATS_KEY]: V1 });
  const profile = createProfile(openStorage(() => area));
  profile.recordResult({ mode: 'single', difficulty: 'hard', outcome: 'draw' });
  profile.recordResult({ mode: 'two', outcome: 'player2' });
  const expected = { wins: 4, losses: 1, draws: 3, totalGames: 8 };
  assert.deepEqual(profile.statsSummary(), expected);
  assert.deepEqual(JSON.parse(area.map.get(LEGACY_STATS_KEY)), expected);

  const reloaded = createProfile(openStorage(() => area));
  assert.equal(reloaded.source, 'v2');
  assert.deepEqual(reloaded.statsSummary(), expected);
  assert.deepEqual(reloaded.notes, []);
});

test('"Clear Path" resets every bucket, including legacy and the v1 mirror', () => {
  const area = createMemoryStorage({ [LEGACY_STATS_KEY]: V1 });
  const profile = createProfile(openStorage(() => area));
  profile.resetStats();
  const zero = { wins: 0, losses: 0, draws: 0, totalGames: 0 };
  assert.deepEqual(profile.statsSummary(), zero);
  assert.deepEqual(JSON.parse(area.map.get(LEGACY_STATS_KEY)), zero);
  assert.deepEqual(createProfile(openStorage(() => area)).statsSummary(), zero);
});

test('settings are validated and saved', () => {
  const area = createMemoryStorage();
  const profile = createProfile(openStorage(() => area));
  profile.updateSettings({ music: false, sfx: 'nope' });
  profile.updateSettings({ sfxVolume: 35, musicVolume: 72.6, motion: 'reduce' });
  profile.updateSettings({ sfxVolume: -5, musicVolume: NaN, motion: 'fast' }); // ignored
  profile.updateGameSettings({ difficulty: 'medium', player1Symbol: 'dragon' });
  const reloaded = createProfile(openStorage(() => area));
  assert.deepEqual(reloaded.settings(), { sfx: true, music: false, sfxVolume: 35, musicVolume: 73, motion: 'reduce' });
  assert.deepEqual(reloaded.gameSettings(), { difficulty: 'medium', player1Symbol: 'shell' });
});

test('storage that throws on every call: defaults in memory, nothing throws', () => {
  const errors = [];
  const area = createMemoryStorage({ [LEGACY_STATS_KEY]: V1 }, { failReads: true, failWrites: true });
  const profile = createProfile(openStorage(() => area), { onSaveError: (m) => errors.push(m) });
  assert.equal(profile.source, 'new');
  profile.recordResult({ mode: 'single', difficulty: 'easy', outcome: 'win' });
  profile.recordResult({ mode: 'single', difficulty: 'easy', outcome: 'win' });
  assert.deepEqual(profile.statsSummary(), { wins: 2, losses: 0, draws: 0, totalGames: 2 }, 'kept for the session');
  assert.equal(errors.length, 1, 'save failure reported once');
});

test('storage that cannot even be opened (getter throws) behaves the same', () => {
  const profile = createProfile(openStorage(() => { throw new Error('SecurityError'); }), { onSaveError: () => {} });
  profile.recordResult({ mode: 'two', outcome: 'draw' });
  assert.deepEqual(profile.statsSummary(), { wins: 0, losses: 0, draws: 1, totalGames: 1 });
});

test('readable storage whose writes fail (quota) still loads existing records', () => {
  const area = createMemoryStorage({ [LEGACY_STATS_KEY]: V1 }, { failWrites: true });
  const profile = createProfile(openStorage(() => area), { onSaveError: () => {} });
  assert.equal(profile.source, 'migrated-v1');
  assert.deepEqual(profile.statsSummary(), { wins: 3, losses: 1, draws: 2, totalGames: 6 });
  assert.equal(area.map.get(LEGACY_STATS_KEY), V1);
});

test('legacyStatsFromV1 accepts only plain objects', () => {
  assert.equal(legacyStatsFromV1(null), null);
  assert.equal(legacyStatsFromV1([1, 2]), null);
  assert.equal(legacyStatsFromV1('3'), null);
  assert.deepEqual(legacyStatsFromV1({ wins: 1 }), { wins: 1, losses: 0, draws: 0, totalGames: 1 });
});

// ------------------------------------------------------------ Acorns & Leaves

test('a v2 save from before Acorns & Leaves gains its defaults; nothing else changes', () => {
  const before = createDefaultSave();
  delete before.acornsLeaves;
  before.shellsFeathers.stats.single.hard.draws = 4;
  before.shellsFeathers.settings.player1Symbol = 'feather';
  const mirror = JSON.stringify({ wins: 0, losses: 0, draws: 4, totalGames: 4 });
  const { save, source, stored } = load({ [SAVE_KEY]: JSON.stringify(before), [LEGACY_STATS_KEY]: mirror });
  assert.equal(source, 'v2');
  assert.deepEqual(save.shellsFeathers, before.shellsFeathers);
  assert.deepEqual(save.acornsLeaves, createDefaultSave().acornsLeaves);
  assert.deepEqual(save.acornsLeaves.settings, { difficulty: 'easy', side: 'acorn', variant: 'classic' });
  assert.deepEqual(save.acornsLeaves.stats.fog.twoPlayer, { acornWins: 0, leafWins: 0, draws: 0 });
  assert.deepEqual(save.acornsLeaves.stats.twoPlayer, { acornWins: 0, leafWins: 0, draws: 0 });
  assert.equal(stored(LEGACY_STATS_KEY), mirror);
});

test('bad Acorns & Leaves fields are repaired field by field; unknown ones are kept', () => {
  const raw = createDefaultSave();
  raw.acornsLeaves = {
    settings: { difficulty: 'grandmaster', side: 'leaf', variant: 'darkness', boardTheme: 'birch' },
    stats: { single: { medium: { wins: '3', draws: -2 }, hard: null }, twoPlayer: { acornWins: 2, leafWins: 'x' }, streak: 5 },
  };
  const save = normalizeSave(raw);
  assert.deepEqual(save.acornsLeaves.settings, { difficulty: 'easy', side: 'leaf', variant: 'classic', boardTheme: 'birch' });
  assert.deepEqual(save.acornsLeaves.stats.single.medium, { wins: 3, losses: 0, draws: 0 });
  assert.deepEqual(save.acornsLeaves.stats.single.hard, { wins: 0, losses: 0, draws: 0 });
  assert.deepEqual(save.acornsLeaves.stats.twoPlayer, { acornWins: 2, leafWins: 0, draws: 0 });
  assert.equal(save.acornsLeaves.stats.streak, 5);
  for (const junk of [null, 'x', [], { settings: 7, stats: [] }]) {
    raw.acornsLeaves = junk;
    assert.deepEqual(normalizeSave(raw).acornsLeaves, createDefaultSave().acornsLeaves, JSON.stringify(junk));
  }
});

test('Acorns & Leaves records and settings are saved apart from Shells & Feathers and its v1 totals', () => {
  const area = createMemoryStorage({ [LEGACY_STATS_KEY]: V1 });
  const profile = createProfile(openStorage(() => area));
  profile.recordAcornsLeavesResult({ mode: 'single', difficulty: 'hard', outcome: 'win' });
  profile.recordAcornsLeavesResult({ mode: 'single', difficulty: 'medium', outcome: 'loss' });
  profile.recordAcornsLeavesResult({ mode: 'single', difficulty: 'nonsense', outcome: 'draw' });
  profile.recordAcornsLeavesResult({ mode: 'two', outcome: 'leaf' });
  profile.recordAcornsLeavesResult({ mode: 'two', outcome: 'draw' });
  profile.updateAcornsLeavesSettings({ side: 'leaf', difficulty: 'hard', variant: 'fog' });
  profile.updateAcornsLeavesSettings({ side: 'pinecone', difficulty: 'impossible', variant: 'smoke' });
  profile.recordAcornsLeavesResult({ mode: 'single', difficulty: 'hard', outcome: 'loss', variant: 'fog' });
  profile.recordAcornsLeavesResult({ mode: 'two', outcome: 'acorn', variant: 'fog' });

  const reloaded = createProfile(openStorage(() => area));
  assert.deepEqual(reloaded.acornsLeavesSettings(), { side: 'leaf', difficulty: 'hard', variant: 'fog' });
  const stats = reloaded.acornsLeavesStats();
  assert.deepEqual(stats.single, {
    easy: { wins: 0, losses: 0, draws: 1 },
    medium: { wins: 0, losses: 1, draws: 0 },
    hard: { wins: 1, losses: 0, draws: 0 },
  });
  assert.deepEqual(stats.twoPlayer, { acornWins: 0, leafWins: 1, draws: 1 });
  assert.deepEqual(stats.fog.single.hard, { wins: 0, losses: 1, draws: 0 }, 'Fog games are kept apart');
  assert.deepEqual(stats.fog.twoPlayer, { acornWins: 1, leafWins: 0, draws: 0 });
  assert.deepEqual(stats.single.hard, { wins: 1, losses: 0, draws: 0 }, 'Classic records untouched by Fog games');
  assert.deepEqual(reloaded.statsSummary(), { wins: 3, losses: 1, draws: 2, totalGames: 6 }, 'Shells & Feathers totals untouched');
  assert.equal(area.map.get(LEGACY_STATS_KEY), V1, 'checkers games never reach the v1 record');

  // Each game's Clear button clears only that game.
  reloaded.resetStats();
  assert.equal(reloaded.acornsLeavesStats().twoPlayer.leafWins, 1);
  reloaded.resetAcornsLeavesStats();
  assert.deepEqual(reloaded.acornsLeavesStats(), createDefaultSave().acornsLeaves.stats);
  const copy = reloaded.acornsLeavesStats();
  copy.twoPlayer.draws = 99;
  assert.equal(reloaded.acornsLeavesStats().twoPlayer.draws, 0, 'callers get a copy');
});
