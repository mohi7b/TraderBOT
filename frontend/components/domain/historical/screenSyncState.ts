/**
 * screenSyncState — دروازهٔ ScreenThemeSync (بازبینی شانزدهم)
 * frontend/components/domain/historical/screenSyncState.ts
 * ============================================================
 * چرا؟ در معماری V2 تم هیچ نقشی در ابعاد/محل چارت ندارد و ارتفاع هم آرگومان
 * صفحه است. اما در re-init‌ها (تغییر تایم‌فریم/داده/تم) چارت پیش از کامل‌شدن
 * تشخیص اسکرین ساخته می‌شد ⇒ screenClass="unknown" و قاب نامعتبر ⇒ ناپدید شدن
 * چارت در حالت‌های غیر دسکتاپ.
 *
 * راه‌حل: دروازهٔ ساده و بدون React:
 *   · ScreenThemeSync پس از نخستین تشخیص، markScreenSyncDone() را صدا می‌زند.
 *   · BaseChart تا done نشدن، هیچ چارتی نمی‌سازد (init در صف می‌ماند) و با تغییر
 *     state، افکت ساخت دوباره اجرا و صف تخلیه می‌شود.
 *   · fail-open: صفحه‌هایی که ScreenThemeSync ندارند با تورِ زمانی قفل نمی‌شوند.
 */
let done = false;
const subs = new Set<() => void>();

export function isScreenSyncDone(): boolean {
  return done;
}

export function markScreenSyncDone(): void {
  if (done) return;
  done = true;
  for (const f of subs) {
    try {
      f();
    } catch {
      /* noop */
    }
  }
  subs.clear();
}

/** اشتراک (تابع لغو برمی‌گرداند). اگر همین حالا done باشد، فوراً صدا می‌شود. */
export function onScreenSync(cb: () => void): () => void {
  if (done) {
    cb();
    return () => {};
  }
  subs.add(cb);
  return () => subs.delete(cb);
}
