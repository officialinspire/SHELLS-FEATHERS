// Notices for achievements unlocked during play ("Unlocked: Crowned").
//
// A notice takes the place of the match line in the match header (the line
// naming the mode and difficulty), in that line's own box: it never covers
// the board, the Menu button, the turn chips or the guidance, on a phone or
// beside the board on a wide screen. It never takes focus and can't be
// tapped. Screen readers hear the whole achievement through a polite live
// region outside the match screens.
//
// Several notices queue and show one at a time. While the match is held
// (its menu open, or the page hidden) the current notice stays and its time
// stands still; leaving the match drops the queue (everything stays in the
// journal). One chime per batch, through the feedback service.
//
// Achievements unlocked by a result are listed in the result dialog instead.
export const NOTICE = { SHOW_MS: 4000, GAP_MS: 350 };

export function createToast({ doc, clock = globalThis, feedback }) {
  const live = doc.getElementById('notice-status');
  const queue = [];
  const holds = new Set();
  let showing = null; // { prefix } while a notice is up
  let timer = null;
  let left = 0; // time left on the current step while held
  let step = null; // what the timer runs next
  let startedAt = 0;
  const now = () => clock.performance?.now?.() ?? Date.now();

  const parts = (prefix) => ({
    slot: doc.getElementById(`${prefix}-notice-slot`),
    notice: doc.getElementById(`${prefix}-notice`),
    text: doc.getElementById(`${prefix}-notice-text`),
    icon: doc.getElementById(`${prefix}-notice-icon`),
  });

  function wait(ms, then) {
    step = then;
    left = ms;
    if (holds.size) return;
    run();
  }

  function run() {
    startedAt = now();
    timer = clock.setTimeout(() => {
      timer = null;
      left = 0;
      const then = step;
      step = null;
      then();
    }, left);
  }

  function hide() {
    if (!showing) return;
    const { slot, notice } = parts(showing.prefix);
    slot?.classList.remove('is-noticing');
    if (notice) notice.hidden = true;
    showing = null;
  }

  function next() {
    const item = queue.shift();
    if (!item) return;
    const { slot, notice, text, icon } = parts(item.prefix);
    if (!slot) {
      next();
      return;
    }
    text.textContent = `Unlocked: ${item.title}`;
    icon.setAttribute('href', `#${item.icon}`);
    notice.hidden = false;
    slot.classList.add('is-noticing');
    live.textContent = `Achievement unlocked: ${item.title}. ${item.description}`;
    showing = { prefix: item.prefix };
    wait(NOTICE.SHOW_MS, () => {
      hide();
      if (queue.length) wait(NOTICE.GAP_MS, next);
    });
  }

  return {
    // prefix: the match screen ('sf' or 'al'); achievements: [{ title, description, icon }]
    achievements(prefix, list) {
      if (!list.length) return;
      for (const { title, description, icon } of list) queue.push({ prefix, title, description, icon });
      feedback?.cue('achievement', { key: list.map((a) => a.title).join() });
      if (!showing && !step) next();
    },
    // The match is paused (menu, hidden page): time stands still.
    hold(reason) {
      if (!holds.size && timer !== null) {
        clock.clearTimeout(timer);
        left = Math.max(0, left - (now() - startedAt));
        timer = null;
      }
      holds.add(reason);
    },
    release(reason) {
      holds.delete(reason);
      if (!holds.size && step && timer === null) run();
    },
    // Leaving the match: nothing more is shown.
    clear() {
      queue.length = 0;
      if (timer !== null) clock.clearTimeout(timer);
      timer = null;
      step = null;
      left = 0;
      hide();
    },
    get showing() { return showing?.prefix ?? null; },
    get queued() { return queue.length; },
  };
}
