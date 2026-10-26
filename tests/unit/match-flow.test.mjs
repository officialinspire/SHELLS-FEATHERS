// Stage 15: match sets, the result's next actions, switching sides, and
// unfinished matches saved and resumed: the set rules at every boundary;
// set records apart from games; the resume store with old, corrupt and
// unfitting data; both games rebuilt exactly (or not at all); a resumed
// Spirit turn, a resumed Fog game behind the handoff, and nothing stale
// left running.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSet, recordRound, setScore, validSet, setProgressText, setResultText,
} from '../../src/shared/match-set.js';
import { createDefaultSave, normalizeSave, recordSet, SAVE_KEY } from '../../src/shared/save-data.js';
import { createProfile, ALL_KEYS } from '../../src/shared/profile.js';
import { openStorage } from '../../src/shared/storage.js';
import { createResumeStore, RESUME_KEY } from '../../src/shared/resume.js';
import { restoreShellsFeathers } from '../../src/games/shells-feathers/resume.js';
import { restoreAcornsLeaves } from '../../src/games/acorns-leaves/resume.js';
import { createSession as createShellsFeathers, DELAYS as SF_DELAYS } from '../../src/games/shells-feathers/session.js';
import { createSession as createCheckers, DELAYS } from '../../src/games/acorns-leaves/session.js';
import { positionFromRows, legalMoves, squareAt, createInitialState } from '../../src/games/acorns-leaves/engine.js';
import { describeUnfinished } from '../../src/app/resume-ui.js';
import {
  createFakeClock, createFakeAudio, createFakeView, createFakeCheckersView, createMemoryStorage, createFakeResume,
} from '../helpers/fakes.mjs';

const sq = (row, col) => squareAt(row, col);
const play = (set, ...winners) => winners.reduce((s, w) => recordRound(s, w), set);
const NAMES = { first: 'You', second: 'the Spirit' };

// ------------------------------------------------------------------- sets

test('best of three: first to two; a draw is a round that scores for no one; level after three is a drawn set', () => {
  const cases = [
    [['first', 'first'], { done: true, winner: 'first', played: 2 }],
    [['first', 'second'], { done: false, round: 3 }],
    [['first', 'draw'], { done: false, round: 3 }],
    [['first', 'draw', 'second'], { done: true, winner: 'draw' }],
    [['draw', 'draw', 'first'], { done: true, winner: 'first' }],
    [['draw', 'draw', 'draw'], { done: true, winner: 'draw' }],
    [['second', 'draw', 'second'], { done: true, winner: 'second' }],
  ];
  for (const [rounds, expected] of cases) {
    const score = setScore(play(createSet(3), ...rounds));
    for (const [key, value] of Object.entries(expected)) assert.equal(score[key], value, `${rounds}: ${key}`);
  }
});

test('best of five: decided when the lead is more than the rounds left; at most five rounds', () => {
  assert.equal(setScore(play(createSet(5), 'first', 'first', 'first')).done, true, '3–0 after three');
  assert.equal(setScore(play(createSet(5), 'first', 'first', 'draw')).done, false, '2–0 with two left can still be caught');
  assert.equal(setScore(play(createSet(5), 'first', 'first', 'draw', 'first')).winner, 'first', '3–0 with one left');
  assert.equal(setScore(play(createSet(5), 'first', 'second', 'first', 'second')).done, false);
  assert.equal(setScore(play(createSet(5), 'first', 'second', 'first', 'second', 'draw')).winner, 'draw');
  // A decided set takes no more rounds.
  const decided = play(createSet(5), 'second', 'second', 'second');
  assert.deepEqual(recordRound(decided, 'first'), decided);
  assert.deepEqual(recordRound(createSet(3), 'nobody'), createSet(3));
  // A single game is a set of one.
  assert.deepEqual(setScore(play(createSet(1), 'draw')), {
    length: 1, played: 1, wins: { first: 0, second: 0 }, draws: 1, left: 0, done: true, winner: 'draw', round: 1,
  });
});

