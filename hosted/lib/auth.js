// Vercel cron sends `Authorization: Bearer $CRON_SECRET`. Manual calls may use ?secret=.
export function authorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers['authorization'] || '';
  if (header === `Bearer ${secret}`) return true;
  const url = new URL(req.url, 'http://x');
  return url.searchParams.get('secret') === secret;
}
