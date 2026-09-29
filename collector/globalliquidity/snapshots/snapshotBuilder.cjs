const logger = require('../utils/logger.cjs');

module.exports = function snapshotBuilder(rawSnapshot) {
    try {
        if (!rawSnapshot || rawSnapshot.error) {
            logger.error("snapshotBuilder: invalid raw snapshot");
            return { error: true };
        }

        return {
            timestamp: rawSnapshot.timestamp,

            markets: {
                equity: rawSnapshot.equity || null,
                bonds: rawSnapshot.bonds || null,
                commodities: rawSnapshot.commodities || null,
                fx: rawSnapshot.fx || null,
                crypto: rawSnapshot.crypto || null
            },

            macro: rawSnapshot.macro || null,

            alerts: rawSnapshot.alerts || null
        };

    } catch (err) {
        logger.error(`snapshotBuilder exception: ${err.message}`);
        return { error: true };
    }
};
