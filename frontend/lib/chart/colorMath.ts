/**
 * ============================================================
 * Color Math — ریاضی رنگ برای بج‌های سیگنال (خالص و تست‌پذیر)
 * frontend/lib/chart/colorMath.ts
 * ============================================================
 * چرا لازم است؟
 *   «حالهٔ رنگ وضعیت» روی پس‌زمینهٔ بج (ISS) باید هم‌خانواده با بقیهٔ بج‌ها
 *   بماند ولی **متن روی آن خوانا** باشد. پس به ترکیب آلفا، سنجش روشنایی و
 *   کنتراست نیاز داریم — بدون هیچ کتابخانهٔ بیرونی.
 * ============================================================
 */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  /** آلفا ۰..۱ */
  a: number;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** تجزیهٔ `#rgb` · `#rrggbb` · `#rrggbbaa` · `rgb()` · `rgba()`. */
export function parseColor(input?: string | null): Rgba | null {
  if (!input) return null;
  const s = input.trim().toLowerCase();

  const hex = /^#([0-9a-f]{3,8})$/.exec(s);
  if (hex) {
    const h = hex[1]!;
    if (h.length === 3 || h.length === 4) {
      return {
        r: parseInt(h[0]! + h[0]!, 16),
        g: parseInt(h[1]! + h[1]!, 16),
        b: parseInt(h[2]! + h[2]!, 16),
        a: h.length === 4 ? parseInt(h[3]! + h[3]!, 16) / 255 : 1,
      };
    }
    if (h.length === 6 || h.length === 8) {
      return {
        r: parseInt(h.slice(0, 2), 16),
        g: parseInt(h.slice(2, 4), 16),
        b: parseInt(h.slice(4, 6), 16),
        a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
      };
    }
    return null;
  }

  const rgb = /^rgba?\(([^)]+)\)$/.exec(s);
  if (rgb) {
    const parts = rgb[1]!.split(/[,\s/]+/).filter(Boolean).map((p) => Number.parseFloat(p));
    if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null;
    return {
      r: clamp01(parts[0]! / 255) * 255,
      g: clamp01(parts[1]! / 255) * 255,
      b: clamp01(parts[2]! / 255) * 255,
      a: parts.length >= 4 && Number.isFinite(parts[3]!) ? clamp01(parts[3]!) : 1,
    };
  }
  return null;
}

/** ساخت رشتهٔ CSS (hex اگر آلفا ۱ باشد، وگرنه rgba()). */
export function toCss(c: Rgba): string {
  const r = Math.round(c.r);
  const g = Math.round(c.g);
  const b = Math.round(c.b);
  if (c.a >= 1) return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  return `rgba(${r}, ${g}, ${b}, ${Math.round(c.a * 1000) / 1000})`;
}

/** همان رنگ با آلفای جدید. */
export function withAlpha(color: string, alpha: number): string {
  const c = parseColor(color);
  if (!c) return color;
  return toCss({ ...c, a: clamp01(alpha) });
}

/** ترکیب لایهٔ رویی (با آلفا) روی لایهٔ زیرین — استاندارد alpha compositing. */
export function composite(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a + bottom.a * (1 - top.a);
  if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  const f = (t: number, b: number) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
  return { r: f(top.r, bottom.r), g: f(top.g, bottom.g), b: f(top.b, bottom.b), a };
}

/** اختلاط خطی دو رنگ (t=0 → a · t=1 → b). */
export function mix(a: string, b: string, t: number): string {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return a;
  const k = clamp01(t);
  return toCss({
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k,
    a: ca.a + (cb.a - ca.a) * k,
  });
}

/** روشنایی نسبی WCAG (۰..۱). */
export function luminance(color: string): number {
  const c = parseColor(color);
  if (!c) return 0;
  const ch = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
}

/** نسبت کنتراست WCAG بین دو رنگ (۱..۲۱). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * رنگ متن را (فقط در صورت نیاز) به سمت سفید یا سیاه می‌برد تا کنتراست
 * حداقل `min` روی پس‌زمینهٔ `bg` تضمین شود — رنگ‌مایهٔ اصلی حفظ می‌شود.
 *
 * ⚠️ جهت (سفید/سیاه) با **سنجش واقعی** انتخاب می‌شود، نه فقط روشنایی پس‌زمینه:
 * در تم روشن، زمینهٔ نارنجی/قرمز روشن است ولی متن باید تیره‌تر شود
 * (وگرنه متن سفید روی نارنجی روشن = کنتراست ~۲ و ناخوانا).
 */
