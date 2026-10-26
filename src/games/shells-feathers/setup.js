// The Shells & Feathers setup screen: Player 1's pieces, the Spirit's
// difficulty and the match length (a single game, best of three or five),
// radio groups saved as soon as they change. The two mode
// buttons are plain links handled by the router. The difficulty hint is
// ai.js's own description of each level.
import { LEVEL_WORDS as HINTS } from './ai.js';
import { SET_HINTS } from '../../shared/match-set.js';

export function initShellsFeathersSetup({ doc, profile, feedback }) {
  const symbolInputs = [...doc.querySelectorAll('input[name="sf-symbol"]')];
  const difficultyInputs = [...doc.querySelectorAll('input[name="sf-difficulty"]')];
  const lengthInputs = [...doc.querySelectorAll('input[name="sf-length"]')];
  const hint = doc.getElementById('sf-difficulty-hint');
  const lengthHint = doc.getElementById('sf-length-hint');

  // Shown again whenever the screen opens (Switch Sides changes the pieces).
  function show() {
    const { difficulty, player1Symbol, setLength } = profile.gameSettings();
    for (const input of symbolInputs) input.checked = input.value === player1Symbol;
    for (const input of difficultyInputs) input.checked = input.value === difficulty;
    for (const input of lengthInputs) input.checked = Number(input.value) === setLength;
    hint.textContent = HINTS[difficulty];
    lengthHint.textContent = SET_HINTS[setLength];
  }
  show();

  for (const input of symbolInputs) {
    input.addEventListener('change', () => {
      profile.updateGameSettings({ player1Symbol: input.value });
      feedback.cue('button');
    });
  }
  for (const input of difficultyInputs) {
    input.addEventListener('change', () => {
      profile.updateGameSettings({ difficulty: input.value });
      hint.textContent = HINTS[input.value];
      feedback.cue('button');
    });
  }
  for (const input of lengthInputs) {
    input.addEventListener('change', () => {
      profile.updateGameSettings({ setLength: Number(input.value) });
      lengthHint.textContent = SET_HINTS[input.value];
      feedback.cue('button');
    });
  }
  return { show };
}
