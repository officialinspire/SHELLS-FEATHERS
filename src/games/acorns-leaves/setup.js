// The Acorns & Leaves setup screen: the rules (Classic or Fog of War), the
// side the player takes against the Spirit, the Spirit's difficulty and the
// match length (radio groups), saved as soon as they change. The two mode buttons are plain links
// handled by the router; they point at the chosen rules' routes. The
// difficulty hint is the Spirit's own description of the level (ai.js, or
// fog-ai.js under Fog of War, where it plays differently).
import { describeLevel } from './ai.js';
import { describeFogLevel } from './fog-ai.js';
import { SET_HINTS } from '../../shared/match-set.js';

export const levelWords = (variant, difficulty) => (variant === 'fog' ? describeFogLevel(difficulty) : describeLevel(difficulty));

const VARIANT_HINTS = {
  classic: 'Classic: the whole board is in view.',
  fog: 'Fog of War: you see your own pieces and only the enemy pieces next to them.',
};
const TWO_PLAYER_DESC = {
  classic: 'Acorns and Leaves take turns on one device',
  fog: 'Pass the device between turns; the board hides in between',
};

export function initAcornsLeavesSetup({ doc, profile, feedback }) {
  const variantInputs = [...doc.querySelectorAll('input[name="al-variant"]')];
  const sideInputs = [...doc.querySelectorAll('input[name="al-side"]')];
  const difficultyInputs = [...doc.querySelectorAll('input[name="al-difficulty"]')];
  const lengthInputs = [...doc.querySelectorAll('input[name="al-length"]')];
  const lengthHint = doc.getElementById('al-length-hint');
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
    hint.textContent = levelWords(variant, profile.acornsLeavesSettings().difficulty);
  }

  // Shown again whenever the screen opens (Switch Sides changes the side).
  function show() {
    const {
      difficulty, side, variant, setLength,
    } = profile.acornsLeavesSettings();
    for (const input of variantInputs) input.checked = input.value === variant;
    for (const input of sideInputs) input.checked = input.value === side;
    for (const input of difficultyInputs) input.checked = input.value === difficulty;
    for (const input of lengthInputs) input.checked = Number(input.value) === setLength;
    lengthHint.textContent = SET_HINTS[setLength];
    showVariant(variant);
  }
  show();

  for (const input of variantInputs) {
    input.addEventListener('change', () => {
      profile.updateAcornsLeavesSettings({ variant: input.value });
      showVariant(input.value);
      feedback.cue('button');
    });
  }

  for (const input of sideInputs) {
    input.addEventListener('change', () => {
      profile.updateAcornsLeavesSettings({ side: input.value });
      feedback.cue('button');
    });
  }
  for (const input of difficultyInputs) {
    input.addEventListener('change', () => {
      profile.updateAcornsLeavesSettings({ difficulty: input.value });
      hint.textContent = levelWords(profile.acornsLeavesSettings().variant, input.value);
      feedback.cue('button');
    });
  }
  for (const input of lengthInputs) {
    input.addEventListener('change', () => {
      profile.updateAcornsLeavesSettings({ setLength: Number(input.value) });
      lengthHint.textContent = SET_HINTS[input.value];
      feedback.cue('button');
    });
  }
  return { show };
}
