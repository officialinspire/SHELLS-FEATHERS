// Sound and motion controls, wherever they appear: on the Settings screen
// and in each match menu's Settings view (so they can be changed without
// leaving a paused match). A set of controls is found inside `root` by its
// data-setting attribute:
//   music / sfx                  switches (checkboxes)
//   musicVolume / sfxVolume      volume sliders, with [data-setting-value]
//                                outputs showing the percentage
//   motion                       radios: system | reduce | full, with a
//                                [data-setting-hint="motion"] line
//   haptics                      switch, with a [data-setting-hint="haptics"]
//                                line saying honestly whether this browser
//                                can vibrate (the switch is disabled where it
//                                can't)
// Every change applies at once and is saved. show() reads the saved settings
// back into the controls (each set shows the latest, whichever set changed
// them). Motion is applied as <html data-motion="system|reduce|full">, which
// styles.css reads.
export const HAPTICS_HINTS = {
  unsupported: 'Not available here: this browser can’t vibrate (Safari on iPhone and iPad, and most desktop browsers, have no vibration). The games play the same without it.',
  available: 'Short, gentle taps for your own moves, captures, crowning, a refused move, results and achievements. Only devices with a vibration motor can be felt, and the device’s own settings can still turn it off.',
  refused: 'The browser declined to vibrate just now (it may need a tap on the page first, or vibration is off on this device). The games play the same without it.',
};

const MOTION_HINTS = {
  reduce: 'Reduce: no animations or eased changes in any game.',
  full: 'Full: gentle animations even if your device asks for less motion.',
};

export function applyMotion(doc, motion) {
  doc.documentElement.dataset.motion = motion;
}

export function createSoundMotion({
  doc, root, win, profile, audio, haptics = null, feedback = null, onSaved = () => {},
}) {
  const find = (name) => root.querySelector(`[data-setting="${name}"]`);
  const sfxToggle = find('sfx');
  const musicToggle = find('music');
  const sfxVolume = find('sfxVolume');
  const musicVolume = find('musicVolume');
  const motionInputs = [...root.querySelectorAll('[data-setting="motion"]')];
  const motionHint = root.querySelector('[data-setting-hint="motion"]');
  const hapticsToggle = find('haptics');
  const hapticsHint = root.querySelector('[data-setting-hint="haptics"]');
  const deviceQuery = win.matchMedia?.('(prefers-reduced-motion: reduce)');

  const showPercent = (input) => {
    root.querySelector(`[data-setting-value="${input.dataset.setting}"]`).textContent = `${input.value}%`;
    input.setAttribute('aria-valuetext', `${input.value}%`);
  };

  function showMotionHint(motion) {
    motionHint.textContent = motion === 'system'
      ? `Match device: your device ${deviceQuery?.matches ? 'asks for reduced motion, so the games keep still' : 'allows motion, so the games use gentle animations'}.`
      : MOTION_HINTS[motion];
  }

  function showHaptics() {
    if (!hapticsToggle) return;
    const supported = Boolean(haptics?.supported);
    hapticsToggle.disabled = !supported;
    hapticsToggle.checked = supported && profile.settings().haptics;
    hapticsHint.textContent = !supported ? HAPTICS_HINTS.unsupported
      : haptics.status === 'refused' ? HAPTICS_HINTS.refused : HAPTICS_HINTS.available;
  }

  function show() {
    const settings = profile.settings();
    showHaptics();
    sfxToggle.checked = settings.sfx;
    musicToggle.checked = settings.music;
    sfxVolume.value = String(settings.sfxVolume);
    musicVolume.value = String(settings.musicVolume);
    showPercent(sfxVolume);
    showPercent(musicVolume);
    for (const input of motionInputs) input.checked = input.value === settings.motion;
    showMotionHint(settings.motion);
    applyMotion(doc, settings.motion);
  }

  sfxToggle.addEventListener('change', () => {
    profile.updateSettings({ sfx: sfxToggle.checked });
    audio.setSfxEnabled(sfxToggle.checked);
    if (sfxToggle.checked) audio.playSfx('button-select');
    else feedback?.cancel(); // muted: nothing queued plays later
    onSaved();
  });

  // Turning vibration on gives one short sample (this is a tap, so the
  // browser allows it), and the hint says if the browser declined.
  hapticsToggle?.addEventListener('change', () => {
    profile.updateSettings({ haptics: hapticsToggle.checked });
    haptics?.setEnabled(hapticsToggle.checked);
    if (hapticsToggle.checked) haptics?.pulse(12);
    showHaptics();
    onSaved();
  });

  musicToggle.addEventListener('change', () => {
    profile.updateSettings({ music: musicToggle.checked });
    audio.setMusicEnabled(musicToggle.checked);
    onSaved();
  });

  // Volumes follow the slider as it moves; the value is saved when it is let
  // go, and the effects volume plays a sample then.
  musicVolume.addEventListener('input', () => {
    showPercent(musicVolume);
    audio.setMusicVolume(Number(musicVolume.value));
  });
  musicVolume.addEventListener('change', () => {
    profile.updateSettings({ musicVolume: Number(musicVolume.value) });
    onSaved();
  });
  sfxVolume.addEventListener('input', () => {
    showPercent(sfxVolume);
    audio.setSfxVolume(Number(sfxVolume.value));
  });
  sfxVolume.addEventListener('change', () => {
    profile.updateSettings({ sfxVolume: Number(sfxVolume.value) });
    if (Number(sfxVolume.value) === 0) feedback?.cancel();
    else audio.playSfx('button-select');
    onSaved();
  });

  for (const input of motionInputs) {
    input.addEventListener('change', () => {
      profile.updateSettings({ motion: input.value });
      applyMotion(doc, input.value);
      showMotionHint(input.value);
      audio.playSfx('button-select');
      onSaved();
    });
  }
  deviceQuery?.addEventListener?.('change', () => showMotionHint(profile.settings().motion));

  return { show };
}
