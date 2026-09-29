const httpGet = require('../../utils/httpClient.cjs');
const logger = require('../../utils/logger.cjs');
const apiConfig = require('../../config/api.config.cjs');

module.exports = async function ingestIndexData() {
    try {
        const url = apiConfig.equity.indexData;
        const data = await httpGet(url);

        if (data.error) {
            logger.error(`ingestIndexData failed: ${data.message}`);
            return { error: true };
        }

        return {
            timestamp: new Date().toISOString(),
            type: "equity_index_data",
            raw: data
        };

    } catch (err) {
        logger.error(`ingestIndexData exception: ${err.message}`);
        return { error: true };
    }
};
