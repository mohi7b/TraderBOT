// ui/components/MarketOverview.jsx
// 🟦 این کامپوننت نمای کلی بازار را نمایش می‌دهد
// نکته: کامنت‌ها فارسی هستند اما خروجی UI باید انگلیسی باشد

"use client";

export default function MarketOverview({ candle }) {
  const loading = !candle;

  // 🟦 داده‌های snapshot
  const live = candle?.live || {};
  const signals = candle?.signals || {};
  const behavior = candle?.behavior || {};
  const magnet = candle?.magnet || {};

  // 🟦 داده‌های اردربوک
  const buyDepth = live.orderbook?.buyDepth || 0;
  const sellDepth = live.orderbook?.sellDepth || 0;
  const spread = live.orderbook?.spread || 0;
  const midPrice = live.orderbook?.midPrice || 0;
  const imbalance = live.orderbook?.imbalance || 0;

  // 🟦 Liquidity Gap
  const gapValue = buyDepth - sellDepth;
  const gapStrength = Math.min(Math.abs(gapValue) * 10, 50);

  return (
    <div className="bg-gray-900 rounded p-3 flex flex-col h-full justify-between">

      {/* 🟦 Header */}
      <div className="flex-none mb-2">
        <h2 className="text-lg font-bold mb-1">Market Overview</h2>

        {loading ? (
          <div className="animate-pulse bg-gray-700 h-6 w-24 rounded"></div>
        ) : (
          <div className="text-2xl font-bold text-green-400">
            {live.lastPrice?.toLocaleString()}
          </div>
        )}

        {loading ? (
          <div className="animate-pulse bg-gray-700 h-4 w-20 rounded mt-1"></div>
        ) : (
          <div className="text-sm text-gray-400">
            {behavior.mode?.toUpperCase() || "NEUTRAL"}
          </div>
        )}
      </div>

      {/* 🟦 Row 1 — Depth + Volume */}
      <div className="grid grid-cols-4 gap-1 text-xs flex-none">

        {[
          ["Sell Depth", sellDepth],
          ["Sell Volume", live.trades?.sellVolume],
          ["Buy Volume", live.trades?.buyVolume],
          ["Buy Depth", buyDepth],
        ].map(([label, value], i) => (
          <div key={i} className="bg-gray-800 p-2 rounded h-[70px] flex flex-col justify-between">
            <div className="text-gray-400">{label}</div>

            {loading ? (
              <div className="animate-pulse bg-gray-600 h-5 w-full rounded"></div>
            ) : (
              <div className="text-base font-semibold">
                {typeof value === "number" ? value.toFixed(2) : "0.00"}
              </div>
            )}
          </div>
        ))}

      </div>

      {/* 🟦 Liquidity Gap */}
      <div className="bg-gray-800 p-2 rounded h-[55px] flex flex-col justify-center mt-3">

        <div className="text-gray-400 text-xs mb-1 text-center">
          Liquidity Gap
        </div>

        {loading ? (
          <div className="animate-pulse bg-gray-700 h-4 w-full rounded"></div>
        ) : (
          <div className="relative w-full h-4 bg-gray-700 rounded overflow-hidden">

            {/* خط وسط */}
            <div className="absolute left-1/2 top-0 w-[1px] h-full bg-gray-500"></div>

            {(() => {
              const intensity = Math.min(Math.abs(gapValue) * 0.1, 1);

              const color = gapValue >= 0
                ? `rgba(34, 197, 94, ${0.3 + intensity * 0.7})`
                : `rgba(239, 68, 68, ${0.3 + intensity * 0.7})`;

              return (
                <div
                  className="absolute top-0 h-full transition-all duration-300 rounded"
                  style={{
                    width: `${gapStrength}%`,
                    backgroundColor: color,
                    left: gapValue >= 0 ? "0%" : `calc(100% - ${gapStrength}%)`,
                    transformOrigin: gapValue >= 0 ? "left" : "right",
                  }}
                ></div>
              );
            })()}

          </div>
        )}

      </div>

      {/* 🟦 NEW — Orderbook Details */}
      <div className="grid grid-cols-3 gap-1 text-xs flex-none mt-3">

        {[
          ["Spread", spread],
          ["Mid Price", midPrice],
          ["Imbalance", imbalance],
        ].map(([label, value], i) => (
          <div key={i} className="bg-gray-800 p-2 rounded h-[55px] flex flex-col justify-between">
            <div className="text-gray-400">{label}</div>
            {loading ? (
              <div className="animate-pulse bg-gray-600 h-4 w-full rounded"></div>
            ) : (
              <div className="text-sm font-semibold">
                {typeof value === "number" ? value.toFixed(2) : "—"}
              </div>
            )}
          </div>
        ))}

      </div>

      {/* 🟦 Trend Score */}
      <div className="grid grid-cols-1 gap-1 text-xs flex-none mt-3">
        <div className="bg-gray-800 p-2 rounded h-[55px] flex flex-col justify-center items-center">
          <div className="text-gray-400">Trend Score</div>

          {loading ? (
            <div className="animate-pulse bg-gray-600 h-4 w-16 rounded"></div>
          ) : (
            <div className="text-sm font-semibold">
              {typeof signals.trendScore === "number"
                ? signals.trendScore.toFixed(2)
                : "0.00"}
            </div>
          )}
        </div>
      </div>

      {/* 🟦 NEW — Magnet */}
      <div className="grid grid-cols-2 gap-1 text-xs flex-none mt-3">
        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Magnet Direction</div>
          <div className="text-sm font-semibold">
            {magnet.direction?.toUpperCase() || "—"}
          </div>
        </div>

        <div className="bg-gray-800 p-2 rounded">
          <div className="text-gray-400">Magnet Strength</div>
          <div className="text-sm font-semibold">
            {magnet.strength ?? "—"}
          </div>
        </div>
      </div>

    </div>
  );
}
