// Music and sound effects over the page's <audio> elements.
//
// - Nothing plays until unlock(), which the app calls on the player's first
//   tap, click or key press: browsers refuse sound before that. Music asked
//   for earlier (startMusic) begins at that moment. The effects (marked
//   data-sfx, preload="none") are only fetched then too, so they never
//   compete with the page's own files while it loads.
// - play() may be refused. A refusal for lack of a user gesture
//   (NotAllowedError) locks audio again, and the next gesture retries the
//   music. An AbortError (a pause() that overtook a pending play()) is
//   expected and ignored. A refusal that arrives after a newer request is
//   ignored, so it can't undo that request. A missing or broken file just
//   stays silent: nothing waits for a sound.
// - One music element, one volume ramp at a time. Starting a fade cancels
//   the one in progress, so an old fade-out can never pause music that was
//   just asked to play. Fades follow the clock, not the element's volume
//   (which iOS never changes), along an S-curve, so starts and stops are
//   gentle and always finish.
// - The mix (MIX): the shipped files differ by over 15 dB, and the music is
//   mastered far louder than any effect. Each sound has a fixed gain so that
//   taps, events and big moments sit at their own levels, and the music bed
//   sits under them. The player's volumes (0–100, saved settings) scale
//   that; 0 means silent, and music at 0 is paused rather than played
//   silently. A big moment (a result, crowning, an achievement) dips the
//   music briefly (DUCK) so it is heard, then lets it back up.
// - Effects: a sound asked for again while it still rings plays on a second
//   voice (up to MAX_VOICES), instead of being cut off and restarted with a
//   click. Stopping an effect fades it out over EFFECT_FADE_MS.
// - Volumes where the page can't set them (iOS Safari: an element's volume
//   is read-only, always 1): the elements are routed through Web Audio gain
//   nodes instead, once the audio context runs (it starts on a gesture), so
//   the mix and the sliders work there too. Anywhere else, element volumes.
// - Turning effects off stops any that are playing (the victory theme lasts
//   half a minute); turning music off stops it at once, cancelling any fade.
//   suspend()/resume() pause the music while the page is hidden.
export const FADE_MS = 1000;
export const EFFECT_FADE_MS = 120;
export const MAX_VOICES = 3;
export const DUCK = { level: 0.5, attackMs: 120, releaseMs: 500, minMs: 400 };
const STEP_MS = 40;

