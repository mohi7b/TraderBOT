"use client";

export default function DepthTop20({ top20 }) {
  if (!top20) return null;

  const { buys, sells } = top20;

  // مرتب‌سازی بر اساس قیمت
  const sortedBuys = [...buys].sort((a, b) => b.price - a.price);
  const sortedSells = [...sells].sort((a, b) => a.price - b.price);

  const maxQtyBuy = Math.max(...sortedBuys.map(b => b.qty));
  const maxQtySell = Math.max(...sortedSells.map(s => s.qty));

  return (
    <div style={{ marginTop: "30px" }}>
      <h2 style={{ marginBottom: "20px" }}>🔥 20 سطح اول عمق بازار</h2>

      <div style={{ display: "flex", gap: "20px" }}>
        
        {/* BUY SIDE */}
        <div style={{ flex: 1 }}>
          <h3 style={{ color: "lime", marginBottom: "10px" }}>BUY Top 20</h3>

          {sortedBuys.map((b) => {
            const barWidth = (b.qty / maxQtyBuy) * 100;

            return (
              <div key={`${b.layer}-${b.price}-${b.qty}`} style={{ marginBottom: "6px" }}>
                
                {/* اطلاعات */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  paddingBottom: "3px"
                }}>
                  <span>L{b.layer}</span>
                  <span>{b.price.toFixed(2)}</span>
                  <span>Q:{b.qty.toFixed(4)}</span>
                  <span>C:{b.cumulative.toFixed(4)}</span>
                </div>

                {/* نوار قدرت حجم */}
                <div style={{
                  height: "6px",
                  background: "rgba(0,255,0,0.25)",
                  width: `${barWidth}%`,
                  borderRadius: "3px"
                }}></div>
              </div>
            );
          })}
        </div>

        {/* SELL SIDE */}
        <div style={{ flex: 1 }}>
          <h3 style={{ color: "red", marginBottom: "10px" }}>SELL Top 20</h3>

          {sortedSells.map((s) => {
            const barWidth = (s.qty / maxQtySell) * 100;

            return (
              <div key={`${s.layer}-${s.price}-${s.qty}`} style={{ marginBottom: "6px" }}>
                
                {/* اطلاعات */}
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  paddingBottom: "3px"
                }}>
                  <span>L{s.layer}</span>
                  <span>{s.price.toFixed(2)}</span>
                  <span>Q:{s.qty.toFixed(4)}</span>
                  <span>C:{s.cumulative.toFixed(4)}</span>
                </div>

                {/* نوار قدرت حجم */}
                <div style={{
                  height: "6px",
                  background: "rgba(255,0,0,0.25)",
                  width: `${barWidth}%`,
                  borderRadius: "3px"
                }}></div>
              </div>
            );
          })}
        </div>

      </div>
    </div>
  );
}
