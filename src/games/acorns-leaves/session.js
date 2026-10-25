// Runs Acorns & Leaves on its match screen: one match at a time, moves picked
// a square at a time, the Spirit's turns, results and sounds. The rules stay
// in engine.js; this file only decides what happens next. No DOM access:
// drawing goes through `view` (see view.js).
//
// Two rule sets: Classic (turn.js, everything in view) and Fog of War
// (fog.js, docs/fog-rules.md), where each player is drawn, told and offered
// only what they can see, and the Spirit decides from its own view
// (fog-ai.js).
//
// Lifecycle: enter(mode, variant) when the match screen opens, restart() for
// "Restart", playAgain() for "Rematch", leave() when the screen closes, and
// pause()/resume() while the match menu is open (the Spirit's move, its
// steps and the result dialog wait). Each match owns a timer scope; starting
// another match or leaving disposes it, so a pending Spirit move, result
// dialog or music restart from an old match can never fire.
//
// The Spirit: after a short pause it picks its move (ai.js, bounded, legal
// moves only) and, in Classic, shows it a square at a time so a chain of
// jumps can be followed. In Fog it decides as its turn starts and its move
// appears, unseen, after a fixed pause, so how long it thought shows nowhere.
// From the moment its turn starts until its move is played the board is
// "waiting" and every pick is ignored.
//
// Two players in Fog: before each turn a handoff screen hides the board (the
// view gets a board with no pieces) until the next player takes the device.
// The player who just moved hears only "Move made", so nothing about their
// move is left in the page for the next player.
//
// Scoring: a game is recorded once, when its last move is played. A game
// that is restarted or left before it ends is not recorded. Achievements:
// the result's are shown in the result dialog; a crowning or a capture of
// two or more pieces by the player against the Spirit is reported through
// `notify` as it happens. Two-player games unlock only "Shared Board".
//
// Sounds: a wooden tap for each move (a lower one for the other side), a
// capture, a crowning, a revealed hidden piece, and the result. In Fog they
// never tell anyone what they couldn't see (docs/fog-rules.md §4): with two
// players in the room every move makes the same tap and nothing else sounds;
// against the Spirit its move is a tap, or a capture when it took one of
// your pieces, and its crowning is silent.
import { createInitialState, applyMove, analyze, isDarkSquare, SIDES } from './engine.js';
import { chooseMove as spiritChoice } from './ai.js';
import { chooseFogStep as fogSpiritChoice } from './fog-ai.js';
import {
  startTurn, choose, cancel, mustCapture, inChain, movablePieces, destinations, jumpedSoFar, displayBoard, selectedSquare,
} from './turn.js';
import * as fog from './fog.js';
import {
  moveText, turnText, turnLabel, guidance, resultText, pickText, jumpText, FEEDBACK, SIDE_NAMES,
  fogGuidance, FOG_FEEDBACK, bumpText, fogTurnText, fogMoveText, handoffText,
} from './text.js';
import { createTimerScope } from '../../shared/timers.js';

export const DELAYS = { spiritThink: 500, spiritStep: 400, resultModal: 900, musicRestart: 300 };

const CLASSIC_RULES = {
  start: startTurn, choose, cancel, inChain, selected: selectedSquare, destinations, movable: movablePieces,
  jumped: jumpedSoFar, capture: mustCapture, feedback: FEEDBACK,
};
const FOG_RULES = {
  start: fog.startFogTurn, choose: fog.chooseFog, cancel: fog.cancelFog, inChain: fog.inChain,
  selected: fog.selectedSquare, destinations: fog.destinations, movable: fog.movablePieces,
  jumped: fog.jumpedSoFar, capture: fog.mayCapture, feedback: FOG_FEEDBACK,
};

