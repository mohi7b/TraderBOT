/**
 * ChartEngine V2 · **P1 گام ۱.۱** — `SeriesRegistry` (استخراج بی‌تغییر رفتار)
 * frontend/components/base/engine/core/seriesRegistry.ts
 * ============================================================
 * چه چیزی این‌جا می‌آید:
 *  · **نگهبان ترتیب زمانی** که امروز داخل `BaseChart` بود ⇒ تابع خالص (رفتار بی‌تغییر ✗)
 *  · **ثبت‌خانهٔ سری‌ها** با سه عملیات قراردادی V2:
 *      `ensure(plan, adapter)` · `update(id, points)` · `drop(id)`
 *    + منطق «افزایشی»: اگر دادهٔ تازه فقط **دنباله** اضافه کرده ⇒ `adapter.update()`
 *    برای نقاط تازه (سبک ✓) وگرنه `setData()` (بازنویسی).
 *  · **شمارنده‌ها** (`created/updated/dropped/partial/full`) برای معیار سخت P2.
 * ⚠️ هیچ وابستگی به LWC/DOM ✗ ⇒ تست واحد در Node ✓ (selfTest پایین).
 */

export interface SeriesPoint {
  t?: number | string;
  [key: string]: unknown;
}

export interface SeriesPlan {
  id: string;
  role?: "main" | "overlay" | "pane";
  paneId?: string;
  scaleId?: string;
  colorKey?: string;
  type?: string;
}

/** آداپتور حداقلی سری (در تست: شیء جعلی ✓ · در عمل: سری LWC). */
export interface SeriesAdapter {
  setData(points: unknown[]): void;
  update?(point: unknown): void;
}

export interface RegistryStats {
  created: number;
  updated: number;
  dropped: number;
  partial: number;
  full: number;
  ignored: number;
}

/**
 * **نگهبان ترتیب زمانی (منتقل‌شده از BaseChart — بی‌تغییر):**
 * LWC زمان تکراری/نزولی را با استثنا رد می‌کند و کل صفحه می‌افتد
 * (شاهد واقعی: باکت‌های هم‌زمان‌شدهٔ DST). نقاط غیرصعودی حذف می‌شوند.
 */
export function orderPoints<T extends { time: unknown }>(pts: T[]): { ordered: T[]; dropped: number } {
  let prev = Number.NEGATIVE_INFINITY;
  const ordered = pts.filter((p) => {
    const t = Number(p.time);
    if (!Number.isFinite(t) || t <= prev) return false;
    prev = t;
    return true;
  });
  return { ordered, dropped: pts.length - ordered.length };
}

