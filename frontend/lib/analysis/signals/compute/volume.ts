/**
 * AL · سیگنال حجم (Volume Spike)
 * frontend/lib/analysis/signals/compute/volume.ts
 * ============================================================
 * **تعریف (نسخه 1.0.0):** برای هر کندل، میانگین و انحراف معیار حجم **پنجرهٔ
 * قبلی** (بدون خود کندل) حساب می‌شود و `z = (v − avg) / sd` ⇒ اگر `|z| ≥ zMax`
 * یک رویداد «جهش حجم» ثبت می‌شود (تُن `warn`).
 *   · `sd = 0` ⇒ رویداد ساخته نمی‌شود (نه تقسیم بر صفر، نه مقدار جعلی)
 *   · خروجی برای حجم نامعتبر `null` می‌ماند ⇒ هیچ رویدادی ساخته نمی‌شود
 *   · `maxEvents` رویدادهای **آخر** را نگه می‌دارد (payload سبک)
 * ============================================================
 */
import type { SignalEvent, SignalInput } from "../types";

export interface VolumeStats {
  index: number;
  last: number | null;
  avg: number | null;
  sd: number | null;
  z: number | null;
}

/** آمارهٔ حجم در آخرین کندل (پنجرهٔ قبلی، بدون خود کندل). */
export function volumeStats(volumes: number[], window = 20): VolumeStats {
  const i = volumes.length - 1;
  if (i < window) return { index: i, last: null, avg: null, sd: null, z: null };
  const win = volumes.slice(i - window, i).filter((v) => Number.isFinite(v));
  const last = Number(volumes[i]);
  if (win.length < window || !Number.isFinite(last)) {
    return { index: i, last: null, avg: null, sd: null, z: null };
  }
  const avg = win.reduce((a, b) => a + b, 0) / win.length;
  const sd = Math.sqrt(win.reduce((a, b) => a + (b - avg) ** 2, 0) / win.length);
  return { index: i, last, avg, sd, z: sd > 0 ? (last - avg) / sd : null };
}

/** رویدادهای جهش حجم. */
export function volumeSpikeEvents(input: SignalInput): SignalEvent[] {
  const candles = input.candles ?? [];
  const window = Math.max(2, Math.round(input.params.window ?? 20));
  const zMax = Math.max(0.5, input.params.z ?? 2);
  const maxEvents = Math.max(1, Math.round(input.params.maxEvents ?? 50));
  const out: SignalEvent[] = [];

  for (let i = window; i < candles.length; i++) {
    const last = Number(candles[i]?.volume);
    if (!Number.isFinite(last)) continue;
    const win: number[] = [];
    for (let j = i - window; j < i; j++) {
      const v = Number(candles[j]?.volume);
      if (Number.isFinite(v)) win.push(v);
    }
    if (win.length < window) continue;
    const avg = win.reduce((a, b) => a + b, 0) / win.length;
    const sd = Math.sqrt(win.reduce((a, b) => a + (b - avg) ** 2, 0) / win.length);
    if (!(sd > 0)) continue;
    const z = (last - avg) / sd;
    if (Math.abs(z) < zMax) continue;
    const t = input.times[i];
    if (t === undefined) continue;
    out.push({
      kind: "volume_spike",
      index: i,
      t,
      tone: "warn",
      label: "VS",
      value: z,
      meta: { z: Math.round(z * 100) / 100, avg: Math.round(avg) },
    });
  }
  return out.slice(-maxEvents);
}
