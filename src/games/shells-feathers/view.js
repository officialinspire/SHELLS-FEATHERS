// DOM for the Shells & Feathers match screen: board, turn indicator, session
// score, match info and the result dialog. Game text and colors match v1.
//
// Keyboard: the nine squares are buttons with one tab stop between them; the
// arrow keys move between squares and Enter/Space places a piece. The result
// dialog takes focus and makes the board inert while open; "View Board" (or
// Escape) closes it to show the final board.
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

export function createShellsFeathersView(doc) {
  const byId = (id) => doc.getElementById(id);
  const cells = [];
  for (const cell of doc.querySelectorAll('#board-overlay .cell')) cells[Number(cell.dataset.index)] = cell;
  const screen = byId('game-screen');
  const modal = byId('game-modal');
  const restartButton = screen.querySelector('[data-action="restart-match"]');
  let focusIndex = 0;

  function describeCell(index) {
    const symbol = cells[index].dataset.symbol;
    const state = symbol ? NAMES[symbol].toLowerCase() : 'empty';
    const winning = cells[index].classList.contains('winner') ? ', winning line' : '';
    cells[index].setAttribute('aria-label', `Row ${Math.floor(index / 3) + 1}, column ${(index % 3) + 1}: ${state}${winning}`);
  }

  function setFocusIndex(index, { focus = false } = {}) {
    focusIndex = index;
    cells.forEach((cell, i) => { cell.tabIndex = i === index ? 0 : -1; });
    if (focus) cells[index].focus();
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

  const view = {
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
      for (const cell of cells) {
        cell.textContent = '';
        delete cell.dataset.symbol;
        cell.classList.remove('occupied', 'winner');
        cell.removeAttribute('aria-disabled');
      }
      cells.forEach((_, i) => describeCell(i));
    },
    placePiece(index, symbol) {
      const cell = cells[index];
      cell.textContent = GLYPHS[symbol];
      cell.dataset.symbol = symbol;
      cell.classList.add('occupied');
      cell.setAttribute('aria-disabled', 'true');
      describeCell(index);
    },
    highlight(line) {
      for (const i of line) {
        cells[i].classList.add('winner');
        describeCell(i);
      }
    },
    showMatchInfo({ mode, difficulty, player1Symbol }) {
      byId('match-info').textContent = mode === 'single'
        ? `Against the Spirit · ${DIFFICULTY_NAMES[difficulty]} · You play ${GLYPHS[player1Symbol]} ${NAMES[player1Symbol]}`
        : `Two players · Player 1 plays ${GLYPHS[player1Symbol]} ${NAMES[player1Symbol]}`;
    },
    showTurn(mode, isPlayer1, symbol) {
      const el = byId('turn-indicator');
      el.textContent = mode === 'single'
        ? (isPlayer1 ? 'Your Turn' : "Spirit's Turn")
        : `Player ${isPlayer1 ? 1 : 2}'s Turn ${GLYPHS[symbol]}`;
      el.style.color = isPlayer1 ? PLAYER1_COLOR : PLAYER2_COLOR;
    },
    // After the last move the turn line shows the result (it stays visible
    // once the dialog is closed with View Board).
    showFinalTurn(outcome, winner) {
      const el = byId('turn-indicator');
      el.textContent = RESULTS[outcome].title;
      el.style.color = outcome === 'loss' || outcome === 'player2' ? PLAYER2_COLOR : PLAYER1_COLOR;
      if (winner === null) el.style.color = PLAYER1_COLOR;
    },
    showScores(mode, scores) {
      byId('player1-label').textContent = mode === 'single' ? 'You: ' : 'Player 1: ';
      byId('player2-label').textContent = mode === 'single' ? 'Spirit: ' : 'Player 2: ';
      byId('player1-score').textContent = scores.player1;
      byId('player2-score').textContent = scores.player2;
    },
    showResult(outcome, winner) {
      const { title, message = `The ${winner} spirit prevails` } = RESULTS[outcome];
      byId('modal-title').textContent = title;
      byId('modal-message').textContent = message;
      modal.classList.add('active');
      screen.inert = true;
      modal.querySelector('[data-action="play-again"]').focus();
    },
    hideResult,
    dismissResult,
  };
  return view;
}
