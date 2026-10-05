#!/usr/bin/env bash
#
# Publish the NAVIS landing page on a dedicated, strictly non-VPN port
# (default 8080) WITHOUT touching the Sanaei panel, its Xray/V2Ray inbounds,
# Nginx, systemd or the host firewall.
#
#   bash tools/deploy.sh                 # publish on 0.0.0.0:8080
#   PORT=8088 bash tools/deploy.sh       # different (free) port
#   bash tools/deploy.sh stop            # stop the server
#   bash tools/deploy.sh status          # is it running / is the port free?
#
# Safety rails:
#   * the port must be free AND must not be one of the panel/VPN ports
#     (PROTECTED_PORTS; override consciously with ALLOW_PROTECTED=1);
#   * the ufw step is opt-in (FIREWALL=1), so a VPN host firewall is never
#     changed as a side effect of publishing a static page;
#   * no Nginx edit, no systemd unit, no other service restart.
set -uo pipefail

PORT="${PORT:-8080}"
HOST_BIND="${HOST_BIND:-0.0.0.0}"
PUBLIC_IP="${PUBLIC_IP:-195.248.240.102}"
FIREWALL="${FIREWALL:-0}"
ALLOW_PROTECTED="${ALLOW_PROTECTED:-0}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG="${LOG:-/tmp/navis-landing.log}"
PIDFILE="${PIDFILE:-/tmp/navis-landing.pid}"

# Ports owned by the co-located Sanaei panel / Xray (V2Ray) inbounds and by
# system services on this host. The landing page must never fight them for a
# port: if the VPN core cannot bind one of these, every tunnel dies.
PROTECTED_PORTS="${PROTECTED_PORTS:-22 53 80 443 2053 2096 3333 8443 11111 21115 21116 21117 21118 21119 34903 54321}"

say() { printf '%s\n' "$*"; }
ok()  { printf '  [ok] %s\n' "$*"; }
warn(){ printf '  [!!] %s\n' "$*"; }

port_users() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltnpH "sport = :${PORT}" 2>/dev/null
  elif command -v netstat >/dev/null 2>&1; then
    netstat -ltnp 2>/dev/null | awk -v p=":${PORT}$" '$4 ~ p'
  fi
}

running_pid() {
  [ -f "$PIDFILE" ] || return 1
  local pid
  pid="$(cat "$PIDFILE" 2>/dev/null)"
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null && printf '%s' "$pid"
}

port_protected() {
  case " ${PROTECTED_PORTS} " in
    *" $1 "*) return 0 ;;
    *) return 1 ;;
  esac
}

case "${1:-start}" in
  stop)
    if pid="$(running_pid)"; then
      kill "$pid" && ok "stopped server pid $pid"
      rm -f "$PIDFILE"
    else
      warn "no running server recorded in $PIDFILE"
    fi
    exit 0
    ;;
  status)
    say "port ${PORT}:"; port_users || say "  (free)"
    if port_protected "$PORT"; then warn "port ${PORT} is a panel/VPN port - never publish the site here"; fi
    if pid="$(running_pid)"; then ok "server running, pid $pid"; else warn "server not running"; fi
    exit 0
    ;;
esac

say "=== 1/5 port check ==="
if port_protected "$PORT" && [ "$ALLOW_PROTECTED" != "1" ]; then
  warn "port ${PORT} belongs to the Sanaei panel / Xray (V2Ray) inbounds on this host:"
  warn "  ${PROTECTED_PORTS}"
  warn "nothing was changed. pick a free, unrelated port, for example:"
  warn "  PORT=8088 bash tools/deploy.sh"
  warn "override only if you really mean it: ALLOW_PROTECTED=1 PORT=${PORT} bash tools/deploy.sh"
  exit 1
fi
ok "port ${PORT} is not one of the panel/VPN ports"

in_use="$(port_users)"
if [ -n "$in_use" ]; then
  warn "port ${PORT} is already in use - no change made:"
  printf '%s\n' "$in_use" | sed 's/^/      /'
  exit 1
fi
ok "port ${PORT} is free on this host"

say "=== 2/5 start the static server (${HOST_BIND}:${PORT}) ==="
if pid="$(running_pid)"; then
  kill "$pid" 2>/dev/null && ok "restarting previous instance (pid $pid)"
  sleep 1
fi
command -v node >/dev/null 2>&1 || { warn "node not found in PATH"; exit 1; }
force_flag=""
[ "$ALLOW_PROTECTED" = "1" ] && force_flag="--force"
cd "$HERE/.." || exit 1
setsid nohup node "$HERE/serve.cjs" --port "$PORT" --host "$HOST_BIND" $force_flag >"$LOG" 2>&1 < /dev/null &
child=$!
echo "$child" >"$PIDFILE"
sleep 2
if ! kill -0 "$child" 2>/dev/null; then
  warn "server exited during startup; log follows:"
  tail -n 15 "$LOG" | sed 's/^/      /'
  rm -f "$PIDFILE"
  exit 1
fi
ok "server started (pid $child), log: $LOG"

say "=== 3/5 local health check ==="
code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "http://127.0.0.1:${PORT}/" 2>/dev/null)"
if [ "$code" = "200" ]; then ok "GET http://127.0.0.1:${PORT}/ -> 200"
else warn "local request returned '${code:-no response}'"; fi

say "=== 4/5 firewall (ufw, port ${PORT}/tcp) ==="
if [ "$FIREWALL" != "1" ]; then
  ok "skipped - the firewall of this VPN host is left untouched (opt in with FIREWALL=1)"
elif ! command -v ufw >/dev/null 2>&1; then
  ok "ufw not installed - nothing to open"
elif ! sudo -n true 2>/dev/null; then
  warn "sudo needs a password here; if you really want the rule: sudo ufw allow ${PORT}/tcp"
else
  state="$(sudo -n ufw status 2>/dev/null | head -n1)"
  case "$state" in
    "Status: active")
      if sudo -n ufw allow "${PORT}/tcp" >/dev/null 2>&1; then
        ok "ufw rule added: allow ${PORT}/tcp"
        warn "on this host never run 'ufw enable/disable' while the VPN is up -"
        warn "that would cut off every Xray inbound port without an explicit allow rule."
      else
        warn "could not add the rule; run manually: sudo ufw allow ${PORT}/tcp"
      fi
      ;;
    *)
      ok "ufw is not active (state: ${state:-unknown}) - no rule needed"
      ;;
  esac
fi

say "=== 5/5 result ==="
ok "local   : http://127.0.0.1:${PORT}/"
ok "public  : http://${PUBLIC_IP}:${PORT}/"
say ""
say "  check from outside : curl -sI http://${PUBLIC_IP}:${PORT}/ | head -1"
say "  tail the log       : tail -f ${LOG}"
say "  stop / status      : bash tools/deploy.sh stop | status"
say ""
say "  Sanaei panel (Xray/V2Ray inbounds), Nginx and the host firewall were NOT modified."
say "  This host also runs the VPN: keep the page on its own port and never bind"
say "  a panel/VPN port (${PROTECTED_PORTS})."
