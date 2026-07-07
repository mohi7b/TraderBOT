"use client";

import { useEffect, useState } from "react";
import { initStore, useStore } from "../lib/store";
import DepthRestChart from "../components/DepthRestChart";

export default function Page() {
  const [state, setState] = useState({});

  useEffect(() => {
    initStore();
    return useStore((s) => setState({ ...s }));
  }, []);

  if (!state.depthRest) {
    return <div style={{ padding: 20 }}>Loading REST Depth...</div>;
  }

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>🔥 REST Depth Chart</h1>
      <DepthRestChart rest={state.depthRest} />
    </div>
  );
}
