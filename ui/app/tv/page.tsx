"use client";

import { useEffect, useState } from "react";

export default function TVDashboard() {
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

  if (!data) return <div className="text-white text-4xl p-10">Loading...</div>;

  return (
    <div className="p-10 text-white text-4xl">
      <h1 className="text-6xl font-bold mb-10">TV Dashboard</h1>

      {Object.keys(data).map(tf => {
        const item = data[tf];
        const dirColor = item.pressure.direction === "BUY" ? "text-green-400" : "text-red-400";

        return (
          <div key={tf} className="mb-10 bg-gray-900 p-10 rounded">
            <h2 className="text-5xl">{tf}</h2>
            <p className={dirColor}>{item.pressure.direction}</p>
            <p>Price: {item.candle.close}</p>
          </div>
        );
      })}
    </div>
  );
}
