// Music and sound effects over the page's <audio> elements.
//
// - Nothing plays until unlock(), which the app calls on the player's first
//   tap, click or key press: browsers refuse sound before that. Music asked
//   for earlier (startMusic) begins at that moment.
// - play() may be refused. A refusal for lack of a user gesture
//   (NotAllowedError) locks audio again, and the next gesture retries the
//   music. An AbortError (a pause() that overtook a pending play()) is
//   expected and ignored. A refusal that arrives after a newer request is
//   ignored, so it can't undo that request.
// - Music has a single volume ramp at a time. Starting a fade cancels the one
//   in progress, so an old fade-out can never pause music that was just
//   asked to play. Changing the music volume mid-fade retargets the fade.
// - Volumes are 0–100 (the saved settings); 0 means silent, and music at 0
//   is paused rather than played silently.
// - Turning effects off stops any that are playing (the victory theme lasts
//   half a minute). suspend()/resume() pause the music while the page is
//   hidden.
const FADE_MS = 1000;
const FADE_STEP_MS = 50;

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const level = (percent) => clamp01((Number.isFinite(percent) ? percent : 0) / 100);

export function createAudio({
  doc, musicId, clock = globalThis,
  sfxEnabled = true, musicEnabled = true, sfxVolume = 50, musicVolume = 30,
}) {
  let sfxOn = sfxEnabled;
  let musicOn = musicEnabled;
  let sfxLevel = level(sfxVolume);
  let musicLevel = level(musicVolume);
  let unlocked = false;
  let musicWanted = false; // the game wants music now (it stops for a result)
  let suspended = false; // the page is hidden
  let fade = null; // { timer, target, step, onDone }
  let attempt = 0; // increases with every music play() request
  const effects = new Set(); // effect elements played so far

  const music = () => doc.getElementById(musicId);
  const shouldPlayMusic = () => unlocked && musicOn && musicWanted && !suspended && musicLevel > 0;

  // Calls el.play(), reporting a refusal to `refused` (old browsers return
  // nothing, and some throw instead of rejecting).
  function tryPlay(el, refused) {
    let result;
    try {
      result = el.play();
    } catch (err) {
      refused(err);
      return;
    }
    if (result && typeof result.then === 'function') result.then(undefined, refused);
  }

  function blocked(err) {
    if (err?.name === 'NotAllowedError') unlocked = false;
  }

  function cancelFade() {
    if (!fade) return;
    clock.clearInterval(fade.timer);
    fade = null;
  }

  // Ramps the music to `target` over about a second, then calls onDone.
  function rampMusic(el, target, onDone) {
    cancelFade();
    const step = Math.max(Math.abs(target - el.volume), musicLevel, 0.05) / (FADE_MS / FADE_STEP_MS);
    const timer = clock.setInterval(() => {
      const delta = fade.target - el.volume;
      if (Math.abs(delta) > fade.step) {
        el.volume = clamp01(el.volume + Math.sign(delta) * fade.step);
        return;
      }
      el.volume = clamp01(fade.target);
      const done = fade.onDone;
      cancelFade();
      done?.();
    }, FADE_STEP_MS);
    fade = { timer, target, step, onDone };
  }

  function playMusic() {
    const el = music();
    if (!el || !shouldPlayMusic()) return;
    if (el.paused) {
      el.volume = 0;
      el.loop = true;
      const mine = ++attempt;
      tryPlay(el, (err) => {
        if (mine !== attempt || err?.name === 'AbortError') return;
        blocked(err);
        cancelFade();
        el.volume = 0;
      });
    }
    rampMusic(el, musicLevel);
  }

  // Fades the music out and pauses it; `immediately` skips the fade.
  function quietMusic({ immediately = false } = {}) {
    const el = music();
    if (!el) return;
    attempt++; // any refusal still on its way is now stale
    if (el.paused || immediately) {
      cancelFade();
      if (!el.paused) el.pause();
      return;
    }
    rampMusic(el, 0, () => el.pause());
  }

  function stopEffects() {
    for (const el of effects) {
      if (el.paused) continue;
      el.pause();
      el.currentTime = 0;
    }
  }

  return {
    // The first user gesture: sound may play from now on.
    unlock() {
      if (unlocked) return;
      unlocked = true;
      playMusic();
    },
    get unlocked() { return unlocked; },
    startMusic() {
      musicWanted = true;
      playMusic();
    },
    stopMusic() {
      musicWanted = false;
      quietMusic();
    },
    playSfx(id) {
      const el = doc.getElementById(id);
      if (!el || !unlocked || !sfxOn || sfxLevel === 0) return;
      effects.add(el);
      el.currentTime = 0;
      el.volume = sfxLevel;
      tryPlay(el, (err) => { if (err?.name !== 'AbortError') blocked(err); });
    },
    stopSfx(id) {
      const el = doc.getElementById(id);
      if (!el || el.paused) return;
      el.pause();
      el.currentTime = 0;
    },
    stopEffects,
    setSfxEnabled(on) {
      sfxOn = on;
      if (!on) stopEffects();
    },
    setMusicEnabled(on) {
      musicOn = on;
      if (!on) {
        quietMusic();
        return;
      }
      musicWanted = true; // turning music on asks for it now
      playMusic();
    },
    setSfxVolume(percent) {
      sfxLevel = level(percent);
      for (const el of effects) if (!el.paused) el.volume = sfxLevel;
      if (sfxLevel === 0) stopEffects();
    },
    setMusicVolume(percent) {
      musicLevel = level(percent);
      const el = music();
      if (!el) return;
      if (musicLevel === 0) {
        quietMusic({ immediately: true });
        return;
      }
      if (el.paused) {
        playMusic();
      } else if (fade && fade.target > 0) {
        fade.target = musicLevel; // fading in: aim for the new level
      } else if (!fade) {
        el.volume = musicLevel;
      }
    },
    // The page is hidden: pause the music at once. Back in view: fade it in
    // again if it was wanted.
    suspend() {
      suspended = true;
      quietMusic({ immediately: true });
    },
    resume() {
      suspended = false;
      playMusic();
    },
  };
}
