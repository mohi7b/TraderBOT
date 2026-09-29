const httpGet = require('../../utils/httpClient.cjs');
const logger = require('../../utils/logger.cjs');
const apiConfig = require('../../config/api.config.cjs');

module.exports = async function ingestPriceVolume() {
    try {
        const url = apiConfig.equity.priceVolume;
        const data = await httpGet(url);

        if (data.error) {
            logger.error(`ingestPriceVolume failed: ${data.message}`);
            return { error: true };
        }

        return {
            timestamp: new Date().toISOString(),
            type: "equity_price_volume",
            raw: data
        };

    } catch (err) {
        logger.error(`ingestPriceVolume exception: ${err.message}`);
        return { error: true };
    }
};
