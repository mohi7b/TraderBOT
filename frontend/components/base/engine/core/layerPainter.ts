/**
 * ChartEngine V2 · **P1 گام ۱.۲** — `LayerPainter` (هستهٔ رسم) · بخش ۱/۲
 * frontend/components/base/engine/core/layerPainter.ts
 * ============================================================
 * این ماژول **هستهٔ معیار سخت P2** را می‌سازد:
 *   «painter فقط بخش‌های تغییر یافته را دوباره رسم کند» ✓
 *
 * دو قطعه:
 *  ۱) `createRedrawScheduler({ raf, onPaint })` — **زمان‌بند ادغام‌کننده**:
 *     چند `schedule()` در یک فریم ⇒ **یک** رسم ✓ (`coalesced`).
 *     معادل رفتاریِ `scheduleRedraw` امروزِ `BaseChart` (rafRef + requestAnimationFrame).
 *  ۲) `LayerPainter` — ثبت لایه‌ها و **رسم انتخابی**: فقط لایه‌های `invalidate`
 *     شده رسم می‌شوند ✓ (`skipped` = سود واقعی).
 *
 * ⚠️ صفر وابستگی به DOM/LWC ✗ (raf تزریق می‌شود ✓) ⇒ selfTest در Node ✓.
 * ⚠️ در گام ۱.۲ **به BaseChart سیم نمی‌شود** ✗ (فریز P0 محفوظ ✓) — سیم‌کشی در ۱.۲ب.
 */

export interface RedrawSchedulerStats {
  scheduled: number;
  coalesced: number;
  painted: number;
}

/** نوع سازگار با `requestAnimationFrame` (تزریق‌شدنی ✓). */
export type RafLike = (cb: (t?: number) => void) => unknown;

export interface RedrawScheduler {
  /** درخواست رسم؛ چند درخواست در یک فریم ⇒ یک رسم ✓ */
  schedule(reason?: string): void;
  /** اجرای فوری درخواست معلق (تست/موقعیت حساس) ✓ */
  flush(): void;
  /** پایان کار: هیچ رسم بعدی ✗ */
  dispose(): void;
  stats(): RedrawSchedulerStats;
  /** دلایل آخرین رسم (برای دیباگ/Advanced) */
  lastReasons(): string[];
  /** آیا درخواستی معلق است؟ */
  isPending(): boolean;
}

/**
 * زمان‌بند رسم با **ادغام در یک فریم**.
 * @param raf در مرورگر `window.requestAnimationFrame` · در تست: صف دستی ✓
 * @param onPaint بدنهٔ رسم (در BaseChart: همان `redraw` موجود ✓)
 */
export function createRedrawScheduler({
  raf,
  onPaint,
}: {
  raf: RafLike;
  onPaint: (reasons: string[]) => void;
}): RedrawScheduler {
  const stats: RedrawSchedulerStats = { scheduled: 0, coalesced: 0, painted: 0 };
  let pending = false;
  let disposed = false;
  let reasons: string[] = [];
  let lastReasons: string[] = [];

  const run = () => {
    pending = false;
    if (disposed) return;
    const batch = reasons;
    reasons = [];
    lastReasons = batch;
    stats.painted += 1;
    onPaint(batch);
  };

  return {
    schedule(reason = "data") {
      if (disposed) return; // پس از dispose هیچ رسمی ✗
      stats.scheduled += 1;
      reasons.push(reason);
      if (pending) {
        /** درخواست دوم در همان فریم ⇒ ادغام ✓ (رسم اضافه ✗) */
        stats.coalesced += 1;
        return;
      }
      pending = true;
      raf(run);
    },
    flush() {
      if (disposed || !pending) return;
      run();
    },
    dispose() {
      disposed = true;
      pending = false;
      reasons = [];
    },
    stats() {
      return { ...stats };
    },
    lastReasons() {
      return [...lastReasons];
    },
    isPending() {
      return pending && !disposed;
    },
  };
}

export interface LayerPaintArgs {
  ctx: unknown;
  view?: unknown;
}

export type LayerPaintFn = (args: LayerPaintArgs) => void;

export interface LayerPainterStats {
  painted: number;
  skipped: number;
  invalidations: number;
  registered: number;
  dropped: number;
}

/**
 * نقاش لایه‌ها — **تنها مالک بوم** ✓
 * (قرارداد V2: ماژول‌ها `RenderPlan` می‌دهند ✗ نقاشی نمی‌کنند ✓)
 * `invalidate(id)` ⇒ فقط همان لایه در `paint()` بعدی رسم می‌شود ✓
 */
export class LayerPainter {
  private readonly layers = new Map<string, LayerPaintFn>();
  private readonly dirty = new Set<string>();
  private readonly counters: LayerPainterStats = {
    painted: 0,
    skipped: 0,
    invalidations: 0,
    registered: 0,
    dropped: 0,
  };

  register(id: string, paint: LayerPaintFn): void {
    if (!this.layers.has(id)) this.counters.registered += 1;
    this.layers.set(id, paint);
    this.dirty.add(id);
  }

