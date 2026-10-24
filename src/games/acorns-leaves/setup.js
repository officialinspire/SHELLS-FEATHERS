// The Acorns & Leaves setup screen: the rules (Classic or Fog of War), the
// side the player takes against the Spirit and the Spirit's difficulty (radio
// groups), saved as soon as they change. The two mode buttons are plain links
// handled by the router; they point at the chosen rules' routes.
const HINTS = {
  easy: 'Gentle: the Spirit looks one move ahead and often picks at random.',
  medium: 'Balanced: the Spirit looks a few moves ahead.',
  hard: 'Wise: the Spirit thinks as far ahead as it can in a moment.',
};

const VARIANT_HINTS = {
  classic: 'Classic: the whole board is in view.',
  fog: 'Fog of War: you see your own pieces and only the enemy pieces next to them.',
};
const TWO_PLAYER_DESC = {
  classic: 'Acorns and Leaves take turns on one device',
  fog: 'Pass the device between turns; the board hides in between',
};

export function initAcornsLeavesSetup({ doc, profile, audio }) {
  const variantInputs = [...doc.querySelectorAll('input[name="al-variant"]')];
  const sideInputs = [...doc.querySelectorAll('input[name="al-side"]')];
  const difficultyInputs = [...doc.querySelectorAll('input[name="al-difficulty"]')];
  const hint = doc.getElementById('al-difficulty-hint');
  const variantHint = doc.getElementById('al-variant-hint');
  const singleLink = doc.getElementById('al-play-single');
  const twoLink = doc.getElementById('al-play-two');

  function showVariant(variant) {
    const base = variant === 'fog' ? '#/acorns-leaves/fog' : '#/acorns-leaves/play';
    singleLink.setAttribute('href', `${base}/single`);
    twoLink.setAttribute('href', `${base}/two`);
    twoLink.querySelector('.mode-desc').textContent = TWO_PLAYER_DESC[variant];
    variantHint.textContent = VARIANT_HINTS[variant];
  }

  const { difficulty, side, variant } = profile.acornsLeavesSettings();
  for (const input of variantInputs) input.checked = input.value === variant;
  for (const input of sideInputs) input.checked = input.value === side;
  for (const input of difficultyInputs) input.checked = input.value === difficulty;
  hint.textContent = HINTS[difficulty];
  showVariant(variant);

  for (const input of variantInputs) {
    input.addEventListener('change', () => {
      profile.updateAcornsLeavesSettings({ variant: input.value });
      showVariant(input.value);
      audio.playSfx('button-select');
    });
  }

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
