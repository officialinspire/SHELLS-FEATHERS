// Achievements and the Your Path data they come from.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { achievementsFor } from '../../src/games/shells-feathers/achievements.js';
import { createDefaultSave, summarizeStats } from '../../src/shared/save-data.js';
import { createProfile } from '../../src/shared/profile.js';
import { openStorage } from '../../src/shared/storage.js';
import { createMemoryStorage } from '../helpers/fakes.mjs';

const unlocked = (save) => achievementsFor(save.shellsFeathers.stats, summarizeStats(save)).filter((a) => a.unlocked).map((a) => a.id);

test('a new player has six locked achievements', () => {
  const list = achievementsFor(createDefaultSave().shellsFeathers.stats, summarizeStats(createDefaultSave()));
  assert.deepEqual(list.map((a) => a.id), ['first-game', 'gentle-win', 'balanced-win', 'steady-hand', 'shared-board', 'ten-games']);
  assert.ok(list.every((a) => !a.unlocked && a.title && a.description));
});

test('each achievement unlocks from the matching record', () => {
  const cases = [
    [(s) => { s.single.easy.wins = 1; }, ['first-game', 'gentle-win']],
    [(s) => { s.single.medium.wins = 1; }, ['first-game', 'balanced-win']],
    [(s) => { s.single.hard.draws = 1; }, ['first-game', 'steady-hand']],
    [(s) => { s.single.hard.losses = 1; }, ['first-game']],
    [(s) => { s.twoPlayer.draws = 1; }, ['first-game', 'shared-board']],
    [(s) => { s.twoPlayer.player2Wins = 10; }, ['first-game', 'shared-board', 'ten-games']],
  ];
  for (const [change, expected] of cases) {
    const save = createDefaultSave();
    change(save.shellsFeathers.stats);
    assert.deepEqual(unlocked(save), expected);
  }
});

test('games from before v2 count toward totals only (v1 never recorded difficulty)', () => {
  const save = createDefaultSave();
  save.shellsFeathers.stats.legacy = { wins: 9, losses: 3, draws: 0, totalGames: 12 };
  assert.deepEqual(unlocked(save), ['first-game', 'ten-games']);
});

test('profile.stats() hands out a copy, so a screen cannot change saved records', () => {
  const profile = createProfile(openStorage(() => createMemoryStorage()));
  profile.recordResult({ mode: 'single', difficulty: 'hard', outcome: 'draw' });
  const copy = profile.stats();
  copy.single.hard.draws = 99;
  assert.equal(profile.stats().single.hard.draws, 1);
});
