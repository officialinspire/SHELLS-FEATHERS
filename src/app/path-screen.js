// "Your Path": each game's records and achievements, and clearing them.
//
// Your own games (against the Spirit) are shown apart from two-player games
// on this device: a two-player win belongs to whichever of two people won,
// so it never counts as one of your wins. Shells & Feathers games from before
// results were kept by mode (the v1 record) are listed on their own.
// Acorns & Leaves shows Classic and Fog of War side by side.
//
// Sets (best of three or five) are listed apart from games: every round of a
// set is already one of the games above, so a set adds a set result, never
// another game.
//
// Each game's achievements are counted here and listed in the journal
// (journal-screen.js). "Clear … progress" deletes one game's records and
// achievements after a dialog that lists exactly what goes and what stays.
import { DIFFICULTIES, DIFFICULTY_NAMES } from '../games/shells-feathers/ai.js';
import { DIFFICULTIES as AL_DIFFICULTIES, DIFFICULTY_NAMES as AL_DIFFICULTY_NAMES } from '../games/acorns-leaves/ai.js';

const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const totals = (single, levels) => {
  const t = { wins: 0, draws: 0, losses: 0 };
  for (const level of levels) for (const key of Object.keys(t)) t[key] += single[level][key];
  return { ...t, games: t.wins + t.draws + t.losses };
};

