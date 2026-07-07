// ui/components/SignalPanel.jsx

"use client";

export default function SignalPanel({ candle }) {
  const loading = !candle;

  const signals = candle?.signals || {};
  const live = candle?.live || {};

  const safeNum = (v) =>
    typeof v === "number" ? v.toFixed(2) : "0.00";

  return (
    <div className="bg-gray-900 rounded p-3 flex flex-col h-full justify-between">

      {/* Header */}
      <div className="flex-none mb-2">
        <h2 className="text-lg font-bold">Signals</h2>

        {loading ? (
          <div className="animate-pulse bg-gray-700 h-5 w-32 rounded mt-2"></div>
        ) : (
          <div className="text-gray-300 text-sm">
            Updated: {new Date(candle.timestamp).toLocaleTimeString()}
          </div>
        )}
      </div>

      {/* Signal Items */}
      <div className="grid grid-cols-2 gap-2 flex-grow">

        {[
          ["Trend Score", signals.trendScore],
          ["Spike Strength", signals.spikeStrength],
          ["Trade Imbalance", signals.tradeImbalance],
          ["Orderbook Dominance", signals.orderbookDominance],
          ["Market Pressure", signals.marketPressure],
        ].map(([label, value], i) => (
          <div
            key={i}
            className="bg-gray-800 p-2 rounded h-[65px] flex flex-col justify-between"
          >
            <div className="text-gray-400 text-xs">{label}</div>

            {loading ? (
              <div className="animate-pulse bg-gray-600 h-4 w-full rounded"></div>
            ) : (
              <div className="text-sm font-semibold">
                {typeof value === "number"
                  ? safeNum(value)
                  : typeof value === "string"
                  ? value.toUpperCase()
                  : "—"}
              </div>
            )}
          </div>
        ))}

      </div>

    </div>
  );
}
