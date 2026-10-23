// Acorns & Leaves is a preview: there is no game engine yet. This only draws
// a static picture of the checkers starting position (leaves on the top three
// rows, acorns on the bottom three, dark squares only). It is not interactive.
export const PIECES = { acorn: '🌰', leaf: '🍂' };

export function startingPosition() {
  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const dark = (row + col) % 2 === 1;
      const piece = !dark ? null : row < 3 ? 'leaf' : row > 4 ? 'acorn' : null;
      squares.push({ dark, piece });
    }
  }
  return squares;
}

export function renderStartingPosition(container) {
  const doc = container.ownerDocument;
  container.replaceChildren(...startingPosition().map(({ dark, piece }) => {
    const square = doc.createElement('span');
    square.className = `checkers-square ${dark ? 'dark' : 'light'}`;
    if (piece) square.textContent = PIECES[piece];
    return square;
  }));
}
