// Timers that belong to an owner such as a match. dispose() cancels everything
// still pending and turns later after() calls into no-ops, so a callback can
// never act on state its owner has already torn down.
export function createTimerScope(clock = globalThis) {
  const pending = new Set();
  let disposed = false;

  return {
    after(ms, fn) {
      if (disposed) return;
      const id = clock.setTimeout(() => {
        pending.delete(id);
        if (!disposed) fn();
      }, ms);
      pending.add(id);
    },
    dispose() {
      disposed = true;
      for (const id of pending) clock.clearTimeout(id);
      pending.clear();
    },
    get pendingCount() { return pending.size; },
  };
}
