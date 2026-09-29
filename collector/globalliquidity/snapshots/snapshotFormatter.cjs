const logger = require('../utils/logger.cjs');

module.exports = function snapshotFormatter(snapshot) {
    try {
        if (!snapshot || snapshot.error) {
            logger.error("snapshotFormatter: invalid snapshot input");
            return { error: true };
        }

        return {
            generatedAt: snapshot.timestamp,

            equity: {
                symbol: snapshot.markets.equity?.symbol || null,
                price: snapshot.markets.equity?.price || null,
                volume: snapshot.markets.equity?.volume || null,
                flow: snapshot.markets.equity?.flow || null
            },

            bonds: snapshot.markets.bonds || null,
            commodities: snapshot.markets.commodities || null,
            fx: snapshot.markets.fx || null,
            crypto: snapshot.markets.crypto || null,

            macro: {
                rate: snapshot.macro?.rate || null,
                vix: snapshot.macro?.vix || null,
                liquidityIndex: snapshot.macro?.liquidityIndex || null
            },

            latestAlert: snapshot.alerts || null
        };

    } catch (err) {
        logger.error(`snapshotFormatter exception: ${err.message}`);
        return { error: true };
    }
};
