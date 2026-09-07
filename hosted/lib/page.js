import { PAGE_URL, SANITY_STRING, MIN_PAGE_BYTES, FETCH_TIMEOUT_MS, USER_AGENT } from './config.js';

// Best-effort positive signal: does a 512GB *memory* option appear anywhere in the page data?
function memoryHint(body) {
  return /512\s?GB[^<"]{0,40}(unified )?memory/i.test(body) || /512gb-memory/i.test(body) ? 'yes' : 'no';
}

// Returns { result: 'present' | 'missing' | 'failed', status, detail, ms, hint512 }
export async function checkPage(target) {
  const started = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(PAGE_URL, {
      redirect: 'follow',
      cache: 'no-store',
      signal: ctrl.signal,
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'en-US,en;q=0.9',
      },
    });
    const body = await res.text();
    const ms = Date.now() - started;
    if (res.status !== 200) return { result: 'failed', status: res.status, detail: `http ${res.status}`, ms };
    if (body.length < MIN_PAGE_BYTES) return { result: 'failed', status: res.status, detail: `page too small (${body.length} bytes)`, ms };
    if (!body.includes(SANITY_STRING)) return { result: 'failed', status: res.status, detail: `sanity string missing (len ${body.length})`, ms };
    return {
      result: body.includes(target) ? 'present' : 'missing',
      status: res.status,
      detail: `ok (len ${body.length})`,
      ms,
      hint512: memoryHint(body),
    };
  } catch (err) {
    return { result: 'failed', status: 0, detail: String(err?.message || err), ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

// One retry on transport/HTTP failure.
export async function checkPageWithRetry(target) {
  const first = await checkPage(target);
  if (first.result !== 'failed') return first;
  await new Promise((r) => setTimeout(r, 3000));
  const second = await checkPage(target);
  return second.result === 'failed' ? { ...second, detail: `${first.detail}; retry: ${second.detail}` } : second;
}
