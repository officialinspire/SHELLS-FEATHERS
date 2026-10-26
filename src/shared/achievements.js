// The achievement journal: every achievement of both games and the
// Collection, with exactly what earns it. Each is unlocked once and then kept
// in the save (save-data.js) with the time it was unlocked, so it never
// unlocks or announces twice; only "Clear progress" for its game locks it
// again (and the Collection entries that need that game).
//
// Three books: shellsFeathers, acornsLeaves and collection. Each entry says
// which part of its book it belongs to (`section`):
// - milestone: any finished game counts, against the Spirit or two players;
// - spirit: games against the Spirit only, the device owner's own games;
// - shared: two-player games on this device only. They belong to two
//   people, so they never count as anyone's win;
// - collection: earned from other achievements (`needs`).
//
// How each is earned (exactly one of):
// - fromRecords(records): from the saved results after each game. Records
//   are exact counts, so these can also be worked out for a save made before
//   they existed (with no date: "unlocked earlier");
// - fromResult(result): from the game that just finished,
//   { game, mode, outcome, side, variant, difficulty }. Only games finished
//   since the journal began count: older results don't say which side was
//   played, and nothing is guessed from totals;
// - moment: reported by the game as it happens (only the player's own piece,
//   in a game against the Spirit);
// - needs: [[book, id], …] all unlocked. Dated when the last of them was
//   (no date if any of them has none).
//
// `since` is the achievement set an entry was added in (1: Stage 8,
// 2: the journal). A save from set 1 gets the record entries of set 2
// worked out once (save-data.js normalizeSave).
//
// records: { shellsFeathers: { stats, totals }, acornsLeaves: { stats } },
// where totals are the Shells & Feathers v1-style totals (summarizeStats),
// which include games from before results were kept by mode.
export const ACHIEVEMENT_SET = 2;

const LEVELS = ['easy', 'medium', 'hard'];
const sum = (values) => values.reduce((a, b) => a + b, 0);
const spiritWins = (records) => sum(LEVELS.map((level) => records.single[level].wins));
const spiritGames = (records) => sum(LEVELS.map((level) => sum(Object.values(records.single[level]))));
const twoPlayerGames = (records) => sum(Object.values(records.twoPlayer));
const checkersGames = (stats) => spiritGames(stats) + twoPlayerGames(stats) + spiritGames(stats.fog) + twoPlayerGames(stats.fog);
const spiritWinWith = (side) => (result) => result.mode === 'single' && result.outcome === 'win' && result.side === side;
const SINCE_SIDES = 'Counts wins since the journal began noting sides.';

export const SECTIONS = {
  milestone: 'Milestones',
  spirit: 'Against the Spirit',
  shared: 'Two players on this device',
  collection: 'Across both games',
};

export const BOOKS = {
  shellsFeathers: 'Shells & Feathers',
  acornsLeaves: 'Acorns & Leaves',
  collection: 'Collection',
};

