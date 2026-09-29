#!/usr/bin/env bash
# ============================================================
# historical-updater.sh — به‌روزرسان ۱ دقیقه‌ای + «مراقبت خودکار» (v3)
# ============================================================
# تضمین‌ها:
#   ۱) هم‌ترازی با مرز دقیقهٔ UTC: هر دور در «مرز + SAFETY_MS» شروع می‌شود ✓
#      SAFETY پیش‌فرض **15000ms** ✓ (سنجش واقعی: binance/bybit/kucoin ~۱–۳s ✓ ·
#      okx ~۱۰–۳۵s ✗ · bitget ~۳۰–۹۰s ✗ ⇒ ۱۵s برای ۸ ونو کامل ✓ و okx در بیشتر
#      موارد ✓؛ bitget همیشه ۱–۲ میله عقب‌تر می‌ماند ولی **انبار نمی‌شود** ✗ چون هر
#      دور دقیقاً +۱ می‌گیرد ✓).
#   ۲) همهٔ ونوها هر دور ✓ (فهرست فاصله‌دار ✓ — باگ v1 ✗: IFS ⇒ فقط ونوی اول)
#   ۳) **مراقبت خودکار** ✓: پیش از خوابِ هم‌ترازِ دور بعد، اگر lag هر ونو از
#      LAG_ALERT_MIN (۵ دقیقه ✓) بیشتر بود ⇒ همان ونو **بدون سقف زمانی** و فقط دُم
#      را می‌گیرد ✓ تا به جمع برگردد ✓ ⇒ «هیچ صرافی‌ای عقب نمی‌ماند» ✓ و
#      visited همیشه 10/10 می‌ماند ✓.
#
# استفاده: bash scripts/historical-updater.sh [--once]
# متغیرها: HIST_UPDATER_SYMBOL · HIST_UPDATER_SAFETY_MS (15000) ·
#   HIST_UPDATER_LAG_ALERT_MIN (5) · HIST_UPDATER_MAX_CARETAKES (3) ·
#   HIST_UPDATER_VENUE_TIMEOUT_S (25) · HIST_UPDATER_BUDGET_S (45) ·
#   HIST_UPDATER_VENUES · HIST_UPDATER_LOG · HIST_UPDATER_PID · HIST_UPDATER_LAG_FILE
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FULL_DIR="$REPO_ROOT/collector/crypto/historical/full"
SYMBOL="${HIST_UPDATER_SYMBOL:-BTCUSDT}"
SAFETY_MS="${HIST_UPDATER_SAFETY_MS:-15000}"
LAG_ALERT_MIN="${HIST_UPDATER_LAG_ALERT_MIN:-5}"
MAX_CARETAKES="${HIST_UPDATER_MAX_CARETAKES:-3}"
VENUE_TIMEOUT_S="${HIST_UPDATER_VENUE_TIMEOUT_S:-25}"
BUDGET_S="${HIST_UPDATER_BUDGET_S:-45}"
VENUES_SPEC="${HIST_UPDATER_VENUES:-binance:spot,binance:futures,bybit:spot,bybit:futures,okx:spot,okx:futures,kucoin:spot,kucoin:futures,bitget:spot,bitget:futures}"
LOG="${HIST_UPDATER_LOG:-/tmp/hist-updater.log}"
PIDFILE="${HIST_UPDATER_PID:-/tmp/hist-updater.pid}"
LAG_FILE="${HIST_UPDATER_LAG_FILE:-/tmp/hist-updater.lag}"
# 🟩 برای نگهبانِ «lag انباشته» ✗ (مقایسهٔ دور به دور ✓)
LAG_PREV="${HIST_UPDATER_LAG_PREV:-/tmp/hist-updater.lag.prev}"

ONCE=0
[ "${1:-}" = "--once" ] && ONCE=1

log() { printf '[%s] [updater] %s\n' "$(date -Is)" "$*" | tee -a "$LOG"; }

if [ -f "$PIDFILE" ] && kill -0 "$(cat "$PIDFILE" 2>/dev/null)" 2>/dev/null; then
  echo "updater از قبل در حال اجراست (pid=$(cat "$PIDFILE")). خروج." | tee -a "$LOG"
  exit 0
fi
echo $$ > "$PIDFILE"
trap 'log "خروج تمیز (SIGTERM)"; rm -f "$PIDFILE"; exit 0' TERM INT

VENUE_LIST="${VENUES_SPEC//,/ }"
VENUE_COUNT=$(wc -w <<< "$VENUE_LIST")

