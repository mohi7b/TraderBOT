const normalizer = require('../../utils/normalizer.cjs');
const logger = require('../../utils/logger.cjs');

module.exports = function macroProcessor(raw) {
    try {
        if (!raw || raw.error) {
            logger.error("macroProcessor: invalid raw input");
            return { error: true };
        }

        const rate = normalizer.number(raw?.raw?.rate || 0);
        const vix = normalizer.number(raw?.raw?.vix || 0);

        return {
            timestamp: new Date().toISOString(),
            type: "macro_signal",
            rate,
            vix
        };

    } catch (err) {
        logger.error(`macroProcessor exception: ${err.message}`);
        return { error: true };
    }
};
