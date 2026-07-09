"use client";

import { createChart } from "lightweight-charts";

export function createDepthChart(container) {
  const chart = createChart(container, {
    width: container.clientWidth,
    height: container.clientHeight,
    layout: {
      background: { color: "#000" },
      textColor: "#fff",
    },
    rightPriceScale: {
      visible: true,
    },
    timeScale: {
      visible: false,
    },
  });

  const bidsSeries = chart.addHistogramSeries({
    color: "rgba(0, 200, 0, 0.6)",
  });

  const asksSeries = chart.addHistogramSeries({
    color: "rgba(200, 0, 0, 0.6)",
  });

  return {
    update(depth) {
      bidsSeries.setData(depth.bids);
      asksSeries.setData(depth.asks);
    },
  };
}
