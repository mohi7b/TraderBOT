/**
 * ============================================================
 * Chart Layers — لایه‌های بصری روی بوم (قابل‌فعال/غیرفعال)
 * frontend/lib/chart/layers.ts
 * ============================================================
 * هر لایه یک «نقاش خالص» است که روی بومِ شفافِ روی چارت اجرا می‌شود:
 *   target-band · recession · event-markers · projection · shock-indicators
 *
 * ⚠️ هیچ رنگی داخل نقاش‌ها هاردکد نیست: همه از `resolveColor(colorKey)`
 *    می‌آید که آن هم از تم تزریق‌شده می‌خواند.
 * ============================================================
 */
import type {
  ChartLayer,
  ChartLayout,
  CrossMarkersLayer,
  EventMarkersLayer,
  LayerPaintContext,
  ProjectionLayer,
  RecessionLayer,
  ShockIndicatorsLayer,
  SignalMarkersLayer,
  TargetBandLayer,
} from "./types";

// ------------------------------------------------------------------
// ابزارهای ترسیم
// ------------------------------------------------------------------
function clampRect(c: LayerPaintContext) {
  const { plot } = c;
  c.ctx.save();
  c.ctx.beginPath();
  c.ctx.rect(plot.left, plot.top, Math.max(0, plot.right - plot.left), Math.max(0, plot.bottom - plot.top));
  c.ctx.clip();
}

function plotWidth(c: LayerPaintContext): number {
  return Math.max(1, c.plot.right - c.plot.left);
}

function dashedLine(
  c: LayerPaintContext,
  x1: number,
  y: number,
  x2: number,
  color: string,
  dash: number[] = [4, 4],
  width = 1,
) {
  const { ctx } = c;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

/** خط ممتد (بدون خط‌چین) — برای «هدف تورمی ثابت» که باید واضح دیده شود. */
function solidLine(
  c: LayerPaintContext,
  x1: number,
  y: number,
  x2: number,
  color: string,
  width = 2,
) {
  const { ctx } = c;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(x1, y);
  ctx.lineTo(x2, y);
  ctx.stroke();
  ctx.restore();
}

/** برچسب متن با پس‌زمینهٔ محو (خوانا روی هر تمی). */
function tag(c: LayerPaintContext, x: number, y: number, text: string, color: string) {
  const { ctx } = c;
  ctx.save();
  ctx.font = `${c.theme.fontSize}px ${c.theme.fontFamily}`;
  const pad = 3;
  const w = ctx.measureText(text).width + pad * 2;
  const h = c.theme.fontSize + pad * 2;
  ctx.fillStyle = c.theme.palette.surface;
  ctx.globalAlpha = 0.85;
  ctx.fillRect(x, y - h / 2, w, h);
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + pad, y + 0.5);
  ctx.restore();
}

// ------------------------------------------------------------------
// ۱) باند هدف تورمی
// ------------------------------------------------------------------
export function paintTargetBand(c: LayerPaintContext, layer: TargetBandLayer) {
  const { low, high } = layer;
  const hasLow = low !== null && low !== undefined;
  const hasHigh = high !== null && high !== undefined;
  if (!hasLow && !hasHigh) return;

  const fillColor = c.resolveColor(layer.colorKey ?? "targetBand");
  // رنگ خط هدف: اسلات `targetLine` (اگر تم بدهد) وگرنه `target`
  const lineColor =
    c.theme.palette.slots["targetLine"] ?? c.resolveColor("target");
  const yLow = hasLow ? c.priceToY(Number(low)) : null;
  const yHigh = hasHigh ? c.priceToY(Number(high)) : null;
  /**
   * هدف «نقطه‌ای» (low == high) ⇒ یک **خط ضخیم ترنسپرنت**، بدون خط‌چین و
   * بدون مستطیل — تا روی چارت واضح دیده شود و شلوغ نباشد.
   * هدف «باند» (low ≠ high) ⇒ مستطیل سبز کم‌رنگ + دو لبهٔ نازک.
   */
  const pointTarget = hasLow && hasHigh && Math.abs(Number(low) - Number(high)) < 1e-9;

  clampRect(c);
  if (pointTarget) {
    const y = yLow ?? yHigh;
    if (y !== null) solidLine(c, c.plot.left, y, c.plot.right, lineColor, 3);
  } else {
    if (layer.fill !== false && yLow !== null && yHigh !== null) {
      const top = Math.min(yLow, yHigh);
      const bottom = Math.max(yLow, yHigh);
      c.ctx.fillStyle = fillColor;
      c.ctx.fillRect(c.plot.left, top, plotWidth(c), bottom - top);
    }
    if (layer.drawLines !== false) {
      // لبه‌های مستطیل هدف: **خط ممتد و کمی ضخیم‌تر** تا محدوده واقعاً
      // مثل یک مستطیل دیده شود (خط‌چین نازک قبلی در عمل محو بود).
      if (yLow !== null) solidLine(c, c.plot.left, yLow, c.plot.right, lineColor, 1.5);
      if (yHigh !== null) solidLine(c, c.plot.left, yHigh, c.plot.right, lineColor, 1.5);
    }
  }
  if (layer.label) {
    const yAnchor = pointTarget ? (yLow ?? yHigh) : (yHigh ?? yLow);
    if (yAnchor !== null) tag(c, c.plot.left + 4, yAnchor - 8, layer.label, lineColor);
  }
  c.ctx.restore();
}

