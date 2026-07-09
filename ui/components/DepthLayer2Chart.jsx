"use client";

import { useEffect, useState, useRef } from "react";
import { useDepthLong } from "@/store/depthLong";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts";

export default function DepthLayer2Chart() {
  const depth = useDepthLong(state => state.data);

  const [chartData, setChartData] = useState([]);

  // ⭐ محور X ثابت‌شده
  const xRangeRef = useRef({ min: 60000, max: 65000 });

  // ⭐ فقط وقتی mid بیش از ۲٪ تغییر کند، محور X را آپدیت کن
  useEffect(() => {
    if (!depth.mid) return;

    const { min, max } = xRangeRef.current;

    const oldMid = (min + max) / 2;
    const diff = Math.abs(depth.mid - oldMid) / oldMid;

    if (diff > 0.02) {
      // ⭐ فقط اینجا محور X آپدیت می‌شود
      xRangeRef.current = {
        min: depth.mid * 0.95,
        max: depth.mid * 1.05
      };
    }
  }, [depth.mid]);

  const { min, max } = xRangeRef.current;

  // ⭐ تقسیمات محور X
  const ticks = [];
  const step = (max - min) / 10;
  for (let p = min; p <= max; p += step) {
    ticks.push(Math.round(p));
  }

  // ⭐ آپدیت هر 15 ثانیه
  useEffect(() => {
    if (!depth.bids || !depth.asks) return;

    const raw = [
      ...depth.bids.map((b, i) => ({
        index: i,
        price: b.price,
        reach: b.reachPrice,
        side: "bid"
      })),
      ...depth.asks.map((a, i) => ({
        index: i,
        price: a.price,
        reach: a.reachPrice,
        side: "ask"
      }))
    ];

    // ⭐ فقط داده‌های داخل بازهٔ ثابت‌شده
    const filtered = raw.filter(d => d.price >= min && d.price <= max);

    // ⭐ فید آرام
    setTimeout(() => {
      setChartData(filtered);
    }, 300);

  }, [depth.updatedAt, min, max]);

  // ⭐ Tooltip حرفه‌ای
  const CustomTooltip = ({ active, payload }) => {
    if (!active || !payload || !payload.length) return null;

    const d = payload[0].payload;

    const opposite =
      d.side === "bid"
        ? chartData.find(x => x.side === "ask" && x.index === d.index)
        : chartData.find(x => x.side === "bid" && x.index === d.index);

    return (
      <div
        style={{
          background: "rgba(0,0,0,0.75)",
          padding: "10px",
          borderRadius: "8px",
          border: "1px solid rgba(255,255,255,0.25)",
          color: "#fff",
          fontSize: "13px"
        }}
      >
        <div>Price: {Math.round(d.price)}</div>
        <div>Cumulative Volume: {Math.round(d.reach)}</div>

        {opposite && (
          <>
            <div style={{ marginTop: "6px", opacity: 0.8 }}>
              Opposite Price: {Math.round(opposite.price)}
            </div>
            <div style={{ opacity: 0.8 }}>
              Opposite Cumulative: {Math.round(opposite.reach)}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div style={{ width: "100%", height: 400 }}>

      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>

          {/* ⭐ محور X کاملاً ثابت */}
          <XAxis
            dataKey="price"
            type="number"
            domain={[min, max]}
            ticks={ticks}
            tickFormatter={(v) => Math.round(v)}
            tick={{ fill: "rgba(255,255,255,0.35)", fontSize: 12 }}
            stroke="rgba(255,255,255,0.15)"
          />

          <YAxis
            dataKey="reach"
            tick={{ fill: "rgba(255,255,255,0.45)", fontSize: 12 }}
            stroke="rgba(255,255,255,0.15)"
          />

          <Tooltip content={<CustomTooltip />} />

          <style jsx>{`
            .recharts-tooltip-cursor {
              stroke: rgba(255, 255, 255, 0.45);
              stroke-width: 2;
            }
          `}</style>

          <Area
            dataKey="reach"
            stroke="rgba(0,200,0,0.9)"
            fill="rgba(0,200,0,0.35)"
            isAnimationActive={false}
            dot={false}
            strokeWidth={2}
            connectNulls={true}
            data={chartData.filter(d => d.side === "bid")}
          />

          <Area
            dataKey="reach"
            stroke="rgba(200,0,0,0.9)"
            fill="rgba(200,0,0,0.35)"
            isAnimationActive={false}
            dot={false}
            strokeWidth={2}
            connectNulls={true}
            data={chartData.filter(d => d.side === "ask")}
          />

        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
