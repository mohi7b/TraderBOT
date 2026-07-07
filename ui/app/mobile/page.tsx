"use client";

import { useEffect, useState } from "react";

export default function MobileDashboard() {
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

  if (!data) return <div className="text-white p-4">Loading...</div>;

  return (
    <div className="p-4 text-white">
      <h1 className="text-xl font-bold mb-4">Mobile Dashboard</h1>

      {Object.keys(data).map(tf => {
        const item = data[tf];
        const dirColor = item.pressure.direction === "BUY" ? "text-green-500" : "text-red-500";

        return (
          <div key={tf} className="mb-4 bg-gray-800 p-3 rounded">
            <h2 className="text-lg">{tf}</h2>
            <p className={dirColor}>{item.pressure.direction}</p>
            <p>{item.candle.close}</p>
          </div>
        );
      })}
    </div>
  );
}
