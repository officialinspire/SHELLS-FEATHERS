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
// Every load opens on "Touch to start", then the INSPIRE intro (once per
// browser session; src/app/start-gate.js). That first tap is also the
// gesture that lets sound play (any later one unlocks it again if the
// browser refused a sound). The music starts when the game appears after
// the intro, and pauses while the page is hidden. So does a match: a hidden page holds it
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
import { createJournalScreen, TAB_PATHS } from './journal-screen.js';
import { createResumeUi } from './resume-ui.js';
import { initHubChooser } from './hub-chooser.js';
import { createTutorial, SETUP_PATHS } from './tutorial.js';
import { createResumeStore } from '../shared/resume.js';
import { createStartGate } from './start-gate.js';
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

const GAME_OF_SCREEN = { 'game-screen': 'shellsFeathers', 'al-game-screen': 'acornsLeaves' };
const RESUME_PATHS = { shellsFeathers: '/shells-feathers/resume', acornsLeaves: '/acorns-leaves/resume' };

export function createApp({ doc, win }) {
  const store = openStorage(() => win.localStorage);
  const profile = createProfile(store);
  // Unfinished matches, one per game (src/shared/resume.js).
  const resumeStore = createResumeStore(store);
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
    view, audio, feedback, profile, clock: win, resume: resumeStore,
  });
  const checkersView = createAcornsLeavesView(doc);
  const checkers = createAcornsLeavesSession({
    view: checkersView, audio, feedback, profile, clock: win, resume: resumeStore, notify: (achievements) => toast.achievements('al', achievements),
  });
  const resumeUi = createResumeUi({ doc, resumeStore });
  const tutorial = createTutorial({ doc, profile, feedback });
  let sfSetup = null;
  let alSetup = null;
  // The tutorial is offered once on each game's setup screen.
  const showTutorialCard = (game, p) => {
    doc.getElementById(`${p}-tutorial-card`).hidden = profile.tutorial(game) !== null;
  };
  const path = createPathScreen({
    doc, profile, feedback, confirmDialog,
  });
  let settingsScreen = null;
  let firstRoute = true;
  let router = null;
  let startingNew = false; // a Play link was just pressed
  // Whether a match route ([mode] or [mode, variant]) asks for the same kind
  // of match as the game's unfinished one.
  const sameKind = (game, [mode, variant = 'classic'] = []) => {
    const saved = resumeStore.get(game);
    return saved.mode === mode && (game !== 'acornsLeaves' || saved.variant === variant);
  };
  // A journal tab has its own URL; changing tabs replaces it.
  const journal = createJournalScreen({
    doc,
    profile,
    onTab(tab) {
      doc.title = documentTitle(router.replace(TAB_PATHS[tab]));
    },
  });

  const nav = createNavigator(doc, {
    // Returning to the hub restarts the music (as v1's home screen did); the
    // first page load waits for a click, since browsers block autoplay.
    'hub-screen': {
      enter: () => {
        resumeUi.renderHub();
        if (!firstRoute) audio.startMusic();
      },
    },
    'sf-setup-screen': {
      enter: () => {
        sfSetup?.show();
        resumeUi.render('shellsFeathers');
        showTutorialCard('shellsFeathers', 'sf');
      },
    },
    'al-setup-screen': {
      enter: () => {
        alSetup?.show();
        resumeUi.render('acornsLeaves');
        showTutorialCard('acornsLeaves', 'al');
      },
    },
    'tutorial-screen': { enter: (game) => tutorial.start(game) },
    'path-screen': { enter: () => path.render() },
    'journal-screen': { enter: (tab) => journal.show(tab) },
    'settings-screen': { enter: () => settingsScreen?.show() },
    // A resume route rebuilds the saved match (checked before it is shown).
    'game-screen': {
      enter: (mode) => (mode === 'resume' ? session.resumeFrom(resumeStore.get('shellsFeathers')) : session.enter(mode)),
      leave: () => {
        session.leave();
        toast.clear();
      },
    },
    'al-game-screen': {
      enter: (mode, variant) => (mode === 'resume' ? checkers.resumeFrom(resumeStore.get('acornsLeaves')) : checkers.enter(mode, variant)),
      leave: () => {
        checkers.leave();
        toast.clear();
      },
    },
  });

  router = createRouter({
    win,
    onChange(requested) {
      let route = requested;
      const game = GAME_OF_SCREEN[route.screen];
      // Nothing (or nothing sound) to resume: the setup screen says why.
      if (route.resume && !resumeUi.resumable(route.resume)) route = router.replace(SETUP_PATHS[route.resume]);
      // Only a Play link pressed starts a new match over an unfinished one.
      // A reload, a typed or bookmarked link, or Back/Forward to the same
      // kind of match resumes it; to another kind, the setup screen offers
      // it (Resume or Discard). Nothing is lost or swapped without asking.
      else if (game && !route.resume && !startingNew && resumeUi.resumable(game)) {
        route = router.replace(sameKind(game, route.args) ? RESUME_PATHS[game] : SETUP_PATHS[game]);
      }
      startingNew = false;
      nav.show(route.screen, ...(route.args ?? []));
      doc.title = documentTitle(route);
      if (firstRoute) {
        firstRoute = false;
        return;
      }
      // Move keyboard and screen-reader focus to the new screen.
      win.scrollTo(0, 0);
      focusScreen(route.screen);
    },
  });

  function focusScreen(screen) {
    if (screen === 'game-screen') view.focusBoard();
    else if (screen === 'al-game-screen') checkersView.focusBoard();
    else doc.getElementById(screen)?.querySelector('[tabindex="-1"]')?.focus();
  }

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
    'switch-sides': () => {
      session.switchSides();
      view.focusBoard();
    },
    'al-switch-sides': () => {
      checkers.switchSides();
      checkersView.focusBoard();
    },
    'sf-discard-resume': () => resumeUi.discard('shellsFeathers'),
    'al-discard-resume': () => resumeUi.discard('acornsLeaves'),
    'sf-skip-tutorial': () => {
      profile.setTutorial('shellsFeathers', 'skipped');
      showTutorialCard('shellsFeathers', 'sf');
    },
    'al-skip-tutorial': () => {
      profile.setTutorial('acornsLeaves', 'skipped');
      showTutorialCard('acornsLeaves', 'al');
    },
    'tutorial-next': () => tutorial.next(),
    'tutorial-skip': () => {
      tutorial.skip();
      router.up(SETUP_PATHS[tutorial.game]);
    },
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
    startingNew = /\/(play|fog)\/(single|two)$/.test(target);
    if (link.hasAttribute('data-back')) router.back(target);
    else if (link.hasAttribute('data-up')) router.up(target);
    else router.go(target);
  }

  function init() {
    doc.addEventListener('click', onClick);
    initHubChooser(doc, win, () => feedback.cue('button'));
    installDialogFocus(doc);
    // Each match menu has its own sound and motion controls.
    const menuSettings = (id) => createSoundMotion({
      doc, root: doc.getElementById(id).querySelector('[data-menu-view="settings"]'), win, profile, audio, haptics, feedback,
    });
    const sfSettings = menuSettings('sf-menu');
    const alSettings = menuSettings('al-menu');
    // The match menu holds the match, and any achievement notice with it.
    view.bindCells((index) => session.selectCell(index), {
      onPause: () => {
        session.pause();
        toast.hold('menu');
      },
      onResume: () => {
        session.resume();
        toast.release('menu');
      },
      onSettings: () => sfSettings.show(),
    });
    checkersView.bind({
      onSelect: (square) => checkers.selectSquare(square),
      onCancel: () => checkers.cancelSelection(),
      onPause: () => {
        checkers.pause();
        toast.hold('menu');
      },
      onResume: () => {
        checkers.resume();
        toast.release('menu');
      },
      onSettings: () => alSettings.show(),
    });
    openHelpWhereItFits();
    rescueFocusOnResize();
    sfSetup = initShellsFeathersSetup({ doc, profile, feedback });
    alSetup = initAcornsLeavesSetup({ doc, profile, feedback });
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
      if (doc.hidden) {
        toast.hold('hidden');
        audio.suspend();
      } else {
        toast.release('hidden');
        audio.resume();
      }
    });
    // Nothing moves or plays behind the start screen and the intro: a match
    // on screen (a resumed one, a deep link) waits, and so do notices.
    for (const game of [session, checkers]) game.pause('start');
    toast.hold('start');
    const gate = createStartGate({
      doc,
      win,
      // The intro sounds at the music's volume, or plays silently with music off.
      introOptions: () => {
        const { music, musicVolume } = profile.settings();
        return { muted: !music || musicVolume === 0, volume: musicVolume / 100 };
      },
      onReady() {
        for (const game of [session, checkers]) game.resume('start');
        toast.release('start');
        audio.startMusic();
        focusScreen(nav.current);
      },
    });
    gate.show();
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
