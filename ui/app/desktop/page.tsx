"use client";

import { useEffect, useState } from "react";

export default function DesktopDashboard() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/timeframes");
      const json = await res.json();
      setData(json);
    };

    load();
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!data) {
    return (
      <div className="p-6 text-white">
        Loading market data...
      </div>
    );
  }

  return (
    <div className="p-6 text-white">
      <h1 className="text-3xl font-bold mb-6">Desktop Market Dashboard (BTCUSDT)</h1>

      {Object.keys(data).map(tf => {
        const item = data[tf];
        const dirColor = item.pressure.direction === "BUY" ? "text-green-500" : "text-red-500";

        return (
          <div key={tf} className="border border-gray-700 p-4 rounded mb-4 bg-gray-900">
            <h2 className="text-xl font-bold">{tf}</h2>

            <p>Updated: {new Date(item.updatedAt).toLocaleString()}</p>

            <p className={dirColor}>
              Direction: {item.pressure.direction}
            </p>

            <p>Price: {item.candle.close}</p>

            <div className="mt-2">
              <div className="text-green-400">
                Buy Pressure: {item.pressure.buyRatio.toFixed(2)}%
              </div>
              <div className="bg-green-600 h-2 rounded" style={{ width: `${item.pressure.buyRatio}%` }}></div>

              <div className="text-red-400 mt-2">
                Sell Pressure: {item.pressure.sellRatio.toFixed(2)}%
              </div>
              <div className="bg-red-600 h-2 rounded" style={{ width: `${item.pressure.sellRatio}%` }}></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
