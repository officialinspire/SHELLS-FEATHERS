// DOM for the Acorns & Leaves match screen: the 8×8 board, the two sides'
// panels (captured counts, whose move), the turn and guidance lines, status
// announcements and the result dialog. It draws the model the session hands
// it and knows no rules.
//
// Board: 64 squares; the 32 dark ones are buttons with one tab stop between
// them. The arrow keys move between dark squares (Left/Right along a row,
// Up/Down to the next row), Home/End go to the ends of a row, Enter or Space
// picks a piece or a square, and Escape puts a picked-up piece back. Each
// square's name says where it is, what is on it and what it is for
// ("d4: empty, move here"). Board states: "ready" (the player picks),
// "waiting" (the Spirit is moving; every square is aria-disabled) and "over".
//
// Marks, each drawn as a shape as well as a color: a dot on a square the
// picked-up piece can move to (a ring for a jump), an orange ring around a
// piece that must capture, a raised piece on a gold square for the piece
// picked up, a cross over a piece being jumped, and tinted squares for the
// route of the last move.
//
// Against the Spirit the player's side sits at the bottom, so playing the
// Leaves turns the board round. Square names stay the same either way.
//
// Fog of War: the model's board already holds only what the viewer can see.
// Fogged squares (model.fog) get mist and are named "hidden"; pieces found by
// a blocked jump (model.found) are marked. In a two-player game the handoff
// screen covers everything, and the board behind it holds no pieces.
import { SIZE, rowOf, colOf, isDarkSquare } from './engine.js';
import { DIFFICULTY_NAMES } from './ai.js';
import { squareName, pieceName, SIDE_NAMES } from './text.js';
import { createPieceIcon } from './pieces.js';

const LAST = SIZE * SIZE - 1;
// Screen position of a square (index = row * 8 + col on screen). Turning the
// board round maps square s to LAST - s, which is its own inverse.
const onScreen = (square, orientation) => (orientation === 'leaf' ? LAST - square : square);
const darkColumns = (row) => [...Array(SIZE).keys()].filter((col) => (row + col) % 2 === 1);

// The dark square reached from `square` with an arrow, Home or End key (it
// stays put at the edges), or null for any other key. Directions are as seen
// on screen. Up and Down keep the same place among the row's four dark
// squares, so they step diagonally.
export function nextSquare(square, key, orientation = 'acorn') {
  const at = onScreen(square, orientation);
  const row = rowOf(at);
  const col = colOf(at);
  const cols = darkColumns(row);
  const index = cols.indexOf(col);
  let target;
  switch (key) {
    case 'ArrowLeft': target = [row, cols[Math.max(0, index - 1)]]; break;
    case 'ArrowRight': target = [row, cols[Math.min(cols.length - 1, index + 1)]]; break;
    case 'ArrowUp': target = row > 0 ? [row - 1, darkColumns(row - 1)[index]] : [row, col]; break;
    case 'ArrowDown': target = row < SIZE - 1 ? [row + 1, darkColumns(row + 1)[index]] : [row, col]; break;
    case 'Home': target = [row, cols[0]]; break;
    case 'End': target = [row, cols[cols.length - 1]]; break;
    default: return null;
  }
  return onScreen(target[0] * SIZE + target[1], orientation);
}

// "d4: empty, move here", "c3: acorn, selected", "e5: leaf, being captured",
// and in Fog "e5: hidden, try a jump here", "a5: leaf, found blocking a jump".
export function squareLabel({
  square, piece, selected, destination, capture, mustJump, movable, jumped, onLastMove, capturedLastMove, fogged, found, mayCapture,
}) {
  const notes = [];
  if (selected) notes.push('selected');
  if (destination) notes.push(fogged ? 'try a jump here' : capture ? 'jump here' : 'move here');
  if (mustJump) notes.push(mayCapture ? 'may capture' : 'must capture');
  else if (movable && !selected) notes.push('can move');
  if (found) notes.push('found blocking a jump');
  if (jumped) notes.push('being captured');
  if (capturedLastMove) notes.push('captured in the last move');
  else if (onLastMove) notes.push('last move');
  const contents = fogged ? 'hidden' : pieceName(piece);
  return `${squareName(square)}: ${contents}${notes.length ? `, ${notes.join(', ')}` : ''}`;
}

const pieceKey = (piece) => (piece ? `${piece.side}${piece.king ? '-king' : ''}` : '');

