// Runs Shells & Feathers on the game screen: one match at a time, the Spirit's
// turns, results, session score and sounds. No DOM access; drawing goes
// through `view` (see view.js).
//
// Lifecycle: enter(mode) when the match screen opens (a new match: a single
// game, or a best-of-three or -five set, from the saved setting),
// resumeFrom(snapshot) to rebuild an unfinished one, restart() for "Restart"
// (this round again; the set keeps its score), playAgain() for the result's
// main button (the set's next round, or a new match once it is decided),
// switchSides() to play the other pieces from the next round on (against the
// Spirit; the set keeps its score), leave() when the screen closes, and
// pause()/resume() while the match menu is open or the page is hidden (the
// Spirit's move and the result dialog wait).
//
// Sets (src/shared/match-set.js): every round is also recorded as a game in
// the usual records; a decided set of three or five is recorded apart
// (profile.recordSet). A single game keeps the session score as before.
//
// Resume: after every move, and between the rounds of a set, the match is
// saved (src/shared/resume.js) with the squares played this round, so it can
// be rebuilt exactly; a finished match is removed. Entering a new match
// replaces the saved one.
// Each match owns a timer scope; starting another match or leaving disposes
// it, so a pending Spirit move, result dialog or music restart from an old
// match can never fire.
//
// Scoring: a round is recorded once, when its last move is played. A round
// that is restarted or left before it ends is not recorded. Achievements the
// result unlocks are shown in the result dialog.
//
// Feedback (sound, optional vibration, animation) goes through the shared
// feedback service (src/shared/feedback.js): each placement (the piece
// settles in; only a person's placement vibrates, not the Spirit's), a leaf
// rustle for a taken square, and at the end the victory theme for a win
// (yours, or either player's with two players; the music pauses for it), a
// gentle falling pair of notes for a loss and a settling chord for a draw.
import { createMatch } from './match.js';
import { chooseMove, LEVEL_WORDS } from './ai.js';
import { snapshotOf, restoreShellsFeathers } from './resume.js';
import {
  createSet, recordRound, setScore, setProgressText,
} from '../../shared/match-set.js';
import { hintText, RULE_NOTE } from './view.js';
import { createTimerScope } from '../../shared/timers.js';
import { createFeedback } from '../../shared/feedback.js';

export const DELAYS = { spiritMove: 800, resultModal: 800, musicRestart: 300 };

const NAMES = { single: { first: 'You', second: 'the Spirit' }, two: { first: 'Player 1', second: 'Player 2' } };
const ROUND_WINNER = {
  win: 'first', player1: 'first', loss: 'second', player2: 'second', draw: 'draw',
};