  drop(id: string): boolean {
    const ok = this.layers.delete(id);
    if (ok) {
      this.counters.dropped += 1;
      this.dirty.delete(id);
    }
    return ok;
  }

  invalidate(id: string): boolean {
    if (!this.layers.has(id)) return false; // لایهٔ ناموجود ⇒ شمرده نمی‌شود ✓
    this.dirty.add(id);
    this.counters.invalidations += 1;
    return true;
  }

  invalidateAll(): void {
    for (const id of this.layers.keys()) {
      this.dirty.add(id);
      this.counters.invalidations += 1;
    }
  }

  ids(): string[] {
    return [...this.layers.keys()];
  }

  /** رسم **فقط لایه‌های کثیف** ✓ (بقیه `skipped`) */
  paint(args: LayerPaintArgs): { painted: string[]; skipped: number } {
    const painted: string[] = [];
    let skipped = 0;
    for (const [id, fn] of this.layers) {
      if (!this.dirty.has(id)) {
        skipped += 1;
        continue;
      }
      fn(args);
      painted.push(id);
      this.dirty.delete(id);
    }
    this.counters.painted += painted.length;
    this.counters.skipped += skipped;
    return { painted, skipped };
  }

  stats(): LayerPainterStats {
    return { ...this.counters };
  }

  dirtyIds(): string[] {
    return [...this.dirty];
  }
}

/**
 * **خودآزمون** (الگوی پروژه · در SSR منتشر می‌شود) — `@returns` فهرست خطاها
 */
export function layerPainterSelfTest(): string[] {
  const errs: string[] = [];

  /** ۱) ادغام زمان‌بند: سه schedule در یک فریم ⇒ یک رسم ✓ */
  const queue: Array<(t?: number) => void> = [];
  const fakeRaf: RafLike = (cb) => {
    queue.push(cb);
    return queue.length;
  };
  const batches: string[][] = [];
  const sch = createRedrawScheduler({ raf: fakeRaf, onPaint: (r) => batches.push(r) });
  sch.schedule("data");
  sch.schedule("zoom");
  sch.schedule("theme");
  if (queue.length !== 1) errs.push(`raf باید یک‌بار صدا زده شود (${queue.length})`);
  if (!sch.isPending()) errs.push("پس از schedule باید pending باشد");
  queue.forEach((cb) => cb());
  if (batches.length !== 1) errs.push(`ادغام ناموفق: رسم=${batches.length} (انتظار 1)`);
  if (batches[0]?.length !== 3) errs.push(`دلایل ادغام‌شده=${batches[0]?.length} (انتظار 3)`);
  if (sch.stats().coalesced !== 2) errs.push(`coalesced=${sch.stats().coalesced} (انتظار 2)`);
  if (sch.stats().painted !== 1) errs.push(`painted=${sch.stats().painted} (انتظار 1)`);
  sch.dispose();
  sch.schedule("after-dispose");
  if (queue.length !== 1) errs.push("پس از dispose نباید رسم زمان‌بندی شود ✗");
  sch.flush();
  if (batches.length !== 1) errs.push("flush پس از dispose نباید رسم کند ✗");

  /** ۲) رسم انتخابی: فقط لایهٔ کثیف ✓ */
  const painter = new LayerPainter();
  const calls: string[] = [];
  painter.register("a", () => calls.push("a"));
  painter.register("b", () => calls.push("b"));
  painter.paint({ ctx: null });
  if (calls.length !== 2) errs.push(`رسم نخست باید هر دو لایه را رسم کند (${calls.length})`);
  calls.length = 0;
  painter.invalidate("b");
  const res = painter.paint({ ctx: null });
  if (calls.join(",") !== "b") errs.push(`فقط لایهٔ کثیف باید رسم شود (${calls.join(",")})`);
  if (res.skipped !== 1) errs.push(`skipped=${res.skipped} (انتظار 1)`);
  const s = painter.stats();
  if (s.painted !== 3) errs.push(`painted=${s.painted} (انتظار 3)`);
  if (s.skipped !== 1) errs.push(`stats.skipped=${s.skipped} (انتظار 1)`);
  if (s.registered !== 2) errs.push(`registered=${s.registered} (انتظار 2)`);
  /** پس از رسم، **هیچ** لایه‌ای کثیف نمی‌ماند ✓ (انتظار قبلیِ «۱» اشتباه بود ✗) */
  if (painter.dirtyIds().length !== 0) errs.push(`dirtyIds پس از رسم باید خالی باشد (${painter.dirtyIds().length}) ✗`);
  if (!painter.drop("a")) errs.push("drop باید true بدهد");
  if (painter.ids().join(",") !== "b") errs.push("drop لایه را حذف نکرد");
  if (painter.stats().dropped !== 1) errs.push("شمارندهٔ dropped کار نمی‌کند");
  if (painter.invalidate("a") !== false) errs.push("invalidate لایهٔ حذف‌شده باید false بدهد");
  /** فقط `invalidate()` می‌شمارد ✓ (`register` نمی‌شمارد ✗) ⇒ مجموع = ۱ ✓ */
  if (painter.stats().invalidations !== 1) errs.push(`invalidations=${painter.stats().invalidations} (انتظار 1)`);
  return errs;
}