test('set text: progress, then the result', () => {
  assert.equal(setProgressText(createSet(3), NAMES), 'Round 1 of 3 · You 0, the Spirit 0');
  assert.equal(setProgressText(play(createSet(3), 'first', 'draw'), NAMES), 'Round 3 of 3 · You 1, the Spirit 0 · 1 draw');
  assert.equal(setProgressText(play(createSet(3), 'second', 'second'), NAMES), 'The Spirit wins the set · You 0, the Spirit 2');
  assert.equal(setResultText(play(createSet(3), 'first', 'first'), NAMES), 'You win the set');
  assert.equal(setResultText(play(createSet(3), 'first', 'first'), { first: 'the Acorns', second: 'the Leaves' }), 'The Acorns win the set');
  assert.equal(setResultText(play(createSet(5), 'draw', 'draw', 'draw', 'draw', 'draw'), NAMES), 'The set is drawn');
});

test('a saved set is checked: known length, known results, no round after it was decided', () => {
  assert.deepEqual(validSet({ length: 3, rounds: ['first'] }), createSet(3, ['first']));
  for (const bad of [null, {}, { length: 4, rounds: [] }, { length: 3, rounds: 'first' }, { length: 3, rounds: ['win'] },
    { length: 3, rounds: ['first', 'first', 'second'] }, { length: 1, rounds: ['draw', 'draw'] }]) {
    assert.equal(validSet(bad), null, JSON.stringify(bad));
  }
  assert.equal(validSet({ length: 3, rounds: ['first', 'first'] }, { unfinished: true }), null, 'a decided set is not unfinished');
});

// ----------------------------------------------------------- save fields

test('match length and set records in the save: repaired, recorded apart from games, cleared with the game', () => {
  const raw = createDefaultSave();
  raw.shellsFeathers.settings.setLength = 4;
  raw.acornsLeaves.settings.setLength = '3';
  raw.shellsFeathers.stats.sets = { single: { bestOf3: { wins: -2, losses: 'x' } } };
  raw.tutorials = { shellsFeathers: 'done', acornsLeaves: 'maybe' };
  const save = normalizeSave(JSON.parse(JSON.stringify(raw)));
  assert.equal(save.shellsFeathers.settings.setLength, 1);
  assert.equal(save.acornsLeaves.settings.setLength, 1, 'a string is not a length');
  assert.deepEqual(save.shellsFeathers.stats.sets.single.bestOf3, { wins: 0, losses: 0, draws: 0 });
  assert.deepEqual(save.tutorials, { shellsFeathers: 'done', acornsLeaves: null });
  // A Stage 14 save has none of these: it gets the defaults.
  const older = createDefaultSave();
  delete older.tutorials;
  delete older.shellsFeathers.stats.sets;
  delete older.acornsLeaves.stats.fog.sets;
  const loaded = normalizeSave(JSON.parse(JSON.stringify(older)));
  assert.deepEqual(loaded.acornsLeaves.stats.fog.sets.twoPlayer.bestOf5, { acornWins: 0, leafWins: 0, draws: 0 });
  assert.deepEqual(loaded.tutorials, { shellsFeathers: null, acornsLeaves: null });

  recordSet(save, { game: 'shellsFeathers', mode: 'single', length: 3, outcome: 'win' });
  recordSet(save, { game: 'shellsFeathers', mode: 'two', length: 5, outcome: 'second' });
  recordSet(save, { game: 'acornsLeaves', mode: 'single', length: 5, outcome: 'draw', variant: 'fog' });
  recordSet(save, { game: 'acornsLeaves', mode: 'single', length: 1, outcome: 'win' }); // a single game is not a set
  assert.deepEqual(save.shellsFeathers.stats.sets.single.bestOf3, { wins: 1, losses: 0, draws: 0 });
  assert.deepEqual(save.shellsFeathers.stats.sets.twoPlayer.bestOf5, { player1Wins: 0, player2Wins: 1, draws: 0 });
  assert.deepEqual(save.acornsLeaves.stats.fog.sets.single.bestOf5, { wins: 0, losses: 0, draws: 1 });
  assert.deepEqual(save.acornsLeaves.stats.sets.single.bestOf3, { wins: 0, losses: 0, draws: 0 }, 'Fog sets kept apart from Classic');
  assert.equal(save.shellsFeathers.stats.single.easy.wins, 0, 'a set is not another game');
});

