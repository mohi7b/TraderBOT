/**
 * ============================================================
 *  File: trade_logger.cjs
 *  Path: collector/realtime/spot/processors/trade_logger.cjs
 *  Version: 5.0.0
 *  Description:
 *      Simple processor to log Binance Spot trade events.
 * ============================================================
 */

class TradeLogger {

    constructor(orchestrator) {
        this.log = orchestrator.log;
    }

    handle(event) {
        const price = event.raw.p;
        const qty   = event.raw.q;
        const ts    = event.raw.T;

        this.log.info(
            `TRADE → ${event.symbol} | price=${price} | qty=${qty} | ts=${ts}`
        );
    }
}

module.exports = TradeLogger;
