// Public browser ingestion configuration only. Never put personal/admin tokens here.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
const key = process.env.POSTHOG_KEY?.trim();
const host = process.env.POSTHOG_HOST?.trim();
if (!key?.startsWith('phc_') || !host?.startsWith('https://')) throw new Error('Set POSTHOG_KEY and POSTHOG_HOST');
const sdkVersion = JSON.parse(readFileSync('node_modules/posthog-js/package.json', 'utf8')).version;
mkdirSync('assets', { recursive: true });
writeFileSync('assets/posthog-config.json', JSON.stringify({ key, host, sdkVersion }) + '\n');
