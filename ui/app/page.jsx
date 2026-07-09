"use client";

import DepthChartTest from "../components/DepthChartTest";
import "../lib/ws-init";

export default function Page() {
  return (
    <div style={{ padding: 20 }}>
      <h2 style={{ color: "white" }}>Depth Layer 2 Chart</h2>
      <DepthChartTest />
    </div>
  );
}