export function createAcornsLeavesView(doc) {
  const byId = (id) => doc.getElementById(id);
  const board = byId('al-board');
  const screen = byId('al-game-screen');
  const modal = byId('al-modal');
  const handoff = byId('al-handoff');
  const status = byId('al-status');
  const restartButton = screen.querySelector('[data-action="al-restart"]');
  const squares = [];
  let orientation = 'acorn';
  let focusSquare = null;

  for (let square = 0; square <= LAST; square++) {
    const dark = isDarkSquare(square);
    const el = doc.createElement(dark ? 'button' : 'span');
    el.className = `al-square ${dark ? 'dark' : 'light'}`;
    if (dark) {
      el.type = 'button';
      el.dataset.square = String(square);
      el.tabIndex = -1;
    } else {
      el.setAttribute('aria-hidden', 'true');
    }
    const rank = doc.createElement('span');
    rank.className = 'al-rank';
    rank.setAttribute('aria-hidden', 'true');
    const file = doc.createElement('span');
    file.className = 'al-file';
    file.setAttribute('aria-hidden', 'true');
    el.append(rank, file);
    squares.push(el);
  }

  // The front-left piece of the side at the bottom: a sensible first stop.
  const homeSquare = () => onScreen(5 * SIZE, orientation);

  function setFocusSquare(square, { focus = false } = {}) {
    if (focusSquare !== null) squares[focusSquare].tabIndex = -1;
    focusSquare = square;
    squares[square].tabIndex = 0;
    if (focus) squares[square].focus();
  }

  function setOrientation(side) {
    orientation = side === 'leaf' ? 'leaf' : 'acorn';
    board.dataset.orientation = orientation;
    const ordered = [];
    for (let at = 0; at <= LAST; at++) ordered.push(squares[onScreen(at, orientation)]);
    board.replaceChildren(...ordered);
    ordered.forEach((el, at) => {
      const square = onScreen(at, orientation);
      const name = squareName(square);
      // Ranks down the left edge, files along the bottom, as seen on screen.
      el.querySelector('.al-rank').textContent = colOf(at) === 0 ? name.slice(1) : '';
      el.querySelector('.al-file').textContent = rowOf(at) === SIZE - 1 ? name[0] : '';
    });
    setFocusSquare(homeSquare());
  }

  function setPiece(el, piece) {
    const key = pieceKey(piece);
    if (el.dataset.piece === key) return;
    el.querySelector('.al-piece')?.remove();
    if (piece) el.append(createPieceIcon(doc, piece));
    if (key) el.dataset.piece = key;
    else delete el.dataset.piece;
  }

  function render(model) {
    board.dataset.state = model.phase;
    board.setAttribute('aria-busy', String(model.phase === 'waiting'));
    const destinations = new Set(model.destinations);
    const mustJump = new Set(model.mustJump);
    const movable = new Set(model.movable);
    const jumped = new Set(model.jumped);
    const trail = new Set(model.trail);
    const lastPath = new Set(model.lastMove?.path ?? []);
    const lastCaptures = new Set(model.lastMove?.captures ?? []);
    const fog = new Set(model.fog ?? []);
    const found = new Set(model.found ?? []);
    const inFog = model.variant === 'fog';
    board.dataset.variant = inFog ? 'fog' : 'classic';
    for (let square = 0; square <= LAST; square++) {
      if (!isDarkSquare(square)) continue;
      const el = squares[square];
      const piece = model.board[square];
      const marks = {
        selected: model.selected === square,
        destination: destinations.has(square),
        mustJump: mustJump.has(square),
        movable: movable.has(square),
        jumped: jumped.has(square),
        trail: trail.has(square) && model.selected !== square,
        onLastMove: lastPath.has(square),
        capturedLastMove: lastCaptures.has(square) && !piece,
        fogged: fog.has(square),
        found: found.has(square),
      };
      setPiece(el, fog.has(square) ? null : piece);
      el.classList.toggle('is-fog', marks.fogged);
      el.classList.toggle('is-found', marks.found);
      el.classList.toggle('is-selected', marks.selected);
      el.classList.toggle('is-destination', marks.destination);
      el.classList.toggle('is-jump-target', marks.destination && model.capture);
      el.classList.toggle('must-jump', marks.mustJump);
      el.classList.toggle('can-move', marks.movable);
      el.classList.toggle('is-jumped', marks.jumped);
      el.classList.toggle('is-trail', marks.trail);
      el.classList.toggle('is-last', marks.onLastMove);
      el.classList.toggle('was-captured', marks.capturedLastMove);
      el.classList.toggle('is-last-to', model.lastMove?.path.at(-1) === square && Boolean(piece));
      if (model.phase === 'ready') el.removeAttribute('aria-disabled');
      else el.setAttribute('aria-disabled', 'true');
      el.setAttribute('aria-label', squareLabel({ square, piece, capture: model.capture, mayCapture: inFog, ...marks }));
    }

    for (const side of ['acorn', 'leaf']) {
      const panel = byId(`al-side-${side}`);
      // Against the Spirit: "You" / "Spirit", with the side for screen readers
      // (the piece beside the name shows it).
      const single = model.mode === 'single';
      panel.querySelector('.al-side-name').textContent = single ? (side === model.humanSide ? 'You' : 'Spirit') : SIDE_NAMES[side];
      panel.querySelector('.al-side-of').textContent = single ? ` (${SIDE_NAMES[side]})` : '';
      panel.querySelector('.al-side-count').textContent = String(model.captured[side]);
      const active = model.phase !== 'over' && model.turn === side;
      const won = model.phase === 'over' && model.winner === side;
      panel.classList.toggle('is-active', active);
      panel.classList.toggle('is-winner', won);
      const tag = panel.querySelector('.al-side-tag');
      tag.textContent = won ? 'Winner' : active ? 'To move' : '';
      tag.hidden = !(won || active);
    }

    const turn = byId('al-turn');
    turn.textContent = model.turnLabel;
    turn.dataset.side = model.phase === 'over' ? (model.winner ?? 'draw') : model.turn;
    const hint = byId('al-hint');
    hint.textContent = model.hint;
    hint.dataset.tone = model.feedback ? 'feedback' : model.phase;
  }

  // Repeating the same text wouldn't be announced again, so alternate a
  // trailing space.
  function announce(text) {
    status.textContent = status.textContent === text ? `${text} ` : text;
  }

  function hideResult() {
    const hadFocus = modal.contains(doc.activeElement);
    modal.classList.remove('active');
    screen.inert = false;
    if (hadFocus) squares[focusSquare].focus();
  }

  // Closes the dialog but keeps the finished board on screen.
  function dismissResult() {
    hideResult();
    restartButton.focus();
  }

  return {
    bind({ onSelect, onCancel }) {
      board.addEventListener('click', (event) => {
        const el = event.target.closest('button[data-square]');
        if (!el) return;
        const square = Number(el.dataset.square);
        setFocusSquare(square);
        onSelect(square);
      });
      board.addEventListener('keydown', (event) => {
        const el = event.target.closest('button[data-square]');
        if (!el) return;
        if (event.key === 'Escape') {
          event.preventDefault();
          onCancel();
          return;
        }
        const next = nextSquare(Number(el.dataset.square), event.key, orientation);
        if (next === null) return;
        event.preventDefault();
        setFocusSquare(next, { focus: true });
      });
      modal.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !modal.classList.contains('active')) return;
        event.preventDefault();
        dismissResult();
      });
      setOrientation('acorn');
    },
    setOrientation,
    focusBoard() {
      squares[focusSquare].focus();
    },
    showMatchInfo({ mode, difficulty, humanSide, variant = 'classic' }) {
      const fogged = variant === 'fog';
      let info;
      if (mode === 'two') info = fogged ? 'Fog of War · Two players' : 'Two players · Acorns move first';
      else if (fogged) info = `Fog of War · ${DIFFICULTY_NAMES[difficulty]} Spirit · You: ${SIDE_NAMES[humanSide]}`;
      else info = `Against the Spirit · ${DIFFICULTY_NAMES[difficulty]} · You: ${SIDE_NAMES[humanSide]}`;
      byId('al-match-info').textContent = info;
      screen.dataset.variant = variant;
    },
    // Two players in Fog: covers the screen until the next player is ready.
    // The board's keyboard stop goes back to its usual first square, so it
    // can't point at the square the last player moved to.
    showHandoff({ title, text, button }) {
      setFocusSquare(homeSquare());
      byId('al-handoff-title').textContent = title;
      byId('al-handoff-text').textContent = text;
      const ready = byId('al-handoff-button');
      ready.textContent = button;
      handoff.hidden = false;
      screen.inert = true;
      ready.focus();
    },
    hideHandoff() {
      if (handoff.hidden) return;
      handoff.hidden = true;
      screen.inert = false;
    },
    render,
    announce,
    showResult({ title, message }) {
      byId('al-modal-title').textContent = title;
      byId('al-modal-message').textContent = message;
      modal.classList.add('active');
      screen.inert = true;
      modal.querySelector('[data-action="al-rematch"]').focus();
    },
    hideResult,
    dismissResult,
  };
}