// ---------------------------------------------------------- resume store

test('the resume store: saved and cleared; corrupt, other-version and unfitting data set aside and reported once', () => {
  const storage = createMemoryStorage();
  const store = openStorage(() => storage);
  const resume = createResumeStore(store);
  resume.save('shellsFeathers', { mode: 'two', moves: [4] });
  assert.equal(JSON.parse(storage.map.get(RESUME_KEY)).shellsFeathers.moves[0], 4);
  resume.clear('shellsFeathers');
  assert.equal(storage.map.has(RESUME_KEY), false, 'nothing left: the key goes');

  storage.map.set(RESUME_KEY, '{not json');
  const corrupt = createResumeStore(store);
  assert.equal(corrupt.get('acornsLeaves'), null);
  assert.equal(corrupt.takeProblem('acornsLeaves'), 'corrupt');
  assert.equal(corrupt.takeProblem('acornsLeaves'), null, 'said once');
  assert.equal(storage.map.has(RESUME_KEY), false);

  storage.map.set(RESUME_KEY, JSON.stringify({ version: 9, shellsFeathers: { moves: [] } }));
  const newer = createResumeStore(store);
  assert.deepEqual([newer.takeProblem('shellsFeathers'), newer.takeProblem('acornsLeaves')], ['version', null]);

  const fine = createResumeStore(store);
  fine.save('acornsLeaves', { moves: [[1, 2]] });
  fine.reject('acornsLeaves');
  assert.equal(fine.takeProblem('acornsLeaves'), 'invalid');
  assert.equal(fine.get('acornsLeaves'), null);
  assert.ok(ALL_KEYS.includes(RESUME_KEY), '"Delete all saved data" removes it too');
});

test('Shells & Feathers: a snapshot is replayed exactly, or refused', () => {
  const base = {
    mode: 'single', difficulty: 'hard', player1Symbol: 'feather', set: { length: 3, rounds: ['second'] }, moves: [4, 0, 8],
  };
  const restored = restoreShellsFeathers(base);
  assert.deepEqual(restored.match.board, ['shell', null, null, null, 'feather', null, null, null, 'feather']);
  assert.equal(restored.match.turn, 'shell', 'the Spirit is to move');
  assert.match(describeUnfinished('shellsFeathers', restored), /^Against the Spirit \(Wise\), you play Feathers · Round 2 of 3 · You 0, the Spirit 1 · 3 moves played this round$/);
  for (const bad of [
    { ...base, moves: [4, 4] },
    { ...base, moves: [0, 3, 1, 4, 2] }, // already won
    { ...base, moves: [9] },
    { ...base, difficulty: 'impossible' },
    { ...base, set: { length: 3, rounds: ['second', 'second'] } }, // decided
    { ...base, moves: 'all' },
  ]) assert.equal(restoreShellsFeathers(bad), null, JSON.stringify(bad));
});

test('Acorns & Leaves: a snapshot is replayed through the rules, or refused', () => {
  const base = {
    mode: 'two', variant: 'fog', difficulty: 'easy', side: 'acorn', set: { length: 1, rounds: [] }, moves: [[sq(5, 2), sq(4, 3)], [sq(2, 1), sq(3, 2)]],
  };
  const restored = restoreAcornsLeaves(base);
  assert.equal(restored.moves.length, 2);
  assert.match(describeUnfinished('acornsLeaves', restored), /^Fog of War, two players · Single game · 2 moves played this round$/);
  assert.equal(restoreAcornsLeaves({ ...base, moves: [[sq(5, 2), sq(3, 4)]] }), null, 'an illegal move');
  assert.equal(restoreAcornsLeaves({ ...base, moves: [[sq(2, 1), sq(3, 2)]] }), null, 'the wrong side first');
  assert.equal(restoreAcornsLeaves({ ...base, variant: 'mist' }), null);
  // A move that ends the game is not resumed.
  const rows = ['........', '..l.....', '.a......', '........', '........', '........', '........', '........'];
  assert.equal(restoreAcornsLeaves({ ...base, variant: 'classic', moves: [[sq(2, 1), sq(0, 3)]] }, { initialState: () => positionFromRows(rows) }), null);
});

