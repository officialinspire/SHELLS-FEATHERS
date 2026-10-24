// The Acorns & Leaves setup screen: the side the player takes against the
// Spirit and the Spirit's difficulty (radio groups), saved as soon as they
// change. The two mode buttons are plain links handled by the router.
const HINTS = {
  easy: 'Gentle: the Spirit looks one move ahead and often picks at random.',
  medium: 'Balanced: the Spirit looks a few moves ahead.',
  hard: 'Wise: the Spirit thinks as far ahead as it can in a moment.',
};

export function initAcornsLeavesSetup({ doc, profile, audio }) {
  const sideInputs = [...doc.querySelectorAll('input[name="al-side"]')];
  const difficultyInputs = [...doc.querySelectorAll('input[name="al-difficulty"]')];
  const hint = doc.getElementById('al-difficulty-hint');

  const { difficulty, side } = profile.acornsLeavesSettings();
  for (const input of sideInputs) input.checked = input.value === side;
  for (const input of difficultyInputs) input.checked = input.value === difficulty;
  hint.textContent = HINTS[difficulty];

  for (const input of sideInputs) {
    input.addEventListener('change', () => {
      profile.updateAcornsLeavesSettings({ side: input.value });
      audio.playSfx('button-select');
    });
  }
  for (const input of difficultyInputs) {
    input.addEventListener('change', () => {
      profile.updateAcornsLeavesSettings({ difficulty: input.value });
      hint.textContent = HINTS[input.value];
      audio.playSfx('button-select');
    });
  }
}