export function createSession({
  view, audio, profile, notify = () => {},
  clock = globalThis, rng = Math.random, delays = DELAYS,
  chooseMove = spiritChoice, chooseFogStep = fogSpiritChoice, initialState = createInitialState,
}) {
  let mode = null;
  let variant = 'classic';
  let rules = CLASSIC_RULES;
  let match = null;
  let timers = null;
  let spiritActing = false;
  let scoredMatch = null;

  const fogged = () => variant === 'fog';

  function enter(newMode, newVariant = 'classic') {
    mode = newMode;
    variant = newVariant === 'fog' ? 'fog' : 'classic';
    rules = fogged() ? FOG_RULES : CLASSIC_RULES;
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
      played: 0, // moves played this match
      turn: null,
      humanSide: mode === 'single' ? side : null,
      difficulty,
      captured: { acorn: 0, leaf: 0 }, // pieces each side has taken
      lastMove: null, // { by, path, captures, taken: [{ square, piece }] }
      result: null,
      resultText: null,
      feedback: null,
      handoff: false,
      // Fog: the opponent pieces each side could see after its own last move,
      // to tell it what came into or went out of view since.
      inView: {},
    };
    if (fogged()) {
      for (const s of SIDES) match.inView[s] = fog.opponentsInView(fog.observe(match.state.board, s), s);
    }
    timers = createTimerScope(clock);
    // Against the Spirit the player's pieces sit at the bottom.
    view.setOrientation(match.humanSide ?? 'acorn');
    view.showMatchInfo({ mode, difficulty, humanSide: match.humanSide, variant });
    beginTurn('New game.');
  }

  function teardownMatch() {
    timers?.dispose();
    timers = null;
    match = null;
    spiritActing = false;
    view.hideResult();
    view.hideMenu();
    view.hideHandoff();
    audio.stopSfx('victory-sound');
  }

  const isSpiritTurn = () => mode === 'single' && match.state.turn !== match.humanSide;

  function beginTurn(lead) {
    match.turn = rules.start(match.state);
    match.feedback = null;
    spiritActing = isSpiritTurn();
    if (fogged() && mode === 'two') {
      // The board stays hidden until the next player takes the device.
      match.handoff = true;
      render();
      view.announce(`${lead} ${SIDE_NAMES[match.state.turn]}' turn: pass the device.`);
      view.showHandoff(handoffText(match.state.turn));
      return;
    }
    render();
    view.announce(`${lead} ${turnLine()}`);
    if (!spiritActing) return;
    if (!fogged()) {
      timers.after(delays.spiritThink, spiritMove);
      return;
    }
    // In Fog the Spirit decides now and its move appears after a fixed
    // pause, however long it thought.
    const move = fogSpiritMove();
    if (move) timers.after(delays.spiritThink + delays.spiritStep, () => play(move));
  }

  function turnLine() {
    const { state, turn, humanSide } = match;
    return fogged()
      ? fogTurnText({ mode, turn: state.turn, humanSide, mayCapture: fog.mayCapture(turn) })
      : turnText({ mode, turn: state.turn, humanSide, mustCapture: mustCapture(turn) });
  }

  // Two players in Fog: the next player has the device; show their view.
  function takeControl() {
    if (!match || !match.handoff) return;
    match.handoff = false;
    view.hideHandoff();
    render();
    view.announce(`${opponentMoveText(match.state.turn)} ${turnLine()}`.trim());
    view.focusBoard();
  }

  // A square picked by the player (click, tap or Enter/Space).
  function selectSquare(square) {
    if (!match || match.result || match.handoff || spiritActing || isSpiritTurn() || timers.paused) return;
    const before = match.turn;
    const { turn, outcome, move, found } = rules.choose(before, square);
    match.turn = turn;
    match.feedback = rules.feedback[outcome] ?? null;
    if (outcome === 'bumped') {
      const text = bumpText({
        square: found, piece: match.state.board[found], ends: Boolean(move), opened: fog.mayCapture(before) && !fog.mayCapture(turn),
      });
      if (!sharedFog()) audio.playSfx('reveal-sound');
      if (move) {
        play(move, text);
        return;
      }
      match.feedback = text;
      render();
      view.announce(text);
      return;
    }
    if (outcome === 'complete') {
      play(move);
      return;
    }
    if (outcome === 'jump' && !sharedFog()) audio.playSfx('capture-sound');
    render();
    const next = rules.destinations(turn);
    if (outcome === 'select') {
      const capture = fogged() ? fog.apparentSteps(turn).capture : mustCapture(turn);
      view.announce(pickText({ square, piece: match.state.board[square], destinations: next, capture, maybe: fogged() && capture }));
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
    if (!match || match.result || match.handoff || spiritActing || timers.paused) return;
    if (!match.turn.path.length || rules.inChain(match.turn)) return;
    match.turn = rules.cancel(match.turn);
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

  // The Spirit's move in Fog: it is handed only its own view and tries steps
  // like a player (a blocked try shows it the blocker) until a move is made.
  function fogSpiritMove() {
    let turn = match.turn;
    for (let tries = 0; tries < 200; tries++) {
      const step = chooseFogStep(fog.observation(turn), { difficulty: match.difficulty, rng });
      if (!step) return null; // unreachable: a side with no move has already lost
      if (!turn.path.length) turn = fog.chooseFog(turn, step.from).turn;
      const result = fog.chooseFog(turn, step.to);
      if (result.move) return result.move;
      turn = result.turn;
    }
    return null;
  }

  // What the side `viewer` is told about its opponent's last move in Fog.
  function opponentMoveText(viewer) {
    const move = match.lastMove;
    if (!move || move.by === viewer) return '';
    const now = fog.opponentsInView(fog.observe(match.state.board, viewer), viewer);
    const before = match.inView[viewer];
    const same = (a, b) => a && b && a.side === b.side && a.king === b.king;
    return fogMoveText({
      who: mode === 'single' ? 'The Spirit' : SIDE_NAMES[move.by],
      captured: move.taken,
      appeared: [...now].filter(([square, piece]) => !same(before.get(square), piece)).map(([square, piece]) => ({ square, piece })),
      vanished: [...before.keys()].filter((square) => !now.has(square)),
    });
  }

  // Plays a finished move. applyMove checks it against the rules once more.
  function play(move, prefix = '') {
    const piece = match.state.board[move.from];
    const taken = move.captures.map((square) => ({ square, piece: match.state.board[square] }));
    match.state = applyMove(match.state, move);
    match.played += 1;
    match.captured[piece.side] += move.captures.length;
    match.lastMove = { by: piece.side, path: move.path, captures: move.captures, taken };
    const byPlayer = mode === 'two' ? piece.side === 'acorn' : piece.side === match.humanSide;
    for (const id of moveSounds({ byPlayer, move })) audio.playSfx(id);
    if (mode === 'single' && piece.side === match.humanSide) {
      const unlocked = [
        ...(move.captures.length >= 2 ? profile.recordMoment({ game: 'acornsLeaves', moment: 'multi-jump', mode }) : []),
        ...(move.crowned ? profile.recordMoment({ game: 'acornsLeaves', moment: 'crowned', mode }) : []),
      ];
      if (unlocked.length) notify(unlocked);
    }
    const said = `${prefix} ${moveText({ mode, humanSide: match.humanSide, move, piece })}`.trim();
    const { result } = analyze(match.state);
    if (result) {
      finish(result, said);
      return;
    }
    if (!fogged()) {
      beginTurn(said);
      return;
    }
    match.inView[piece.side] = fog.opponentsInView(fog.observe(match.state.board, piece.side), piece.side);
    if (mode === 'two') {
      beginTurn('Move made.');
      return;
    }
    // Against the Spirit you are told its move only as far as you can see it.
    beginTurn(piece.side === match.humanSide ? said : opponentMoveText(match.humanSide));
  }

  // Two players sharing the device in Fog: sounds must not tell either of
  // them anything about the other's move.
  const sharedFog = () => fogged() && mode === 'two';

  function moveSounds({ byPlayer, move }) {
    if (sharedFog()) return ['piece-move'];
    const sounds = [move.captures.length ? 'capture-sound' : byPlayer ? 'piece-move' : 'piece-move-other'];
    if (move.crowned && (byPlayer || !fogged())) sounds.push('crown-sound');
    return sounds;
  }

  function finish(result, said) {
    if (scoredMatch === match) return; // never score a game twice
    scoredMatch = match;
    match.result = result;
    match.turn = rules.start(match.state);
    match.handoff = false;
    spiritActing = false;
    const text = resultText({ mode, result, humanSide: match.humanSide });
    match.resultText = text;
    const unlocked = profile.recordAcornsLeavesResult({ mode, difficulty: match.difficulty, outcome: text.outcome, variant }) ?? [];
    if (text.outcome === 'loss') {
      audio.playSfx('loss-sound');
    } else if (text.outcome === 'draw') {
      audio.playSfx('draw-sound');
    } else {
      audio.stopMusic();
      audio.playSfx('victory-sound');
    }
    render();
    // The game is over, so the fog lifts and the last move can be told in full.
    view.announce(`${said} ${fogged() ? 'The fog lifts. ' : ''}${text.title} ${text.message}`);
    timers.after(delays.resultModal, () => view.showResult(text, unlocked));
  }

  function render() {
    if (fogged()) {
      renderFog();
      return;
    }
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
      variant,
      phase,
      mode,
      played: match.played,
      humanSide: match.humanSide,
      turn: state.turn,
      board: displayBoard(turn),
      fog: [],
      found: [],
      selected: selectedSquare(turn),
      destinations: phase === 'ready' ? destinations(turn) : [],
      capture: must,
      movable: choosing ? movablePieces(turn) : [],
      mustJump: choosing && must ? movablePieces(turn) : [],
      jumped: jumpedSoFar(turn),
      trail: inChain(turn) ? [...turn.path] : [],
      lastMove: match.lastMove && { path: match.lastMove.path, captures: match.lastMove.captures },
      captured: { ...match.captured },
      turnLabel: phase === 'over' ? match.resultText.title : turnLabel({ mode, turn: state.turn, humanSide: match.humanSide }),
      winner: match.result?.winner ?? null,
      hint,
      feedback: phase === 'ready' && Boolean(match.feedback),
    });
  }

  // Fog: everything drawn comes from the viewer's view (fog.js), never the
  // real board, until the game is over.
  function renderFog() {
    const { turn, state } = match;
    const phase = match.result ? 'over' : match.handoff ? 'handoff' : spiritActing ? 'waiting' : 'ready';
    const viewer = mode === 'single' ? match.humanSide : state.turn;
    const model = {
      variant,
      phase,
      mode,
      played: match.played,
      humanSide: match.humanSide,
      turn: state.turn,
      board: Array(state.board.length).fill(null),
      fog: [],
      found: [],
      selected: null,
      destinations: [],
      capture: false,
      movable: [],
      mustJump: [],
      jumped: [],
      trail: [],
      lastMove: null,
      captured: { ...match.captured },
      turnLabel: turnLabel({ mode, turn: state.turn, humanSide: match.humanSide }),
      winner: match.result?.winner ?? null,
      hint: '',
      feedback: false,
    };
    const last = match.lastMove;
    if (phase === 'over') {
      model.board = [...state.board];
      model.lastMove = last && { path: last.path, captures: last.captures };
      model.turnLabel = match.resultText.title;
      model.hint = match.resultText.message;
    } else if (phase === 'handoff') {
      // No pieces at all: every dark square under fog.
      model.fog = state.board.flatMap((_, square) => (isDarkSquare(square) ? [square] : []));
    } else {
      const seen = phase === 'ready' ? fog.view(turn) : fog.observe(state.board, viewer);
      model.board = seen.map((cell) => (fog.isPiece(cell) ? cell : null));
      model.fog = seen.flatMap((cell, square) => (cell === fog.FOG ? [square] : []));
      // The viewer's own last move in full; of the other side's, only the
      // viewer's pieces it took.
      if (last) model.lastMove = last.by === viewer ? { path: last.path, captures: last.captures } : { path: [], captures: last.captures };
      if (phase === 'waiting') model.hint = 'The Spirit is thinking…';
      else {
        const chain = fog.inChain(turn);
        const may = fog.mayCapture(turn);
        model.found = [...turn.found];
        model.selected = fog.selectedSquare(turn);
        model.destinations = fog.destinations(turn);
        model.capture = fog.apparentSteps(turn).capture;
        model.movable = chain ? [] : fog.movablePieces(turn);
        model.mustJump = !chain && may ? model.movable : [];
        model.jumped = fog.jumpedSoFar(turn);
        model.trail = chain ? [...turn.path] : [];
        const stage = chain ? 'keep-jumping' : turn.path.length ? 'choose-square' : 'choose-piece';
        model.hint = match.feedback ?? fogGuidance({ stage, mayCapture: may });
        model.feedback = Boolean(match.feedback);
      }
    }
    view.render(model);
  }

  const pause = () => timers?.pause();
  const resume = () => timers?.resume();

  return {
    enter, leave, restart, playAgain, selectSquare, cancelSelection, takeControl, pause, resume,
  };
}