export function ensureContrast(fg: string, bg: string, min = 3.5): string {
  const start = contrastRatio(fg, bg);
  if (start >= min) return fg;
  // گام‌های متناوب سفید/سیاه (کم‌ترین انحراف از رنگ اصلی که حد کنتراست را رد کند)
  for (const t of [0.2, 0.35, 0.5, 0.65, 0.8]) {
    for (const toward of ["#ffffff", "#000000"]) {
      const cand = mix(fg, toward, t);
      if (contrastRatio(cand, bg) >= min) return cand;
    }
  }
  // آخرین راه: هرکدام از سیاه/سفید که کنتراست بیشتری دارد
  return contrastRatio("#ffffff", bg) >= contrastRatio("#000000", bg) ? "#ffffff" : "#000000";
}

/** رنگ پس‌زمینهٔ کارتِ فرضی تم (برای سنجش کنتراست بج‌های نیمه‌شفاف). */
export function assumedCardColor(themeBackground: string, textColor: string): string {
  const bg = parseColor(themeBackground);
  if (bg && bg.a >= 0.9) return toCss(bg);
  // تم شفاف ⇒ کارت را از روشنایی متن حدس بزن (متن روشن = تم تیره)
  return luminance(textColor) > 0.5 ? "#0e1522" : "#ffffff";
}

/** ورودی رنگ‌آمیزی «بج وضعیت» (مثل ISS): حالهٔ رنگ روی پایهٔ بقیهٔ بج‌ها. */
export interface StatusBadgeInput {
  /** رنگ وضعیت (سبز/زرد/نارنجی/قرمز) — پس‌زمینه از این ساخته می‌شود */
  toneColor: string;
  /** رنگ متن مقدار (منطق جهتی، مثل سیگنال روند) */
  valueColor: string;
  /** رنگ برچسب (معمولاً textMuted تم) */
  labelColor: string;
  /** پایهٔ پس‌زمینهٔ بج‌های دیگر (badgeBg تم) */
  baseBadgeBg?: string;
  /** رنگ مؤثر کارت پشت بج */
  cardBg: string;
  /** آلفای حاله (پیش‌فرض ۰٫۳۵) */
  tint?: number;
  /** آلفای «حلقه» (حاشیه) — پیش‌فرض `tint + 0.5` ⇒ رنگ خالص وضعیت در لبه دیده شود */
  borderTint?: number;
  /** آلفای «صفحهٔ زیرین متن مقدار» (پیش‌فرض ۰٫۳۵) — متن را از پس‌زمینهٔ رنگی جدا می‌کند */
  valuePlate?: number;
  /** تنظیم خودکار عمق صفحه بر پایهٔ روشنایی پس‌زمینه (پیش‌فرض: روشن) */
  adaptivePlate?: boolean;
  /** رنگ صفحهٔ زیرین (پیش‌فرض: مشکی روی کارت تیره · سفید روی کارت روشن) */
  valuePlateColor?: string;
  /** کنتراست حداقلی متن مقدار (پیش‌فرض ۴٫۵ = AA) */
  valueMinContrast?: number;
  /** کنتراست حداقلی برچسب (پیش‌فرض ۴) */
  labelMinContrast?: number;
}

export interface StatusBadgePaint {
  /** پس‌زمینهٔ نهایی (حالهٔ رنگ روی پایهٔ badgeBg) */
  bg: string;
  /** حاشیه = همان رنگ وضعیت با آلفای بیشتر (لبهٔ «هاله» = رنگ خالص وضعیت) */
  border: string;
  /** رنگ متن مقدار پس از تضمین کنتراست */
  value: string;
  /** صفحهٔ زیرین متن مقدار (CSS background) — متن را «جلوتر» می‌آورد */
  valueBg?: string;
  /** رنگ برچسب پس از تضمین کنتراست */
  label: string;
  /** هالهٔ نور هم‌رنگ جهت (text-shadow) */
  glow?: string;
  /** پس‌زمینهٔ مؤثر بج (برای تست/دیباگ) */
  effectiveBg: string;
  /** پس‌زمینهٔ مؤثر زیر متن مقدار (صفحه + حاله) */
  valueSurfaceBg: string;
}