// ------------------------------------------------------------- sessions

function shellsFeathers({ setLength = 3, player1Symbol = 'shell', difficulty = 'easy' } = {}) {
  const clock = createFakeClock();
  const view = createFakeView();
  const profile = createProfile(openStorage(() => createMemoryStorage()));
  profile.updateGameSettings({ setLength, player1Symbol, difficulty });
  const resume = createFakeResume();
  const session = createShellsFeathers({
    view, audio: createFakeAudio(), profile, clock, rng: () => 0, resume,
  });
  const round = (cells) => {
    for (const cell of cells) session.selectCell(cell);
    clock.tick(SF_DELAYS.resultModal);
  };
  return { clock, view, profile, session, resume, round };
}
const P1_WINS = [0, 3, 1, 4, 2];
const P2_WINS = [3, 0, 4, 1, 8, 2];
const DRAW = [0, 1, 2, 4, 3, 5, 7, 6, 8];

test('a best-of-three set with two players: each round recorded as a game, the set once, Next Round then Play Again', () => {
  const { view, profile, session, round } = shellsFeathers();
  session.enter('two');
  assert.equal(view.setLine, 'Round 1 of 3 · Player 1 0, Player 2 0');
  round(P1_WINS);
  assert.deepEqual(view.flow, {
    progress: 'Round 2 of 3 · Player 1 1, Player 2 0', primary: 'Next Round', setDone: false, switchSides: false,
  });
  assert.deepEqual(view.scores, { player1: 1, player2: 0 }, 'the chips show round wins in the set');
  session.playAgain();
  round(DRAW);
  assert.equal(view.flow.progress, 'Round 3 of 3 · Player 1 1, Player 2 0 · 1 draw');
  session.playAgain();
  round(P2_WINS);
  assert.equal(view.flow.progress, 'The set is drawn · Player 1 1, Player 2 1 · 1 draw');
  assert.equal(view.flow.primary, 'Play Again');
  assert.equal(profile.stats().twoPlayer.draws, 1, 'every round is a game');
  assert.equal(profile.stats().twoPlayer.player1Wins + profile.stats().twoPlayer.player2Wins, 2);
  assert.deepEqual(profile.stats().sets.twoPlayer.bestOf3, { player1Wins: 0, player2Wins: 0, draws: 1 });
  session.playAgain();
  assert.equal(view.setLine, 'Round 1 of 3 · Player 1 0, Player 2 0', 'a new set');
  assert.deepEqual(profile.stats().sets.twoPlayer.bestOf3, { player1Wins: 0, player2Wins: 0, draws: 1 }, 'recorded once');
});

test('against the Spirit: Switch Sides plays the other pieces, the score follows you; Restart replays the round, not the set', () => {
  const { view, profile, session, clock, round } = shellsFeathers();
  session.enter('single');
  // Gentle with rng 0 takes the first open square.
  round([4]);
  clock.tick(SF_DELAYS.spiritMove);
  round([1]);
  clock.tick(SF_DELAYS.spiritMove);
  round([7]);
  assert.equal(view.result.outcome, 'win');
  assert.equal(view.flow.switchSides, true);
  session.switchSides();
  assert.equal(view.matchInfo.player1Symbol, 'feather');
  assert.equal(profile.gameSettings().player1Symbol, 'feather', 'saved, so the setup screen shows it');
  assert.equal(view.setLine, 'Round 2 of 3 · You 1, the Spirit 0', 'the set goes on');
  session.selectCell(4);
  session.restart();
  assert.equal(view.setLine, 'Round 2 of 3 · You 1, the Spirit 0');
  assert.equal(view.pieces, 0);
});

