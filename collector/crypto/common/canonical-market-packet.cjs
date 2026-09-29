const { createMarketPacket } = require("./market-packet.cjs");

function normalizeLevels(levels) {
    if (!Array.isArray(levels)) return [];

    return levels.map((level) => {
        const price = Number(Array.isArray(level) ? level[0] : level?.price);
        const qty = Number(Array.isArray(level) ? level[1] : level?.qty);
        return Number.isFinite(price) && Number.isFinite(qty) ? [price, qty] : null;
    }).filter(Boolean);
}

function createCanonicalMarketPacket(input = {}) {
    const market = input.market || input.packet?.market || "unknown";
    const eventType = input.type || input.event || input.packet?.eventType || "unknown";
    const timestamp = Number(input.timestamp || input.exchangeTimestamp || input.packet?.timestamp) || Date.now();
    const source = input.source || input.packet?.source || "websocket";
    const payload = {
        ...input.packet?.payload,
        price: Number(input.price),
        qty: Number(input.qty || input.tradeQty),
        side: input.side || input.tradeSide || null,
        open: Number(input.open),
        high: Number(input.high),
        low: Number(input.low),
        close: Number(input.close),
        volume: Number(input.volume),
        rate: Number(input.rate),
        oi: Number(input.oi),
        oiContracts: Number(input.oiContracts),
        oiBase: Number(input.oiBase || input.oiCcy),
        oiUsd: Number(input.oiUsd),
        bids: normalizeLevels(input.bids),
        asks: normalizeLevels(input.asks)
    };

    return {
        ...createMarketPacket({
            exchange: input.exchange || input.packet?.exchange || "unknown",
            market,
            symbol: input.symbol || input.packet?.symbol || "unknown",
            eventType,
            timestamp,
            receiveTimestamp: Number(input.receiveTimestamp) || Date.now(),
            sequence: input.sequence || input.packet?.sequence || null,
            source,
            payload
        }),
        sourceSymbol: input.sourceSymbol || input.symbol || input.packet?.symbol || "unknown",
        sequenceStatus: input.sequenceStatus || null
    };
}

module.exports = { createCanonicalMarketPacket, normalizeLevels };
