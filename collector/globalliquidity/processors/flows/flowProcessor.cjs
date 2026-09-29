const normalizer = require('../../utils/normalizer.cjs');
const logger = require('../../utils/logger.cjs');

module.exports = function flowProcessor(raw) {
    try {
        if (!raw || raw.error) {
            logger.error("flowProcessor: invalid raw input");
            return { error: true };
        }

        // اسکلت پردازش جریان پول
        const flowValue = normalizer.number(raw?.raw?.flow || 0);

        return {
            timestamp: new Date().toISOString(),
            type: "flow_signal",
            value: flowValue
        };

    } catch (err) {
        logger.error(`flowProcessor exception: ${err.message}`);
        return { error: true };
    }
};
