// Achievements for both games and the Your Path data they come from: which
// records and moments unlock what, unlocking each once (and keeping it across
// reloads), saves from before achievements were kept, clearing one game, and
// storage that won't save.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, earnedFromRecords } from '../../src/shared/achievements.js';
import { createDefaultSave, summarizeStats, normalizeSave, SAVE_KEY, LEGACY_STATS_KEY } from '../../src/shared/save-data.js';
import { createProfile } from '../../src/shared/profile.js';
import { openStorage } from '../../src/shared/storage.js';
import { createMemoryStorage } from '../helpers/fakes.mjs';

const records = (save) => ({
  shellsFeathers: { stats: save.shellsFeathers.stats, totals: summarizeStats(save) },
  acornsLeaves: { stats: save.acornsLeaves.stats },
});
const earned = (save, game) => earnedFromRecords(game, records(save));
const unlockedIds = (profile, game) => profile.achievements(game).filter((a) => a.unlocked).map((a) => a.id);
const ids = (list) => list.map((a) => `${a.game}:${a.id}`);

function newProfile(entries = {}, options = {}) {
  const storage = createMemoryStorage(entries, options.storage);
  let time = 1000;
  const errors = [];
  const profile = createProfile(openStorage(() => storage), { now: () => time, onSaveError: (m) => errors.push(m) });
  return { storage, profile, errors, tick: () => { time += 1000; } };
}

test('a new player has every achievement locked: nine in Shells & Feathers, ten in Acorns & Leaves, three in the Collection', () => {
  const { profile } = newProfile();
  assert.deepEqual(profile.achievements('shellsFeathers').map((a) => a.id),
    ['first-game', 'ten-games', 'first-win', 'shell-win', 'feather-win', 'gentle-win', 'balanced-win', 'steady-hand', 'shared-board']);
  assert.deepEqual(profile.achievements('acornsLeaves').map((a) => a.id),
    ['first-game', 'first-win', 'acorn-win', 'leaf-win', 'crowned', 'double-jump', 'fog-win', 'wise-win', 'shared-board', 'shared-fog']);
  assert.deepEqual(profile.achievements('collection').map((a) => a.id), ['both-games', 'both-wins', 'all-sides']);
  for (const book of ['shellsFeathers', 'acornsLeaves', 'collection']) {
    assert.ok(profile.achievements(book).every((a) => !a.unlocked && a.at === null && a.title && a.description && a.icon));
  }
  assert.deepEqual(profile.journal().total, 22);
});

test('Shells & Feathers: each record achievement comes from the matching record', () => {
  const cases = [
    [(s) => { s.single.easy.wins = 1; }, ['first-game', 'first-win', 'gentle-win']],
    [(s) => { s.single.medium.wins = 1; }, ['first-game', 'first-win', 'balanced-win']],
    [(s) => { s.single.hard.draws = 1; }, ['first-game', 'steady-hand']],
    [(s) => { s.single.hard.losses = 1; }, ['first-game']],
    [(s) => { s.twoPlayer.draws = 1; }, ['first-game', 'shared-board']],
    // Two-player wins belong to whichever player won: never "First Win".
    [(s) => { s.twoPlayer.player1Wins = 10; }, ['first-game', 'ten-games', 'shared-board']],
  ];
  for (const [change, expected] of cases) {
    const save = createDefaultSave();
    change(save.shellsFeathers.stats);
    assert.deepEqual(earned(save, 'shellsFeathers'), expected);
  }
});

test('Acorns & Leaves: First Win, Through the Fog and Wise Victory need wins against the Spirit; two-player games give First Game and the shared entries only', () => {
  const cases = [
    [(s) => { s.single.easy.wins = 1; }, ['first-game', 'first-win']],
    [(s) => { s.fog.single.easy.wins = 1; }, ['first-game', 'first-win', 'fog-win']],
    [(s) => { s.single.hard.wins = 1; }, ['first-game', 'first-win', 'wise-win']],
    [(s) => { s.fog.single.hard.wins = 1; }, ['first-game', 'first-win', 'fog-win', 'wise-win']],
    [(s) => { s.single.hard.draws = 3; s.fog.single.medium.losses = 2; }, ['first-game']],
    [(s) => { s.twoPlayer.acornWins = 4; }, ['first-game', 'shared-board']],
    [(s) => { s.fog.twoPlayer.leafWins = 1; }, ['first-game', 'shared-board', 'shared-fog']],
  ];
  for (const [change, expected] of cases) {
    const save = createDefaultSave();
    change(save.acornsLeaves.stats);
    assert.deepEqual(earned(save, 'acornsLeaves'), expected);
  }
  // Crowned and Double Jump come only from moments in play.
  assert.deepEqual(ACHIEVEMENTS.acornsLeaves.filter((a) => a.moment).map((a) => [a.id, a.moment]), [['crowned', 'crowned'], ['double-jump', 'multi-jump']]);
});

