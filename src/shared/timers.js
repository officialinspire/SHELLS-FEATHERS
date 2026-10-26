// Timers that belong to an owner such as a match. dispose() cancels everything
// still pending and turns later after() calls into no-ops, so a callback can
// never act on state its owner has already torn down.
//
// pause() holds every pending timer (and any added while paused) with the
// time it had left; resume() starts them again from there. The match menu
// uses it, so the Spirit never moves, and no result appears, behind it.
export function createTimerScope(clock = globalThis) {
  const pending = new Map(); // id -> { fn, due }
  const held = []; // { fn, left } while paused
  let disposed = false;
  let paused = false;
  const now = () => clock.performance?.now?.() ?? Date.now();

  function start(ms, fn) {
    const id = clock.setTimeout(() => {
      pending.delete(id);
      if (!disposed) fn();
    }, ms);
    pending.set(id, { fn, due: now() + ms });
  }

  return {
    after(ms, fn) {
      if (disposed) return;
      if (paused) held.push({ fn, left: ms });
      else start(ms, fn);
    },
    pause() {
      if (disposed || paused) return;
      paused = true;
      const at = now();
      for (const [id, { fn, due }] of pending) {
        clock.clearTimeout(id);
        held.push({ fn, left: Math.max(0, due - at) });
      }
      pending.clear();
    },
    resume() {
      if (disposed || !paused) return;
      paused = false;
      for (const { fn, left } of held.splice(0)) start(left, fn);
    },
    dispose() {
      disposed = true;
      for (const id of pending.keys()) clock.clearTimeout(id);
      pending.clear();
      held.length = 0;
    },
    get pendingCount() { return pending.size + held.length; },
    get paused() { return paused; },
  };
}
