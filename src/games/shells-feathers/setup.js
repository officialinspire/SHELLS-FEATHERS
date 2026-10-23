// The Shells & Feathers setup screen: Player 1's pieces and the Spirit's
// difficulty (radio groups), saved as soon as they change. The two mode
// buttons are plain links handled by the router.
const HINTS = {
  easy: 'Gentle: the Spirit picks open squares at random.',
  medium: 'Balanced: the Spirit usually finds the strongest move.',
  hard: 'Wise: the Spirit never loses. A draw is a great result.',
};

export function initShellsFeathersSetup({ doc, profile, audio }) {
  const symbolInputs = [...doc.querySelectorAll('input[name="sf-symbol"]')];
  const difficultyInputs = [...doc.querySelectorAll('input[name="sf-difficulty"]')];
  const hint = doc.getElementById('sf-difficulty-hint');

  const { difficulty, player1Symbol } = profile.gameSettings();
  for (const input of symbolInputs) input.checked = input.value === player1Symbol;
  for (const input of difficultyInputs) input.checked = input.value === difficulty;
  hint.textContent = HINTS[difficulty];

  for (const input of symbolInputs) {
    input.addEventListener('change', () => {
      profile.updateGameSettings({ player1Symbol: input.value });
      audio.playSfx('button-select');
    });
  }
  for (const input of difficultyInputs) {
    input.addEventListener('change', () => {
      profile.updateGameSettings({ difficulty: input.value });
      hint.textContent = HINTS[input.value];
      audio.playSfx('button-select');
    });
  }
}
