const realtimeSnapshot = require('./realtimeSnapshot.cjs');
const logger = require('../utils/logger.cjs');

module.exports = async function realtimeDashboard() {
    try {
        const snapshot = await realtimeSnapshot();

        if (snapshot.error) {
            return { error: true };
        }

        return {
            generatedAt: snapshot.generatedAt,

            overview: {
                liquidityScore: snapshot.latestAlert?.score || null,
                alertLevel: snapshot.latestAlert?.severity || "none",
                marketStatus: snapshot.equity?.price ? "active" : "unknown"
            },

            equity: {
                symbol: snapshot.equity?.symbol || "SPY",
                price: snapshot.equity?.price || null,
                volume: snapshot.equity?.volume || null,
                flow: snapshot.equity?.flow || null
            },

            macro: {
                rate: snapshot.macro?.rate || null,
                vix: snapshot.macro?.vix || null,
                liquidityIndex: snapshot.macro?.liquidityIndex || null
            },

            alerts: {
                severity: snapshot.latestAlert?.severity || "none",
                score: snapshot.latestAlert?.score || null
            }
        };

    } catch (err) {
        logger.error(`realtimeDashboard exception: ${err.message}`);
        return { error: true };
    }
};
