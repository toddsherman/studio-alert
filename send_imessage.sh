#!/bin/bash
# Usage: send_imessage.sh "<recipient>" "<message>"
# Sends an iMessage via the Messages app. First run will prompt for Automation permission.
set -u
RECIPIENT="$1"
MESSAGE="$2"
osascript - "$RECIPIENT" "$MESSAGE" <<'APPLESCRIPT'
on run argv
  set theRecipient to item 1 of argv
  set theMessage to item 2 of argv
  tell application "Messages"
    set iMessageService to 1st account whose service type = iMessage
    set theBuddy to participant theRecipient of iMessageService
    send theMessage to theBuddy
  end tell
end run
APPLESCRIPT
