import { authorized } from '../lib/auth.js';
import { notify } from '../lib/notify.js';
import { Store } from '../lib/state.js';
import { expired } from '../lib/config.js';

// Weekly "still alive" notice (Sundays). Wednesdays are covered by the rehearsal.
export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  const store = new Store('sa:');
  const s = await store.load();
  if (s.alerted) return res.json({ skipped: 'already alerted' });
  if (expired()) return res.json({ skipped: 'retired' });
  const out = await notify(`Studio Alert weekly heartbeat: still watching. ${s.total} checks so far, last good check ${s.lastOk || 'never'}, consecutive failures ${s.fails}, last rehearsal ${s.lastRehearsalAt || 'never'} (${s.lastRehearsalOk === '1' ? 'passed' : 'not passed'}).`);
  await store.event(`heartbeat ${out.ok ? 'sent' : 'FAILED'}: ${out.detail}`);
  res.status(out.ok ? 200 : 500).json(out);
}
