const SCHEMA_VERSION = 1;

function createMarketPacket({ exchange, market, symbol, eventType, timestamp, receiveTimestamp, sequence, source, payload }) {
    return {
        schemaVersion: SCHEMA_VERSION,
        exchange,
        market,
        symbol,
        eventType,
        source: source || "websocket",
        timestamp: timestamp || Date.now(),
        receiveTimestamp: receiveTimestamp || Date.now(),
        sequence: sequence || null,
        payload
    };
}

module.exports = { SCHEMA_VERSION, createMarketPacket };