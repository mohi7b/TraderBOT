/**
 * ============================================================
 *  TraderBOT Cluster Role Diagnostic
 *  Finds EXACT role mapping for each worker ID
 * ============================================================
 */

const config = require("../../config.cjs");

console.log("🔍 Running Cluster Role Diagnostic...\n");

const groups = config.cluster.groups;
const workers = config.cluster.workers;

function findRole(id) {
    // Collectors
    for (const exchange in groups.collectors) {
        const symbols = groups.collectors[exchange].workers;
        for (const symbol in symbols) {
            if (symbols[symbol] === id) {
                return `Collector → ${exchange}.${symbol}`;
            }
        }
    }

    // Processors
    for (const type in groups.processors) {
        const pipes = groups.processors[type];
        for (const pipe in pipes) {
            if (pipes[pipe] === id) {
                return `Processor → ${pipe}`;
            }
        }
    }

    // Market
    for (const pipe in groups.market) {
        if (groups.market[pipe] === id) {
            return `Market → ${pipe}`;
        }
    }

    return "❌ No role assigned";
}

for (let id = 0; id < workers; id++) {
    console.log(`Worker ${id}: ${findRole(id)}`);
}

console.log("\n✅ Diagnostic complete.");
