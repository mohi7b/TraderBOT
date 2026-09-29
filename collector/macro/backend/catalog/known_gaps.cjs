/**
 * ============================================================
 * Known data gaps — بریدگی‌هایی که «منبع» منتشر نکرده است
 * collector/macro/backend/catalog/known_gaps.cjs
 * ============================================================
 * ⚠️ این‌ها خطای ingest نیستند و **نباید با مقدار ساختگی پر شوند**.
 *     هدف: شفافیت در API و حاشیه‌نویسی چارت (لایهٔ event-markers) تا
 *     کاربر بداند چرا یک ماه وجود ندارد.
 *
 * شاهد 2026-09-20: مجموعهٔ کامل CPI آمریکا (BIS/FRED/OECD) ماه 2025-10 را
 * ندارد — انتشار CPI اکتبر ۲۰۲۵ انجام نشد (توقف فعالیت‌های دولت آمریکا).
 * consequence: YoY ماه 2026-10 هم به‌درستی محاسبه نمی‌شود (پایهٔ سال‌قبل غایب).
 */
module.exports = [
  {
    country: "USA",
    canon: "CPI",
    date: "2025-10",
    label: "2025-10 CPI not published (source gap)",
    reason:
      "US CPI for 2025-10 was not released; absent in BIS, FRED and OECD. " +
      "Consequently the 2026-10 YoY cannot be computed from the same month a year earlier.",
  },
];
