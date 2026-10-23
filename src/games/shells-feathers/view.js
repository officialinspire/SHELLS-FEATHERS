// DOM for the Shells & Feathers game screen: board cells, turn indicator,
// session score and the result modal. Text and colors match v1.
const GLYPHS = { shell: '🐚', feather: '🪶' };
const PLAYER1_COLOR = '#40E0D0';
const PLAYER2_COLOR = '#FF6B35';
const RESULTS = {
  win: { title: 'Victory!', message: 'The spirits smile upon you' },
  loss: { title: 'Wisdom Gained', message: 'The journey continues' },
  draw: { title: 'Balance Achieved', message: 'The spirits are in harmony' },
  player1: { title: 'Player 1 Wins!' },
  player2: { title: 'Player 2 Wins!' },
};

export function createShellsFeathersView(doc) {
  const byId = (id) => doc.getElementById(id);
  const cells = [];
  for (const cell of doc.querySelectorAll('#board-overlay .cell')) cells[Number(cell.dataset.index)] = cell;
  const modal = byId('game-modal');

  return {
    bindCells(onSelect, { signal } = {}) {
      cells.forEach((cell, index) => cell.addEventListener('click', () => onSelect(index), { signal }));
    },
    clearBoard() {
      for (const cell of cells) {
        cell.textContent = '';
        cell.classList.remove('occupied', 'winner');
      }
    },
    placePiece(index, symbol) {
      cells[index].textContent = GLYPHS[symbol];
      cells[index].classList.add('occupied');
    },
    highlight(line) {
      for (const i of line) cells[i].classList.add('winner');
    },
    showTurn(mode, isPlayer1, symbol) {
      const el = byId('turn-indicator');
      el.textContent = mode === 'single'
        ? (isPlayer1 ? 'Your Turn' : "Spirit's Turn")
        : `Player ${isPlayer1 ? 1 : 2}'s Turn ${GLYPHS[symbol]}`;
      el.style.color = isPlayer1 ? PLAYER1_COLOR : PLAYER2_COLOR;
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
    },
    hideResult() {
      modal.classList.remove('active');
    },
  };
}
