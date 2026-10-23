// Composes the app: shared services (storage, profile, audio), the router and
// screens, and the Shells & Feathers session.
//
// Navigation uses real links (href="#/..."). A click on one is routed in-page
// (with a history entry, so Back/Forward work); `data-up` and `data-back`
// links step back through history when that leads to the same screen.
// Buttons that act on the current screen declare `data-action`.
import { openStorage } from '../shared/storage.js';
import { createProfile } from '../shared/profile.js';
import { createAudio } from '../shared/audio.js';
import { createNavigator } from './navigation.js';
import { createRouter, documentTitle } from './router.js';
import { initSettingsScreen } from './settings-screen.js';
import { createPathScreen } from './path-screen.js';
import { createShellsFeathersView } from '../games/shells-feathers/view.js';
import { createSession } from '../games/shells-feathers/session.js';
import { initShellsFeathersSetup } from '../games/shells-feathers/setup.js';
import { renderStartingPosition } from '../games/acorns-leaves/preview-board.js';

export function createApp({ doc, win }) {
  const profile = createProfile(openStorage(() => win.localStorage));
  const { sfx, music } = profile.settings();
  const audio = createAudio({ doc, clock: win, musicId: 'gameplay-music', sfxEnabled: sfx, musicEnabled: music });
  const view = createShellsFeathersView(doc);
  const session = createSession({ view, audio, profile, clock: win });
  const path = createPathScreen({ doc, profile, audio, confirm: (message) => win.confirm(message) });
  let firstRoute = true;

  const nav = createNavigator(doc, {
    // Returning to the hub restarts the music (as v1's home screen did); the
    // first page load waits for a click, since browsers block autoplay.
    'hub-screen': { enter: () => { if (!firstRoute) audio.startMusic(); } },
    'path-screen': { enter: () => path.render() },
    'game-screen': {
      enter: (mode) => session.enter(mode),
      leave: () => session.leave(),
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
      else doc.getElementById(route.screen).querySelector('[tabindex="-1"]')?.focus();
    },
  });

  const actions = {
    'restart-match': () => session.restart(),
    'play-again': () => session.playAgain(),
    'view-board': () => view.dismissResult(),
    'reset-stats': () => path.reset(),
  };

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
    audio.playSfx('button-select');
    const target = link.getAttribute('href').slice(1);
    if (link.hasAttribute('data-back')) router.back(target);
    else if (link.hasAttribute('data-up')) router.up(target);
    else router.go(target);
  }

  function init() {
    doc.addEventListener('click', onClick);
    view.bindCells((index) => session.selectCell(index));
    initShellsFeathersSetup({ doc, profile, audio });
    initSettingsScreen({ doc, profile, audio });
    for (const board of doc.querySelectorAll('[data-checkers-preview]')) renderStartingPosition(board);
    path.render();
    // Browsers only allow audio after a user gesture.
    doc.addEventListener('click', () => audio.startMusic(), { once: true });
    router.start();
    for (const note of profile.notes) console.info(`Spirit of the Woods: ${note}`);
  }

  return { init };
}
