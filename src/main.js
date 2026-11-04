// Entry point (loaded as a module, so the DOM is already parsed).
import { createApp } from './app/app.js';

createApp({ doc: document, win: window }).init();
