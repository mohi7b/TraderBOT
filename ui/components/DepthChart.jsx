"use client";

import { useEffect, useRef } from "react";
import { createChart } from "lightweight-charts";

export default function DepthChart({ socket }) {
  const chartContainerRef = useRef(null);

  useEffect(() => {
    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: "#0d1117" },
        textColor: "#c9d1d9",
      },
      grid: {
        vertLines: { color: "#1f2937" },
        horzLines: { color: "#1f2937" },
      },
      rightPriceScale: { visible: true },
      timeScale: {
        visible: true,
        // قیمت را کامل حذف کردیم
        tickMarkFormatter: (time) => time.toString(),
      },
    });

    const asksSeries = chart.addAreaSeries({
      lineColor: "#d50000",
      topColor: "rgba(213, 0, 0, 0.4)",
      bottomColor: "rgba(213, 0, 0, 0.0)",
    });

    const bidsSeries = chart.addAreaSeries({
      lineColor: "#00c853",
      topColor: "rgba(0, 200, 83, 0.4)",
      bottomColor: "rgba(0, 200, 83, 0.0)",
    });

    const midLine = chart.addLineSeries({
      color: "#ffaa00",
      lineWidth: 2,
    });

    socket.onmessage = (msg) => {
      const packet = JSON.parse(msg.data);
      if (packet.type !== "delta" || packet.path !== "depthRest") return;

      const data = packet.data;

      // داده خام
      const bidsRaw = data.bids.map(([p, q]) => ({
        price: parseFloat(p),
        qty: parseFloat(q),
      }));

      const asksRaw = data.asks.map(([p, q]) => ({
        price: parseFloat(p),
        qty: parseFloat(q),
      }));

      // قیمت لحظه‌ای واقعی
      const bestBid = Math.max(...bidsRaw.map((x) => x.price));
      const splitPrice = bestBid;

      // merge + deep clone
      const all = JSON.parse(JSON.stringify([...bidsRaw, ...asksRaw]));

      // sort
      all.sort((a, b) => a.price - b.price);

      // split
      const asks = JSON.parse(JSON.stringify(all.filter((x) => x.price <= splitPrice)));
      const bids = JSON.parse(JSON.stringify(all.filter((x) => x.price > splitPrice)));

      // time مستقل برای هر سری
      asks.forEach((item, i) => {
        item.time = 10000 + i;
      });

      bids.forEach((item, i) => {
        item.time = 20000 + i;
      });

      // cumulative
      let cumulativeAsks = 0;
      let cumulativeBids = 0;

      for (let i = asks.length - 1; i >= 0; i--) {
        cumulativeAsks += asks[i].qty;
        asks[i].cumulativeVolume = cumulativeAsks;
      }

      for (let i = 0; i < bids.length; i++) {
        cumulativeBids += bids[i].qty;
        bids[i].cumulativeVolume = cumulativeBids;
      }

      // setData
      asksSeries.setData(
        asks.map((x) => ({ time: x.time, value: x.cumulativeVolume }))
      );

      bidsSeries.setData(
        bids.map((x) => ({ time: x.time, value: x.cumulativeVolume }))
      );

      // خط وسط
      const midTime = asks[asks.length - 1]?.time;

      midLine.setData([
        { time: midTime, value: 0 },
        { time: midTime, value: Math.max(cumulativeAsks, cumulativeBids) },
      ]);

      chart.applyOptions({
        rightPriceScale: {
          autoScale: false,
          minValue: 0,
          maxValue: Math.max(cumulativeAsks, cumulativeBids),
        },
      });
    };

    return () => chart.remove();
  }, [socket]);

  return (
    <div
      ref={chartContainerRef}
      style={{
        width: "100%",
        height: "400px",
        position: "relative",
      }}
    />
  );
}
