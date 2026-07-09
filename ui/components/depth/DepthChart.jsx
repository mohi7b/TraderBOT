"use client";

import { useEffect, useRef } from "react";
import { useDepthLong } from "@/store/depthLong";
import { createDepthChart } from "./DepthChartEngine";

export default function DepthChartTest() {
  const containerRef = useRef(null);
  const chartRef = useRef(null);

  const depth = useDepthLong((s) => s.data);

  useEffect(() => {
    if (!containerRef.current) return;
    chartRef.current = createDepthChart(containerRef.current);
  }, []);

  useEffect(() => {
    if (!chartRef.current || !depth) return;

    const bids = depth.bids.map(b => ({
      price: b.price,
      value: b.reachPrice
    }));

    const asks = depth.asks.map(a => ({
      price: a.price,
      value: a.reachPrice
    }));

    chartRef.current.update({ bids, asks });

  }, [depth.updatedAt]);

  return (
    <div
      ref={containerRef}
      style={{
        width: "100%",
        height: "400px",
        border: "1px solid #333",
        borderRadius: "8px",
      }}
    />
  );
}
