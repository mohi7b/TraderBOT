#!/usr/bin/env bash
# ============================================================
# File: scripts/dev/run-detached.sh
# Section: developer tooling — a run that survives a dropped connection
# Version: 1.0.0
#
# Why this exists (2026-10-04)
#
#   This box is reached over a long, lossy link (TcpRetransSegs > 80k,
#   TCPAbortOnTimeout > 2k on a 2-day uptime), and VS Code's extension host
#   has been killed by its own V8 heap four times — SIGABRT, "Reached heap
#   limit" — taking every open terminal with it. A test suite started in the
#   foreground therefore dies for reasons that have nothing to do with the
#   test: the pty that owned it disappeared.
#
#   So nothing long runs in the foreground here. A run is started in its own
#   session, its output goes to a file, and the result is read from the file.
#   A dropped connection no longer stops the work.
#
# Usage:
#   scripts/dev/run-detached.sh <logfile> <command> [args...]
#
#   scripts/dev/run-detached.sh /tmp/run-all.log node gateway/tests/run-all.cjs
#   scripts/dev/tail-run.sh /tmp/run-all.log        # status + tail
#   scripts/dev/tail-run.sh /tmp/run-all.log 200    # status + 200 lines
#
# Contract:
#   - the log always ends with a line `exit=<code>` when the run is over;
#   - the pid is written next to the log as `<logfile-without-.log>.pid`;
#   - the runner is polite: `ionice -c3` when available, `nice -n 10` always,
#     so an editor or an ssh session keeps the CPU it needs.
# ============================================================
set -euo pipefail

if [ "$#" -lt 2 ]; then
    echo "usage: $0 <logfile> <command> [args...]" >&2
    exit 2
fi

log="$1"
shift
pidfile="${log%.log}.pid"

mkdir -p "$(dirname "$log")"
{
    printf '=== %s ===\n' "$(date -Is)"
    printf 'cwd: %s\n' "$PWD"
    printf 'cmd: %s\n' "$*"
} >> "$log"

launcher=(nice -n 10)
if command -v ionice >/dev/null 2>&1; then
    launcher=(ionice -c3 nice -n 10)
fi

# setsid: the run gets its own session, so the death of the terminal that
# started it is not a SIGHUP to the run.
setsid "${launcher[@]}" bash -c '
    log="$1"
    shift
    "$@" >> "$log" 2>&1
    printf "exit=%s\n" "$?" >> "$log"
' _ "$log" "$@" >> "$log" 2>&1 &

pid=$!
echo "$pid" > "$pidfile"
printf 'started pid %s\n  log: %s\n  pid: %s\n' "$pid" "$log" "$pidfile"
