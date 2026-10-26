// The achievement journal (Stage 14): where each requirement starts and
// stops counting, the Collection and its dates, the migration from the
// Stage 8 set (exact records only, nothing guessed), resets, reloads and a
// result reported twice, Fog giving nothing away, the winning move's
// achievements in the result dialog, and the in-match notices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, ACHIEVEMENT_SET } from '../../src/shared/achievements.js';
import { createDefaultSave, normalizeSave, SAVE_KEY, LEGACY_STATS_KEY } from '../../src/shared/save-data.js';
import { createProfile } from '../../src/shared/profile.js';
import { openStorage } from '../../src/shared/storage.js';
import { createSession, DELAYS } from '../../src/games/acorns-leaves/session.js';
import { positionFromRows, legalMoves, squareAt } from '../../src/games/acorns-leaves/engine.js';
import { createToast, NOTICE } from '../../src/app/toast.js';
import { createFeedback } from '../../src/shared/feedback.js';
import { progressText, stateText } from '../../src/app/journal-screen.js';
import {
  createFakeClock, createFakeAudio, createFakeCheckersView, createMemoryStorage,
} from '../helpers/fakes.mjs';

const sq = (row, col) => squareAt(row, col);
const ids = (list) => list.map((a) => `${a.game}:${a.id}`);
const unlocked = (profile, book) => profile.achievements(book).filter((a) => a.unlocked).map((a) => a.id);
const entry = (profile, book, id) => profile.achievements(book).find((a) => a.id === id);
const win = (side, extra = {}) => ({ mode: 'single', difficulty: 'easy', outcome: 'win', side, ...extra });

function newProfile(entries = {}) {
  const storage = createMemoryStorage(entries);
  let time = 1000;
  const profile = createProfile(openStorage(() => storage), { now: () => time });
  return { storage, profile, at: (t) => { time = t; } };
}

test('Ten Games: locked at nine with its progress, unlocked at the tenth, and counting legacy games', () => {
  const { profile } = newProfile();
  for (let i = 0; i < 9; i++) profile.recordResult({ mode: 'single', difficulty: 'hard', outcome: 'loss', side: 'shell' });
  const nine = entry(profile, 'shellsFeathers', 'ten-games');
  assert.equal(nine.unlocked, false);
  assert.deepEqual(nine.progress, { value: 9, goal: 10, unit: 'games', parts: null });
  assert.equal(progressText(nine.progress), '9 of 10 games');
  assert.deepEqual(ids(profile.recordResult({ mode: 'two', outcome: 'draw' })), ['shellsFeathers:ten-games', 'shellsFeathers:shared-board'], 'a two-player game counts toward a milestone');
  // Progress never reads past its goal.
  for (let i = 0; i < 5; i++) profile.recordResult({ mode: 'two', outcome: 'draw' });
  assert.deepEqual(entry(profile, 'shellsFeathers', 'ten-games').progress.value, 10);
  // Entries with nothing to count have no progress.
  assert.equal(entry(profile, 'shellsFeathers', 'first-win').progress, null);
});

test('a win with a side counts only as a win against the Spirit with that side: not a loss, a draw, or a two-player win', () => {
  const { profile } = newProfile();
  assert.deepEqual(ids(profile.recordResult({ mode: 'single', difficulty: 'easy', outcome: 'loss', side: 'feather' })), ['shellsFeathers:first-game']);
  assert.deepEqual(profile.recordResult({ mode: 'single', difficulty: 'hard', outcome: 'draw', side: 'feather' }).map((a) => a.id), ['steady-hand']);
  assert.deepEqual(profile.recordResult({ mode: 'two', outcome: 'player1', side: 'feather' }).map((a) => a.id), ['shared-board']);
  assert.ok(!unlocked(profile, 'shellsFeathers').includes('feather-win'));
  assert.deepEqual(profile.recordResult(win('feather')).map((a) => a.id), ['first-win', 'gentle-win', 'feather-win']);
  assert.deepEqual(profile.recordResult(win('shell', { difficulty: 'medium' })).map((a) => a.id), ['balanced-win', 'shell-win']);
  // Checkers: in Classic or Fog; a side that isn't the winner's own never counts.
  assert.deepEqual(profile.recordAcornsLeavesResult({ mode: 'single', difficulty: 'easy', outcome: 'loss', side: 'leaf' }).map((a) => a.id), ['first-game', 'both-games']);
  assert.deepEqual(profile.recordAcornsLeavesResult({ mode: 'two', outcome: 'leaf', side: 'leaf' }).map((a) => a.id), ['shared-board']);
  assert.deepEqual(profile.recordAcornsLeavesResult(win('leaf', { variant: 'fog', difficulty: 'hard' })).map((a) => a.id),
    ['first-win', 'fog-win', 'wise-win', 'leaf-win', 'both-wins']);
  assert.deepEqual(profile.recordAcornsLeavesResult(win('acorn')).map((a) => a.id), ['acorn-win', 'all-sides']);
  // A result without a side (an older caller) unlocks no side entry.
  const other = newProfile().profile;
  assert.ok(!other.recordResult({ mode: 'single', difficulty: 'easy', outcome: 'win' }).some((a) => /-win$/.test(a.id) && a.id !== 'first-win' && a.id !== 'gentle-win'));
});

