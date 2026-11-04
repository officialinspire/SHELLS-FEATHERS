// What the player hears, feels and sees when something happens in a game,
// in one place: every game event is a cue, and each cue has at most one
// sound effect, one short vibration and one small animation.
//
// - Sounds go through audio.js, so the effects switch and volume apply, and
//   nothing plays before the first tap or key (audio.unlock()).
// - Vibration goes through haptics.js: off unless turned on, short, rate
//   limited, and only for the player's own actions, results and
//   achievements (`felt: false` for the Spirit's moves; nothing for hover or
//   ambient effects).
// - Animations are drawn by each game's view (setAnimator); they are
//   skipped under reduced motion. They are classes on squares, so they never
//   change the rules, block input or wait for anything.
// - The same cue (name + key) twice within DEDUPE_MS counts once, so two
//   listeners reporting one event can't double the feedback.
// - Restraint: taps are soft, events (captures, a reveal) a little more,
//   big moments (crowning, a result, an achievement) the most, and those
//   dip the music while they sound (`duck`; levels in audio.js MIX). An
//   achievement's chime waits for the sound of the move that earned it.
// - Delayed parts (`delay`, e.g. the chirp after a multi-jump) are queued on
//   the service's own timers. cancel() drops the queue, stops the match
//   effects already playing, stops any vibration and clears animations;
//   hold(reason) does that and ignores cues until release(reason) (the
//   match menu, a hidden page). The session cancels when a match ends,
//   restarts or is left. silence() stops only the sounds (the effects
//   switch turned off): vibration and animations are settings of their own.
//
// Fog of War: the session only names squares the player can see, and with
// two players sharing the device it uses one cue (`shared`) for every move.
export const DEDUPE_MS = 60;

export const CUES = {
  button: { sfx: 'button-select', match: false },
  newGame: { sfx: 'newgame-sound' },
  select: { sfx: 'select-sound', haptic: 6 },
  putBack: { sfx: 'select-sound' },
  place: { sfx: 'player-select', haptic: 10, motion: 'place' },
  placeOther: { sfx: 'opponent-select', haptic: 10, motion: 'place' },
  move: { sfx: 'piece-move', haptic: 10, motion: 'land' },
  moveOther: { sfx: 'piece-move-other', haptic: 10, motion: 'land' },
  shared: { sfx: 'piece-move', haptic: 10 },
  jump: { sfx: 'capture-sound', haptic: 12, motion: 'land' },
  capture: { sfx: 'capture-sound', haptic: 16, motion: 'capture' },
  multi: { sfx: 'multi-sound', delay: 150 },
  crown: {
    sfx: 'crown-sound', haptic: [10, 40, 16], motion: 'crown', duck: true,
  },
  invalid: {
    sfx: 'invalid-sound', haptic: 8, hapticEvery: 900, soundEvery: 250, motion: 'refuse',
  },
  reveal: { sfx: 'reveal-sound', haptic: 8, motion: 'found' },
  win: { sfx: 'victory-sound', haptic: [18, 60, 24] }, // the music stops for it
  loss: { sfx: 'loss-sound', haptic: 14, duck: true },
  draw: { sfx: 'draw-sound', haptic: 14, duck: true },
  achievement: {
    sfx: 'achievement-sound', haptic: [10, 40, 10], match: false, duck: true, delay: 600,
  },
};

export function createFeedback({
  audio, haptics = null, clock = globalThis, reducedMotion = () => false,
}) {
  const now = () => clock.performance?.now?.() ?? Date.now();
  const recent = new Map(); // `${name}:${key}` -> when
  const lastSound = new Map(); // sfx id -> when (soundEvery)
  const queued = new Set(); // timer ids
  const playing = new Set(); // match effects started
  const holds = new Set();
  const animators = new Map(); // game -> { play(motion, at), clear() }

  function sound(def) {
    if (!def.sfx) return;
    const at = now();
    if (def.soundEvery && at - (lastSound.get(def.sfx) ?? -Infinity) < def.soundEvery) return;
    lastSound.set(def.sfx, at);
    if (def.duck) audio.playSfx(def.sfx, { duck: true });
    else audio.playSfx(def.sfx);
    if (def.match !== false) playing.add(def.sfx);
  }

  function run(name, def, { at, felt = true }) {
    sound(def);
    if (felt && def.haptic) haptics?.pulse(def.haptic, { key: name, every: def.hapticEvery ?? 0 });
    if (def.motion && at && !reducedMotion()) animators.get(at.game)?.play(def.motion, at);
  }

  function silence() {
    for (const id of queued) clock.clearTimeout(id);
    queued.clear();
    for (const id of playing) audio.stopSfx(id);
    playing.clear();
  }

  function cancel() {
    silence();
    haptics?.cancel();
    for (const animator of animators.values()) animator.clear();
  }

  return {
    // name: a key of CUES. at: what the view animates (game-specific, only
    // what the player can see). key: tells one event from the next (a move
    // number, a square) for de-duplication. felt: false for moves the player
    // didn't make (the Spirit's).
    cue(name, { at = null, key = '', felt = true } = {}) {
      const def = CUES[name];
      if (!def || holds.size) return false;
      const id = `${name}:${key}`;
      const t = now();
      if (t - (recent.get(id) ?? -Infinity) < DEDUPE_MS) return false;
      recent.set(id, t);
      if (!def.delay) {
        run(name, def, { at, felt });
        return true;
      }
      const timer = clock.setTimeout(() => {
        queued.delete(timer);
        if (!holds.size) run(name, def, { at, felt });
      }, def.delay);
      queued.add(timer);
      return true;
    },
    // A game's view draws its animations: play(motion, at) with
    // at = { game, ... } as the session gave it.
    setAnimator(game, animator) {
      animators.set(game, animator);
    },
    cancel,
    silence,
    hold(reason) {
      holds.add(reason);
      cancel();
      haptics?.hold(reason);
    },
    release(reason) {
      holds.delete(reason);
      haptics?.release(reason);
    },
    get held() { return holds.size > 0; },
    get queuedCount() { return queued.size; },
  };
}

// For views: puts a one-off animation class on `el` (restarting it if it is
// already there) and takes it off when the animation ends, or after
// `maxMs` if none runs (reduced motion turns animations off in CSS too).
export function flashClass(el, className, clock = globalThis, maxMs = 800) {
  el.classList.remove(className);
  void el.offsetWidth; // let the browser see the class go, so it restarts
  el.classList.add(className);
  const done = () => {
    el.classList.remove(className);
    el.removeEventListener('animationend', onEnd);
  };
  const onEnd = (event) => {
    if (event.animationName) done();
  };
  el.addEventListener('animationend', onEnd);
  clock.setTimeout(done, maxMs);
}
