#!/usr/bin/env bash
set -euo pipefail

LABEL="com.amaran.daemon"
DOMAIN="gui/$(id -u)"
PLIST_SRC="$(dirname "$0")/com.amaran.daemon.plist"
PLIST_DST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/amaran"
PID_FILE="/tmp/amaran-light.pid"

case "${1:-}" in
  install)
    if [[ -f "$PID_FILE" ]]; then
      echo "ERROR: A foreground daemon is already running (PID file $PID_FILE exists)." >&2
      echo "       Stop it with 'npm run daemon:stop' before installing the LaunchAgent." >&2
      exit 1
    fi
    mkdir -p "$LOG_DIR"
    cp "$PLIST_SRC" "$PLIST_DST"
    launchctl bootstrap "$DOMAIN" "$PLIST_DST"
    launchctl enable "$DOMAIN/$LABEL"
    launchctl kickstart -k "$DOMAIN/$LABEL"
    echo "Installed. Daemon is starting — run 'npm run daemon:status' to verify."
    ;;

  uninstall)
    launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
    sleep 1
    rm -f "$PLIST_DST"
    echo "Uninstalled."
    ;;

  status)
    echo "=== launchctl ==="
    launchctl print "$DOMAIN/$LABEL" 2>/dev/null | head -40 || echo "(not loaded)"
    echo ""
    echo "=== HTTP health (GET /lights) ==="
    curl -fsS --max-time 2 http://localhost:2708/lights | jq . 2>/dev/null || echo "(no response — daemon may still be connecting)"
    ;;

  logs)
    tail -F "$LOG_DIR/daemon.out.log" "$LOG_DIR/daemon.err.log" 2>/dev/null || {
      echo "No log files yet. Has the daemon started? (npm run daemon:install)" >&2
      exit 1
    }
    ;;

  restart)
    launchctl kickstart -k "$DOMAIN/$LABEL"
    echo "Restarted."
    ;;

  *)
    echo "Usage: $0 {install|uninstall|status|logs|restart}" >&2
    exit 1
    ;;
esac