/**
 * رنگ‌آمیزی بجِ وضعیت:
 *   · پس‌زمینه = رنگ وضعیت با آلفای `tint` **روی همان پایهٔ بقیهٔ بج‌ها**
 *     (لایهٔ دوم) ⇒ فقط یک «هاله» از رنگ دیده می‌شود و خانوادهٔ بج‌ها نمی‌شکند.
 *   · **لبه (حلقه)** = همان رنگ با آلفای بالا ⇒ رنگ خالص وضعیت در لبه خوانده
 *     می‌شود؛ همین حلقه است که «زرد» را از «نارنجی» جدا می‌کند.
 *   · متن‌ها با تضمین کنتراست (مقدار ۴٫۵ = AA · برچسب ۴) روی پس‌زمینهٔ مؤثر
 *     ⇒ روی پس‌زمینهٔ هم‌خانواده (سبز روی سبز / قرمز روی نارنجی) متن به
 *     سفیدِ همان‌رنگ میل می‌کند و برجسته می‌شود.
 *   · `glow` = هالهٔ نور کم‌رنگ هم‌رنگ متن (برای بج‌های fill).
 */
export function statusBadgePaint(input: StatusBadgeInput): StatusBadgePaint {
  const tintAlpha = Math.max(0.05, Math.min(0.9, input.tint ?? 0.35));
  const borderAlpha = Math.max(0.05, Math.min(1, input.borderTint ?? tintAlpha + 0.5));
  const valueMin = input.valueMinContrast ?? 4.5;
  const labelMin = input.labelMinContrast ?? 4;
  const tint = withAlpha(input.toneColor, tintAlpha);
  const bg = input.baseBadgeBg
    ? `linear-gradient(${tint}, ${tint}), ${input.baseBadgeBg}`
    : tint;
  const base = parseColor(input.baseBadgeBg) ?? { r: 0, g: 0, b: 0, a: 0 };
  const card = parseColor(input.cardBg) ?? { r: 0, g: 0, b: 0, a: 1 };
  const tintRgba = parseColor(tint) ?? { r: 0, g: 0, b: 0, a: 0 };
  const effectiveBg = toCss(composite(tintRgba, composite(base, card)));
  /**
   * صفحهٔ زیرین متن مقدار («جلوتر آوردن متن»): یک سطح ملایم هم‌سو با کارت
   * (تیره روی کارت تیره · روشن روی کارت روشن) تا متن روی سطح خودش بنشیند ⇒
   * ۱) رنگ متن **مطلق** می‌ماند (با هیوی پس‌زمینهٔ وضعیت مخلوط نمی‌شود)
   * ۲) کنتراست AA راحت‌تر به دست می‌آید و متن برجسته‌تر دیده می‌شود.
   *
   * `adaptivePlate` (پیش‌فرض روشن) عمق را با روشنایی پس‌زمینهٔ بج تنظیم می‌کند:
   * روی تگ روشن‌تر (مثل «هشدار» زرد) کمی تیره‌تر و روی تگ‌های تیره همان نرم ⇒
   * صفحه در رنگ تگ محو می‌شود ولی رنگ متن دست‌نخورده می‌ماند.
   */
  const plateBase = Math.max(0, Math.min(0.8, input.valuePlate ?? 0.35));
  const plateAlpha =
    input.adaptivePlate === false
      ? plateBase
      : Math.max(plateBase, Math.min(0.8, plateBase + (luminance(effectiveBg) - 0.05) * 1.6));
  const plateColor =
    input.valuePlateColor ?? (luminance(input.cardBg) > 0.5 ? "#ffffff" : "#000000");
  const valueSurfaceBg =
    plateAlpha > 0
      ? toCss(
          composite(
            parseColor(withAlpha(plateColor, plateAlpha)) ?? { r: 0, g: 0, b: 0, a: 0 },
            parseColor(effectiveBg) ?? { r: 0, g: 0, b: 0, a: 1 },
          ),
        )
      : effectiveBg;
  const value = ensureContrast(input.valueColor, valueSurfaceBg, valueMin);
  return {
    bg,
    border: withAlpha(input.toneColor, borderAlpha),
    value,
    valueBg: plateAlpha > 0 ? withAlpha(plateColor, plateAlpha) : undefined,
    label: ensureContrast(input.labelColor, effectiveBg, labelMin),
    /**
     * هالهٔ نور از **رنگ خالص جهت** (نه رنگ اصلاح‌شدهٔ متن) ساخته می‌شود:
     * اگر متن برای کنتراست روشن‌تر/تیره‌تر شود، رنگ‌مایهٔ جهت از دست می‌رفت؛
     * با این هاله «متن + هالهٔ سبز/قرمز» هم خوانا است و هم جهت را نشان می‌دهد.
     */
    glow: `0 0 6px ${withAlpha(input.valueColor, 0.55)}`,
    effectiveBg,
    valueSurfaceBg,
  };
}
