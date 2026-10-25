// DOM for the Shells & Feathers match screen: board, turn line, session
// score, match info, status announcements and the result dialog. Game text and
// colors match v1.
//
// Board: the nine squares are buttons with one tab stop between them; the
// arrow keys (and Home/End) move between squares and Enter/Space places a
// piece. Each square's name says what is on it. The board has three states:
// "ready" (the player may move), "waiting" (the Spirit is thinking) and "over"
// (the round has ended); outside "ready", empty squares are aria-disabled.
//
// Announcements: a polite status region says what just happened ("The Spirit
// placed a feather on row 2, column 2. Your turn.") and how a round ended.
//
// Header: one chip per player (piece, name, score). The chip of the player
// to move is marked "To move", and after a win the winner's is marked
// "Winner", so the turn never depends on color alone.
//
// Result dialog: the winning piece (both pieces for a draw), the result, the
// session score and any achievements the result unlocked. It takes focus and makes the board inert while open;
// "View Board" (or Escape) closes it to show the final board.
import { DIFFICULTY_NAMES } from './ai.js';

const GLYPHS = { shell: '🐚', feather: '🪶' };
const NAMES = { shell: 'Shell', feather: 'Feather' };
const PLAYER1_COLOR = '#40E0D0';
const PLAYER2_COLOR = '#FF6B35';
const RESULTS = {
  win: { title: 'Victory!', message: 'The spirits smile upon you' },
  loss: { title: 'Wisdom Gained', message: 'The journey continues' },
  draw: { title: 'Balance Achieved', message: 'The spirits are in harmony' },
  player1: { title: 'Player 1 Wins!' },
  player2: { title: 'Player 2 Wins!' },
};
const OTHER = { shell: 'feather', feather: 'shell' };

// "New achievement: First Win" (or several, joined), or '' for none.
export const achievementLine = (achievements) => (achievements.length
  ? `New achievement${achievements.length > 1 ? 's' : ''}: ${achievements.map((a) => a.title).join(' · ')}`
  : '');
const ACTORS = { you: 'You', spirit: 'The Spirit', player1: 'Player 1', player2: 'Player 2' };
const ROWS = ['top', 'middle', 'bottom'];
const COLUMNS = ['left', 'middle', 'right'];

// Square reached from `index` with an arrow/Home/End key (stays put at the
// edges), or null for any other key.
export function nextCellIndex(index, key) {
  const row = Math.floor(index / 3);
  const col = index % 3;
  switch (key) {
    case 'ArrowUp': return row > 0 ? index - 3 : index;
    case 'ArrowDown': return row < 2 ? index + 3 : index;
    case 'ArrowLeft': return col > 0 ? index - 1 : index;
    case 'ArrowRight': return col < 2 ? index + 1 : index;
    case 'Home': return row * 3;
    case 'End': return row * 3 + 2;
    default: return null;
  }
}

export const squareName = (index) => `row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}`;

// "the top row", "the left column", "the diagonal from top left", …
export function lineName([a, , c]) {
  if (c - a === 2) return `the ${ROWS[a / 3]} row`;
  if (c - a === 6) return `the ${COLUMNS[a]} column`;
  return a === 0 ? 'the diagonal from top left' : 'the diagonal from top right';
}

// Status line after a move: who moved where, then whose turn it is.
export function moveStatus({ actor, symbol, index }) {
  const piece = symbol === 'shell' ? 'a shell' : 'a feather';
  return `${ACTORS[actor]} placed ${piece} on ${squareName(index)}.`;
}

export function turnStatus(mode, isPlayer1) {
  if (mode === 'single') return isPlayer1 ? 'Your turn.' : "The Spirit's turn.";
  return `Player ${isPlayer1 ? 1 : 2}'s turn.`;
}

export function resultStatus(outcome, winner, line) {
  if (outcome === 'draw') return `${RESULTS.draw.title}: a draw. The board is full with no three in a row.`;
  const pieces = winner === 'shell' ? 'shells' : 'feathers';
  return `${RESULTS[outcome].title} Three ${pieces} in ${lineName(line)}.`;
}

