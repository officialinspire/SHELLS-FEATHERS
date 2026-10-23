// State of one Shells & Feathers game. Player 1 always moves first; in single
// player, Player 1 is the human and Player 2 is the Spirit.
import { opponentOf, winningLine, isFull } from './rules.js';

export function createMatch({ mode, player1Symbol, difficulty }) {
  const player2Symbol = opponentOf(player1Symbol);
  const board = Array(9).fill(null);
  let turn = player1Symbol;
  let result = null; // { winner: symbol | null (draw), line: index[] | null }

  return {
    mode,
    difficulty,
    player1Symbol,
    player2Symbol,
    get board() { return board.slice(); },
    get turn() { return turn; },
    get result() { return result; },

    // 'win' | 'loss' (single player, from the human's side), 'player1' |
    // 'player2' (two players), 'draw', or null while the game is running.
    get outcome() {
      if (!result) return null;
      if (result.winner === null) return 'draw';
      const p1Won = result.winner === player1Symbol;
      if (mode === 'single') return p1Won ? 'win' : 'loss';
      return p1Won ? 'player1' : 'player2';
    },

    isSpiritTurn() {
      return mode === 'single' && result === null && turn === player2Symbol;
    },

    // Places the current player's symbol. Returns null for an illegal move.
    play(index) {
      if (result || !Number.isInteger(index) || index < 0 || index > 8 || board[index] !== null) return null;
      const symbol = turn;
      board[index] = symbol;
      const line = winningLine(board, symbol);
      if (line) result = { winner: symbol, line };
      else if (isFull(board)) result = { winner: null, line: null };
      else turn = opponentOf(symbol);
      return { index, symbol };
    },
  };
}
