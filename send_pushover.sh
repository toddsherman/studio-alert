#!/bin/bash
# Usage: send_pushover.sh "<message>" [emergency]
# Pushover push from the Mac backup. Needs PUSHOVER_USER / PUSHOVER_TOKEN in secrets.sh.
set -u
DIR="$(cd "$(dirname "$0")" && pwd)"
source "$DIR/secrets.sh"
if [ -z "${PUSHOVER_USER:-}" ] || [ -z "${PUSHOVER_TOKEN:-}" ]; then echo "pushover not configured (fill in secrets.sh)"; exit 1; fi
if [ "${2:-}" = "emergency" ]; then EXTRA=(-d priority=2 -d retry=30 -d expire=3600 -d sound=siren); else EXTRA=(-d priority=1); fi
RESP="$(curl -s --max-time 30 -X POST https://api.pushover.net/1/messages.json \
  -d "token=$PUSHOVER_TOKEN" -d "user=$PUSHOVER_USER" -d "title=Studio Alert (Mac)" --data-urlencode "message=$1" "${EXTRA[@]}")"
echo "$RESP"; echo "$RESP" | grep -q '"status":1'
