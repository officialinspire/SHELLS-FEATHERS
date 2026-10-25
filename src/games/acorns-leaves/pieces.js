// Acorn and leaf pieces, drawn from the SVG symbols in index.html
// (#al-acorn, #al-acorn-king, #al-leaf, #al-leaf-king). The two sides differ
// in more than color: Acorns are light wooden discs with a dark rim and an
// acorn on top, Leaves are dark green discs with a cream rim and a leaf. A
// king keeps its side's disc and adds a gold rim, a second disc underneath
// and a crown rising above the disc, so its outline differs as well.
import { isDarkSquare } from './engine.js';
import { svgIcon } from '../../shared/icons.js';

export const symbolFor = (piece) => `#al-${piece.side}${piece.king ? '-king' : ''}`;

export const createPieceIcon = (doc, piece, className = 'al-piece') => svgIcon(doc, symbolFor(piece), className);

// A small picture of a position (hub card, How to Play). Not interactive.
export function renderMiniBoard(container, board) {
  const doc = container.ownerDocument;
  container.replaceChildren(...board.map((piece, square) => {
    const cell = doc.createElement('span');
    cell.className = `checkers-square ${isDarkSquare(square) ? 'dark' : 'light'}`;
    if (piece) cell.append(createPieceIcon(doc, piece, 'checkers-piece'));
    return cell;
  }));
}
