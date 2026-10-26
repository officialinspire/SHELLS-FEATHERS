// Safe access to localStorage. Every call is guarded, so storage that is
// blocked, full or missing degrades to "not saved" instead of breaking the game.
export function openStorage(getArea = () => globalThis.localStorage) {
  let area = null;
  try { area = getArea() ?? null; } catch { area = null; }

  return {
    read(key) {
      try { return area ? area.getItem(key) : null; } catch { return null; }
    },
    // Removes `key`; true when it is gone afterwards.
    remove(key) {
      try {
        if (!area) return false;
        area.removeItem(key);
        return area.getItem(key) === null;
      } catch {
        return false;
      }
    },
    write(key, value) {
      try {
        if (!area) return false;
        area.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
  };
}

// { status: 'missing' } | { status: 'ok', value, raw } | { status: 'corrupt', raw }
export function readJson(store, key) {
  const raw = store.read(key);
  if (raw === null) return { status: 'missing' };
  try {
    return { status: 'ok', value: JSON.parse(raw), raw };
  } catch {
    return { status: 'corrupt', raw };
  }
}
