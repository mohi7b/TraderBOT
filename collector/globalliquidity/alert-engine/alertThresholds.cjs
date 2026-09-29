const thresholds = require('../config/thresholds.config.cjs');
const logger = require('../utils/logger.cjs');

module.exports = function alertThresholds(market) {
    try {
        const min = thresholds.minimum[market] || 0;
        const adaptive = thresholds.adaptive.kFactor[market] || 1;

        return {
            timestamp: new Date().toISOString(),
            type: "alert_thresholds",
            minimum: min,
            adaptive
        };

    } catch (err) {
        logger.error(`alertThresholds exception: ${err.message}`);
        return { error: true };
    }
};