export function createSession({
  view, audio, profile, clock = globalThis, rng = Math.random, delays = DELAYS, feedback = createFeedback({ audio, clock }),
  resume = null,
}) {
  let mode = null;
  let match = null;
  let timers = null;
  let spiritThinking = false;
  let scoredMatch = null;
  let matchCount = 0;
  const holds = new Set();
  const scores = { player1: 0, player2: 0 };
  // The match's own settings, fixed when it starts (or is restored), and the
  // set so far.
  let config = null;
  let set = createSet(1);
  let moves = []; // squares played this round, in order

  const inSet = () => set.length > 1;
  // The set's progress for the match header, or '' for a single game.
  const setLine = () => (inSet() ? setProgressText(set, NAMES[mode]) : '');

  function enter(newMode) {
    mode = newMode;
    newSet();
    feedback.cue('newGame', { key: matchCount });
  }

  // A new match from the saved settings: it replaces any unfinished one.
  function newSet() {
    const { difficulty, player1Symbol, setLength } = profile.gameSettings();
    config = { difficulty, player1Symbol };
    set = createSet(setLength);
    scores.player1 = 0;
    scores.player2 = 0;
    resume?.clear('shellsFeathers');
    startMatch();
  }

  // Rebuilds an unfinished match exactly as saved, or returns false (and
  // changes nothing) if the snapshot doesn't fit the rules.
  function resumeFrom(snapshot) {
    const restored = restoreShellsFeathers(snapshot);
    if (!restored) return false;
    mode = restored.mode;
    config = { difficulty: restored.difficulty, player1Symbol: restored.player1Symbol };
    set = restored.set;
    scores.player1 = 0;
    scores.player2 = 0;
    startMatch(restored);
    return true;
  }

  function leave() {
    teardownMatch();
    mode = null;
  }

  // This round again; the set keeps its score.
  function restart() {
    if (!mode) return;
    startMatch();
    saveProgress();
  }

  // The result's main button: the set's next round, or (once the set is
  // decided, or after a single game) a new match.
  function playAgain() {
    if (!mode) return;
    audio.stopMusic();
    if (inSet() && !setScore(set).done) startMatch();
    else if (inSet()) newSet();
    else startMatch();
    saveProgress();
    feedback.cue('newGame', { key: matchCount });
    timers.after(delays.musicRestart, () => audio.startMusic());
  }

  // Against the Spirit: the other pieces from now on (saved as the setting
  // too), then on as playAgain. The set keeps its score: it follows you.
  function switchSides() {
    if (mode !== 'single' || !config) return;
    const player1Symbol = config.player1Symbol === 'shell' ? 'feather' : 'shell';
    profile.updateGameSettings({ player1Symbol });
    config = { ...config, player1Symbol };
    playAgain();
  }

  function startMatch(restored = null) {
    teardownMatch();
    matchCount += 1;
    const { difficulty, player1Symbol } = config;
    match = restored?.match ?? createMatch({ mode, player1Symbol, difficulty });
    moves = restored ? [...restored.moves] : [];
    timers = createTimerScope(clock);
    if (holds.size) timers.pause();
    view.clearBoard();
    view.showMatchInfo({ mode, difficulty, player1Symbol });
    view.showSet?.(setLine());
    showScores();
    // A restored round: its pieces as they were, then whoever is to move.
    for (const [i, index] of moves.entries()) {
      const symbol = i % 2 === 0 ? player1Symbol : match.player2Symbol;
      view.placePiece(index, symbol, actorFor(symbol));
    }
    if (match.isSpiritTurn()) {
      spiritThinking = true;
      view.setBoardState('waiting');
      timers.after(delays.spiritMove, spiritMove);
    } else {
      view.setBoardState('ready');
    }
    showTurn();
  }

  const actorFor = (symbol) => {
    const byPlayer1 = symbol === match.player1Symbol;
    return mode === 'single' ? (byPlayer1 ? 'you' : 'spirit') : (byPlayer1 ? 'player1' : 'player2');
  };

  // Chips: the set's round wins, or the session score for single games.
  function showScores() {
    if (!inSet()) {
      view.showScores(mode, scores);
      return;
    }
    const { wins } = setScore(set);
    view.showScores(mode, { player1: wins.first, player2: wins.second });
  }

  // Saves the match as it stands for resuming, or removes it once there is
  // nothing to resume (nothing played, or the match is over).
  function saveProgress() {
    if (!resume || !mode) return;
    const over = match?.result && (!inSet() || setScore(set).done);
    if (over || (!moves.length && !set.rounds.length)) {
      resume.clear('shellsFeathers');
      return;
    }
    resume.save('shellsFeathers', snapshotOf({
      mode, difficulty: config.difficulty, player1Symbol: config.player1Symbol, set, moves: match?.result ? [] : moves,
    }));
  }

  function teardownMatch() {
    timers?.dispose();
    timers = null;
    match = null;
    spiritThinking = false;
    view.hideResult();
    view.hideMenu();
    feedback.cancel(); // queued effects, the victory theme, vibration, animations
  }

  function selectCell(index) {
    if (!match || match.result || spiritThinking || timers.paused) return;
    if (mode === 'single' && match.turn !== match.player1Symbol) return;
    place(index);
  }

  function place(index) {
    const move = match.play(index);
    if (!move) {
      // A taken square: say so (the turn goes on).
      if (match.board[index] !== null) {
        showHint({ taken: true });
        feedback.cue('invalid', { at: { game: 'sf', index }, key: index });
      }
      return;
    }
    const byPlayer1 = move.symbol === match.player1Symbol;
    moves.push(move.index);
    view.placePiece(move.index, move.symbol, actorFor(move.symbol));
    feedback.cue(byPlayer1 ? 'place' : 'placeOther', {
      at: { game: 'sf', index: move.index }, key: `${matchCount}:${move.index}`, felt: mode === 'two' || byPlayer1,
    });
    if (match.result) {
      finish();
      return;
    }
    saveProgress();
    if (match.isSpiritTurn()) {
      spiritThinking = true;
      view.setBoardState('waiting');
      timers.after(delays.spiritMove, spiritMove);
    } else {
      view.setBoardState('ready');
    }
    showTurn();
  }

  function spiritMove() {
    spiritThinking = false;
    const index = chooseMove(match.board, {
      ai: match.player2Symbol,
      human: match.player1Symbol,
      difficulty: match.difficulty,
      rng,
    });
    if (index !== -1) place(index);
  }

  function finish() {
    if (scoredMatch === match) return; // never score a round twice
    scoredMatch = match;
    const { winner, line } = match.result;
    const outcome = match.outcome;
    view.setBoardState('over');
    const unlocked = profile.recordResult({
      mode, difficulty: match.difficulty, outcome, side: match.player1Symbol,
    }) ?? [];
    if (winner !== null) {
      if (winner === match.player1Symbol) scores.player1++;
      else scores.player2++;
      view.highlight(line);
    }
    set = recordRound(set, ROUND_WINNER[outcome]);
    const decided = setScore(set);
    if (inSet() && decided.done) {
      const setOutcome = mode === 'single'
        ? { first: 'win', second: 'loss', draw: 'draw' }[decided.winner]
        : decided.winner;
      profile.recordSet({
        game: 'shellsFeathers', mode, length: set.length, outcome: setOutcome,
      });
    }
    saveProgress();
    if (outcome === 'loss') {
      feedback.cue('loss', { key: matchCount });
    } else if (outcome === 'draw') {
      feedback.cue('draw', { key: matchCount });
    } else {
      audio.stopMusic();
      feedback.cue('win', { key: matchCount });
    }
    showScores();
    view.showSet?.(setLine());
    view.showFinalTurn(outcome, winner, line);
    showHint();
    const flow = resultFlow();
    timers.after(delays.resultModal, () => view.showResult(outcome, winner, unlocked, flow));
  }

  // What the result screen offers: the set's progress, its main button and
  // whether sides can be switched.
  function resultFlow() {
    const decided = setScore(set);
    return {
      progress: setLine(),
      primary: inSet() && !decided.done ? 'Next Round' : 'Play Again',
      setDone: inSet() && decided.done,
      switchSides: mode === 'single',
    };
  }

  function showTurn() {
    view.showTurn(mode, match.turn === match.player1Symbol, match.turn);
    showHint();
  }

  function showHint({ taken = false } = {}) {
    const phase = match.result ? 'over' : spiritThinking ? 'waiting' : 'ready';
    const { winner = null, line = null } = match.result ?? {};
    let note = RULE_NOTE;
    if (phase === 'waiting') note = LEVEL_WORDS[match.difficulty];
    else if (phase === 'over') note = '';
    view.showHint({
      text: hintText({
        phase, mode, isPlayer1: match.turn === match.player1Symbol, symbol: match.turn, outcome: match.outcome, winner, line, taken,
      }),
      note,
      tone: taken ? 'feedback' : phase,
    });
  }

  // The round freezes while anything holds it: the menu ('menu') or a
  // hidden page ('hidden'). It goes on when the last hold is let go.
  function pause(reason = 'menu') {
    holds.add(reason);
    timers?.pause();
    feedback.hold(reason);
  }

  function resumeMatch(reason = 'menu') {
    holds.delete(reason);
    feedback.release(reason);
    if (!holds.size) timers?.resume();
  }

  return {
    enter, resumeFrom, leave, restart, playAgain, switchSides, selectCell, pause, resume: resumeMatch,
    get set() { return set; },
  };
}
