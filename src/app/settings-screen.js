// Settings: what every game shares. Music and sound effects (each with an
// on/off switch and its own volume), motion (follow the device, reduce or
// full), and deleting all saved data. Each game's own options (pieces, side,
// rules, difficulty) stay on that game's setup screen.
//
// The sound and motion controls are shared with the match menus
// (sound-motion.js): every change applies at once and is saved.
import { createSoundMotion, applyMotion } from './sound-motion.js';

export { applyMotion };

export function initSettingsScreen({
  doc, win, profile, audio, haptics, feedback, confirmDialog, onDeletedAll,
}) {
  const byId = (id) => doc.getElementById(id);
  const showStorage = () => {
    byId('settings-storage-note').hidden = !profile.saveFailing();
  };
  const controls = createSoundMotion({
    doc, root: byId('settings-screen'), win, profile, audio, haptics, feedback, onSaved: showStorage,
  });

  function show() {
    controls.show();
    showStorage();
  }

  async function deleteAll() {
    const agreed = await confirmDialog.ask({
      title: 'Delete all saved data?',
      deletes: [
        'Every Shells & Feathers and Acorns & Leaves record, Classic and Fog of War, against the Spirit and two-player.',
        'Every achievement in both games.',
        'Your choices on each game’s screen: pieces, side, rules and difficulty.',
        'These settings: sound, volumes and motion go back to their defaults.',
        'The record kept by the first version of the game (spiritOfTheWoodsStats), and any damaged copies set aside.',
      ],
      keeps: ['Nothing else stored in this browser.'],
      confirmLabel: 'Delete all saved data',
    });
    if (!agreed) return;
    const ok = profile.deleteAllData();
    onDeletedAll(ok);
  }

  show();
  return { show, deleteAll };
}