test('Acorns & Leaves milestones and shared entries: any finished game; Passing in the Mist only for two players in Fog', () => {
  const { profile } = newProfile();
  assert.deepEqual(profile.recordAcornsLeavesResult({ mode: 'two', outcome: 'draw', variant: 'classic' }).map((a) => a.id), ['first-game', 'shared-board']);
  assert.deepEqual(profile.recordAcornsLeavesResult({ mode: 'single', difficulty: 'easy', outcome: 'loss', variant: 'fog', side: 'acorn' }), [], 'Fog against the Spirit: not a shared game');
  assert.deepEqual(profile.recordAcornsLeavesResult({ mode: 'two', outcome: 'acorn', variant: 'fog' }).map((a) => a.id), ['shared-fog']);
  assert.deepEqual(profile.recordAcornsLeavesResult({ mode: 'single', difficulty: 'hard', outcome: 'draw', variant: 'classic', side: 'acorn' }), [], 'a draw against Wise is no Wise Victory');
});

test('the Collection: unlocked when its last need is, dated then; progress lists each need', () => {
  const { profile, at } = newProfile();
  at(5000);
  profile.recordResult(win('shell'));
  const sides = entry(profile, 'collection', 'all-sides');
  assert.deepEqual(sides.progress.parts.map((p) => [p.book, p.title, p.done]), [
    ['shellsFeathers', 'Win with Shells', true], ['shellsFeathers', 'Win with Feathers', false],
    ['acornsLeaves', 'Win with Acorns', false], ['acornsLeaves', 'Win with Leaves', false],
  ]);
  assert.equal(progressText(sides.progress), '1 of 4');
  at(9000);
  const fresh = profile.recordAcornsLeavesResult({ mode: 'single', difficulty: 'easy', outcome: 'loss', side: 'acorn' });
  assert.deepEqual(ids(fresh), ['acornsLeaves:first-game', 'collection:both-games']);
  assert.equal(entry(profile, 'collection', 'both-games').at, 9000, 'when the second game was finished');
  assert.equal(entry(profile, 'collection', 'both-games').progress.value, 2);
  assert.equal(profile.journal().unlocked, 6);
});

test('a result reported twice, and a reload, never unlock or announce anything twice', () => {
  const { profile, storage, at } = newProfile();
  const result = win('acorn', { variant: 'fog' });
  assert.deepEqual(profile.recordAcornsLeavesResult(result).map((a) => a.id), ['first-game', 'first-win', 'fog-win', 'acorn-win']);
  at(2000);
  assert.deepEqual(profile.recordAcornsLeavesResult(result), [], 'the same callback again');
  const saved = JSON.parse(storage.map.get(SAVE_KEY));
  assert.deepEqual(Object.values(saved.acornsLeaves.achievements).map((a) => a.at), [1000, 1000, 1000, 1000]);
  const reloaded = createProfile(openStorage(() => storage), { now: () => 3000 });
  assert.deepEqual(reloaded.recordAcornsLeavesResult(result), []);
  assert.deepEqual(reloaded.recordMoment({ game: 'acornsLeaves', moment: 'crowned', mode: 'single' }).map((a) => a.id), ['crowned']);
  assert.deepEqual(createProfile(openStorage(() => storage)).recordMoment({ game: 'acornsLeaves', moment: 'crowned', mode: 'single' }), []);
  assert.deepEqual(unlocked(reloaded, 'acornsLeaves'), ['first-game', 'first-win', 'acorn-win', 'crowned', 'fog-win']);
});