test('games from before v2 count toward First Game and Ten Games only (v1 never recorded mode or difficulty)', () => {
  const save = createDefaultSave();
  save.shellsFeathers.stats.legacy = { wins: 9, losses: 3, draws: 0, totalGames: 12 };
  assert.deepEqual(earned(save, 'shellsFeathers'), ['first-game', 'ten-games']);
});

test('each achievement unlocks once: a second earning, a reload and repeated moments unlock nothing more', () => {
  const { storage, profile, tick } = newProfile();
  const first = profile.recordResult({ mode: 'single', difficulty: 'easy', outcome: 'win' });
  assert.deepEqual(ids(first), ['shellsFeathers:first-game', 'shellsFeathers:first-win', 'shellsFeathers:gentle-win']);
  assert.equal(first[1].title, 'First Win');
  assert.equal(first[1].icon, 'ach-laurel');
  tick();
  assert.deepEqual(profile.recordResult({ mode: 'single', difficulty: 'easy', outcome: 'win' }), [], 'already unlocked');
  assert.deepEqual(ids(profile.recordResult({ mode: 'single', difficulty: 'medium', outcome: 'win' })), ['shellsFeathers:balanced-win']);

  assert.deepEqual(ids(profile.recordMoment({ game: 'acornsLeaves', moment: 'crowned', mode: 'single' })), ['acornsLeaves:crowned']);
  assert.deepEqual(profile.recordMoment({ game: 'acornsLeaves', moment: 'crowned', mode: 'single' }), []);
  assert.deepEqual(ids(profile.recordMoment({ game: 'acornsLeaves', moment: 'multi-jump', mode: 'single' })), ['acornsLeaves:double-jump']);

  // Reloaded: the same achievements, with the times they were unlocked.
  const again = createProfile(openStorage(() => storage), { now: () => 99_000 });
  assert.deepEqual(unlockedIds(again, 'shellsFeathers'), ['first-game', 'first-win', 'gentle-win', 'balanced-win']);
  assert.deepEqual(again.achievements('shellsFeathers').map((a) => a.at), [1000, null, 1000, null, null, 1000, 2000, null, null]);
  assert.deepEqual(unlockedIds(again, 'acornsLeaves'), ['crowned', 'double-jump']);
  assert.deepEqual(again.recordResult({ mode: 'single', difficulty: 'easy', outcome: 'win' }), []);
  assert.deepEqual(again.recordMoment({ game: 'acornsLeaves', moment: 'crowned', mode: 'single' }), []);
  assert.deepEqual(again.achievements('shellsFeathers').filter((a) => a.unlocked).map((a) => a.at), [1000, 1000, 1000, 2000], 'times kept');
});

test('two-player games: moments unlock nothing, wins never count as yours (not even a side win), only milestones and shared entries unlock', () => {
  const { profile } = newProfile();
  assert.deepEqual(profile.recordMoment({ game: 'acornsLeaves', moment: 'crowned', mode: 'two' }), []);
  assert.deepEqual(profile.recordMoment({ game: 'acornsLeaves', moment: 'multi-jump', mode: 'two' }), []);
  assert.deepEqual(ids(profile.recordAcornsLeavesResult({ mode: 'two', outcome: 'acorn', variant: 'fog', side: 'acorn' })),
    ['acornsLeaves:first-game', 'acornsLeaves:shared-board', 'acornsLeaves:shared-fog']);
  assert.deepEqual(ids(profile.recordResult({ mode: 'two', outcome: 'player1', side: 'shell' })),
    ['shellsFeathers:first-game', 'shellsFeathers:shared-board', 'collection:both-games']);
  assert.deepEqual(unlockedIds(profile, 'acornsLeaves'), ['first-game', 'shared-board', 'shared-fog']);
  // Unknown games or moments unlock nothing.
  assert.deepEqual(profile.recordMoment({ game: 'chess', moment: 'crowned', mode: 'single' }), []);
  assert.deepEqual(profile.recordMoment({ game: 'acornsLeaves', moment: 'castled', mode: 'single' }), []);
});

