// Runs Shells & Feathers on the game screen: one match at a time, the Spirit's
// turns, results, session score and sounds. No DOM access; drawing goes
// through `view` (see view.js).
//
// Lifecycle: enter(mode) when the game screen opens, restart() for "New
// Journey", playAgain() for "New Game", leave() when the screen closes. Each
// match owns a timer scope; starting another match or leaving disposes it, so
// a pending Spirit move, result modal or music restart from an old match can
// never fire.
import { createMatch } from './match.js';
import { chooseMove } from './ai.js';
import { createTimerScope } from '../../shared/timers.js';

export const DELAYS = { spiritMove: 800, resultModal: 800, musicRestart: 300 };

export function createSession({ view, audio, profile, clock = globalThis, rng = Math.random, delays = DELAYS }) {
  let mode = null;
  let match = null;
  let timers = null;
  let spiritThinking = false;
  const scores = { player1: 0, player2: 0 };

  function enter(newMode) {
    mode = newMode;
    scores.player1 = 0;
    scores.player2 = 0;
    view.showScores(mode, scores);
    audio.playSfx('newgame-sound');
    startMatch();
  }

  function leave() {
    teardownMatch();
    mode = null;
  }

  function restart() {
    if (mode) startMatch();
  }

  function playAgain() {
    if (!mode) return;
    audio.stopMusic();
    audio.playSfx('newgame-sound');
    startMatch();
    timers.after(delays.musicRestart, () => audio.startMusic());
  }

  function startMatch() {
    teardownMatch();
    const { difficulty, player1Symbol } = profile.gameSettings();
    match = createMatch({ mode, player1Symbol, difficulty });
    timers = createTimerScope(clock);
    view.clearBoard();
    showTurn();
  }

  function teardownMatch() {
    timers?.dispose();
    timers = null;
    match = null;
    spiritThinking = false;
    view.hideResult();
    audio.stopSfx('victory-sound');
  }

  function selectCell(index) {
    if (!match || match.result || spiritThinking) return;
    if (mode === 'single' && match.turn !== match.player1Symbol) return;
    place(index);
  }

  function place(index) {
    const move = match.play(index);
    if (!move) return;
    view.placePiece(move.index, move.symbol);
    audio.playSfx(move.symbol === match.player1Symbol ? 'player-select' : 'opponent-select');
    if (match.result) {
      finish();
      return;
    }
    showTurn();
    if (match.isSpiritTurn()) {
      spiritThinking = true;
      timers.after(delays.spiritMove, spiritMove);
    }
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
    const { winner, line } = match.result;
    const outcome = match.outcome;
    profile.recordResult({ mode, difficulty: match.difficulty, outcome });
    if (winner !== null) {
      if (winner === match.player1Symbol) scores.player1++;
      else scores.player2++;
      view.highlight(line);
      audio.stopMusic();
      audio.playSfx('victory-sound');
    }
    view.showScores(mode, scores);
    timers.after(delays.resultModal, () => view.showResult(outcome, winner));
  }

  function showTurn() {
    view.showTurn(mode, match.turn === match.player1Symbol, match.turn);
  }

  return { enter, leave, restart, playAgain, selectCell };
}
