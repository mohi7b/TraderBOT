"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer
} from "recharts";

export default function DepthRestChart({ rest }) {
  if (!rest) return null;

  const { bids, asks } = rest;

  // ============================================================
  // 🔥 پردازش داده‌ها فقط وقتی rest تغییر کند (نه هر رندر)
  // ============================================================
  const { bidData, askData } = useMemo(() => {
    if (!bids || !asks) return { bidData: [], askData: [] };

    // تبدیل به عدد
    const bidRaw = bids.map(([p, q]) => ({
      price: p,
      qty: q
    }));

    const askRaw = asks.map(([p, q]) => ({
      price: p,
      qty: q
    }));

    // مرتب‌سازی فقط یک بار
    bidRaw.sort((a, b) => a.price - b.price);
    askRaw.sort((a, b) => a.price - b.price);

    // نرمال‌سازی حجم‌ها
    const maxQty = Math.max(
      ...bidRaw.map(b => b.qty),
      ...askRaw.map(a => a.qty)
    );

    const bidData = bidRaw.map(b => ({
      price: b.price,
      qty: b.qty / maxQty
    }));

    const askData = askRaw.map(a => ({
      price: a.price,
      qty: a.qty / maxQty
    }));

    return { bidData, askData };
  }, [bids, asks]);

  return (
    <div style={{ marginTop: "40px" }}>
      <h2>📊 نمودار عمق کامل REST (5000 لایه)</h2>

      <div style={{ height: "450px", marginTop: "20px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart>
            <CartesianGrid strokeDasharray="3 3" />

            <XAxis
              dataKey="price"
              type="number"
              domain={["auto", "auto"]}
              tick={{ fontSize: 11 }}
            />

            <YAxis
              dataKey="qty"
              type="number"
              domain={[0, 1]}
              tick={{ fontSize: 11 }}
            />

            <Tooltip />

            <Line
              data={bidData}
              type="monotone"
              dataKey="qty"
              stroke="lime"
              dot={false}
              name="Buy Depth"
              strokeWidth={1.2}
            />

            <Line
              data={askData}
              type="monotone"
              dataKey="qty"
              stroke="red"
              dot={false}
              name="Sell Depth"
              strokeWidth={1.2}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
