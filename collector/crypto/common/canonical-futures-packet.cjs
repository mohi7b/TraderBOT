const REQUIRED_FIELDS = ["exchange", "market", "symbol", "type", "timestamp"];

function createCanonicalFuturesPacket(input = {}) {
    const packet = {
        exchange: input.exchange || null,
        market: input.market || "futures",
        symbol: input.symbol || null,
        sourceSymbol: input.sourceSymbol || input.symbol || null,
        type: input.type || input.event || null,
        event: input.event || input.type || null,
        depthType: input.depthType || null,
        source: input.source || "websocket",
        exchangeTimestamp: Number(input.exchangeTimestamp || input.timestamp) || null,
        receiveTimestamp: Number(input.receiveTimestamp) || Date.now(),
        timestamp: Number(input.timestamp || input.exchangeTimestamp) || Date.now(),
        sequence: input.sequence || null,
        sequenceStatus: input.sequenceStatus || null,
        bids: input.bids || null,
        asks: input.asks || null,
        payload: input.payload || {}
    };

    packet.valid = REQUIRED_FIELDS.every(field => packet[field] !== null);
    return packet;
}

module.exports = { REQUIRED_FIELDS, createCanonicalFuturesPacket };
