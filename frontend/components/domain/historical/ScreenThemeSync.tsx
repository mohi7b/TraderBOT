"use client";
/**
 * ScreenThemeSync — **همگام‌سازی تمِ نسخه‌دار با عرض واقعی viewport**
 * frontend/components/domain/historical/ScreenThemeSync.tsx
 * ============================================================
 * **چرا؟** سرور فقط UA/Client-Hints را می‌بیند ✗؛ عرض دقیق viewport را نمی‌داند
 * (اغلب مرورگرها `Sec-CH-Viewport-Width` نمی‌فرستند ✗). پس:
 *   · سرور تمِ محتمل را می‌دهد (پیش‌فرض: دسکتاپ ✓ = رفتار امروز ✓)
 *   · این کامپوننت در کلاینت عرض را می‌خواند ✓ و اگر کلاسِ درست فرق داشت،
 *     **فقط یک `?theme=`** به URL اضافه می‌کند ✓ (Converge: بعد از آن دیگر
 *     تغییری نمی‌دهد ⇒ بدون حلقه ✗).
 *
 * ⛔ فقط **ظاهر** را عوض می‌کند ✗: نه پریست ✓، نه `p=` (انتخاب‌های کاربر) ✓،
 *    نه داده ✓ — کوئری‌های دیگر دست‌نخورده می‌مانند ✓.
 */
import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { screenClassOf, themeIdOf } from "@/lib/chart/screenProfiles";
import { markScreenSyncDone } from "./screenSyncState";

export function ScreenThemeSync({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  /** 🆕 **یک‌بار برای همیشه** (بازبینی سیزدهم ✓): بعد از نخستین تعیین تم، دیگر
   *  هیچ سوییچی انجام نمی‌شود ✗ ⇒ هیچ re-init دوباره‌ای رخ نمی‌دهد ✓ (چارت پایدار ✓). */
  const done = useRef(false);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = () => {
      /**
       * دروازهٔ sync: پیش از هر کاری به BaseChart اعلام می‌کنیم که تشخیص کلاینت
       * تمام شد ⇒ چارت با تمِ نهایی و یک‌بار ساخته می‌شود.
       */
      markScreenSyncDone();
      if (done.current) return;
      const cls = screenClassOf(window.innerWidth, { touch: mq.matches, height: window.innerHeight });
      const want = themeIdOf(cls);
      /** فقط وقتی تمِ صریحِ URL وجود ندارد ✓ (احترام به انتخاب کاربر/دیباگ ✓) */
      if (sp.get("theme")) return;
      if (want === current) {
        done.current = true; // تم درست است ⇒ پایان ✓
        return;
      }
      done.current = true; // سوییچ **تنها یک‌بار** ✓ (حتی اگر replace ناموفق باشد ✗)
      const q = new URLSearchParams(sp.toString());
      q.set("theme", want);
      /** `scroll: false` ⇒ هیچ پرش اسکرول/جابجایی ناخواسته ✗ */
      router.replace(`${pathname}?${q.toString()}`, { scroll: false });
    };
    apply();
    window.addEventListener("resize", apply);
    mq.addEventListener?.("change", apply);
    return () => {
      window.removeEventListener("resize", apply);
      mq.removeEventListener?.("change", apply);
    };
  }, [current, pathname, router, sp]);

  return null;
}
