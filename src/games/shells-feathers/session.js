// Runs Shells & Feathers on the game screen: one match at a time, the Spirit's
// turns, results, session score and sounds. No DOM access; drawing goes
// through `view` (see view.js).
//
// Lifecycle: enter(mode) when the match screen opens, restart() for
// "Restart", playAgain() for "Play Again", leave() when the screen closes.
// Each match owns a timer scope; starting another match or leaving disposes
// it, so a pending Spirit move, result dialog or music restart from an old
// match can never fire.
//
// Scoring: a round is recorded once, when its last move is played. A round
// that is restarted or left before it ends is not recorded.
import { createMatch } from './match.js';
import { chooseMove } from './ai.js';
import { createTimerScope } from '../../shared/timers.js';

export const DELAYS = { spiritMove: 800, resultModal: 800, musicRestart: 300 };

export function createSession({ view, audio, profile, clock = globalThis, rng = Math.random, delays = DELAYS }) {
  let mode = null;
  let match = null;
  let timers = null;
  let spiritThinking = false;
  let scoredMatch = null;
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
    view.showMatchInfo({ mode, difficulty, player1Symbol });
    view.setBoardState('ready');
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
    const byPlayer1 = move.symbol === match.player1Symbol;
    const actor = mode === 'single' ? (byPlayer1 ? 'you' : 'spirit') : (byPlayer1 ? 'player1' : 'player2');
    view.placePiece(move.index, move.symbol, actor);
    audio.playSfx(byPlayer1 ? 'player-select' : 'opponent-select');
    if (match.result) {
      finish();
      return;
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
    profile.recordResult({ mode, difficulty: match.difficulty, outcome });
    if (winner !== null) {
      if (winner === match.player1Symbol) scores.player1++;
      else scores.player2++;
      view.highlight(line);
      audio.stopMusic();
      audio.playSfx('victory-sound');
    }
    view.showScores(mode, scores);
    view.showFinalTurn(outcome, winner, line);
    timers.after(delays.resultModal, () => view.showResult(outcome, winner));
  }

  function showTurn() {
    view.showTurn(mode, match.turn === match.player1Symbol, match.turn);
  }

  return { enter, leave, restart, playAgain, selectCell };
}