// Gains measured from the files (loudest 100 ms, dBFS): taps land near
// -26 dB, events near -22 dB, big moments near -19 dB at full volume;
// sounds already quieter than their level keep 1. The music (median -14 dB)
// is brought down 8 dB, under the taps at the default volumes.
export const MIX = {
  music: 0.4,
  sfx: {
    'button-select': 0.26,
    'select-sound': 1,
    'invalid-sound': 1,
    'player-select': 0.4,
    'opponent-select': 0.7,
    'piece-move': 0.78,
    'piece-move-other': 1,
    'capture-sound': 0.89,
    'multi-sound': 0.79,
    'reveal-sound': 0.89,
    'newgame-sound': 0.88,
    'crown-sound': 0.79,
    'achievement-sound': 0.85,
    'loss-sound': 0.88,
    'draw-sound': 0.87,
    'victory-sound': 0.83,
  },
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const level = (percent) => clamp01((Number.isFinite(percent) ? percent : 0) / 100);
// 0 → 0, 1 → 1, easing in and out.
const sCurve = (p) => (1 - Math.cos(Math.PI * clamp01(p))) / 2;

// Sets element levels: the element's volume where the page can change it,
// else (iOS) a Web Audio gain node for the element.
function createGains(AudioContextClass) {
  let fixed = null; // the browser ignores element volume
  let ctx = null;
  const routes = new WeakMap(); // element -> GainNode, or null (couldn't route)

  const probe = (el) => {
    if (fixed !== null || !el) return;
    try {
      const before = el.volume;
      el.volume = 0.5;
      fixed = Math.abs(el.volume - 0.5) > 0.01;
      el.volume = before;
    } catch {
      fixed = false;
    }
  };

  return {
    // On a gesture (and when the page is shown again): start or resume the
    // audio context where it is needed.
    wake(el) {
      probe(el);
      if (!fixed || !AudioContextClass) return;
      try {
        ctx ??= new AudioContextClass();
        if (ctx.state !== 'running') ctx.resume?.()?.catch?.(() => {});
      } catch {
        ctx = null;
      }
    },
    set(el, value) {
      probe(el);
      if (fixed && ctx) {
        let gain = routes.get(el);
        // Routed only once the context runs: a routed element is silent
        // while it doesn't, so until then it plays as it is.
        if (gain === undefined && ctx.state === 'running') {
          try {
            const source = ctx.createMediaElementSource(el);
            gain = ctx.createGain();
            source.connect(gain);
            gain.connect(ctx.destination);
          } catch {
            gain = null;
          }
          routes.set(el, gain);
        }
        if (gain) {
          gain.gain.value = value;
          return;
        }
      }
      try {
        el.volume = value;
      } catch { /* out of range, or read-only */ }
    },
    get routed() { return Boolean(fixed && ctx); },
  };
}

export function createAudio({
  doc, musicId, clock = globalThis, win = globalThis, mix = MIX,
  sfxEnabled = true, musicEnabled = true, sfxVolume = 50, musicVolume = 30,
}) {
  let sfxOn = sfxEnabled;
  let musicOn = musicEnabled;
  let sfxLevel = level(sfxVolume);
  let musicLevel = level(musicVolume);
  let unlocked = false;
  let musicWanted = false; // the game wants music now (it stops for a result)
  let suspended = false; // the page is hidden
  let musicValue = 0; // where the music's ramp is, 0..musicLevel
  let fade = null; // { timer, from, to, start, ms, onDone }
  let attempt = 0; // increases with every music play() request
  let duck = 1; // the music's dip under a big moment, DUCK.level..1
  let duckUntil = 0;
  let duckTimer = null;
  const voices = new Map(); // sfx id -> its elements (the page's, then copies)
  const fading = new Map(); // effect element -> fade-out timer
  const gains = createGains(win.AudioContext ?? win.webkitAudioContext);
  const now = () => clock.performance?.now?.() ?? Date.now();

  const music = () => doc.getElementById(musicId);
  const shouldPlayMusic = () => unlocked && musicOn && musicWanted && !suspended && musicLevel > 0;
  const sfxGain = (id) => sfxLevel * (mix.sfx?.[id] ?? 1);

  function applyMusic() {
    const el = music();
    if (el) gains.set(el, clamp01(musicValue * (mix.music ?? 1) * duck));
  }

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

  // Ramps the music to `target` over FADE_MS, then calls onDone.
  function rampMusic(target, onDone) {
    cancelFade();
    const ramp = {
      from: musicValue, to: target, start: now(), ms: FADE_MS, onDone,
    };
    ramp.timer = clock.setInterval(() => {
      const p = (now() - ramp.start) / ramp.ms;
      musicValue = p >= 1 ? ramp.to : ramp.from + (ramp.to - ramp.from) * sCurve(p);
      applyMusic();
      if (p < 1) return;
      cancelFade();
      ramp.onDone?.();
    }, STEP_MS);
    fade = ramp;
  }

  function playMusic() {
    const el = music();
    if (!el || !shouldPlayMusic()) return;
    if (el.paused) {
      cancelFade();
      musicValue = 0;
      applyMusic();
      el.loop = true;
      const mine = ++attempt;
      tryPlay(el, (err) => {
        if (mine !== attempt || err?.name === 'AbortError') return;
        blocked(err);
        cancelFade();
        musicValue = 0;
        applyMusic();
      });
    } else if (!fade && musicValue === musicLevel) {
      return; // already playing, steady
    }
    rampMusic(musicLevel);
  }

  // Fades the music out and pauses it; `immediately` skips the fade.
  function quietMusic({ immediately = false } = {}) {
    const el = music();
    if (!el) return;
    attempt++; // any refusal still on its way is now stale
    if (el.paused || immediately) {
      cancelFade();
      if (!el.paused) el.pause();
      musicValue = 0;
      return;
    }
    rampMusic(0, () => el.pause());
  }

  // The music dips for `ms`, then comes back up.
  function duckMusic(ms) {
    const el = music();
    if (!el || el.paused) return;
    duckUntil = Math.max(duckUntil, now() + Math.max(ms, DUCK.minMs));
    if (duckTimer) return;
    duckTimer = clock.setInterval(() => {
      const down = now() < duckUntil;
      const range = 1 - DUCK.level;
      duck = down
        ? Math.max(DUCK.level, duck - (range * STEP_MS) / DUCK.attackMs)
        : Math.min(1, duck + (range * STEP_MS) / DUCK.releaseMs);
      applyMusic();
      if (!down && duck === 1) {
        clock.clearInterval(duckTimer);
        duckTimer = null;
      }
    }, STEP_MS);
  }

  // Fetches every effect once, at the first gesture.
  let effectsLoading = false;
  function loadEffects() {
    if (effectsLoading) return;
    effectsLoading = true;
    for (const el of doc.querySelectorAll?.('audio[data-sfx]') ?? []) {
      el.preload = 'auto';
      el.load?.();
    }
  }

  // An element to play `id` on: a free voice, a new copy, or (all busy)
  // the one furthest along.
  function voiceFor(id) {
    const base = doc.getElementById(id);
    if (!base) return null;
    let list = voices.get(id);
    if (!list) {
      list = [base];
      voices.set(id, list);
    }
    const free = list.find((el) => (el.paused || el.ended) && !fading.has(el));
    if (free) return free;
    if (list.length < MAX_VOICES && typeof base.cloneNode === 'function') {
      const copy = base.cloneNode(true);
      list.push(copy);
      return copy;
    }
    return list.reduce((a, b) => ((b.currentTime ?? 0) > (a.currentTime ?? 0) ? b : a));
  }

  function endFade(el) {
    const timer = fading.get(el);
    if (timer === undefined) return;
    clock.clearInterval(timer);
    fading.delete(el);
  }

  // Fades one effect out quickly and rewinds it.
  function stopVoice(el) {
    if (el.paused || fading.has(el)) return;
    const from = sfxGain(el.id);
    const start = now();
    const timer = clock.setInterval(() => {
      const p = (now() - start) / EFFECT_FADE_MS;
      if (p < 1) {
        gains.set(el, clamp01(from * (1 - sCurve(p))));
        return;
      }
      endFade(el);
      el.pause();
      el.currentTime = 0;
    }, STEP_MS / 2);
    fading.set(el, timer);
  }

  function stopEffects() {
    for (const list of voices.values()) for (const el of list) stopVoice(el);
    duckUntil = 0;
  }

  return {
    // A user gesture: sound may play from now on (and the audio context
    // wakes, where one is used).
    unlock() {
      gains.wake(music());
      if (unlocked) return;
      unlocked = true;
      loadEffects();
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
    // duck: a big moment, heard over the music.
    playSfx(id, { duck: dip = false } = {}) {
      if (!unlocked || !sfxOn || sfxLevel === 0) return;
      const el = voiceFor(id);
      if (!el) return;
      endFade(el);
      el.currentTime = 0;
      gains.set(el, clamp01(sfxGain(id)));
      tryPlay(el, (err) => { if (err?.name !== 'AbortError') blocked(err); });
      if (dip) duckMusic(Number.isFinite(el.duration) ? el.duration * 1000 : 1000);
    },
    stopSfx(id) {
      for (const el of voices.get(id) ?? []) stopVoice(el);
      duckUntil = 0;
    },
    stopEffects,
    setSfxEnabled(on) {
      sfxOn = on;
      if (!on) stopEffects();
    },
    // Muting is immediate: any fade in progress is cancelled.
    setMusicEnabled(on) {
      musicOn = on;
      if (!on) {
        quietMusic({ immediately: true });
        return;
      }
      musicWanted = true; // turning music on asks for it now
      playMusic();
    },
    setSfxVolume(percent) {
      sfxLevel = level(percent);
      if (sfxLevel === 0) {
        stopEffects();
        return;
      }
      for (const [id, list] of voices) {
        for (const el of list) if (!el.paused && !fading.has(el)) gains.set(el, clamp01(sfxGain(id)));
      }
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
      } else if (fade && fade.to > 0) {
        rampMusic(musicLevel); // fading in: aim for the new level
      } else if (!fade) {
        musicValue = musicLevel;
        applyMusic();
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
      gains.wake(music());
      playMusic();
    },
    // For tests and Settings: the music's level now (0–1, before the mix).
    get musicLevel() { return musicValue; },
  };
}
