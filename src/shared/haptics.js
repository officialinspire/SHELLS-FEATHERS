// Optional vibration, through navigator.vibrate where the browser has it.
//
// - Feature-detected: no vibrate(), or a page the browser doesn't let
//   vibrate (permissions policy), and every pulse is a no-op. The games
//   never depend on it.
// - Off unless the player turns it on (Settings > Haptics).
// - Short and few: a pattern is at most MAX_TOTAL_MS of vibration, pulses
//   closer than MIN_GAP_MS to the last one are dropped (never queued), and a
//   cue can ask for a longer gap of its own (`every`), so a refused tap
//   repeated quickly buzzes once, not again and again.
// - Held while the match is paused or the page hidden: nothing vibrates,
//   and one in progress is stopped (vibrate(0)).
// - vibrate() can throw or return false (no user gesture yet, a setting in
//   the device, a browser rule). Either is caught; `status` reports what
//   happened for Settings to explain.
export const HAPTICS = { MIN_GAP_MS: 90, MAX_TOTAL_MS: 120 };

export function createHaptics({ nav = globalThis.navigator, doc = globalThis.document, clock = globalThis, enabled = false } = {}) {
  // A policy only counts if the browser knows vibrate as a policy feature:
  // Chromium doesn't, and answers false to allowsFeature('vibrate') even
  // where vibration works.
  const policy = doc?.featurePolicy;
  const policyKnows = policy?.features?.().includes?.('vibrate') ?? false;
  const policyAllows = policyKnows ? policy.allowsFeature('vibrate') : true;
  const supported = typeof nav?.vibrate === 'function' && policyAllows;
  let on = enabled;
  let lastAt = -Infinity;
  const lastByKey = new Map();
  let refused = false; // the browser declined the last pulse
  const holds = new Set();
  const now = () => clock.performance?.now?.() ?? Date.now();

  function call(pattern) {
    try {
      return nav.vibrate(pattern) !== false;
    } catch {
      return false;
    }
  }

  return {
    get supported() { return supported; },
    get enabled() { return on; },
    // 'unsupported' | 'off' | 'refused' (asked, but the browser declined) | 'on'
    get status() {
      if (!supported) return 'unsupported';
      if (!on) return 'off';
      return refused ? 'refused' : 'on';
    },
    setEnabled(value) {
      on = Boolean(value);
      if (!on) this.cancel();
    },
    // pattern: ms of vibration, or [on, off, on, …]. key + every: a gap of
    // its own for this kind of pulse. Returns whether it was asked for.
    pulse(pattern, { key, every = 0 } = {}) {
      if (!supported || !on || holds.size) return false;
      const steps = (Array.isArray(pattern) ? pattern : [pattern]).map((ms) => Math.max(0, Math.round(ms)));
      const total = steps.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0);
      if (!total || total > HAPTICS.MAX_TOTAL_MS) return false;
      const at = now();
      if (at - lastAt < HAPTICS.MIN_GAP_MS) return false;
      if (key && at - (lastByKey.get(key) ?? -Infinity) < every) return false;
      lastAt = at;
      if (key) lastByKey.set(key, at);
      refused = !call(steps.length === 1 ? steps[0] : steps);
      return !refused;
    },
    // Stops a vibration in progress. Only asked of the browser shortly after
    // a pulse: there is nothing to stop otherwise.
    cancel() {
      if (supported && now() - lastAt < 1000) call(0);
    },
    hold(reason) {
      holds.add(reason);
      this.cancel();
    },
    release(reason) {
      holds.delete(reason);
    },
  };
}