// ------------------------------------------------------------------
// ۲) سایهٔ رکود
// ------------------------------------------------------------------
export function paintRecession(c: LayerPaintContext, layer: RecessionLayer) {
  if (!layer.ranges?.length) return;
  const color = c.resolveColor(layer.colorKey ?? "recession");
  clampRect(c);
  for (const r of layer.ranges) {
    const from = c.toSec(r.from);
    const to = c.toSec(r.to);
    if (from === null || to === null) continue;
    const x1 = c.timeToX(from);
    const x2 = c.timeToX(to);
    if (x1 === null || x2 === null) continue;
    const left = Math.max(c.plot.left, Math.min(x1, x2));
    const right = Math.min(c.plot.right, Math.max(x1, x2));
    if (right <= left) continue;
    c.ctx.fillStyle = color;
    c.ctx.fillRect(left, c.plot.top, right - left, c.plot.bottom - c.plot.top);
  }
  c.ctx.restore();
}


// ------------------------------------------------------------------
// ۳) نشانگر رویدادها
// ------------------------------------------------------------------
export function paintEventMarkers(c: LayerPaintContext, layer: EventMarkersLayer) {
  if (!layer.events?.length) return;
  clampRect(c);
  for (const e of layer.events) {
    const sec = c.toSec(e.t);
    if (sec === null) continue;
    const x = c.timeToX(sec);
    if (x === null || x < c.plot.left || x > c.plot.right) continue;
    const color = c.resolveColor(
      layer.colorKey ??
        (e.importance === "high" ? "eventHigh" : e.importance === "medium" ? "eventMedium" : "eventLow"),
    );
    if (layer.paintVerticalLines !== false) dashedLine(c, x, c.plot.top, x, color, [3, 3], 1);
    const { ctx } = c;
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, c.plot.top + 6);
    ctx.lineTo(x - 4, c.plot.top + 1);
    ctx.lineTo(x + 4, c.plot.top + 1);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (e.label) tag(c, x + 4, c.plot.top + 14, e.label, color);
  }
  c.ctx.restore();
}

// ------------------------------------------------------------------
// ۴) ناحیهٔ پیش‌بینی
// ------------------------------------------------------------------
/** آخرین زمان موجود در داده (پیش‌فرض `from` برای لایهٔ پیش‌بینی). */
function lastDataTime(c: LayerPaintContext): number | string | undefined {
  let last = Number.NEGATIVE_INFINITY;
  for (const s of c.data) {
    const pts = s.type === "candlestick" ? (s.bars ?? []) : (s.points ?? []);
    for (const p of pts) if (p.t > last) last = p.t;
  }
  return Number.isFinite(last) ? last : undefined;
}

