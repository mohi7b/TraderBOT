const ingestPriceVolume = require('../ingestors/equity/ingest.priceVolume.cjs');
const ingestEtfFlows = require('../ingestors/equity/ingest.etfFlows.cjs');
const ingestIndexData = require('../ingestors/equity/ingest.indexData.cjs');

const flowProcessor = require('../processors/flows/flowProcessor.cjs');
const priceVolumeProcessor = require('../processors/priceVolume/priceVolumeProcessor.cjs');
const macroProcessor = require('../processors/macro/macroProcessor.cjs');

const liquidityScoreEngine = require('../processors/score/liquidityScoreEngine.cjs');
const alertEvaluator = require('../alert-engine/alertEvaluator.cjs');

const snapshotBuilder = require('./snapshotBuilder.cjs');
const snapshotFormatter = require('./snapshotFormatter.cjs');

async function realtimeSnapshot() {
    try {
        // 1) INGEST (لحظه‌ای)
        const pvRaw = await ingestPriceVolume();
        const etfRaw = await ingestEtfFlows();
        const indexRaw = await ingestIndexData();

        // 2) PROCESS (لحظه‌ای)
        const flowSignal = flowProcessor(etfRaw);
        const pvSignal = priceVolumeProcessor(pvRaw);
        const macroSignal = macroProcessor(indexRaw);

        // 3) SCORE (لحظه‌ای)
        const score = liquidityScoreEngine(flowSignal, pvSignal, macroSignal);

        // 4) ALERT (لحظه‌ای)
        const alert = alertEvaluator(score);

        // 5) ساخت snapshot خام
        const rawSnapshot = {
            timestamp: new Date().toISOString(),
            equity: pvSignal,
            bonds: null,
            commodities: null,
            fx: null,
            crypto: null,
            macro: macroSignal,
            alerts: alert
        };

        // 6) ساختاردهی + قالب‌بندی
        const built = snapshotBuilder(rawSnapshot);
        return snapshotFormatter(built);

    } catch (err) {
        return { error: true, message: err.message };
    }
}

module.exports = realtimeSnapshot;
