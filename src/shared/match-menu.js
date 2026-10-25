// The match menu, the same in both games: a "Menu" button in the match
// header opens a "Paused" panel with the actions a player needs only now and
// then (Resume, Settings, Restart, Change Mode, All Games), so the board can
// have the screen. While it is open the match is paused (onOpen/onClose: the
// session holds the Spirit's timers) and the screen behind it is inert.
//
// Settings swaps the panel for sound and motion controls (onSettings shows
// the saved values); the match stays paused, and Done or Escape goes back to
// the Paused view. On the Paused view, Resume, Escape or a click on the
// dimmed backdrop closes the menu, and focus goes back to the Menu button.
export function createMatchMenu({
  doc, menu, opener, screen, onOpen = () => {}, onClose = () => {}, onSettings = () => {},
}) {
  const views = {
    pause: menu.querySelector('[data-menu-view="pause"]'),
    settings: menu.querySelector('[data-menu-view="settings"]'),
  };
  const titles = { pause: views.pause.querySelector('h3').id, settings: views.settings.querySelector('h3').id };
  const settingsButton = menu.querySelector('[data-menu-settings]');
  const isOpen = () => menu.classList.contains('active');
  const showing = () => (views.settings.hidden ? 'pause' : 'settings');

  function show(view) {
    views.pause.hidden = view !== 'pause';
    views.settings.hidden = view !== 'settings';
    menu.setAttribute('aria-labelledby', titles[view]);
  }

  function open() {
    if (isOpen()) return;
    show('pause');
    menu.classList.add('active');
    screen.inert = true;
    screen.classList.add('is-paused');
    opener.setAttribute('aria-expanded', 'true');
    onOpen();
    menu.querySelector('[data-menu-close]').focus();
  }

  // focus: return focus to the Menu button (when it was in the panel).
  function close({ focus = true } = {}) {
    if (!isOpen()) return;
    const hadFocus = menu.contains(doc.activeElement);
    menu.classList.remove('active');
    screen.inert = false;
    screen.classList.remove('is-paused');
    opener.setAttribute('aria-expanded', 'false');
    show('pause');
    onClose();
    if (focus && hadFocus) opener.focus();
  }

  function openSettings() {
    onSettings();
    show('settings');
    views.settings.querySelector('h3').focus();
  }

  function backToPause() {
    show('pause');
    settingsButton.focus();
  }

  opener.addEventListener('click', open);
  menu.querySelector('[data-menu-close]').addEventListener('click', () => close());
  settingsButton.addEventListener('click', openSettings);
  menu.querySelector('[data-menu-back]').addEventListener('click', backToPause);
  menu.addEventListener('click', (event) => {
    if (event.target === menu) close();
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    event.preventDefault();
    if (showing() === 'settings') backToPause();
    else close();
  });

  return { open, close, isOpen };
}
