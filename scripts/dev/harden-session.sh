#!/usr/bin/env bash
# ============================================================
# File: scripts/dev/harden-session.sh
# Section: developer tooling — keep the operator's SSH session alive
# Version: 1.0.0
#
# Why this exists (2026-10-05)
#
#   Two things measured on this box today explain runs that stop for no reason
#   the run itself can produce:
#
#   1. sshd keeps no session alive. Every ClientAlive* line in
#      /etc/ssh/sshd_config is commented out, so the server never probes a peer
#      that has gone quiet. The link here is lossy — since boot it has logged
#      TcpExtTCPTimeouts 187,712 and TcpExtTCPAbortOnTimeout 17,805 — and a
#      session whose packets stop arriving can sit "established" on both ends
#      while moving nothing.
#
#   2. fail2ban jails the operator for one mistake. /etc/fail2ban/jail.d/
#      3x-ipl.conf is the x-ui panel's own jail (written 05:42 today) and it
#      bans after a single failure: maxretry=1, findtime=32, bantime=30m. One
#      mistyped panel login from the operator's address and the SSH session
#      that is running the test suite is banned for half an hour. fail2ban's
#      log is root-only, so this cannot be checked without root — which is why
#      the answer is a script and not a note.
#
# What it writes (two drop-in files; nothing existing is edited):
#
#   /etc/ssh/sshd_config.d/99-traderbot-keepalive.conf
#       ClientAliveInterval 20, ClientAliveCountMax 6 — a dead peer is found in
#       about two minutes instead of never — and TCPKeepAlive yes.
#
#   /etc/fail2ban/jail.d/99-traderbot-allow.local
#       [DEFAULT] ignoreip = loopback + the address this session came from, and
#       a relaxed [3x-ipl] (maxretry 3, findtime 120, bantime 5m) so a scanning
#       host is still caught while a human typo is not a half-hour outage.
#       jail.d/*.local is parsed after jail.local, so this file always wins.
#
# Safety:
#   Dry-run by default; --apply needs root. Keep a second SSH session open
#   while applying: `systemctl reload ssh` does not drop sessions, but a typo
#   in a drop-in would be found at the *next* login, from the session you kept.
#
# Usage:
#   scripts/dev/harden-session.sh                     # show what would change
#   sudo scripts/dev/harden-session.sh --apply        # write, validate, reload
# ============================================================
set -uo pipefail

apply=0
[ "${1:-}" = "--apply" ] && apply=1

if [ "$apply" -eq 1 ] && [ "$(id -u)" -ne 0 ]; then
    echo "need root: sudo $0 --apply" >&2
    exit 2
fi

keepalive=/etc/ssh/sshd_config.d/99-traderbot-keepalive.conf
allow=/etc/fail2ban/jail.d/99-traderbot-allow.local

# The address this session comes from: fail2ban must never ban it.
ip="${SSH_CLIENT%% *}"
allowip="127.0.0.1/8 ::1"
if [ -n "$ip" ]; then
    allowip="$allowip $ip"
else
    echo "warning: no SSH_CLIENT in the environment; ignoreip will carry loopback only." >&2
    echo "         pass the address by hand:  sudo $0 --apply   # then edit $allow" >&2
fi

keepalive_body='# Written by scripts/dev/harden-session.sh (2026-10-05).
# sshd_config had ClientAlive* commented out: no server-side probe, so a lossy
# link could leave a session established and silent. Probe every 20s, give up
# after 6 unanswered probes.
ClientAliveInterval 20
ClientAliveCountMax 6
TCPKeepAlive yes'

allow_body="# Written by scripts/dev/harden-session.sh (2026-10-05).
[DEFAULT]
ignoreip = ${allowip}

# The x-ui panel jail bans after one failure for 30 minutes. The operator is
# allowlisted above; the jail is relaxed as well, so a scanner is still caught
# but a human typo is not a half-hour outage.
[3x-ipl]
maxretry = 3
findtime = 120
bantime = 5m"

echo "== would write: $keepalive =="
printf '%s\n' "$keepalive_body" | sed 's/^/    /'
echo
echo "== would write: $allow =="
printf '%s\n' "$allow_body" | sed 's/^/    /'
echo

if [ "$apply" -eq 0 ]; then
    echo "dry run — nothing was written. Re-run with: sudo $0 --apply"
    exit 0
fi

install -d /etc/ssh/sshd_config.d /etc/fail2ban/jail.d
printf '%s\n' "$keepalive_body" > "$keepalive"
printf '%s\n' "$allow_body" > "$allow"
chmod 644 "$keepalive" "$allow"

echo "== applying =="
if sshd -t 2>/dev/null; then
    systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null \
        || echo "could not reload ssh: run 'systemctl reload ssh' by hand"
    echo "sshd config accepted and reloaded (open sessions are not dropped)."
else
    echo "sshd -t rejected the config; removing $keepalive again" >&2
    rm -f "$keepalive"
    sshd -t || true
fi

if command -v fail2ban-client >/dev/null 2>&1; then
    fail2ban-client reload >/dev/null 2>&1 \
        && echo "fail2ban reloaded." \
        || echo "could not reload fail2ban: run 'sudo fail2ban-client reload' by hand"
fi

echo
echo "== verify =="
sshd -T 2>/dev/null | grep -iE '^(clientaliveinterval|clientalivecountmax|tcpkeepalive)' || true
if command -v fail2ban-client >/dev/null 2>&1; then
    fail2ban-client status 3x-ipl 2>/dev/null | head -8 || true
    printf 'ignoreip now: %s\n' "$(fail2ban-client get 3x-ipl ignoreip 2>/dev/null || echo '(run: sudo fail2ban-client get 3x-ipl ignoreip)')"
fi
