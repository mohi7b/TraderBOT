const weights = require('../../config/weights.config.cjs');
const logger = require('../../utils/logger.cjs');

module.exports = function liquidityScoreEngine(flow, pv, macro) {
    try {
        if (!flow || flow.error || !pv || pv.error || !macro || macro.error) {
            logger.error("liquidityScoreEngine: invalid inputs");
            return { error: true };
        }

        const score =
            (flow.value * weights.flow) +
            (pv.volume * weights.priceVolume) +
            (macro.vix * weights.macro);

        return {
            timestamp: new Date().toISOString(),
            type: "liquidity_score",
            score
        };

    } catch (err) {
        logger.error(`liquidityScoreEngine exception: ${err.message}`);
        return { error: true };
    }
};
