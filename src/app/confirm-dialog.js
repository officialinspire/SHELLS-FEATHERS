// The "Are you sure?" dialog for deleting saved data. It lists exactly what
// will be deleted and what is kept, and offers Cancel (focused first) and the
// destructive action. Escape or Cancel keeps everything.
//
// ask({ title, deletes, keeps, confirmLabel }) resolves to true only when the
// player presses the confirm button. While it is open the rest of the page is
// inert; afterwards focus returns to the control that opened it.
export function createConfirmDialog(doc) {
  const dialog = doc.getElementById('confirm-dialog');
  const title = doc.getElementById('confirm-title');
  const deletes = doc.getElementById('confirm-deletes');
  const keeps = doc.getElementById('confirm-keeps');
  const keepsLead = doc.getElementById('confirm-keeps-lead');
  const accept = doc.getElementById('confirm-accept');
  const cancel = doc.getElementById('confirm-cancel');
  let settle = null;
  let opener = null;
  let covered = [];

  const items = (list) => list.map((text) => Object.assign(doc.createElement('li'), { textContent: text }));

  function close(answer) {
    if (!settle) return;
    const done = settle;
    settle = null;
    dialog.classList.remove('active');
    for (const el of covered) el.inert = false;
    covered = [];
    opener?.focus?.();
    opener = null;
    done(answer);
  }

  accept.addEventListener('click', () => close(true));
  cancel.addEventListener('click', () => close(false));
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    close(false);
  });

  return {
    ask({ title: heading, deletes: deleted, keeps: kept = [], confirmLabel = 'Delete' }) {
      close(false); // only one question at a time
      title.textContent = heading;
      deletes.replaceChildren(...items(deleted));
      keeps.replaceChildren(...items(kept));
      keeps.hidden = keepsLead.hidden = kept.length === 0;
      accept.textContent = confirmLabel;
      opener = doc.activeElement;
      covered = [...doc.querySelectorAll('.screen.active')];
      for (const el of covered) el.inert = true;
      dialog.classList.add('active');
      cancel.focus();
      return new Promise((resolve) => { settle = resolve; });
    },
    close: () => close(false),
    get open() { return settle !== null; },
  };
}
