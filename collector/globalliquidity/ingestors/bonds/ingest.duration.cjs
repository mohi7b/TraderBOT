const httpGet = require('../../utils/httpClient.cjs');
const logger = require('../../utils/logger.cjs');
const apiConfig = require('../../config/api.config.cjs');

module.exports = async function ingestBondDuration() {
    try {
        const url = apiConfig.bonds.duration;
        const data = await httpGet(url);

        if (data.error) {
            logger.error(`ingestBondDuration failed: ${data.message}`);
            return { error: true };
        }

        return {
            timestamp: new Date().toISOString(),
            type: "bond_duration",
            raw: data
        };

    } catch (err) {
        logger.error(`ingestBondDuration exception: ${err.message}`);
        return { error: true };
    }
};