/** زمان آخرین نقطه (برای تشخیص «فقط دنباله» در به‌روزرسانی افزایشی). */
function lastTimeOf(pts: SeriesPoint[]): number | null {
  for (let i = pts.length - 1; i >= 0; i -= 1) {
    const p = pts[i] as { time?: unknown; t?: unknown };
    const t = Number(p.time ?? p.t);
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/**
 * ثبت‌خانهٔ سری‌های چارت (تنها مالک سری‌ها ✓).
 * ماژول‌ها سری نمی‌سازند ✗ — فقط `plan` می‌دهند ✓ (قرارداد معماری V2).
 */
export class SeriesRegistry {
  private readonly entries = new Map<
    string,
    { plan: SeriesPlan; adapter: SeriesAdapter; lastTime: number | null }
  >();
  private readonly counters: RegistryStats = {
    created: 0,
    updated: 0,
    dropped: 0,
    partial: 0,
    full: 0,
    ignored: 0,
  };

  /** ساخت سری اگر نبود (و پلن را تازه می‌کند) ✓ */
  ensure(plan: SeriesPlan, adapter: SeriesAdapter): void {
    const existing = this.entries.get(plan.id);
    if (existing) {
      existing.plan = plan;
      existing.adapter = adapter;
      return;
    }
    this.entries.set(plan.id, { plan, adapter, lastTime: null });
    this.counters.created += 1;
  }

  has(id: string): boolean {
    return this.entries.has(id);
  }

  /**
   * **به‌روزرسانی دادهٔ یک سری** — هستهٔ معیار سخت P2:
   *  · فقط **دنباله** اضافه شده ⇒ `adapter.update()` نقطه‌به‌نقطه ✓ (`partial`)
   *  · بازنگری/پرش/شکل تازه ⇒ `setData()` ✓ (`full`)
   *  · سری ناشناس ⇒ `ignored` ✓ (بی‌صدا نمی‌شکند ✓)
   */
  update(id: string, points: SeriesPoint[]): "partial" | "full" | "ignored" {
    const entry = this.entries.get(id);
    if (!entry) {
      this.counters.ignored += 1;
      return "ignored";
    }
    const newLast = lastTimeOf(points);
    const canAppend =
      entry.lastTime !== null &&
      newLast !== null &&
      newLast > entry.lastTime &&
      typeof entry.adapter.update === "function";
    if (canAppend) {
      let n = 0;
      for (const p of points) {
        const q = p as { time?: unknown; t?: unknown };
        const t = Number(q.time ?? q.t);
        if (Number.isFinite(t) && t > (entry.lastTime as number)) {
          entry.adapter.update?.(p);
          n += 1;
        }
      }
      entry.lastTime = newLast;
      this.counters.updated += 1;
      if (n > 0) this.counters.partial += 1;
      return "partial";
    }
    entry.adapter.setData(points);
    entry.lastTime = newLast;
    this.counters.updated += 1;
    this.counters.full += 1;
    return "full";
  }

  /** حذف تمیز سری (ماژول خاموش شد) ✓ */
  drop(id: string): boolean {
    const ok = this.entries.delete(id);
    if (ok) this.counters.dropped += 1;
    return ok;
  }

  list(): SeriesPlan[] {
    return [...this.entries.values()].map((e) => e.plan);
  }

  stats(): RegistryStats {
    return { ...this.counters };
  }

  resetCounters(): void {
    this.counters.created = 0;
    this.counters.updated = 0;
    this.counters.dropped = 0;
    this.counters.partial = 0;
    this.counters.full = 0;
    this.counters.ignored = 0;
  }
}

/**
 * **خودآزمون** (الگوی پروژه) — در SSR منتشر می‌شود تا سوئیت‌ها بسنجند ✓
 * @returns فهرست خطاها (خالی = سالم)
 */
export function seriesRegistrySelfTest(): string[] {
  const errs: string[] = [];

  const { ordered, dropped } = orderPoints([{ time: 1 }, { time: 2 }, { time: 2 }, { time: 1 }, { time: 3 }]);
  if (ordered.length !== 3 || dropped !== 2) errs.push(`orderPoints=${ordered.length}/${dropped} (انتظار 3/2)`);
  if (orderPoints([{ time: Number.NaN }, { time: 5 }]).ordered.length !== 1) {
    errs.push("orderPoints: مقدار نامعتبر حذف نشد");
  }

  const seen = { sets: 0, updates: 0 };
  const fakeAdapter = {
    setData: () => {
      seen.sets += 1;
    },
    update: () => {
      seen.updates += 1;
    },
  };

  const reg = new SeriesRegistry();
  reg.ensure({ id: "s1", role: "overlay" }, fakeAdapter);
  reg.update("s1", [{ time: 10, value: 1 }]); // اول ⇒ full
  reg.update("s1", [{ time: 10, value: 1 }, { time: 20, value: 2 }]); // دنباله ⇒ partial
  reg.update("s1", [{ time: 10, value: 9 }]); // بازنگری (زمان عقب) ⇒ full
  if (seen.updates !== 1) errs.push(`adapter.update=${seen.updates} (انتظار 1)`);
  if (seen.sets !== 2) errs.push(`adapter.setData=${seen.sets} (انتظار 2)`);
  if (reg.update("nope", [{ time: 1 }]) !== "ignored") errs.push("سری ناشناس باید ignored شود");
  /**
   * ⚠️ **باگ واقعی که چک زنده گرفت (fail:4):** قبلاً `stats()` **پیش از** فراخوانِ
   * `ignored` گرفته می‌شد و همین assertion روی **snapshot کهنه** سنجیده می‌شد ✗
   * ⇒ حالا **بعد از جهش** خوانده می‌شود ✓ (شمارندهٔ `ignored` باید ۱ باشد ✓).
   */
  const s = reg.stats();
  if (s.created !== 1) errs.push(`created=${s.created} (انتظار 1)`);
  if (s.full !== 2) errs.push(`full=${s.full} (انتظار 2)`);
  if (s.partial !== 1) errs.push(`partial=${s.partial} (انتظار 1)`);
  if (s.ignored < 1) errs.push(`شمارندهٔ ignored کار نمی‌کند (ignored=${s.ignored})`);
  if (!reg.drop("s1") || reg.has("s1")) errs.push("drop سری را حذف نکرد");
  if (reg.stats().dropped !== 1) errs.push("شمارندهٔ dropped کار نمی‌کند");
  if (reg.list().length !== 0) errs.push("list بعد از drop خالی نیست");
  return errs;
}
