// Optional anonymous product analytics. Gameplay never waits for this service.
const PREFERENCE = 'spirit-woods-analytics';
const EVENTS = new Set(['game_opened', 'game_started', 'game_resumed', 'round_completed', 'game_completed', 'game_over', 'achievement_unlocked']);
const FIELDS = ['game', 'mode', 'difficulty', 'variant', 'outcome', 'achievement'];
export function createAnalytics({ win, doc, loadSDK, loadConfig } = {}) {
  let sdk, loading, pending = [], opened = false;
  const blocked = () => win.navigator.doNotTrack === '1' || win.doNotTrack === '1' || win.navigator.globalPrivacyControl === true;
  let preference = true;
  try { preference = win.localStorage.getItem(PREFERENCE) !== 'off'; } catch {}
  const allowed = () => preference && !blocked();
  const source = () => {
    try {
      const q = new URLSearchParams(win.location.search);
      const v = q.get('source') || q.get('utm_source');
      return v && /^[\w.:-]{1,60}$/.test(v) ? v : 'web';
    } catch { return 'web'; }
  };
  function capture(event, props = {}) {
    if (!allowed() || !EVENTS.has(event)) return;
    try {
      const safe = { brand: 'INSPIRE', suite: 'spirit_of_the_woods', game: 'SHELLS-FEATHERS', game_version: '2', source: source(), $geoip_disable: true, $process_person_profile: false };
      for (const field of FIELDS) if (typeof props[field] === 'string' && /^[\w .:-]{1,80}$/.test(props[field])) safe[field] = props[field];
      if (sdk) sdk.capture(event, safe);
      else if (pending.length < 50) pending.push([event, safe]);
    } catch { /* blocked analytics must not interrupt play */ }
  }
  async function init() {
    if (!allowed()) return;
    if (sdk) { sdk.opt_in_capturing(); return; }
    if (loading) return loading;
    loading = (async () => {
      try {
        const config = await (loadConfig ? loadConfig() : win.fetch(new URL('assets/posthog-config.json', doc.baseURI)).then(r => r.ok ? r.json() : null));
        if (!config?.key || !config?.host || !allowed()) { pending = []; return; }
        const api = loadSDK ? await loadSDK() : await new Promise((resolve, reject) => {
          const script = doc.createElement('script');
          script.src = `${config.host.replace('.i.posthog.com', '-assets.i.posthog.com')}/static/${config.sdkVersion}/array.js`;
          script.async = true;
          script.onload = () => resolve(win.posthog);
          script.onerror = reject;
          doc.head.appendChild(script);
        });
        if (!allowed()) { pending = []; return; }
        api.init(config.key, {
          api_host: config.host, defaults: '2026-08-30',
          persistence: 'localStorage', cross_subdomain_cookie: false,
          person_profiles: 'never', autocapture: false, rageclick: false,
          capture_dead_clicks: false, capture_pageview: false, capture_pageleave: false,
          capture_exceptions: false, capture_performance: false,
          disable_session_recording: true, disable_surveys: true, advanced_disable_flags: true,
          before_send(event) {
            if (!allowed() || !EVENTS.has(event.event)) return null;
            // Drop automatic URLs, query strings, referrers and SDK metadata.
            const p = event.properties || {};
            event.properties = Object.fromEntries(['token', 'distinct_id', '$device_id', '$insert_id', '$session_id', '$lib', '$lib_version', 'brand', 'suite', 'game_version', 'source', '$geoip_disable', '$process_person_profile', ...FIELDS].filter(k => k in p).map(k => [k, p[k]]));
            return event;
          },
          loaded(instance) {
            sdk = instance;
            if (!allowed()) { sdk.opt_out_capturing(); pending = []; return; }
            for (const [event, props] of pending.splice(0)) sdk.capture(event, props);
            if (!opened) { opened = true; capture('game_opened'); }
          },
        });
      } catch { pending = []; } finally { loading = null; }
    })();
    return loading;
  }
  function setEnabled(on) {
    preference = Boolean(on);
    try { win.localStorage.setItem(PREFERENCE, preference ? 'on' : 'off'); } catch {}
    if (!allowed()) { pending = []; try { sdk?.opt_out_capturing(); } catch {} }
    else void init();
  }
  function clear() {
    preference = false;
    pending = [];
    try {
      sdk?.opt_out_capturing({ clear_persistence: true });
      sdk?.clear_opt_in_out_capturing?.({ enable_persistence: false });
      win.localStorage.removeItem(PREFERENCE);
    } catch {}
  }
  return { init, capture, setEnabled, clear, enabled: () => allowed() };
}
