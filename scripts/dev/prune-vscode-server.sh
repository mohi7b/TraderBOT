#!/usr/bin/env bash
# ============================================================
# File: scripts/dev/prune-vscode-server.sh
# Section: developer tooling — reclaim disk from stale VS Code servers
# Version: 1.0.0
#
# What it does:
#   ~/.vscode-server/cli/servers keeps one ~640 MB install per client build
#   that has ever connected. On 2026-10-04 this box held five of them, 3.2 GB,
#   while the running server was one. A reconnect resolves the install by
#   checking these directories, so fewer of them is also a shorter path back
#   on a link that drops.
#
#   The newest install (or the one named by lru.json) is never touched, nor is
#   a directory whose server is currently running. Logs older than the newest
#   three windows are removed; the newest are kept for evidence.
#
# Safety:
#   Dry-run by default: it prints what it *would* remove and removes nothing.
#   Pass --apply to act. A pruned install is re-downloaded by VS Code on the
#   next connect from that older client, so keep old builds if you connect
#   from a second machine running a different VS Code version.
#
# Usage:
#   scripts/dev/prune-vscode-server.sh            # dry run
#   scripts/dev/prune-vscode-server.sh --apply    # remove
# ============================================================
set -uo pipefail

apply=0
[ "${1:-}" = "--apply" ] && apply=1

server="${VSCODE_AGENT_FOLDER:-$HOME/.vscode-server}"
servers="$server/cli/servers"
logs="$server/data/logs"

[ -d "$servers" ] || { echo "no servers directory at $servers"; exit 0; }

lru=""
[ -f "$servers/lru.json" ] && lru="$(head -c 200 "$servers/lru.json" | sed 's/[]",[]//g' | cut -d, -f1)"

# The install currently in use, taken from the running process, never pruned.
inuse="$(ps -eo args 2>/dev/null | grep -m1 'server/bin/code-server' \
    | sed -n 's#.*cli/servers/\([^/]*\)/.*#\1#p')"

echo "== servers (in use: ${inuse:-unknown}; lru head: ${lru:-none}) =="
du -sh "$servers" 2>/dev/null

keep=0
for dir in $(ls -1t "$servers" 2>/dev/null); do
    path="$servers/$dir"
    [ -d "$path" ] || continue

    if [ "$dir" = "$inuse" ] || [ "$dir" = "$lru" ] || [ "$keep" -eq 0 ]; then
        printf 'KEEP    %s (%s)\n' "$dir" "$(du -sh "$path" 2>/dev/null | cut -f1)"
        keep=$((keep + 1))
        continue
    fi

    printf 'REMOVE  %s (%s)\n' "$dir" "$(du -sh "$path" 2>/dev/null | cut -f1)"
    [ "$apply" -eq 1 ] && rm -rf "$path"
done

echo
echo "== old log windows (keeping the newest three) =="
i=0
for dir in $(ls -1t "$logs" 2>/dev/null); do
    i=$((i + 1))
    [ "$i" -le 3 ] && { printf 'KEEP    %s\n' "$dir"; continue; }
    printf 'REMOVE  %s\n' "$dir"
    [ "$apply" -eq 1 ] && rm -rf "$logs/$dir"
done

echo
if [ "$apply" -eq 1 ]; then
    echo "applied. servers now:"
    du -sh "$servers" 2>/dev/null
else
    echo "dry run — nothing was removed. Re-run with --apply to act."
fi
