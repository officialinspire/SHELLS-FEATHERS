// Settings: sound effects and music for every game. Shows the saved values on
// start and saves every change. (Shells & Feathers options live on its setup
// screen.)
export function initSettingsScreen({ doc, profile, audio }) {
  const sfxToggle = doc.getElementById('audio-toggle');
  const musicToggle = doc.getElementById('music-toggle');

  const { sfx, music } = profile.settings();
  sfxToggle.checked = sfx;
  musicToggle.checked = music;

  sfxToggle.addEventListener('change', () => {
    profile.updateSettings({ sfx: sfxToggle.checked });
    audio.setSfxEnabled(sfxToggle.checked);
    if (sfxToggle.checked) audio.playSfx('button-select');
  });

  musicToggle.addEventListener('change', () => {
    profile.updateSettings({ music: musicToggle.checked });
    audio.setMusicEnabled(musicToggle.checked);
  });
}
