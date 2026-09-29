const httpGet = require('../../utils/httpClient.cjs');
const logger = require('../../utils/logger.cjs');
const apiConfig = require('../../config/api.config.cjs');

module.exports = async function ingestEtfFlows() {
    try {
        const url = apiConfig.equity.etfFlows;
        const data = await httpGet(url);

        if (data.error) {
            logger.error(`ingestEtfFlows failed: ${data.message}`);
            return { error: true };
        }

        return {
            timestamp: new Date().toISOString(),
            type: "equity_etf_flows",
            raw: data
        };

    } catch (err) {
        logger.error(`ingestEtfFlows exception: ${err.message}`);
        return { error: true };
    }
};
