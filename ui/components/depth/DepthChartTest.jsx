"use client";

import { useEffect, useState } from "react";
import { useDepthLong } from "@/store/depthLong";
import ReactECharts from "echarts-for-react";

export default function DepthChartTest() {
  const depth = useDepthLong((s) => s.data);
  const [chartData, setChartData] = useState([]);

  const mid = depth.mid;
  const minX = mid ? mid * 0.95 : 60000;
  const maxX = mid ? mid * 1.05 : 65000;

  useEffect(() => {
    if (!depth.bids || !depth.asks) return;

    const raw = [
      ...depth.bids.map(b => ({
        price: b.price,
        reach: b.reachPrice,
        side: "bid"
      })),
      ...depth.asks.map(a => ({
        price: a.price,
        reach: a.reachPrice,
        side: "ask"
      }))
    ];

    const filtered = raw.filter(d => d.price >= minX && d.price <= maxX);

    setChartData(filtered);
  }, [depth.updatedAt, mid]);

  const option = {
    animation: false,
    xAxis: {
      type: "value",
      min: minX,
      max: maxX,
      axisLabel: {
        color: "#ccc",
        formatter: v => Math.round(v)
      }
    },
    yAxis: {
      type: "value",
      axisLabel: { color: "#ccc" }
    },
    series: [
      {
        name: "BID",
        type: "line",
        showSymbol: false,
        data: chartData.filter(d => d.side === "bid").map(d => [d.price, d.reach]),
        lineStyle: { color: "rgb(0,200,0)" },
        areaStyle: { color: "rgba(0,200,0,0.3)" }
      },
      {
        name: "ASK",
        type: "line",
        showSymbol: false,
        data: chartData.filter(d => d.side === "ask").map(d => [d.price, d.reach]),
        lineStyle: { color: "rgb(200,0,0)" },
        areaStyle: { color: "rgba(200,0,0,0.3)" }
      }
    ]
  };

  return (
    <div style={{ width: "100%", height: 400 }}>
      <ReactECharts option={option} style={{ height: "100%" }} />
    </div>
  );
}
