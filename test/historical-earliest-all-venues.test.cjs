// Earliest probe check for all 10 markets (spot/futures × 5 venues). Each earliest must be meaningfully
// in the past (>1 day) — a value near "now" means the venue's earliest resolution is broken.
const adapters = require("../collector/crypto/historical/_engine/fetch/crypto/index.cjs");

const CASES = [
    ["binance", "BTCUSDT"], ["bybit", "BTCUSDT"], ["okx", "BTCUSDT"], ["kucoin", "BTC-USDT"], ["bitget", "BTCUSDT"],
];

(async function main() {
    let bad = 0;
    for (const [venue, symbol] of CASES) {
        for (const market of ["spot", "futures"]) {
            const ad = adapters[venue]({ timeoutMs: 10000 });
            let e;
            try {
                e = typeof ad.earliestOpenTime === "function"
                    ? await ad.earliestOpenTime({ symbol, market })
                    : (await ad.fetchKlines({ symbol, market, startTime: 0, endTime: undefined, limit: 1 }))[0]?.openTime;
            } catch (err) {
                console.log(`${venue.padEnd(8)} ${market.padEnd(8)} ERR ${err.message.slice(0, 50)}`);
                bad++;
                continue;
            }
            const days = e ? Math.round((Date.now() - e) / 86400000) : 0;
            const ok = e && days > 1;
            if (!ok) bad++;
            console.log(`${venue.padEnd(8)} ${market.padEnd(8)} ${e ? new Date(e).toISOString() : "(null)"} ~${days}d ${ok ? "OK" : "SUSPECT"}`);
        }
    }
    console.log(bad === 0 ? "\nALL 10 EARLIEST OK" : `\n${bad} SUSPECT/FAIL`);
    process.exitCode = bad === 0 ? 0 : 1;
})();
