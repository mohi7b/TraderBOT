"use client";

import { useEffect, useRef } from "react";
import { createChart } from "lightweight-charts";
import { useDepthLayer2Store } from "../store/depthLayer2Store";

export default function DepthChartTest() {
  const containerRef = useRef(null);
  const bidsSeriesRef = useRef(null);
  const asksSeriesRef = useRef(null);

  // ساخت چارت فقط یک بار
  useEffect(() => {
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 600,
      layout: {
        background: { color: "#000" },
        textColor: "#fff",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.1)" },
        horzLines: { color: "rgba(255,255,255,0.1)" },
      },
      timeScale: { visible: false },
    });

    bidsSeriesRef.current = chart.addHistogramSeries({
      color: "rgba(0,200,0,0.6)",
    });

    asksSeriesRef.current = chart.addHistogramSeries({
      color: "rgba(200,0,0,0.6)",
    });
  }, []);

  // دریافت داده از Store جدید
  useEffect(() => {
    const unsub = useDepthLayer2Store.subscribe((state) => {
      const depth = state.data;
      if (!depth || !depth.bids || !depth.asks) return;

      // سورت بر اساس قیمت
      const sortedBids = [...depth.bids].sort((a, b) => a.price - b.price);
      const sortedAsks = [...depth.asks].sort((a, b) => a.price - b.price);

      // 🎯 خریدها از 1 → 2 → 3 → ...
      const bids = sortedBids.map((b, i) => ({
        time: 1 + i,
        value: b.reachPrice,
      }));

      // 🎯 فروش‌ها از 1000 → 1001 → 1002 → ...
      const asks = sortedAsks.map((a, i) => ({
        time: 1000 + i,
        value: a.reachPrice,
      }));

      bidsSeriesRef.current?.setData(bids);
      asksSeriesRef.current?.setData(asks);

      console.log(
        `📊 L2 Update → bids: ${sortedBids.length}, asks: ${sortedAsks.length}`
      );
    });

    return () => unsub();
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "600px",
        border: "1px solid #333",
        borderRadius: "8px",
      }}
    />
  );
}
