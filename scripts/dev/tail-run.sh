#!/usr/bin/env bash
# ============================================================
# File: scripts/dev/tail-run.sh
# Section: developer tooling — read the result of a detached run
# Version: 1.0.0
#
# The companion of run-detached.sh. It answers the only two questions worth
# asking about a run you cannot see: is it still alive, and how did it end.
# The exit line is printed first, so a caller that only reads the head of this
# output still learns the outcome.
#
# Usage:
#   scripts/dev/tail-run.sh <logfile> [lines]     # default: 40 lines
# ============================================================
set -uo pipefail

log="${1:?usage: $0 <logfile> [lines]}"
lines="${2:-40}"
pidfile="${log%.log}.pid"

if [ ! -f "$log" ]; then
    printf 'no such log: %s\n' "$log"
    exit 1
fi

if [ -f "$pidfile" ] && kill -0 "$(cat "$pidfile")" 2>/dev/null; then
    printf 'STATUS running  pid=%s\n' "$(cat "$pidfile")"
else
    printf 'STATUS not-running (finished, failed to start, or was killed)\n'
fi

exitline=$(grep -h '^exit=' "$log" 2>/dev/null | tail -n 1 || true)
if [ -n "$exitline" ]; then
    printf 'RESULT %s\n' "$exitline"
else
    printf 'RESULT still running (no exit= line yet)\n'
fi

printf -- '--- last %s lines of %s ---\n' "$lines" "$log"
tail -n "$lines" "$log"