// A save from Stage 8 (achievement set 1): achievements kept, no set number.
function stage8Save() {
  const save = createDefaultSave();
  delete save.achievementSet;
  delete save.collection;
  save.shellsFeathers.stats.single.easy.wins = 3;
  save.shellsFeathers.stats.single.hard.draws = 1;
  save.shellsFeathers.stats.legacy = { wins: 2, losses: 1, draws: 0, totalGames: 3 };
  save.shellsFeathers.achievements = { 'first-game': { at: 50 }, 'first-win': { at: 60 }, 'gentle-win': { at: 60 }, 'steady-hand': { at: 70 }, 'future-feat': { at: 80, extra: true } };
  save.acornsLeaves.stats.single.medium.losses = 2;
  save.acornsLeaves.stats.fog.twoPlayer.acornWins = 1;
  save.acornsLeaves.achievements = { 'shared-board': { at: 90 } };
  return JSON.parse(JSON.stringify(save));
}

test('migration from the Stage 8 set: ids, dates and records kept; new entries only where the records prove them, undated', () => {
  const raw = stage8Save();
  const save = normalizeSave(JSON.parse(JSON.stringify(raw)));
  assert.equal(save.achievementSet, ACHIEVEMENT_SET);
  assert.deepEqual(save.shellsFeathers.stats, raw.shellsFeathers.stats, 'records untouched');
  assert.deepEqual(save.acornsLeaves.stats, raw.acornsLeaves.stats);
  // Every earlier unlock, with its date, and a newer build's id, as they were.
  for (const [id, value] of Object.entries(raw.shellsFeathers.achievements)) assert.deepEqual(save.shellsFeathers.achievements[id], value, id);
  // Added: Acorns & Leaves First Game and Passing in the Mist (the records
  // show finished games, and a two-player Fog game), with no date.
  assert.deepEqual(save.acornsLeaves.achievements, { 'shared-board': { at: 90 }, 'first-game': { at: null }, 'shared-fog': { at: null } });
  // Not added: wins with a side. Three Gentle wins, but no record of which side.
  assert.ok(!('shell-win' in save.shellsFeathers.achievements) && !('feather-win' in save.shellsFeathers.achievements));
  // Ten Games is from set 1, so it isn't worked out again (6 games anyway).
  assert.ok(!('ten-games' in save.shellsFeathers.achievements));
  // The Collection: both First Games are unlocked; one has no date, so neither has the entry.
  assert.deepEqual(save.collection.achievements, { 'both-games': { at: null } });

  // Once is once: the migrated save loads unchanged.
  assert.deepEqual(normalizeSave(JSON.parse(JSON.stringify(save))), save);

  // Through the profile: nothing is announced for the migration.
  const { profile } = newProfile({ [SAVE_KEY]: JSON.stringify(raw) });
  assert.deepEqual(unlocked(profile, 'shellsFeathers'), ['first-game', 'first-win', 'gentle-win', 'steady-hand']);
  assert.equal(entry(profile, 'shellsFeathers', 'first-win').at, 60);
  assert.equal(profile.progress().shellsFeathers.achievements, 4, 'the unknown id is kept but not counted');
  assert.deepEqual(profile.recordResult(win('shell')).map((a) => a.id), ['shell-win'], 'side wins count from now on');
});

test('the migrated save is stored as it loads, once; a current save is left as it is', () => {
  const { storage, profile } = newProfile({ [SAVE_KEY]: JSON.stringify(stage8Save()) });
  const stored = storage.map.get(SAVE_KEY);
  assert.equal(JSON.parse(stored).achievementSet, ACHIEVEMENT_SET);
  assert.ok(profile.notes.includes(`achievements checked against set ${ACHIEVEMENT_SET}`));
  const writes = [];
  const base = openStorage(() => storage);
  const watched = { ...base, write: (key, value) => { writes.push(key); return base.write(key, value); } };
  const again = createProfile(watched);
  assert.deepEqual(writes, [], 'nothing to migrate the second time');
  assert.deepEqual(again.notes, []);
  assert.equal(storage.map.get(SAVE_KEY), stored);
});