export function createShellsFeathersView(doc) {
  const byId = (id) => doc.getElementById(id);
  const cells = [];
  for (const cell of doc.querySelectorAll('#board-overlay .cell')) cells[Number(cell.dataset.index)] = cell;
  const board = byId('board-overlay');
  const screen = byId('game-screen');
  const modal = byId('game-modal');
  const status = byId('sf-status');
  const restartButton = screen.querySelector('[data-action="restart-match"]');
  let focusIndex = 0;
  let lastMove = '';
  let player1Symbol = 'shell';
  let scoreLine = '';

  // marks: { 1: 'To move' | 'Winner' | '', 2: … }
  function markChips(marks) {
    for (const player of [1, 2]) {
      const chip = byId(`sf-side-${player}`);
      const tag = chip.querySelector('.side-chip-tag');
      chip.classList.toggle('is-active', marks[player] === 'To move');
      chip.classList.toggle('is-winner', marks[player] === 'Winner');
      tag.textContent = marks[player] ?? '';
      tag.hidden = !marks[player];
    }
  }

  function describeCell(index) {
    const symbol = cells[index].dataset.symbol;
    const state = symbol ? NAMES[symbol].toLowerCase() : 'empty';
    const winning = cells[index].classList.contains('winner') ? ', winning line' : '';
    const name = squareName(index);
    cells[index].setAttribute('aria-label', `${name[0].toUpperCase()}${name.slice(1)}: ${state}${winning}`);
  }

  function setFocusIndex(index, { focus = false } = {}) {
    focusIndex = index;
    cells.forEach((cell, i) => { cell.tabIndex = i === index ? 0 : -1; });
    if (focus) cells[index].focus();
  }

  // Repeating the same text wouldn't be announced again, so alternate a
  // trailing no-break space.
  function announce(text) {
    status.textContent = status.textContent === text ? `${text} ` : text;
  }

  function hideResult() {
    const hadFocus = modal.contains(doc.activeElement);
    modal.classList.remove('active');
    screen.inert = false;
    if (hadFocus) cells[focusIndex].focus();
  }

  // Closes the dialog but keeps the finished board on screen.
  function dismissResult() {
    hideResult();
    restartButton.focus();
  }

  return {
    bindCells(onSelect) {
      cells.forEach((cell, index) => {
        cell.addEventListener('click', () => {
          setFocusIndex(index);
          onSelect(index);
        });
        cell.addEventListener('keydown', (event) => {
          const next = nextCellIndex(index, event.key);
          if (next === null) return;
          event.preventDefault();
          setFocusIndex(next, { focus: true });
        });
      });
      modal.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !modal.classList.contains('active')) return;
        event.preventDefault();
        dismissResult();
      });
      cells.forEach((_, i) => describeCell(i));
      setFocusIndex(0);
    },
    focusBoard() {
      cells[focusIndex].focus();
    },
    clearBoard() {
      lastMove = '';
      for (const cell of cells) {
        cell.textContent = '';
        delete cell.dataset.symbol;
        cell.classList.remove('occupied', 'winner');
      }
      cells.forEach((_, i) => describeCell(i));
    },
    // 'ready' | 'waiting' | 'over'
    setBoardState(state) {
      board.dataset.state = state;
      board.setAttribute('aria-busy', String(state === 'waiting'));
      for (const cell of cells) {
        if (state === 'ready' && !cell.dataset.symbol) cell.removeAttribute('aria-disabled');
        else cell.setAttribute('aria-disabled', 'true');
      }
    },
    // actor: 'you' | 'spirit' | 'player1' | 'player2'
    placePiece(index, symbol, actor) {
      const cell = cells[index];
      cell.textContent = GLYPHS[symbol];
      cell.dataset.symbol = symbol;
      cell.classList.add('occupied');
      cell.setAttribute('aria-disabled', 'true');
      describeCell(index);
      lastMove = moveStatus({ actor, symbol, index });
    },
    highlight(line) {
      for (const i of line) {
        cells[i].classList.add('winner');
        describeCell(i);
      }
    },
    showMatchInfo({ mode, difficulty, player1Symbol: symbol }) {
      player1Symbol = symbol;
      byId('player1-glyph').textContent = GLYPHS[symbol];
      byId('player2-glyph').textContent = GLYPHS[OTHER[symbol]];
      byId('match-info').textContent = mode === 'single'
        ? `Against the Spirit · ${DIFFICULTY_NAMES[difficulty]} · You play ${GLYPHS[symbol]} ${NAMES[symbol]}`
        : `Two players · Player 1 plays ${GLYPHS[symbol]} ${NAMES[symbol]}`;
    },
    showTurn(mode, isPlayer1, symbol) {
      const el = byId('turn-indicator');
      el.textContent = mode === 'single'
        ? (isPlayer1 ? 'Your Turn' : "Spirit's Turn")
        : `Player ${isPlayer1 ? 1 : 2}'s Turn ${GLYPHS[symbol]}`;
      el.style.color = isPlayer1 ? PLAYER1_COLOR : PLAYER2_COLOR;
      markChips(isPlayer1 ? { 1: 'To move' } : { 2: 'To move' });
      announce(`${lastMove || 'New round.'} ${turnStatus(mode, isPlayer1)}`);
    },
    // After the last move the turn line shows the result (it stays visible
    // once the dialog is closed with View Board).
    showFinalTurn(outcome, winner, line) {
      const el = byId('turn-indicator');
      el.textContent = RESULTS[outcome].title;
      el.style.color = outcome === 'loss' || outcome === 'player2' ? PLAYER2_COLOR : PLAYER1_COLOR;
      if (outcome === 'draw') markChips({});
      else markChips(outcome === 'loss' || outcome === 'player2' ? { 2: 'Winner' } : { 1: 'Winner' });
      announce(`${lastMove} ${resultStatus(outcome, winner, line)}`);
    },
    showScores(mode, scores) {
      byId('player1-label').textContent = mode === 'single' ? 'You: ' : 'Player 1: ';
      byId('player2-label').textContent = mode === 'single' ? 'Spirit: ' : 'Player 2: ';
      byId('player1-score').textContent = scores.player1;
      byId('player2-score').textContent = scores.player2;
      scoreLine = mode === 'single'
        ? `Score · You ${scores.player1} · Spirit ${scores.player2}`
        : `Score · Player 1 ${scores.player1} · Player 2 ${scores.player2}`;
    },
    showResult(outcome, winner, achievements = []) {
      const { title, message = `The ${winner} spirit prevails` } = RESULTS[outcome];
      byId('modal-title').textContent = title;
      byId('modal-message').textContent = message;
      byId('modal-summary').textContent = scoreLine;
      byId('modal-achievements').textContent = achievementLine(achievements);
      const emblem = byId('modal-emblem');
      const pieces = outcome === 'draw' ? [player1Symbol, OTHER[player1Symbol]] : [winner];
      emblem.replaceChildren(...pieces.map((symbol) => {
        const piece = doc.createElement('span');
        piece.className = 'emblem-piece';
        piece.textContent = GLYPHS[symbol];
        return piece;
      }));
      modal.dataset.outcome = outcome;
      modal.classList.add('active');
      screen.inert = true;
      modal.querySelector('[data-action="play-again"]').focus();
    },
    hideResult,
    dismissResult,
  };
}
