// The tutorial: a short practice for each game on its own little board,
// offered once on the game's setup screen (and always there as a link).
//
// It is isolated: its positions are its own, its moves go through the
// game's rules (rules.js, turn.js, fog.js) and nothing else. No session,
// record, achievement or unfinished match is touched; the only thing saved
// is that the tutorial was finished or skipped, so it isn't offered again.
//
// Each step sets up a position and asks for one thing; a wrong tap gets a
// hint, the right one moves on. The Fog of War step draws only what the
// acorns can see (fog.js view) and its hints come from that view alone: a
// hidden leaf is never named until it comes into view.
import { positionFromRows } from '../games/acorns-leaves/engine.js';
import {
  startTurn, choose, movablePieces, destinations, selectedSquare, displayBoard,
} from '../games/acorns-leaves/turn.js';
import * as fog from '../games/acorns-leaves/fog.js';
import { FEEDBACK, FOG_FEEDBACK, squareName } from '../games/acorns-leaves/text.js';
import { createPieceIcon } from '../games/acorns-leaves/pieces.js';
import { winningLine } from '../games/shells-feathers/rules.js';
import { svgIcon } from '../shared/icons.js';

export const SETUP_PATHS = { shellsFeathers: '/shells-feathers', acornsLeaves: '/acorns-leaves' };
const TITLES = { shellsFeathers: 'Shells & Feathers tutorial', acornsLeaves: 'Acorns & Leaves tutorial' };

// --------------------------------------------------- Shells & Feathers

const sfBoard = (shells, feathers) => Array.from({ length: 9 }, (_, i) => (shells.includes(i) ? 'shell' : feathers.includes(i) ? 'feather' : null));
const sfName = (i) => `row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}`;

export const SF_STEPS = [
  {
    lesson: 'You play the shells, and you go first. Tap any empty square to place a shell.',
    board: () => sfBoard([], []),
    tap(board, i) {
      if (board[i]) return { hint: 'That square is taken: choose an empty one.' };
      return { done: 'Placed. Players take turns, one piece each.' };
    },
  },
  {
    lesson: 'Three in a row wins: across, down or diagonally. Find the square that makes three shells in a row.',
    board: () => sfBoard([0, 1], [3, 4]),
    target: 2,
    tap(board, i) {
      if (board[i]) return { hint: 'That square is taken: choose an empty one.' };
      const next = [...board];
      next[i] = 'shell';
      if (winningLine(next, 'shell')) return { done: 'Three in a row: that wins the game.' };
      return { hint: 'Not yet a row: look along the top row.', show: [2] };
    },
  },
  {
    lesson: 'The feathers are one away from three in a row. Block them by taking the square they need.',
    board: () => sfBoard([2], [0, 4]),
    target: 8,
    tap(board, i) {
      if (board[i]) return { hint: 'That square is taken: choose an empty one.' };
      if (i === 8) return { done: 'Blocked. A full board with no row is a draw.' };
      return { hint: 'The feathers run corner to corner, from the top left: block the far end.', show: [8] };
    },
  },
];

// ------------------------------------------------------ Acorns & Leaves

// Positions in the engine's notation, top row first (a acorn, l leaf).
export const AL_STEPS = [
  {
    lesson: 'Acorns move one square diagonally forward, onto a dark square. Pick up an acorn, then tap where it goes.',
    rows: ['........', '..l.....', '........', '........', '........', '..a.a...', '........', '........'],
    done: () => 'Moved. Then it is the other side’s turn.',
  },
  {
    lesson: 'A capture is compulsory: jump over a leaf onto the empty square behind it. Make the capture.',
    rows: ['.......l', '........', '........', '........', '...l....', '..a.....', '.....a..', '........'],
    done: () => 'Captured. If another jump follows, the same piece must keep jumping.',
  },
  {
    lesson: 'An acorn that reaches the far row is crowned. Kings move and capture both ways. Crown this acorn.',
    rows: ['.......l', '..a.....', '........', '........', '........', '........', '........', '........'],
    done: () => 'Crowned: this king can now move backwards too.',
  },
  {
    fog: true,
    lesson: 'In Fog of War you see only your own pieces and the squares next to them; the rest stays in the mist. Make any move.',
    rows: ['........', '........', '.l......', '........', '.....l..', '........', '.a.a.a..', '........'],
    done: ({ before, after }) => {
      const came = after.filter((s) => !before.includes(s));
      return came.length
        ? `A leaf came out of the mist on ${came.map(squareName).join(' and ')}, next to your acorn.`
        : 'Moved. Nothing new came into view this time.';
    },
  },
];

