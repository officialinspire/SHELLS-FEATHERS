// Music and sound effects over the page's <audio> elements. Music has a single
// volume ramp at a time: starting a fade cancels the one in progress, so an
// old fade-out can no longer pause music that was just asked to play.
const MUSIC_VOLUME = 0.3;
const SFX_VOLUME = 0.5;
const FADE_MS = 1000;
const FADE_STEP_MS = 50;

export function createAudio({ doc, musicId, clock = globalThis, sfxEnabled = true, musicEnabled = true }) {
  let sfxOn = sfxEnabled;
  let musicOn = musicEnabled;
  let fadeTimer = null;

  const music = () => doc.getElementById(musicId);
  const play = (el) => { el.play()?.catch?.(() => {}); }; // blocked autoplay is retried on the next call

  function cancelFade() {
    if (fadeTimer === null) return;
    clock.clearInterval(fadeTimer);
    fadeTimer = null;
  }

  function rampMusic(el, target, onDone) {
    cancelFade();
    const step = MUSIC_VOLUME / (FADE_MS / FADE_STEP_MS);
    fadeTimer = clock.setInterval(() => {
      const delta = target - el.volume;
      if (Math.abs(delta) > step) {
        el.volume += Math.sign(delta) * step;
        return;
      }
      el.volume = target;
      cancelFade();
      onDone?.();
    }, FADE_STEP_MS);
  }

  function startMusic() {
    const el = music();
    if (!musicOn || !el) return;
    if (el.paused) {
      el.volume = 0;
      el.loop = true;
      play(el);
    }
    rampMusic(el, MUSIC_VOLUME);
  }

  function stopMusic() {
    const el = music();
    if (!el) return;
    if (el.paused) { cancelFade(); return; }
    rampMusic(el, 0, () => el.pause());
  }

  return {
    startMusic,
    stopMusic,
    playSfx(id) {
      const el = doc.getElementById(id);
      if (!sfxOn || !el) return;
      el.currentTime = 0;
      el.volume = SFX_VOLUME;
      play(el);
    },
    stopSfx(id) {
      const el = doc.getElementById(id);
      if (!el || el.paused) return;
      el.pause();
      el.currentTime = 0;
    },
    setSfxEnabled(on) { sfxOn = on; },
    setMusicEnabled(on) {
      musicOn = on;
      if (on) startMusic(); else stopMusic();
    },
  };
}
