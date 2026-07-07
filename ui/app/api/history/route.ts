// ui/app/api/history/route.ts
// 🟦 این API آخرین 500 کندل 1m بایننس را دریافت می‌کند
// نکته: کامنت‌ها فارسی هستند اما خروجی API باید انگلیسی باشد

import { NextResponse } from "next/server";

export async function GET() {
  try {
    // 🟦 آدرس API بایننس برای کندل‌های 1m
    const url =
      "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=500";

    const res = await fetch(url);
    const data = await res.json();

    // 🟦 تبدیل داده‌های خام بایننس به ساختار کندل استاندارد
    const candles = data.map((d: any) => ({
      startTime: d[0],
      open: parseFloat(d[1]),
      high: parseFloat(d[2]),
      low: parseFloat(d[3]),
      close: parseFloat(d[4]),
      volume: parseFloat(d[5]),
      endTime: d[6],
    }));

    // 🟦 خروجی فقط کندل‌ها (نه snapshot کامل)
    return NextResponse.json({
      count: candles.length,
      candles,
    });

  } catch (err) {
    // 🟦 هندلینگ خطا
    return NextResponse.json(
      { error: "Failed to fetch Binance candles", details: String(err) },
      { status: 500 }
    );
  }
}
