const { createMarketPacket } = require("../../../../common/market-packet.cjs");

class BinanceFuturesMarketPoller {
    constructor({ symbol, handler, onCritical, intervalMs = 5000 }) {
        this.symbol = symbol.toUpperCase();
        this.handler = handler;
        this.onCritical = onCritical || (() => {});
        this.intervalMs = intervalMs;
        this.timer = null;
        this.running = false;
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
            const response = await fetch(
                `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${this.symbol}`,
                { signal: AbortSignal.timeout(4000) }
            );

            if (!response.ok) throw new Error(`Premium index HTTP ${response.status}`);

            const data = await response.json();
            const timestamp = Number(data.time) || Date.now();
            const markPrice = Number(data.markPrice);
            const fundingRate = Number(data.lastFundingRate);

            if (!Number.isFinite(markPrice) || !Number.isFinite(fundingRate)) {
                throw new Error("Invalid premium index values");
            }

            this.emit("mark_price", timestamp, {
                price: markPrice,
                indexPrice: Number(data.indexPrice)
            });
            this.emit("funding", timestamp, {
                rate: fundingRate,
                nextFundingTime: Number(data.nextFundingTime)
            });

            await this.pollCandle();
        } catch (error) {
            this.onCritical({
                type: "MARKET_DATA_ERROR",
                symbol: this.symbol,
                message: error.message,
                timestamp: Date.now()
            });
        }
    }

    async pollCandle() {
        const response = await fetch(
            `https://fapi.binance.com/fapi/v1/klines?symbol=${this.symbol}&interval=1m&limit=1`,
            { signal: AbortSignal.timeout(4000) }
        );

        if (!response.ok) throw new Error(`Kline HTTP ${response.status}`);

        const [candle] = await response.json();
        if (!candle || candle.length < 7) throw new Error("Invalid kline response");

        this.emit("candle", Number(candle[0]), {
            interval: "1m",
            open: Number(candle[1]),
            high: Number(candle[2]),
            low: Number(candle[3]),
            close: Number(candle[4]),
            volume: Number(candle[5]),
            closeTime: Number(candle[6]),
            isClosed: Date.now() >= Number(candle[6])
        });
    }

    emit(eventType, timestamp, payload) {
        this.handler({
            symbol: this.symbol,
            data: {
                type: eventType,
                event: eventType,
                source: "rest",
                ...payload,
                timestamp,
                packet: createMarketPacket({
                    exchange: "binance",
                    market: "futures",
                    symbol: this.symbol,
                    eventType,
                    timestamp,
                    receiveTimestamp: Date.now(),
                    source: "rest",
                    payload
                })
            }
        });
    }
}

module.exports = BinanceFuturesMarketPoller;