export const ACHIEVEMENTS = {
  shellsFeathers: [
    {
      id: 'first-game', title: 'First Game', icon: 'ach-sprout', section: 'milestone', since: 1,
      description: 'Finish a game of Shells & Feathers: against the Spirit or with two players, won, lost or drawn.',
      fromRecords: ({ shellsFeathers }) => shellsFeathers.totals.totalGames >= 1,
    },
    {
      id: 'ten-games', title: 'Ten Games', icon: 'ach-tally', section: 'milestone', since: 1,
      description: 'Finish ten games of Shells & Feathers, in any mode. Games from before results were kept by mode count too.',
      fromRecords: ({ shellsFeathers }) => shellsFeathers.totals.totalGames >= 10,
      progress: ({ shellsFeathers }) => ({ value: shellsFeathers.totals.totalGames, goal: 10, unit: 'games' }),
    },
    {
      id: 'first-win', title: 'First Win', icon: 'ach-laurel', section: 'spirit', since: 1,
      description: 'Beat the Spirit at Shells & Feathers, at any difficulty.',
      fromRecords: ({ shellsFeathers }) => spiritWins(shellsFeathers.stats) >= 1,
    },
    {
      id: 'shell-win', title: 'Win with Shells', icon: 'ach-shell', section: 'spirit', since: 2,
      description: 'Beat the Spirit at Shells & Feathers playing the shells.', note: SINCE_SIDES,
      fromResult: spiritWinWith('shell'),
    },
    {
      id: 'feather-win', title: 'Win with Feathers', icon: 'ach-feather', section: 'spirit', since: 2,
      description: 'Beat the Spirit at Shells & Feathers playing the feathers.', note: SINCE_SIDES,
      fromResult: spiritWinWith('feather'),
    },
    {
      id: 'gentle-win', title: 'Gentle Win', icon: 'ach-breeze', section: 'spirit', since: 1,
      description: 'Beat the Spirit on Gentle.',
      fromRecords: ({ shellsFeathers }) => shellsFeathers.stats.single.easy.wins >= 1,
    },
    {
      id: 'balanced-win', title: 'Balanced Win', icon: 'ach-scales', section: 'spirit', since: 1,
      description: 'Beat the Spirit on Balanced.',
      fromRecords: ({ shellsFeathers }) => shellsFeathers.stats.single.medium.wins >= 1,
    },
    {
      id: 'steady-hand', title: 'Steady Hand', icon: 'ach-shield', section: 'spirit', since: 1,
      description: 'Hold the Wise Spirit to a draw. (Wise never loses Shells & Feathers.)',
      fromRecords: ({ shellsFeathers }) => shellsFeathers.stats.single.hard.draws >= 1,
    },
    {
      id: 'shared-board', title: 'Shared Board', icon: 'ach-pair', section: 'shared', since: 1,
      description: 'Finish a two-player game of Shells & Feathers on this device.',
      fromRecords: ({ shellsFeathers }) => twoPlayerGames(shellsFeathers.stats) >= 1,
    },
  ],
  acornsLeaves: [
    {
      id: 'first-game', title: 'First Game', icon: 'ach-sprout', section: 'milestone', since: 2,
      description: 'Finish a game of Acorns & Leaves: Classic or Fog of War, against the Spirit or with two players, won, lost or drawn.',
      fromRecords: ({ acornsLeaves }) => checkersGames(acornsLeaves.stats) >= 1,
    },
    {
      id: 'first-win', title: 'First Win', icon: 'ach-laurel', section: 'spirit', since: 1,
      description: 'Beat the Spirit at Acorns & Leaves, in Classic or Fog of War, at any difficulty.',
      fromRecords: ({ acornsLeaves }) => spiritWins(acornsLeaves.stats) + spiritWins(acornsLeaves.stats.fog) >= 1,
    },
    {
      id: 'acorn-win', title: 'Win with Acorns', icon: 'ach-acorn', section: 'spirit', since: 2,
      description: 'Beat the Spirit at Acorns & Leaves playing the acorns, in Classic or Fog of War.', note: SINCE_SIDES,
      fromResult: spiritWinWith('acorn'),
    },
    {
      id: 'leaf-win', title: 'Win with Leaves', icon: 'ach-leaf', section: 'spirit', since: 2,
      description: 'Beat the Spirit at Acorns & Leaves playing the leaves, in Classic or Fog of War.', note: SINCE_SIDES,
      fromResult: spiritWinWith('leaf'),
    },
    {
      id: 'crowned', title: 'Crowned', icon: 'ach-crown', section: 'spirit', since: 1, moment: 'crowned',
      description: 'Crown one of your own pieces against the Spirit, in Classic or Fog of War. It counts when it happens, before the game ends.',
    },
    {
      id: 'double-jump', title: 'Double Jump', icon: 'ach-hop', section: 'spirit', since: 1, moment: 'multi-jump',
      description: 'Capture two or more pieces in one move of yours against the Spirit, in Classic or Fog of War.',
    },
    {
      id: 'fog-win', title: 'Through the Fog', icon: 'ach-fogsun', section: 'spirit', since: 1,
      description: 'Beat the Spirit in Fog of War, at any difficulty.',
      fromRecords: ({ acornsLeaves }) => spiritWins(acornsLeaves.stats.fog) >= 1,
    },
    {
      id: 'wise-win', title: 'Wise Victory', icon: 'ach-owl', section: 'spirit', since: 1,
      description: 'Beat the Wise Spirit at Acorns & Leaves, in Classic or Fog of War.',
      fromRecords: ({ acornsLeaves }) => acornsLeaves.stats.single.hard.wins + acornsLeaves.stats.fog.single.hard.wins >= 1,
    },
    {
      id: 'shared-board', title: 'Shared Board', icon: 'ach-pair', section: 'shared', since: 1,
      description: 'Finish a two-player game of Acorns & Leaves on this device, Classic or Fog of War.',
      fromRecords: ({ acornsLeaves }) => twoPlayerGames(acornsLeaves.stats) + twoPlayerGames(acornsLeaves.stats.fog) >= 1,
    },
    {
      id: 'shared-fog', title: 'Passing in the Mist', icon: 'ach-lantern', section: 'shared', since: 2,
      description: 'Finish a two-player game of Fog of War on this device, handing over at every turn.',
      fromRecords: ({ acornsLeaves }) => twoPlayerGames(acornsLeaves.stats.fog) >= 1,
    },
  ],
  collection: [
    {
      id: 'both-games', title: 'Two Paths', icon: 'ach-fork', section: 'collection', since: 2,
      description: 'Finish a game of each: Shells & Feathers and Acorns & Leaves, in any mode.',
      needs: [['shellsFeathers', 'first-game'], ['acornsLeaves', 'first-game']],
    },
    {
      id: 'both-wins', title: 'Friend of the Woods', icon: 'ach-oak', section: 'collection', since: 2,
      description: 'Beat the Spirit at both games.',
      needs: [['shellsFeathers', 'first-win'], ['acornsLeaves', 'first-win']],
    },
    {
      id: 'all-sides', title: 'Every Side', icon: 'ach-compass', section: 'collection', since: 2,
      description: 'Beat the Spirit with all four sides: shells, feathers, acorns and leaves.',
      needs: [['shellsFeathers', 'shell-win'], ['shellsFeathers', 'feather-win'], ['acornsLeaves', 'acorn-win'], ['acornsLeaves', 'leaf-win']],
    },
  ],
};