test('migration edge cases: an odd set number counts as set 1; a newer set is kept and not re-checked; v1 players', () => {
  for (const bad of ['2', -1, 1.5, null, 0]) {
    const raw = stage8Save();
    raw.achievementSet = bad;
    assert.equal(normalizeSave(raw).acornsLeaves.achievements['first-game']?.at, null, String(bad));
  }
  const newer = stage8Save();
  newer.achievementSet = ACHIEVEMENT_SET + 1;
  newer.collection = { achievements: { 'future-set': { at: 1 } }, extra: 'kept' };
  const kept = normalizeSave(newer);
  assert.equal(kept.achievementSet, ACHIEVEMENT_SET + 1);
  assert.ok(!('first-game' in kept.acornsLeaves.achievements), 'a newer build already decided');
  assert.deepEqual(kept.collection.achievements['future-set'], { at: 1 });
  assert.equal(kept.collection.extra, 'kept');

  // A v1 player: First Game and Ten Games from the v1 totals, undated.
  const { profile } = newProfile({ [LEGACY_STATS_KEY]: JSON.stringify({ wins: 7, losses: 2, draws: 2, totalGames: 11 }) });
  assert.deepEqual(unlocked(profile, 'shellsFeathers'), ['first-game', 'ten-games']);
  assert.deepEqual(unlocked(profile, 'collection'), []);
  // A save with dated needs gets the latest of their dates.
  const dated = stage8Save();
  dated.acornsLeaves.achievements['first-game'] = { at: 120 };
  assert.deepEqual(normalizeSave(dated).collection.achievements, { 'both-games': { at: 120 } });
});

test('clearing a game locks its achievements and the Collection entries that need them, and they can be earned again', () => {
  const { profile, storage, at } = newProfile();
  profile.recordResult(win('shell'));
  profile.recordAcornsLeavesResult(win('acorn'));
  assert.deepEqual(unlocked(profile, 'collection'), ['both-games', 'both-wins']);
  assert.deepEqual(profile.progress().acornsLeaves.collection, ['Two Paths', 'Friend of the Woods']);
  profile.resetAcornsLeavesStats();
  assert.deepEqual(unlocked(profile, 'acornsLeaves'), []);
  assert.deepEqual(unlocked(profile, 'collection'), []);
  assert.deepEqual(unlocked(profile, 'shellsFeathers'), ['first-game', 'first-win', 'shell-win', 'gentle-win'], 'the other game keeps its own');
  // Reloaded: still locked (nothing is worked out again for a current save).
  const again = createProfile(openStorage(() => storage), { now: () => 7000 });
  assert.deepEqual(unlocked(again, 'collection'), []);
  // Earned again, with the new date.
  at(7000);
  assert.deepEqual(again.recordAcornsLeavesResult(win('acorn')).map((a) => a.id), ['first-game', 'first-win', 'acorn-win', 'both-games', 'both-wins']);
  assert.equal(entry(again, 'collection', 'both-wins').at, 7000);
});

test('the journal lists every book in order with its state text', () => {
  const { profile } = newProfile();
  profile.recordResult(win('shell'));
  const journal = profile.journal();
  assert.deepEqual(journal.books.map((b) => [b.book, b.title, b.entries.length]), [
    ['shellsFeathers', 'Shells & Feathers', 9], ['acornsLeaves', 'Acorns & Leaves', 10], ['collection', 'Collection', 3],
  ]);
  assert.deepEqual([journal.unlocked, journal.total], [4, 22]);
  const date = (ms) => `day ${ms}`;
  assert.equal(stateText(entry(profile, 'shellsFeathers', 'first-win'), date), 'Unlocked day 1000');
  assert.equal(stateText({ unlocked: true, at: null }, date), 'Unlocked before dates were kept');
  assert.equal(stateText(entry(profile, 'shellsFeathers', 'feather-win'), date), 'Locked');
  // Every section is one of the four, and the Spirit's and shared entries never mix.
  for (const [book, list] of Object.entries(ACHIEVEMENTS)) {
    for (const a of list) {
      assert.ok(['milestone', 'spirit', 'shared', 'collection'].includes(a.section), `${book}:${a.id}`);
      assert.equal(a.section === 'collection', book === 'collection');
    }
  }
});

