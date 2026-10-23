// "Your Sacred Journey": lifetime totals (v1 meaning: Victories include
// two-player wins) and "Clear Path".
export function createStatsScreen({ doc, profile, audio, confirm }) {
  function render() {
    const { wins, losses, draws, totalGames } = profile.statsSummary();
    doc.getElementById('wins-count').textContent = wins;
    doc.getElementById('losses-count').textContent = losses;
    doc.getElementById('draws-count').textContent = draws;
    doc.getElementById('total-games').textContent = totalGames;
  }

  function reset() {
    if (!confirm('Clear all journey records?')) return;
    profile.resetStats();
    render();
    audio.playSfx('button-select');
  }

  return { render, reset };
}
