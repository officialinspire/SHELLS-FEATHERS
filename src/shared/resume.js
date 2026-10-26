// Unfinished matches, kept so a game can be resumed after the page is
// closed or reloaded: one per game, in its own localStorage key so the main
// save never depends on it.
//
// { version: 1, shellsFeathers: snapshot | null, acornsLeaves: snapshot | null }
//
// A snapshot is what a session needs to rebuild its match exactly: the
// match's own settings (not the current ones), the set so far, and every
// move played in the current round, in order (see each game's resume.js).
// Rebuilding replays the moves through the game's rules, so a snapshot that
// doesn't fit them is refused rather than changed.
//
// Nothing is taken on trust: an unreadable key, another version, or a
// snapshot that fails the game's checks is removed, and `problem(game)` says
// so once, so the setup screen can tell the player instead of quietly
// starting something else.
import { readJson } from './storage.js';

export const RESUME_KEY = 'spiritOfTheWoods:resume';
export const RESUME_VERSION = 1;
const GAMES = ['shellsFeathers', 'acornsLeaves'];

export const PROBLEM_TEXT = {
  corrupt: 'An unfinished match couldn’t be read, so it was set aside. Start a new one whenever you like.',
  version: 'An unfinished match was saved by a different version of the game, so it couldn’t be resumed.',
  invalid: 'An unfinished match didn’t fit the rules when it was checked, so it was set aside rather than changed.',
};

export function createResumeStore(store) {
  const problems = {};
  let data = { version: RESUME_VERSION, shellsFeathers: null, acornsLeaves: null };

  const read = readJson(store, RESUME_KEY);
  if (read.status === 'corrupt' || (read.status === 'ok' && (read.value === null || typeof read.value !== 'object'))) {
    for (const game of GAMES) problems[game] = 'corrupt';
    store.remove(RESUME_KEY);
  } else if (read.status === 'ok' && read.value.version !== RESUME_VERSION) {
    for (const game of GAMES) if (read.value[game]) problems[game] = 'version';
    store.remove(RESUME_KEY);
  } else if (read.status === 'ok') {
    for (const game of GAMES) data[game] = read.value[game] ?? null;
  }

  function persist() {
    if (!data.shellsFeathers && !data.acornsLeaves) store.remove(RESUME_KEY);
    else store.write(RESUME_KEY, JSON.stringify(data));
  }

  return {
    // The saved snapshot, unchecked (the game checks it when rebuilding).
    get: (game) => data[game] ?? null,
    save(game, snapshot) {
      data = { ...data, [game]: { ...snapshot, savedAt: Date.now() } };
      persist();
    },
    clear(game) {
      if (!data[game]) return;
      data = { ...data, [game]: null };
      persist();
    },
    // The game found the snapshot unusable: it goes, and the player is told.
    reject(game) {
      problems[game] = 'invalid';
      this.clear(game);
    },
    // What went wrong with this game's unfinished match, said once.
    takeProblem(game) {
      const problem = problems[game] ?? null;
      delete problems[game];
      return problem;
    },
    peekProblem: (game) => problems[game] ?? null,
  };
}
