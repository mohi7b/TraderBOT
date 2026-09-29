const normalizer = require('../../utils/normalizer.cjs');
const logger = require('../../utils/logger.cjs');

module.exports = function priceVolumeProcessor(raw) {
    try {
        if (!raw || raw.error) {
            logger.error("priceVolumeProcessor: invalid raw input");
            return { error: true };
        }

        const price = normalizer.number(raw?.raw?.price || 0);
        const volume = normalizer.number(raw?.raw?.volume || 0);

        return {
            timestamp: new Date().toISOString(),
            type: "price_volume_signal",
            price,
            volume
        };

    } catch (err) {
        logger.error(`priceVolumeProcessor exception: ${err.message}`);
        return { error: true };
    }
};
