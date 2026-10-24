// Acorn and leaf pieces, drawn from the SVG symbols in index.html
// (#al-acorn, #al-acorn-king, #al-leaf, #al-leaf-king). The two sides differ
// in more than color: Acorns are light wooden discs with a dark rim and an
// acorn on top, Leaves are dark green discs with a cream rim and a leaf. A
// king keeps its side's disc and adds a gold rim, a second disc underneath
// and a crown.
import { isDarkSquare } from './engine.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

export const symbolFor = (piece) => `#al-${piece.side}${piece.king ? '-king' : ''}`;

export function createPieceIcon(doc, piece, className = 'al-piece') {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = doc.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', symbolFor(piece));
  svg.append(use);
  return svg;
}

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
