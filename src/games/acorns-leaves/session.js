// Runs Acorns & Leaves on its match screen: one match at a time, moves picked
// a square at a time (turn.js), the Spirit's turns, results and sounds. The
// rules stay in engine.js; this file only decides what happens next. No DOM
// access: drawing goes through `view` (see view.js).
//
// Lifecycle: enter(mode) when the match screen opens, restart() for
// "Restart", playAgain() for "Rematch", leave() when the screen closes. Each
// match owns a timer scope; starting another match or leaving disposes it,
// so a pending Spirit move, result dialog or music restart from an old match
// can never fire.
//
// The Spirit: after a short pause it picks its move (ai.js, which is bounded
// and only returns legal moves), then shows it a square at a time, so a chain
// of jumps can be followed, and plays it. From the moment its turn starts
// until its move is played the board is "waiting" and every pick is ignored.
//
// Scoring: a game is recorded once, when its last move is played. A game
// that is restarted or left before it ends is not recorded.
import { createInitialState, applyMove, analyze } from './engine.js';
import { chooseMove as spiritChoice } from './ai.js';
import {
  startTurn, choose, cancel, mustCapture, inChain, movablePieces, destinations, jumpedSoFar, displayBoard, selectedSquare,
} from './turn.js';
import {
  moveText, turnText, turnLabel, guidance, resultText, pickText, jumpText, FEEDBACK,
} from './text.js';
import { createTimerScope } from '../../shared/timers.js';

export const DELAYS = { spiritThink: 500, spiritStep: 400, resultModal: 900, musicRestart: 300 };

