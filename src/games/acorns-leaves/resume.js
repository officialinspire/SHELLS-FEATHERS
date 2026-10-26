// An unfinished Acorns & Leaves match, saved and checked (see
// src/shared/resume.js). The snapshot holds the match's own settings (mode,
// rules, Spirit difficulty, the player's side), the set so far and each move
// played this round as its path; restoring replays every path through the
// engine from the starting position, so the position comes back exactly as
// it was or not at all. Only finished moves are kept: a piece picked up, or
// halfway through a chain of jumps, is not a move yet.
import { createInitialState, findMove, applyMove, analyze, SIDES } from './engine.js';
import { DIFFICULTIES } from './ai.js';
import { validSet } from '../../shared/match-set.js';

const MODES = ['single', 'two'];
const VARIANTS = ['classic', 'fog'];

export function snapshotOf({
  mode, variant, difficulty, side, set, moves,
}) {
  return {
    mode, variant, difficulty, side, set: { length: set.length, rounds: [...set.rounds] }, moves: moves.map((path) => [...path]),
  };
}

// The checked snapshot with the moves found again ({ ..., moves: [move] },
// each a legal move of the engine), or null if anything doesn't fit.
export function restoreAcornsLeaves(raw, { initialState = createInitialState } = {}) {
  if (!raw || typeof raw !== 'object') return null;
  const {
    mode, variant, difficulty, side,
  } = raw;
  if (!MODES.includes(mode) || !VARIANTS.includes(variant) || !DIFFICULTIES.includes(difficulty) || !SIDES.includes(side)) return null;
  const set = validSet(raw.set, { unfinished: true });
  if (!set || !Array.isArray(raw.moves)) return null;
  let state = initialState();
  const moves = [];
  for (const path of raw.moves) {
    const move = findMove(state, path);
    if (!move) return null;
    moves.push(move);
    state = applyMove(state, move);
    if (analyze(state).result) return null; // a finished round isn't resumed
  }
  return {
    mode, variant, difficulty, side, set, moves,
  };
}
