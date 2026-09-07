import { authorized } from '../lib/auth.js';
import { Store } from '../lib/state.js';
import { runCheck, reportError } from '../lib/monitor.js';
import { notify } from '../lib/notify.js';
import { TARGET_STRING } from '../lib/config.js';

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  if (!process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL) {
    return res.status(503).json({ error: 'Redis not connected' });
  }
  const store = new Store('sa:');
  const url = new URL(req.url, 'http://x');
  try {
    // Manual test of the notifier only: /api/check?secret=...&test=1 (&emergency=1 for the siren variant).
    if (url.searchParams.get('test')) {
      const out = await notify('Studio Alert test: hosted monitor is live and checking the Mac Studio page every minute.', { emergency: url.searchParams.get('emergency') === '1' });
      await store.event(`test notify: ${out.detail}`);
      return res.status(out.ok ? 200 : 500).json(out);
    }
    return res.json(await runCheck({ store, target: TARGET_STRING, emergency: true }));
  } catch (err) {
    await reportError(store, 'api/check', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}
