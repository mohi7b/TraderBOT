const thresholds = require('../config/thresholds.config.cjs');
const logger = require('../utils/logger.cjs');

module.exports = function alertSeverity(score) {
    try {
        if (!score || score.error) {
            logger.error("alertSeverity: invalid score input");
            return { error: true };
        }

        const s = score.score;

        let level = "none";

        if (s > thresholds.severity.strong) level = "strong";
        else if (s > thresholds.severity.moderate) level = "moderate";
        else if (s > thresholds.severity.weak) level = "weak";

        return {
            timestamp: new Date().toISOString(),
            type: "alert_severity",
            level
        };

    } catch (err) {
        logger.error(`alertSeverity exception: ${err.message}`);
        return { error: true };
    }
};