test('a save from before achievements were kept gets what its records earned, once, with no date', () => {
  const old = createDefaultSave();
  delete old.shellsFeathers.achievements;
  delete old.acornsLeaves.achievements;
  old.shellsFeathers.stats.single.hard.draws = 2;
  old.acornsLeaves.stats.fog.single.easy.wins = 1;
  old.acornsLeaves.stats.twoPlayer.draws = 1;
  const { profile } = newProfile({ [SAVE_KEY]: JSON.stringify(old) });
  assert.deepEqual(unlockedIds(profile, 'shellsFeathers'), ['first-game', 'steady-hand']);
  assert.deepEqual(unlockedIds(profile, 'acornsLeaves'), ['first-game', 'first-win', 'fog-win', 'shared-board']);
  assert.ok(profile.achievements('acornsLeaves').every((a) => a.at === null));
  assert.deepEqual(unlockedIds(profile, 'collection'), ['both-games'], 'from the two unlocked entries, with no date');
  assert.equal(profile.achievements('collection')[0].at, null);
  assert.deepEqual(profile.recordAcornsLeavesResult({ mode: 'single', difficulty: 'easy', outcome: 'win', variant: 'fog' }), [], 'not announced again');

  // A save that already keeps achievements is never backfilled, even when
  // empty (its progress was cleared).
  const cleared = createDefaultSave();
  cleared.shellsFeathers.stats.single.easy.wins = 1;
  assert.deepEqual(normalizeSave(JSON.parse(JSON.stringify(cleared))).shellsFeathers.achievements, {});
});

test('a v1 player keeps their games and gets First Game (and Ten Games) from them', () => {
  const { profile, storage } = newProfile({ [LEGACY_STATS_KEY]: JSON.stringify({ wins: 7, losses: 2, draws: 2, totalGames: 11 }) });
  assert.equal(profile.source, 'migrated-v1');
  assert.deepEqual(unlockedIds(profile, 'shellsFeathers'), ['first-game', 'ten-games']);
  assert.deepEqual(profile.stats().legacy, { wins: 7, losses: 2, draws: 2, totalGames: 11 });
  assert.equal(JSON.parse(storage.map.get(LEGACY_STATS_KEY)).totalGames, 11, 'the v1 record is kept');
});

test('achievement entries are repaired on load; ids from a newer build are kept but not listed', () => {
  const save = createDefaultSave();
  save.shellsFeathers.achievements = { 'first-game': { at: 5 }, 'first-win': { at: 'yesterday' }, 'gentle-win': 'yes', 'future-feat': { at: 7, extra: 1 } };
  const repaired = normalizeSave(JSON.parse(JSON.stringify(save))).shellsFeathers.achievements;
  assert.deepEqual(repaired, { 'first-game': { at: 5 }, 'first-win': { at: null }, 'future-feat': { at: 7, extra: 1 } });
  const { profile } = newProfile({ [SAVE_KEY]: JSON.stringify(save) });
  assert.deepEqual(unlockedIds(profile, 'shellsFeathers'), ['first-game', 'first-win']);
  assert.equal(profile.achievements('shellsFeathers').length, 9);
  assert.equal(profile.progress().shellsFeathers.achievements, 2, 'unknown ids are not counted');
});

