// What the two game sessions play and report: result sounds, move, capture,
// crowning and reveal sounds, achievements unlocked by results (shown in the
// result dialog) and by moments in play (reported through `notify`), each
// once, only for the device owner's games against the Spirit. In Fog, sounds
// never give away what a listener couldn't see (docs/fog-rules.md §4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession as createShellsFeathersSession, DELAYS as SF_DELAYS } from '../../src/games/shells-feathers/session.js';
import { createSession, DELAYS } from '../../src/games/acorns-leaves/session.js';
import { createInitialState, positionFromRows, legalMoves, squareAt } from '../../src/games/acorns-leaves/engine.js';
import { chooseFogStep } from '../../src/games/acorns-leaves/fog-ai.js';
import { createProfile } from '../../src/shared/profile.js';
import { openStorage } from '../../src/shared/storage.js';
import {
  createFakeClock, createFakeAudio, createFakeView, createFakeCheckersView, createMemoryStorage,
} from '../helpers/fakes.mjs';

const sq = (row, col) => squareAt(row, col);
const titles = (list) => (list ?? []).map((a) => a.title);
const seeded = (seed) => () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

function shellsFeathers({ difficulty = 'easy', storage = createMemoryStorage() } = {}) {
  const clock = createFakeClock();
  const view = createFakeView();
  const audio = createFakeAudio();
  const profile = createProfile(openStorage(() => storage));
  profile.updateGameSettings({ difficulty, player1Symbol: 'shell' });
  const session = createShellsFeathersSession({ view, audio, profile, clock, rng: () => 0 });
  return { clock, view, audio, profile, session, storage };
}

function checkers({ side = 'acorn', variant = 'classic', rows, quietPlies, storage = createMemoryStorage(), chooseMove, decide } = {}) {
  const clock = createFakeClock();
  const view = createFakeCheckersView();
  const audio = createFakeAudio();
  const profile = createProfile(openStorage(() => storage));
  profile.updateAcornsLeavesSettings({ side, difficulty: 'easy', variant });
  const notified = [];
  const session = createSession({
    view, audio, profile, clock,
    notify: (list) => notified.push(list),
    rng: () => 0.5,
    chooseMove: chooseMove ?? ((state) => legalMoves(state)[0]),
    chooseFogStep: decide ?? ((seen) => seen.steps[0]),
    initialState: rows ? () => positionFromRows(rows, { quietPlies }) : createInitialState,
  });
  const tap = (...squares) => squares.forEach((square) => session.selectSquare(square));
  return { clock, view, audio, profile, session, tap, notified, storage };
}

test('Shells & Feathers: a win plays the victory theme (music pauses) and lists what it unlocked; a second win lists nothing', () => {
  const { clock, view, audio, session } = shellsFeathers();
  session.enter('single');
  // Gentle with rng 0 takes the first open square: 0, then 2.
  for (const cell of [4, 1]) {
    session.selectCell(cell);
    clock.tick(SF_DELAYS.spiritMove);
  }
  session.selectCell(7); // 1-4-7
  assert.deepEqual(audio.calls.slice(-2), ['music:stop', 'sfx:victory-sound']);
  clock.tick(SF_DELAYS.resultModal);
  assert.equal(view.result.outcome, 'win');
  assert.deepEqual(titles(view.resultAchievements), ['First Game', 'First Win', 'Gentle Win', 'Win with Shells']);

  session.playAgain();
  for (const cell of [4, 1]) {
    session.selectCell(cell);
    clock.tick(SF_DELAYS.spiritMove);
  }
  session.selectCell(7);
  clock.tick(SF_DELAYS.resultModal);
  assert.deepEqual(view.resultAchievements, [], 'each achievement is announced once');
});

