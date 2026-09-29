/**
 * Chart Engine v3 — حل tooltip از کلید i18n (سمت کلاینت، بدون تابع)
 * frontend/lib/chart/spec/hints.ts
 * ============================================================
 * **چرا این‌جا و نه next-intl در کلاینت؟**
 *   چارت‌ها Client Componentاند و صفحه Server Component است؛ طبق Next،
 *   **تابع** را نمی‌توان به Client Component پاس داد
 *   (`Functions cannot be passed directly to Client Components`) و همین باعث
 *   خطای ۵۰۰ شد. پس صفحه فقط **قالب‌های ترجمه (string)** را به‌شکل یک آبجکت
 *   سریالایزپذیر پاس می‌دهد و این‌جا روی کلاینت جای‌گذاری پارامتر انجام می‌شود.
 *
 *   `signals.<id>.<field>` در پیام‌های `macro.{fa,en}.json` می‌نشیند و
 *   `useSignalHints` (در `BaseChart`) این تابع‌ها را صدا می‌زند.
 *
 * ⚠️ جای‌گذاری ICU سادهٔ `{param}` است (نه ICU کامل) — عمداً، چون متن‌های ما
 *    فقط جای‌گذاری عدد/توکن دارند و این روش بدون هیچ dependency کار می‌کند.
 * ============================================================
 */

/** آبجکت سریالایزپذیر قالب‌های ترجمه (از `messages.macro.signals`). */
export type HintTemplates = Record<string, unknown>;

/** خواندن یک مسیر نقطه‌ای (`pas.hint`) از آبجکت قالب‌ها. */
export function lookupHint(hints: HintTemplates | undefined, key: string): string | null {
  if (!hints) return null;
  const path = key.replace(/^signals\./, "").split(".");
  let cur: unknown = hints;
  for (const part of path) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }
  return typeof cur === "string" ? cur : null;
}

/** جای‌گذاری `{param}` با مقادیر (مقدار ناموجود ⇒ `—`). */
export function formatHint(
  template: string,
  params?: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_m, name: string) => {
    const v = params?.[name];
    return v === undefined || v === null || v === "" ? "—" : String(v);
  });
}

/**
 * حل نهایی tooltip:
 *   ۱) کلید i18n (`hintKey`) + قالب‌های ترجمه ⇒ متن + جای‌گذاری پارامترها
 *   ۲) در نبود قالب ⇒ خود `hintKey` (fallback قابل‌تشخیص در تست)
 *   ۳) اگر سیگنال `hintKey` نداشت ⇒ `hint` آماده (سیگنال‌های کتابخانه‌ای قدیمی)
 */
export function resolveHint(
  signal: { hint?: string; hintKey?: string; hintParams?: Record<string, string | number> },
  hints?: HintTemplates,
): string | undefined {
  if (!signal.hintKey) return signal.hint;
  const template = lookupHint(hints, signal.hintKey);
  if (!template) return signal.hintKey;
  return formatHint(template, signal.hintParams);
}
