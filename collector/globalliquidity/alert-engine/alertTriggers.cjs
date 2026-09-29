const logger = require('../utils/logger.cjs');

module.exports = function alertTriggers(score) {
    try {
        if (!score || score.error) {
            logger.error("alertTriggers: invalid score input");
            return { error: true };
        }

        return {
            timestamp: new Date().toISOString(),
            type: "alert_trigger",
            score: score.score
        };

    } catch (err) {
        logger.error(`alertTriggers exception: ${err.message}`);
        return { error: true };
    }
};