test('Shells & Feathers: saved after every move and between rounds; resumed exactly, the Spirit\'s turn and all; finished, gone', () => {
  const first = shellsFeathers({ difficulty: 'medium' });
  first.session.enter('single');
  first.session.selectCell(4);
  assert.deepEqual(first.resume.get('shellsFeathers').moves, [4]);
  const snapshot = first.resume.get('shellsFeathers');
  first.session.leave();

  // Another page, with different settings saved since: the match keeps its own.
  const second = shellsFeathers({ difficulty: 'easy', setLength: 1, player1Symbol: 'feather' });
  assert.equal(second.session.resumeFrom(snapshot), true);
  assert.deepEqual(second.view.matchInfo, { mode: 'single', difficulty: 'medium', player1Symbol: 'shell' });
  assert.deepEqual(second.view.board.filter(Boolean), ['shell']);
  assert.equal(second.view.boardState, 'waiting', 'the Spirit had still to move');
  second.session.pause('hidden');
  second.clock.tick(SF_DELAYS.spiritMove * 5);
  assert.equal(second.view.pieces, 1, 'a hidden page holds it');
  second.session.resume('hidden');
  second.clock.tick(SF_DELAYS.spiritMove);
  assert.equal(second.view.pieces, 2);
  assert.equal(second.resume.get('shellsFeathers').moves.length, 2);
  assert.equal(second.session.resumeFrom({ ...snapshot, moves: [4, 4] }), false, 'a bad snapshot changes nothing');
  assert.equal(second.view.pieces, 2);

  // Between rounds of a set: the next round, with the set so far.
  const third = shellsFeathers();
  third.session.enter('two');
  third.round(P1_WINS);
  assert.deepEqual(third.resume.get('shellsFeathers'), {
    mode: 'two', difficulty: 'easy', player1Symbol: 'shell', set: { length: 3, rounds: ['first'] }, moves: [],
  });
  third.session.playAgain();
  third.round(P1_WINS);
  assert.equal(third.resume.get('shellsFeathers'), null, 'a decided set leaves nothing to resume');
  // A single game is saved while it is played, and removed at the end.
  const single = shellsFeathers({ setLength: 1 });
  single.session.enter('two');
  single.session.selectCell(0);
  assert.ok(single.resume.get('shellsFeathers'));
  single.round(P1_WINS.slice(1));
  assert.equal(single.resume.get('shellsFeathers'), null);
});

function checkers({ setLength = 1, rows, side = 'acorn', variant = 'classic', chooseMove } = {}) {
  const clock = createFakeClock();
  const view = createFakeCheckersView();
  const profile = createProfile(openStorage(() => createMemoryStorage()));
  profile.updateAcornsLeavesSettings({ side, difficulty: 'easy', variant, setLength });
  const resume = createFakeResume();
  const session = createCheckers({
    view, audio: createFakeAudio(), profile, clock, rng: () => 0.5, resume,
    chooseMove: chooseMove ?? ((state) => legalMoves(state)[0]),
    chooseFogStep: (seen) => seen.steps[0],
    initialState: rows ? () => positionFromRows(rows) : createInitialState,
  });
  const tap = (...squares) => squares.forEach((s) => session.selectSquare(s));
  return { clock, view, profile, session, resume, tap };
}

