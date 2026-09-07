// Pushover push notification. emergency=true → priority 2: repeats every 30s for up to 3h (Pushover's max)
// until acknowledged, and bypasses silent mode / Focus when critical alerts are enabled in the app.
export async function pushover(message, { title = 'Studio Alert', emergency = false } = {}) {
  const token = process.env.PUSHOVER_TOKEN, user = process.env.PUSHOVER_USER;
  if (!token || !user) throw new Error('Pushover not configured: need PUSHOVER_TOKEN, PUSHOVER_USER');
  const params = { token, user, message, title, sound: emergency ? 'siren' : 'pushover', priority: emergency ? '2' : '1' };
  if (emergency) { params.retry = '30'; params.expire = '10800'; }
  const res = await fetch('https://api.pushover.net/1/messages.json', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.status !== 1) throw new Error(`Pushover ${res.status}: ${(json.errors || []).join('; ') || JSON.stringify(json)}`);
  return { request: json.request, receipt: json.receipt || null };
}

// For emergency messages: has the user tapped Acknowledge? Returns true/false, or null if unknown.
export async function receiptAcknowledged(receipt) {
  const res = await fetch(`https://api.pushover.net/1/receipts/${receipt}.json?token=${process.env.PUSHOVER_TOKEN}`);
  const json = await res.json().catch(() => ({}));
  if (json.status !== 1) return null;
  return json.acknowledged === 1;
}