test('Shells & Feathers: a loss plays a gentle loss sound and a draw a settling chord; the music keeps playing', () => {
  const lost = shellsFeathers({ difficulty: 'hard' });
  lost.session.enter('single');
  for (const cell of [0, 1, 3]) {
    lost.session.selectCell(cell);
    lost.clock.tick(SF_DELAYS.spiritMove);
  }
  assert.equal(lost.view.finalTurn.outcome, 'loss');
  assert.equal(lost.audio.calls.at(-1), 'sfx:loss-sound');
  assert.ok(!lost.audio.calls.includes('music:stop') && !lost.audio.calls.includes('sfx:victory-sound'));

  const drawn = shellsFeathers();
  drawn.session.enter('two');
  for (const cell of [0, 1, 2, 4, 3, 5, 7, 6, 8]) drawn.session.selectCell(cell);
  assert.equal(drawn.view.finalTurn.outcome, 'draw');
  assert.equal(drawn.audio.calls.at(-1), 'sfx:draw-sound');
  assert.ok(!drawn.audio.calls.includes('music:stop'));
  drawn.clock.tick(SF_DELAYS.resultModal);
  assert.deepEqual(titles(drawn.view.resultAchievements), ['First Game', 'Shared Board'], 'a shared game is not a win of yours');
});

test('Acorns & Leaves: your double jump sounds a capture at each jump and unlocks Double Jump once, right away', () => {
  const rows = ['.l......', '......l.', '........', '..l.l...', '........', '..l.....', '.a......', '....a...'];
  const game = checkers({ rows });
  game.session.enter('single');
  game.tap(sq(6, 1), sq(4, 3));
  assert.equal(game.audio.calls.at(-1), 'sfx:capture-sound');
  game.tap(sq(2, 1));
  assert.ok(game.audio.calls.filter((c) => c === 'sfx:capture-sound').length >= 2);
  assert.deepEqual(game.notified.map(titles), [['Double Jump']]);

  // The same again in a new game (same saved profile): nothing new to report.
  const again = checkers({ rows, storage: game.storage });
  again.session.enter('single');
  again.tap(sq(6, 1), sq(4, 3), sq(2, 1));
  assert.deepEqual(again.notified, []);
});

test('Acorns & Leaves: your crowning sounds and unlocks Crowned; the Spirit\'s crowning sounds in Classic, never in Fog', () => {
  // The acorn on c7 crowns on b8; the leaf on f2 crowns on e1 or g1 in reply.
  const rows = ['........', '..a.....', '........', '........', '........', '........', '.....l..', '........'];
  const classic = checkers({ rows });
  classic.session.enter('single');
  classic.tap(sq(1, 2), sq(0, 1));
  assert.deepEqual(classic.audio.calls.slice(-2), ['sfx:piece-move', 'sfx:crown-sound']);
  assert.deepEqual(classic.notified.map(titles), [['Crowned']]);
  const before = classic.audio.calls.length;
  classic.clock.tick(DELAYS.spiritThink + DELAYS.spiritStep * 2);
  assert.deepEqual(classic.audio.calls.slice(before), ['sfx:piece-move-other', 'sfx:crown-sound'], 'in Classic the Spirit\'s crowning is in view');

  const fogged = checkers({ rows, variant: 'fog' });
  fogged.session.enter('single', 'fog');
  fogged.tap(sq(1, 2), sq(0, 1));
  assert.deepEqual(fogged.audio.calls.slice(-2), ['sfx:piece-move', 'sfx:crown-sound'], 'your own crowning sounds in Fog too');
  const mark = fogged.audio.calls.length;
  fogged.clock.tick(DELAYS.spiritThink + DELAYS.spiritStep);
  assert.equal(fogged.view.model.turn, 'acorn', 'the Spirit has moved');
  assert.deepEqual(fogged.audio.calls.slice(mark), ['sfx:piece-move-other'], 'its hidden crowning makes no sound');
});

test('two players: crownings and double jumps unlock nothing (the device is shared)', () => {
  const rows = ['........', '..a.....', '........', '........', '........', '........', '.....l..', '........'];
  const game = checkers({ rows });
  game.session.enter('two');
  game.tap(sq(1, 2), sq(0, 1));
  assert.ok(game.audio.calls.includes('sfx:crown-sound'));
  assert.deepEqual(game.notified, []);
  assert.deepEqual(game.profile.achievements('acornsLeaves').filter((a) => a.unlocked), []);
});

