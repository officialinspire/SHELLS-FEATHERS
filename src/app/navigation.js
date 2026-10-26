// Shows one `.screen` at a time. Each screen may have hooks: leave() runs
// before another screen opens, so the screen can tear down what it started;
// enter(...args) runs after it becomes visible.
export function createNavigator(doc, hooks = {}) {
  const screens = [...doc.querySelectorAll('.screen')];
  let current = screens.find((s) => s.classList.contains('active'))?.id ?? null;

  return {
    get current() { return current; },
    show(id, ...args) {
      if (!screens.some((s) => s.id === id)) throw new Error(`Unknown screen: ${id}`);
      if (current) hooks[current]?.leave?.();
      for (const screen of screens) screen.classList.toggle('active', screen.id === id);
      current = id;
      hooks[id]?.enter?.(...args);
    },
  };
}
