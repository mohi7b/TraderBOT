const alertTriggers = require('./alertTriggers.cjs');
const alertSeverity = require('./alertSeverity.cjs');
const logger = require('../utils/logger.cjs');

module.exports = function alertEvaluator(score) {
    try {
        const trigger = alertTriggers(score);
        if (trigger.error) return { error: true };

        const severity = alertSeverity(score);
        if (severity.error) return { error: true };

        return {
            timestamp: new Date().toISOString(),
            type: "alert_evaluation",
            score: score.score,
            severity: severity.level
        };

    } catch (err) {
        logger.error(`alertEvaluator exception: ${err.message}`);
        return { error: true };
    }
};
