/**
 * viewPersistence — **ماژول واحد مدیریت نمای چارت** (مرحلهٔ ۳ · معماری جامع)
 * frontend/lib/chart/viewPersistence.ts
 * ============================================================
 * قواعدِ قطعی (همه آزمون‌پذیر ✓):
 *   ۱) **کلید یکتا:** `<symbol>|<timeframe>|<chartType>` ✓ (هر ترکیب، حافظهٔ مستقل ✓)
 *   ۲) **حافظهٔ زمان‌محور:** timestamp ✓ — هرگز ایندکس میله ✗ (با کندل تازه نمی‌پرد ✓)
 *   ۳) **انقضا:** `MAX_AGE = 12h` ✓ (کهنه ⇒ باطل و پاک‌سازی ✓)
 *   ۴) **آفست اولیهٔ استاندارد:** `INITIAL_OFFSET_PX = 100` ✓ (فضای آیندهٔ ۱۰۰px ✓)
 *   ۵) **نسخه‌گذاری باندل:** تغییر نسخهٔ حافظه/باندل ⇒ کل حافظه باطل ✓
 *   ۶) **مالکیت نما:** اگر نما از حافظه آمد، زوم پیش‌فرض/تم/auto-fit آن را باطل نمی‌کند ✗
 *   ۷) **بازگردانی یک‌بار:** خواندن `localStorage` فقط در نخستین mount ✓؛ بعد از آن
 *      حافظهٔ **نشست** (که در هر teardown تازه می‌شود ✓) مرجع است ✓
 * ⚠️ صفر وابستگی به React/DOM/LWC ✓ (فقط `localStorage` با نگهبان SSR ✓)
 *    ⇒ `viewPersistenceSelfTest()` در SSR هم بی‌خطر است ✓.
 */

/**
 * نسخهٔ معناییِ حافظهٔ نما — با هر تغییر در معنای رکورد، bump شود ✓
 * 🟩 `1.3.0` (مرحلهٔ ۱۷): **بازهٔ Y از مسیر «پنِ ماوس» دیگر ذخیره نمی‌شود** ✗ (باگ
 * مرحلهٔ ۱۶ ✗: هر رهاکردن ماوس — حتی درگِ افقی با dy=0 ✗ — Y را «تثبیت» می‌کرد و
 * چارت از auto-fit خارج و عملاً «قفل» می‌شد ✗). این نسخه رکوردهای قبلی را باطل
 * می‌کند ✓ ⇒ چارت فوراً به مقیاس خودکار (fit) برمی‌گردد ✓.
 * 🟩 `1.1.0` (مرحلهٔ ۶): آفست اولیه **۱۵۰px ⇒ ۱۰۰px** شد ✓ ⇒ رکوردهای قدیمی
 * (با `px=150` ✓) نامعتبر می‌شوند و نخستین باز شدنِ چارت همان **۱۰۰px** را
 * اعمال می‌کند ✓ (مهاجرت تمیز ✓ بدون نیاز به پاک‌کردن دستی localStorage ✓).
 */
export const VIEW_MEMORY_VERSION = "1.3.0";
/** انقضای حافظهٔ نما (۱۲ ساعت) */
export const VIEW_MAX_AGE_MS = 12 * 60 * 60 * 1000;
/**
 * **آفست اولیهٔ استاندارد فضای راست (پیکسل)** — مستقل از تم/اسکرین ✓
 * 🟩 مرحلهٔ ۶: **۱۰۰px** ⇒ آخرین کندل ≈۱۰۰px از لبهٔ راست فاصله می‌گیرد و
 * یک «فضای آیندهٔ بصری» برای کاربر ساخته می‌شود ✓ (خواستهٔ صریح ✓).
 */
export const INITIAL_OFFSET_PX = 100;
const STORAGE_PREFIX = "view:";

export interface ViewRecord {
  /** آغازهٔ پنجره (timestamp ثانیه) — `0` یعنی «نمایی ذخیره نشده» */
  from: number;
  /** پایان پنجره (timestamp ثانیه) */
  to: number;
  /** زمان ذخیره (ms) — مبنای انقضا */
  at: number;
  /** آفست راست کاربر (پیکسل) — `null` ⇒ آفست اولیهٔ استاندارد */
  px: number | null;
  /**
   * 🟩 **بازهٔ عمودی (Y) دستیِ کاربر** — فقط وقتی محور قیمت **دستی** مقیاس شده باشد
   * (`priceScale("right").options().autoScale === false` ✓) ذخیره می‌شود ✓؛
   * `null` ⇒ محور قیمت خودکار است و ما هیچ کاری نمی‌کنیم ✗ (صفر تغییر رفتار ✓).
   */
  y: { min: number; max: number } | null;
}

