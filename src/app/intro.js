// The INSPIRE Software intro: Start → intro video → the game, at most once
// per browser session (adapted from Bird Mahjong's js/ui/intro.js, so every
// INSPIRE game behaves the same way).
//
// It must never trap the player. The intro ends, exactly once, on whichever
// comes first:
// - the video ends;
// - Skip (the button, or Escape, Enter or Space);
// - a playback error (missing file, unsupported format, network);
// - play() refused, even muted;
// - nothing playing within STALL_MS (a slow or stuck load);
// - MAX_MS in total, whatever happens;
// - the page being hidden.
//
// The start tap that opens the intro can't also skip it: Skip is ignored for
// the first GUARD_MS, and held-key repeats are ignored.
export const GUARD_MS = 450;
export const STALL_MS = 4000;
export const MAX_MS = 15000;
export const INTRO_SEEN_KEY = 'spiritOfTheWoods:introSeen';

function sessionStore() {
  try {
    const store = globalThis.sessionStorage;
    store.setItem(`${INTRO_SEEN_KEY}:probe`, '1');
    store.removeItem(`${INTRO_SEEN_KEY}:probe`);
    return store;
  } catch {
    return null; // blocked: remembered in memory for this page only
  }
}

export function createIntro({
  video,
  skipButton,
  src,
  onDone,
  now = () => globalThis.performance.now(),
  timers = globalThis,
  store = sessionStore(),
}) {
  let seen = false; // memory fallback when sessionStorage is unavailable
  let active = false;
  let startedAt = 0;
  let stallTimer = null;
  let maxTimer = null;

  const alreadySeen = () => {
    if (seen) return true;
    try {
      return store?.getItem(INTRO_SEEN_KEY) === '1';
    } catch {
      return false;
    }
  };

  function markSeen() {
    seen = true;
    try {
      store?.setItem(INTRO_SEEN_KEY, '1');
    } catch {
      // memory only
    }
  }

  function finish(reason) {
    if (!active) return false;
    active = false;
    timers.clearTimeout(stallTimer);
    timers.clearTimeout(maxTimer);
    try {
      video.pause();
    } catch {
      // nothing to stop
    }
    onDone(reason);
    return true;
  }

  function refused(error, muted) {
    if (!active) return;
    if (error?.name === 'AbortError') return; // overtaken, e.g. by pause() on finish
    // Sound refused: the intro still plays, silently.
    if (error?.name === 'NotAllowedError' && !muted) attempt({ muted: true });
    else finish('failed');
  }

  function attempt({ muted }) {
    video.muted = muted;
    let result;
    try {
      result = video.play();
    } catch (error) {
      refused(error, muted);
      return;
    }
    result?.catch?.((error) => refused(error, muted));
  }

  video.addEventListener('ended', () => finish('ended'));
  video.addEventListener('error', () => finish('error'));
  skipButton.addEventListener('click', () => skip());

  // Should Start go through the intro?
  const pending = () => !alreadySeen();

  // Begins the intro (right after showing it). muted and volume follow the
  // music setting. Returns false if it was already seen this session.
  function play({ muted = false, volume = 1 } = {}) {
    if (active || alreadySeen()) return false;
    markSeen(); // counted as soon as it starts: a reload never replays it
    active = true;
    startedAt = now();
    try {
      video.volume = Math.max(0, Math.min(1, volume));
    } catch {
      // read-only volume (iOS)
    }
    if (!video.getAttribute('src')) video.setAttribute('src', src); // fetched only when needed
    try {
      video.currentTime = 0;
    } catch {
      // not seekable yet
    }
    stallTimer = timers.setTimeout(() => {
      if (video.paused || !(video.currentTime > 0)) finish('stalled');
    }, STALL_MS);
    maxTimer = timers.setTimeout(() => finish('timeout'), MAX_MS);
    attempt({ muted });
    return true;
  }

  // Skip (button or key), ignored just after the start tap that opened it.
  function skip() {
    if (!active || now() - startedAt < GUARD_MS) return false;
    return finish('skipped');
  }

  return {
    pending,
    play,
    skip,
    // Ends it now, e.g. the page was hidden.
    finish: (reason = 'interrupted') => finish(reason),
    get active() { return active; },
  };
}
