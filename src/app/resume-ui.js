// Unfinished matches on the setup screens and the hub (see
// src/shared/resume.js): each game's setup screen shows what is waiting
// (mode, difficulty, the set so far, moves played) with Resume and Discard,
// and the hub's game card a "Resume match" link. A saved match is checked
// (replayed through the rules) before it is offered; one that fails is set
// aside, and the setup screen says so once rather than starting something
// else in its place. Nothing here names a square, so Fog stays private.
import { restoreShellsFeathers } from '../games/shells-feathers/resume.js';
import { restoreAcornsLeaves } from '../games/acorns-leaves/resume.js';
import { DIFFICULTY_NAMES } from '../games/shells-feathers/ai.js';
import { DIFFICULTY_NAMES as AL_DIFFICULTY_NAMES } from '../games/acorns-leaves/ai.js';
import { PROBLEM_TEXT } from '../shared/resume.js';
import { setProgressText } from '../shared/match-set.js';

const PREFIX = { shellsFeathers: 'sf', acornsLeaves: 'al' };
const RESTORE = { shellsFeathers: restoreShellsFeathers, acornsLeaves: (snapshot) => restoreAcornsLeaves(snapshot) };
const plural = (n, one) => `${n} ${one}${n === 1 ? '' : 's'}`;

// "Against the Spirit (Balanced), you play Feathers · Round 2 of 3 · You 1,
// the Spirit 0 · 3 moves played this round"
export function describeUnfinished(game, restored) {
  const { mode, set } = restored;
  const played = restored.moves.length;
  let who;
  let names;
  if (game === 'shellsFeathers') {
    const pieces = restored.player1Symbol === 'shell' ? 'Shells' : 'Feathers';
    who = mode === 'single' ? `Against the Spirit (${DIFFICULTY_NAMES[restored.difficulty]}), you play ${pieces}` : `Two players, Player 1 plays ${pieces}`;
    names = mode === 'single' ? { first: 'You', second: 'the Spirit' } : { first: 'Player 1', second: 'Player 2' };
  } else {
    const rules = restored.variant === 'fog' ? 'Fog of War' : 'Classic';
    const side = restored.side === 'acorn' ? 'Acorns' : 'Leaves';
    who = mode === 'single' ? `${rules} against the Spirit (${AL_DIFFICULTY_NAMES[restored.difficulty]}), you play ${side}` : `${rules}, two players`;
    names = mode === 'single' ? { first: 'You', second: 'the Spirit' } : { first: 'the Acorns', second: 'the Leaves' };
  }
  const progress = set.length > 1 ? setProgressText(set, names) : 'Single game';
  const moves = played ? `${plural(played, 'move')} played this round` : 'the next round not started';
  return `${who} · ${progress} · ${moves}`;
}

export function createResumeUi({ doc, resumeStore }) {
  const byId = (id) => doc.getElementById(id);

  // The game's saved match, rebuilt and checked, or null. One that fails the
  // check is set aside and reported.
  function check(game) {
    const snapshot = resumeStore.get(game);
    if (!snapshot) return null;
    const restored = RESTORE[game](snapshot);
    if (!restored) resumeStore.reject(game);
    return restored;
  }

  function render(game) {
    const p = PREFIX[game];
    const restored = check(game);
    byId(`${p}-resume`).hidden = !restored;
    if (restored) byId(`${p}-resume-text`).textContent = describeUnfinished(game, restored);
    const problem = resumeStore.takeProblem(game);
    const note = byId(`${p}-resume-note`);
    note.hidden = !problem;
    note.textContent = problem ? PROBLEM_TEXT[problem] : '';
  }

  return {
    render,
    renderHub() {
      for (const game of Object.keys(PREFIX)) byId(`${PREFIX[game]}-hub-resume`).hidden = !check(game);
    },
    resumable: (game) => Boolean(check(game)),
    discard(game) {
      resumeStore.clear(game);
      render(game);
    },
  };
}
