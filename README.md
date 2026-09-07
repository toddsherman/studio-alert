# Studio Alert

Texts you the moment Apple removes the "512GB memory option for M5 Ultra coming late October"
notice from https://www.apple.com/shop/buy-mac/mac-studio.

Two independent monitors, so a single failure never means a missed alert:

## How it works, in plain English

Every minute, a small program downloads Apple's Mac Studio store page and looks for one sentence. As long as
the sentence is there, it writes down "still there" and goes back to sleep. The moment the sentence is gone,
it waits fifteen seconds, downloads the page again to make sure it was not a fluke, and then sets off a siren
on your phone that keeps sounding until you tap Acknowledge.

The pieces that make that happen:

- **Vercel** is the computer in the cloud that runs the program. It has a built-in scheduler (a "cron job")
  that wakes the program up once a minute, around the clock, without any server of your own to keep running.
  The program itself is a few small JavaScript files with no framework.
- **Upstash Redis** is the program's notebook. Because each run starts fresh and remembers nothing, it needs
  somewhere to jot down "have I already alerted?", "how many fetches failed in a row?", and "when did I last
  check?". Redis is a tiny, fast database that holds those few facts. A lock in that notebook guarantees the
  siren fires exactly once even if two runs overlap.
- **Pushover** is the delivery service. It is a phone app that receives messages sent through a simple web
  request. Its "emergency" setting repeats the alert every thirty seconds for up to three hours and can break
  through silent mode and Focus. It was chosen after SMS and phone calls both failed: carriers block text
  messages from unregistered numbers, and the carrier's spam filter swallowed the calls before the phone rang.
- **A Mac at home** runs a copy of the same check using macOS's built-in scheduler (launchd). It is a backup
  in case Vercel has a bad day, and it also acts as a watchdog: it asks the cloud monitor "are you still
  checking?" every minute and alerts you if the answer is no.

Safety nets, because a monitor that fails silently is worse than no monitor:

- A **weekly rehearsal** runs the real alert code against a made-up sentence that is never on the page, so the
  whole path from download to siren is proven every Wednesday, not just on the day it matters.
- A **weekly heartbeat** on Sundays says "still watching" so silence is never ambiguous.
- If Apple's page stops loading for thirty minutes, you get a "monitor may be broken" notice, then a
  "recovered" notice when it comes back. Any unexpected crash sends an error notice too.
- After the real alert, the cloud monitor keeps re-sending the siren every three hours until you acknowledge it.
- On **December 1, 2026** both monitors send a final "retired" notice and shut themselves off.

The whole thing costs nothing beyond a one-time five dollar Pushover purchase; Vercel and Upstash are on free
or already-paid tiers, and a normal run uses two database commands to stay well inside the free quota.

## 1. Hosted monitor (primary) — `hosted/`, Vercel project `studio-alert`
- Cron every minute → `/api/check`. Fetches the page (1 retry), requires HTTP 200 + "Mac Studio" on the page.
- If the string is missing, waits 15s and refetches. Only a confirmed miss alerts.
- State in Upstash Redis (Vercel Marketplace). Alert is claimed atomically → exactly one text, ever.
- Alert channel: Pushover. The real alert is emergency priority (siren, repeats every 30s until acknowledged).
  "Monitor broken" notice after 30 straight failed fetches, recovery notice, and a weekly heartbeat (Sunday 9am ET)
  use high priority. (Twilio SMS/voice and Textbelt were tried and removed: SMS blocked by 10DLC rules, calls
  intercepted by the carrier spam filter, Textbelt free tier disabled for US.)
- State: one Redis hash `sa:state` + list `sa:history` (2 commands per run ≈ 90k/month vs the free plan's 500k cap).
- Rehearsal: `/api/rehearse` runs the *identical* monitor code against a random string that is not on the page,
  using separate keys (`sa:rehearsal:*`), so the full fetch → confirm → claim → alert path is proven end to end.
  Cron: Wednesdays 9am ET at high priority (doubles as mid-week heartbeat). Manual siren variant:
  `curl "https://<project>.vercel.app/api/rehearse?secret=$CRON_SECRET&emergency=1"`.
- Nag: after the real alert, every 3h the cron checks the Pushover receipt and re-sends the emergency alert until acknowledged.
- Guards: HTTP 200 + page ≥ 200 KB (real page ≈ 560 KB) + contains "Mac Studio"; the alert says whether a
  512GB *memory* option was detected in the configurator, to help judge a false alarm.
- Errors: any unexpected exception sends a high-priority "INTERNAL ERROR" notice, at most once per hour.
- Hard expiry: 2026-12-01 00:00 ET (`EXPIRES_AT` in `lib/config.js`). After that, one "retired" Pushover notice,
  then every cron run is a no-op. Delete the Vercel project afterwards to stop the cron entirely.
- Diagnostics: `/api/probe?secret=` (one raw fetch), `/api/pushover-receipt?secret=&receipt=`.
- Status (needs the secret): `https://<project>.vercel.app/api/status?secret=$CRON_SECRET`
- Test: `curl "https://<project>.vercel.app/api/check?secret=$CRON_SECRET&test=1"` (add `&emergency=1` for the siren variant)
- Env vars (Production): CRON_SECRET, PUSHOVER_USER, PUSHOVER_TOKEN, KV_* (from Upstash). ALERT_TO is unused now.
- Deploy: `cd hosted && vercel deploy --prod --yes`
- Re-arm after an alert: `HDEL sa:state alerted alertClaimed alertPending receipt lastAlertSentAt`.

## 2. Mac monitor (backup + watchdog) — launchd `com.toddsherman.studio-alert`, every 60s
- `check.sh` does the same page check locally; alerts via Pushover (`secrets.sh`) plus iMessage-to-self as a record.
- Hard expiry: `EXPIRES_ON` in `config.sh` (2026-12-01). On that date it sends one retirement notice and uninstalls itself.
- Watchdog: if the hosted status endpoint is stale for 10 minutes, texts you once.
- `./install.sh` / `./uninstall.sh` / `./test.sh`; log in `state/check.log`.
- Requires the Mac awake (Amphetamine is doing this).

Setup: copy `secrets.example.sh` to `secrets.sh` and fill it in. `secrets.sh` and `state/` are git-ignored and never deployed; `hosted/` is the only thing Vercel sees.
