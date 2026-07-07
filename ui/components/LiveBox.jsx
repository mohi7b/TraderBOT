// ui/components/LiveBox.jsx
// 🟦 این کامپوننت داده‌های لحظه‌ای (Live Data) را نمایش می‌دهد
// نکته: کامنت‌ها فارسی هستند اما خروجی UI باید انگلیسی باشد

export default function LiveBox({ live }) {
  // اگر داده وجود نداشت
  if (!live) {
    return (
      <div className="p-4 bg-gray-900 text-gray-400 rounded">
        No live data
      </div>
    );
  }

  return (
    <div className="p-4 bg-gray-900 rounded text-white">
      {/* 🟦 عنوان */}
      <h2 className="text-lg font-bold mb-3">Live Data</h2>

      {/* 🟦 قیمت لحظه‌ای */}
      <div className="mb-3">
        <div className="text-gray-400 text-sm">Last Price</div>
        <div className="text-base font-semibold">
          {live.lastPrice?.toLocaleString() || "—"}
        </div>
      </div>

      {/* 🟦 بخش معاملات */}
      <h3 className="font-bold mt-3 mb-1">Trades</h3>
      <div className="text-sm">Count: {live.trades?.count ?? "—"}</div>
      <div className="text-sm">Buy Volume: {live.trades?.buyVolume ?? "—"}</div>
      <div className="text-sm">Sell Volume: {live.trades?.sellVolume ?? "—"}</div>

      {/* 🟦 بخش اردربوک */}
      <h3 className="font-bold mt-3 mb-1">Orderbook</h3>
      <div className="text-sm">Buy Depth: {live.orderbook?.buyDepth ?? "—"}</div>
      <div className="text-sm">Sell Depth: {live.orderbook?.sellDepth ?? "—"}</div>
      <div className="text-sm">
        Market Pressure: {live.orderbook?.marketPressure?.toUpperCase() || "—"}
      </div>

      {/* 🟦 بخش ولتیلیتی */}
      <h3 className="font-bold mt-3 mb-1">Volatility</h3>
      <div className="text-sm">Micro: {live.volatility?.micro ?? "—"}</div>
    </div>
  );
}
