"use client";

import { useEffect, useState } from "react";
import CandleChart from "../components/CandleChart";

export default function Page() {
  const [candles, setCandles] = useState([]);

  // بار اول → REST
  useEffect(() => {
    async function loadREST() {
      const res = await fetch("/api/candles");
      const data = await res.json();

      const formatted = data.map((c) => ({
        time: Math.floor(c[0] / 1000),
        open: parseFloat(c[1]),
        high: parseFloat(c[2]),
        low: parseFloat(c[3]),
        close: parseFloat(c[4]),
        volume: parseFloat(c[5]),
      }));

      setCandles(formatted);
    }

    loadREST();
  }, []);

  // داده زنده → WS
  useEffect(() => {
    const ws = new WebSocket(
      "wss://stream.binance.com:9443/ws/btcusdt@kline_1m"
    );

    ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      const k = data.k;

      const live = {
        time: Math.floor(k.t / 1000),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        closed: k.x,
      };

      setCandles((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];

        // اگر کندل WS همان کندل آخر باشد → آپدیت
        if (live.time === last.time) {
          updated[updated.length - 1] = live;
        }

        // اگر کندل WS کندل جدید باشد → اضافه کن
        if (live.time > last.time) {
          updated.push(live);
        }

        return updated;
      });
    };

    return () => ws.close();
  }, []);

  return (
    <div className="p-4 text-white">
      <h1 className="text-xl mb-4">BTCUSDT Live 1m Chart</h1>
      <CandleChart candles={candles} />
    </div>
  );
}
