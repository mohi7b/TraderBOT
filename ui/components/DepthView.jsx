export default function DepthView({ depth }) {
  if (!depth) return <div>Loading depth...</div>;

  const { buys, sells, pressureScore, dominantSide, balancePoint } = depth;

  // مرتب‌سازی بر اساس قیمت
  const sortedBuys = [...buys].sort((a, b) => b.price - a.price);
  const sortedSells = [...sells].sort((a, b) => a.price - b.price);

  const maxQtyBuy = Math.max(...sortedBuys.map(b => b.qty));
  const maxQtySell = Math.max(...sortedSells.map(s => s.qty));

  return (
    <div style={{ display: "flex", gap: "20px", padding: "20px" }}>

      {/* BUY SIDE */}
      <div style={{ flex: 1 }}>
        <h3 style={{ color: "lime" }}>BUY Depth</h3>

        {sortedBuys.map((b) => {
          const barWidth = (b.qty / maxQtyBuy) * 100;

          return (
            <div key={`${b.layer}-${b.price}-${b.qty}`} style={{ marginBottom: "6px" }}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px"
              }}>
                <span>L{b.layer}</span>
                <span>{b.price.toFixed(2)}</span>
                <span>Q:{b.qty.toFixed(4)}</span>
                <span>C:{b.cumulative.toFixed(4)}</span>
                <span>${b.reachPrice.toLocaleString()}</span>
                <span>↔ L{b.mirrorLayer}</span>
              </div>

              {/* Power Bar */}
              <div style={{
                height: "6px",
                background: "rgba(0,255,0,0.2)",
                width: `${barWidth}%`,
                borderRadius: "3px"
              }}></div>
            </div>
          );
        })}
      </div>

      {/* SELL SIDE */}
      <div style={{ flex: 1 }}>
        <h3 style={{ color: "red" }}>SELL Depth</h3>

        {sortedSells.map((s) => {
          const barWidth = (s.qty / maxQtySell) * 100;

          return (
            <div key={`${s.layer}-${s.price}-${s.qty}`} style={{ marginBottom: "6px" }}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                fontSize: "12px"
              }}>
                <span>L{s.layer}</span>
                <span>{s.price.toFixed(2)}</span>
                <span>Q:{s.qty.toFixed(4)}</span>
                <span>C:{s.cumulative.toFixed(4)}</span>
                <span>${s.reachPrice.toLocaleString()}</span>
                <span>↔ L{s.mirrorLayer}</span>
              </div>

              {/* Power Bar */}
              <div style={{
                height: "6px",
                background: "rgba(255,0,0,0.2)",
                width: `${barWidth}%`,
                borderRadius: "3px"
              }}></div>
            </div>
          );
        })}
      </div>

      {/* MARKET PRESSURE */}
      <div style={{ flex: 1 }}>
        <h3>Market Pressure</h3>

        <div style={{
          padding: "10px",
          background: "rgba(255,255,255,0.05)",
          borderRadius: "8px"
        }}>
          <p>Score: {pressureScore.toLocaleString()}</p>
          <p>Side: {dominantSide}</p>

          <h4>Balance Point</h4>
          <p>Buy L: {balancePoint.layerBuy}</p>
          <p>Buy Price: {balancePoint.priceBuy}</p>
          <p>Sell L: {balancePoint.layerSell}</p>
          <p>Sell Price: {balancePoint.priceSell}</p>
        </div>
      </div>

    </div>
  );
}