interface StoredRecord extends ViewRecord {
  v: string;
  b: string;
}

/** حافظهٔ نشست (per page-load ✓) — بعد از نخستین خواندن، مرجعِ بازگردانی ✓ */
const session = new Map<string, ViewRecord>();

/** نسخهٔ باندل (تغییر آن ⇒ حافظهٔ نما باطل ✓) */
export function bundleId(): string {
  try {
    const env = typeof process !== "undefined" ? process.env?.NEXT_PUBLIC_BUILD_ID : undefined;
    return env && String(env).length ? String(env) : "dev";
  } catch {
    return "dev";
  }
}

/** **کلید یکتا:** `<symbol>|<timeframe>|<chartType>` ✓ */
export function viewKeyOf(symbol: string, timeframe: string, chartType: string): string {
  const s = (symbol || "unknown").trim();
  const t = (timeframe || "na").trim();
  const c = (chartType || "series").trim();
  return `${s}|${t}|${c}`;
}

/**
 * کلید نهایی از `viewKey` موجود (`symbol|tf` ✓ که `CandleChart` می‌دهد) + نوع چارت ✓
 * ⇒ خروجی دقیقاً `<symbol>|<timeframe>|<chartType>` است ✓. `viewKey` خالی ⇒ `""` (خاموش ✓).
 */
export function persistKeyOf(viewKey: string, chartType: string): string {
  const base = (viewKey || "").trim();
  if (!base) return "";
  return `${base}|${(chartType || "series").trim()}`;
}

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** اعتبار رکورد: نسخه ✓ باندل ✓ انقضا ✓ */
function valid(rec: StoredRecord | null, now: number): StoredRecord | null {
  if (!rec) return null;
  if (rec.v !== VIEW_MEMORY_VERSION || rec.b !== bundleId()) return null;
  if (!finite(rec.at) || now - rec.at > VIEW_MAX_AGE_MS) return null;
  const hasView = finite(rec.from) && finite(rec.to) && rec.to > rec.from;
  const hasPx = finite(rec.px) && rec.px >= 0;
  const y = rec.y;
  const hasY =
    Boolean(y) && finite(y!.min) && finite(y!.max) && y!.max > y!.min && y!.min > 0;
  if (!hasView && !hasPx && !hasY) return null;
  return {
    ...rec,
    from: hasView ? rec.from : 0,
    to: hasView ? rec.to : 0,
    px: hasPx ? rec.px : null,
    y: hasY ? { min: y!.min, max: y!.max } : null,
  };
}

function storage(): Storage | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function read(key: string, now: number): StoredRecord | null {
  const ls = storage();
  if (!ls) return null;
  try {
    const raw = ls.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRecord;
    const ok = valid(parsed, now);
    if (!ok) ls.removeItem(STORAGE_PREFIX + key); // نسخه/انقضای نامعتبر ⇒ پاک‌سازی ✓
    return ok;
  } catch {
    return null;
  }
}

function write(key: string, rec: ViewRecord): void {
  const ls = storage();
  if (!ls) return;
  try {
    const stored: StoredRecord = { ...rec, v: VIEW_MEMORY_VERSION, b: bundleId() };
    ls.setItem(STORAGE_PREFIX + key, JSON.stringify(stored));
  } catch {
    /* noop */
  }
}
function merge(key: string, patch: Partial<ViewRecord>, now: number): ViewRecord {
  const cur =
    session.get(key) ?? read(key, now) ?? { from: 0, to: 0, at: now, px: null, y: null };
  const next: ViewRecord = { ...cur, ...patch, at: now };
  session.set(key, next);
  write(key, next);
  return next;
}

/** ذخیرهٔ **پنجرهٔ زمانی** (timestamp ✓) برای یک کلید ✓ */
export function saveView(
  key: string,
  range: { from: number; to: number },
  now = Date.now(),
): boolean {
  if (!key) return false;
  if (!finite(range.from) || !finite(range.to) || range.to <= range.from) return false;
  merge(key, { from: range.from, to: range.to }, now);
  return true;
}

/** ذخیرهٔ **آفست راست** (پیکسل ✓) برای یک کلید ✓ */
export function saveOffsetPx(key: string, px: number, now = Date.now()): boolean {
  if (!key) return false;
  if (!finite(px) || px < 0) return false;
  merge(key, { px }, now);
  return true;
}

