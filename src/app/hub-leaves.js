// Leaves drifting down behind the hub (the main menu), after Bird Mahjong's
// drifting tiles (js/background.js): a small, fixed number of leaves, each
// with its own size, speed, sway, spin and start, so no two fall together.
// styles.css (.drift-leaf) does the motion on the compositor.
//
// The layer is decorative (aria-hidden, no pointer events), sits behind the
// hub's cards, and is clipped to the screen. Leaves exist only while the hub
// is showing and nothing holds them back: they are made when the hub opens
// and removed when it closes, so coming back never adds more. Held by:
// - 'start': the start screen and intro cover the hub;
// - 'hidden': the page is in the background;
// and never made at all when motion is reduced (Settings > Motion, or the
// device's setting under "Match device"); the static scatter on the page
// stays.
export const LEAF_KINDS = ['green', 'gold', 'rust', 'sage'];

// How many leaves for a window this wide: few on a phone, never many.
export const leafCount = (width) => (width >= 1024 ? 14 : width >= 700 ? 10 : 7);

export function createHubLeaves({
  doc, win, reducedMotion = () => false, random = Math.random,
}) {
  const layer = doc.getElementById('hub-leaves');
  const holds = new Set();
  let onHub = false;
  let running = false;

  const between = (min, max) => min + random() * (max - min);

  function leaf(i, count) {
    const el = doc.createElement('span');
    const fall = between(16, 28); // seconds from the top to the bottom
    // Lanes across the width, jittered, so leaves never bunch up.
    const lane = (i + between(0.1, 0.9)) / count;
    el.className = `drift-leaf drift-leaf--${LEAF_KINDS[Math.floor(random() * LEAF_KINDS.length)]}`;
    const set = (name, value) => el.style.setProperty(name, value);
    set('--x', `${(lane * 100).toFixed(2)}%`);
    set('--size', `${Math.round(between(14, 30))}px`);
    set('--alpha', between(0.32, 0.6).toFixed(2));
    set('--fall', `${fall.toFixed(1)}s`);
    set('--delay', `${(-between(0, fall)).toFixed(1)}s`); // mid-fall at once
    set('--sway', `${Math.round(between(18, 64))}px`);
    set('--sway-time', `${between(3.2, 6.4).toFixed(1)}s`);
    set('--tilt', `${Math.round(between(-40, 40))}deg`);
    set('--spin', `${Math.round(between(180, 520)) * (random() < 0.5 ? -1 : 1)}deg`);
    return el;
  }

  function start() {
    const count = leafCount(win.innerWidth);
    layer.replaceChildren(...Array.from({ length: count }, (_, i) => leaf(i, count)));
    layer.hidden = false;
    running = true;
  }

  function stop() {
    layer.replaceChildren();
    layer.hidden = true;
    running = false;
  }

  function update() {
    const wanted = onHub && !holds.size && !reducedMotion();
    if (wanted && !running) start();
    else if (!wanted && running) stop();
  }

  win.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', update);

  return {
    enterHub() {
      onHub = true;
      update();
    },
    leaveHub() {
      onHub = false;
      update();
    },
    hold(reason) {
      holds.add(reason);
      update();
    },
    release(reason) {
      holds.delete(reason);
      update();
    },
    // After Settings > Motion changes.
    refresh: update,
    get running() { return running; },
  };
}
