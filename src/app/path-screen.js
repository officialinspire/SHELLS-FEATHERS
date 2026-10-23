// "Your Path": Shells & Feathers totals (same numbers as v1's stats screen),
// records per Spirit difficulty and for two players, achievements, and the
// button that clears them.
import { DIFFICULTIES, DIFFICULTY_NAMES } from '../games/shells-feathers/ai.js';
import { achievementsFor } from '../games/shells-feathers/achievements.js';

export function createPathScreen({ doc, profile, audio, confirm }) {
  const byId = (id) => doc.getElementById(id);
  const make = (tag, props = {}, children = [], attrs = {}) => {
    const el = Object.assign(doc.createElement(tag), props);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    el.append(...children);
    return el;
  };

  function render() {
    const totals = profile.statsSummary();
    const stats = profile.stats();
    byId('wins-count').textContent = totals.wins;
    byId('draws-count').textContent = totals.draws;
    byId('losses-count').textContent = totals.losses;
    byId('total-games').textContent = totals.totalGames;

    byId('spirit-records').replaceChildren(...DIFFICULTIES.map((d) => {
      const { wins, draws, losses } = stats.single[d];
      return make('tr', {}, [
        make('th', { scope: 'row', textContent: DIFFICULTY_NAMES[d] }),
        ...[wins, draws, losses].map((n) => make('td', { textContent: String(n) })),
      ]);
    }));

    const { player1Wins, player2Wins, draws } = stats.twoPlayer;
    byId('two-player-record').textContent = `Player 1 wins: ${player1Wins} · Player 2 wins: ${player2Wins} · Draws: ${draws}`;

    const legacyGames = stats.legacy.totalGames;
    const note = byId('legacy-note');
    note.hidden = legacyGames === 0;
    note.textContent = `${legacyGames} earlier ${legacyGames === 1 ? 'game is' : 'games are'} included in the totals. `
      + 'They were recorded before results were kept by mode and difficulty.';

    const achievements = achievementsFor(stats, totals);
    const unlocked = achievements.filter((a) => a.unlocked).length;
    byId('achievement-count').textContent = `(${unlocked} of ${achievements.length})`;
    byId('achievement-list').replaceChildren(...achievements.map((a) => make(
      'li',
      { className: `achievement ${a.unlocked ? 'is-unlocked' : 'is-locked'}` },
      [
        make('span', { className: 'achievement-mark', textContent: a.unlocked ? '✓' : '○' }, [], { 'aria-hidden': 'true' }),
        make('span', { className: 'achievement-text' }, [
          make('strong', { textContent: a.title }),
          make('span', { textContent: a.description }),
        ]),
        make('span', { className: 'achievement-state', textContent: a.unlocked ? 'Unlocked' : 'Locked' }),
      ],
    )));
  }

  function reset() {
    if (!confirm('Clear all Shells & Feathers records and achievements?')) return;
    profile.resetStats();
    render();
    audio.playSfx('button-select');
  }

  return { render, reset };
}
