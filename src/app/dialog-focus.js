// Keeps the keyboard inside whichever dialog is open: the result dialogs, the
// delete-data dialog and the Fog handoff screen. Tab and Shift+Tab wrap
// around its controls instead of leaving for the page behind it (which is
// inert, so focus would otherwise drop to the page itself). Escape reaches
// the open dialog even when focus is outside it, e.g. after a click on its
// backdrop; each dialog decides what Escape does (the handoff ignores it).
const OPEN = '.modal.active, .handoff:not([hidden])';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function installDialogFocus(doc) {
  doc.addEventListener('keydown', (event) => {
    const dialog = [...doc.querySelectorAll(OPEN)].at(-1);
    if (!dialog) return;
    const inside = dialog.contains(doc.activeElement);
    if (event.key === 'Escape') {
      if (inside) return; // the dialog's own handler has it
      event.preventDefault();
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    const wrap = event.shiftKey ? !inside || doc.activeElement === first : !inside || doc.activeElement === last;
    if (!wrap) return;
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  });
}
