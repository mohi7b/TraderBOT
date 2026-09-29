/**
 * ChartEngine V2 · **P1 گام ۱.۳** — `SpecGate` + `MissingPolicy`
 * frontend/components/base/engine/core/specGate.ts
 * ============================================================
 * ماژول‌های V2 «قطعهٔ قرارداد» (`SpecFragment`) اعلان می‌کنند و پیش از رندر باید از
 * یک **دروازهٔ واحد** بگذرند ✓ (نه اعتبارسنجی پراکنده ✗).
 *  · `MissingPolicy`: سیاست واحد دادهٔ ناقص («بدون مقدار ساختگی» ✗ + `N/A` ✓)
 *  · `validateModuleFragment`: شناسه/نوع/semver/`heightRatio ≤ 0.6` (قرارداد v3.1 ✓)
 *    و **سریالایزپذیری پارامترها** (تابع ممنوع ✗ — درس واقعی: ۵۰۰ Turbopack)
 * ⚠️ صفر وابستگی به React/DOM ✗ ⇒ selfTest در Node ✓ و انتشار در SSR ✓.
 */

/** سیاست واحد دادهٔ ناقص (منبع حقیقت ✓). */
export const MISSING_POLICY = Object.freeze({
  fabricate: false as const,
  label: "N/A",
  mode: "na" as const,
});

export function naValue(): string {
  return MISSING_POLICY.label;
}

/** آیا مقدار «موجود» است؟ (`null`/`undefined`/`NaN` = ناقص ✓) */
export function isPresent(v: unknown): boolean {
  return v !== null && v !== undefined && !(typeof v === "number" && Number.isNaN(v));
}

/** مقدار موجود، وگرنه fallback (هیچ ساختگی ✗). */
export function missingValueOr<T>(v: T | null | undefined, fallback: T): T {
  return isPresent(v) ? (v as T) : fallback;
}

export type SpecFragmentKind = "pane" | "overlay" | "series" | "layer";

export interface SpecFragment {
  kind: SpecFragmentKind;
  id: string;
  version?: string;
  params?: Record<string, unknown>;
  /** فقط برای `kind:"pane"` (قید قرارداد ≤ ۰٫۶ ✓) */
  heightRatio?: number;
  /** صریح: این قطعه مقدار ساختگی تولید نمی‌کند ✓ */
  noFabrication?: boolean;
}

export interface GateResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const ID_RE = /^[a-z0-9][a-z0-9_.-]{0,63}$/i;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const KINDS: ReadonlySet<string> = new Set(["pane", "overlay", "series", "layer"]);

/** فقط ساختار دادهٔ سریالایزپذیر (تابع/سیمبل ممنوع ✗). */
function isSerializable(value: unknown, depth = 0): boolean {
  if (depth > 6) return false;
  const t = typeof value;
  if (t === "function" || t === "symbol" || t === "bigint") return false;
  if (value === null || t !== "object") return true;
  if (Array.isArray(value)) return value.every((v) => isSerializable(v, depth + 1));
  return Object.values(value as Record<string, unknown>).every((v) => isSerializable(v, depth + 1));
}

/**
 * اعتبارسنجی یک قطعهٔ قرارداد ماژول.
 * @param knownIds اگر داده شود، شناسهٔ ناشناس **هشدار** می‌گیرد (نه خطا ✓)
 */
export function validateModuleFragment(f: SpecFragment, knownIds?: string[]): GateResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!f || typeof f !== "object") return { ok: false, errors: ["قطعهٔ قرارداد نیست"], warnings };

  if (typeof f.id !== "string" || !ID_RE.test(f.id)) errors.push(`شناسهٔ نامعتبر: «${String(f.id)}»`);
  if (!KINDS.has(String(f.kind))) errors.push(`نوع نامعتبر: «${String(f.kind)}»`);

  if (f.version === undefined) warnings.push("بدون `version` (بازرسی SSR نخواهد داشت)");
  else if (!SEMVER_RE.test(f.version)) errors.push(`نسخهٔ نامعتبر (semver لازم): «${f.version}»`);

  if (f.kind === "pane") {
    if (f.heightRatio === undefined) warnings.push("پنل بدون `heightRatio` (پیش‌فرض اعمال می‌شود)");
    else if (!(typeof f.heightRatio === "number") || f.heightRatio <= 0 || f.heightRatio > 0.6) {
      errors.push(`heightRatio باید در بازهٔ (0, 0.6] باشد: «${String(f.heightRatio)}»`);
    }
  }
  if (f.params !== undefined && !isSerializable(f.params)) {
    errors.push("پارامترها سریالایزپذیر نیستند (تابع/سیمبل ممنوع ✗)");
  }
  if (f.noFabrication === false) warnings.push("`noFabrication:false` خلاف سیاست دادهٔ ناقص ✗");
  if (knownIds && !knownIds.includes(f.id)) warnings.push(`شناسه در رجیستری نیست: «${f.id}»`);

  return { ok: errors.length === 0, errors, warnings };
}

/** **خودآزمون** (الگوی پروژه · در SSR منتشر می‌شود) — `@returns` خطاها */
export function specGateSelfTest(): string[] {
  const errs: string[] = [];

  const good = validateModuleFragment({
    kind: "pane",
    id: "pulse.z",
    version: "1.0.0",
    heightRatio: 0.18,
    params: { window: 96, threshold: 2.5 },
  });
  if (!good.ok) errs.push(`قطعهٔ سالم رد شد: ${good.errors.join(" · ")}`);

  if (validateModuleFragment({ kind: "pane", id: "p", version: "1.0.0", heightRatio: 0.7 }).ok !== false) {
    errs.push("heightRatio=0.7 باید رد شود ✗");
  }
  if (validateModuleFragment({ kind: "series", id: "bad id!" }).ok !== false) errs.push("شناسهٔ نامعتبر باید رد شود ✗");
  if (validateModuleFragment({ kind: "series", id: "s", version: "v1" }).ok !== false) errs.push("نسخهٔ غیرsemver باید رد شود ✗");
  if (validateModuleFragment({ kind: "series", id: "s", version: "1.0.0", params: { f: () => 1 } }).ok !== false) {
    errs.push("پارامتر تابعی باید رد شود ✗ (درس ۵۰۰ Turbopack)");
  }
  const warned = validateModuleFragment({ kind: "pane", id: "p" }, ["other"]);
  if (!warned.ok) errs.push("هشدار نباید خطا شود ✗");
  if (warned.warnings.length < 3) errs.push(`هشدارها کم‌شمرده شد (${warned.warnings.length})`);

  if (MISSING_POLICY.fabricate !== false || naValue() !== "N/A") errs.push("MISSING_POLICY نادرست ✗");
  if (isPresent(null) || isPresent(undefined) || isPresent(Number.NaN)) errs.push("isPresent برای ناقص باید false بدهد ✗");
  if (!isPresent(0) || !isPresent("")) errs.push("isPresent اشتباه است ✗");
  if (missingValueOr(null, "N/A") !== "N/A") errs.push("missingValueOr fallback نداد ✗");
  if (missingValueOr<number | string>(0, "N/A") !== 0) errs.push("missingValueOr مقدار موجود را رد کرد ✗");
  return errs;
}
