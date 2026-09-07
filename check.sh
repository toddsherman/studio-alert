#!/bin/bash
# Studio Alert poller. Run by launchd every 60s. Safe to run by hand.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DIR/config.sh"
[ -f "$DIR/secrets.sh" ] && source "$DIR/secrets.sh"
STATE="$DIR/state"
LOG="$STATE/check.log"
mkdir -p "$STATE"

MISSES_FILE="$STATE/misses"
FAILS_FILE="$STATE/fails"
ALERTED_FILE="$STATE/alerted"
FAIL_ALERTED_FILE="$STATE/fail_alerted"
LAST_PAGE="$STATE/last_page.html"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" >> "$LOG"; }

# notify "<message>": Pushover (emergency when CALL_ON_ALERT=1) plus iMessage as a passive record.
# Returns 0 if at least one channel succeeded.
notify() {
  local msg="$1" ok=1 resp
  if resp="$("$DIR/send_pushover.sh" "$msg" $([ "${CALL_ON_ALERT:-0}" = "1" ] && echo emergency))"; then
    log "pushover sent: $resp"; ok=0
  else
    log "pushover FAILED: $resp"
  fi
  if "$DIR/send_imessage.sh" "$RECIPIENT" "$msg"; then
    log "imessage sent"; ok=0
  else
    log "imessage FAILED"
  fi
  return $ok
}
read_count() { [ -f "$1" ] && cat "$1" || echo 0; }

# Expiry: on/after EXPIRES_ON, send one retirement notice and uninstall this launchd job.
if [ "$(date '+%Y-%m-%d')" \> "$EXPIRES_ON" ] || [ "$(date '+%Y-%m-%d')" = "$EXPIRES_ON" ]; then
  log "expired ($EXPIRES_ON reached); retiring"
  notify "Studio Alert (Mac) has retired as scheduled ($EXPIRES_ON). The launchd job is being removed."
  "$DIR/uninstall.sh" >> "$LOG" 2>&1
  exit 0
fi

# Watchdog: is the hosted Vercel monitor still checking?
watchdog() {
  [ "${WATCHDOG_ENABLED:-0}" = "1" ] || return 0
  local resp down=0 n
  resp="$(curl -s --max-time 20 "$STATUS_URL?secret=$CRON_SECRET")" || down=1
  if [ $down -eq 0 ]; then
    echo "$resp" | grep -q '"stale":false' || down=1
  fi
  if [ $down -eq 1 ]; then
    n=$(( $(read_count "$STATE/wd_down") + 1 )); echo "$n" > "$STATE/wd_down"
    log "watchdog: hosted monitor stale/unreachable consecutive=$n"
    if [ "$n" -ge "$WATCHDOG_AFTER" ] && [ ! -f "$STATE/wd_alerted" ]; then
      notify "Studio Alert watchdog (Mac): the hosted Vercel monitor has been stale or unreachable for $n minutes. The Mac is still checking Apple directly." \
        && touch "$STATE/wd_alerted" && log "watchdog alert sent"
    fi
  else
    if [ -f "$STATE/wd_alerted" ]; then
      notify "Studio Alert watchdog (Mac): the hosted Vercel monitor is reporting healthy again." && log "watchdog recovery sent"
    fi
    echo 0 > "$STATE/wd_down"; rm -f "$STATE/wd_alerted"
  fi
}
watchdog

# Test hook: `./test.sh` drops this file; we send one test text and remove it.
if [ -f "$STATE/send_test" ]; then
  rm -f "$STATE/send_test"
  if notify "Studio Alert test: monitoring the Mac Studio page every 60s. You will get one text when the 512GB notice disappears."; then
    log "TEST MESSAGE SENT to $RECIPIENT"
  else
    log "TEST MESSAGE FAILED on all channels"
  fi
fi

if [ -f "$ALERTED_FILE" ]; then
  log "already alerted; nothing to do (delete state/alerted to re-arm)"
  exit 0
fi

UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
TMP="$(mktemp)"
HTTP="$(curl -sL --max-time 30 -A "$UA" -H "Accept-Language: en-US,en;q=0.9" "$URL" -o "$TMP" -w '%{http_code}')"
CURL_RC=$?

if [ $CURL_RC -ne 0 ] || [ "$HTTP" != "200" ] || ! grep -q "$SANITY_STRING" "$TMP"; then
  FAILS=$(( $(read_count "$FAILS_FILE") + 1 ))
  echo "$FAILS" > "$FAILS_FILE"
  log "FETCH FAILED (curl rc=$CURL_RC http=$HTTP sanity=$(grep -q "$SANITY_STRING" "$TMP" && echo ok || echo missing)) consecutive=$FAILS"
  if [ "$FAILS" -ge "$FAILURE_ALERT_AFTER" ] && [ ! -f "$FAIL_ALERTED_FILE" ]; then
    notify "Studio Alert: the Mac Studio page check has failed $FAILS times in a row (http=$HTTP). The monitor may be broken." \
      && touch "$FAIL_ALERTED_FILE" && log "sent failure alert"
  fi
  rm -f "$TMP"
  exit 0
fi

# Good fetch: reset failure counters.
echo 0 > "$FAILS_FILE"
rm -f "$FAIL_ALERTED_FILE"
mv "$TMP" "$LAST_PAGE"

if grep -q "$TARGET_STRING" "$LAST_PAGE"; then
  echo 0 > "$MISSES_FILE"
  log "string present"
  exit 0
fi

MISSES=$(( $(read_count "$MISSES_FILE") + 1 ))
echo "$MISSES" > "$MISSES_FILE"
log "STRING MISSING consecutive=$MISSES"

if [ "$MISSES" -ge "$CONFIRM_COUNT" ]; then
  if CALL_ON_ALERT=1 notify "Studio Alert: the 512GB coming late October notice is GONE from the Mac Studio page. Go order: $URL"; then
    touch "$ALERTED_FILE"
    log "ALERT SENT to $RECIPIENT"
  else
    log "alert send FAILED; will retry next run"
  fi
fi