// Acorns & Leaves sessions --------------------------------------------------

function checkers({ rows, variant = 'classic', side = 'acorn', chooseMove } = {}) {
  const clock = createFakeClock();
  const view = createFakeCheckersView();
  const profile = createProfile(openStorage(() => createMemoryStorage()));
  profile.updateAcornsLeavesSettings({ side, difficulty: 'easy', variant });
  const notified = [];
  const session = createSession({
    view, audio: createFakeAudio(), profile, clock, rng: () => 0.5,
    notify: (list) => notified.push(list.map((a) => a.id)),
    chooseMove: chooseMove ?? ((state) => legalMoves(state)[0]),
    chooseFogStep: (seen) => seen.steps[0],
    initialState: () => positionFromRows(rows),
  });
  const tap = (...squares) => squares.forEach((s) => session.selectSquare(s));
  return { clock, view, profile, session, tap, notified };
}

// b2 jumps c3, e5 and g7, landing on h8: three captures and a crowning.
const CHAIN = ['.l......', '......l.', '........', '..l.l...', '........', '..l.....', '.a......', '....a...'];

test('your crowning and double jump are told at once in a game against the Spirit; never with two players, Classic or Fog', () => {
  const single = checkers({ rows: CHAIN });
  single.session.enter('single');
  single.tap(sq(6, 1), sq(4, 3), sq(2, 5), sq(0, 7));
  assert.deepEqual(single.notified, [['double-jump', 'crowned']]);

  for (const variant of ['classic', 'fog']) {
    const two = checkers({ rows: CHAIN, variant });
    two.session.enter('two', variant);
    if (variant === 'fog') two.session.takeControl();
    two.tap(sq(6, 1), sq(4, 3), sq(2, 5), sq(0, 7));
    assert.deepEqual(two.notified, [], variant);
    assert.deepEqual(unlocked(two.profile, 'acornsLeaves'), [], `${variant}: nothing until the game ends`);
  }
});

test('the Spirit\'s crowning is not yours; in Fog its hidden moves change nothing in the journal', () => {
  // The Spirit (leaves) crowns on its first move, from f2.
  const rows = ['........', '........', '.l......', '........', '........', '..a.....', '.....l..', '........'];
  const game = checkers({ rows, chooseMove: (state) => legalMoves(state).find((m) => m.crowned) });
  game.session.enter('single');
  game.tap(sq(5, 2), sq(4, 3));
  game.clock.tick(DELAYS.spiritThink + DELAYS.spiritStep * 4);
  assert.ok([sq(7, 4), sq(7, 6)].some((s) => game.view.model.board[s]?.king), 'the Spirit was crowned');
  assert.deepEqual(game.notified, []);
  assert.ok(!unlocked(game.profile, 'acornsLeaves').includes('crowned'));

  const fogGame = checkers({ rows: ['.l.l.l.l', 'l.l.l.l.', '.l.l.l.l', '........', '........', 'a.a.a.a.', '.a.a.a.a', 'a.a.a.a.'], variant: 'fog' });
  fogGame.session.enter('single', 'fog');
  const before = JSON.stringify(fogGame.profile.journal());
  for (let turn = 0; turn < 6 && fogGame.view.model.phase !== 'over'; turn++) {
    const { model } = fogGame.view;
    if (model.phase === 'waiting') {
      fogGame.clock.tick(DELAYS.spiritThink + DELAYS.spiritStep * 4);
      continue;
    }
    fogGame.tap(model.movable[0]);
    fogGame.tap(fogGame.view.model.destinations[0]);
  }
  assert.equal(JSON.stringify(fogGame.profile.journal()), before, 'nothing about either side\'s moves');
});

test('an achievement unlocked by the winning move is listed with the result, not shown behind it', () => {
  // b6 jumps the last leaf (c7) and lands on d8: crowned, and the game is won.
  const game = checkers({ rows: ['........', '..l.....', '.a......', '........', '........', '........', '........', '........'] });
  game.session.enter('single');
  game.tap(sq(2, 1), sq(0, 3));
  assert.equal(game.view.model.phase, 'over');
  assert.deepEqual(game.notified, []);
  game.clock.tick(DELAYS.resultModal);
  assert.deepEqual(game.view.resultAchievements.map((a) => a.id), ['crowned', 'first-game', 'first-win', 'acorn-win']);
});