export function createSession({
  view, audio, profile,
  clock = globalThis, rng = Math.random, delays = DELAYS,
  chooseMove = spiritChoice, initialState = createInitialState,
}) {
  let mode = null;
  let match = null;
  let timers = null;
  let spiritActing = false;
  let scoredMatch = null;

  function enter(newMode) {
    mode = newMode;
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
    const { difficulty, side } = profile.acornsLeavesSettings();
    match = {
      state: initialState(),
      turn: null,
      humanSide: mode === 'single' ? side : null,
      difficulty,
      captured: { acorn: 0, leaf: 0 }, // pieces each side has taken
      lastMove: null,
      result: null,
      resultText: null,
      feedback: null,
    };
    timers = createTimerScope(clock);
    // Against the Spirit the player's pieces sit at the bottom.
    view.setOrientation(match.humanSide ?? 'acorn');
    view.showMatchInfo({ mode, difficulty, humanSide: match.humanSide });
    beginTurn('New game.');
  }

  function teardownMatch() {
    timers?.dispose();
    timers = null;
    match = null;
    spiritActing = false;
    view.hideResult();
    audio.stopSfx('victory-sound');
  }

  const isSpiritTurn = () => mode === 'single' && match.state.turn !== match.humanSide;

  function beginTurn(lead) {
    match.turn = startTurn(match.state);
    match.feedback = null;
    spiritActing = isSpiritTurn();
    render();
    const turnLine = turnText({ mode, turn: match.state.turn, humanSide: match.humanSide, mustCapture: mustCapture(match.turn) });
    view.announce(`${lead} ${turnLine}`);
    if (spiritActing) timers.after(delays.spiritThink, spiritMove);
  }

  // A square picked by the player (click, tap or Enter/Space).
  function selectSquare(square) {
    if (!match || match.result || spiritActing || isSpiritTurn()) return;
    const { turn, outcome, move } = choose(match.turn, square);
    match.turn = turn;
    match.feedback = FEEDBACK[outcome] ?? null;
    if (outcome === 'complete') {
      play(move);
      return;
    }
    if (outcome === 'jump') audio.playSfx('player-select');
    render();
    const next = destinations(turn);
    if (outcome === 'select') {
      view.announce(pickText({ square, piece: match.state.board[square], destinations: next, capture: mustCapture(turn) }));
    } else if (outcome === 'jump') {
      view.announce(jumpText({ to: square, destinations: next }));
    } else if (outcome === 'deselect') {
      view.announce('Piece put back.');
    } else if (match.feedback) {
      view.announce(match.feedback);
    }
  }

  // Escape: puts a picked-up piece back (not once it has jumped).
  function cancelSelection() {
    if (!match || match.result || spiritActing || !match.turn.path.length || inChain(match.turn)) return;
    match.turn = cancel(match.turn);
    match.feedback = null;
    render();
    view.announce('Piece put back.');
  }

  function spiritMove() {
    const move = chooseMove(match.state, { difficulty: match.difficulty, rng });
    if (!move) return; // unreachable: a side with no move has already lost
    // Show the piece being picked up and each landing square, then play it.
    const step = (i) => {
      const next = choose(match.turn, move.path[i]);
      if (next.outcome !== 'select' && next.outcome !== 'jump') {
        play(next.move ?? move);
        return;
      }
      match.turn = next.turn;
      render();
      timers.after(delays.spiritStep, () => step(i + 1));
    };
    step(0);
  }

  // Plays a finished move. applyMove checks it against the rules once more.
  function play(move) {
    const piece = match.state.board[move.from];
    match.state = applyMove(match.state, move);
    match.captured[piece.side] += move.captures.length;
    match.lastMove = { path: move.path, captures: move.captures };
    const byPlayer = mode === 'two' ? piece.side === 'acorn' : piece.side === match.humanSide;
    audio.playSfx(byPlayer ? 'player-select' : 'opponent-select');
    const said = moveText({ mode, humanSide: match.humanSide, move, piece });
    const { result } = analyze(match.state);
    if (result) finish(result, said);
    else beginTurn(said);
  }

  function finish(result, said) {
    if (scoredMatch === match) return; // never score a game twice
    scoredMatch = match;
    match.result = result;
    match.turn = startTurn(match.state);
    spiritActing = false;
    const text = resultText({ mode, result, humanSide: match.humanSide });
    match.resultText = text;
    profile.recordAcornsLeavesResult({ mode, difficulty: match.difficulty, outcome: text.outcome });
    if (text.outcome === 'win' || text.outcome === 'acorn' || text.outcome === 'leaf') {
      audio.stopMusic();
      audio.playSfx('victory-sound');
    }
    render();
    view.announce(`${said} ${text.title} ${text.message}`);
    timers.after(delays.resultModal, () => view.showResult(text));
  }

  function render() {
    const { turn, state } = match;
    const phase = match.result ? 'over' : spiritActing ? 'waiting' : 'ready';
    const choosing = phase === 'ready' && !inChain(turn);
    const must = mustCapture(turn);
    let hint;
    if (phase === 'over') hint = match.resultText.message;
    else if (phase === 'waiting') hint = 'The Spirit is thinking…';
    else {
      const stage = inChain(turn) ? 'keep-jumping' : turn.path.length ? 'choose-square' : 'choose-piece';
      hint = match.feedback ?? guidance({ stage, mustCapture: must });
    }
    view.render({
      phase,
      mode,
      humanSide: match.humanSide,
      turn: state.turn,
      board: displayBoard(turn),
      selected: selectedSquare(turn),
      destinations: phase === 'ready' ? destinations(turn) : [],
      capture: must,
      movable: choosing ? movablePieces(turn) : [],
      mustJump: choosing && must ? movablePieces(turn) : [],
      jumped: jumpedSoFar(turn),
      trail: inChain(turn) ? [...turn.path] : [],
      lastMove: match.lastMove,
      captured: { ...match.captured },
      turnLabel: phase === 'over' ? match.resultText.title : turnLabel({ mode, turn: state.turn, humanSide: match.humanSide }),
      winner: match.result?.winner ?? null,
      hint,
      feedback: phase === 'ready' && Boolean(match.feedback),
    });
  }

  return { enter, leave, restart, playAgain, selectSquare, cancelSelection };
}
