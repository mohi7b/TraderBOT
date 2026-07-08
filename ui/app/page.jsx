"use client";

import { useEffect, useState } from "react";
import DepthChart from "@/components/DepthChart";

export default function DepthPage() {
  const [socket, setSocket] = useState(null);

  useEffect(() => {
    const ws = new WebSocket("ws://5.255.121.157:9000");

    ws.onopen = () => {
      console.log("WS Connected");
      setSocket(ws);
    };

    ws.onerror = (err) => {
      console.log("WS Error:", err);
    };

    ws.onclose = () => {
      console.log("WS Closed");
    };

    return () => ws.close();
  }, []);

  if (!socket) {
    return (
      <div className="text-center text-gray-300 p-10">
        اتصال به سرور…
      </div>
    );
  }

  return (
    <div className="p-4">
      <h1 className="text-xl font-bold text-green-400 mb-4">
        چارت عمق حرفه‌ای (Depth Chart)
      </h1>

      <DepthChart socket={socket} />

      <div className="mt-4 text-gray-400 text-sm">
        چارت عمق کاملاً زنده است و با هر آپدیت از کالکتور، به‌صورت خودکار رفرش می‌شود.
      </div>
    </div>
  );
}
