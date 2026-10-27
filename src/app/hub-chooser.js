// Keep one game card in view on phones. On wider screens CSS shows both cards.
// The choice lasts while navigating the app, so returning from a game keeps
// its card in view. No saved preference or route change is needed.
export function initHubChooser(doc, win, onSelect = () => {}) {
  const hub = doc.getElementById('hub-screen');
  const buttons = [...hub.querySelectorAll('[data-hub-game]')];
  const narrow = win.matchMedia('(max-width: 719px)');

  function choose(game, { focus = false } = {}) {
    hub.dataset.game = game;
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset.hubGame === game));
    }
    if (focus) buttons.find((button) => button.dataset.hubGame === game)?.focus();
  }

  for (const [index, button] of buttons.entries()) {
    button.addEventListener('click', () => {
      if (hub.dataset.game !== button.dataset.hubGame) onSelect();
      choose(button.dataset.hubGame);
    });
    button.addEventListener('keydown', (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      if (hub.dataset.game !== buttons[next].dataset.hubGame) onSelect();
      choose(buttons[next].dataset.hubGame, { focus: true });
    });
  }

  // A rotated phone can hide the card that held focus. Move focus to its
  // selector so keyboard and switch users never lose their place.
  const rescueFocus = () => {
    if (!narrow.matches) return;
    const focused = doc.activeElement;
    const hiddenCard = focused?.closest?.('.game-card');
    if (hiddenCard && hiddenCard.getClientRects().length === 0) {
      buttons.find((button) => button.dataset.hubGame === hub.dataset.game)?.focus();
    }
  };
  narrow.addEventListener?.('change', rescueFocus);
  choose(hub.dataset.game || 'sf');
}
