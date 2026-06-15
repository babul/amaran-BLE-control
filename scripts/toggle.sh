#!/usr/bin/env bash
set -euo pipefail

# Toggle lights on/off. State persists across calls via a file in /tmp.
# On reboot the file clears, so the first toggle after boot turns lights ON.

STATE_FILE="/tmp/amaran-lights-on"
REPO="$(cd "$(dirname "$0")/.." && pwd)"

if [[ -f "$STATE_FILE" ]]; then
  npm --prefix "$REPO" run mesh:off --silent
  rm "$STATE_FILE"
  echo "Lights OFF"
else
  npm --prefix "$REPO" run mesh:on --silent
  touch "$STATE_FILE"
  echo "Lights ON"
fi
