import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnalytics } from '../../src/shared/analytics.js';
function harness({ dnt = '0', gpc = false, preference = null, fail = false } = {}) {
  const saved = new Map(preference ? [['spirit-woods-analytics', preference]] : []);
  const events = []; let config, loads = 0;
  const sdk = { init(key, options) { config = options; options.loaded(sdk); }, capture(event, properties) { const result = config.before_send({ event, properties }); if (result) events.push(result); }, opt_in_capturing() {}, opt_out_capturing() {} };
  const win = { navigator: { doNotTrack: dnt, globalPrivacyControl: gpc }, location: { search: '?utm_source=inspireclothing.art' }, localStorage: { getItem: k => saved.get(k), setItem: (k,v) => saved.set(k,v), removeItem: k => saved.delete(k) } };
  const a = createAnalytics({ win, doc: {}, loadConfig: async () => ({ key: 'phc_test', host: 'https://example.test' }), loadSDK: async () => { loads++; if (fail) throw Error('blocked'); return sdk; } });
  return { a, events, saved, get loads() { return loads; }, get config() { return config; } };
}
test('queues game events until ready and filters automatic URLs and unapproved properties', async () => {
  const h = harness(); h.a.capture('game_started', { game: 'SHELLS-FEATHERS', email: 'private@example.test' }); await h.a.init();
  assert.deepEqual(h.events.map(e => e.event), ['game_started', 'game_opened']);
  assert.equal(h.events[0].properties.source, 'inspireclothing.art');
  assert.equal(h.events[0].properties.email, undefined);
  assert.equal(h.config.autocapture, false); assert.equal(h.config.disable_session_recording, true);
  const event = h.config.before_send({ event: 'game_started', properties: { token: 'phc_test', distinct_id: 'random', $current_url: 'https://example.test/?email=secret', game: 'SHELLS-FEATHERS' } });
  assert.equal(event.properties.$current_url, undefined);
  assert.equal(event.properties.token, 'phc_test');
  assert.equal(h.config.before_send({ event: '$pageview', properties: {} }), null);
});
for (const option of [{ dnt: '1' }, { gpc: true }, { preference: 'off' }]) test('privacy signal prevents SDK loading '+JSON.stringify(option), async () => {
  const h=harness(option); await h.a.init(); h.a.capture('game_started'); assert.equal(h.loads,0); assert.equal(h.events.length,0);
});
test('opting out drops queued events and stops capture immediately', async () => {
  const h=harness(); h.a.capture('game_started'); h.a.setEnabled(false); await h.a.init(); assert.equal(h.loads,0);
  h.a.setEnabled(true); await h.a.init(); assert.deepEqual(h.events.map(e=>e.event),['game_opened']);
  h.a.setEnabled(false); h.a.capture('game_started'); assert.equal(h.events.length,1); assert.equal(h.saved.get('spirit-woods-analytics'),'off');
});
test('blocked SDK never rejects into the game', async () => { const h=harness({fail:true}); await assert.doesNotReject(h.a.init()); h.a.capture('game_started'); });

test('delete data removes analytics preference and stops sending', async () => { const h=harness(); await h.a.init(); h.a.setEnabled(false); h.a.clear(); h.a.capture('game_started'); assert.equal(h.saved.has('spirit-woods-analytics'),false); assert.equal(h.a.enabled(),false); });