test('Acorns & Leaves: a set against the Spirit, a resumed Classic game, and a resumed two-player Fog game behind the handoff', () => {
  // b6 jumps the last leaf: one move wins a round.
  const win = ['........', '..l.....', '.a......', '........', '........', '........', '........', '........'];
  const { view, profile, session, clock, tap } = checkers({ setLength: 3, rows: win });
  session.enter('single');
  tap(sq(2, 1), sq(0, 3));
  clock.tick(DELAYS.resultModal);
  assert.equal(view.flow.progress, 'Round 2 of 3 · You 1, the Spirit 0');
  assert.equal(view.setLine, 'Round 2 of 3 · You 1, the Spirit 0');
  session.playAgain();
  tap(sq(2, 1), sq(0, 3));
  clock.tick(DELAYS.resultModal);
  assert.equal(view.flow.progress, 'You win the set · You 2, the Spirit 0');
  assert.equal(view.flow.primary, 'Rematch');
  assert.deepEqual(profile.acornsLeavesStats().sets.single.bestOf3, { wins: 1, losses: 0, draws: 0 });

  // Classic, against the Spirit: resumed exactly, with what was said last.
  const first = checkers();
  first.session.enter('single');
  first.tap(sq(5, 2), sq(4, 3));
  first.clock.tick(DELAYS.spiritThink + DELAYS.spiritStep * 3);
  const board = first.view.model.board;
  const snapshot = first.resume.get('acornsLeaves');
  assert.equal(snapshot.moves.length, 2);
  first.session.leave();
  const second = checkers({ side: 'leaf' });
  assert.equal(second.session.resumeFrom(snapshot), true);
  assert.deepEqual(second.view.model.board, board);
  assert.equal(second.view.orientation, 'acorn', 'its own side, not the side saved since');
  assert.match(second.view.said, /^Match resumed\. The Spirit moved from /);
  assert.equal(second.view.model.phase, 'ready');

  // Two players in Fog: behind the handoff, nothing drawn until the next player is ready.
  const fogA = checkers({ variant: 'fog' });
  fogA.session.enter('two', 'fog');
  fogA.session.takeControl();
  fogA.tap(sq(5, 2), sq(4, 3));
  const fogSnapshot = fogA.resume.get('acornsLeaves');
  const fogB = checkers();
  assert.equal(fogB.session.resumeFrom(fogSnapshot), true);
  assert.equal(fogB.view.model.phase, 'handoff');
  assert.ok(fogB.view.model.board.every((cell) => cell === null), 'no piece drawn behind the handoff');
  assert.equal(fogB.view.handoff.title.includes('Leaves'), true);
  fogB.session.takeControl();
  assert.equal(fogB.view.model.phase, 'ready');
  assert.ok(fogB.view.model.fog.length > 0, 'the Leaves see only their view');
});

test('a resumed Spirit turn runs once: nothing from the match before is left to fire', () => {
  const { session, clock, view, resume } = checkers({ chooseMove: (state) => legalMoves(state)[0] });
  session.enter('single');
  session.selectSquare(sq(5, 2));
  session.selectSquare(sq(4, 3)); // the Spirit's move is now pending
  const snapshot = resume.get('acornsLeaves');
  assert.equal(session.resumeFrom(snapshot), true);
  const before = view.model.played;
  clock.tick(DELAYS.spiritThink + DELAYS.spiritStep * 6);
  assert.equal(view.model.played, before + 1, 'exactly one Spirit move');
  assert.equal(clock.pending, 0);
});

test('settings saved with the match length; tutorials remembered as done or skipped', () => {
  const storage = createMemoryStorage();
  const profile = createProfile(openStorage(() => storage));
  profile.updateGameSettings({ setLength: 5 });
  profile.updateAcornsLeavesSettings({ setLength: 7 });
  assert.equal(profile.gameSettings().setLength, 5);
  assert.equal(profile.acornsLeavesSettings().setLength, 1, 'only 1, 3 or 5');
  assert.equal(profile.tutorial('acornsLeaves'), null);
  profile.setTutorial('acornsLeaves', 'skipped');
  profile.setTutorial('shellsFeathers', 'nonsense');
  const again = createProfile(openStorage(() => storage));
  assert.equal(again.tutorial('acornsLeaves'), 'skipped');
  assert.equal(again.tutorial('shellsFeathers'), null);
  assert.equal(JSON.parse(storage.map.get(SAVE_KEY)).shellsFeathers.settings.setLength, 5);
});

test('sound effects are fetched at the first gesture, once, never while the page loads', async () => {
  const { createAudio } = await import('../../src/shared/audio.js');
  const loads = [];
  const effects = ['capture-sound', 'select-sound'].map((id) => ({ id, preload: 'none', load() { loads.push(id); } }));
  const music = { paused: true, volume: 0, play: () => Promise.resolve(), pause() {} };
  const doc = {
    getElementById: (id) => (id === 'gameplay-music' ? music : effects.find((e) => e.id === id) ?? null),
    querySelectorAll: (selector) => (selector === 'audio[data-sfx]' ? effects : []),
  };
  const audio = createAudio({ doc, musicId: 'gameplay-music', clock: createFakeClock() });
  audio.startMusic();
  assert.deepEqual(loads, [], 'nothing fetched before a gesture');
  audio.unlock();
  assert.deepEqual(loads, ['capture-sound', 'select-sound']);
  assert.ok(effects.every((e) => e.preload === 'auto'));
  audio.unlock();
  assert.equal(loads.length, 2, 'once');
});
