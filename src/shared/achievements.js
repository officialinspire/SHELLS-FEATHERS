// Achievements for both games. Each is unlocked once and then kept in the
// save (save-data.js), with the time it was unlocked, so it never unlocks or
// announces twice; only "Clear progress" for its game locks it again.
//
// Two kinds:
// - from the records: worked out from the saved results after each game
//   (and, once, from the records of a save made before achievements were
//   kept);
// - from a moment in play (`moment`): reported by the game as it happens.
//
// Wins and moments count only in games against the Spirit, the device
// owner's own games. Local two-player games are shared between two people,
// so they count only toward "Shared Board" and the game totals.
//
// records: { shellsFeathers: { stats, totals }, acornsLeaves: { stats } },
// where totals are the Shells & Feathers v1-style totals (summarizeStats),
// which include games from before results were kept by mode.
const LEVELS = ['easy', 'medium', 'hard'];
const sum = (values) => values.reduce((a, b) => a + b, 0);
const spiritWins = (records) => sum(LEVELS.map((level) => records.single[level].wins));
const twoPlayerGames = (twoPlayer) => sum(Object.values(twoPlayer));

export const ACHIEVEMENTS = {
  shellsFeathers: [
    {
      id: 'first-game', title: 'First Game', description: 'Finish a game of Shells & Feathers.',
      fromRecords: ({ shellsFeathers }) => shellsFeathers.totals.totalGames >= 1,
    },
    {
      id: 'first-win', title: 'First Win', description: 'Beat the Spirit at Shells & Feathers.',
      fromRecords: ({ shellsFeathers }) => spiritWins(shellsFeathers.stats) >= 1,
    },
    {
      id: 'gentle-win', title: 'Gentle Win', description: 'Beat the Spirit on Gentle.',
      fromRecords: ({ shellsFeathers }) => shellsFeathers.stats.single.easy.wins >= 1,
    },
    {
      id: 'balanced-win', title: 'Balanced Win', description: 'Beat the Spirit on Balanced.',
      fromRecords: ({ shellsFeathers }) => shellsFeathers.stats.single.medium.wins >= 1,
    },
    {
      id: 'steady-hand', title: 'Steady Hand', description: 'Hold the Wise Spirit to a draw.',
      fromRecords: ({ shellsFeathers }) => shellsFeathers.stats.single.hard.draws >= 1,
    },
    {
      id: 'shared-board', title: 'Shared Board', description: 'Finish a two-player game of Shells & Feathers.',
      fromRecords: ({ shellsFeathers }) => twoPlayerGames(shellsFeathers.stats.twoPlayer) >= 1,
    },
    {
      id: 'ten-games', title: 'Ten Games', description: 'Finish ten games of Shells & Feathers.',
      fromRecords: ({ shellsFeathers }) => shellsFeathers.totals.totalGames >= 10,
    },
  ],
  acornsLeaves: [
    {
      id: 'first-win', title: 'First Win', description: 'Beat the Spirit at Acorns & Leaves.',
      fromRecords: ({ acornsLeaves }) => spiritWins(acornsLeaves.stats) + spiritWins(acornsLeaves.stats.fog) >= 1,
    },
    { id: 'crowned', title: 'Crowned', description: 'Crown one of your pieces against the Spirit.', moment: 'crowned' },
    { id: 'double-jump', title: 'Double Jump', description: 'Capture two or more pieces in one move against the Spirit.', moment: 'multi-jump' },
    {
      id: 'fog-win', title: 'Through the Fog', description: 'Beat the Spirit in Fog of War.',
      fromRecords: ({ acornsLeaves }) => spiritWins(acornsLeaves.stats.fog) >= 1,
    },
    {
      id: 'wise-win', title: 'Wise Victory', description: 'Beat the Wise Spirit at Acorns & Leaves.',
      fromRecords: ({ acornsLeaves }) => acornsLeaves.stats.single.hard.wins + acornsLeaves.stats.fog.single.hard.wins >= 1,
    },
    {
      id: 'shared-board', title: 'Shared Board', description: 'Finish a two-player game of Acorns & Leaves.',
      fromRecords: ({ acornsLeaves }) => twoPlayerGames(acornsLeaves.stats.twoPlayer) + twoPlayerGames(acornsLeaves.stats.fog.twoPlayer) >= 1,
    },
  ],
};

export const GAMES = Object.keys(ACHIEVEMENTS);

export const definition = (game, id) => ACHIEVEMENTS[game]?.find((a) => a.id === id) ?? null;

// Ids of `game`'s record achievements that the records now earn.
export const earnedFromRecords = (game, records) => ACHIEVEMENTS[game]
  .filter((a) => a.fromRecords?.(records))
  .map((a) => a.id);

// Ids of `game`'s achievements earned by a moment in play.
export const earnedByMoment = (game, moment) => ACHIEVEMENTS[game]
  .filter((a) => a.moment === moment)
  .map((a) => a.id);
