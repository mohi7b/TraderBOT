const { createMarketPacket } = require("../../../../common/market-packet.cjs");

class BinanceFuturesOpenInterest {
    constructor({ symbol, handler, onCritical, intervalMs = 5000 }) {
        this.symbol = symbol.toUpperCase();
        this.handler = handler;
        this.onCritical = onCritical || (() => {});
        this.intervalMs = intervalMs;
        this.timer = null;
        this.running = false;
        this.url = `https://fapi.binance.com/fapi/v1/openInterest?symbol=${this.symbol}`;
    }

    start() {
        if (this.running) return;
        this.running = true;
        this.poll();
        this.timer = setInterval(() => this.poll(), this.intervalMs);
    }

    stop() {
        this.running = false;
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
    }

    async poll() {
        if (!this.running) return;

        try {
            const [response, premiumResponse] = await Promise.all([
                fetch(this.url, { signal: AbortSignal.timeout(4000) }),
                fetch(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${this.symbol}`, { signal: AbortSignal.timeout(4000) })
            ]);

            if (!response.ok) {
                throw new Error(`Open interest HTTP ${response.status}`);
            }

            const data = await response.json();
            const premium = premiumResponse.ok ? await premiumResponse.json() : null;
            const timestamp = Number(data.time) || Date.now();
            const oi = Number(data.openInterest);
            const markPrice = Number(premium && premium.markPrice);

            if (!Number.isFinite(oi)) {
                throw new Error("Invalid open interest value");
            }

            this.handler({
                symbol: this.symbol,
                data: {
                    type: "oi",
                    event: "oi",
                    source: "rest",
                    oi,
                    oiBase: oi,
                    oiUsd: Number.isFinite(markPrice) ? oi * markPrice : null,
                    timestamp,
                    packet: createMarketPacket({
                        exchange: "binance",
                        market: "futures",
                        symbol: this.symbol,
                        eventType: "oi",
                        timestamp,
                        receiveTimestamp: Date.now(),
                        source: "rest",
                        payload: { oi, oiBase: oi, oiUsd: Number.isFinite(markPrice) ? oi * markPrice : null }
                    })
                }
            });
        } catch (error) {
            this.onCritical({
                type: "OPEN_INTEREST_ERROR",
                symbol: this.symbol,
                message: error.message,
                timestamp: Date.now()
            });
        }
    }
}

module.exports = BinanceFuturesOpenInterest;