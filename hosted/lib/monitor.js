import { checkPageWithRetry } from './page.js';
import { notify } from './notify.js';
import { receiptAcknowledged } from './pushover.js';
import { PAGE_URL, FAILURE_ALERT_AFTER, CONFIRM_DELAY_MS, NAG_INTERVAL_MS, EXPIRES_AT, expired } from './config.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const now = () => new Date().toISOString();

// One monitor cycle. ctx = { store, target, label, emergency }.
// The real cron and the rehearsal both run exactly this function; only ctx differs.
export async function runCheck(ctx) {
  const { store, target, label = '', emergency = true } = ctx;
  const s = await store.load();
  const tag = label ? `${label} ` : '';

  // Expiry: one retirement notice, then idle forever.
  if (!label && expired()) {
    if (await store.setnx('retired', now())) {
      const out = await notify(`Studio Alert has retired as scheduled (${new Date(EXPIRES_AT).toDateString()}). No further checks will run. You can delete the Vercel project "studio-alert".`);
      await store.event(`RETIRED: ${out.detail}`);
    }
    await store.save({ lastAt: now(), lastResult: 'retired' });
    return { result: 'retired' };
  }

  // Already alerted: nag every NAG_INTERVAL until the emergency alert is acknowledged.
  if (s.alerted) {
    let nag = null;
    if (emergency && s.receipt && Date.now() - Date.parse(s.lastAlertSentAt || s.alerted) > NAG_INTERVAL_MS) {
      const acked = await receiptAcknowledged(s.receipt);
      if (acked === false) {
        const out = await notify(`${tag}Studio Alert REPEAT: the 512GB notice is still gone from the Mac Studio page and you have not acknowledged the alert. Go order: ${PAGE_URL}`, { emergency: true });
        await store.save({ lastAlertSentAt: now(), receipt: out.receipt || s.receipt });
        await store.event(`nag re-sent: ${out.detail}`);
        nag = out.detail;
      } else if (acked === true) {
        await store.save({ acknowledgedAt: now(), receipt: '' });
        await store.event('alert acknowledged by user; nagging stopped');
      }
    }
    await store.save({ lastAt: now(), lastResult: 'already_alerted', total: s.total + 1 });
    return { result: 'already_alerted', nag };
  }

  // Alert was confirmed earlier but the send failed: retry sending only.
  if (s.alertPending) return sendAlert(ctx, s, 'retry');

  const check = await checkPageWithRetry(target);

  if (check.result === 'failed') {
    const fails = s.fails + 1;
    await store.save({ lastAt: now(), lastResult: 'failed', lastDetail: check.detail, lastMs: check.ms, fails, total: s.total + 1 });
    await store.event(`fetch failed (${check.detail}) consecutive=${fails}`);
    if (fails >= FAILURE_ALERT_AFTER && (await store.setnx('failAlerted', now()))) {
      const out = await notify(`${tag}Studio Alert: the page check has failed ${fails} times in a row (${check.detail}). The monitor may be broken.`);
      if (out.ok) await store.event(`failure alert sent: ${out.detail}`);
      else { await store.del('failAlerted'); await store.event(`failure alert FAILED: ${out.detail}`); }
    }
    return { result: 'failed', fails, detail: check.detail };
  }

  // Good fetch. Recovery notice if we had complained.
  if (s.failAlerted) {
    await store.del('failAlerted');
    const out = await notify(`${tag}Studio Alert: monitor has recovered and is checking normally again.`);
    await store.event(`recovery notice ${out.ok ? 'sent' : 'FAILED'}: ${out.detail}`);
  }

  if (check.result === 'present') {
    await store.save({ lastAt: now(), lastResult: 'present', lastDetail: check.detail, lastMs: check.ms, lastOk: now(), fails: 0, total: s.total + 1 });
    return { result: 'present', ms: check.ms };
  }

  // Missing. Confirm with a second fetch after a delay before alerting.
  await store.event(`string MISSING on first fetch (${check.detail}); confirming in ${CONFIRM_DELAY_MS}ms`);
  await sleep(CONFIRM_DELAY_MS);
  const confirm = await checkPageWithRetry(target);
  await store.save({ lastAt: now(), lastResult: `confirm:${confirm.result}`, lastDetail: confirm.detail, lastMs: confirm.ms, fails: 0, total: s.total + 1 });

  if (confirm.result !== 'missing') {
    await store.event(`confirmation did not hold: ${confirm.result} (${confirm.detail}); will re-check next run`);
    return { result: 'unconfirmed', confirm };
  }

  // Confirmed. Claim atomically so overlapping runs cannot double-send.
  if (!(await store.setnx('alertClaimed', now()))) {
    await store.event('confirmed missing but another run holds the alert claim');
    return { result: 'confirmed_other_run_alerting' };
  }
  await store.save({ alertPending: now(), hint512: confirm.hint512 || 'unknown' });
  await store.event(`CONFIRMED: target string gone (512GB memory option detected: ${confirm.hint512})`);
  return sendAlert(ctx, { ...s, hint512: confirm.hint512 }, 'initial');
}

async function sendAlert(ctx, s, phase) {
  const { store, label = '', emergency = true } = ctx;
  const tag = label ? `${label} ` : '';
  const hint = s.hint512 && s.hint512 !== 'unknown' ? ` 512GB memory option detected in configurator: ${s.hint512}.` : '';
  const out = await notify(`${tag}Studio Alert: the 512GB coming late October notice is GONE from the Mac Studio page.${hint} Go order now: ${PAGE_URL}`, { emergency });
  if (out.ok) {
    await store.save({ alerted: now(), lastAlertSentAt: now(), receipt: out.receipt || '' });
    await store.del('alertPending');
    await store.event(`ALERT SENT (${phase}): ${out.detail}`);
    return { result: 'alerted', detail: out.detail };
  }
  await store.event(`ALERT FAILED (${phase}): ${out.detail}; will retry next run`);
  return { result: 'alert_send_failed', detail: out.detail };
}

// Last-resort error reporting: at most one notice per hour via Redis; if Redis itself is down,
// fall back to a per-instance memory guard so we are loud but not a firehose.
let lastErrNoticeLocal = 0;
export async function reportError(store, where, err) {
  const msg = `Studio Alert INTERNAL ERROR in ${where}: ${String(err?.stack || err).slice(0, 400)}`;
  console.error(msg);
  try {
    const s = await store.load();
    if (Date.now() - Date.parse(s.errNoticeAt || 0) < 60 * 60 * 1000) return;
    await store.save({ errNoticeAt: now() });
  } catch {
    if (Date.now() - lastErrNoticeLocal < 60 * 60 * 1000) return;
    lastErrNoticeLocal = Date.now();
  }
  await notify(msg).catch(() => {});
}