/**
 * بازگردانی نما — `fresh` (نخستین mount ✓) ⇒ `localStorage` هم خوانده می‌شود ✓؛
 * وگرنه فقط حافظهٔ نشست ✓ (قاعدهٔ «بازگردانی یک‌بار» ✓ · در SSR هیچ‌چیز ✗).
 */
export function restoreView(
  key: string,
  opts: { fresh?: boolean; now?: number } = {},
): { from: number; to: number } | null {
  if (!key) return null;
  const now = opts.now ?? Date.now();
  let rec = session.get(key) ?? null;
  if (!rec && opts.fresh) rec = read(key, now);
  if (!rec) return null;
  if (now - rec.at > VIEW_MAX_AGE_MS) {
    session.delete(key);
    return null;
  }
  if (!finite(rec.from) || !finite(rec.to) || rec.to <= rec.from) return null;
  return { from: rec.from, to: rec.to };
}

/** 🟩 **ذخیرهٔ بازهٔ عمودی (Y)** — فقط وقتی محور قیمت دستی است ✓ */
export function savePriceRange(
  key: string,
  range: { min: number; max: number },
  now = Date.now(),
): boolean {
  if (!key) return false;
  if (!finite(range.min) || !finite(range.max)) return false;
  if (!(range.max > range.min) || !(range.min > 0)) return false;
  merge(key, { y: { min: range.min, max: range.max } }, now);
  return true;
}

/**
 * 🟩 بازگردانی بازهٔ عمودی — `fresh` مثل نما ✓ · **نگهبان هم‌پوشانی** با دامنهٔ داده
 * (بازهٔ بی‌ربط ⇒ رد ✓ ⇒ محور خودکار می‌ماند ✓ ⇒ هیچ چارتِ خالی/بریده ✗).
 */
export function restorePriceRange(
  key: string,
  opts: { fresh?: boolean; now?: number; dataMin?: number; dataMax?: number } = {},
): { min: number; max: number } | null {
  if (!key) return null;
  const now = opts.now ?? Date.now();
  let rec = session.get(key) ?? null;
  if (!rec && opts.fresh) rec = read(key, now);
  if (!rec) return null;
  if (now - rec.at > VIEW_MAX_AGE_MS) return null;
  const y = rec.y;
  if (!y || !finite(y.min) || !finite(y.max) || !(y.max > y.min) || !(y.min > 0)) return null;
  /** نگهبان: بازه باید با دامنهٔ داده هم‌پوشانی داشته باشد ✓ */
  if (finite(opts.dataMin) && finite(opts.dataMax)) {
    if (y.max < opts.dataMin! || y.min > opts.dataMax!) return null;
  }
  return { min: y.min, max: y.max };
}

/** آفست ذخیره‌شدهٔ همان کلید (px ✓) — نبود ⇒ `null` (⇒ `INITIAL_OFFSET_PX` ✓) */
export function restoreOffsetPx(key: string, now = Date.now()): number | null {
  if (!key) return null;
  const rec = session.get(key) ?? read(key, now);
  if (!rec) return null;
  if (now - rec.at > VIEW_MAX_AGE_MS) return null;
  return finite(rec.px) && rec.px >= 0 ? rec.px : null;
}

/**
 * 🟩 **مرحلهٔ ۱۷** — فقط **بازهٔ عمودی (Y)** را پاک می‌کند ✓ (نما/آفست دست‌نخورده ✗).
 * کاربرد: دابل‌کلیک کاربر روی محور قیمت ⇒ «آزادسازی دائمی» ✓ (نه فقط موقتِ LWC ✗).
 */
export function clearPriceRange(key: string, now = Date.now()): boolean {
  if (!key) return false;
  const cur = session.get(key) ?? read(key, now) ?? null;
  if (!cur) return false;
  const next: ViewRecord = { ...cur, y: null, at: now };
  session.set(key, next);
  write(key, next);
  return true;
}

/** حذف حافظهٔ یک کلید (مثلاً کلید عوض شد ⇒ نما و آفستِ کهنه پاک ✓) */
export function dropView(key: string): boolean {
  const had = session.delete(key);
  const ls = storage();
  if (ls) {
    try {
      ls.removeItem(STORAGE_PREFIX + key);
    } catch {
      /* noop */
    }
  }
  return had;
}

