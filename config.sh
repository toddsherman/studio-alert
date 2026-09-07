# Studio Alert configuration (safe to commit). Personal values live in secrets.sh.

# RECIPIENT, CRON_SECRET and Pushover keys live in secrets.sh (git-ignored).

URL="https://www.apple.com/shop/buy-mac/mac-studio"

# The string whose disappearance triggers the alert.
TARGET_STRING="512GB memory option for M5 Ultra coming late October"

# Must be present for a fetch to count as a real page (guards against block/error pages).
SANITY_STRING="Mac Studio"

# How many consecutive "string missing" checks before alerting (each check is ~1 minute apart).
CONFIRM_COUNT=2

# Send a one-time "monitor is broken" text after this many consecutive failed fetches.
FAILURE_ALERT_AFTER=30


# Watchdog for the hosted (Vercel) monitor. Texts once if its status endpoint reports stale/failing
# for WATCHDOG_AFTER consecutive minutes. Set WATCHDOG_ENABLED=1 once the hosted monitor is live.
WATCHDOG_ENABLED=1
STATUS_URL="https://studio-alert.vercel.app/api/status"   # secret is appended at runtime
WATCHDOG_AFTER=10

# Hard stop: on/after this date the Mac monitor sends one retirement notice and uninstalls its launchd job.
EXPIRES_ON="2026-12-01"
