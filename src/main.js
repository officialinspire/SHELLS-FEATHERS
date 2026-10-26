// Entry point (loaded as a module, so the DOM is already parsed).
import { createApp } from './app/app.js';

createApp({ doc: document, win: window }).init();

if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .catch(() => { /* A blocked service worker never blocks gameplay. */ });
  }, { once: true });
}
