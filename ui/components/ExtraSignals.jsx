// ui/components/ExtraSignals.jsx
// 🟦 این کامپوننت خلاصه‌ای از رفتار بازار، فشار خرید/فروش، اسپایک‌ها و داده‌های لحظه‌ای را نمایش می‌دهد
// نکته: کامنت‌ها فارسی هستند اما خروجی UI باید انگلیسی باشد

"use client";

import { useEffect, useState } from "react";

export default function ExtraSignals({ candle }) {
  const loading = !candle;

  // 🟦 داده‌های لحظه‌ای و سیگنال‌ها از snapshot
  const live = candle?.live || {};
  const signals = candle?.signals || {};
  const behavior = candle?.behavior || {};
  const magnet = candle?.magnet || {};
  const fakeWalls = candle?.fakeWalls || [];
  const alerts = candle?.alerts || [];

  // 🟦 وضعیت‌های داخلی برای نمایش
  const [mounted, setMounted] = useState(false);
  const [score, setScore] = useState(0);
  const [state, setState] = useState("Neutral");
  const [color, setColor] = useState("text-gray-300");
  const [pressurePct, setPressurePct] = useState(50);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted || !candle) return;

    // 🟦 امتیاز رفتار بازار (Trend Score + سایر فاکتورها)
    const s = signals;

    const sc =
      (s.spikeStrength || 0) * 2 +
      (s.tradeImbalance || 0) * 1.5 +
      (s.orderbookDominance || 0) * 1 +
      (s.trendScore || 0) * 1 +
      (s.marketPressure === "buy" ? 1 : -1);

    setScore(sc);

    if (sc > 3) {
      setState("Strong Bullish");
      setColor("text-green-400");
    } else if (sc > 1) {
      setState("Bullish");
      setColor("text-green-300");
    } else if (sc > -1) {
      setState("Neutral");
      setColor("text-gray-300");
    } else if (sc > -3) {
      setState("Bearish");
      setColor("text-red-300");
    } else {
      setState("Strong Bearish");
      setColor("text-red-400");
    }

    setPressurePct(Math.floor(((s.orderbookDominance || 0) + 1) * 50));
  }, [mounted, candle]);

  return (
    <div className="bg-gray-900 rounded p-3 flex flex-col h-full justify-between">

      {/* 🟦 Header */}
      <div className="flex-none">
        <h2 className="text-lg mb-2 font-bold">Market Summary</h2>

        {/* 🟦 Trend Dial */}
        <div className="flex items-center justify-center mb-3">
          {loading ? (
            <div className="animate-pulse bg-gray-700 h-10 w-20 rounded"></div>
          ) : (
            <svg width="80" height="40">
              <path
                d="M10 35 A30 30 0 0 1 70 35"
                stroke="#444"
                strokeWidth="6"
                fill="none"
              />
              <line
                x1="40"
                y1="35"
                x2={40 + score * 8}
                y2="10"
                stroke={score > 0 ? "#22c55e" : "#ef4444"}
                strokeWidth="4"
              />
            </svg>
          )}
        </div>

        {loading ? (
          <div className="animate-pulse bg-gray-700 h-5 w-24 rounded mx-auto"></div>
        ) : (
          <div className={`text-xl font-bold text-center ${color}`}>{state}</div>
        )}
      </div>

      {/* 🟦 Heatmap */}
      <div className="flex-grow mt-4">
        <div className="text-gray-400 text-xs mb-1">Market Pressure Heatmap</div>

        {loading ? (
          <div className="animate-pulse bg-gray-700 h-4 w-full rounded"></div>
        ) : (
          <div className="grid grid-cols-5 gap-1 h-4">
            {[0, 1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="rounded"
                style={{
                  backgroundColor:
                    pressurePct >= i * 20
                      ? pressurePct < 40
                        ? "#ef4444"
                        : pressurePct < 60
                        ? "#f59e0b"
                        : "#22c55e"
                      : "#374151",
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* 🟦 Big Trade Impact */}
      <div className="mt-4">
        <div className="text-gray-400 text-xs mb-1">Big Trade Impact</div>

        {loading ? (
          <div className="animate-pulse bg-gray-700 h-3 w-full rounded"></div>
        ) : (
          <div className="relative w-full h-3 bg-gray-700 rounded overflow-hidden">
            <div className="absolute left-1/2 top-0 w-[1px] h-full bg-gray-500"></div>

            <div
              className="h-full transition-all duration-300"
              style={{
                width: `${Math.min((live.trades?.bigTrades?.length || 0) * 10, 100)}%`,
                marginLeft: "50%",
                backgroundColor:
                  live.trades?.bigTrades?.length > 0 ? "#22c55e" : "#6b7280",
              }}
            />
          </div>
        )}
      </div>

      {/* 🟦 Bottom Boxes */}
      <div className="grid grid-cols-4 gap-1 text-[10px] flex-none h-[70px] mt-4">

        {[
          ["Trend Score", signals.trendScore],
          ["Spike Strength", signals.spikeStrength],
          ["Volatility", live.volatility?.micro],
          ["Orderbook Dominance", signals.orderbookDominance],
        ].map(([label, value], i) => (
          <div key={i} className="bg-gray-800 p-1 rounded flex flex-col justify-between">
            <div className="text-gray-400">{label}</div>

            {loading ? (
              <div className="animate-pulse bg-gray-600 h-4 w-full rounded"></div>
            ) : (
              <div>
                {typeof value === "number"
                  ? value.toFixed(2)
                  : "0.00"}
              </div>
            )}
          </div>
        ))}

      </div>

      {/* 🟦 NEW SECTION — Behavior & Magnet */}
      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">

        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Market Mode</div>
          <div className="text-sm font-semibold">
            {behavior.mode?.toUpperCase() || "—"}
          </div>
        </div>

        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Magnet Direction</div>
          <div className="text-sm font-semibold">
            {magnet.direction?.toUpperCase() || "—"}
          </div>
        </div>

      </div>

      {/* 🟦 NEW SECTION — Fake Walls */}
      <div className="mt-4 bg-gray-800 p-2 rounded text-xs">
        <div className="text-gray-400 mb-1">Fake Walls</div>

        {loading ? (
          <div className="animate-pulse bg-gray-700 h-4 w-full rounded"></div>
        ) : fakeWalls.length === 0 ? (
          <div className="text-gray-500">None</div>
        ) : (
          fakeWalls.slice(0, 3).map((fw, i) => (
            <div key={i} className="text-sm">
              {fw.side.toUpperCase()} — {fw.price} ({fw.size})
            </div>
          ))
        )}
      </div>

      {/* 🟦 NEW SECTION — Alerts */}
      <div className="mt-4 bg-gray-800 p-2 rounded text-xs">
        <div className="text-gray-400 mb-1">Alerts</div>

        {loading ? (
          <div className="animate-pulse bg-gray-700 h-4 w-full rounded"></div>
        ) : alerts.length === 0 ? (
          <div className="text-gray-500">None</div>
        ) : (
          alerts.slice(0, 3).map((al, i) => (
            <div key={i} className="text-sm">
              {al.type.toUpperCase()} — {al.message}
            </div>
          ))
        )}
      </div>

    </div>
  );
}
