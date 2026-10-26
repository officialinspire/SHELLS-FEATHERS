// An unfinished Shells & Feathers match, saved and checked (see
// src/shared/resume.js). The snapshot holds the match's own settings, the
// set so far and the squares played this round, in order; restoring replays
// them through match.js, so the board comes back exactly as it was or not
// at all.
import { createMatch } from './match.js';
import { SYMBOLS } from './rules.js';
import { DIFFICULTIES } from './ai.js';
import { validSet } from '../../shared/match-set.js';

const MODES = ['single', 'two'];

export function snapshotOf({
  mode, difficulty, player1Symbol, set, moves,
}) {
  return {
    mode, difficulty, player1Symbol, set: { length: set.length, rounds: [...set.rounds] }, moves: [...moves],
  };
}

// The checked snapshot with its match replayed ({ ..., match }), or null if
// anything doesn't fit: unknown settings, a decided set, a square played
// twice, or a round already over.
export function restoreShellsFeathers(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { mode, difficulty, player1Symbol } = raw;
  if (!MODES.includes(mode) || !DIFFICULTIES.includes(difficulty) || !SYMBOLS.includes(player1Symbol)) return null;
  const set = validSet(raw.set, { unfinished: true });
  if (!set || !Array.isArray(raw.moves)) return null;
  const match = createMatch({ mode, player1Symbol, difficulty });
  for (const index of raw.moves) {
    if (match.result || !match.play(index)) return null;
  }
  if (match.result) return null;
  return {
    mode, difficulty, player1Symbol, set, moves: [...raw.moves], match,
  };
}
