// "An update is ready": the page's side of the service worker's handover
// (sw.js). Registers the worker and, when a new release has installed and is
// waiting behind the one running this page, offers Reload or Later.
//
// - First install: no prompt. There is no older release to replace, so the
//   worker takes control by itself and the page carries on.
// - An update for an installation already running here (found at startup,
//   already waiting from an earlier visit, or found while playing): the
//   banner at the top of the page offers Reload and Later. It never takes
//   focus, never stops the match, and the screens make room for it, so it
//   covers nothing. Each match menu also carries a Reload row while an
//   update waits.
// - Later: the banner goes; the match goes on exactly as it was, on the
//   release it started with. The offer comes back the next time the hub
//   shows (between matches, never during one), and stays in the match menu.
// - Reload: if a move is half made (a chain of jumps under way) the update
//   waits for that move to end, so nothing is refreshed mid-turn. Then the
//   matches are held and saved (beforeReload), the waiting worker is told to
//   take over (SKIP_WAITING), and the page refreshes once, on
//   controllerchange. A routed match resumes on the same turn after the
//   refresh (src/app/app.js). If the worker never takes over, one fallback
//   refresh still happens, once; nothing refreshes without a press.
// - Another tab took the update: this page keeps running, and is offered a
//   Reload too (it is now served by the new release).
export const UPDATE = { POLL_MS: 200, FALLBACK_MS: 6000, CHECK_EVERY_MS: 30 * 60 * 1000 };

export function createUpdatePrompt({
  doc, win, sw = win.navigator?.serviceWorker, clock = win,
  beforeReload = () => {}, busy = () => false, onLaterFocus = () => {},
}) {
  const banner = doc.getElementById('update-banner');
  const text = doc.getElementById('update-banner-text');
  const rows = () => doc.querySelectorAll('[data-update-row]');
  // 'none' | 'offered' | 'declined' | 'after-move' | 'reloading'
  let state = 'none';
  let waiting = null; // the worker that takes over on Reload
  let refreshed = false;
  let poll = null;

  const TEXT = {
    offered: 'An update is ready. Your match is kept.',
    'after-move': 'Updating when this move ends…',
    reloading: 'Updating…',
  };

  function render() {
    const showing = state === 'offered' || state === 'after-move' || state === 'reloading';
    if (showing) text.textContent = TEXT[state];
    banner.hidden = !showing;
    banner.dataset.state = state;
    for (const button of banner.querySelectorAll('button')) button.disabled = state === 'reloading';
    banner.querySelector('[data-action="update-reload"]').hidden = state !== 'offered';
    doc.documentElement.classList.toggle('has-update', showing);
    keepRoom();
    for (const row of rows()) row.hidden = state === 'none';
  }

  // The room the banner takes at the top of the page (its height and
  // margin), which every screen gives up: kept up to date as it wraps or
  // appears (from behind the start screen, or a dialog).
  function keepRoom() {
    const room = banner.hidden ? 0 : banner.offsetTop + banner.offsetHeight;
    doc.documentElement.style.setProperty('--update-room', `${room}px`);
  }
  if (win.ResizeObserver) new win.ResizeObserver(keepRoom).observe(banner);

  function offer(worker) {
    waiting = worker;
    if (state === 'none') state = 'offered';
    render();
  }

  function refresh() {
    if (refreshed) return;
    refreshed = true;
    win.location.reload();
  }

  function takeOver() {
    clock.clearInterval(poll);
    poll = null;
    state = 'reloading';
    render();
    beforeReload();
    if (waiting && waiting.state === 'installed') waiting.postMessage({ type: 'SKIP_WAITING' });
    else refresh(); // already active (another tab took it): just refresh
    clock.setTimeout(refresh, UPDATE.FALLBACK_MS);
  }

  function register() {
    if (!sw || !win.isSecureContext) return Promise.resolve(null);
    // A page that started uncontrolled is a first install (or a hard
    // reload): the worker claiming it is not an update.
    const hadController = Boolean(sw.controller);
    sw.addEventListener('controllerchange', () => {
      if (state === 'reloading') refresh();
      else if (hadController) offer(null);
    });
    const watch = (reg) => {
      const track = (worker) => worker?.addEventListener('statechange', () => {
        // reg.active: an older release is running this installation.
        if (worker.state === 'installed' && reg.active) offer(worker);
      });
      if (reg.waiting && reg.active) offer(reg.waiting);
      track(reg.installing);
      reg.addEventListener('updatefound', () => track(reg.installing));
      // A long session checks for a new release when it comes back into view.
      let checked = Date.now();
      doc.addEventListener('visibilitychange', () => {
        if (doc.hidden || Date.now() - checked < UPDATE.CHECK_EVERY_MS) return;
        checked = Date.now();
        reg.update().catch(() => {});
      });
      return reg;
    };
    const go = () => sw.register('./sw.js', { updateViaCache: 'none' })
      .then(watch)
      .catch(() => null); // a blocked service worker never blocks gameplay
    if (doc.readyState === 'complete') return go();
    return new Promise((resolve) => win.addEventListener('load', () => resolve(go()), { once: true }));
  }

  return {
    register,
    // Reload: returns 'after-move' when it waits for a half-made move.
    reload() {
      if (state === 'none' || state === 'reloading') return state;
      if (busy()) {
        state = 'after-move';
        render();
        if (!poll) poll = clock.setInterval(() => { if (!busy()) takeOver(); }, UPDATE.POLL_MS);
        return state;
      }
      takeOver();
      return state;
    },
    later() {
      if (state !== 'offered' && state !== 'after-move') return;
      clock.clearInterval(poll);
      poll = null;
      const hadFocus = banner.contains(doc.activeElement);
      state = 'declined';
      render();
      if (hadFocus) onLaterFocus();
    },
    // The hub is showing: offer again an update put off with Later.
    hubShown() {
      if (state !== 'declined') return;
      state = 'offered';
      render();
    },
    get state() { return state; },
    // For tests: an update found (normally from the registration).
    offer,
  };
}
