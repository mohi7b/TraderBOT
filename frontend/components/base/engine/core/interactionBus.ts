/**
 * ChartEngine V2 · **P1 گام ۱.۵** — `InteractionBus` + `ViewMemory`
 * frontend/components/base/engine/core/interactionBus.ts
 *  · `ViewMemory`: بازهٔ دیدنی کاربر با کلید (`symbol|tf`) ذخیره/بازگردانی ⇒
 *    رفرش زندهٔ داده **زوم را نمی‌پراند** ✓ (همان منطق `savedView` امروز، تست‌پذیر ✓)
 *  · `createInteractionBus()`: ثبت‌نام نام‌دار رویدادها ⇒ ماژول‌ها هرگز مستقیم به
 *    چارت وصل نمی‌شوند ✗ (قرارداد V2)
 * ⚠️ صفر وابستگی به DOM/LWC ✗ ⇒ selfTest در Node ✓.
 */

export interface ViewRange {
  from: number;
  to: number;
}

interface ViewEntry extends ViewRange {
  at: number;
}

export class ViewMemory {
  private readonly views = new Map<string, ViewEntry>();
  private saved = 0;
  private restored = 0;
  private missed = 0;

  save(key: string, range: ViewRange): boolean {
    if (!key) return false;
    if (!Number.isFinite(range.from) || !Number.isFinite(range.to)) return false;
    if (range.to <= range.from) return false;
    this.views.set(key, { from: range.from, to: range.to, at: Date.now() });
    this.saved += 1;
    return true;
  }

  restore(key: string): ViewRange | null {
    const hit = this.views.get(key);
    if (!hit) {
      this.missed += 1;
      return null;
    }
    this.restored += 1;
    return { from: hit.from, to: hit.to };
  }

  clear(key: string): boolean {
    return this.views.delete(key);
  }

  size(): number {
    return this.views.size;
  }

  stats(): { saved: number; restored: number; missed: number; size: number } {
    return { saved: this.saved, restored: this.restored, missed: this.missed, size: this.views.size };
  }
}

export interface SelectionPoint {
  time: number | null;
  price?: number | null;
}

export type InteractionHandler = (payload: { reason: string; selection: SelectionPoint | null }) => void;

export interface InteractionBusStats {
  subscribed: number;
  unsubscribed: number;
  notifications: number;
  selections: number;
  lastReason: string | null;
}

export interface InteractionBus {
  subscribe(id: string, handler: InteractionHandler): void;
  unsubscribe(id: string): boolean;
  select(point: SelectionPoint | null): void;
  selection(): SelectionPoint | null;
  notify(reason: string): void;
  stats(): InteractionBusStats;
  ids(): string[];
}

export function createInteractionBus(): InteractionBus {
  const handlers = new Map<string, InteractionHandler>();
  const stats: InteractionBusStats = {
    subscribed: 0,
    unsubscribed: 0,
    notifications: 0,
    selections: 0,
    lastReason: null,
  };
  let current: SelectionPoint | null = null;

  const emit = (reason: string) => {
    stats.notifications += 1;
    stats.lastReason = reason;
    for (const [, fn] of handlers) {
      try {
        fn({ reason, selection: current });
      } catch {
        /** خطای یک شنونده بقیه را متوقف نمی‌کند ✓ */
      }
    }
  };

  return {
    subscribe(id, handler) {
      if (!handlers.has(id)) stats.subscribed += 1;
      handlers.set(id, handler);
    },
    unsubscribe(id) {
      const ok = handlers.delete(id);
      if (ok) stats.unsubscribed += 1;
      return ok;
    },
    select(point) {
      current = point;
      stats.selections += 1;
      emit("select");
    },
    selection() {
      return current;
    },
    notify(reason) {
      emit(reason);
    },
    stats() {
      return { ...stats };
    },
    ids() {
      return [...handlers.keys()];
    },
  };
}

/** **خودآزمون** (الگوی پروژه · در SSR منتشر می‌شود) — `@returns` خطاها */
export function interactionBusSelfTest(): string[] {
  const errs: string[] = [];

  const vm = new ViewMemory();
  if (!vm.save("BTCUSDT|1h", { from: 10, to: 90 })) errs.push("ذخیرهٔ نمای معتبر ✗");
  const back = vm.restore("BTCUSDT|1h");
  if (!back || back.from !== 10 || back.to !== 90) errs.push("بازگردانی نما نادرست ✗");
  if (vm.restore("other|1m") !== null) errs.push("کلید ناشناس باید null بدهد ✗");
  if (vm.save("k", { from: 5, to: 5 })) errs.push("بازهٔ خالی نباید ذخیره شود ✗");
  if (vm.save("k", { from: Number.NaN, to: 9 })) errs.push("بازهٔ NaN نباید ذخیره شود ✗");
  if (vm.save("", { from: 1, to: 2 })) errs.push("کلید خالی نباید ذخیره شود ✗");
  const vms = vm.stats();
  if (vms.saved !== 1 || vms.restored !== 1 || vms.missed !== 1) errs.push(`ViewMemory stats=${JSON.stringify(vms)} ✗`);
  if (!vm.clear("BTCUSDT|1h") || vm.size() !== 0) errs.push("clear نما کار نکرد ✗");

  const bus = createInteractionBus();
  const seen: string[] = [];
  bus.subscribe("a", (p) => seen.push(`a:${p.reason}`));
  bus.subscribe("b", () => {
    throw new Error("boom");
  });
  bus.subscribe("c", () => seen.push("c"));
  bus.notify("zoom");
  if (seen.join(",") !== "a:zoom,c") errs.push(`انتشار نادرست: ${seen.join(",")} ✗`);
  bus.select({ time: 123, price: 4 });
  if (seen.filter((s) => s === "c").length !== 2) errs.push("select باید منتشر کند ✗");
  if (bus.selection()?.time !== 123) errs.push("selection ذخیره نشد ✗");
  if (bus.stats().selections !== 1 || bus.stats().notifications !== 2) errs.push("شمارنده‌های گذرگاه ✗");
  if (!bus.unsubscribe("b") || bus.ids().join(",") !== "a,c") errs.push("unsubscribe نادرست ✗");
  bus.select(null);
  if (bus.selection() !== null) errs.push("پاک‌کردن انتخاب کار نکرد ✗");
  return errs;
}
