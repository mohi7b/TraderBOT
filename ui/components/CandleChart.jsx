/**
 * File: Chart.jsx
 * Path: ui/components/Chart.jsx
 * Description: چارت زنده با ساخت کندل در UI
 */

import { useEffect, useState } from "react";
import { connectWS } from "../lib/ws-client";

/**
 * ساخت کندل زنده از قیمت لحظه‌ای
 */
function buildLiveCandle(price, prevCandle) {
  const now = Math.floor(Date.now() / 1000);
  const minute = Math.floor(now / 60);

  // شروع کندل جدید
  if (!prevCandle || prevCandle.minute !== minute) {
    return {
      minute,
      time: minute * 60,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
    };
  }

  // آپدیت کندل فعلی
  return {
    ...prevCandle,
    high: Math.max(prevCandle.high, price),
    low: Math.min(prevCandle.low, price),
    close: price,
  };
}

/**
 * ادغام کندل زنده با کندل‌های REST
 */
function mergeCandles(restCandles, liveCandle) {
  const last = restCandles[restCandles.length - 1];

  if (last.time === liveCandle.time) {
    restCandles[restCandles.length - 1] = liveCandle;
  } else {
    restCandles.push(liveCandle);
  }

  return [...restCandles];
}

export default function Chart() {
  const [candles, setCandles] = useState([]);
  const [liveCandle, setLiveCandle] = useState(null);

  useEffect(() => {
    connectWS(
      // INIT → کندل‌های REST
      (restCandles) => {
        setCandles(restCandles);
      },

      // DELTA → داده‌های لحظه‌ای
      (path, data) => {
        if (path === "price") {
          const newLive = buildLiveCandle(data, liveCandle);
          setLiveCandle(newLive);

          const merged = mergeCandles(candles, newLive);
          setCandles(merged);
        }
      }
    );
  }, [candles, liveCandle]);

  return (
    <div>
      <h2>📈 چارت زنده BTCUSDT</h2>

      <pre style={{ fontSize: 12 }}>
        {JSON.stringify(candles.slice(-10), null, 2)}
      </pre>
    </div>
  );
}