// Notices ----------------------------------------------------------------

function noticeDom() {
  const classes = () => {
    const set = new Set();
    return { add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) };
  };
  const node = (extra = {}) => ({ hidden: true, textContent: '', classList: classes(), attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, ...extra });
  const nodes = { 'notice-status': node() };
  for (const p of ['sf', 'al']) {
    for (const part of ['notice-slot', 'notice', 'notice-text', 'notice-icon']) nodes[`${p}-${part}`] = node();
  }
  return { nodes, doc: { getElementById: (id) => nodes[id] ?? null } };
}

function notices() {
  const { nodes, doc } = noticeDom();
  const clock = createFakeClock();
  const audio = createFakeAudio();
  const toast = createToast({ doc, clock, feedback: createFeedback({ audio, clock }) });
  const showing = () => (nodes['al-notice'].hidden ? null : nodes['al-notice-text'].textContent);
  return { nodes, clock, audio, toast, showing };
}

const CROWNED = { title: 'Crowned', description: 'Crown one of your own pieces.', icon: 'ach-crown' };
const DOUBLE = { title: 'Double Jump', description: 'Capture two or more pieces.', icon: 'ach-hop' };

test('notices: one at a time in the match line\'s place, read out in full, one chime per batch, then gone', () => {
  const { nodes, clock, audio, toast, showing } = notices();
  toast.achievements('al', []);
  assert.deepEqual(audio.calls, [], 'nothing to say, no chime');
  toast.achievements('al', [CROWNED, DOUBLE]);
  assert.deepEqual(audio.calls, ['sfx:achievement-sound']);
  assert.equal(showing(), 'Unlocked: Crowned');
  assert.equal(nodes['al-notice-icon'].attrs.href, '#ach-crown');
  assert.ok(nodes['al-notice-slot'].classList.contains('is-noticing'), 'the match line makes way');
  assert.equal(nodes['notice-status'].textContent, 'Achievement unlocked: Crowned. Crown one of your own pieces.');
  clock.tick(NOTICE.SHOW_MS);
  assert.equal(showing(), null);
  assert.ok(!nodes['al-notice-slot'].classList.contains('is-noticing'), 'the match line is back between notices');
  clock.tick(NOTICE.GAP_MS);
  assert.equal(showing(), 'Unlocked: Double Jump');
  toast.achievements('al', [{ ...CROWNED, title: 'Late' }]);
  assert.equal(showing(), 'Unlocked: Double Jump', 'a new batch waits its turn');
  assert.equal(audio.calls.length, 2);
  clock.tick(NOTICE.SHOW_MS + NOTICE.GAP_MS);
  assert.equal(showing(), 'Unlocked: Late');
  clock.tick(NOTICE.SHOW_MS);
  assert.equal(showing(), null);
  assert.equal(clock.pending, 0);
});

test('notices: time stands still while the match is held (menu, hidden page); leaving drops the queue', () => {
  const { clock, toast, showing } = notices();
  toast.achievements('al', [CROWNED, DOUBLE]);
  clock.tick(1000);
  toast.hold('menu');
  toast.hold('hidden');
  clock.tick(60_000);
  assert.equal(showing(), 'Unlocked: Crowned');
  toast.release('menu');
  clock.tick(60_000);
  assert.equal(showing(), 'Unlocked: Crowned', 'still held by the hidden page');
  toast.release('hidden');
  clock.tick(NOTICE.SHOW_MS - 1000 - 1);
  assert.equal(showing(), 'Unlocked: Crowned', 'the rest of its time');
  clock.tick(1);
  assert.equal(showing(), null);

  // Arriving while held: shown, but its time waits.
  toast.clear();
  toast.hold('menu');
  toast.achievements('al', [DOUBLE]);
  clock.tick(30_000);
  assert.equal(showing(), 'Unlocked: Double Jump');
  toast.release('menu');
  toast.clear();
  assert.equal(showing(), null);
  assert.equal(toast.queued, 0);
  assert.equal(clock.pending, 0, 'nothing left to run');
  // A screen without a notice slot is skipped, not stuck.
  toast.achievements('chess', [CROWNED]);
  toast.achievements('al', [DOUBLE]);
  assert.equal(showing(), 'Unlocked: Double Jump');
});
