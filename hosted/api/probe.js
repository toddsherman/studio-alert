import { authorized } from '../lib/auth.js';
import { checkPage } from '../lib/page.js';
import { TARGET_STRING } from '../lib/config.js';

// Diagnostic: fetch the Apple page once from Vercel and report what we saw. No state, no SMS.
export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'unauthorized' });
  res.json(await checkPage(TARGET_STRING));
}
