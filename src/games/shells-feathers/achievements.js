// Shells & Feathers achievements, worked out from the recorded stats (nothing
// extra is stored, so "Clear" in Your Path resets them too). Games from before
// the v2 save format count toward totals only, because v1 didn't record mode
// or difficulty.
const ACHIEVEMENTS = [
  { id: 'first-game', title: 'First Game', description: 'Finish a game of Shells & Feathers.', earned: (_, totals) => totals.totalGames >= 1 },
  { id: 'gentle-win', title: 'Gentle Win', description: 'Beat the Spirit on Gentle.', earned: (stats) => stats.single.easy.wins >= 1 },
  { id: 'balanced-win', title: 'Balanced Win', description: 'Beat the Spirit on Balanced.', earned: (stats) => stats.single.medium.wins >= 1 },
  { id: 'steady-hand', title: 'Steady Hand', description: 'Hold the Wise Spirit to a draw.', earned: (stats) => stats.single.hard.draws >= 1 },
  {
    id: 'shared-board',
    title: 'Shared Board',
    description: 'Finish a two-player game.',
    earned: ({ twoPlayer }) => twoPlayer.player1Wins + twoPlayer.player2Wins + twoPlayer.draws >= 1,
  },
  { id: 'ten-games', title: 'Ten Games', description: 'Finish ten games.', earned: (_, totals) => totals.totalGames >= 10 },
];

// stats: save.shellsFeathers.stats; totals: summarizeStats(save).
export function achievementsFor(stats, totals) {
  return ACHIEVEMENTS.map(({ id, title, description, earned }) => ({ id, title, description, unlocked: earned(stats, totals) }));
}
