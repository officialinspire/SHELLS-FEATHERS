// Board input shared by both games: every click, tap or Enter/Space on one
// of a board's squares becomes one onActivate(square) call, except taps that
// weren't meant as a move:
// - a gesture the browser took over (a scroll or a pinch: pointercancel), a
//   finger that slid more than TAPS.slop px or lifted on another square, and
//   any touch while a second finger is on the screen;
// - with a finger or pen, a second tap on the same square within
//   TAPS.doubleTap ms (a bounce would pick a piece up and put it straight
//   back), and any tap within TAPS.settle ms of a move appearing on the board
//   (moved()): nobody can see a move and answer it that fast, so it is a
//   stray second tap, which in Shells & Feathers would otherwise place the
//   next player's piece.
// Mouse clicks and the keyboard (a click with detail 0) are taken as they
// come. While stray taps are being ignored the board carries data-settling
// (tests wait on it). Nothing here stops scrolling or zooming: the board's
// touch-action: manipulation only turns off double-tap zoom.
export const TAPS = { slop: 12, doubleTap: 350, settle: 300, gestureWindow: 1000 };

export function createBoardTaps({ board, selector, onActivate, clock = globalThis }) {
  const doc = board.ownerDocument;
  const now = () => clock.performance?.now?.() ?? Date.now();
  const fingers = new Set();
  let gesture = null; // { id, type, square, x, y, at, cancelled }
  let lastTap = null; // { square, at }
  let movedAt = -Infinity;
  let settleTimer = null;

  // Fingers are counted on the whole page: the second finger of a pinch can
  // land off the board.
  doc.addEventListener('pointerdown', (event) => {
    // A primary pointer starts a fresh interaction, so an up event the page
    // never saw (released outside the window) can't leave a stale finger.
    if (event.isPrimary) fingers.clear();
    fingers.add(event.pointerId);
    if (fingers.size > 1) {
      if (gesture) gesture.cancelled = true;
      return;
    }
    gesture = board.contains(event.target) ? {
      id: event.pointerId,
      type: event.pointerType,
      square: event.target.closest(selector),
      x: event.clientX,
      y: event.clientY,
      at: now(),
      cancelled: false,
    } : null;
  }, true);
  board.addEventListener('pointermove', (event) => {
    if (gesture?.id !== event.pointerId || gesture.cancelled) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > TAPS.slop) gesture.cancelled = true;
  });
  // On the document: a finger or mouse can be lifted off the board.
  doc.addEventListener('pointerup', (event) => {
    fingers.delete(event.pointerId);
    if (gesture?.id !== event.pointerId || gesture.cancelled) return;
    const at = doc.elementFromPoint(event.clientX, event.clientY)?.closest(selector) ?? null;
    if (at !== gesture.square) gesture.cancelled = true;
  }, true);
  doc.addEventListener('pointercancel', (event) => {
    fingers.delete(event.pointerId);
    if (gesture?.id === event.pointerId) gesture.cancelled = true;
  }, true);

  board.addEventListener('click', (event) => {
    const square = event.target.closest(selector);
    if (!square) return;
    const from = event.detail > 0 && gesture && now() - gesture.at < TAPS.gestureWindow ? gesture : null;
    gesture = null;
    if (from) {
      if (from.cancelled || from.square !== square) return;
      if (from.type !== 'mouse') {
        const at = now();
        if (at - movedAt < TAPS.settle) return;
        if (lastTap?.square === square && at - lastTap.at < TAPS.doubleTap) return;
        lastTap = { square, at };
      }
    }
    onActivate(square);
  });

  return {
    // A move has just appeared on the board.
    moved() {
      movedAt = now();
      lastTap = null;
      board.dataset.settling = '';
      clock.clearTimeout(settleTimer);
      settleTimer = clock.setTimeout(() => delete board.dataset.settling, TAPS.settle);
    },
  };
}
