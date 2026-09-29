/**
 * ChartEngine V2 · **P1 گام ۱.۴** — facade هستهٔ `ChartEngine`
 * frontend/components/base/engine/core/chartEngine.ts
 *  · **ریشهٔ ترکیب (composition root):** زیرسیستم‌ها را کنار هم می‌گذارد و یک API
 *    کوچک و پایدار می‌دهد: `{ series, layers, interaction, view, applyPlan, stats }`
 *  · قرارداد حیاتی `applyPlan()`: فقط **ensure/update/drop** ✓ ⇒ **هیچ بازساخت
 *    کامل چارت ✗** (معیار سخت P2) و لایه‌ها فقط در صورت `changed` رسم می‌شوند ✓
 * ⚠️ در این گام `BaseChart` هنوز این facade را مصرف نمی‌کند ✗ (فریز P0 محفوظ ✓) —
 *    «نازک‌کردن BaseChart» با همین API انجام می‌شود (ادامهٔ ۱.۴).
 * ⚠️ صفر وابستگی به DOM/LWC ✗ ⇒ selfTest در Node ✓ و انتشار در SSR ✓.
 */
import { SeriesRegistry, seriesRegistrySelfTest, type SeriesAdapter, type SeriesPoint } from "./seriesRegistry";
import { LayerPainter, layerPainterSelfTest } from "./layerPainter";
import { specGateSelfTest, validateModuleFragment, type SpecFragment } from "./specGate";
import { ViewMemory, createInteractionBus, interactionBusSelfTest, type InteractionBus } from "./interactionBus";
/** P3-a: پروفایل‌ها + وضعیت (قرارداد «پروفایل = پریست، نه چارت جدید» ✗) */
import { profilesSelfTest } from "./profiles";
/** P5/4-UI: کتابخانهٔ آیتم‌ها (چند-نمونه · رنگ/پارامتر از AL ✓) */
import { librarySelfTest } from "./library";
/** P4: بستهٔ ماژول‌های موجود (Indicators · PriceAction · Signals) */
import { modulesSelfTest } from "../modules/registry";

export interface SeriesPlanInput {
  id: string;
  role?: "main" | "overlay" | "pane";
  paneId?: string;
  scaleId?: string;
  colorKey?: string;
  /** آداپتور سری (LWC) — در تست: شیء جعلی ✓ */
  adapter: SeriesAdapter;
  points?: SeriesPoint[];
  /** قطعهٔ قرارداد (اختیاری) ⇒ از دروازهٔ `SpecGate` می‌گذرد ✓ */
  spec?: SpecFragment;
}

export interface LayerPlanInput {
  id: string;
  /** این لایه در این پلن تغییر کرده؟ (فقط تغییریافته‌ها رسم می‌شوند ✓) */
  changed?: boolean;
}

export interface ApplyPlanInput {
  series?: SeriesPlanInput[];
  layers?: LayerPlanInput[];
}

export interface ApplyPlanResult {
  created: number;
  updated: number;
  dropped: number;
  full: number;
  partial: number;
  specErrors: string[];
  paintedLayers: string[];
  skippedLayers: number;
}

export interface ChartEngine {
  readonly series: SeriesRegistry;
  readonly layers: LayerPainter;
  readonly interaction: InteractionBus;
  readonly view: ViewMemory;
  applyPlan(plan: ApplyPlanInput): ApplyPlanResult;
  stats(): unknown;
}

