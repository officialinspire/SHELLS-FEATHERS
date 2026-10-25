// Settings: what every game shares. Music and sound effects (each with an
// on/off switch and its own volume), motion (follow the device, reduce or
// full), and deleting all saved data. Each game's own options (pieces, side,
// rules, difficulty) stay on that game's setup screen.
//
// Every change applies at once and is saved. Motion is applied as
// <html data-motion="system|reduce|full">, which styles.css reads.
const MOTION_HINTS = {
  reduce: 'Reduce: no animations or eased changes in any game.',
  full: 'Full: gentle animations even if your device asks for less motion.',
};

export function applyMotion(doc, motion) {
  doc.documentElement.dataset.motion = motion;
}

export function initSettingsScreen({ doc, win, profile, audio, confirmDialog, onDeletedAll }) {
  const byId = (id) => doc.getElementById(id);
  const sfxToggle = byId('audio-toggle');
  const musicToggle = byId('music-toggle');
  const sfxVolume = byId('sfx-volume');
  const musicVolume = byId('music-volume');
  const motionInputs = [...doc.querySelectorAll('input[name="motion"]')];
  const motionHint = byId('motion-hint');
  const deviceQuery = win.matchMedia?.('(prefers-reduced-motion: reduce)');

  const showPercent = (input) => {
    byId(`${input.id}-value`).textContent = `${input.value}%`;
    input.setAttribute('aria-valuetext', `${input.value}%`);
  };

  function showMotionHint(motion) {
    motionHint.textContent = motion === 'system'
      ? `Match device: your device ${deviceQuery?.matches ? 'asks for reduced motion, so the games keep still' : 'allows motion, so the games use gentle animations'}.`
      : MOTION_HINTS[motion];
  }

  function show() {
    const settings = profile.settings();
    sfxToggle.checked = settings.sfx;
    musicToggle.checked = settings.music;
    sfxVolume.value = String(settings.sfxVolume);
    musicVolume.value = String(settings.musicVolume);
    showPercent(sfxVolume);
    showPercent(musicVolume);
    for (const input of motionInputs) input.checked = input.value === settings.motion;
    showMotionHint(settings.motion);
    applyMotion(doc, settings.motion);
    showStorage();
  }

  function showStorage() {
    byId('settings-storage-note').hidden = !profile.saveFailing();
  }

  sfxToggle.addEventListener('change', () => {
    profile.updateSettings({ sfx: sfxToggle.checked });
    audio.setSfxEnabled(sfxToggle.checked);
    if (sfxToggle.checked) audio.playSfx('button-select');
    showStorage();
  });

  musicToggle.addEventListener('change', () => {
    profile.updateSettings({ music: musicToggle.checked });
    audio.setMusicEnabled(musicToggle.checked);
    showStorage();
  });

  // Volumes follow the slider as it moves; the value is saved when it is let
  // go, and the effects volume plays a sample then.
  musicVolume.addEventListener('input', () => {
    showPercent(musicVolume);
    audio.setMusicVolume(Number(musicVolume.value));
  });
  musicVolume.addEventListener('change', () => {
    profile.updateSettings({ musicVolume: Number(musicVolume.value) });
    showStorage();
  });
  sfxVolume.addEventListener('input', () => {
    showPercent(sfxVolume);
    audio.setSfxVolume(Number(sfxVolume.value));
  });
  sfxVolume.addEventListener('change', () => {
    profile.updateSettings({ sfxVolume: Number(sfxVolume.value) });
    audio.playSfx('button-select');
    showStorage();
  });

  for (const input of motionInputs) {
    input.addEventListener('change', () => {
      profile.updateSettings({ motion: input.value });
      applyMotion(doc, input.value);
      showMotionHint(input.value);
      audio.playSfx('button-select');
      showStorage();
    });
  }
  deviceQuery?.addEventListener?.('change', () => showMotionHint(profile.settings().motion));

  async function deleteAll() {
    const agreed = await confirmDialog.ask({
      title: 'Delete all saved data?',
      deletes: [
        'Every Shells & Feathers and Acorns & Leaves record, Classic and Fog of War, against the Spirit and two-player.',
        'Every achievement in both games.',
        'Your choices on each game’s screen: pieces, side, rules and difficulty.',
        'These settings: sound, volumes and motion go back to their defaults.',
        'The record kept by the first version of the game (spiritOfTheWoodsStats), and any damaged copies set aside.',
      ],
      keeps: ['Nothing else stored in this browser.'],
      confirmLabel: 'Delete all saved data',
    });
    if (!agreed) return;
    const ok = profile.deleteAllData();
    onDeletedAll(ok);
  }

  show();
  return { show, deleteAll };
}
