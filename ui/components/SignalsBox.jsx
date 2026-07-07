// ui/components/SignalsBox.jsx

export default function SignalsBox({ signals }) {
  if (!signals) {
    return (
      <div className="p-4 bg-gray-900 text-gray-400 rounded">
        No signals available
      </div>
    );
  }

  const safe = (v) =>
    typeof v === "number" ? v.toFixed(2) : v || "—";

  return (
    <div className="p-4 bg-gray-900 rounded text-white">
      <h2 className="text-lg font-bold mb-2">Signals</h2>

      <div>Spike Raw: {safe(signals.spikeRaw)}</div>
      <div>Spike Strength: {safe(signals.spikeStrength)}</div>
      <div>Spike Count: {safe(signals.spikeCount)}</div>
      <div>Spike Direction: {signals.spikeDirection?.toUpperCase()}</div>

      <div>Micro Volatility: {safe(signals.microVolatility)}</div>
      <div>Orderbook Dominance: {safe(signals.orderbookDominance)}</div>
      <div>Depth Imbalance: {safe(signals.depthImbalance)}</div>
      <div>Trade Imbalance: {safe(signals.tradeImbalance)}</div>

      <div>Market Direction: {signals.marketDirection?.toUpperCase()}</div>
      <div>Market Pressure: {signals.marketPressure?.toUpperCase()}</div>

      <div>Trend Score: {safe(signals.trendScore)}</div>
      <div>Market State: {signals.marketState?.toUpperCase()}</div>
    </div>
  );
}
