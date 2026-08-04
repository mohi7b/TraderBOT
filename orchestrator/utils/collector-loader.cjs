/**
 * ============================================================
 *  File: collector-loader.cjs
 *  Path: orchestrator/utils/collector-loader.cjs
 *  Version: 7.0.0 (ENTERPRISE — MULTI-EXCHANGE)
 *
 *  Description:
 *      Collector Loader for TraderBOT Enterprise Orchestrator.
 *
 *      وظایف:
 *      - بارگذاری Collectorهای realtime برای هر symbol
 *      - انتخاب صحیح Collector بر اساس collectorName
 *      - تزریق orchestrator به Collector
 *      - اتصال Collector به EventRouter
 *      - ثبت Collector در ModuleTree + StateTree
 *
 *      نکات:
 *      - ساختار جدید فقط از symbol و collectorName استفاده می‌کند.
 *      - پشتیبانی کامل از Spot و Futures و صرافی‌های بعدی.
 * ============================================================
 */


module.exports = function loadCollector(orchestrator, symbol, collectorName) {
    try {
        const MAP = {
            // BINANCE
            "binance_spot": "../../collector/realtime/spot/exchanges/binance_spot-realtime.cjs",
            "binance_futures": "../../collector/realtime/futures/exchanges/binance_futures-realtime.cjs",

            // BYBIT
            "bybit_spot": "../../collector/realtime/spot/exchanges/bybit_spot-realtime.cjs",
            "bybit_futures": "../../collector/realtime/futures/exchanges/bybit_futures-realtime.cjs",

            // OKX
            "okx_spot": "../../collector/realtime/spot/exchanges/okx_spot-realtime.cjs",
            "okx_futures": "../../collector/realtime/futures/exchanges/okx_futures-realtime.cjs",

            // KUCOIN
            "kucoin_spot": "../../collector/realtime/spot/exchanges/kucoin_spot-realtime.cjs",
            "kucoin_futures": "../../collector/realtime/futures/exchanges/kucoin_futures-realtime.cjs",

            // BITGET
            "bitget_spot": "../../collector/realtime/spot/exchanges/bitget_spot-realtime.cjs",
            "bitget_futures": "../../collector/realtime/futures/exchanges/bitget_futures-realtime.cjs"
        };

        if (!MAP[collectorName]) {
            throw new Error(`Unknown collectorName: ${collectorName}`);
        }

        const CollectorClass = require(MAP[collectorName]);

        const collector = new CollectorClass(orchestrator);
        collector.setSymbol(symbol);
        collector.start();

        orchestrator.log.success(`Collector started → ${symbol}.${collectorName}`);

    } catch (err) {
        orchestrator.log.error(`CollectorLoader error → ${symbol}.${collectorName}: ${err.message}`);
    }
};
