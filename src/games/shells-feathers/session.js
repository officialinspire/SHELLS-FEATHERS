// Runs Shells & Feathers on the game screen: one match at a time, the Spirit's
// turns, results, session score and sounds. No DOM access; drawing goes
// through `view` (see view.js).
//
// Lifecycle: enter(mode) when the match screen opens, restart() for
// "Restart", playAgain() for "Play Again", leave() when the screen closes,
// and pause()/resume() while the match menu is open or the page is hidden
// (the Spirit's move and the result dialog wait).
// Each match owns a timer scope; starting another match or leaving disposes
// it, so a pending Spirit move, result dialog or music restart from an old
// match can never fire.
//
// Scoring: a round is recorded once, when its last move is played. A round
// that is restarted or left before it ends is not recorded. Achievements the
// result unlocks are shown in the result dialog.
//
// Sounds: each placement; at the end the victory theme for a win (yours, or
// either player's with two players; the music pauses for it), a gentle
// falling pair of notes for a loss and a settling chord for a draw.
import { createMatch } from './match.js';
import { chooseMove, LEVEL_WORDS } from './ai.js';
import { hintText, RULE_NOTE } from './view.js';
import { createTimerScope } from '../../shared/timers.js';

export const DELAYS = { spiritMove: 800, resultModal: 800, musicRestart: 300 };

export function createSession({ view, audio, profile, clock = globalThis, rng = Math.random, delays = DELAYS }) {
  let mode = null;
  let match = null;
  let timers = null;
  let spiritThinking = false;
  let scoredMatch = null;
  const holds = new Set();
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
    if (holds.size) timers.pause();
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
    view.hideMenu();
    audio.stopSfx('victory-sound');
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
      if (match.board[index] !== null) showHint({ taken: true });
      return;
    }
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
    const unlocked = profile.recordResult({ mode, difficulty: match.difficulty, outcome }) ?? [];
    if (winner !== null) {
      if (winner === match.player1Symbol) scores.player1++;
      else scores.player2++;
      view.highlight(line);
    }
    if (outcome === 'loss') {
      audio.playSfx('loss-sound');
    } else if (outcome === 'draw') {
      audio.playSfx('draw-sound');
    } else {
      audio.stopMusic();
      audio.playSfx('victory-sound');
    }
    view.showScores(mode, scores);
    view.showFinalTurn(outcome, winner, line);
    showHint();
    timers.after(delays.resultModal, () => view.showResult(outcome, winner, unlocked));
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
  }

  function resume(reason = 'menu') {
    holds.delete(reason);
    if (!holds.size) timers?.resume();
  }

  return { enter, leave, restart, playAgain, selectCell, pause, resume };
}
