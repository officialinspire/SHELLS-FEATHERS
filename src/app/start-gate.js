// Touch to start, then the INSPIRE intro, then the game: the same opening as
// every INSPIRE game (Bird Mahjong, Emoji Elements).
//
// - Every page load opens on the start screen ("Touch, click, or press any
//   key to start"). The page behind it is inert, and a match already on
//   screen (a resumed one, or a deep link) is held until the start is over.
// - That first tap or key is also the gesture that lets the browser play
//   sound, so the intro (src/app/intro.js, once per browser session) plays
//   with sound, at the music setting's volume, or silently if music is off.
// - The music starts when the game appears after the intro (or straight
//   after the start tap when the intro was already seen this session),
//   never under the intro.
// - The intro never traps anyone: Skip (button, Escape, Enter, Space), its
//   end, an error, a stall or a hidden page all go on to the game.
import { createIntro } from './intro.js';

export const INTRO_SRC = 'inspiresoftwareintro.mp4';

export function createStartGate({
  doc, win, onReady, introOptions = () => ({}), introDeps = {},
}) {
  const byId = (id) => doc.getElementById(id);
  const gate = byId('start-gate');
  const introScreen = byId('intro-gate');
  const main = byId('game-container');
  let state = 'start'; // 'start' | 'intro' | 'ready'

  const intro = createIntro({
    video: byId('intro-video'),
    skipButton: byId('intro-skip'),
    src: INTRO_SRC,
    onDone: () => ready(),
    ...introDeps,
  });

  function ready() {
    if (state === 'ready') return;
    state = 'ready';
    gate.hidden = true;
    introScreen.hidden = true;
    main.inert = false;
    doc.documentElement.dataset.gate = 'ready';
    onReady();
  }

  // The first tap, click or key.
  function start() {
    if (state !== 'start') return;
    gate.hidden = true;
    if (!intro.pending()) {
      ready();
      return;
    }
    state = 'intro';
    doc.documentElement.dataset.gate = 'intro';
    introScreen.hidden = false;
    byId('intro-skip').focus({ preventScroll: true });
    intro.play(introOptions());
  }

  gate.addEventListener('click', start);
  doc.addEventListener('keydown', (event) => {
    if (state === 'intro') {
      // Skip with Escape, Enter or Space; a held key's repeats don't count.
      if (!event.repeat && ['Escape', 'Enter', ' '].includes(event.key)) {
        event.preventDefault();
        event.stopPropagation();
        intro.skip();
      }
      return;
    }
    if (state !== 'start' || event.repeat) return;
    if (event.key === 'Tab' || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    event.stopPropagation();
    start();
  }, { capture: true });
  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden) intro.finish('hidden'); // no intro in a background tab
  });

  return {
    // Shows the start screen over the page (at load).
    show() {
      state = 'start';
      gate.hidden = false;
      introScreen.hidden = true;
      main.inert = true;
      doc.documentElement.dataset.gate = 'start';
      win.requestAnimationFrame?.(() => byId('start-button').focus({ preventScroll: true }));
    },
    start,
    get state() { return state; },
    intro,
  };
}
