// Composes the app: shared services (storage, profile, audio, haptics and
// the feedback service that drives sounds, vibration and animations), the
// router and
// screens, and one session per game (Shells & Feathers, Acorns & Leaves).
//
// Navigation uses real links (href="#/..."). A click on one is routed in-page
// (with a history entry, so Back/Forward work); `data-up` and `data-back`
// links step back through history when that leads to the same screen.
// Buttons that act on the current screen declare `data-action`.
//
// Sound starts only after the player's first tap, click or key press (any
// later one unlocks it again if the browser refused a sound), and the music
// pauses while the page is hidden. So does a match: a hidden page holds it
// like the match menu does, and it goes on when the page is shown again.
//
// Focus after an action is predictable: Restart and Play Again/Rematch put
// it on the board; closing a menu or dialog returns it to what opened it. If
// a window resize hides the control that has focus (the side panel's
// buttons exist only on wide screens), focus moves to the match's Menu
// button.
import { openStorage } from '../shared/storage.js';
import { createProfile } from '../shared/profile.js';
import { createAudio } from '../shared/audio.js';
import { createHaptics } from '../shared/haptics.js';
import { createFeedback } from '../shared/feedback.js';
import { createNavigator } from './navigation.js';
import { createRouter, documentTitle } from './router.js';
import { initSettingsScreen, applyMotion } from './settings-screen.js';
import { createSoundMotion } from './sound-motion.js';
import { createPathScreen } from './path-screen.js';
import { createConfirmDialog } from './confirm-dialog.js';
import { createToast } from './toast.js';
import { installDialogFocus } from './dialog-focus.js';
import { createShellsFeathersView } from '../games/shells-feathers/view.js';
import { createSession } from '../games/shells-feathers/session.js';
import { initShellsFeathersSetup } from '../games/shells-feathers/setup.js';
import { createInitialState } from '../games/acorns-leaves/engine.js';
import { renderMiniBoard } from '../games/acorns-leaves/pieces.js';
import { createAcornsLeavesView } from '../games/acorns-leaves/view.js';
import { createSession as createAcornsLeavesSession } from '../games/acorns-leaves/session.js';
import { initAcornsLeavesSetup } from '../games/acorns-leaves/setup.js';

