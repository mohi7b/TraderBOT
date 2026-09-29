const logger = require('../utils/logger.cjs');

module.exports = function alertDispatcher(alert) {
    try {
        if (!alert || alert.error) {
            logger.error("alertDispatcher: invalid alert input");
            return { error: true };
        }

        logger.alert(
            `ALERT → Severity: ${alert.severity}, Score: ${alert.score}`
        );

        return {
            timestamp: new Date().toISOString(),
            type: "alert_dispatch",
            dispatched: true
        };

    } catch (err) {
        logger.error(`alertDispatcher exception: ${err.message}`);
        return { error: true };
    }
};
