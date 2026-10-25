// A small notice at the top of the screen for an achievement unlocked during
// play ("Achievement unlocked: Crowned"). It never takes focus or blocks a
// tap (taps pass through it), is read out by screen readers through a polite
// live region, and goes away by itself. Several notices queue.
const SHOW_MS = 4500;

export function createToast({ doc, clock = globalThis, audio }) {
  const region = doc.getElementById('toast-region');
  const card = doc.getElementById('toast');
  const text = doc.getElementById('toast-text');
  const queue = [];
  let timer = null;

  function next() {
    timer = null;
    const message = queue.shift();
    if (message === undefined) {
      card.hidden = true;
      text.textContent = '';
      region.dataset.state = 'idle';
      return;
    }
    text.textContent = message;
    card.hidden = false;
    region.dataset.state = 'showing';
    timer = clock.setTimeout(next, SHOW_MS);
  }

  return {
    // achievements: [{ title, description }]
    achievements(list) {
      if (!list.length) return;
      for (const { title, description } of list) queue.push(`Achievement unlocked: ${title}. ${description}`);
      audio?.playSfx('achievement-sound');
      if (timer === null) next();
    },
    clear() {
      queue.length = 0;
      if (timer !== null) clock.clearTimeout(timer);
      next();
    },
  };
}
