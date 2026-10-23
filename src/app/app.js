// Composes the app: shared services (storage, profile, audio), the screens and
// the Shells & Feathers session. Buttons declare `data-action`; one delegated
// listener runs the matching action.
import { openStorage } from '../shared/storage.js';
import { createProfile } from '../shared/profile.js';
import { createAudio } from '../shared/audio.js';
import { createNavigator } from './navigation.js';
import { initSettingsScreen } from './settings-screen.js';
import { createStatsScreen } from './stats-screen.js';
import { createShellsFeathersView } from '../games/shells-feathers/view.js';
import { createSession } from '../games/shells-feathers/session.js';

export function createApp({ doc, win }) {
  const profile = createProfile(openStorage(() => win.localStorage));
  const { sfx, music } = profile.settings();
  const audio = createAudio({ doc, clock: win, musicId: 'gameplay-music', sfxEnabled: sfx, musicEnabled: music });
  const view = createShellsFeathersView(doc);
  const session = createSession({ view, audio, profile, clock: win });
  const stats = createStatsScreen({ doc, profile, audio, confirm: (message) => win.confirm(message) });

  // While a match is on screen, touch drags don't scroll the page (v1 behavior).
  const blockTouchScroll = (event) => event.preventDefault();

  const nav = createNavigator(doc, {
    'start-screen': { enter: () => audio.startMusic() },
    'stats-screen': { enter: () => stats.render() },
    'game-screen': {
      enter(mode) {
        doc.addEventListener('touchmove', blockTouchScroll, { passive: false });
        session.enter(mode);
      },
      leave() {
        session.leave();
        doc.removeEventListener('touchmove', blockTouchScroll);
      },
    },
  });

  const go = (screenId, ...args) => {
    audio.playSfx('button-select');
    nav.show(screenId, ...args);
  };

  const actions = {
    'show-modes': () => go('game-mode-screen'),
    'show-settings': () => go('settings-screen'),
    'show-stats': () => go('stats-screen'),
    'show-start': () => go('start-screen'),
    'start-single': () => go('game-screen', 'single'),
    'start-two': () => go('game-screen', 'two'),
    'restart-match': () => session.restart(),
    'play-again': () => session.playAgain(),
    'reset-stats': () => stats.reset(),
  };

  function init() {
    doc.getElementById('game-container').addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (button) actions[button.dataset.action]?.();
    });
    view.bindCells((index) => session.selectCell(index));
    initSettingsScreen({ doc, profile, audio });
    stats.render();
    // Browsers only allow audio after a user gesture.
    doc.addEventListener('click', () => audio.startMusic(), { once: true });
    for (const note of profile.notes) console.info(`Spirit of the Woods: ${note}`);
  }

  return { init };
}
