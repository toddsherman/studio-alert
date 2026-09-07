import { pushover } from './pushover.js';

// Single channel: Pushover. Returns { ok, receipt, detail }.
export async function notify(message, { emergency = false, title } = {}) {
  try {
    const r = await pushover(message, { emergency, title });
    return { ok: true, receipt: r.receipt, detail: `ok: request ${r.request}${r.receipt ? ` receipt ${r.receipt}` : ''}` };
  } catch (err) {
    return { ok: false, receipt: null, detail: `FAILED: ${err.message}` };
  }
}
