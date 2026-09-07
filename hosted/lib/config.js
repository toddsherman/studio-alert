export const PAGE_URL = 'https://www.apple.com/shop/buy-mac/mac-studio';
export const TARGET_STRING =
  process.env.TARGET_STRING || '512GB memory option for M5 Ultra coming late October';
export const SANITY_STRING = process.env.SANITY_STRING || 'Mac Studio';
// The real page is ~560 KB. Anything much smaller is an error/challenge/stub page, not the store.
export const MIN_PAGE_BYTES = Number(process.env.MIN_PAGE_BYTES || 200000);
export const FAILURE_ALERT_AFTER = Number(process.env.FAILURE_ALERT_AFTER || 30);
export const CONFIRM_DELAY_MS = Number(process.env.CONFIRM_DELAY_MS || 15000);
export const NAG_INTERVAL_MS = 3 * 60 * 60 * 1000; // re-send the alert every 3h until acknowledged
export const FETCH_TIMEOUT_MS = 20000;
export const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

// Hard stop. After this instant the monitor sends one "retired" notice and then does nothing.
// 2026-12-01 00:00 America/New_York (EST, UTC-5).
export const EXPIRES_AT = Date.parse(process.env.EXPIRES_AT || '2026-12-01T05:00:00Z');
export const expired = () => Date.now() >= EXPIRES_AT;
