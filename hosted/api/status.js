import { authorized } from '../lib/auth.js';
import { Store } from '../lib/state.js';
import { TARGET_STRING, PAGE_URL, EXPIRES_AT } from '../lib/config.js';

// Read-only status. Requires ?secret= so strangers cannot burn the Redis quota. Costs 2 Redis commands per load.
export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  const store = new Store('sa:');
  const [s, history] = await Promise.all([store.load(), store.history(20)]);
  const lastAt = s.lastAt ? Date.parse(s.lastAt) : 0;
  const ageSec = lastAt ? Math.round((Date.now() - lastAt) / 1000) : null;
  res.setHeader('cache-control', 'no-store');
  res.json({
    watching: PAGE_URL,
    target: TARGET_STRING,
    expiresAt: new Date(EXPIRES_AT).toISOString(),
    status: s.retired ? 'RETIRED' : s.alerted ? 'ALERTED' : s.alertPending ? 'ALERT_PENDING_SEND' : s.failAlerted ? 'FAILING' : 'watching',
    lastCheckAgeSec: ageSec,
    stale: !s.retired && (ageSec === null || ageSec > 180),
    ...s,
    receipt: s.receipt ? '(set)' : null,
    history,
  });
}
