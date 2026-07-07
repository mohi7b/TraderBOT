"use client";

import { motion } from "framer-motion";

export default function DepthLadder({ depth }) {
  if (!depth) return null;

  const { buys, sells } = depth;

  const sortedBuys = [...buys].sort((a, b) => b.price - a.price);
  const sortedSells = [...sells].sort((a, b) => a.price - b.price);

  const maxQtyBuy = Math.max(...sortedBuys.map(b => b.qty));
  const maxQtySell = Math.max(...sortedSells.map(s => s.qty));

  return (
    <div style={{
      marginTop: "40px",
      display: "flex",
      gap: "20px",
      fontFamily: "monospace"
    }}>
      
      {/* BUY LADDER */}
      <div style={{ flex: 1 }}>
        <h2 style={{ color: "lime", marginBottom: "10px" }}>BUY Ladder</h2>

        <div style={{
          height: "500px",
          overflowY: "scroll",
          paddingRight: "10px",
          borderRight: "1px solid #333"
        }}>
          {sortedBuys.map((b) => {
            const barWidth = (b.qty / maxQtyBuy) * 100;

            return (
              <motion.div
                key={`buy-${b.layer}-${b.price}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                style={{
                  marginBottom: "6px",
                  paddingBottom: "4px",
                  borderBottom: "1px solid #222"
                }}
              >
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px"
                }}>
                  <span>L{b.layer}</span>
                  <span>{b.price.toFixed(2)}</span>
                  <span>Q:{b.qty.toFixed(4)}</span>
                  <span>C:{b.cumulative.toFixed(4)}</span>
                </div>

                <motion.div
                  animate={{ width: `${barWidth}%` }}
                  transition={{ duration: 0.3 }}
                  style={{
                    height: "6px",
                    background: "rgba(0,255,0,0.25)",
                    borderRadius: "3px"
                  }}
                />
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* SELL LADDER */}
      <div style={{ flex: 1 }}>
        <h2 style={{ color: "red", marginBottom: "10px" }}>SELL Ladder</h2>

        <div style={{
          height: "500px",
          overflowY: "scroll",
          paddingRight: "10px",
          borderRight: "1px solid #333"
        }}>
          {sortedSells.map((s) => {
            const barWidth = (s.qty / maxQtySell) * 100;

            return (
              <motion.div
                key={`sell-${s.layer}-${s.price}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
                style={{
                  marginBottom: "6px",
                  paddingBottom: "4px",
                  borderBottom: "1px solid #222"
                }}
              >
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px"
                }}>
                  <span>L{s.layer}</span>
                  <span>{s.price.toFixed(2)}</span>
                  <span>Q:{s.qty.toFixed(4)}</span>
                  <span>C:{s.cumulative.toFixed(4)}</span>
                </div>

                <motion.div
                  animate={{ width: `${barWidth}%` }}
                  transition={{ duration: 0.3 }}
                  style={{
                    height: "6px",
                    background: "rgba(255,0,0,0.25)",
                    borderRadius: "3px"
                  }}
                />
              </motion.div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
