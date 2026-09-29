const httpGet = require('../../utils/httpClient.cjs');
const logger = require('../../utils/logger.cjs');
const apiConfig = require('../../config/api.config.cjs');

module.exports = async function ingestBondEtfFlows() {
    try {
        const url = apiConfig.bonds.etfFlows;
        const data = await httpGet(url);

        if (data.error) {
            logger.error(`ingestBondEtfFlows failed: ${data.message}`);
            return { error: true };
        }

        return {
            timestamp: new Date.toISOString(),
            type: "bond_etf_flows",
            raw: data
        };

    } catch (err) {
        logger.error(`ingestBondEtfFlows exception: ${err.message}`);
        return { error: true };
    }
};