// The games, each with its records and achievements in the save; the
// collection's entries are kept in save.collection.
export const GAMES = ['shellsFeathers', 'acornsLeaves'];
export const BOOK_IDS = Object.keys(ACHIEVEMENTS);

export const definition = (book, id) => ACHIEVEMENTS[book]?.find((a) => a.id === id) ?? null;

// Ids of `book`'s record achievements that the records now earn. `after`
// limits them to those added after a given achievement set.
export const earnedFromRecords = (book, records, { after = 0 } = {}) => (ACHIEVEMENTS[book] ?? [])
  .filter((a) => a.since > after && a.fromRecords?.(records))
  .map((a) => a.id);

// Ids of `book`'s achievements earned by the game that just finished.
export const earnedFromResult = (book, result) => (ACHIEVEMENTS[book] ?? [])
  .filter((a) => a.fromResult?.(result))
  .map((a) => a.id);

// Ids of `book`'s achievements earned by a moment in play.
export const earnedByMoment = (book, moment) => (ACHIEVEMENTS[book] ?? [])
  .filter((a) => a.moment === moment)
  .map((a) => a.id);

// The Collection entries that need something of `game` (cleared with it).
export const collectionNeeding = (game) => ACHIEVEMENTS.collection
  .filter((a) => a.needs.some(([book]) => book === game))
  .map((a) => a.id);