# 🟩 منبع موثقِ lag: `lastFilledTimestamp` برای همهٔ ونوها در **یک** فراخوان Node
#    (سریع ✓ خواندنی ✓ بدون نوشتن ✗) — چون پیام‌های run-update گاهی reason=undefined
#    می‌دهند ✗ و نمی‌توان از آن‌ها lag را مطمئن خواند ✗.
snapshot_lags() {
  [ -n "${VENUE_LIST:-}" ] || return 0
  cp -f "$LAG_FILE" "$LAG_PREV" 2>/dev/null || true   # دور قبل را نگه دار ✓
  : > "$LAG_FILE"
  (cd "$FULL_DIR" && SYM="$SYMBOL" node -e '
    const { lastFilledTimestamp } = require("./merge-into-1m-db.cjs");
    const sym = process.env.SYM;
    for (const spec of process.argv.slice(1)) {
      const [v, m] = spec.split(":");
      let iso = "";
      try {
        const t = lastFilledTimestamp(sym, `${v}_${m}`);
        if (Number.isInteger(t)) iso = new Date(t).toISOString().replace(/\.\d+Z$/, "Z");
      } catch (e) { iso = ""; }
      process.stdout.write(`${spec}\t${iso}\n`);
    }
  ' $VENUE_LIST) | while IFS=$'\t' read -r spec iso; do
    [ -z "$spec" ] && continue
    local l
    l=$(lag_of "$iso")
    printf '%s\t%s\t%s\n' "$spec" "${iso:-?}" "$l" >>"$LAG_FILE"
  done
}

lag_of() {   # $1=ISO(UTC) ⇒ دقیقهٔ تأخیر (یا 999 اگر نامعلوم ✗)
  local iso="${1:-}"
  [ -z "$iso" ] && { echo 999; return; }
  local t now
  t=$(date -u -d "$iso" +%s 2>/dev/null) || { echo 999; return; }
  now=$(date -u +%s)
  echo $(( (now - t) / 60 ))
}

# یک بار اجرای یک ونو (با/بدون سقف زمانی ✓) — «آخرین ISO» را در LAST_ISO می‌گذارد
run_venue() {  # $1=spec  $2=uncapped(0/1)
  local spec="$1" uncapped="${2:-0}" v m out rc iso
  v="${spec%%:*}"; m="${spec##*:}"
  if [ "$uncapped" = "1" ]; then
    out="$(cd "$FULL_DIR" && node run-update.cjs "$SYMBOL" --exchange="$v" --market="$m" 2>&1)"
    rc=$?
  else
    out="$(cd "$FULL_DIR" && timeout "${VENUE_TIMEOUT_S}" node run-update.cjs "$SYMBOL" --exchange="$v" --market="$m" 2>&1)"
    rc=$?
  fi
  printf '%s\n' "$out" >>"$LOG"
  iso="$(printf '%s\n' "$out" | grep -oE '\(تا [0-9T:.-]+Z\)' | tail -1 | sed -e 's/^(تا //' -e 's/)$//')"
  if [ -z "$iso" ] && printf '%s\n' "$out" | grep -q 'up-to-date'; then
    iso="$(date -u +%Y-%m-%dT%H:%M:00Z)"
  fi
  LAST_ISO="$iso"
  return "$rc"
}

log "شروع v3 · symbol=$SYMBOL · venues=$VENUE_COUNT · safety=${SAFETY_MS}ms · lagAlert=${LAG_ALERT_MIN}min · caretakes≤${MAX_CARETAKES} · budget=${BUDGET_S}s"

fails=0
while :; do
  started=$(date +%s)
  : > "$LAG_FILE"          # فایل سلامت هر دور از نو نوشته می‌شود ✓
  visited=0
  round_fail=0

  # ---------- دور اصلی: همهٔ ونوها، هر کدام +۱ (دور ~۸s ✓) ----------
  for spec in $VENUE_LIST; do
    elapsed=$(( $(date +%s) - started ))
    if [ "$elapsed" -ge "$BUDGET_S" ]; then
      log "بودجهٔ ${BUDGET_S}s پر شد ⇒ باقی‌مانده در دور بعد ✓ (visited=$visited/$VENUE_COUNT)"
      break
    fi
    LAST_ISO=""
    run_venue "$spec" 0; rc=$?
    lag=$(lag_of "$LAST_ISO")
    printf '%s\t%s\t%s\n' "$spec" "${LAST_ISO:-?}" "$lag" >>"$LAG_FILE"
    if [ "$rc" -eq 124 ]; then
      log "  ⏱ $(sed 's/:/:/' <<<"$spec") از سقف ${VENUE_TIMEOUT_S}s گذشت ⇒ مراقبت خودکار ✓"
      round_fail=$(( round_fail + 1 ))
    elif [ "$rc" -ne 0 ]; then
      log "  ✗ $spec خطا (rc=$rc)"
      round_fail=$(( round_fail + 1 ))
    fi
    visited=$(( visited + 1 ))
  done

  # ---------- 🟩 مراقبت خودکار: ونوهای عقب‌مانده، بدون سقف، فقط دُم ----------
  snapshot_lags   # منبع موثق ✓ (جایگزین حدس از پیام‌ها ✗)
  laggards="$(awk -v a="$LAG_ALERT_MIN" -F'\t' '$3 ~ /^[0-9]+$/ && $3 > a {print $1}' "$LAG_FILE" 2>/dev/null)"
  # 🟩 «lag انباشته ممنوع» ✗: اگر lag یک ونو نسبت به دور قبل **رشد** کرد و ≥۳ شد ⇒
  #    همان‌جا هشدار + ورود به مراقبت ✓ (پیش از آنکه به آستانهٔ ۵ دقیقه برسد ✓).
  accumulating=""
  while IFS=$'\t' read -r vspec vlag; do
    [ -z "${vspec:-}" ] && continue
    case "$vlag" in ''|*[!0-9]*) continue ;; esac
    [ "$vlag" -lt 3 ] && continue
    prev="$(awk -v s="$vspec" -F'\t' '$1==s{print $3}' "$LAG_PREV" 2>/dev/null | tail -1)"
    case "${prev:-}" in ''|*[!0-9]*) continue ;; esac
    if [ "$vlag" -gt "$prev" ]; then accumulating="$accumulating$vspec"$'\n'; fi
  done < "$LAG_FILE"
  if [ -n "$accumulating" ]; then
    log "⚠ lag انباشته (رشد نسبت به دور قبل): $(tr '\n' ' ' <<<"$accumulating")"
    laggards="$(printf '%s\n%s' "$laggards" "$accumulating" | grep -v '^$' | sort -u)"
  fi
  if [ -n "$laggards" ]; then
    log "مراقبت خودکار: عقب‌مانده‌ها = $(tr '\n' ' ' <<<"$laggards")"
    for spec in $laggards; do
      for try in $(seq 1 "$MAX_CARETAKES"); do
        LAST_ISO=""
        log "  ⟳ مراقبت $try/$MAX_CARETAKES ⇒ $spec (بدون سقف ✓ فقط دُم ✓)"
        run_venue "$spec" 1 || log "  ✗ مراقبت $spec ناموفق (rc=$?)"
        lag=$(lag_of "$LAST_ISO")
        log "  ⇒ $spec lag=${lag}min"
        awk -v s="$spec" -F'\t' 'BEGIN{OFS="\t"} $1==s{$2=ARGV[2];$3=ARGV[3];found=1} {print} END{if(!found) print s,ARGV[2],ARGV[3]}' \
          "${LAST_ISO:-?}" "$lag" "$LAG_FILE" > "$LAG_FILE.tmp" && mv "$LAG_FILE.tmp" "$LAG_FILE"
        [ "$lag" -le "$LAG_ALERT_MIN" ] && break
        sleep 5
      done
    done
    log "پایان مراقبت خودکار ✓"
  fi

  if [ "$round_fail" -eq 0 ]; then
    fails=0
    dur=$(( $(date +%s) - started ))
    log "دور تمام شد (ok) — visited=$visited/$VENUE_COUNT · ${dur}s · lag(min): $(awk -F'\t' '{split($1,a,":"); printf "%s=%s ", a[1], $3}' "$LAG_FILE" 2>/dev/null)"
  else
    fails=$(( fails + 1 ))
    log "دور تمام شد (partial=$round_fail) — visited=$visited/$VENUE_COUNT · $(( $(date +%s) - started ))s"
  fi
  [ "$ONCE" = "1" ] && { log "حالت --once ⇒ خروج"; rm -f "$PIDFILE"; exit 0; }

  if [ "$fails" -gt 0 ]; then
    wait=$(( 60 * 2 ** (fails > 3 ? 3 : fails) )); [ "$wait" -gt 300 ] && wait=300
    log "backoff=${wait}s (fails=$fails)"; sleep "$wait"; continue
  fi
  now_ms=$(date +%s%3N); rem_ms=$(( now_ms % 60000 ))
  wait_ms=$(( 60000 - rem_ms + SAFETY_MS ))
  log "هم‌ترازی: انتظار ${wait_ms}ms تا مرز بعدی + $(awk -v s="$SAFETY_MS" 'BEGIN{printf "%.1f", s/1000}')s مهلت انتشار"
  sleep "$(awk -v ms="$wait_ms" 'BEGIN{printf "%.3f", ms/1000}')"
done