test('two players in Fog: every move makes the same tap and nothing else sounds, for a whole game', () => {
  const rng = seeded(11);
  const game = checkers({ variant: 'fog' });
  game.session.enter('two', 'fog');
  for (let steps = 0; game.view.model.phase !== 'over'; steps++) {
    assert.ok(steps < 4000, 'the game ends');
    if (game.view.model.phase === 'handoff') {
      game.session.takeControl();
      continue;
    }
    const { model } = game.view;
    const options = model.selected === null ? model.movable : model.destinations;
    game.tap(options[Math.floor(rng() * options.length)]);
  }
  const sounds = new Set(game.audio.calls);
  for (const id of ['sfx:capture-sound', 'sfx:crown-sound', 'sfx:reveal-sound', 'sfx:piece-move-other', 'sfx:button-select']) {
    assert.ok(!sounds.has(id), `${id} would tell the other player something`);
  }
  assert.ok(sounds.has('sfx:piece-move'));
  assert.ok(sounds.has('sfx:victory-sound') || sounds.has('sfx:draw-sound'), 'the result is public');
  assert.deepEqual(game.notified, []);
});

test('Fog against the Spirit: its turns never sound a crowning or a reveal, for a whole game', () => {
  const game = checkers({
    variant: 'fog',
    decide: (seen, options) => chooseFogStep(seen, { ...options, difficulty: 'medium', maxNodes: 500, now: () => 0 }),
  });
  game.session.enter('single', 'fog');
  let spiritTurns = 0;
  for (let steps = 0; game.view.model.phase !== 'over'; steps++) {
    assert.ok(steps < 2000, 'the game ends');
    if (game.view.model.phase === 'waiting') {
      const mark = game.audio.calls.length;
      game.clock.tick(DELAYS.spiritThink + DELAYS.spiritStep);
      const heard = game.audio.calls.slice(mark).filter((c) => c.startsWith('sfx:'));
      assert.ok(heard.every((c) => ['sfx:piece-move-other', 'sfx:capture-sound', 'sfx:victory-sound', 'sfx:loss-sound', 'sfx:draw-sound'].includes(c)), heard.join());
      spiritTurns++;
      continue;
    }
    const { model } = game.view;
    game.tap(model.selected === null ? model.movable[0] : model.destinations[0]);
  }
  assert.ok(spiritTurns > 5);
});

test('Acorns & Leaves results: a loss and a draw have their own gentle sounds; a result lists the achievements it unlocked', () => {
  const lose = checkers({ rows: ['........', '........', '........', '..l.....', '........', '..a.....', '........', '........'] });
  lose.session.enter('single');
  lose.tap(sq(5, 2), sq(4, 3));
  lose.clock.tick(DELAYS.spiritThink + DELAYS.spiritStep * 2);
  assert.equal(lose.view.model.phase, 'over');
  assert.ok(lose.audio.calls.includes('sfx:loss-sound'));
  lose.clock.tick(DELAYS.resultModal);
  assert.deepEqual(titles(lose.view.resultAchievements), ['First Game'], 'a loss is still a finished game');

  const draw = checkers({ rows: ['.......L', '........', '........', '........', '........', '........', '........', 'A.......'], quietPlies: 79 });
  draw.session.enter('two');
  draw.tap(sq(7, 0), sq(6, 1));
  assert.equal(draw.audio.calls.at(-1), 'sfx:draw-sound');
  draw.clock.tick(DELAYS.resultModal);
  assert.deepEqual(titles(draw.view.resultAchievements), ['First Game', 'Shared Board']);

  const win = checkers({ rows: ['........', '........', '........', '........', '.l......', '..a.....', '........', '....a...'], variant: 'fog' });
  win.session.enter('single', 'fog');
  win.tap(sq(5, 2), sq(3, 0));
  assert.equal(win.view.model.phase, 'over');
  assert.deepEqual(win.audio.calls.slice(-3), ['sfx:capture-sound', 'music:stop', 'sfx:victory-sound']);
  win.clock.tick(DELAYS.resultModal);
  assert.deepEqual(titles(win.view.resultAchievements), ['First Game', 'First Win', 'Through the Fog', 'Win with Acorns']);
});
