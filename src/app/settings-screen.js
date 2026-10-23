// "Sacred Settings": sound and music toggles (app-wide) and the Shells &
// Feathers difficulty and Player 1 symbol. Shows the saved values on start and
// saves every change.
export function initSettingsScreen({ doc, profile, audio }) {
  const sfxToggle = doc.getElementById('audio-toggle');
  const musicToggle = doc.getElementById('music-toggle');
  const difficultyButtons = [...doc.querySelectorAll('.diff-btn')];
  const symbolButtons = [...doc.querySelectorAll('.symbol-btn')];

  const markActive = (buttons, isActive) => buttons.forEach((b) => b.classList.toggle('active', isActive(b)));

  const { sfx, music } = profile.settings();
  const { difficulty, player1Symbol } = profile.gameSettings();
  sfxToggle.checked = sfx;
  musicToggle.checked = music;
  markActive(difficultyButtons, (b) => b.dataset.level === difficulty);
  markActive(symbolButtons, (b) => b.dataset.symbol === player1Symbol);

  sfxToggle.addEventListener('change', () => {
    profile.updateSettings({ sfx: sfxToggle.checked });
    audio.setSfxEnabled(sfxToggle.checked);
    if (sfxToggle.checked) audio.playSfx('button-select');
  });

  musicToggle.addEventListener('change', () => {
    profile.updateSettings({ music: musicToggle.checked });
    audio.setMusicEnabled(musicToggle.checked);
  });

  for (const button of difficultyButtons) {
    button.addEventListener('click', () => {
      profile.updateGameSettings({ difficulty: button.dataset.level });
      markActive(difficultyButtons, (b) => b === button);
      audio.playSfx('button-select');
    });
  }

  for (const button of symbolButtons) {
    button.addEventListener('click', () => {
      profile.updateGameSettings({ player1Symbol: button.dataset.symbol });
      markActive(symbolButtons, (b) => b === button);
      audio.playSfx('button-select');
    });
  }
}
