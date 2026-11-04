// Fits a screen or dialog to the window with Previous/Next pages instead of
// scrolling.
//
// Markup: a root marked data-pager holds a body (data-pager-body) and a nav
// (data-pager-nav, with data-pager-prev, data-pager-status and
// data-pager-next). Everything else in the root (the Back link, the title,
// the primary actions) stays put; the body gets the room left. Its items are
// its children, except that a child marked data-page-split lends its own
// children instead (a panel of settings rows, a list of achievements): the
// panel then shows on every page that has one of its items, and on no other.
//
// - Pages are filled item by item and end before the item that would not
//   fit, so nothing is ever cut off or hidden by clipping. A heading never
//   ends a page (it goes with what it introduces). An item too tall for any
//   page (none should be) gets a page of its own and simply overflows, so
//   it stays reachable by scrolling rather than hidden. A paragraph of
//   plain text too long for one page (a long translation, say) is first
//   split into its sentences, which then page like any other items; the
//   split is undone and worked out again whenever the pages are.
// - Items the app hides itself ([hidden]) stay out of the count; the pager
//   hides the others with the pager-off class only.
// - One page: no nav. More: "Page 2 of 3", with Previous and Next (disabled
//   at the ends; focus moves to the other one when a press disables the
//   focused button). The page is announced politely.
// - Pages are worked out again when the root appears (from page 1), when
//   the window is resized or rotated, and when the body's content changes;
//   the page then shown is the one holding the focused control, or else
//   the first item that was showing, so nothing jumps away from the reader.
const HEADINGS = new Set(['H2', 'H3', 'H4']);
const SENTENCE_END = /(?<=[.!?;:…])\s+/;

