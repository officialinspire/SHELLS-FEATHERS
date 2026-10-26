// Match sets: a single game, best of three or best of five, for both games.
// Pure functions over plain objects, so a set can be saved and restored.
//
// The two sides of a set are 'first' and 'second': you and the Spirit, or
// Player 1 and Player 2 (Shells & Feathers), or the Acorns and the Leaves
// (two players at checkers). Against the Spirit the set follows the people,
// not the pieces: switching sides between rounds keeps the score.
//
// The rules of a best-of-N set:
// - It has at most N rounds. A drawn round is played and counts as one of
//   them, but scores for neither side (so a set can't go on for ever: Wise
//   never loses Shells & Feathers).
// - It ends as soon as it is decided: when the leader's lead is more than
//   the rounds left (the other side can no longer catch up), or when all N
//   rounds are played. Best of three is first to two when no round is drawn.
// - The leader wins it. If the round wins are level after the last round,
//   the set is drawn.
// A single game is a set of one: its result is the game's.
export const SET_LENGTHS = [1, 3, 5];

// What each choice means, for the setup screens.
const DRAWS = 'A drawn round counts as one of them but scores for no one; level after the last round is a drawn set.';
export const SET_HINTS = {
  1: 'One game. Play Again starts another.',
  3: `Best of 3: up to three rounds; the first to win two takes the set. ${DRAWS}`,
  5: `Best of 5: up to five rounds; the first to win three takes the set. ${DRAWS}`,
};

const SIDES = ['first', 'second'];
const ROUND_RESULTS = [...SIDES, 'draw'];

// rounds: each finished round's winner, 'first' | 'second' | 'draw'.
export function createSet(length = 1, rounds = []) {
  return { length, rounds: [...rounds] };
}

export function setScore({ length, rounds }) {
  const wins = { first: 0, second: 0 };
  for (const r of rounds) if (r !== 'draw') wins[r] += 1;
  const draws = rounds.filter((r) => r === 'draw').length;
  const left = length - rounds.length;
  const lead = Math.abs(wins.first - wins.second);
  const done = left <= 0 || lead > left;
  let winner = null;
  if (done) winner = wins.first === wins.second ? 'draw' : wins.first > wins.second ? 'first' : 'second';
  return {
    length, played: rounds.length, wins, draws, left: Math.max(0, left), done, winner,
    // The round being played (or about to be), counting from 1.
    round: done ? rounds.length : rounds.length + 1,
  };
}

// The set after a round: winner 'first' | 'second' | 'draw'. A decided set
// takes no more rounds (returned unchanged).
export function recordRound(set, winner) {
  if (!ROUND_RESULTS.includes(winner) || setScore(set).done) return set;
  return createSet(set.length, [...set.rounds, winner]);
}

// A saved set, checked: a known length and rounds that fit it. Returns the
// set, or null for anything else. `unfinished` also requires it not to be
// decided yet (a saved match is always one still being played).
export function validSet(raw, { unfinished = false } = {}) {
  if (!raw || typeof raw !== 'object' || !SET_LENGTHS.includes(raw.length) || !Array.isArray(raw.rounds)) return null;
  if (!raw.rounds.every((r) => ROUND_RESULTS.includes(r))) return null;
  const set = createSet(raw.length, raw.rounds);
  // Every round before the last must have left the set undecided.
  for (let i = 0; i < set.rounds.length; i++) {
    if (setScore(createSet(set.length, set.rounds.slice(0, i))).done) return null;
  }
  if (unfinished && setScore(set).done) return null;
  return set;
}

// Words for each side: { first: 'You', second: 'the Spirit' } and so on.
// "Round 2 of 3 · You 1, the Spirit 0" (with "· 1 draw" when there are any).
export function setProgressText(set, names) {
  const s = setScore(set);
  const draws = s.draws ? ` · ${s.draws} draw${s.draws > 1 ? 's' : ''}` : '';
  const score = `${names.first} ${s.wins.first}, ${names.second} ${s.wins.second}${draws}`;
  if (s.done) return `${setResultText(set, names)} · ${score}`;
  return `Round ${s.round} of ${set.length} · ${score}`;
}

// "You win the set", "The Spirit wins the set", "The set is drawn".
export function setResultText(set, names) {
  const { winner } = setScore(set);
  if (winner === 'draw') return 'The set is drawn';
  if (!winner) return '';
  const who = names[winner];
  const plural = who === 'You' || who.endsWith('s'); // You, the Acorns, the Leaves
  return `${who[0].toUpperCase()}${who.slice(1)} ${plural ? 'win' : 'wins'} the set`;
}
