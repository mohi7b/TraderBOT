#!/usr/bin/env bash
# ============================================================
# File: test/run-realtime-live-health.sh
# Section: test
#
# Role:
#   Run test/realtime-live-health.test.cjs once per (exchange, market)
#   pair — sequentially, never in parallel, because every run opens real
#   websockets and the harness patches shared singletons (quality gate,
#   console capture) of one process.
#
# Usage:
#   bash test/run-realtime-live-health.sh [--symbol BTCUSDT] [--seconds 25]
#        [--exchanges binance,bybit,...] [--markets spot,futures]
#        [--only binance:spot] [--verbose]
#
#   REALTIME_LIVE_HEALTH_SYMBOL     BTCUSDT
#   REALTIME_LIVE_HEALTH_SECONDS    25
#   REALTIME_LIVE_HEALTH_MIN_PACKETS 10
#   REALTIME_LIVE_HEALTH_EXCHANGES  binance,bybit,okx,kucoin,bitget
#   REALTIME_LIVE_HEALTH_MARKETS    spot,futures
#   REALTIME_LIVE_HEALTH_LOGDIR     /tmp/realtime-live-health
#
#   Note: kucoin futures is a low-rate feed (mark/config polls every ~60 s),
#   so it needs a longer window:  --only kucoin:futures --seconds 60
#
# Exit codes: 0 all pairs PASS, 1 at least one pair FAILED, 2 bad usage.
# ============================================================
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HARNESS="$REPO_ROOT/test/realtime-live-health.test.cjs"

SYMBOL="${REALTIME_LIVE_HEALTH_SYMBOL:-BTCUSDT}"
WINDOW="${REALTIME_LIVE_HEALTH_SECONDS:-25}"
MIN_PACKETS="${REALTIME_LIVE_HEALTH_MIN_PACKETS:-10}"
EXCHANGES="${REALTIME_LIVE_HEALTH_EXCHANGES:-binance,bybit,okx,kucoin,bitget}"
MARKETS="${REALTIME_LIVE_HEALTH_MARKETS:-spot,futures}"
LOG_DIR="${REALTIME_LIVE_HEALTH_LOGDIR:-/tmp/realtime-live-health}"
VERBOSE=""
ONLY=""

while [ $# -gt 0 ]; do
    case "$1" in
        --symbol) SYMBOL="$2"; shift 2 ;;
        --seconds) WINDOW="$2"; shift 2 ;;
        --min-packets) MIN_PACKETS="$2"; shift 2 ;;
        --exchanges) EXCHANGES="$2"; shift 2 ;;
        --markets) MARKETS="$2"; shift 2 ;;
        --only) ONLY="$2"; shift 2 ;;
        --verbose) VERBOSE="--verbose"; shift ;;
        -h|--help) sed -n '2,26p' "${BASH_SOURCE[0]}"; exit 0 ;;
        *) echo "unknown argument: $1" >&2; exit 2 ;;
    esac
done

mkdir -p "$LOG_DIR"

PAIRS=()
for exchange in $(echo "$EXCHANGES" | tr ',' ' '); do
    for market in $(echo "$MARKETS" | tr ',' ' '); do
        if [ -n "$ONLY" ] && [ "$ONLY" != "$exchange:$market" ]; then continue; fi
        PAIRS+=("$exchange:$market")
    done
done

if [ "${#PAIRS[@]}" -eq 0 ]; then
    echo "no (exchange, market) pair selected" >&2
    exit 2
fi

echo "realtime live health — ${#PAIRS[@]} pair(s), symbol $SYMBOL, window ${WINDOW}s, min ${MIN_PACKETS} packet(s)"
echo "logs: $LOG_DIR"

passed=0
failed=0
failed_pairs=()

for pair in "${PAIRS[@]}"; do
    exchange="${pair%%:*}"
    market="${pair##*:}"
    log="$LOG_DIR/$exchange-$market.log"

    echo ""
    echo "==== $pair  (log: $log)"

    if command -v timeout > /dev/null 2>&1; then
        timeout --kill-after=5 "$((WINDOW + 45))" \
            env REALTIME_LIVE_HEALTH=1 node "$HARNESS" \
            --exchange "$exchange" --market "$market" \
            --symbol "$SYMBOL" --seconds "$WINDOW" --min-packets "$MIN_PACKETS" $VERBOSE > "$log" 2>&1
    else
        REALTIME_LIVE_HEALTH=1 node "$HARNESS" \
            --exchange "$exchange" --market "$market" \
            --symbol "$SYMBOL" --seconds "$WINDOW" --min-packets "$MIN_PACKETS" $VERBOSE > "$log" 2>&1
    fi

    code=$?
    grep -E '^\[LIVE-HEALTH\] (result|check +FAIL|check +WARN)' "$log" || tail -n 4 "$log"

    if [ "$code" -eq 0 ]; then
        passed=$((passed + 1))
    else
        failed=$((failed + 1))
        failed_pairs+=("$pair (exit $code)")
    fi
done

echo ""
echo "==== summary: $passed passed, $failed failed"
if [ "$failed" -gt 0 ]; then
    printf '     failed: %s\n' "${failed_pairs[@]}"
    exit 1
fi

exit 0
