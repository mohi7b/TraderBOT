#!/usr/bin/env bash
# ============================================================
# File: scripts/dev/system-report.sh
# Section: developer tooling — why a session died, in one page
# Version: 1.0.0
#
# The 2026-10-04 investigation, kept as a command. It answers, on this box:
#
#   - was the extension host killed by its own heap?  (SIGABRT / heap limit)
#   - how often does the remote connection flap?      (disconnect count)
#   - is the machine itself under pressure?           (memory, load, swap)
#   - is the link lossy, and is sshd keeping it up?   (retrans, keepalive)
#
# Everything is read-only, output is bounded, and nothing here needs root.
# Two of the checks report what root *would* show, because fail2ban's own log
# is root-only: see the printed hint.
#
# Usage:
#   scripts/dev/system-report.sh
# ============================================================
set -uo pipefail

server="${VSCODE_AGENT_FOLDER:-$HOME/.vscode-server}"
logs="$server/data/logs"

hr() { printf '\n== %s ==\n' "$1"; }

hr "machine: memory, swap, load"
free -m 2>/dev/null | head -3
cat /proc/loadavg 2>/dev/null
swapon --show 2>/dev/null || echo "(no swap)"

hr "disk"
df -h / 2>/dev/null | head -2

hr "top memory users (extension host lives here)"
ps -eo pid,etimes,pcpu,pmem,rss,comm --sort=-rss 2>/dev/null | head -8
host_rss=$(ps -eo rss,args --sort=-rss 2>/dev/null | grep -m1 'type=extensionHost' | awk '{print $1}')
if [ -n "${host_rss:-}" ]; then
    printf 'extension host RSS: %s MB\n' "$(( host_rss / 1024 ))"
fi

hr "extension host deaths (heap limit / SIGABRT)"
grep -rhoE 'FATAL ERROR: [^\n]*' "$logs" 2>/dev/null | sort | uniq -c | sort -rn | head -5
grep -rh 'Extension Host Process exited' "$logs"/*/remoteagent.log 2>/dev/null | tail -n 5
printf 'terminated by signal: %s\n' \
    "$(grep -rh 'Extension Host Process exited' "$logs"/*/remoteagent.log 2>/dev/null | grep -c SIGABRT)"

hr "connection flapping"
printf 'client disconnects: %s\n' \
    "$(grep -rh 'client has disconnected' "$logs"/*/remoteagent.log 2>/dev/null | wc -l)"
printf 'new connections:    %s\n' \
    "$(grep -rh 'New connection established' "$logs"/*/remoteagent.log 2>/dev/null | wc -l)"

hr "link quality (since boot)"
nstat -az 2>/dev/null | grep -E 'TcpRetransSegs|TCPTimeouts|TCPAbortOnTimeout|TCPSynRetrans|TcpEstabResets' | head -6

hr "sshd keepalive (uncommented lines only; a commented ClientAlive* means none)"
grep -E '^[[:space:]]*(ClientAliveInterval|ClientAliveCountMax|TCPKeepAlive|MaxStartups|LoginGraceTime)' \
    /etc/ssh/sshd_config 2>/dev/null || echo "(all defaults — no server-side keepalive, no ClientAlive*)"

hr "fail2ban (reading bans needs root)"
if pgrep -x fail2ban-server >/dev/null 2>&1; then
    printf 'fail2ban is RUNNING. jails configured:\n'
    grep -hE '^\[' /etc/fail2ban/jail.d/*.conf 2>/dev/null
    printf 'check bans:  sudo fail2ban-client status sshd\n'
    printf 'whitelist:   sudo fail2ban-client set sshd unbanip <your-ip>\n'
else
    printf 'fail2ban is not running.\n'
fi

hr "workspace weight (the reason the extension host grows)"
root="$(cd "$(dirname "$0")/../.." && pwd)"
timeout 30 du -x --max-depth=1 -h "$root" 2>/dev/null | sort -h | tail -6
printf 'files under %s: ' "$root"
timeout 40 find "$root" -xdev -type f 2>/dev/null | wc -l
