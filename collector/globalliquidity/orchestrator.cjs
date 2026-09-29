const insertRecord = require('./database/storage/insert.cjs');

// Ingestors
const ingestPriceVolume = require('./ingestors/equity/ingest.priceVolume.cjs');
const ingestEtfFlows = require('./ingestors/equity/ingest.etfFlows.cjs');
const ingestIndexData = require('./ingestors/equity/ingest.indexData.cjs');

// Processors
const flowProcessor = require('./processors/flows/flowProcessor.cjs');
const priceVolumeProcessor = require('./processors/priceVolume/priceVolumeProcessor.cjs');
const macroProcessor = require('./processors/macro/macroProcessor.cjs');

// Score Engine
const liquidityScoreEngine = require('./processors/score/liquidityScoreEngine.cjs');

// Alert Engine
const alertEvaluator = require('./alert-engine/alertEvaluator.cjs');
const alertDispatcher = require('./alert-engine/alertDispatcher.cjs');

async function runCycle() {
    console.log("Running 5-minute cycle...");

    // 1) INGEST
    const pvRaw = await ingestPriceVolume();
    const etfRaw = await ingestEtfFlows();
    const indexRaw = await ingestIndexData();

    // 2) PROCESS
    const flowSignal = flowProcessor(etfRaw);
    const pvSignal = priceVolumeProcessor(pvRaw);
    const macroSignal = macroProcessor(indexRaw);

    // 3) SCORE
    const score = liquidityScoreEngine(flowSignal, pvSignal, macroSignal);

    // 4) ALERT ENGINE
    const alert = alertEvaluator(score);
    alertDispatcher(alert);

    // 5) SAVE TO DATABASE
    await insertRecord("equity", {
        timestamp: score.timestamp,
        symbol: "SPY",
        price: pvSignal.price,
        volume: pvSignal.volume,
        flow: flowSignal.value
    });

    console.log("Cycle completed.");
}

setInterval(runCycle, 5 * 60 * 1000); // هر ۵ دقیقه
runCycle(); // اجرای اولیه