test('clearing one game deletes its records and achievements only; settings and the other game stay', () => {
  const { profile, storage } = newProfile();
  profile.updateSettings({ musicVolume: 70, motion: 'reduce' });
  profile.updateGameSettings({ difficulty: 'hard', player1Symbol: 'feather' });
  profile.recordResult({ mode: 'single', difficulty: 'easy', outcome: 'win' });
  profile.recordAcornsLeavesResult({ mode: 'single', difficulty: 'hard', outcome: 'win', variant: 'fog' });
  profile.recordMoment({ game: 'acornsLeaves', moment: 'crowned', mode: 'single' });
  assert.deepEqual(profile.progress(), {
    shellsFeathers: { spiritGames: 1, twoPlayerGames: 0, earlierGames: 0, achievements: 3, collection: ['Two Paths', 'Friend of the Woods'] },
    acornsLeaves: { spiritGames: 0, twoPlayerGames: 0, fogSpiritGames: 1, fogTwoPlayerGames: 0, achievements: 5, collection: ['Two Paths', 'Friend of the Woods'] },
  });

  profile.resetStats();
  assert.deepEqual(unlockedIds(profile, 'shellsFeathers'), []);
  assert.equal(profile.statsSummary().totalGames, 0);
  assert.deepEqual(JSON.parse(storage.map.get(LEGACY_STATS_KEY)), { wins: 0, losses: 0, draws: 0, totalGames: 0 }, 'v1 mirror reset to match');
  assert.deepEqual(unlockedIds(profile, 'acornsLeaves'), ['first-game', 'first-win', 'crowned', 'fog-win', 'wise-win']);
  assert.deepEqual(unlockedIds(profile, 'collection'), [], 'the Collection entries that needed Shells & Feathers lock too');
  assert.equal(profile.settings().musicVolume, 70);
  assert.equal(profile.gameSettings().difficulty, 'hard');

  profile.resetAcornsLeavesStats();
  assert.deepEqual(unlockedIds(profile, 'acornsLeaves'), []);
  assert.equal(profile.acornsLeavesStats().fog.single.hard.wins, 0);
  assert.equal(profile.settings().motion, 'reduce');

  // Cleared stays cleared after a reload (no backfill from the v1 key).
  const again = createProfile(openStorage(() => storage));
  assert.deepEqual(unlockedIds(again, 'shellsFeathers'), []);
  assert.deepEqual(unlockedIds(again, 'acornsLeaves'), []);
});

test('delete all saved data removes every key the game wrote, the v1 record included, and starts from defaults', () => {
  const { profile, storage } = newProfile({ [LEGACY_STATS_KEY]: '{not json' });
  profile.updateSettings({ sfx: false, sfxVolume: 10 });
  profile.recordResult({ mode: 'single', difficulty: 'easy', outcome: 'win' });
  storage.map.set('someone-else', 'kept');
  assert.deepEqual([...storage.map.keys()].sort(), [LEGACY_STATS_KEY, `${LEGACY_STATS_KEY}:corrupt`, SAVE_KEY, 'someone-else'].sort());

  assert.equal(profile.deleteAllData(), true);
  assert.deepEqual([...storage.map.keys()], ['someone-else'], 'only other data is left');
  assert.equal(profile.settings().sfx, true);
  assert.equal(profile.statsSummary().totalGames, 0);
  assert.deepEqual(unlockedIds(profile, 'shellsFeathers'), []);
  const fresh = createProfile(openStorage(() => storage));
  assert.equal(fresh.source, 'new');
});

test('storage that refuses writes: everything works for the session, the failure is reported once, and nothing is pretended saved', () => {
  const { profile, errors, storage } = newProfile({}, { storage: { failWrites: true } });
  assert.equal(profile.saveFailing(), false, 'nothing has been tried yet');
  assert.equal(ids(profile.recordResult({ mode: 'single', difficulty: 'easy', outcome: 'win' })).length, 3);
  assert.equal(profile.saveFailing(), true);
  assert.deepEqual(profile.recordResult({ mode: 'single', difficulty: 'easy', outcome: 'win' }), [], 'still unlocked once in memory');
  profile.updateSettings({ musicVolume: 0 });
  assert.equal(profile.settings().musicVolume, 0);
  assert.equal(errors.length, 1, 'reported once');
  assert.equal(storage.map.size, 0);
  assert.equal(profile.deleteAllData(), false, 'deleting fails too, and says so');
});

test('storage that throws on every call still loads a fresh profile', () => {
  const { profile } = newProfile({}, { storage: { failReads: true, failWrites: true } });
  assert.equal(profile.source, 'new');
  assert.deepEqual(ids(profile.recordMoment({ game: 'acornsLeaves', moment: 'multi-jump', mode: 'single' })), ['acornsLeaves:double-jump']);
});

test('profile.stats() hands out a copy, so a screen cannot change saved records', () => {
  const { profile } = newProfile();
  profile.recordResult({ mode: 'single', difficulty: 'hard', outcome: 'draw' });
  const copy = profile.stats();
  copy.single.hard.draws = 99;
  assert.equal(profile.stats().single.hard.draws, 1);
});