export function createChartEngine(): ChartEngine {
  const series = new SeriesRegistry();
  const layers = new LayerPainter();
  const interaction = createInteractionBus();
  const view = new ViewMemory();

  return {
    series,
    layers,
    interaction,
    view,

    applyPlan(plan) {
      const result: ApplyPlanResult = {
        created: 0,
        updated: 0,
        dropped: 0,
        full: 0,
        partial: 0,
        specErrors: [],
        paintedLayers: [],
        skippedLayers: 0,
      };

      /** ۱) سری‌ها: دروازهٔ قرارداد ⇒ ساخت اگر نبود ⇒ به‌روزرسانی افزایشی ✓ */
      const wanted = new Set<string>();
      for (const s of plan.series ?? []) {
        wanted.add(s.id);
        if (s.spec) {
          const gate = validateModuleFragment(s.spec);
          if (!gate.ok) {
            result.specErrors.push(...gate.errors.map((e) => `${s.id}: ${e}`));
            continue; // قطعهٔ نامعتبر ⇒ هیچ رندری ✗
          }
        }
        const existed = series.has(s.id);
        series.ensure({ id: s.id, role: s.role, paneId: s.paneId, scaleId: s.scaleId, colorKey: s.colorKey }, s.adapter);
        if (!existed) result.created += 1;
        if (s.points && s.points.length) {
          try {
            const mode = series.update(s.id, s.points);
            if (mode === "partial") result.partial += 1;
            else if (mode === "full") result.full += 1;
            result.updated += 1;
          } catch {
            /**
             * **محافظ §۸.۷ در سطح هسته:** آداپتور مرده/استثنای LWC ⇒ به
             * `setData` برمی‌گردیم ✓ ⇒ چارت هرگز نمی‌افتد ✗ و پلن هم نمی‌شکند ✓.
             */
            try {
              s.adapter.setData(s.points);
            } catch {
              /* noop */
            }
            result.full += 1;
            result.updated += 1;
          }
        }
      }
      /** ۲) حذف سری‌هایی که در پلن تازه نیستند ✓ (خاموش‌شدن ماژول) */
      for (const existing of series.list()) {
        if (!wanted.has(existing.id)) {
          series.drop(existing.id);
          result.dropped += 1;
        }
      }
      /** ۳) لایه‌ها: فقط **تغییر‌یافته** invalidate و رسم می‌شوند ✓ */
      for (const l of plan.layers ?? []) {
        if (!layers.ids().includes(l.id)) layers.register(l.id, () => {});
        if (l.changed) layers.invalidate(l.id);
      }
      const paint = layers.paint({ ctx: null });
      result.paintedLayers = paint.painted;
      result.skippedLayers = paint.skipped;
      return result;
    },

    stats() {
      return {
        series: series.stats(),
        layers: layers.stats(),
        interaction: interaction.stats(),
        view: view.stats(),
      };
    },
  };
}

/** **خودآزمون** (الگوی پروژه · در SSR منتشر می‌شود) — `@returns` خطاها */
export function chartEngineSelfTest(): string[] {
  const errs: string[] = [
    ...seriesRegistrySelfTest(),
    ...layerPainterSelfTest(),
    ...specGateSelfTest(),
    ...interactionBusSelfTest(),
    ...profilesSelfTest(),
    ...librarySelfTest(),
    ...modulesSelfTest(),
  ].map((e) => `sub:${e}`);

  const engine = createChartEngine();
  const adapter = { setData: () => {}, update: () => {} };

  const r1 = engine.applyPlan({
    series: [
      { id: "candles", role: "main", adapter },
      { id: "ema", role: "overlay", adapter, points: [{ t: 1, value: 10 }] },
    ],
    layers: [{ id: "markers", changed: true }],
  });
  if (r1.created !== 2) errs.push(`applyPlan.created=${r1.created} (انتظار 2)`);
  if (r1.paintedLayers.join(",") !== "markers") errs.push(`لایه‌های رسم‌شده=${r1.paintedLayers.join(",")} ✗`);

  const r2 = engine.applyPlan({
    series: [{ id: "ema", role: "overlay", adapter, points: [{ t: 1, value: 10 }, { t: 2, value: 11 }] }],
    layers: [{ id: "markers", changed: false }],
  });
  if (r2.partial !== 1) errs.push(`افزایشی نبود (partial=${r2.partial}) ✗`);
  if (r2.dropped !== 1) errs.push(`سری حذف‌نشده (dropped=${r2.dropped}) ✗`);
  if (r2.paintedLayers.length !== 0 || r2.skippedLayers !== 1) errs.push("لایهٔ تغییرنیافته باید skipped شود ✗");

  const r3 = engine.applyPlan({ series: [{ id: "bad", adapter, spec: { kind: "pane", id: "bad", heightRatio: 0.9 } }] });
  if (r3.specErrors.length === 0) errs.push("قطعهٔ نامعتبر باید در specErrors بیاید ✗");
  if (engine.series.has("bad")) errs.push("قطعهٔ نامعتبر نباید سری بسازد ✗");

  /** (الف) آداپتور خطاانداز ⇒ هسته نباید بیفتد ✗ و باید `full` (setData) شود ✓ */
  const boom = {
    setData: () => {},
    update: () => {
      throw new Error("stale-generation");
    },
  };
  const r4 = engine.applyPlan({ series: [{ id: "boom", adapter: boom, points: [{ t: 1, value: 1 }] }] });
  if (r4.created !== 1 || r4.full !== 1) errs.push(`آداپتور خطاانداز: created=${r4.created} full=${r4.full} ✗`);

  /** (ب) پلن دوم با **دنباله** ⇒ `partial` ✓ · `created=0` ✓ (افزایشی واقعی) */
  const r5 = engine.applyPlan({
    series: [{ id: "boom", adapter: boom, points: [{ t: 1, value: 1 }, { t: 2, value: 2 }] }],
  });
  if (r5.created !== 0) errs.push(`پلن دنباله نباید سری بسازد (created=${r5.created}) ✗`);
  if (r5.updated !== 1) errs.push(`پلن دنباله باید یک به‌روزرسانی بدهد (${r5.updated}) ✗`);
  return errs;
}
