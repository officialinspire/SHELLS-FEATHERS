// The achievement journal: every achievement of both games and the
// Collection, in four tabs (All, Shells & Feathers, Acorns & Leaves,
// Collection). Each entry shows its icon in a medallion (gold once
// unlocked), what earns it, how far it has come where that means something,
// and when it was unlocked.
//
// The tabs follow the ARIA tabs pattern: arrow keys, Home and End move
// between them and show each at once. Each tab has its own URL
// (#/journal/<book>), so Your Path can link to a game's page and a reload
// keeps the tab; changing tabs replaces the URL instead of adding history.
import { BOOKS, SECTIONS } from '../shared/achievements.js';
import { svgIcon } from '../shared/icons.js';

export const JOURNAL_TABS = ['all', 'shellsFeathers', 'acornsLeaves', 'collection'];
export const TAB_PATHS = {
  all: '/journal', shellsFeathers: '/journal/shells-feathers', acornsLeaves: '/journal/acorns-leaves', collection: '/journal/collection',
};
const UNIT = { games: ['game', 'games'] };

// "3 of 10 games", "2 of 4"
export function progressText({ value, goal, unit }) {
  const [, many] = UNIT[unit] ?? ['', ''];
  return `${value} of ${goal}${many ? ` ${many}` : ''}`;
}

export function stateText(entry, dateText) {
  if (!entry.unlocked) return 'Locked';
  return entry.at === null ? 'Unlocked before dates were kept' : `Unlocked ${dateText(entry.at)}`;
}

const defaultDate = (ms) => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export function createJournalScreen({
  doc, profile, onTab = () => {}, dateText = defaultDate,
}) {
  const byId = (id) => doc.getElementById(id);
  const tabs = JOURNAL_TABS.map((tab) => byId(`journal-tab-${tab}`));
  const panel = byId('journal-panel');
  let current = 'all';

  const make = (tag, props = {}, children = [], attrs = {}) => {
    const el = Object.assign(doc.createElement(tag), props);
    for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    el.append(...children);
    return el;
  };

  function entryItem(book, entry) {
    const body = [
      make('span', { className: 'entry-head' }, [
        make('strong', { className: 'entry-title', textContent: entry.title }),
        make('span', { className: 'entry-state', textContent: stateText(entry, dateText) }),
      ]),
      make('span', { className: 'entry-desc', textContent: entry.description }),
    ];
    if (entry.note && !entry.unlocked) body.push(make('span', { className: 'entry-note', textContent: entry.note }));
    if (entry.progress && !entry.unlocked) {
      const share = entry.progress.goal ? entry.progress.value / entry.progress.goal : 0;
      const bar = make('span', { className: 'progress-bar' }, [make('span', { className: 'progress-fill' })], { 'aria-hidden': 'true' });
      bar.firstChild.style.width = `${Math.round(share * 100)}%`;
      body.push(make('span', { className: 'entry-progress' }, [bar, make('span', { className: 'progress-text', textContent: progressText(entry.progress) })]));
      if (entry.progress.parts) {
        body.push(make('span', { className: 'entry-parts' }, entry.progress.parts.map((part) => make('span', {
          className: `entry-part ${part.done ? 'is-done' : ''}`.trim(),
          textContent: `${BOOKS[part.book]}: ${part.title}${part.done ? ' (done)' : ''}`,
        }))));
      }
    }
    return make('li', { className: `journal-entry ${entry.unlocked ? 'is-unlocked' : 'is-locked'}` }, [
      make('span', { className: 'medal' }, [svgIcon(doc, `#${entry.icon}`, 'medal-icon', '0 0 24 24')], { 'aria-hidden': 'true' }),
      make('span', { className: 'entry-body' }, body),
    ], { 'data-book': book, 'data-id': entry.id });
  }

  const countText = (entries) => `${entries.filter((e) => e.unlocked).length} of ${entries.length}`;

  // One book's entries, under a heading for each part of the book.
  function bookSections(book, entries, level) {
    const sections = [...new Set(entries.map((e) => e.section))];
    return sections.flatMap((section) => [
      make(`h${level}`, { className: 'journal-section', textContent: SECTIONS[section] }),
      make('ul', { className: 'journal-list' }, entries.filter((e) => e.section === section).map((e) => entryItem(book, e))),
    ]);
  }

  function render() {
    const journal = profile.journal();
    byId('journal-summary').textContent = `${journal.unlocked} of ${journal.total} achievements unlocked`;
    byId('journal-storage-note').hidden = !profile.saveFailing();
    for (const [i, tab] of JOURNAL_TABS.entries()) {
      const entries = tab === 'all' ? journal.books.flatMap((b) => b.entries) : journal.books.find((b) => b.book === tab).entries;
      tabs[i].querySelector('.tab-count').textContent = countText(entries);
      const selected = tab === current;
      tabs[i].setAttribute('aria-selected', String(selected));
      tabs[i].tabIndex = selected ? 0 : -1;
    }
    panel.setAttribute('aria-labelledby', `journal-tab-${current}`);
    panel.dataset.tab = current;
    if (current === 'all') {
      panel.replaceChildren(...journal.books.flatMap(({ book, title, entries }) => [
        make('h3', { className: 'journal-book' }, [title, ' ', make('span', { className: 'journal-book-count', textContent: `(${countText(entries)})` })]),
        ...bookSections(book, entries, 4),
      ]));
    } else {
      const { entries } = journal.books.find((b) => b.book === current);
      panel.replaceChildren(...bookSections(current, entries, 3));
    }
  }

  function select(tab, { focus = false } = {}) {
    current = JOURNAL_TABS.includes(tab) ? tab : 'all';
    render();
    if (focus) tabs[JOURNAL_TABS.indexOf(current)].focus();
  }

  for (const [i, tab] of tabs.entries()) {
    tab.addEventListener('click', () => {
      select(JOURNAL_TABS[i]);
      onTab(current);
    });
    tab.addEventListener('keydown', (event) => {
      const last = tabs.length - 1;
      const to = { ArrowRight: i === last ? 0 : i + 1, ArrowLeft: i === 0 ? last : i - 1, Home: 0, End: last }[event.key];
      if (to === undefined) return;
      event.preventDefault();
      select(JOURNAL_TABS[to], { focus: true });
      onTab(current);
    });
  }

  return {
    // Shows the journal on `tab` (from the route).
    show(tab = 'all') { select(tab); },
    render,
    get tab() { return current; },
  };
}