export function paintProjection(c: LayerPaintContext, layer: ProjectionLayer) {
  const fromInput = layer.from ?? lastDataTime(c);
  if (fromInput === undefined) return;
  const from = c.toSec(fromInput);
  if (from === null) return;
  const to = layer.to !== undefined && layer.to !== null ? c.toSec(layer.to) : null;
  const x1 = c.timeToX(from);
  if (x1 === null) return;
  const x2 = to !== null ? (c.timeToX(to) ?? c.plot.right) : c.plot.right;
  if (x2 === null) return;
  const left = Math.max(c.plot.left, Math.min(x1, x2));
  const right = Math.min(c.plot.right, Math.max(x1, x2));
  if (right <= left) return;
  const color = c.resolveColor(layer.colorKey ?? "projection");

  clampRect(c);
  if (layer.fill !== false) {
    c.ctx.save();
    c.ctx.globalAlpha = 0.1;
    c.ctx.fillStyle = color;
    c.ctx.fillRect(left, c.plot.top, right - left, c.plot.bottom - c.plot.top);
    c.ctx.restore();
  }
  dashedLine(c, left, c.plot.top, left, color, [4, 3], 1);
  if (layer.value !== undefined) {
    const y = c.priceToY(layer.value);
    if (y !== null) dashedLine(c, left, y, right, color, [6, 4], 2);
  }
  if (layer.points?.length) {
    const { ctx } = c;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    let started = false;
    for (const p of layer.points) {
      const x = c.timeToX(p.t);
      const y = c.priceToY(p.value);
      if (x === null || y === null) continue;
      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (layer.label) tag(c, left + 4, c.plot.top + 14, layer.label, color);
  c.ctx.restore();
}

// ------------------------------------------------------------------
// ۵) نقاط شوک
// ------------------------------------------------------------------
export function paintShockIndicators(c: LayerPaintContext, layer: ShockIndicatorsLayer) {
  if (!layer.points?.length) return;
  const r = layer.radius ?? 4;
  clampRect(c);
  for (const p of layer.points) {
    const sec = c.toSec(p.t);
    if (sec === null) continue;
    const x = c.timeToX(sec);
    const y = c.priceToY(p.value);
    if (x === null || y === null) continue;
    const color = c.resolveColor(
      layer.colorKey ?? (p.tone === "pos" ? "signalPos" : p.tone === "warn" ? "signalWarn" : "shock"),
    );
    const { ctx } = c;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.35;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
    if (p.label) tag(c, x + r + 2, y, p.label, color);
  }
  c.ctx.restore();
}

// ------------------------------------------------------------------
// ۶) نشانگر کراس (Golden / Death) — افزودنی دامنهٔ تاریخی (H2)
// ------------------------------------------------------------------
/**
 * مثلث رو به **بالا** برای کراس طلایی (زیر `low` کندل) و رو به **پایین** برای
 * کراس مرگ (بالای `high` کندل). رنگ‌ها فقط از اسلات‌های تم
 * (`goldenCross`/`deathCross`) می‌آید ⇒ هیچ رنگ هاردکدی در موتور نیست.
 * مختصات بیرون ناحیهٔ رسم (زوم/اسکرول) خودکار رد می‌شود.
 */
export function paintCrossMarkers(c: LayerPaintContext, layer: CrossMarkersLayer) {
  const points = layer.points ?? [];
  if (points.length === 0) return;
  const size = Math.max(3, layer.size ?? 5);
  const gap = size + 3;
  clampRect(c);
  for (const p of points) {
    const x = c.timeToX(p.t);
    const y = c.priceToY(p.price);
    if (x === null || y === null) continue;
    const up = p.dir === "golden";
    const color = c.resolveColor(
      up ? (layer.goldenColorKey ?? "goldenCross") : (layer.deathColorKey ?? "deathCross"),
    );
    const cy = up ? y + gap : y - gap;
    const { ctx } = c;
    ctx.save();
    ctx.beginPath();
    if (up) {
      ctx.moveTo(x, cy - size);
      ctx.lineTo(x + size, cy + size);
      ctx.lineTo(x - size, cy + size);
    } else {
      ctx.moveTo(x, cy + size);
      ctx.lineTo(x + size, cy - size);
      ctx.lineTo(x - size, cy - size);
    }
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.restore();
    if (layer.showLabels && p.label) tag(c, x + size + 2, cy, p.label, color);
  }
  c.ctx.restore();
}

// ------------------------------------------------------------------
// ۷) نشانگر عمومی سیگنال‌ها (AL · A2)
// ------------------------------------------------------------------
/**
 * نشانگر هر رویداد سیگنال: دایره (پیش‌فرض) یا مثلث رو به بالا/پایین.
 * رنگ **فقط** از اسلات تُن (`signalPos/signalNeg/signalWarn/…`) ⇒ هیچ رنگ
 * هاردکدی در موتور نیست. مختصات بیرون ناحیهٔ رسم خودکار رد می‌شود.
 */
export function paintSignalMarkers(c: LayerPaintContext, layer: SignalMarkersLayer) {
  const points = layer.points ?? [];
  if (points.length === 0) return;
  const size = Math.max(3, layer.size ?? 4);
  const TONE_SLOT: Record<string, string> = {
    pos: "signalPos",
    neg: "signalNeg",
    warn: "signalWarn",
    risk: "signalRisk",
    info: "signalInfo",
    neutral: "signalNeutral",
  };
  clampRect(c);
  for (const p of points) {
    const x = c.timeToX(p.t);
    const y = c.priceToY(p.price);
    if (x === null || y === null) continue;
    const color = c.resolveColor(TONE_SLOT[p.tone] ?? "signalNeutral");
    const shape = p.shape ?? "circle";
    /** provisional ⇒ کم‌رنگ + خط‌چین (رویداد تأییدنشده) */
    const alpha = p.provisional ? 0.35 : 1;
    const { ctx } = c;
    ctx.save();
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    if (p.provisional) ctx.setLineDash([3, 3]);
    if (shape === "circle") {
      ctx.beginPath();
      ctx.arc(x, y, size * 0.6, 0, Math.PI * 2);
      ctx.globalAlpha = 0.28 * alpha;
      ctx.fill();
      ctx.globalAlpha = 0.9 * alpha;
      ctx.stroke();
    } else {
      const up = shape === "triangle-up";
      const cy = up ? y + size + 3 : y - size - 3;
      ctx.beginPath();
      if (up) {
        ctx.moveTo(x, cy - size);
        ctx.lineTo(x + size, cy + size);
        ctx.lineTo(x - size, cy + size);
      } else {
        ctx.moveTo(x, cy + size);
        ctx.lineTo(x + size, cy - size);
        ctx.lineTo(x - size, cy - size);
      }
      ctx.closePath();
      ctx.globalAlpha = 0.85 * alpha;
      ctx.fill();
      ctx.globalAlpha = 1 * alpha;
      ctx.stroke();
      if (layer.showLabels && p.label) {
        ctx.restore();
        tag(c, x + size + 2, cy, p.label, color);
        continue;
      }
    }
    ctx.restore();
    if (layer.showLabels && p.label && shape === "circle") {
      tag(c, x + size + 3, y, p.label, color);
    }
  }
  c.ctx.restore();
}

// ------------------------------------------------------------------
// رجیستری نقاش‌ها + اجرای لایه‌ها
// ------------------------------------------------------------------
type AnyPainter = (c: LayerPaintContext, layer: never) => void;

export const LAYER_PAINTERS: Record<string, AnyPainter> = {
  "target-band": paintTargetBand as unknown as AnyPainter,
  recession: paintRecession as unknown as AnyPainter,
  "event-markers": paintEventMarkers as unknown as AnyPainter,
  projection: paintProjection as unknown as AnyPainter,
  "shock-indicators": paintShockIndicators as unknown as AnyPainter,
  "cross-markers": paintCrossMarkers as unknown as AnyPainter,
  "signal-markers": paintSignalMarkers as unknown as AnyPainter,
};

/** اجرای همهٔ لایه‌های فعال روی بوم (سفارشی‌ها با تابع paint خودشان). */
export function paintLayers(c: LayerPaintContext, layers: ChartLayer[] | undefined) {
  if (!layers?.length) return;
  for (const layer of layers) {
    if (layer.enabled === false) continue;
    const custom = (layer as { paint?: (c: LayerPaintContext, l: ChartLayer) => void }).paint;
    if (typeof custom === "function") {
      custom(c, layer); // لایهٔ سفارشی دامنه
      continue;
    }
    const fn = LAYER_PAINTERS[layer.id];
    if (fn) fn(c, layer as never);
  }
}

/** لایه‌های فعال (برای دیباگ/آزمون). */
export function enabledLayers(layers: ChartLayer[] | undefined, _layout?: ChartLayout): ChartLayer[] {
  void _layout;
  return (layers ?? []).filter((l) => l.enabled !== false);
}

/** شناسهٔ لایه‌های پشتیبانی‌شده. */
export const LAYER_IDS = Object.keys(LAYER_PAINTERS);