// Leaves the acorns can see on `board` (Fog step).
const leavesInView = (board) => [...fog.opponentsInView(fog.observe(board, 'acorn'), 'acorn').keys()];

// ---------------------------------------------------------------- screen

export function createTutorial({
  doc, profile, feedback, onFinish = () => {},
}) {
  const byId = (id) => doc.getElementById(id);
  const boardEl = byId('practice-board');
  let game = null;
  let index = 0;
  let state = null; // the step's own practice state
  let finished = false;

  const steps = () => (game === 'shellsFeathers' ? SF_STEPS : AL_STEPS);

  function start(newGame) {
    game = newGame;
    index = 0;
    finished = false;
    byId('tutorial-title').textContent = TITLES[game];
    byId('tutorial-play').setAttribute('href', `#${SETUP_PATHS[game]}`);
    setStep(0);
  }

  function setStep(i) {
    index = i;
    const step = steps()[i];
    byId('tutorial-progress').textContent = `Step ${i + 1} of ${steps().length}`;
    byId('tutorial-lesson').textContent = step.lesson;
    byId('tutorial-next').hidden = true;
    byId('tutorial-play').hidden = true;
    say('');
    if (game === 'shellsFeathers') {
      state = { board: step.board(), show: [], done: false };
    } else {
      const position = positionFromRows(step.rows);
      state = { turn: step.fog ? fog.startFogTurn(position) : startTurn(position), done: false };
    }
    draw();
  }

  function say(text) {
    byId('tutorial-hint').textContent = text;
  }

  function completeStep(text) {
    state.done = true;
    say(text);
    feedback?.cue('button');
    const last = index === steps().length - 1;
    if (last) {
      finished = true;
      profile.setTutorial(game, 'done');
      byId('tutorial-play').hidden = false;
      byId('tutorial-play').focus();
      onFinish(game);
    } else {
      byId('tutorial-next').hidden = false;
      byId('tutorial-next').focus();
    }
    draw();
  }

  function tapShellsFeathers(i) {
    const step = SF_STEPS[index];
    const outcome = step.tap(state.board, i);
    if (outcome.done) {
      state.board[i] = 'shell';
      feedback?.cue('place', { key: `tutorial:${index}:${i}` });
      completeStep(outcome.done);
      return;
    }
    feedback?.cue('invalid', { key: `tutorial:${index}:${i}` });
    state.show = outcome.show ?? [];
    say(outcome.hint);
    draw();
  }

  function tapAcornsLeaves(square) {
    const step = AL_STEPS[index];
    const before = step.fog ? leavesInView(state.turn.state.board) : null;
    const result = step.fog ? fog.chooseFog(state.turn, square) : choose(state.turn, square);
    state.turn = result.turn;
    if (result.outcome === 'complete' || (result.outcome === 'bumped' && result.move)) {
      const after = step.fog ? leavesInView(applyTo(state.turn, result.move)) : null;
      state.board = step.fog ? null : applyTo(state.turn, result.move);
      state.played = result.move;
      feedback?.cue(result.move.captures.length ? 'capture' : 'move', { key: `tutorial:${index}` });
      if (step.fog) state.fogBoard = fog.observe(applyTo(state.turn, result.move), 'acorn');
      completeStep(step.done({ before, after }));
      return;
    }
    if (result.outcome === 'select') feedback?.cue('select', { key: `tutorial:${index}:${square}` });
    const words = (step.fog ? FOG_FEEDBACK : FEEDBACK)[result.outcome];
    if (words) {
      feedback?.cue('invalid', { key: `tutorial:${index}:${square}:${result.outcome}` });
      say(words);
    } else if (result.outcome === 'bumped') {
      say('A hidden leaf blocked that square: it is shown now. Choose again.');
    } else say('');
    draw();
  }

  // The position after `move`, from the turn it was made in.
  function applyTo(turn, move) {
    const board = [...turn.state.board];
    const piece = board[move.from];
    board[move.from] = null;
    for (const c of move.captures) board[c] = null;
    board[move.to] = move.crowned ? { ...piece, king: true } : piece;
    return board;
  }

  function onTap(square) {
    if (!game || state.done) return;
    if (game === 'shellsFeathers') tapShellsFeathers(square);
    else tapAcornsLeaves(square);
  }

  // ----------------------------------------------------------- drawing

  function draw() {
    const size = game === 'shellsFeathers' ? 3 : 8;
    boardEl.dataset.game = game;
    boardEl.style.setProperty('--size', size);
    const focused = Number(doc.activeElement?.dataset?.practice ?? -1);
    const cells = [];
    if (game === 'shellsFeathers') {
      for (let i = 0; i < 9; i++) {
        const symbol = state.board[i];
        const cell = cellButton(i, symbol ? `${sfName(i)}, ${symbol}` : `${sfName(i)}, empty`);
        cell.classList.add('practice-cell');
        if (symbol) cell.append(svgIcon(doc, `#sf-${symbol}`, 'practice-piece'));
        if (!state.done && state.show.includes(i)) cell.classList.add('is-target');
        cells.push(cell);
      }
    } else {
      const step = AL_STEPS[index];
      const { turn } = state;
      let board;
      let fogged = [];
      let movable = [];
      let targets = [];
      let selected = null;
      if (step.fog) {
        const seen = state.done ? state.fogBoard : fog.view(turn);
        board = seen.map((c) => (fog.isPiece(c) ? c : null));
        fogged = seen.flatMap((c, s) => (c === fog.FOG ? [s] : []));
        if (!state.done) {
          movable = fog.movablePieces(turn);
          targets = fog.destinations(turn);
          selected = fog.selectedSquare(turn);
        }
      } else {
        board = state.done ? state.board : displayBoard(turn);
        if (!state.done) {
          movable = turn.path.length ? [] : movablePieces(turn);
          targets = destinations(turn);
          selected = selectedSquare(turn);
        }
      }
      for (let s = 0; s < 64; s++) {
        const dark = (Math.floor(s / 8) + (s % 8)) % 2 === 1;
        const piece = board[s];
        const hidden = fogged.includes(s);
        const label = `${squareName(s)}, ${hidden ? 'in the mist' : piece ? `${piece.side}${piece.king ? ' king' : ''}` : 'empty'}`;
        const cell = cellButton(s, label);
        cell.classList.add('practice-square', dark ? 'dark' : 'light');
        if (piece) cell.append(createPieceIcon(doc, piece, 'practice-piece'));
        cell.classList.toggle('is-fog', hidden);
        cell.classList.toggle('can-move', movable.includes(s));
        cell.classList.toggle('is-target', targets.includes(s));
        cell.classList.toggle('is-selected', selected === s);
        if (!dark) cell.disabled = true;
        cells.push(cell);
      }
    }
    boardEl.replaceChildren(...cells);
    const first = cells.find((c) => !c.disabled);
    const keep = cells.find((c) => Number(c.dataset.practice) === focused && !c.disabled);
    for (const c of cells) c.tabIndex = -1;
    (keep ?? first).tabIndex = 0;
    if (keep && boardEl.contains(doc.activeElement) === false && focused >= 0) keep.focus();
  }

  function cellButton(i, label) {
    const cell = doc.createElement('button');
    cell.type = 'button';
    cell.dataset.practice = String(i);
    cell.setAttribute('aria-label', label);
    return cell;
  }

  boardEl.addEventListener('click', (event) => {
    const cell = event.target.closest('button[data-practice]');
    if (cell && !cell.disabled) onTap(Number(cell.dataset.practice));
  });
  // Arrow keys move between squares (one tab stop for the board).
  boardEl.addEventListener('keydown', (event) => {
    const cell = event.target.closest('button[data-practice]');
    if (!cell) return;
    const size = game === 'shellsFeathers' ? 3 : 8;
    const i = Number(cell.dataset.practice);
    const step = { ArrowUp: -size, ArrowDown: size, ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const cells = [...boardEl.children];
    for (let j = i + step; j >= 0 && j < cells.length; j += step) {
      if ((step === 1 || step === -1) && Math.floor(j / size) !== Math.floor(i / size)) break;
      if (!cells[j].disabled) {
        cell.tabIndex = -1;
        cells[j].tabIndex = 0;
        cells[j].focus();
        return;
      }
    }
  });

  return {
    start,
    next() {
      if (state?.done && index < steps().length - 1) {
        setStep(index + 1);
        boardEl.querySelector('[tabindex="0"]')?.focus();
      }
    },
    // Skipping counts as seen; finishing already did.
    skip() {
      if (game && !finished) profile.setTutorial(game, 'skipped');
    },
    get game() { return game; },
    get step() { return index; },
  };
}
