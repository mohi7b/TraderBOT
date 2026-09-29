"use client";
/**
 * C3 — **تازه‌سازی زندهٔ چارت با diff** (سبک، بدون بلاک‌کردن UI).
 * ============================================================
 * رفتار:
 *  · هر `intervalMs` (پیش‌فرض ۴۵s) یک درخواست **diff** با `since=latestTimestamp`
 *    به Route Handler داخلی می‌زند (سمت سرور با احراز allowlist).
 *  · اگر سرور **۳۰۴** داد (بدون بدنه) هیچ کاری نمی‌کند ⇒ هزینهٔ صفر.
 *  · اگر کندل تازه‌ای بود ⇒ `router.refresh()` (رندر مجدد Server Component با
 *    همان مبنا/سیاست) ⇒ **هیچ منطق موازی در کلاینت ساخته نمی‌شود**.
 *  · **تب مخفی** ⇒ هیچ درخواستی زده نمی‌شود (`document.visibilityState`).
 *  · **backoff نمایی** در خطا (۴۵s → ۹۰s → ۱۸۰s → حداکثر ۳۰۰s) و ریست در موفقیت.
 *  · **feature-flag:** `NEXT_PUBLIC_HISTORICAL_LIVE=0` ⇒ کامل خاموش.
 */
import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
/** 🟩 مرحلهٔ ۱۳ — عرض تایم‌فریم برای هم‌ترازی با مرز بسته‌شدن کندل ✓ (ماژول ثابت‌ها ✓) */
import { tfWidthMs } from "@/lib/historical/services";

export interface HistoricalLivePollerProps {
  symbol: string;
  timeframe: string;
  venue: string;
  /** آخرین کندل شناخته‌شده (ms) — از `meta.latestTimestamp` سرور */
  latestTimestamp: number | null;
  /** بازهٔ پایه (ms) — پیش‌فرض ۴۵ ثانیه */
  intervalMs?: number;
}

const MAX_BACKOFF_MS = 300_000;
/** سقف تأخیر در تایم‌فریم‌های بزرگ (۱d/۱w/…) تا دادهٔ دیرکرده هم دیده شود ✓ */
const MAX_ALIGNED_DELAY_MS = 5 * 60_000;
/** حداقل فاصله (کف) — هیچ‌وقت تندتر از این پول نمی‌کنیم ✓ */
const MIN_ALIGNED_DELAY_MS = 15_000;

/**
 * 🟩 **مرحلهٔ ۱۳ — تأخیرِ «هم‌تراز با مرز کندل»** (رفع «گاهی یک کندل، گاهی دو» ✗):
 *   به‌جای ضربانِ ثابت (۴۵s ✗) که هیچ نسبتی با بسته‌شدن کندل ندارد، پول بعدی
 *   **درست چند ثانیه پس از مرزِ بعدیِ همان تایم‌فریم** می‌زند ✓:
 *     `delay = (عرضTF − (now mod عرضTF)) + مهلت انتشار`
 *   ⇒ هر رفرش، **دقیقاً یک کندل بستهٔ تازه** را می‌آورد ✓ (نه صفر، نه دو ✗).
 *   · مهلت انتشار: ۴s برای TFهای ≤۱ساعت ✓ · ۱۵s برای بزرگ‌ترها ✓ (سرویس هم TTL دارد ✓)
 *   · کف ۱۵s ✓ و سقف ۵ دقیقه ✓ (TFهای بلند هر ۵ دقیقه چک می‌شوند تا دیرکرد پنهان نماند ✓)
 */
export function alignedDelayMs(timeframe: string, nowMs: number, padMs?: number): number {
  const width = tfWidthMs(timeframe);
  if (!Number.isFinite(width) || width <= 0) return MIN_ALIGNED_DELAY_MS;
  const pad = padMs ?? (width <= 3_600_000 ? 4_000 : 15_000);
  const rem = ((nowMs % width) + width) % width;
  const raw = width - rem + pad;
  return Math.max(MIN_ALIGNED_DELAY_MS, Math.min(MAX_ALIGNED_DELAY_MS, Math.round(raw)));
}
/**
 * 🟩 **مرحلهٔ ۱۱ — تریگر «نوک زندهٔ forming» پیش‌فرض خاموش است** ✓ (خواستهٔ کاربر):
 *   چارت تاریخی فقط با **کندل بستهٔ تازه** به‌روز می‌شود ✓ و کندل نیم‌بسته هرگز روی
 *   چارت نمی‌آید ✗ (آن با بخش **ریل‌تایم** در آینده می‌آید ✓).
 *   برای روشن‌کردن در آینده: `NEXT_PUBLIC_HISTORICAL_FORMING=1` ✓ (سازگاری عقب‌رو ✓).
 */
const FORMING_TICK_ENABLED = process.env.NEXT_PUBLIC_HISTORICAL_FORMING === "1";

/** حداقل فاصلهٔ بین دو رفرش (throttle نوک زندهٔ `forming`) */
const MIN_REFRESH_MS = 30_000;

