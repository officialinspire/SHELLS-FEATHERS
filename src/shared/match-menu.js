// The match menu, the same in both games: a "Menu" button in the match
// header opens a "Paused" panel with the actions a player needs only now and
// then (Resume, Restart, Change Mode, All Games), so the board can have the
// screen. While it is open the match is paused (onOpen/onClose: the session
// holds the Spirit's timers) and the screen behind it is inert. Resume,
// Escape or a tap on the dimmed backdrop closes it.
export function createMatchMenu({ doc, menu, opener, screen, onOpen = () => {}, onClose = () => {} }) {
  const isOpen = () => menu.classList.contains('active');

  function open() {
    if (isOpen()) return;
    menu.classList.add('active');
    screen.inert = true;
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
    opener.setAttribute('aria-expanded', 'false');
    onClose();
    if (focus && hadFocus) opener.focus();
  }

  opener.addEventListener('click', open);
  menu.querySelector('[data-menu-close]').addEventListener('click', () => close());
  menu.addEventListener('click', (event) => {
    if (event.target === menu) close();
  });
  menu.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen()) return;
    event.preventDefault();
    close();
  });

  return { open, close, isOpen };
}
