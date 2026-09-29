(async () => {
    const now = Date.now();
    const start = now - 24*60*60000;
    // try from/to (ms)
    const u = `https://api-futures.kucoin.com/api/v1/kline/query?symbol=XBTUSDTM&granularity=1&from=${start}&to=${now}`;
    const r = await fetch(u); const j = await r.json();
    console.log("status", r.status, "code", j.code);
    const d = j.data || [];
    console.log("n", d.length, "first", d.length?new Date(Number(d[0][0])).toISOString():"-", "last", d.length?new Date(Number(d[d.length-1][0])).toISOString():"-");
})();