export function createPager({ root, win = globalThis }) {
  const body = root.querySelector('[data-pager-body]');
  const nav = root.querySelector('[data-pager-nav]');
  const prev = nav.querySelector('[data-pager-prev]');
  const next = nav.querySelector('[data-pager-next]');
  const status = nav.querySelector('[data-pager-status]');
  let pages = [[]];
  let index = 0;
  let busy = false;
  let shown = false; // the root has a size (is on screen)
  let size = '';
  let queued = false;

  const off = (el, hide) => el.classList.toggle('pager-off', hide);
  const isHeading = (el) => HEADINGS.has(el.tagName) || el.hasAttribute('data-page-heading');

  // The items and the split containers, in document order.
  function parts() {
    const items = [];
    const splits = [];
    const walk = (el) => {
      for (const child of el.children) {
        if (child.hasAttribute('data-page-split')) {
          splits.push(child);
          walk(child);
        } else {
          items.push(child);
        }
      }
    };
    walk(body);
    return { items, splits };
  }

  // A split container shows only when one of its items does.
  function sync(splits) {
    for (const split of [...splits].reverse()) {
      const any = [...split.children].some((el) => !el.hidden && !el.classList.contains('pager-off'));
      off(split, !any);
    }
  }

  const overflows = () => body.scrollHeight > body.clientHeight + 1;

  function render() {
    const { items, splits } = parts();
    const showing = new Set(pages[index]);
    for (const el of items) off(el, !showing.has(el));
    sync(splits);
    const many = pages.length > 1;
    nav.hidden = !many;
    root.dataset.page = String(index + 1);
    root.dataset.pages = String(pages.length);
    status.textContent = many ? `Page ${index + 1} of ${pages.length}` : '';
    prev.disabled = index === 0;
    next.disabled = index === pages.length - 1;
  }

  // Plain text only (no links, buttons or markup inside).
  const plainText = (el) => (el.tagName === 'P' || el.tagName === 'LI')
    && [...el.childNodes].every((node) => node.nodeType === 3);

  // Splits a paragraph into sentences, each an item of the page.
  function chunk(el) {
    const sentences = el.textContent.trim().split(SENTENCE_END).filter(Boolean);
    if (sentences.length < 2) return false;
    const doc = root.ownerDocument;
    el.replaceChildren(...sentences.map((text, i) => Object.assign(doc.createElement('span'), {
      textContent: i < sentences.length - 1 ? `${text} ` : text,
    })));
    el.setAttribute('data-page-split', '');
    el.setAttribute('data-pager-chunked', '');
    return true;
  }

  function unchunk() {
    for (const el of body.querySelectorAll('[data-pager-chunked]')) {
      el.removeAttribute('data-page-split');
      el.removeAttribute('data-pager-chunked');
      el.textContent = el.textContent; // the spans back into one text
    }
  }

  // Pages for these items; `oversized` collects items that fill a page
  // alone and still don't fit.
  function fill(live, splits, oversized = []) {
    for (const el of live) off(el, true);
    sync(splits);
    const result = [];
    let i = 0;
    while (i < live.length) {
      const page = [];
      while (i < live.length) {
        off(live[i], false);
        sync(splits);
        if (page.length && overflows()) {
          off(live[i], true);
          sync(splits);
          break;
        }
        page.push(live[i]);
        if (page.length === 1 && overflows()) oversized.push(live[i]);
        i += 1;
      }
      // A heading goes with what follows it.
      while (page.length > 1 && i < live.length && isHeading(page.at(-1))) {
        off(page.pop(), true);
        i -= 1;
      }
      for (const el of page) off(el, true);
      sync(splits);
      result.push(page);
    }
    return result.length ? result : [[]];
  }

  // Works the pages out again. keep: 'start' (page 1) or 'place'.
  function paginate(keep = 'place') {
    if (!root.getClientRects().length) {
      shown = false;
      return;
    }
    // Back on screen after being hidden: from the start, whichever change
    // (new content, or the new size) is noticed first.
    if (!shown) keep = 'start';
    busy = true;
    const focused = root.ownerDocument.activeElement;
    const anchor = (focused && body.contains(focused) ? focused : null) ?? pages[index]?.find((el) => el.isConnected) ?? null;
    unchunk();
    const layout = () => {
      const { items, splits } = parts();
      const live = items.filter((el) => !el.hidden);
      const oversized = [];
      // Without the nav first: everything may fit on one page.
      nav.hidden = true;
      let result = fill(live, splits, oversized);
      if (result.length > 1) {
        nav.hidden = false;
        oversized.length = 0;
        result = fill(live, splits, oversized);
      }
      return { result, oversized };
    };
    let { result, oversized } = layout();
    // A paragraph too long for any page: by its sentences instead.
    if (oversized.filter(plainText).map(chunk).some(Boolean)) ({ result, oversized } = layout());
    pages = result;
    index = 0;
    if (keep === 'place' && anchor) {
      const found = pages.findIndex((page) => page.some((el) => el === anchor || el.contains(anchor)));
      if (found >= 0) index = found;
    }
    render();
    size = `${root.clientWidth}x${win.innerHeight}`;
    shown = true;
    observer.takeRecords();
    busy = false;
  }

  function schedule(keep) {
    if (queued) return;
    queued = true;
    const run = () => {
      queued = false;
      paginate(keep);
    };
    if (win.requestAnimationFrame) win.requestAnimationFrame(run);
    else run();
  }

  function go(step) {
    const to = Math.min(pages.length - 1, Math.max(0, index + step));
    if (to === index) return;
    index = to;
    render();
    // A press that disables the focused button hands focus to the other.
    const doc = root.ownerDocument;
    if (doc.activeElement?.disabled) (step > 0 ? prev : next).focus();
  }

  prev.addEventListener('click', () => go(-1));
  next.addEventListener('click', () => go(1));

  const observer = new win.MutationObserver(() => {
    if (!busy) schedule('place');
  });
  observer.observe(body, {
    subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden'],
  });

  // Appearing (a screen shown, a dialog opened) starts at page 1; a new size
  // (resize, rotation) keeps the place.
  const onSize = () => {
    const visible = root.getClientRects().length > 0;
    if (!visible) {
      shown = false;
      return;
    }
    if (busy) return;
    if (!shown) {
      paginate('start');
      return;
    }
    if (`${root.clientWidth}x${win.innerHeight}` !== size) schedule('place');
  };
  if (win.ResizeObserver) new win.ResizeObserver(onSize).observe(root);
  win.addEventListener('resize', onSize);

  return {
    refresh: (keep = 'place') => paginate(keep),
    go,
    get page() { return index + 1; },
    get pages() { return pages.length; },
  };
}

// Every pager on the page.
export function createPagers({ doc, win }) {
  return [...doc.querySelectorAll('[data-pager]')].map((root) => createPager({ root, win }));
}
