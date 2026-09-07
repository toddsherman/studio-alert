import { authorized } from '../lib/auth.js';

// Diagnostic: delivery/acknowledgement status of an emergency-priority Pushover message.
export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  const receipt = new URL(req.url, 'http://x').searchParams.get('receipt');
  const r = await fetch(`https://api.pushover.net/1/receipts/${receipt}.json?token=${process.env.PUSHOVER_TOKEN}`);
  res.json(await r.json());
}
