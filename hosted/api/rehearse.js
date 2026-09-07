import { randomBytes } from 'node:crypto';
import { authorized } from '../lib/auth.js';
import { Store } from '../lib/state.js';
import { runCheck, reportError } from '../lib/monitor.js';
import { expired } from '../lib/config.js';

// Full-path rehearsal: runs the real monitor code against a random string that cannot be on the page,
// using a separate Redis key set. Exercises fetch → missing → confirm → claim → alert → nag bookkeeping.
// Cron: Wednesdays (high priority, doubles as mid-week heartbeat). Manual: ?secret=...&emergency=1 for the siren.
export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  const real = new Store('sa:');
  if (expired()) return res.json({ skipped: 'retired' });
  const url = new URL(req.url, 'http://x');
  const emergency = url.searchParams.get('emergency') === '1';
  const store = new Store('sa:rehearsal:');
  const target = `rehearsal-${randomBytes(12).toString('hex')}`;
  const started = Date.now();
  try {
    await store.clear();
    const out = await runCheck({ store, target, label: '[REHEARSAL]', emergency });
    const ok = out.result === 'alerted';
    const history = await store.history(10);
    await store.clear();
    await real.save({ lastRehearsalAt: new Date().toISOString(), lastRehearsalOk: ok ? '1' : '0' });
    await real.event(`rehearsal ${ok ? 'PASSED' : 'FAILED'} (${out.result}) in ${Date.now() - started}ms${emergency ? ' [emergency]' : ''}`);
    return res.status(ok ? 200 : 500).json({ ok, target, ms: Date.now() - started, outcome: out, timeline: history.reverse() });
  } catch (err) {
    await reportError(real, 'api/rehearse', err);
    await real.save({ lastRehearsalAt: new Date().toISOString(), lastRehearsalOk: '0' });
    return res.status(500).json({ ok: false, error: String(err?.message || err) });
  }
}