/** پاک‌سازی کامل (بازرسی/دیباگ ✓) */
export function purgeAll(): number {
  const n = session.size;
  session.clear();
  const ls = storage();
  if (ls) {
    try {
      for (const k of Object.keys(ls)) {
        if (k.startsWith(STORAGE_PREFIX)) ls.removeItem(k);
      }
    } catch {
      /* noop */
    }
  }
  return n;
}

/** سن حافظه (ms) — برای بازرسی در DOM ✓ */
export function viewAgeMs(key: string, now = Date.now()): number | null {
  if (!key) return null;
  const memo = session.get(key);
  if (memo) return finite(memo.at) ? now - memo.at : null;
  const raw = storage()?.getItem(STORAGE_PREFIX + key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredRecord;
    return finite(parsed.at) ? now - parsed.at : null;
  } catch {
    return null;
  }
}

/** **خودآزمون** (الگوی پروژه · در SSR منتشر می‌شود) — `@returns` خطاها */
export function viewPersistenceSelfTest(): string[] {
  const errs: string[] = [];
  const now = 1_000_000;

  if (viewKeyOf("BTCUSDT", "5m", "candle") !== "BTCUSDT|5m|candle") {
    errs.push("کلید یکتا نادرست ✗");
  }
  if (persistKeyOf("BTCUSDT|5m", "candle") !== "BTCUSDT|5m|candle") {
    errs.push("persistKey نادرست ✗");
  }
  if (persistKeyOf("", "candle") !== "") errs.push("viewKey خالی باید خاموش باشد ✗");
  if (INITIAL_OFFSET_PX !== 100) errs.push("آفست اولیه باید ۱۰۰ باشد ✗");
  if (VIEW_MAX_AGE_MS !== 12 * 60 * 60 * 1000) errs.push("MAX_AGE باید ۱۲ ساعت باشد ✗");

  const k = viewKeyOf("TEST", "5m", "candle");
  dropView(k);
  if (restoreView(k, { fresh: true, now }) !== null) errs.push("کلید تازه باید null بدهد ✗");
  if (!saveView(k, { from: now, to: now + 600 }, now)) errs.push("ذخیرهٔ نما موفق نشد ✗");
  const back = restoreView(k, { fresh: true, now });
  if (!back || back.from !== now || back.to !== now + 600) errs.push("بازگردانی نما نادرست ✗");
  if (saveView(k, { from: 5, to: 5 }, now)) errs.push("بازهٔ خالی نباید ذخیره شود ✗");
  if (saveView(k, { from: Number.NaN, to: 9 }, now)) errs.push("NaN نباید ذخیره شود ✗");
  if (saveOffsetPx(k, 210, now) !== true) errs.push("ذخیرهٔ آفست ناموفق ✗");
  if (restoreOffsetPx(k, now) !== 210) errs.push("بازگردانی آفست نادرست ✗");
  /** انقضا: ۱۲ ساعت + ۱ms ⇒ باطل ✓ */
  if (restoreView(k, { fresh: true, now: now + VIEW_MAX_AGE_MS + 1 }) !== null) {
    errs.push("حافظهٔ کهنه باید باطل شود ✗");
  }
  /** 🟩 بازهٔ عمودی (Y): ذخیره/بازگردانی/نگهبان/انقضا ✓ */
  if (!savePriceRange(k, { min: 100, max: 200 }, now)) errs.push("ذخیرهٔ Y ناموفق ✗");
  const yb = restorePriceRange(k, { fresh: true, now });
  if (!yb || yb.min !== 100 || yb.max !== 200) errs.push("بازگردانی Y نادرست ✗");
  if (savePriceRange(k, { min: 200, max: 100 }, now)) errs.push("Y برعکس نباید ذخیره شود ✗");
  if (savePriceRange(k, { min: -5, max: 10 }, now)) errs.push("Y نامعتبر نباید ذخیره شود ✗");
  if (restorePriceRange(k, { fresh: true, now, dataMin: 1, dataMax: 2 }) !== null) {
    errs.push("Y بی‌هم‌پوشانی باید رد شود ✗");
  }
  if (restorePriceRange(k, { fresh: true, now: now + VIEW_MAX_AGE_MS + 1, dataMin: 100, dataMax: 200 }) !== null) {
    errs.push("Y کهنه باید باطل شود ✗");
  }
  dropView(k);
  if (restoreOffsetPx(k, now) !== null) errs.push("پس از حذف، آفست باید null باشد ✗");
  if (viewAgeMs(viewKeyOf("NOPE", "1m", "candle"), now) !== null) {
    errs.push("سن برای کلید ناموجود باید null باشد ✗");
  }
  return errs;
}

