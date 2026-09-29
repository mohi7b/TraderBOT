"use client";
/**
 * ScreenBadge — **برچسب موقتِ تشخیص اسکرین** (TEMP-DEBUG ✓)
 * frontend/components/domain/historical/ScreenBadge.tsx
 * ============================================================
 * کاربر: «برای اینکه عیب‌یابی بصری آسان باشد، نوع اسکرین را به‌عنوان یک برچسب
 * موقت **بالای چارت** نشان بده تا ببینم با ریسایز درست تشخیص داده می‌شود یا نه» ✓.
 *
 * نمایش می‌دهد: حدسِ **سرور** · تشخیصِ **زندهٔ کلاینت** (`matchMedia` ✓) · تمِ فعلی ·
 * عرض×ارتفاع viewport · نسبت لنگر و کسر ارتفاع آن کلاس ✓ (همه از جدول تک‌منبع ✓).
 * ⛔ موقت است — با حذف `<ScreenBadge/>` از صفحه، کامل ناپدید می‌شود ✗ (بدون اثر دیگر ✓).
 */
import { useEffect, useState } from "react";
import {
  detectScreenClass,
  screenClassOf,
  themeIdOf,
  type ScreenClass,
} from "@/lib/chart/screenProfiles";

export function ScreenBadge({ hinted }: { hinted: { cls: ScreenClass | "unknown"; themeId: string } }) {
  const [live, setLive] = useState<{ cls: ScreenClass; w: number; h: number } | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse)");
    const apply = () => {
      const cls = screenClassOf(window.innerWidth, { touch: mq.matches, height: window.innerHeight });
      setLive({ cls, w: window.innerWidth, h: window.innerHeight });
    };
    apply();
    window.addEventListener("resize", apply);
    mq.addEventListener?.("change", apply);
    return () => {
      window.removeEventListener("resize", apply);
      mq.removeEventListener?.("change", apply);
    };
  }, []);

  /** 🆕 «unknown» = حالت خنثیِ SSR ✓ (سرور هیچ تشخیصی نمی‌دهد ✗) */
  const serverLabel = hinted.cls === "unknown" ? "neutral(SSR)" : hinted.cls;
  /** 🆕 ۷ کلاس تشخیصی مصوب (portrait/landscape ✓) برای همین اندازهٔ صفحه ✓ */
  const det = live ? detectScreenClass(live.w, live.h) : null;
  const match = !live || hinted.cls === "unknown" || live.cls === hinted.cls;

  return (
    <div
      data-debug-screen="1"
      className={`mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 rounded border border-dashed px-2 py-1 text-[10px] ${
        match ? "border-border/60 text-muted" : "border-warn/60 text-warn"
      }`}
    >
      <span className="font-medium">SCR (TEMP-DEBUG)</span>
      {det ? <span className="tnum">detect: {det}</span> : null}
      <span>server: <span className="tnum">{serverLabel}</span></span>
      <span>live: <span className="tnum">{live ? live.cls : "…"}</span></span>
      <span>theme: <span className="tnum">{live && live.cls !== hinted.cls ? themeIdOf(live.cls) : hinted.themeId}</span></span>
      <span className="tnum">{live ? `${live.w}×${live.h}` : "SSR"}</span>
      <span className="tnum">aspect={live ? (live.w / live.h).toFixed(2) : "—"}</span>
      <span className="tnum">height=arg(min360)</span>
      {!match ? <span className="font-medium">⇒ تغییر تم لازم است ✓</span> : null}
    </div>
  );
}