export function createApp({ doc, win }) {
  const profile = createProfile(openStorage(() => win.localStorage));
  const settings = profile.settings();
  applyMotion(doc, settings.motion);
  const audio = createAudio({
    doc,
    clock: win,
    musicId: 'gameplay-music',
    sfxEnabled: settings.sfx,
    musicEnabled: settings.music,
    sfxVolume: settings.sfxVolume,
    musicVolume: settings.musicVolume,
  });
  const haptics = createHaptics({
    nav: win.navigator, doc, clock: win, enabled: settings.haptics,
  });
  // Animations follow Settings > Motion (and the device, for "Match device").
  const reducedMotion = () => {
    const motion = doc.documentElement.dataset.motion;
    return motion === 'reduce' || (motion !== 'full' && Boolean(win.matchMedia?.('(prefers-reduced-motion: reduce)').matches));
  };
  const feedback = createFeedback({
    audio, haptics, clock: win, reducedMotion,
  });
  const toast = createToast({ doc, clock: win, feedback });
  const confirmDialog = createConfirmDialog(doc);
  const view = createShellsFeathersView(doc);
  const session = createSession({
    view, audio, feedback, profile, clock: win,
  });
  const checkersView = createAcornsLeavesView(doc);
  const checkers = createAcornsLeavesSession({
    view: checkersView, audio, feedback, profile, clock: win, notify: (achievements) => toast.achievements(achievements),
  });
  const path = createPathScreen({
    doc, profile, feedback, confirmDialog,
  });
  let settingsScreen = null;
  let firstRoute = true;

  const nav = createNavigator(doc, {
    // Returning to the hub restarts the music (as v1's home screen did); the
    // first page load waits for a click, since browsers block autoplay.
    'hub-screen': { enter: () => { if (!firstRoute) audio.startMusic(); } },
    'path-screen': { enter: () => path.render() },
    'settings-screen': { enter: () => settingsScreen?.show() },
    'game-screen': {
      enter: (mode) => session.enter(mode),
      leave: () => session.leave(),
    },
    'al-game-screen': {
      enter: (mode, variant) => checkers.enter(mode, variant),
      leave: () => checkers.leave(),
    },
  });

  const router = createRouter({
    win,
    onChange(route) {
      nav.show(route.screen, ...(route.args ?? []));
      doc.title = documentTitle(route);
      if (firstRoute) {
        firstRoute = false;
        return;
      }
      // Move keyboard and screen-reader focus to the new screen.
      win.scrollTo(0, 0);
      if (route.screen === 'game-screen') view.focusBoard();
      else if (route.screen === 'al-game-screen') checkersView.focusBoard();
      else doc.getElementById(route.screen).querySelector('[tabindex="-1"]')?.focus();
    },
  });

  const actions = {
    'restart-match': () => {
      session.restart();
      view.focusBoard();
    },
    'play-again': () => {
      session.playAgain();
      view.focusBoard();
    },
    'view-board': () => view.dismissResult(),
    'reset-stats': () => path.reset(),
    'al-restart': () => {
      checkers.restart();
      checkersView.focusBoard();
    },
    'al-rematch': () => {
      checkers.playAgain();
      checkersView.focusBoard();
    },
    'al-view-board': () => checkersView.dismissResult(),
    'al-take-control': () => checkers.takeControl(),
    'reset-al-stats': () => path.resetAcornsLeaves(),
    'delete-all-data': () => settingsScreen.deleteAll(),
  };

  // After "Delete all saved data": start again from a fresh page, or say
  // what couldn't be deleted.
  function deletedAll(ok) {
    if (ok) {
      win.location.reload();
      return;
    }
    doc.getElementById('delete-all-status').textContent = 'Some saved data could not be deleted: this browser is blocking storage. Nothing more is saved until the page is closed.';
  }

  function onClick(event) {
    const button = event.target.closest('[data-action]');
    if (button) {
      actions[button.dataset.action]?.();
      return;
    }
    const link = event.target.closest('a[href^="#/"]');
    // Let the browser handle new-tab/new-window clicks.
    if (!link || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    feedback.cue('button');
    const target = link.getAttribute('href').slice(1);
    if (link.hasAttribute('data-back')) router.back(target);
    else if (link.hasAttribute('data-up')) router.up(target);
    else router.go(target);
  }

  function init() {
    doc.addEventListener('click', onClick);
    installDialogFocus(doc);
    // Each match menu has its own sound and motion controls.
    const menuSettings = (id) => createSoundMotion({
      doc, root: doc.getElementById(id).querySelector('[data-menu-view="settings"]'), win, profile, audio, haptics, feedback,
    });
    const sfSettings = menuSettings('sf-menu');
    const alSettings = menuSettings('al-menu');
    view.bindCells((index) => session.selectCell(index), {
      onPause: () => session.pause(),
      onResume: () => session.resume(),
      onSettings: () => sfSettings.show(),
    });
    checkersView.bind({
      onSelect: (square) => checkers.selectSquare(square),
      onCancel: () => checkers.cancelSelection(),
      onPause: () => checkers.pause(),
      onResume: () => checkers.resume(),
      onSettings: () => alSettings.show(),
    });
    openHelpWhereItFits();
    rescueFocusOnResize();
    initShellsFeathersSetup({ doc, profile, feedback });
    initAcornsLeavesSetup({ doc, profile, feedback });
    settingsScreen = initSettingsScreen({
      doc, win, profile, audio, haptics, feedback, confirmDialog, onDeletedAll: deletedAll,
    });
    feedback.setAnimator('sf', view.animator);
    feedback.setAnimator('al', checkersView.animator);
    for (const board of doc.querySelectorAll('[data-checkers-board]')) renderMiniBoard(board, createInitialState().board);
    path.render();
    // Browsers only allow audio after a user gesture; music waits for it.
    const unlock = () => audio.unlock();
    for (const type of ['pointerdown', 'keydown', 'touchend']) doc.addEventListener(type, unlock, { capture: true, passive: true });
    doc.addEventListener('visibilitychange', () => {
      for (const game of [session, checkers]) {
        if (doc.hidden) game.pause('hidden');
        else game.resume('hidden');
      }
      if (doc.hidden) audio.suspend();
      else audio.resume();
    });
    audio.startMusic();
    router.start();
    for (const note of profile.notes) console.info(`Spirit of the Woods: ${note}`);
  }

  // The side panel's "Rules and keys" starts open where the window is tall
  // enough to show it beside the board, and then stays as the player leaves
  // it (in memory only: nothing more is stored).
  function openHelpWhereItFits() {
    for (const help of doc.querySelectorAll('details[data-help]')) help.open = win.innerHeight >= 860;
  }

  // The browser may already have moved focus to the page itself when the
  // focused control disappears, so this looks at the last control focused.
  function rescueFocusOnResize() {
    let last = null;
    let pending = false;
    doc.addEventListener('focusin', (event) => { last = event.target; });
    win.addEventListener('resize', () => {
      if (pending) return;
      pending = true;
      win.requestAnimationFrame(() => {
        pending = false;
        const el = doc.activeElement && doc.activeElement !== doc.body ? doc.activeElement : last;
        if (!el || el === doc.body || !el.isConnected || el.getClientRects().length) return;
        doc.querySelector('.screen.active .menu-btn')?.focus();
      });
    });
  }

  return { init };
}