export function HistoricalLivePoller({
  symbol,
  timeframe,
  venue,
  latestTimestamp,
  intervalMs = 45_000,
}: HistoricalLivePollerProps) {
  const router = useRouter();
  /** ETag + since در ref نگه داشته می‌شوند (بدون رندر مجدد) */
  const stateRef = useRef<{
    etag: string | null;
    since: number | null;
    fails: number;
    /** کلید نوک زندهٔ `forming` (timestamp:close) برای تشخیص تغییر قیمت */
    formingKey: string | null;
    /** آخرین کلیدی که به‌خاطر throttle رفرش نشد */
    pendingForming: string | null;
    /** مهر زمانی آخرین رفرش (برای throttle) */
    lastRefreshAt: number;
  }>({
    etag: null,
    since: latestTimestamp,
    fails: 0,
    formingKey: null,
    pendingForming: null,
    lastRefreshAt: 0,
  });

  useEffect(() => {
    /** flag خاموشی فوری (بدون deploy) */
    if (process.env.NEXT_PUBLIC_HISTORICAL_LIVE === "0") return;
    stateRef.current.since = latestTimestamp;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const schedule = (ms: number) => {
      if (stopped) return;
      timer = setTimeout(tick, ms);
    };

    const tick = async () => {
      /** تب مخفی (یا بدون document) ⇒ فقط زمان‌بندی دوباره، بدون درخواست */
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        schedule(alignedDelayMs(timeframe, Date.now()));
        return;
      }
      const { since, etag, fails, formingKey, lastRefreshAt } = stateRef.current;
      /**
       * **`light=1`:** پاسخ poll فقط متادیتا/`diff`/`forming` است (چند KB) —
       * نه آرایهٔ ۱٫۹ مگابایتی کندل‌ها ✓
       */
      const url =
        `/api/historical/tf?light=1&symbol=${encodeURIComponent(symbol)}` +
        `&tf=${encodeURIComponent(timeframe)}&exchange=${encodeURIComponent(venue)}` +
        (typeof since === "number" ? `&since=${since}` : "");
      try {
        const res = await fetch(url, {
          cache: "no-store",
          headers: etag ? { "if-none-match": etag } : undefined,
        });
        if (res.status === 304) {
          stateRef.current.fails = 0;
          schedule(alignedDelayMs(timeframe, Date.now()));
          return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as {
          etag?: string | null;
          meta?: { latestTimestamp?: number | null };
          forming?: { timestamp?: number; close?: number } | null;
          diff?: { appended?: unknown[] } | null;
        };
        stateRef.current.etag = body.etag ?? null;
        stateRef.current.fails = 0;
        const appended = body.diff?.appended?.length ?? 0;
        const latest = body.meta?.latestTimestamp ?? null;
        if (typeof latest === "number") stateRef.current.since = latest;
        const nextFormingKey = body.forming
          ? `${body.forming.timestamp}:${body.forming.close}`
          : null;
        /**
         * **دو تریگر رفرش:**
         *  ۱) **کندل بستهٔ تازه** (`appended > 0`) — حرکت واقعی چارت ✓
         *  ۲) **تغییر نوک زندهٔ `forming`** (قیمت کندل جاری) با **throttle**
         *     `MIN_REFRESH_MS` تا رندر پشت‌سرهم نشود ✓ (قبلاً نوک زنده تا
         *     بسته‌شدن باکت بعدی ثابت می‌ماند ✗)
         */
        const formingChanged =
          FORMING_TICK_ENABLED && nextFormingKey !== null && nextFormingKey !== formingKey;
        const throttleOk = Date.now() - lastRefreshAt >= MIN_REFRESH_MS;
        if (appended > 0 || (formingChanged && throttleOk)) {
          stateRef.current.lastRefreshAt = Date.now();
          stateRef.current.formingKey = nextFormingKey;
          router.refresh();
        } else if (FORMING_TICK_ENABLED && nextFormingKey !== formingKey) {
          /** throttle مانع شد ⇒ کلید را نگه می‌داریم تا در نوبت بعد رفرش شود */
          stateRef.current.pendingForming = nextFormingKey;
        }
        if (!formingChanged && stateRef.current.pendingForming) {
          stateRef.current.formingKey = stateRef.current.pendingForming;
          stateRef.current.pendingForming = null;
        }
        /** 🟩 مرحلهٔ ۱۳ — پول بعدی هم‌تراز با مرز کندل ✓ (نه ضربان ثابت ✗) */
        schedule(alignedDelayMs(timeframe, Date.now()));
      } catch {
        stateRef.current.fails = Math.min(fails + 1, 4);
        /** backoff نمایی: ۴۵s → ۹۰s → ۱۸۰s → ۳۶۰s (سقف ۳۰۰s) */
        schedule(
          Math.min(
            Math.max(intervalMs * 2 ** stateRef.current.fails, MIN_ALIGNED_DELAY_MS),
            MAX_BACKOFF_MS,
          ),
        );
      }
    };

    schedule(alignedDelayMs(timeframe, Date.now()));
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [symbol, timeframe, venue, latestTimestamp, intervalMs, router]);

  /** هیچ DOM‌ای تولید نمی‌کند (قطعهٔ رفتاری، نه بصری) */
  return null;
}
