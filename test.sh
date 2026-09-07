#!/bin/bash
# Sends one test iMessage through the launchd job (so the Automation permission is granted to the right context).
DIR="$(cd "$(dirname "$0")" && pwd)"
touch "$DIR/state/send_test"
launchctl kickstart "gui/$(id -u)/com.toddsherman.studio-alert"
echo "Triggered. If a macOS dialog asks to allow control of Messages, click Allow. Waiting 10s..."
sleep 10
tail -n 3 "$DIR/state/check.log"