export function createPathScreen({ doc, profile, feedback, confirmDialog }) {
  const byId = (id) => doc.getElementById(id);
  const make = (tag, props = {}, children = [], attrs = {}) => {
    const el = Object.assign(doc.createElement(tag), props);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    el.append(...children);
    return el;
  };

  const recordRows = (difficulties, names, single) => difficulties.map((d) => {
    const { wins, draws, losses } = single[d];
    return make('tr', {}, [
      make('th', { scope: 'row', textContent: names[d] }),
      ...[wins, draws, losses].map((n) => make('td', { textContent: String(n) })),
    ]);
  });

  function showCards(prefix, { wins, draws, losses, games }) {
    byId(`${prefix}-wins`).textContent = wins;
    byId(`${prefix}-draws`).textContent = draws;
    byId(`${prefix}-losses`).textContent = losses;
    byId(`${prefix}-games`).textContent = games;
  }

  function showAchievements(game, countId) {
    const list = profile.achievements(game);
    byId(countId).textContent = `${list.filter((a) => a.unlocked).length} of ${list.length} unlocked.`;
  }

  // "Against the Spirit, best of 3: 2 won, 1 drawn, 0 lost", one line per
  // kind of set played; or a line saying none is finished yet.
  function setLines(list) {
    const lines = [];
    for (const { label, sets, firstName, secondName, first, second } of list) {
      for (const [key, name] of [['bestOf3', 'best of 3'], ['bestOf5', 'best of 5']]) {
        const mine = sets.single[key];
        if (mine.wins + mine.draws + mine.losses) {
          lines.push(`${label}against the Spirit, ${name}: ${mine.wins} won, ${mine.draws} drawn, ${mine.losses} lost`);
        }
        const two = sets.twoPlayer[key];
        if (two[first] + two[second] + two.draws) {
          lines.push(`${label}two players, ${name}: ${firstName} ${two[first]}, ${secondName} ${two[second]}, drawn ${two.draws}`);
        }
      }
    }
    return lines.length ? lines : ['No sets finished yet. Choose Best of 3 or Best of 5 on the game’s screen.'];
  }

  const showSets = (id, lines) => byId(id).replaceChildren(...lines.map((text) => make('li', { textContent: text })));

  function render() {
    byId('path-storage-note').hidden = !profile.saveFailing();

    // Shells & Feathers
    const stats = profile.stats();
    showCards('sf', totals(stats.single, DIFFICULTIES));
    byId('spirit-records').replaceChildren(...recordRows(DIFFICULTIES, DIFFICULTY_NAMES, stats.single));
    const { player1Wins, player2Wins, draws } = stats.twoPlayer;
    byId('two-player-record').textContent = `Player 1 wins: ${player1Wins} · Player 2 wins: ${player2Wins} · Draws: ${draws}`;
    const legacy = stats.legacy;
    const note = byId('legacy-note');
    note.hidden = legacy.totalGames === 0;
    note.textContent = `Earlier games: ${plural(legacy.totalGames, 'game')} from before results were kept by mode `
      + `(${plural(legacy.wins, 'win')}, which may include two-player wins; ${plural(legacy.draws, 'draw')}; ${plural(legacy.losses, 'loss', 'losses')}). `
      + 'They count toward First Game and Ten Games.';
    showSets('sf-set-records', setLines([{
      label: '', sets: stats.sets, firstName: 'Player 1', secondName: 'Player 2', first: 'player1Wins', second: 'player2Wins',
    }]));
    showAchievements('shellsFeathers', 'sf-journal-count');

    // Acorns & Leaves
    const checkers = profile.acornsLeavesStats();
    const classic = totals(checkers.single, AL_DIFFICULTIES);
    const fog = totals(checkers.fog.single, AL_DIFFICULTIES);
    showCards('al', { wins: classic.wins + fog.wins, draws: classic.draws + fog.draws, losses: classic.losses + fog.losses, games: classic.games + fog.games });
    for (const [records, prefix] of [[checkers, 'al'], [checkers.fog, 'al-fog']]) {
      byId(`${prefix}-spirit-records`).replaceChildren(...recordRows(AL_DIFFICULTIES, AL_DIFFICULTY_NAMES, records.single));
      const { acornWins, leafWins, draws: twoDraws } = records.twoPlayer;
      byId(`${prefix}-two-player-record`).textContent = `Acorns wins: ${acornWins} · Leaves wins: ${leafWins} · Draws: ${twoDraws}`;
    }
    const alNames = {
      firstName: 'Acorns', secondName: 'Leaves', first: 'acornWins', second: 'leafWins',
    };
    showSets('al-set-records', setLines([
      { label: 'Classic, ', sets: checkers.sets, ...alNames },
      { label: 'Fog of War, ', sets: checkers.fog.sets, ...alNames },
    ]));
    showAchievements('acornsLeaves', 'al-journal-count');
  }

  // Unlocked Collection entries that need the game being cleared.
  const collectionLine = (titles) => (titles.length
    ? [`Collection achievements that need this game, which lock again: ${titles.join(', ')}.`]
    : []);

  async function clear({ title, deletes, keeps, confirmLabel, run }) {
    if (!await confirmDialog.ask({ title, deletes, keeps, confirmLabel })) return false;
    run();
    render();
    feedback.cue('button');
    return true;
  }

  function reset() {
    const { shellsFeathers: p } = profile.progress();
    return clear({
      title: 'Clear Shells & Feathers progress?',
      deletes: [
        `Your results against the Spirit: ${plural(p.spiritGames, 'game')}.`,
        `Two-player results on this device: ${plural(p.twoPlayerGames, 'game')}.`,
        ...(p.earlierGames ? [`Earlier games from before results were kept by mode: ${plural(p.earlierGames, 'game')}.`] : []),
        ...(p.sets ? [`Finished sets (best of 3 or 5): ${plural(p.sets, 'set')}.`] : []),
        `Shells & Feathers achievements: ${p.achievements} unlocked, which lock again.`,
        ...collectionLine(p.collection),
        'The totals kept for the first version of the game (spiritOfTheWoodsStats) go back to zero to match.',
      ],
      keeps: [
        'Your pieces and Spirit difficulty for Shells & Feathers.',
        'All Acorns & Leaves records and achievements.',
        'Sound and motion settings.',
      ],
      confirmLabel: 'Clear Shells & Feathers progress',
      run: () => profile.resetStats(),
    });
  }

  function resetAcornsLeaves() {
    const { acornsLeaves: p } = profile.progress();
    return clear({
      title: 'Clear Acorns & Leaves progress?',
      deletes: [
        `Classic results: ${plural(p.spiritGames, 'game')} against the Spirit, ${plural(p.twoPlayerGames, 'two-player game')}.`,
        `Fog of War results: ${plural(p.fogSpiritGames, 'game')} against the Spirit, ${plural(p.fogTwoPlayerGames, 'two-player game')}.`,
        ...(p.sets ? [`Finished sets (best of 3 or 5): ${plural(p.sets, 'set')}.`] : []),
        `Acorns & Leaves achievements: ${p.achievements} unlocked, which lock again.`,
        ...collectionLine(p.collection),
      ],
      keeps: [
        'Your side, rules and Spirit difficulty for Acorns & Leaves.',
        'All Shells & Feathers records and achievements.',
        'Sound and motion settings.',
      ],
      confirmLabel: 'Clear Acorns & Leaves progress',
      run: () => profile.resetAcornsLeavesStats(),
    });
  }

  return { render, reset, resetAcornsLeaves };
}
